-- QR 출석 — 한 번만 찍으면 출석, 수업이 시작된 뒤에 찍으면 1초라도 지각 (2026-10-10 Alan)
--
-- "Qr출석체크에서 들어올때 한번 나갈때 한번 이렇게 말고 그냥 한번만 찍어도 인정되는걸로 바꿔줘. 단 지각처리만 확실하게 부탁해!
--  수업시작하고 1초라도 늦으면 지각으로 표시해줘"
--
-- 그전(2026-09-21 ~ 10-10)에는 입실(in) → 퇴실(out)을 다 찍어야 출석이었고 시작 7분 뒤부터 지각이었다.
--
-- 1. attendance_stamps.status 는 셋 — present(찍음 = 출석) · manual(출석 인정) · absent(결석).
--    옛 in(입실만) · out(입실 + 퇴실)은 **전부 present** 로 바꾼다 — "한 번 찍으면 출석" 으로 보면 입실만 한 학생도 찍은 것이다
--    (그 학생에게 퇴실을 안 찍었다고 출석을 빼는 규칙은 더 없다). check_in_at · check_out_at 칸은 기록으로 그대로 둔다 (새 도장은 check_out_at 이 비어 있다).
--    지각 표시(late)는 그때 규칙(7분)으로 적힌 것을 그대로 둔다 — 지난 날을 새 규칙으로 되돌려 세지 않는다.
-- 2. attendance_scan: 수업 시작 30분 전 ~ 끝 사이에 **한 번** 찍으면 present. late = 찍은 시각 > 수업 시작 시각 (1초라도 늦으면).
--    다시 찍으면 already_done(찍은 시각 · 상태를 함께 돌려준다). 퇴실 · already_in 은 없다. 수업이 끝나면 찍을 수 없다(class_over).
-- 3. "끝난 수업" = 수업이 끝난 시각 (예전에는 끝나고 30분 = 퇴실 마감). attendance_term_board · my_attendance_days · my_attendance_summary 가 같은 값으로.
--    my_attendance_summary 는 in_only 칸을 뺀다 (반환 모양이 바뀌어 drop 뒤 다시 만든다). my_attendance_days 는 check_out_at 을 뺀다.
--    attendance_term_summary(앱이 2026-10-01 부터 안 부르던 옛 요약)는 지운다 — 한눈에 보기(attendance_term_board)가 같은 규칙으로 센다.
-- 앱의 같은 규칙: src/lib/attendance-board.ts(도장 · 끝난 수업 · 셈) · src/lib/attendance.ts(결과 문구) · src/lib/attendance-poster.ts(포스터 문구).

-- ─── 1. 상태 값 — in · out 을 present 로 ───────────────────────────────────────
alter table public.attendance_stamps drop constraint attendance_stamps_status_check;
update public.attendance_stamps set status = 'present', updated_at = now() where status in ('in', 'out');
alter table public.attendance_stamps add constraint attendance_stamps_status_check check (status in ('present', 'manual', 'absent'));

comment on column public.attendance_stamps.status is
  'present(찍음 = 출석, 2026-10-10 부터 한 번만) | manual(출석 인정) | absent(결석). 2026-10-10 전의 in(입실만) · out(입실+퇴실)은 present 로 바꿨다';

-- ─── 2. 학생이 찍는다 — 한 번이면 출석 ───────────────────────────────────────
-- 돌려주는 action: check_in(찍힘 — late 가 지각) · already_done(이미 찍었거나 선생님이 처리) · too_early · class_over ·
--                  no_class_today · live_student · recorded_day · not_started · bad_token · too_many · login_required
create or replace function public.attendance_scan(p_token text, p_method text default 'qr')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_now     timestamptz := now();
  v_kst     timestamp := now() at time zone 'Asia/Seoul';
  v_today   date := private.today_kst();
  v_in      text := upper(regexp_replace(coalesce(p_token, ''), '[^0-9A-Za-z]', '', 'g'));
  v_method  text := 'poster';  -- p_method 는 예전 호출과 모양을 맞추려고 남겨 둔 것 — 쓰지 않는다
  v_target  record;
  v_stamped record;
  v_next    timestamp;
  v_id      bigint;
  v_late    boolean;
begin
  if v_uid is null then
    return jsonb_build_object('action', 'login_required');
  end if;

  -- 맞지 않는 QR 을 10분에 10번 찍으면 잠시 막는다 (옛 종이를 계속 찍거나 주소를 지어내 보는 것)
  if (select count(*) from public.attendance_events ev
       where ev.student_id = v_uid and ev.kind = 'reject' and ev.result = 'bad_token' and ev.created_at > v_now - interval '10 minutes') >= 10 then
    return jsonb_build_object('action', 'too_many');
  end if;

  -- 인쇄용 QR 토큰 하나만 받는다 (새로 만들기 전까지 바뀌지 않는다)
  if v_in = '' or v_in is distinct from (select p.token from private.attendance_poster p where p.id) then
    insert into public.attendance_events (student_id, kind, method, result) values (v_uid, 'reject', v_method, 'bad_token');
    return jsonb_build_object('action', 'bad_token');
  end if;

  -- 오늘 교실에 올 반이 없으면 왜 없는지 알려 준다
  if not exists (select 1 from private.attendance_sessions(v_uid, v_today)) then
    return jsonb_build_object('action',
      case
        when exists (
          select 1 from public.enrollments e
            join public.enrollment_orders o on o.id = e.order_id
            join public.session_dates d on d.section_id = e.section_id and d.date = v_today
           where e.student_id = v_uid and e.status = 'active' and o.status = 'active' and e.mode = 'live') then 'live_student'
        when exists (
          select 1 from public.enrollments e
            join public.enrollment_orders o on o.id = e.order_id
            join public.class_sections s on s.id = e.section_id
            join public.session_dates d on d.section_id = s.id and d.date = v_today
           where e.student_id = v_uid and e.status = 'active' and o.status = 'active' and s.recorded) then 'recorded_day'
        when exists (select 1 from public.enrollment_orders o where o.user_id = v_uid and o.status = 'preliminary') then 'not_started'
        else 'no_class_today'
      end);
  end if;

  -- 찍을 반: 수업 시작 30분 전 ~ 끝, 아직 도장이 없는 반 중 가장 이른 것 (하루에 반이 둘이면 — 단과 둘 — 반마다 한 번)
  select x.section_id, x.label, x.starts, x.ends
    into v_target
    from private.attendance_sessions(v_uid, v_today) x
   where v_kst between x.starts - interval '30 minutes' and x.ends
     and not exists (
       select 1 from public.attendance_stamps st
        where st.student_id = v_uid and st.section_id = x.section_id and st.class_date = v_today)
   order by x.starts
   limit 1;
  if not found then
    -- 그 시간의 반에 이미 도장이 있으면 "이미 출석" — 찍은 시각 · 상태를 함께 (끝나고 30분까지는 이 말로 — "시간이 지났어요" 는 틀린 말이다)
    select x.label, st.status, coalesce(st.late, false) as late, to_char(st.check_in_at at time zone 'Asia/Seoul', 'HH24:MI') as at
      into v_stamped
      from private.attendance_sessions(v_uid, v_today) x
      join public.attendance_stamps st on st.student_id = v_uid and st.section_id = x.section_id and st.class_date = v_today
     where v_kst between x.starts - interval '30 minutes' and x.ends + interval '30 minutes'
     order by x.starts desc
     limit 1;
    if found then
      return jsonb_build_object('action', 'already_done', 'label', v_stamped.label, 'status', v_stamped.status, 'late', v_stamped.late, 'at', v_stamped.at);
    end if;
    select min(x.starts) into v_next
      from private.attendance_sessions(v_uid, v_today) x
     where x.starts - interval '30 minutes' > v_kst;
    if v_next is not null then
      return jsonb_build_object('action', 'too_early', 'opens', to_char(v_next - interval '30 minutes', 'HH24:MI'));
    end if;
    return jsonb_build_object('action', 'class_over');
  end if;

  -- 수업이 시작된 뒤면 1초라도 지각 (시작 시각과 같은 순간까지만 정시)
  v_late := v_kst > v_target.starts;
  insert into public.attendance_stamps (student_id, section_id, class_date, status, check_in_at, late, method)
  values (v_uid, v_target.section_id, v_today, 'present', v_now, v_late, v_method)
  on conflict (student_id, section_id, class_date) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('action', 'already_done', 'label', v_target.label);
  end if;
  insert into public.attendance_events (student_id, section_id, class_date, kind, method, result)
  values (v_uid, v_target.section_id, v_today, 'enter', v_method, case when v_late then 'late' else 'check_in' end);

  return jsonb_build_object('action', 'check_in', 'label', v_target.label, 'at', to_char(v_kst, 'HH24:MI'),
                            'late', v_late, 'starts', to_char(v_target.starts, 'HH24:MI'), 'ends', to_char(v_target.ends, 'HH24:MI'));
end;
$$;
comment on function public.attendance_scan(text, text) is
  '출석 QR 포스터(인쇄용 토큰)로 한 번 찍으면 출석. 수업 시작 30분 전 ~ 끝, 시작 뒤에 찍으면 1초라도 지각 (2026-10-10 — 그전에는 입실 · 퇴실 둘)';

revoke all on function public.attendance_scan(text, text) from public, anon;
grant execute on function public.attendance_scan(text, text) to authenticated;

-- ─── 3. 기수 출석 한눈에 보기 — 끝난 수업 = 수업 끝, 칸에 찍은 시각(at) ───────────
create or replace function public.attendance_term_board(p_term_id bigint)
returns table (student_id uuid, student_name text, tester boolean, section_ids bigint[], days jsonb)
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
         (p.test_role is not null or p.role in ('instructor', 'admin', 'assistant')),
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
   order by p.name;
end;
$$;

comment on function public.attendance_term_board(bigint) is
  '기수 출석 한눈에 보기 (강사·관리자·조교). 학생마다 한 줄, days = 수업일마다 {d, s, done, st, late, at}. 끝난 수업 = 수업 끝 (2026-10-10)';

revoke all on function public.attendance_term_board(bigint) from public, anon;
grant execute on function public.attendance_term_board(bigint) to authenticated;

-- ─── 4. 내 출석 달력 (학생 본인) — 끝난 수업 = 수업 끝, check_out_at 을 뺀다 ──────
drop function public.my_attendance_days();
create function public.my_attendance_days()
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
  select t.id, t.year, t.month, t.enrollment_opens_at, t.closes_at,
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
  '내 출석 달력 (학생 본인). 지금 기수 + 아직 시작 안 한 기수의 내 현장 수업일마다 한 줄. 종강한 기수는 빠진다. 끝난 수업 = 수업 끝 (2026-10-10)';

revoke all on function public.my_attendance_days() from public, anon;
grant execute on function public.my_attendance_days() to authenticated;

-- ─── 5. 내 출석률 (학생 본인) — in_only 를 빼고, 끝난 수업 = 수업 끝 ──────────────
drop function public.my_attendance_summary();
create function public.my_attendance_summary()
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
    select en.term_id, en.section_id, d.date,
           d.date + private.time_block_end(en.time_block) <= v_now as done
      from enr en
      join public.session_dates d on d.section_id = en.section_id
     where d.date between en.counts_from and en.closes_at
  )
  select t.id, t.year, t.month, t.enrollment_opens_at, t.closes_at,
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
   group by t.id, t.year, t.month, t.enrollment_opens_at, t.closes_at
   order by t.enrollment_opens_at;
end;
$$;

comment on function public.my_attendance_summary() is
  '내 출석률 (학생 본인). 지금 기수의 내 현장 반 수업일 — 끝난 수업(수업 끝) 중 출석(present · manual) · 지각 · 결석 · 미출석 (2026-10-10)';

revoke all on function public.my_attendance_summary() from public, anon;
grant execute on function public.my_attendance_summary() to authenticated;

-- ─── 6. 옛 기수 요약 — 앱이 2026-10-01 부터 안 부른다. 입실만 · 퇴실 마감 규칙이 들어 있어 지운다 ───
drop function if exists public.attendance_term_summary(bigint);
