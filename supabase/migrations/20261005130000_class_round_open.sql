-- ============================================================================
-- LC 음원 · 수업자료실을 **수업 날짜에 맞춰** 연다 (2026-10-05 Alan — "LC음원듣기와 자료게시판도 수업날짜에 맞춰서 오픈해주면 좋겠어.
-- 자료게시판도 일정표 기반으로 오픈하는 걸로 하고, 해당 날짜가 안되면 잠금이고, 해당날짜 수업이 진행되면 하나씩 오픈 하는걸로 하자!" ·
-- "수업자료실에 A/B 과정 전부다 나눠서 올릴 수 있도록 해야해! RC, LC전부다" · 고른 것 "과정 · 회차마다")
--
--  * 한 칸(cell) = 레벨 × 과목(rc · lc) × 과정(A · B). 회차 = 그 칸을 쓰는 **내 반의 N번째 수업일**(session_dates.seq).
--    - 시간 단위 반(60 · 70분)은 그 반의 과목(class_sections.subject) · 과정(book_set) 하나.
--    - 과목 칸이 빈 반(방학달 통짜 120분 — 한 반에서 두 과목을 이어 듣는다 · 아직 안 고른 반)은 그 과정의 두 과목.
--    - 과정이 없는 반(120 · 140분 묶음 · 속성반)은 칸이 없다 — 품은 시간 단위 반이 칸을 준다 (public.my_section_ids 가 함께 내려 준다).
--  * 그 회차의 내 수업일이 오늘(KST)이거나 지났으면 열린다. 수업일 전에는 학생에게 행 자체가 보이지 않는다 —
--    저장소(lc-audio · class-materials)는 이 표들의 행이 보이는지로 판정하므로 파일 서명 URL 도 만들 수 없다.
--    같은 칸 · 회차가 두 반에서 오면(오전 · 저녁 같은 과정) 어느 한쪽 수업일이 지나면 열린다.
--  * LC 음원: 교재(레벨 × A/B)의 n강 칸(lc_audio_tracks.day) = 그 교재 과정을 쓰는 내 LC 반의 n회차.
--    교재(표지 · 제목)는 그 과정을 쓰는 반이 있으면 날짜와 상관없이 보인다 — 화면이 "N강은 10/12 수업일에 열려요" 를 적는다.
--    그전(20261003120000 · 20261005110000)에는 내가 LC 를 듣는 레벨이면 그 레벨 A · B 두 권과 음원이 전부 열려 있었다.
--  * 수업자료실: 자료마다 과정(book_set)과 회차(seq)를 정해 올린다 — 한 번 올리면 그 과정이 돌아오는 달마다 다시 쓴다(LC 음원과 같다).
--    과정 · 회차가 없는 자료(이 칸들이 생기기 전에 올린 것)는 학생에게 보이지 않는다 — 관리자 화면이 정해 달라고 적는다.
--  * 강사 · 관리자는 그대로 전부. 테스트 등급을 켠 스태프 · 배정된 조교는 학생처럼 (private.user_role).
-- 화면(src/lib/class-rounds.ts 의 roundCells · roundDates)과 같은 규칙이다 — **바꾸면 둘 다.** 여기가 화면보다 좁으면 학생이 제 자료를 잃는다.
-- ============================================================================

-- 내 칸 'level:subject:set' — 그 과정을 쓰는 반이 있다 (날짜와 상관없이). LC 교재가 보이는지에 쓴다
create or replace function private.my_round_cells()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct format('%s:%s:%s', c.target_score, sub.subject, s.book_set)), '{}')
  from unnest(public.my_section_ids()) as m(id)
  join public.class_sections s on s.id = m.id
  join public.courses c on c.id = s.course_id
  -- 과목 칸이 빈 반(방학달 통짜 · 아직 안 고름)은 그 과정의 두 과목
  cross join lateral unnest(case when s.subject is null then array['rc', 'lc'] else array[s.subject] end) as sub(subject)
  -- has_term_access 와 같은 등급 조건 — 테스트 등급을 켠 스태프는 그 등급으로 본다
  where (select private.user_role()) in ('student', 'instructor', 'admin', 'assistant')
    and c.target_score is not null
    and s.book_set is not null
$$;
comment on function private.my_round_cells() is
  '내 과정 칸 level:subject:set (2026-10-05) — LC 교재 조회. 앱 roundCells 와 같은 규칙';

revoke all on function private.my_round_cells() from public, anon;
grant execute on function private.my_round_cells() to authenticated, service_role;

-- 열린 회차 'level:subject:set:seq' — 내 반의 그 회차 수업일이 오늘이거나 지났다
create or replace function private.my_open_rounds()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct format('%s:%s:%s:%s', c.target_score, sub.subject, s.book_set, d.seq)), '{}')
  from unnest(public.my_section_ids()) as m(id)
  join public.class_sections s on s.id = m.id
  join public.courses c on c.id = s.course_id
  join public.session_dates d on d.section_id = s.id
  cross join lateral unnest(case when s.subject is null then array['rc', 'lc'] else array[s.subject] end) as sub(subject)
  where (select private.user_role()) in ('student', 'instructor', 'admin', 'assistant')
    and c.target_score is not null
    and s.book_set is not null
    and d.date <= private.today_kst()
$$;
comment on function private.my_open_rounds() is
  '열린 회차 level:subject:set:seq — 내 반의 그 회차 수업일이 오늘(KST)이거나 지났다 (2026-10-05). LC 음원 · 수업자료실 조회. 앱 roundDates 와 같은 규칙';

revoke all on function private.my_open_rounds() from public, anon;
grant execute on function private.my_open_rounds() to authenticated, service_role;

-- ─── LC 교재 · 음원 ──────────────────────────────────────────────────────────
drop policy "lc_books: 내 레벨 수강생·스태프 조회" on public.lc_books;
create policy "lc_books: 내 과정 수강생·스태프 조회" on public.lc_books
  for select to authenticated
  using ((select private.is_staff()) or array[format('%s:lc:%s', level, book_set)] <@ (select private.my_round_cells()));

drop policy "lc_audio: 내 레벨 수강생·스태프 조회" on public.lc_audio_tracks;
create policy "lc_audio: 지난 수업일 수강생·스태프 조회" on public.lc_audio_tracks
  for select to authenticated
  using (
    (select private.is_staff())
    or exists (
      select 1
      from public.lc_books b
      where b.id = lc_audio_tracks.book_id
        and array[format('%s:lc:%s:%s', b.level, b.book_set, lc_audio_tracks.day)] <@ (select private.my_open_rounds())
    )
  );

-- ─── 수업자료실: 과정 · 회차 ────────────────────────────────────────────────
alter table public.class_materials add column if not exists book_set text;
alter table public.class_materials add column if not exists seq int;
alter table public.class_materials add constraint class_materials_book_set_check check (book_set is null or book_set in ('A', 'B'));
alter table public.class_materials add constraint class_materials_seq_check check (seq is null or seq between 1 and 30);
-- 과정과 회차는 함께 정한다 (둘 다 비었으면 이 칸들이 생기기 전에 올린 자료 — 학생에게 보이지 않는다)
alter table public.class_materials add constraint class_materials_round_pair_check check ((book_set is null) = (seq is null));

comment on column public.class_materials.book_set is '과정 A|B (2026-10-05) — 그 과정을 쓰는 반의 학생에게 열린다';
comment on column public.class_materials.seq is '회차 1~30 (2026-10-05) — 그 반의 N번째 수업일에 열린다';
comment on table public.class_materials is
  '수업자료실 — 레벨(lc_levels) × 과목(rc|lc) × 과정(A|B) × 회차 자료 파일. 학생은 내 반의 그 회차 수업일부터(private.my_open_rounds), 쓰기는 강사·관리자 (2026-10-05)';

create index if not exists class_materials_round_idx on public.class_materials (level, subject, book_set, seq);

drop policy "class_materials: 내 레벨·과목 수강생·스태프 조회" on public.class_materials;
create policy "class_materials: 지난 수업일 수강생·스태프 조회" on public.class_materials
  for select to authenticated
  using (
    (select private.is_staff())
    or (
      book_set is not null
      and seq is not null
      and array[format('%s:%s:%s:%s', level, subject, book_set, seq)] <@ (select private.my_open_rounds())
    )
  );
