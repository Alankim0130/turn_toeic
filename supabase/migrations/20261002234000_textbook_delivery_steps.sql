-- ============================================================================
-- 불라방 교재주문 배송 단계 (2026-10-02 Alan — "학생이 주문완료하면, 강사가 금액확인을 하고 금액확인 버튼을 눌러주면, 조교들이 배송을 진행할거야.
--   그럼 조교들이 배송을 완료하면 배송완료 버튼을 눌러주면 좋겠어. 그럼 학생들 화면에는 배송확인 - 배송시작 이렇게 나오면 좋겠어.
--   그리고 학생화면에서 학생이 해당화면을 없애고 싶다면, 배송완료 버튼을 누르면 사라지게 하면 될 것 같아.")
--
--   상태 값은 그대로다 — requested(주문완료 · 금액확인 전) → confirmed(강사 금액확인 = 학생 "배송확인") → shipped(조교 배송완료 = 학생 "배송시작").
--   * **금액확인은 강사 · 관리자만** — 교재비가 강사 통장으로 들어와 조교는 대조할 수 없다. 화면(서버 액션 requireStaff)과 같은 규칙을
--     DB 도 본다: 조교가 입금 확인 전(또는 취소) 주문을 confirmed · shipped 로 넘기면 막는다 — 배송완료로 바로 건너뛰면 금액확인을
--     비껴가므로 둘 다다 (프로필의 guard_assistant_profile_update 와 같은 꼴 — 서비스 롤은 auth.uid() 가 없어 지나간다).
--     금액확인된 주문의 배송완료 · 송장 · 취소 · 되돌리기는 예전처럼 조교도 한다.
--   * **학생이 받았다고 누르면(배송완료) 학생 내역에서 사라진다** — received_at. 주문 기록은 남는다 (강사 · 조교 화면에는 "학생 수령 확인").
--     학생은 주문 표를 고칠 수 없으므로(정책 없음) 함수 하나로만 — 내 주문 · 배송시작(shipped) 상태일 때만.
--   * 배송완료가 아닌 상태로 되돌리면 수령 표시도 지운다 — 다시 배송하면 학생 화면에 다시 선다.
-- ============================================================================

alter table public.textbook_orders
  add column if not exists received_at timestamptz;

comment on column public.textbook_orders.received_at is
  '학생이 교재를 받았다고 누른 시각 (2026-10-02). 누르면 학생 주문 내역에서 사라진다. 배송완료(shipped)일 때만 남는다';

-- ─── 조교는 금액확인을 못 한다(건너뛰기도) · 배송완료가 아니면 수령 표시를 지운다 ─────
create or replace function private.guard_textbook_order_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.status in ('confirmed', 'shipped')
     and old.status in ('requested', 'cancelled')
     and (select private.my_real_role()) = 'assistant'
  then
    raise exception 'confirm_staff_only' using errcode = '42501';
  end if;
  if new.status <> 'shipped' then
    new.received_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_textbook_order_update() from public, anon, authenticated;

drop trigger if exists guard_textbook_order_update on public.textbook_orders;
create trigger guard_textbook_order_update
  before update on public.textbook_orders
  for each row execute function private.guard_textbook_order_update();

-- ─── 학생: 받았어요(배송완료) — 내 주문 · 배송시작 상태만 ───────────────────────
create or replace function public.receive_textbook_order(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.textbook_orders
     set received_at = now()
   where id = p_id
     and user_id = (select auth.uid())
     and status = 'shipped'
     and received_at is null;
  return found;
end;
$$;

comment on function public.receive_textbook_order(bigint) is
  '학생이 교재를 받았다고 누른다 — 내 주문이고 배송시작(shipped)일 때만. 학생 주문 내역에서 사라진다';

revoke all on function public.receive_textbook_order(bigint) from public, anon;
grant execute on function public.receive_textbook_order(bigint) to authenticated;
