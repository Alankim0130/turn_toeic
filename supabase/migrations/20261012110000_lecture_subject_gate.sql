-- ============================================================================
-- 특강 신청 — 단과 학생은 제 과목 특강만 (2026-10-12 Alan — "특강신청에서 RC 단과반은 LC특강신청이 안되고,
-- LC단과는 RC특강신청이 안되도록 설정이 되어야해")
--
--  * private.lecture_subjects_of(학생, 기수) → 그 달 수강 중(개강일~종강일 · 등록 · 배정 active)인 **직접 배정 반**이 주는 과목들 — text[] ('lc' · 'rc').
--      - 단과 상품(courses.course_type lc · rc)                → 그 과목
--      - 그릇 반(courses.program <> 'score' — 속성반 · 2주완성)  → 두 과목 (품은 반이 두 과목이다)
--      - 과목 칸(class_sections.subject)이 빈 반               → 두 과목 (묶음 120 · 140분 · 방학달 통짜 — 두 과목을 이어 듣는다. 아직 안 고른 반도 짐작해 막지 않는다)
--      - 그 밖(시간 단위 반)                                   → 그 반의 과목 칸
--    학생명단 이름표 `RC단과` · `LC단과`(앱 singleSubjectOf — section-type.ts)와 같은 읽기다. 반이 여럿이면 합집합 —
--    650 RC 단과 + 750 LC 단과를 함께 듣는 학생은 두 과목 다. 앱 lectureSubjectBlock(src/lib/lecture.ts, lecture.test.ts)과 같은 규칙 — 바꾸면 둘 다.
--  * BEFORE INSERT 트리거 lecture_signups_eligible_subject — 특강 종류(kinds)의 rc · lc 마다 학생이 그 과목을 들어야 한다.
--    모의고사만인 특강은 누구나. 그 달 수강생이 아니면(과목이 비면) 손대지 않는다 — 정책(lecture_signup_open)이 막는다.
--    막히면 'lecture_subject_mismatch' — 서버 액션(signupLecture)이 학생 말로 바꾼다. 이름이 review_check 보다 앞이라(알파벳) 이 검사가 먼저 돈다.
-- ============================================================================

create or replace function private.lecture_subjects_of(p_user uuid, p_term_id bigint)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct sub.subject), '{}'::text[])
  from public.enrollments e
  join public.enrollment_orders o on o.id = e.order_id
  join public.class_sections s on s.id = e.section_id
  join public.courses c on c.id = s.course_id
  cross join lateral unnest(
    case
      when c.course_type in ('lc', 'rc') then array[c.course_type]
      when c.program <> 'score' or s.subject is null then array['lc', 'rc']
      when s.subject in ('lc', 'rc') then array[s.subject]
      else array['lc', 'rc']
    end) as sub(subject)
  where e.student_id = p_user
    and s.term_id = p_term_id
    and e.status = 'active'
    and o.status = 'active'
    and private.today_kst() between s.enrollment_opens_at and s.closes_at
$$;
comment on function private.lecture_subjects_of(uuid, bigint) is
  '그 달 수강 중인 직접 배정 반이 주는 과목(lc · rc). 단과 상품 = 그 과목 · 그릇 반 · 과목 칸이 빈 반 = 두 과목. 앱 singleSubjectOf · lectureSubjectBlock 과 같은 규칙 (2026-10-12)';
revoke all on function private.lecture_subjects_of(uuid, bigint) from public, anon, authenticated;

create or replace function private.lecture_signups_eligible_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kinds text[];
  v_subjects text[];
  v_missing text;
begin
  select l.kinds, private.lecture_subjects_of(new.user_id, l.term_id)
    into v_kinds, v_subjects
    from public.special_lectures l
   where l.id = new.lecture_id;

  -- 그 달 수강생이 아니면(과목이 없다) 여기서 가르지 않는다 — 정책 lecture_signup_open 이 막는다 (엉뚱한 까닭을 말하지 않게)
  if v_subjects is null or v_subjects = '{}'::text[] then
    return new;
  end if;

  select k into v_missing
    from unnest(coalesce(v_kinds, '{}'::text[])) as k
   where k in ('lc', 'rc')
     and not (k = any (v_subjects))
   limit 1;

  if v_missing is not null then
    raise exception 'lecture_subject_mismatch'
      using errcode = 'P0001', detail = '내 수업 과목이 아닌 특강입니다. RC 단과는 RC 특강, LC 단과는 LC 특강만 신청할 수 있습니다.';
  end if;

  return new;
end;
$$;
revoke execute on function private.lecture_signups_eligible_subject() from public, anon, authenticated;

drop trigger if exists lecture_signups_eligible_subject on public.lecture_signups;
create trigger lecture_signups_eligible_subject
  before insert on public.lecture_signups
  for each row execute function private.lecture_signups_eligible_subject();
