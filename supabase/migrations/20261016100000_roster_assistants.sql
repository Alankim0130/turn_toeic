-- 출석 명단 — 강사 · 관리자 계정은 빼고, 조교 계정은 `조교` 로 (2026-10-16 Alan — "명단에서 강사랑 관리자는 제외하고
-- 수업이 설정되어 있는 조교는 조교라고 표시도 부탁해").
--
-- 출석 날짜별 명단(attendance_roster) · 한눈에 보기(attendance_term_board)는 강사 · 관리자 · 조교 계정과 테스트 등급을 켠 계정을
-- 모두 `tester` 로 돌려주고 화면이 `테스터` 표를 달아 맨 아래에 세웠다. 이제:
--   - 강사 · 관리자 계정(진짜 등급 instructor · admin)의 줄은 돌려주지 않는다 — 학생 화면을 보려고 반에 넣은 테스트 배정이다.
--     테스트 등급(test_role)은 강사 · 관리자만 가질 수 있어(DB check) 함께 빠진다.
--   - 조교 계정은 그대로 돌려주되 `tester` 대신 `assistant` 칸으로 알린다 — 화면이 `조교` 표를 단다.
-- 학생명단 반별 · 레벨별 명단 · 숙제 미제출 명단과 같은 규칙이다 (앱 src/lib/roster-accounts.ts).
--
-- 돌려주는 칸 이름이 바뀌어 drop · create 한다 (create or replace 는 반환 꼴을 못 바꾼다). 본문은 그 밖에는
-- 20261003110000(attendance_roster) · 20261010100000(attendance_term_board) 그대로다.
-- 배포 사이: 이 마이그레이션이 먼저 걸리고 새 앱이 몇 분 뒤에 뜬다 — 그동안 옛 앱은 `tester` 를 못 읽어(없음) 표만 빠지고 화면은 그대로 선다.

-- ─── 1. 날짜별 명단 ─────────────────────────────────────────────────────────────
drop function public.attendance_roster(date);
create function public.attendance_roster(p_date date)
returns table (
  section_id bigint, course_name text, target_score integer, track text, time_block text,
  student_id uuid, student_name text, assistant boolean, status text,
  check_in_at timestamptz, check_out_at timestamptz, late boolean, decided_note text, decided_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_crew() then
    raise exception 'forbidden';
  end if;
  return query
  select s.id, c.name, c.target_score, s.track, s.time_block,
         p.id, p.name,
         p.role = 'assistant',
         st.status, st.check_in_at, st.check_out_at, coalesce(st.late, false), st.decided_note, dp.name
    from public.session_dates d
    join public.class_sections s on s.id = d.section_id
    join public.courses c on c.id = s.course_id
    join public.enrollments e on e.section_id = s.id and e.status = 'active' and e.mode = 'onsite'
    join public.enrollment_orders o on o.id = e.order_id
     and o.status in ('active', 'expired') and o.activates_on <= p_date and p_date <= o.access_until
    join public.profiles p on p.id = e.student_id
    left join public.attendance_stamps st on st.student_id = p.id and st.section_id = s.id and st.class_date = p_date
    left join public.profiles dp on dp.id = st.decided_by
   where d.date = p_date
     and d.date between s.enrollment_opens_at and s.closes_at
     and not s.recorded
     -- 강사 · 관리자 계정은 명단에 없다 (2026-10-16)
     and p.role not in ('instructor', 'admin')
   order by s.time_block, c.target_score, s.track, p.name;
end;
$$;

comment on function public.attendance_roster(date) is
  '그 날 출석 명단 (강사·관리자·조교). 현장 수강생마다 한 줄 — 강사·관리자 계정은 빼고 조교 계정은 assistant (2026-10-16)';

revoke all on function public.attendance_roster(date) from public, anon;
grant execute on function public.attendance_roster(date) to authenticated;

-- ─── 2. 기수 한눈에 보기 ────────────────────────────────────────────────────────
drop function public.attendance_term_board(bigint);
create function public.attendance_term_board(p_term_id bigint)
returns table (student_id uuid, student_name text, assistant boolean, section_ids bigint[], days jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone 'Asia/Seoul';
begin
  if not private.is_crew() then
    raise exception 'forbidden';
  end if;
  return query
  with enr as (
    -- 배정일부터 센다 — 개강 뒤에 들어온 학생에게 그 전 수업은 내 수업이 아니다. 시간 없는 반은 찍을 수 없어 뺀다
    select distinct e.student_id, s.id as section_id, s.time_block, s.closes_at,
           greatest(s.enrollment_opens_at, (e.created_at at time zone 'Asia/Seoul')::date) as counts_from
      from public.enrollments e
      join public.class_sections s on s.id = e.section_id
     where s.term_id = p_term_id
       and e.status = 'active'
       and e.mode = 'onsite'
       and not s.recorded
       and private.time_block_end(s.time_block) is not null
  ),
  dd as (
    select en.student_id, en.section_id, d.date,
           d.date + private.time_block_end(en.time_block) <= v_now as done   -- 끝난 수업 = 수업 끝 (2026-10-10 — 퇴실 마감이 없어졌다)
      from enr en
      join public.session_dates d on d.section_id = en.section_id
     where d.date between en.counts_from and en.closes_at
  )
  select p.id, p.name,
         p.role = 'assistant',
         (select array_agg(distinct en.section_id order by en.section_id) from enr en where en.student_id = p.id),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'd', dd.date,
                    's', dd.section_id,
                    'done', dd.done,
                    'st', st.status,
                    'late', coalesce(st.late, false),
                    'at', to_char(st.check_in_at at time zone 'Asia/Seoul', 'HH24:MI'))
                  order by dd.date, dd.section_id)
             from dd
             left join public.attendance_stamps st
               on st.student_id = dd.student_id and st.section_id = dd.section_id and st.class_date = dd.date
            where dd.student_id = p.id), '[]'::jsonb)
    from public.profiles p
   where p.id in (select en.student_id from enr en)
     -- 강사 · 관리자 계정은 명단에 없다 (2026-10-16)
     and p.role not in ('instructor', 'admin')
   order by p.name;
end;
$$;

comment on function public.attendance_term_board(bigint) is
  '기수 출석 한눈에 보기 (강사·관리자·조교). 학생마다 한 줄, days = 수업일마다 {d, s, done, st, late, at}. 끝난 수업 = 수업 끝 (2026-10-10). 강사·관리자 계정은 빼고 조교 계정은 assistant (2026-10-16)';

revoke all on function public.attendance_term_board(bigint) from public, anon;
grant execute on function public.attendance_term_board(bigint) to authenticated;
