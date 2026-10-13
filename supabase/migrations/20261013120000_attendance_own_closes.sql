-- 내 출석 카드 · 내 출석 화면의 '종강' 날짜를 내 반의 종강일로 (2026-10-13 — 11월 준비 리허설).
--
-- my_attendance_summary · my_attendance_days 는 기수(terms)의 종강일을 돌려줬다. 2주완성 반은 그 달 수업일 앞 절반의 마지막 날에
-- 종강하므로(private.term_half_date) 2주완성 학생의 출석 카드에 '10/6 개강 ~ 11/3 종강' 처럼 들을 수 없는 날까지 적혔다
-- (셈 · 수업일은 처음부터 내 반 것이라 맞았다 — 날짜 한 칸만 틀렸다). 다른 반은 반의 종강일 = 기수 종강일이라 그대로다.
-- 반환 모양 · 권한 · 세는 규칙은 바꾸지 않는다 (create or replace).

create or replace function public.my_attendance_days()
returns table (
  term_id bigint, year integer, month integer, opens date, closes date,
  class_date date, section_id bigint, course_name text, track text, time_block text,
  done boolean, status text, late boolean, check_in_at timestamptz, decided_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_today date := private.today_kst();
  v_now   timestamp := now() at time zone 'Asia/Seoul';
begin
  if v_uid is null then
    return;
  end if;
  return query
  with enr as (
    -- my_attendance_summary 와 같은 반 — 다만 아직 시작하지 않은 기수도 내려 준다 (개강 전 예비등록생에게 다음 달 수업일을 미리 보여 준다)
    select distinct s.id as section_id, s.term_id, s.track, s.time_block, s.closes_at, c.name as course_name,
           greatest(s.enrollment_opens_at, (e.created_at at time zone 'Asia/Seoul')::date) as counts_from
      from public.enrollments e
      join public.class_sections s on s.id = e.section_id
      join public.courses c on c.id = s.course_id
     where e.student_id = v_uid
       and e.status = 'active'
       and e.mode = 'onsite'
       and not s.recorded
       and v_today <= s.closes_at          -- 종강일이 지난 기수는 내려 주지 않는다
       and private.time_block_end(s.time_block) is not null
  )
  -- 종강 = 내가 배정된 반의 종강일 (2026-10-13 — 2주완성 반은 그 달 수업일 앞 절반의 마지막 날이다. 다른 반은 기수 종강일과 같다)
  select t.id, t.year, t.month, t.enrollment_opens_at, max(en.closes_at) over (partition by en.term_id),
         d.date, en.section_id, en.course_name, en.track, en.time_block,
         d.date + private.time_block_end(en.time_block) <= v_now,
         st.status, coalesce(st.late, false), st.check_in_at, st.decided_note
    from enr en
    join public.terms t on t.id = en.term_id
    join public.session_dates d on d.section_id = en.section_id
    left join public.attendance_stamps st
      on st.student_id = v_uid and st.section_id = en.section_id and st.class_date = d.date
   where d.date between en.counts_from and en.closes_at
   order by d.date, en.time_block;
end;
$$;

comment on function public.my_attendance_days() is
  '내 출석 달력 (학생 본인). 지금 기수 + 아직 시작 안 한 기수의 내 현장 수업일마다 한 줄. 종강한 기수는 빠진다. 끝난 수업 = 수업 끝 (2026-10-10). closes = 내 반의 종강일 (2026-10-13 — 2주완성은 앞 절반)';

revoke all on function public.my_attendance_days() from public, anon;
grant execute on function public.my_attendance_days() to authenticated;

create or replace function public.my_attendance_summary()
returns table (
  term_id bigint, year integer, month integer, opens date, closes date,
  total integer, past integer, present integer, late integer, absent integer, missing integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_today date := private.today_kst();
  v_now   timestamp := now() at time zone 'Asia/Seoul';
begin
  if v_uid is null then
    return;
  end if;
  return query
  with enr as (
    -- 반에 들어온 날(배정일, KST)부터 — 개강 뒤에 등록했으면 등록 전 수업은 내 수업이 아니다. 시간 없는 반은 찍을 수 없어 뺀다
    select distinct s.id as section_id, s.term_id, s.time_block, s.closes_at,
           greatest(s.enrollment_opens_at, (e.created_at at time zone 'Asia/Seoul')::date) as counts_from
      from public.enrollments e
      join public.class_sections s on s.id = e.section_id
     where e.student_id = v_uid
       and e.status = 'active'
       and e.mode = 'onsite'
       and not s.recorded
       and v_today between s.enrollment_opens_at and s.closes_at
       and private.time_block_end(s.time_block) is not null
  ),
  days as (
    select en.term_id, en.section_id, en.closes_at, d.date,
           d.date + private.time_block_end(en.time_block) <= v_now as done
      from enr en
      join public.session_dates d on d.section_id = en.section_id
     where d.date between en.counts_from and en.closes_at
  )
  -- 종강 = 내가 배정된 반의 종강일 (2026-10-13 — 2주완성 반은 그 달 수업일 앞 절반의 마지막 날이다. 다른 반은 기수 종강일과 같다)
  select t.id, t.year, t.month, t.enrollment_opens_at, max(dy.closes_at),
         count(*)::int,
         (count(*) filter (where dy.done))::int,
         -- 셈은 **끝난 수업만** — 수업 중에 세면 출석률이 100% 를 넘는다
         (count(*) filter (where dy.done and st.status in ('present', 'manual')))::int,
         (count(*) filter (where dy.done and st.late))::int,
         (count(*) filter (where dy.done and st.status = 'absent'))::int,
         (count(*) filter (where dy.done and st.id is null))::int
    from days dy
    join public.terms t on t.id = dy.term_id
    left join public.attendance_stamps st
      on st.student_id = v_uid and st.section_id = dy.section_id and st.class_date = dy.date
   group by t.id, t.year, t.month, t.enrollment_opens_at
   order by t.enrollment_opens_at;
end;
$$;

comment on function public.my_attendance_summary() is
  '내 출석률 (학생 본인). 지금 기수의 내 현장 반 수업일 — 끝난 수업(수업 끝) 중 출석(present · manual) · 지각 · 결석 · 미출석 (2026-10-10). closes = 내 반의 종강일 (2026-10-13 — 2주완성은 앞 절반)';

revoke all on function public.my_attendance_summary() from public, anon;
grant execute on function public.my_attendance_summary() to authenticated;
