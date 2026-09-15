-- ============================================================================
-- 상태 전이 (CLAUDE.md "상태 전이 (일 1회 배치)") + 둘째 달 반 자동 배정 (§4)
--
--  * 매일 한국시간 00:05 에 pg_cron 으로 실행한다 (UTC 15:05).
--  * "오늘" 은 private.today_kst() 기준.
--  * 둘째 달 반 자동 배정은 배치에서도 돌리고, 강사가 반을 개설(insert/update)할 때도
--    트리거로 즉시 돌린다.
-- ============================================================================

-- ─── 1. pending_section 해소 ────────────────────────────────────────────────
-- 2개월 등록의 둘째 달 enrollment 는 section_id 없이 pending_section 으로 대기한다.
-- 첫 달 반(pending_from_section)과 같은 (course, track, time_block) 반이
-- 다음 달 term 에 생기면 그 반으로 배정하고, 주문의 access_until 을 그 반의 종강일로 갱신한다.
create or replace function private.resolve_pending_enrollments()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with target as (
    select
      e.id as enrollment_id,
      e.order_id,
      (
        select s.id
        from public.class_sections s
        join public.terms tn on tn.id = s.term_id
        where s.course_id = src.course_id
          and s.track = src.track
          and s.time_block is not distinct from src.time_block
          and s.status <> 'draft'
          and tn.year  = case when ts.month = 12 then ts.year + 1 else ts.year end
          and tn.month = case when ts.month = 12 then 1 else ts.month + 1 end
          and not exists (
            select 1 from public.enrollments e2
            where e2.student_id = e.student_id and e2.section_id = s.id
          )
        order by s.id
        limit 1
      ) as next_section_id
    from public.enrollments e
    join public.class_sections src on src.id = e.pending_from_section_id
    join public.terms ts on ts.id = src.term_id
    where e.status = 'pending_section'
      and e.section_id is null
  ),
  assigned as (
    update public.enrollments e
    set section_id = t.next_section_id,
        status     = 'active'
    from target t
    where e.id = t.enrollment_id
      and t.next_section_id is not null
    returning e.order_id
  ),
  bumped as (
    update public.enrollment_orders o
    set access_until = greatest(o.access_until, m.max_closes)
    from (
      select en.order_id, max(s.closes_at) as max_closes
      from public.enrollments en
      join public.class_sections s on s.id = en.section_id
      where en.order_id in (select order_id from assigned)
      group by en.order_id
    ) m
    where o.id = m.order_id
    returning o.id
  )
  select count(*) into v_count from assigned;

  return v_count;
end;
$$;

-- 강사가 반을 개설·수정하면 곧바로 대기 중인 둘째 달 등록을 배정한다
create or replace function private.trg_resolve_pending_enrollments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.resolve_pending_enrollments();
  return null;
end;
$$;

create trigger class_sections_resolve_pending
  after insert or update of term_id, course_id, track, time_block, status
  on public.class_sections
  for each statement
  execute function private.trg_resolve_pending_enrollments();

-- ─── 2. 일 1회 상태 전이 ────────────────────────────────────────────────────
create or replace function private.run_daily_status_transition()
returns table (
  orders_activated int,
  promoted_to_student int,
  orders_expired int,
  demoted_to_alumni int,
  pending_resolved int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.today_kst();
  v_activated int; v_promoted int; v_expired int; v_demoted int; v_resolved int;
begin
  -- 개강일 도래 → 예비등록생을 수강생으로
  update public.enrollment_orders
  set status = 'active'
  where status = 'preliminary' and activates_on <= v_today;
  get diagnostics v_activated = row_count;

  update public.profiles p
  set role = 'student'
  where p.role in ('member', 'alumni')
    and exists (
      select 1 from public.enrollment_orders o
      where o.user_id = p.id and o.status = 'active'
    );
  get diagnostics v_promoted = row_count;

  -- 종강일 경과 → 만료
  update public.enrollment_orders
  set status = 'expired'
  where status = 'active' and access_until < v_today;
  get diagnostics v_expired = row_count;

  update public.profiles p
  set role = 'alumni'
  where p.role = 'student'
    and not exists (
      select 1 from public.enrollment_orders o
      where o.user_id = p.id and o.status = 'active'
    );
  get diagnostics v_demoted = row_count;

  -- 둘째 달 반 자동 배정 (트리거가 놓친 경우 대비)
  v_resolved := private.resolve_pending_enrollments();

  return query select v_activated, v_promoted, v_expired, v_demoted, v_resolved;
end;
$$;

revoke execute on function
  private.resolve_pending_enrollments(),
  private.trg_resolve_pending_enrollments(),
  private.run_daily_status_transition()
from public, anon, authenticated;

-- ─── 3. pg_cron 스케줄 ─────────────────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 매일 00:05 KST (= 15:05 UTC)
select cron.schedule(
  'daily-status-transition',
  '5 15 * * *',
  $$ select * from private.run_daily_status_transition() $$
);
