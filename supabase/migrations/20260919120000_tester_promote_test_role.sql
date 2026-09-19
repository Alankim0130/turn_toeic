-- 테스터의 테스트 등급도 개강일에 수강생으로 올린다 (2026-09-19 Alan —
-- "관리자가 650 주5 120분 10시로 등급설정을 해놨는데, 등업신청이 안되있다고 나오고 있어").
--
-- 테스터(강사·관리자)는 진짜 등급이 admin·instructor 라 아래 role UPDATE 에 걸리지 않는데,
-- 학생 화면 판정(effectiveRole)과 RLS(private.user_role())는 둘 다 test_role 을 본다.
-- 그래서 test_role 이 `회원` 인 채로 반만 배정되면 **배정은 됐는데 불라방·다시보기가 잠긴 채** 남는다.
-- 테스터의 반 배정은 실제 학생과 똑같이 움직여야 한다 (도메인 규칙 3 "테스터").
--
-- **올리기만 한다.** 내리지 않는 이유: 반 배정 없이 `수강생` 으로 테스트 중인 스태프가 있는데
-- role 쪽과 같은 not exists 조건으로 내리면 그 사람이 다음 날 00:05 에 조용히 `졸업생` 이 된다.
-- 테스트를 끝내는 것은 테스트 띠의 버튼이 할 일이지 배치가 할 일이 아니다.
-- (앱 쪽 같은 규칙은 src/lib/student-role.ts 의 promoteToStudent — 함께 고칠 것.)
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

  -- 테스터: 진짜 등급은 강사·관리자 그대로 두고 테스트 등급만 올린다
  update public.profiles p
  set test_role = 'student'
  where p.test_role in ('member', 'alumni')
    and exists (
      select 1 from public.enrollment_orders o
      where o.user_id = p.id and o.status = 'active'
    );

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
