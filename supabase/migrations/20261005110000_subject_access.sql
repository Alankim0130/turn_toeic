-- ============================================================================
-- LC 음원 · 수업자료실을 **과목까지** 맞춰 연다 (2026-10-05 Alan — "그리고 RC단과 학생들은 음원파일과 LC수업자료실에 접근 안되는거 맞지?")
--
-- 그전(20261003120000 LC 음원 · 20261005100000 수업자료실)에는 레벨만 봤다 — 650 RC 단과(주3일 60분 RC) 학생에게도
-- 650 LC 교재 · 음원과 650 LC 수업자료가 열렸다 (로컬 재생 DB 에서 확인). 이제 학생에게는 **내가 그 과목을 듣는 레벨**만 열린다:
--   * 시간 단위 반(60 · 70분)은 그 반의 과목(class_sections.subject) 하나.
--   * 과목 칸이 빈 반은 두 과목 모두 — 120 · 140분 묶음 반(두 시간을 이어 듣는다) · 속성반(650 LC/RC + 850 LC/RC) ·
--     방학달 통짜 120분 반(한 반에서 두 과목을 이어 듣는다) · 아직 과목을 안 고른 반(모를 때 학생 것을 빼앗지 않는다).
--   * 접근할 수 있는 반은 그대로 public.my_section_ids() — 개강일~종강일 · 묶음 반이 품는 시간 · 속성반이 여는 반.
--     레벨도 그대로 강좌 레벨 + 속성반이 함께 듣는 레벨.
-- 그래서 RC 단과 → RC 만, LC 단과 → LC 만(LC 음원 포함), 주5일 60분(월수금 RC + 화목금 LC) · 120분 · 속성반 → 둘 다.
-- 화면(src/lib/lc-audio.ts 의 subjectLevelsOf)과 같은 규칙이다 — **바꾸면 둘 다.** 여기가 화면보다 좁으면 학생이 제 자료를 잃는다.
--
--   * private.my_subject_levels(과목) — 내가 그 과목을 듣는 레벨.
--   * private.my_lc_levels() 는 이제 my_subject_levels('lc') 다. LC 교재 · 음원 조회 정책(lc_books · lc_audio_tracks)이 이 함수를 부르고
--     저장소(lc-audio · lc-textbooks)는 그 두 표의 행이 보이는지로 판정하므로, 정책은 손대지 않아도 RC 단과 학생에게
--     LC 교재 · 음원 · 표지 파일이 모두 닫힌다.
--   * class_materials 조회 정책은 자료의 과목으로 가른다. 저장소 class-materials 는 이 표의 행이 보이는지로 판정하므로 따라 닫힌다.
-- 강사 · 관리자는 그대로 전부. 테스트 등급을 켠 스태프 · 배정된 조교는 학생처럼 배정된 반의 레벨 × 과목만.
-- ============================================================================

create or replace function private.my_subject_levels(p_subject text)
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
    and p_subject in ('rc', 'lc')
    -- 과목 칸이 빈 반(묶음 · 속성반 · 방학달 통짜 · 아직 안 고름)은 두 과목 모두
    and (s.subject is null or s.subject = p_subject)
$$;

revoke all on function private.my_subject_levels(text) from public, anon;
grant execute on function private.my_subject_levels(text) to authenticated, service_role;

-- LC 교재 · 음원 = 내가 LC 를 듣는 레벨 (이름 그대로 — 정책 lc_books · lc_audio_tracks 가 이것을 부른다)
create or replace function private.my_lc_levels()
returns integer[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_subject_levels('lc')
$$;

revoke all on function private.my_lc_levels() from public, anon;
grant execute on function private.my_lc_levels() to authenticated, service_role;

drop policy "class_materials: 내 레벨 수강생·스태프 조회" on public.class_materials;
create policy "class_materials: 내 레벨·과목 수강생·스태프 조회" on public.class_materials
  for select to authenticated
  using (
    (select private.is_staff())
    or (subject = 'rc' and array[level] <@ (select private.my_subject_levels('rc')))
    or (subject = 'lc' and array[level] <@ (select private.my_subject_levels('lc')))
  );
