-- ============================================================================
-- 2026-10-22 오류 점검 (Alan "지금 시점에서 오류점검 한번 부탁해") — DB 쪽 고침 셋
--
--   1. 특강 — **내 수업이 끝난 뒤의 특강은 신청할 수 없다.** 2주완성 학생(앞 절반만 듣는다)은 앞 절반 동안 수강 중이라
--      그 달 뒤 절반의 특강까지 신청됐다 (CLAUDE.md 는 "뒤 절반의 특강은 신청할 수 없다" 라고 적어 두었는데 실제로는 열려 있었다).
--      private.lecture_in_my_term(특강) = 그 달 반에 지금 수강 중이고 그 반의 종강일이 특강 날 이후 → lecture_way_open(신청 정책 · 트리거)이 함께 본다.
--      취소(lecture_signup_open — 정책 "lecture_signups: 본인 취소…")는 그대로다 — 이미 신청한 학생은 받는 동안 취소할 수 있다.
--      트리거는 닫힌 특강과 가르려고 따로 lecture_after_my_term 을 낸다 (앱이 "내 수업은 N월 N일까지라…" 로 바꾼다).
--   2. 숙제 미제출 자동 알림 — **켠 뒤 같은 날 보내는 시각을 뒤로 옮기면 그날 알림이 빠졌다.**
--      오늘 시각이 지난 뒤 켜면 창의 시작(covered_until)이 내일 0시가 되는데, 그 뒤 시각을 오늘 더 늦게 바꾸면 오늘 실행이 내일 0시부터 보아
--      아무에게도 가지 않았고, 다음 날에도 그 숙제는 '새로' 가 아니라 영영 알리지 않았다 (화면은 "다음 자동 알림 오늘 22:00" 이었다).
--      시각을 바꿀 때도 켤 때와 같은 규칙으로 창의 시작을 다시 정하고(아직 한 번도 안 돈 경우만), 가져갈 때 창의 시작이 오늘 0시보다 늦지 않게 한다.
--   3. 평달 자동 세팅 — **같은 레벨 · 과정의 강좌가 둘 이상 '사용 중' 이면 저절로 열지 않는다** (어느 강좌로 열지 모른다 — 둘 다 열면
--      그 레벨 반이 두 벌이 되어 수강증이 반 하나에 맞지 않는다). 그 까닭(duplicate_course)을 결과 표에 남길 수 있게 check 를 넓힌다.
-- ============================================================================

-- ─── 1. 특강 — 내 수업 기간 안의 특강만 ───────────────────────────────────────────
create or replace function private.lecture_in_my_term(p_lecture_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.special_lectures l
      join public.class_sections s on s.term_id = l.term_id
      join public.enrollments e on e.section_id = s.id
      join public.enrollment_orders o on o.id = e.order_id
     where l.id = p_lecture_id
       and e.student_id = (select auth.uid())
       and e.status = 'active'
       and o.status = 'active'
       and private.today_kst() between s.enrollment_opens_at and s.closes_at
       and l.date <= s.closes_at
  )
$$;
comment on function private.lecture_in_my_term(bigint) is
  '이 특강이 내 수업 기간 안인가 (2026-10-22) — 그 달 반에 지금 수강 중(is_term_enrollee 와 같은 반)이고 그 반의 종강일이 특강 날 이후. 2주완성 학생은 앞 절반 특강만. 앱 lectureAfterMyTerm 과 같은 규칙';
revoke all on function private.lecture_in_my_term(bigint) from public, anon;
grant execute on function private.lecture_in_my_term(bigint) to authenticated, service_role;

-- 이 방식으로 신청할 수 있나 — 신청 받는 중 + 내 수업 기간 안 + 그 방식을 받는다. 정원은 신청 수 트리거가 본다
create or replace function private.lecture_way_open(p_lecture_id bigint, p_way text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.lecture_signup_open(p_lecture_id)
     and private.lecture_in_my_term(p_lecture_id)
     and exists (
       select 1 from public.special_lecture_ways w
        where w.lecture_id = p_lecture_id and w.way = p_way and w.enabled
     )
$$;
comment on function private.lecture_way_open(bigint, text) is
  '이 방식으로 신청할 수 있나 (2026-10-16 → 2026-10-22 내 수업 기간 안) — lecture_signup_open + lecture_in_my_term + 그 방식을 받는다(enabled). 정원은 lecture_signups_sync 가 본다';

-- 신청을 넣을 때 — 시험 신청 표시 · 방식 채우기 · 닫힘 · 내 수업이 끝난 뒤 · 한 특강 한 방식 (20261016130000 에 '내 수업이 끝난 뒤' 갈래 하나)
create or replace function private.lecture_signups_check_way()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 강사 · 관리자(진짜 등급 — 테스트 등급이 아니다)가 넣은 신청은 시험 신청이다 — 신청 수 · 정원에 세지 않는다 (2026-10-16 Alan).
  -- 넣는 쪽이 보낸 값은 믿지 않고 늘 여기서 정한다. 학생명단 · 숙제 미제출 · 출석 명단과 같은 등급 (src/lib/roster-accounts.ts)
  new.staff_test := exists (
    select 1 from public.profiles p
     where p.id = new.user_id and p.role in ('instructor', 'admin')
  );

  if new.way is null then
    select w.way into new.way
      from public.special_lecture_ways w
     where w.lecture_id = new.lecture_id and w.enabled
     order by array_position(array['onsite', 'video', 'paper', 'pdf'], w.way)
     limit 1;
  end if;

  if new.user_id = (select auth.uid()) then
    -- 신청은 받는 중인데 내 수업이 그 전에 끝난다 (2주완성 앞 절반 등) — 닫힌 특강과 다른 말을 한다 (2026-10-22)
    if private.lecture_signup_open(new.lecture_id) and not private.lecture_in_my_term(new.lecture_id) then
      raise exception 'lecture_after_my_term'
        using errcode = 'P0001', detail = '내 수업이 특강 날 전에 끝나서 신청할 수 없습니다.';
    end if;
    -- 닫힌 특강 · 받지 않는 방식이면 조건(후기 · 팔로우)을 묻기 전에 그렇다고 말한다 — 정책(lecture_way_open)이 한 번 더 막는다
    if not private.lecture_way_open(new.lecture_id, new.way) then
      raise exception 'lecture_signup_closed'
        using errcode = 'P0001', detail = '지금은 이 방식으로 신청을 받지 않습니다.';
    end if;
    -- 같은 학생이 두 방식을 동시에 눌러도 하나만 — 학생 · 특강마다 줄을 세운다
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lecture_signup:' || new.lecture_id || ':' || new.user_id, 0));
    if exists (select 1 from public.lecture_signups s where s.lecture_id = new.lecture_id and s.user_id = new.user_id) then
      raise exception 'lecture_already_signed'
        using errcode = 'P0001', detail = '이미 신청한 특강입니다. 방식을 바꾸려면 신청을 취소하고 다시 신청해 주세요.';
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function private.lecture_signups_check_way() from public, anon, authenticated;

-- ─── 2. 숙제 미제출 자동 알림 — 시각을 바꿔도 그날 알림이 빠지지 않게 ─────────────────────────
create or replace function private.tg_homework_missing_auto_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.today_kst();
  v_first timestamptz;
begin
  if new.enabled is distinct from old.enabled or new.send_time is distinct from old.send_time then
    new.schedule_changed_at := now();
    new.updated_at := now();
    new.updated_by := auth.uid();   -- 서버(service_role)가 바꾸면 비어 있다
    -- 첫 자동 알림이 도는 날(오늘 시각이 아직이면 오늘, 지났으면 내일)의 0시
    v_first := case
      when (v_today + new.send_time) at time zone 'Asia/Seoul' > now() then v_today::timestamp at time zone 'Asia/Seoul'
      else (v_today + 1)::timestamp at time zone 'Asia/Seoul'
    end;
    if new.enabled and not old.enabled then
      -- 켜는 순간: 그날 0시부터 기한이 지난 숙제를 본다 (켜기 전에 기한이 지난 숙제를 한꺼번에 알리지 않는다)
      new.covered_until := v_first;
    elsif new.enabled and new.covered_until is not null and new.covered_until > now() then
      -- 켠 뒤 아직 한 번도 안 돌았는데(창의 시작이 아직 앞에 있다) 시각을 바꿨다 — 첫 실행 날이 바뀌었을 수 있다 (2026-10-22 오류 점검:
      -- 오늘 시각이 지난 뒤 켜고 시각을 오늘 더 늦게 옮기면 오늘 실행이 내일 0시부터 보아 그날 숙제를 영영 알리지 않았다)
      new.covered_until := v_first;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.tg_homework_missing_auto_touch() from public, anon, authenticated;

-- 그날 실행 가져가기 — 창의 시작은 오늘 0시보다 늦지 않게 (위 트리거와 겹치는 안전장치 — 앞으로 오는 창의 시작으로 오늘 기한을 건너뛰지 않는다)
create or replace function public.claim_homework_missing_auto()
returns table (claimed_day date, claimed_at timestamptz, claimed_from timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a        public.homework_missing_auto%rowtype;
  v_day    date := private.today_kst();
  v_day0   timestamptz := private.today_kst()::timestamp at time zone 'Asia/Seoul';
  v_at     timestamptz;
  v_from   timestamptz;
  r_day    date;
  r_at     timestamptz;
  r_from   timestamptz;
begin
  select * into a from public.homework_missing_auto where id for update;
  if not found or not a.enabled then
    return;
  end if;
  v_at := (v_day + a.send_time) at time zone 'Asia/Seoul';
  if v_at > now() or v_at <= a.schedule_changed_at then
    return;
  end if;
  v_from := least(coalesce(a.covered_until, v_day0), v_day0);

  insert into public.homework_missing_auto_runs as r (run_date, started_at, window_from)
  values (v_day, now(), v_from)
  on conflict on constraint homework_missing_auto_runs_pkey do update
     set started_at = excluded.started_at, window_from = excluded.window_from, error = null
   where r.finished_at is null and r.started_at < now() - interval '15 minutes'
  returning r.run_date, r.started_at, r.window_from into r_day, r_at, r_from;

  if r_day is null then
    return;
  end if;
  claimed_day := r_day;
  claimed_at := r_at;
  claimed_from := r_from;
  return next;
end;
$$;

comment on function public.claim_homework_missing_auto() is
  '숙제 미제출 자동 알림 — 오늘 실행을 가져간다 (보낼 때가 됐고 오늘 아직 안 돌았을 때만, 멈춘 실행은 15분 뒤). 창의 시작은 오늘 0시보다 늦지 않다 (2026-10-22). service_role 전용 — /api/cron/homework-missing-auto';

revoke all on function public.claim_homework_missing_auto() from public, anon, authenticated;
grant execute on function public.claim_homework_missing_auto() to service_role;

-- ─── 3. 평달 자동 세팅 — 같은 레벨 · 과정의 강좌가 둘이면 저절로 열지 않는다 ─────────────────
alter table public.month_auto_open_state drop constraint if exists month_auto_open_state_error_check;
alter table public.month_auto_open_state
  add constraint month_auto_open_state_error_check
  check (error is null or error in ('no_timetable', 'timetable_error', 'sections_error', 'forbidden', 'no_sections', 'duplicate_course'));
