-- LC 교재 · 음원은 **내 레벨만** — 화면이 아니라 DB 가 막는다 (2026-10-03 권한 재점검 — Alan "다시보기, 불라방 시청, lc음원 확인쫌 부탁해").
--
-- 학생 화면(/my/lc-audio)은 2026-09-16 부터 내 레벨 교재만 보여 줬고, 교재 상세도 남의 레벨이면 목록으로 돌려보냈다
-- (2026-10-02 Alan "본인의 레벨에 맞는 교재만 나와서 들을 수 있도록"). 그런데 조회 정책은 `is_staff() or has_term_access(null)` —
-- **수강 중이면 모든 레벨**이라, 650 학생이 음원 주소(/files/audio/숫자)의 숫자만 바꾸면 750 · 850 음원이 재생됐다
-- (로컬 재생 DB 에서 재현 — 650 현장 학생 세션에 교재 6권 · 음원 6개 · 저장소 파일 6개가 보였다).
-- 저장소 정책(lc-audio · lc-textbooks)은 이 두 표의 행이 보이는지로 판정하므로 두 표만 좁히면 파일 서명 URL 도 따라 닫힌다.
--
-- 내 레벨 = 지금 접근할 수 있는 반(public.my_section_ids — 개강일~종강일 · 120분 반이 품는 시간 · 속성반이 여는 반)의
-- 강좌 레벨 + 속성반이 함께 듣는 레벨(650+ 중급속성 = 650 · 850). 화면(src/lib/lc-audio.ts 의 lcLevelsOf)과 같은 규칙이다 —
-- **바꾸면 둘 다.** 여기가 화면보다 좁으면 학생이 제 음원을 잃는다.
-- 내 레벨 안에서는 A · B 두 권이 다 열린다 — 화면도 내 시간의 교재를 못 정하면 그 레벨 두 권을 보여 준다 (도메인 규칙 7).
-- 강사 · 관리자는 그대로 전부 (관리자 LC 음원 화면). 조교는 학생처럼 배정된 반의 레벨만 (예전에도 배정이 없으면 0권이었다).

create or replace function private.my_lc_levels()
returns integer[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct l.level order by l.level), '{}')
  from unnest(public.my_section_ids()) as m(id)
  join public.class_sections s on s.id = m.id
  join public.courses c on c.id = s.course_id
  cross join lateral unnest(array[c.target_score] || c.includes_levels) as l(level)
  -- has_term_access 와 같은 등급 조건 — 테스트 등급을 켠 스태프는 그 등급으로 본다 (private.user_role)
  where (select private.user_role()) in ('student', 'instructor', 'admin', 'assistant')
    and l.level is not null
$$;

revoke all on function private.my_lc_levels() from public, anon;
grant execute on function private.my_lc_levels() to authenticated, service_role;

drop policy "lc_books: 수강생·스태프 조회" on public.lc_books;
create policy "lc_books: 내 레벨 수강생·스태프 조회" on public.lc_books
  for select to authenticated
  using ((select private.is_staff()) or array[level] <@ (select private.my_lc_levels()));

drop policy "lc_audio: 수강생·스태프 조회" on public.lc_audio_tracks;
create policy "lc_audio: 내 레벨 수강생·스태프 조회" on public.lc_audio_tracks
  for select to authenticated
  using (
    (select private.is_staff())
    or exists (
      select 1
      from public.lc_books b
      where b.id = lc_audio_tracks.book_id
        and array[b.level] <@ (select private.my_lc_levels())
    )
  );
