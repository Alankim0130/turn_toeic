-- ============================================================================
-- 내 등록 상태를 그 자리에서 날짜에 맞춘다 — 자정 배치의 안전장치 (2026-10-13 Alan — "이번달이 끝나고 다음달로 넘어갈때 … 매달 반복할때 오류가 안나오도록")
--
-- 등록 상태(enrollment_orders.status)와 학생 등급은 저장할 때 트리거가 날짜로 계산하고, 날짜가 넘어가는 몫은 pg_cron 이 매일 00:00 KST 에
-- 돌리는 private.run_daily_status_transition() 이 맞춘다 (마이그레이션 20260922113000). 종강 다음 날 닫히는 것은 권한 함수가 날짜를 직접 보므로
-- 배치 없이도 그날부터 막히지만, **개강일에 열리는 것은 배치가 돌아야 한다** — 권한 함수가 `o.status = 'active'` 와 등급(student)을 함께 보는데
-- 둘 다 저장된 값이라서다. 재생 DB 로 확인(2026-10-13): 11/4 개강일에 배치가 돌기 전에는 11월 예비등록생의 반이 하나도 안 열렸고, 배치가 돌면 열렸다.
-- 배치가 한 번 못 돌면 그날 학생은 잠긴 채로 남는다 — 그래서 화면이 "저장된 상태가 날짜와 어긋난 것" 을 보면 이 함수로 **내 것만** 그 자리에서 다시 맞춘다
-- (src/lib/auth.ts getStudentAccess). 배치와 같은 두 걸음이다: 내 등록 행을 건드려 BEFORE 트리거가 날짜로 상태를 다시 계산하게 하고, 내 등급을 다시 정한다.
-- 본인 것만(auth.uid()) · 날짜로만 계산하므로 권한을 더 여는 길이 아니다 — 회원이 날짜가 된 등록으로 수강생이 되는 것은 배치가 하는 일 그대로다.
-- ============================================================================
create or replace function public.refresh_my_enrollment_status()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return;
  end if;
  -- 상태는 BEFORE 트리거(private.tg_enrollment_orders_status)가 날짜로 계산한다 — 어긋난 행만 건드린다 (배치의 같은 문장)
  update public.enrollment_orders o
     set status = o.status
   where o.user_id = v_uid
     and o.status is distinct from private.order_status_for(o.activates_on, o.access_until);
  -- 등급은 AFTER 트리거가 상태가 바뀐 행마다 다시 정하지만, 바뀐 행이 없어도(등급만 어긋난 경우) 한 번 더 맞춘다
  perform private.refresh_student_roles(array[v_uid]);
end;
$$;

revoke all on function public.refresh_my_enrollment_status() from public, anon;
grant execute on function public.refresh_my_enrollment_status() to authenticated, service_role;
