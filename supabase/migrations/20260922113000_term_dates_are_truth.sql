-- ============================================================================
-- 개강일 · 종강일이 진실이다 (2026-09-22 Alan — "출석기록은 항상 강사가 설정한 해당달 개강날과 종강날에 맞춰서.
-- 다음달로 넘어가면 예전기록은 빠지고 항상 새롭게 시작 … 다른 것들도 개강날·종강날 개념이 제대로 적용되어 있는지 두 번, 세 번")
--
-- 운영 DB 에서 되돌리기 테스트로 확인한 구멍 (고치기 전):
--   * 수강생 권한은 등록 상태(enrollment_orders.status = 'active')로 개강일을 판정했는데, 상태는 매일 00:05 배치만 바꿨다.
--     → 강사가 개강일을 **뒤로 미루면** 이미 active 인 학생은 새 개강일 전에도 다시보기·불라방·출석이 열려 있었다.
--     → 강사가 종강일을 **늘려도** 이미 expired 가 된 등록은 되살아나지 않아(반 날짜 동기화가 expired 를 건너뛰었다) 계속 잠겨 있었다.
--     → 개강일 0시 ~ 0시 5분은 아직 예비등록생이었다.
--   * 오배정 정정(앱)은 만료일만 고치고 활성화일·상태는 그대로 두었다.
--
-- 고친 것 — 날짜가 상태를 정한다:
--   1. 등록 상태는 **저장할 때마다 날짜로 계산**한다 (BEFORE 트리거). 개강 전 preliminary · 개강일~종강일 active · 종강 뒤 expired.
--      누가 어떤 길로 쓰든(승인 · 스태프 배정 · 정정 · 계정 통합 · 반 날짜 동기화) 날짜와 어긋난 상태가 남지 않는다.
--   2. 등록 기간(activates_on ~ access_until)은 **배정된 반의 개강일~종강일**로 맞춘다 — 반 배정이 바뀌거나(트리거)
--      강사가 기수 날짜를 바꾸면(sync_section_schedule) 끝난 등록까지 다시 맞춘다.
--   3. 학생 등급(student / alumni / member)은 등록 상태가 바뀔 때마다 바로 다시 정한다 (AFTER 트리거).
--      수강 중 등록이 있으면 student, 없으면 끝난 등록이 있을 때 alumni · 개강 전 등록만 있으면 member(예비등록생).
--   4. 매일 배치는 **00:00 KST** 에 돈다 (00:05 → 00:00). 날짜가 바뀌는 순간 상태도 바뀐다.
--   5. 수강생 권한 함수는 상태와 함께 **개강일·종강일을 직접** 본다 (today between 개강일 and 종강일) — 두 겹으로 막는다.
--   6. 출석은 그 반의 개강일~종강일 안의 수업만 — 찍기 · 명단 · 강사 처리 모두. 기수별 출석 현황 함수를 더한다.
--   7. 학생 본인 출석률 public.my_attendance_summary() — 지금 기수의 내 현장 반 (Alan: "출석률을 몇 퍼센트 채우고 있는지 마이페이지에서").
-- ============================================================================

-- ─── 1. 날짜 → 등록 상태 ────────────────────────────────────────────────────
create or replace function private.order_status_for(p_opens date, p_closes date)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when private.today_kst() < p_opens then 'preliminary'
           when private.today_kst() > p_closes then 'expired'
           else 'active'
         end
$$;

revoke all on function private.order_status_for(date, date) from public, anon, authenticated;

create or replace function private.tg_enrollment_orders_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := private.order_status_for(new.activates_on, new.access_until);
  return new;
end;
$$;

drop trigger if exists enrollment_orders_status on public.enrollment_orders;
create trigger enrollment_orders_status
  before insert or update of activates_on, access_until, status on public.enrollment_orders
  for each row execute function private.tg_enrollment_orders_status();

-- ─── 2. 등록 → 학생 등급 ────────────────────────────────────────────────────
-- p_users 가 null 이면 모두. 강사·관리자·조교의 진짜 등급은 건드리지 않는다 (테스터는 test_role 만 올린다 — 예전 배치와 같다)
create or replace function private.refresh_student_roles(p_users uuid[])
returns table (promoted integer, demoted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_up int := 0;
  v_down int := 0;
begin
  update public.profiles p
     set role = 'student'
   where p.role in ('member', 'alumni')
     and (p_users is null or p.id = any(p_users))
     and exists (select 1 from public.enrollment_orders o where o.user_id = p.id and o.status = 'active');
  get diagnostics v_up = row_count;

  update public.profiles p
     set test_role = 'student'
   where p.test_role in ('member', 'alumni')
     and (p_users is null or p.id = any(p_users))
     and exists (select 1 from public.enrollment_orders o where o.user_id = p.id and o.status = 'active');

  update public.profiles p
     set role = case
                  when exists (select 1 from public.enrollment_orders o where o.user_id = p.id and o.status = 'expired')
                  then 'alumni'::public.user_role
                  else 'member'::public.user_role
                end
   where p.role = 'student'
     and (p_users is null or p.id = any(p_users))
     and not exists (select 1 from public.enrollment_orders o where o.user_id = p.id and o.status = 'active');
  get diagnostics v_down = row_count;

  return query select v_up, v_down;
end;
$$;

revoke all on function private.refresh_student_roles(uuid[]) from public, anon, authenticated;

create or replace function private.tg_enrollment_orders_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_student_roles(array[old.user_id]);
    return null;
  end if;
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform private.refresh_student_roles(array[old.user_id, new.user_id]);
  elsif tg_op = 'INSERT' or old.status is distinct from new.status then
    perform private.refresh_student_roles(array[new.user_id]);
  end if;
  return null;
end;
$$;

drop trigger if exists enrollment_orders_roles on public.enrollment_orders;
create trigger enrollment_orders_roles
  after insert or update or delete on public.enrollment_orders
  for each row execute function private.tg_enrollment_orders_roles();

-- ─── 3. 반 배정 → 등록 기간 ────────────────────────────────────────────────
create or replace function private.sync_order_window(p_order_ids bigint[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.enrollment_orders o
     set activates_on = m.min_opens,
         access_until = m.max_closes
    from (
      select e.order_id, min(s.enrollment_opens_at) as min_opens, max(s.closes_at) as max_closes
        from public.enrollments e
        join public.class_sections s on s.id = e.section_id
       where e.order_id = any(p_order_ids)
       group by e.order_id
    ) m
   where o.id = m.order_id
     and (o.activates_on, o.access_until) is distinct from (m.min_opens, m.max_closes)
$$;

revoke all on function private.sync_order_window(bigint[]) from public, anon, authenticated;

create or replace function private.tg_enrollments_order_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.sync_order_window(array[old.order_id]);
  elsif tg_op = 'UPDATE' then
    perform private.sync_order_window(array[old.order_id, new.order_id]);
  else
    perform private.sync_order_window(array[new.order_id]);
  end if;
  return null;
end;
$$;

drop trigger if exists enrollments_order_window on public.enrollments;
create trigger enrollments_order_window
  after insert or update of section_id, order_id or delete on public.enrollments
  for each row execute function private.tg_enrollments_order_window();

-- ─── 4. 매일 배치: 날짜가 넘어가면 상태·등급을 다시 정한다 (00:00 KST) ─────
create or replace function private.run_daily_status_transition()
returns table (orders_activated integer, promoted_to_student integer, orders_expired integer, demoted_to_alumni integer, pending_resolved integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.today_kst();
  v_activated int; v_expired int; v_promoted int; v_demoted int; v_resolved int;
  v_before uuid[];
begin
  -- 등급은 행마다 AFTER 트리거가 바로 바꾸므로, 몇 명이 바뀌었는지는 전후의 수강생 명단을 비교해 센다
  select coalesce(array_agg(p.id), '{}') into v_before from public.profiles p where p.role = 'student';
  -- 상태는 BEFORE 트리거가 날짜로 계산한다 — 여기서는 날짜가 넘어간 행을 건드려 다시 계산하게 할 뿐이다
  update public.enrollment_orders o set status = o.status
   where o.status is distinct from private.order_status_for(o.activates_on, o.access_until)
     and private.order_status_for(o.activates_on, o.access_until) = 'active';
  get diagnostics v_activated = row_count;
  update public.enrollment_orders o set status = o.status
   where o.status is distinct from private.order_status_for(o.activates_on, o.access_until);
  get diagnostics v_expired = row_count;
  -- 트리거가 사람마다 등급을 바꿨지만, 빠진 사람이 없게 한 번 더 전체를 맞춘다
  perform private.refresh_student_roles(null);
  select count(*) into v_promoted from public.profiles p where p.role = 'student' and not (p.id = any(v_before));
  select count(*) into v_demoted from public.profiles p where p.id = any(v_before) and p.role <> 'student';
  -- 둘째 달 반 자동 배정 (예전 2개월 등록용 — 매달 등록이라 처리할 행이 없다)
  v_resolved := private.resolve_pending_enrollments();
  return query select v_activated, v_promoted, v_expired, v_demoted, v_resolved;
end;
$$;

do $cron$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'daily-status-transition' loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$cron$;

select cron.schedule('daily-status-transition', '0 15 * * *', $cron$ select * from private.run_daily_status_transition() $cron$);

-- ─── 5. 권한·출석 함수: 개강일~종강일을 직접 본다 ─────────────────────────
-- 운영 DB 의 현재 정의(pg_get_functiondef)에서 날짜 줄만 바꿨다 — 나머지는 그대로다.
--   권한(has_term_access · has_section_access · has_recorded_replay_access · my_section_ids · notify_live_session):
--     today <= 종강일  →  today between 개강일 and 종강일.  has_recorded_replay_access 는 등급 목록에 조교를 더했다 (has_section_access 와 같게).
--   출석(attendance_sessions · attendance_roster · attendance_set): 반의 개강일~종강일 밖 날짜는 찍지도, 명단에 넣지도, 처리하지도 않는다.
--   sync_section_schedule 6): 등록 기간 맞추기를 private.sync_order_window 로 — 끝난 등록도 포함.

CREATE OR REPLACE FUNCTION private.has_term_access(p_term_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.user_role() in ('student', 'instructor', 'admin', 'assistant')
     and exists (
       select 1
       from public.enrollments e
       join public.enrollment_orders o on o.id = e.order_id
       join public.class_sections s on s.id = e.section_id
       where e.student_id = (select auth.uid())
         and (p_term_id is null or s.term_id = p_term_id)
         and e.status = 'active'
         and o.status = 'active'
         and private.today_kst() between s.enrollment_opens_at and s.closes_at
     )
$function$;

CREATE OR REPLACE FUNCTION private.has_section_access(p_section_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.user_role() in ('student', 'instructor', 'admin', 'assistant')
     and exists (
       select 1
       from public.enrollments e
       join public.enrollment_orders o on o.id = e.order_id
       join public.class_sections s on s.id = e.section_id
       where e.student_id = (select auth.uid())
         and e.status = 'active'
         and o.status = 'active'
         and private.today_kst() between s.enrollment_opens_at and s.closes_at
         and (e.section_id = p_section_id or private.section_includes(e.section_id, p_section_id))
     )
$function$;

CREATE OR REPLACE FUNCTION private.has_recorded_replay_access(p_section_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.user_role() in ('student', 'instructor', 'admin', 'assistant')
     and exists (
       select 1
         from public.enrollments en
         join public.enrollment_orders o on o.id = en.order_id
         join public.class_sections s on s.id = en.section_id
        where en.student_id = (select auth.uid())
          and en.status = 'active'
          and o.status = 'active'
          and private.today_kst() between s.enrollment_opens_at and s.closes_at
          and s.recorded
          and (
            private.recorded_source_section(s.id) = p_section_id
            or private.section_includes(private.recorded_source_section(s.id), p_section_id)
          )
     )
$function$;

CREATE OR REPLACE FUNCTION public.my_section_ids()
 RETURNS bigint[]
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with mine as (
    select s.id, s.term_id, s.track
    from public.enrollments e
    join public.enrollment_orders o on o.id = e.order_id
    join public.class_sections s on s.id = e.section_id
    where e.student_id = (select auth.uid())
      and e.status = 'active'
      and o.status = 'active'
      and private.today_kst() between s.enrollment_opens_at and s.closes_at
  )
  select coalesce(array_agg(distinct x.id order by x.id), '{}')
  from (
    select id from mine
    union
    select c.id
    from mine m
    join public.class_sections c on c.term_id = m.term_id and c.track = m.track and c.id <> m.id
    where private.section_includes(m.id, c.id)
  ) x
$function$;

CREATE OR REPLACE FUNCTION private.notify_live_session(p_section_id bigint, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r   record;
  v_n int;
begin
  select d.seq, s.time_block, s.recorded, c.name as course_name
    into r
    from public.session_dates d
    join public.class_sections s on s.id = d.section_id
    join public.courses c on c.id = s.course_id
   where d.section_id = p_section_id and d.date = p_date;
  -- 그 날 회차가 없거나 인강 반이면 라이브가 없다
  if not found or r.recorded then
    return 0;
  end if;

  -- 이미 보낸 (반, 날짜) 면 아무것도 넣지 않는다 — 크론·트리거가 여러 번 불러도 한 번만 간다
  insert into private.live_start_notices (section_id, class_date)
  values (p_section_id, p_date)
  on conflict (section_id, class_date) do nothing;
  if not found then
    return 0;
  end if;

  -- 이 시간 단위 반을 볼 수 있는 불라방 학생: 직접 배정 + 이 반을 품는 묶음 반·속성반 배정.
  -- 한 학생에게 한 번 (묶음 반과 시간 단위 반에 함께 배정돼 있어도)
  insert into public.student_messages (user_id, sender_id, sender_name, title, body, kind, related)
  select distinct on (e.student_id)
         e.student_id,
         null,
         '',   -- 사람이 보낸 것이 아니라 자동 알림이다. 화면은 이름이 비면 시각만 적는다
         left(r.course_name || ' 불라방이 시작됐어요', 80),
         left(concat_ws(' · ', r.time_block, r.seq || '회차') || ' 방송이 시작됐어요. 불라방에서 바로 입장해 주세요.', 1000),
         'live_start',
         jsonb_build_object('sectionId', p_section_id, 'date', p_date)
    from public.enrollments e
    join public.enrollment_orders o on o.id = e.order_id
    join public.class_sections es on es.id = e.section_id
   where e.mode = 'live'
     and e.status = 'active'
     and o.status = 'active'
     and not es.recorded
     and private.today_kst() between es.enrollment_opens_at and es.closes_at
     and (e.section_id = p_section_id or private.section_includes(e.section_id, p_section_id))
   order by e.student_id;
  get diagnostics v_n = row_count;

  update private.live_start_notices
     set recipients = v_n
   where section_id = p_section_id and class_date = p_date;

  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION private.attendance_sessions(p_uid uuid, p_date date)
 RETURNS TABLE(section_id bigint, label text, starts timestamp without time zone, ends timestamp without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select distinct
         s.id,
         concat_ws(' ', c.name, case s.track when 'mwf' then '월수금' else '화목금' end, s.time_block),
         p_date + private.time_block_start(s.time_block),
         p_date + private.time_block_end(s.time_block)
    from public.enrollments e
    join public.enrollment_orders o on o.id = e.order_id
    join public.class_sections s on s.id = e.section_id
    join public.courses c on c.id = s.course_id
    join public.session_dates d on d.section_id = s.id and d.date = p_date
   where e.student_id = p_uid
     and e.status = 'active'
     and o.status = 'active'
     and e.mode = 'onsite'
     and not s.recorded
     and p_date between s.enrollment_opens_at and s.closes_at
     and private.time_block_start(s.time_block) is not null
     and private.time_block_end(s.time_block) is not null
$function$;

CREATE OR REPLACE FUNCTION public.attendance_roster(p_date date)
 RETURNS TABLE(section_id bigint, course_name text, target_score integer, track text, time_block text, student_id uuid, student_name text, phone text, tester boolean, status text, check_in_at timestamp with time zone, check_out_at timestamp with time zone, late boolean, decided_note text, decided_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_crew() then
    raise exception 'forbidden';
  end if;
  return query
  select s.id, c.name, c.target_score, s.track, s.time_block,
         p.id, p.name, p.phone,
         (p.test_role is not null or p.role in ('instructor', 'admin', 'assistant')),
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
   order by s.time_block, c.target_score, s.track, p.name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.attendance_set(p_student uuid, p_section bigint, p_date date, p_status text, p_note text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.is_crew() then
    raise exception 'forbidden';
  end if;
  if p_status not in ('manual', 'absent', 'clear') then
    raise exception 'bad_status';
  end if;
  -- 사유는 꼭 적는다 (나중에 "찍혔다가 사라졌다" 를 가릴 근거 — 첫토익 15)
  if p_status <> 'clear' and (v_note is null or char_length(v_note) > 200) then
    raise exception 'note_required';
  end if;
  if not exists (select 1 from public.enrollments e where e.student_id = p_student and e.section_id = p_section)
     or not exists (select 1 from public.session_dates d where d.section_id = p_section and d.date = p_date)
     -- 그 반의 개강일~종강일 밖 날짜는 출석을 정하지 않는다 (강사가 정한 기간이 출석 기간이다)
     or not exists (select 1 from public.class_sections s where s.id = p_section and p_date between s.enrollment_opens_at and s.closes_at) then
    raise exception 'not_in_section';
  end if;

  if p_status = 'clear' then
    delete from public.attendance_stamps where student_id = p_student and section_id = p_section and class_date = p_date;
  else
    insert into public.attendance_stamps (student_id, section_id, class_date, status, method, late, decided_by, decided_note)
    values (p_student, p_section, p_date, p_status, 'manual', false, (select auth.uid()), v_note)
    on conflict (student_id, section_id, class_date) do update
       set status       = excluded.status,
           late         = false,   -- 출석 인정·결석은 지각 표시를 지운다
           decided_by   = excluded.decided_by,
           decided_note = excluded.decided_note,
           updated_at   = now();
  end if;

  insert into public.attendance_events (student_id, section_id, class_date, kind, method, result, actor_id, note)
  values (p_student, p_section, p_date, 'manual', 'manual', p_status, (select auth.uid()), v_note);
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sync_section_schedule(p_section_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_term_id  bigint;
  v_track    text;
  v_opens    date;
  v_closes   date;
  v_blocked  text;
  v_count    int;
begin
  select s.term_id, s.track, t.enrollment_opens_at, t.closes_at
    into v_term_id, v_track, v_opens, v_closes
  from public.class_sections s
  join public.terms t on t.id = s.term_id
  where s.id = p_section_id;
  if not found then
    return;
  end if;

  -- 1) 빠질 회차에 다시보기가 붙어 있으면 막는다
  select string_agg(to_char(sd.date, 'YYYY-MM-DD'), ',' order by sd.date)
    into v_blocked
  from public.session_dates sd
  where sd.section_id = p_section_id
    and not exists (
      select 1 from public.term_class_dates d
      where d.term_id = v_term_id and d.track = v_track and d.date = sd.date
    )
    and exists (select 1 from public.replays r where r.session_date_id = sd.id);
  if v_blocked is not null then
    raise exception 'replay_block' using errcode = 'P0001', detail = v_blocked;
  end if;

  -- 2) 달력에서 빠진 날짜 삭제
  delete from public.session_dates sd
  where sd.section_id = p_section_id
    and not exists (
      select 1 from public.term_class_dates d
      where d.term_id = v_term_id and d.track = v_track and d.date = sd.date
    );

  -- 3) 새 날짜 추가 (임시 회차 번호 — 아래에서 날짜순으로 다시 매긴다)
  insert into public.session_dates (section_id, seq, date)
  select p_section_id, 100000 + row_number() over (order by d.date), d.date
  from public.term_class_dates d
  where d.term_id = v_term_id
    and d.track = v_track
    and not exists (
      select 1 from public.session_dates sd
      where sd.section_id = p_section_id and sd.date = d.date
    );

  -- 4) 회차 번호를 날짜순 1..n 으로. unique(section_id, seq) 충돌을 피하려고 먼저 비켜 둔다
  update public.session_dates set seq = seq + 200000 where section_id = p_section_id;
  update public.session_dates sd
  set seq = o.rn
  from (
    select id, row_number() over (order by date) as rn
    from public.session_dates
    where section_id = p_section_id
  ) o
  where sd.id = o.id;

  -- 5) 반의 개강일·종강일·회차 수
  select count(*) into v_count from public.session_dates where section_id = p_section_id;
  update public.class_sections s
  set enrollment_opens_at = coalesce(v_opens, s.enrollment_opens_at),
      closes_at           = coalesce(v_closes, s.closes_at),
      target_sessions     = case when v_count > 0 then v_count else s.target_sessions end
  where s.id = p_section_id
    and (s.enrollment_opens_at, s.closes_at, s.target_sessions) is distinct from
        (coalesce(v_opens, s.enrollment_opens_at), coalesce(v_closes, s.closes_at),
         case when v_count > 0 then v_count else s.target_sessions end);

  -- 6) 이 반이 들어간 등록: 활성화일 = 배정된 반 중 가장 이른 개강일, 만료일 = 가장 늦은 종강일.
  --    끝난 등록(expired)도 맞춘다 — 강사가 종강일을 늘리면 다시 열려야 한다. 상태·등급은 트리거가 날짜로 다시 정한다
  perform private.sync_order_window(array(select distinct e.order_id from public.enrollments e where e.section_id = p_section_id));
end;
$function$;

-- ─── 6. 기수별 출석 현황 (강사·관리자·조교) ───────────────────────────────
-- 그 기수의 현장 수강생마다 **개강일~종강일 안에서 이미 끝난 수업**(퇴실 마감 = 끝나고 30분이 지난 회차)만 센다.
-- 다음 기수로 넘어가면 그 기수의 반으로 새로 센다 — 지난 기록은 지우지 않고 그 기수에 남는다.
create or replace function public.attendance_term_summary(p_term_id bigint)
returns table (
  student_id uuid, student_name text, phone text, tester boolean, sections text,
  classes integer, present integer, late integer, in_only integer, absent integer, missing integer
)
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
    -- 반에 들어온 날(배정일, KST)부터 센다 — 개강 뒤에 등록한 학생에게 등록 전 수업을 미출석으로 세지 않는다.
    -- 수업 시간이 없는 반(time_block 을 읽을 수 없음)은 찍을 수 없어(attendance_sessions 가 뺀다) 여기서도 뺀다
    select distinct e.student_id, s.id as section_id, s.time_block, s.closes_at,
           greatest(s.enrollment_opens_at, (e.created_at at time zone 'Asia/Seoul')::date) as counts_from,
           concat_ws(' ', c.name, case s.track when 'mwf' then '월수금' else '화목금' end, s.time_block) as label
      from public.enrollments e
      join public.class_sections s on s.id = e.section_id
      join public.courses c on c.id = s.course_id
     where s.term_id = p_term_id
       and e.status = 'active'
       and e.mode = 'onsite'
       and not s.recorded
       and private.time_block_end(s.time_block) is not null
  ),
  past as (
    select en.student_id, en.section_id, d.date
      from enr en
      join public.session_dates d on d.section_id = en.section_id
     where d.date between en.counts_from and en.closes_at
       and d.date + private.time_block_end(en.time_block) + interval '30 minutes' <= v_now
  ),
  per as (
    select en.student_id, string_agg(distinct en.label, ' / ') as sections
      from enr en
     group by en.student_id
  ),
  cnt as (
    select pa.student_id,
           count(*)::int                                                  as classes,
           (count(*) filter (where st.status in ('out', 'manual')))::int  as present,
           (count(*) filter (where st.late))::int                          as late,
           (count(*) filter (where st.status = 'in'))::int                 as in_only,
           (count(*) filter (where st.status = 'absent'))::int             as absent,
           (count(*) filter (where st.id is null))::int                    as missing
      from past pa
      left join public.attendance_stamps st
        on st.student_id = pa.student_id and st.section_id = pa.section_id and st.class_date = pa.date
     group by pa.student_id
  )
  select p.id, p.name, p.phone,
         (p.test_role is not null or p.role in ('instructor', 'admin', 'assistant')),
         per.sections,
         coalesce(cnt.classes, 0), coalesce(cnt.present, 0), coalesce(cnt.late, 0),
         coalesce(cnt.in_only, 0), coalesce(cnt.absent, 0), coalesce(cnt.missing, 0)
    from per
    join public.profiles p on p.id = per.student_id
    left join cnt on cnt.student_id = per.student_id
   order by p.name;
end;
$$;

revoke all on function public.attendance_term_summary(bigint) from public, anon;
grant execute on function public.attendance_term_summary(bigint) to authenticated;

-- ─── 6-1. 내 출석률 (학생 본인) ─────────────────────────────────────────────
-- 2026-09-22 Alan — "학생들이 본인의 신청등급에 따라 출석률을 몇 퍼센트 채우고 있는지 마이페이지에서 확인".
-- **지금 기수(오늘이 개강일~종강일 안)** 의 내가 직접 배정된 현장 반만 센다 — 주3일이면 그 트랙, 주5일이면 두 트랙,
-- 120분 반은 하루 한 칸. 인강 반(저녁 화목금)·불라방은 출석이 없어 빠진다. 다음 기수가 시작되면 그 기수로 새로 센다.
--   total   = 이 기수 기간 안의 내 수업 수 (신청한 만큼 — 반에 들어온 날부터)
--   past    = 그중 끝난 수업 (퇴실 마감 = 끝나고 30분이 지남)
--   present = 끝난 수업 중 출석(퇴실까지) + 출석 인정 · late = 지각 · in_only = 입실만 · absent = 결석 · missing = 안 찍음 (모두 끝난 수업만)
create or replace function public.my_attendance_summary()
returns table (
  term_id bigint, year integer, month integer, opens date, closes date,
  total integer, past integer, present integer, late integer, in_only integer, absent integer, missing integer
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
           d.date + private.time_block_end(en.time_block) + interval '30 minutes' <= v_now as done
      from enr en
      join public.session_dates d on d.section_id = en.section_id
     where d.date between en.counts_from and en.closes_at
  )
  select t.id, t.year, t.month, t.enrollment_opens_at, t.closes_at,
         count(*)::int,
         (count(*) filter (where dy.done))::int,
         -- 셈은 **끝난 수업만** — 퇴실하고 30분이 지나기 전에 세면 출석률이 100% 를 넘는다 (리뷰 2026-09-22)
         (count(*) filter (where dy.done and st.status in ('out', 'manual')))::int,
         (count(*) filter (where dy.done and st.late))::int,
         (count(*) filter (where dy.done and st.status = 'in'))::int,
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

revoke all on function public.my_attendance_summary() from public, anon;
grant execute on function public.my_attendance_summary() to authenticated;

-- ─── 7. 지금 있는 등록을 한 번 날짜대로 맞춘다 ───────────────────────────────
select private.sync_order_window(array(select id from public.enrollment_orders));
update public.enrollment_orders o set status = o.status
 where o.status is distinct from private.order_status_for(o.activates_on, o.access_until);
select * from private.refresh_student_roles(null);
