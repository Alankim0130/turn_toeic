-- ============================================================================
-- 불라방 교재 현장수령 (2026-10-07 Alan — "불라방 현장수령도 있어. 현장수령시 택배비가 없어. 그래서 불라방 교재 주문할때
--   현장 수령 선택시 무슨날짜에 올껀지, 몇시쯤 올껀지 남겨주면 좋겠어.")
--
--   * 주문마다 받는 방법(delivery_method)을 적는다 — parcel(택배, 예전 주문 전부) | pickup(학원에서 직접 받기).
--   * **현장수령은 배송비가 없다** — 함수가 배송비를 0 으로 두고 계좌별 금액도 그것으로 계산한다 (앱 `textbookQuote` 와 같은 규칙).
--   * 현장수령이면 받으러 올 날짜 · 시각(pickup_date · pickup_time — "몇 시쯤")을 받고 배송지(주소 · 우편번호 · 상세 주소)는 받지 않는다.
--     그래서 주소 칸의 not null 을 풀고, 대신 "택배면 주소가 있고 현장수령이면 날짜 · 시각이 있다" 를 check 로 묶는다.
--     날짜는 오늘(KST)부터 60일 안 — 개강 전에 등업한 예비등록생도 개강일에 받으러 올 수 있다.
--   * 입금 → 강사 금액확인은 택배와 같다. 조교가 건네면 "수령완료" (상태 shipped + received_at — 학생 내역에서 사라진다. 앱의 서버 액션).
--   * 받는 방법 · 날짜 · 시각은 학생이 주문할 때 정한다 — 조교는 못 바꾼다 (guard_textbook_order_update 가 상태 · 송장 밖의 칸을 막는다).
--
--   create_textbook_order 에 기본값이 있는 인자 셋(p_delivery · p_pickup_date · p_pickup_time)을 붙인다 — 예전 9개 인자 호출(배포 사이의
--   옛 앱 · 택배 주문)도 그대로 택배 주문이 된다 (save_term_schedule 의 p_parts 와 같은 길).
-- ============================================================================

-- ─── 1. 받는 방법 · 받으러 올 날짜 · 시각 ──────────────────────────────────
alter table public.textbook_orders
  add column if not exists delivery_method text not null default 'parcel',
  add column if not exists pickup_date     date,
  add column if not exists pickup_time     time;

alter table public.textbook_orders drop constraint if exists textbook_orders_delivery_method_check;
alter table public.textbook_orders
  add constraint textbook_orders_delivery_method_check check (delivery_method in ('parcel', 'pickup'));

-- 현장수령은 배송지가 없다
alter table public.textbook_orders alter column address drop not null;

alter table public.textbook_orders drop constraint if exists textbook_orders_pickup_check;
alter table public.textbook_orders
  add constraint textbook_orders_pickup_check check (
    case delivery_method
      when 'pickup' then pickup_date is not null and pickup_time is not null
      else address is not null and pickup_date is null and pickup_time is null
    end
  );

comment on column public.textbook_orders.delivery_method is
  '받는 방법 (2026-10-07): parcel 택배 | pickup 학원에서 직접 받기(현장수령 — 배송비 없음, 주소 대신 받으러 올 날짜 · 시각)';
comment on column public.textbook_orders.pickup_date is '현장수령: 받으러 올 날짜 (학생이 주문할 때 고른다)';
comment on column public.textbook_orders.pickup_time is '현장수령: 받으러 올 시각 — "몇 시쯤" (학생이 주문할 때 고른다)';

-- ─── 2. 주문 넣기 — 받는 방법을 더한다 ────────────────────────────────────
drop function if exists public.create_textbook_order(bigint, bigint[], text, text, text, text, text, text, text);

create or replace function public.create_textbook_order(
  p_term_id        bigint,
  p_item_ids       bigint[],
  p_recipient      text,
  p_phone          text,
  p_postal_code    text,
  p_address        text,
  p_address_detail text,
  p_memo           text,
  p_depositor      text,
  p_delivery       text default 'parcel',
  p_pickup_date    date default null,
  p_pickup_time    time default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_section   bigint;
  v_levels    int[];
  v_items     jsonb;
  v_total     int;
  v_count     int;
  v_wanted    int;
  v_ship      int;
  v_default   bigint;
  v_pay       jsonb;
  v_method    text := coalesce(nullif(btrim(coalesce(p_delivery, '')), ''), 'parcel');
  v_phone     text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_postal    text := nullif(regexp_replace(coalesce(p_postal_code, ''), '\D', '', 'g'), '');
  v_recipient text := btrim(coalesce(p_recipient, ''));
  v_address   text := btrim(coalesce(p_address, ''));
  v_detail    text := nullif(btrim(coalesce(p_address_detail, '')), '');
  v_memo      text := nullif(btrim(coalesce(p_memo, '')), '');
  v_depositor text := btrim(coalesce(p_depositor, ''));
  v_today     date := private.today_kst();
  v_id        bigint;
begin
  if v_uid is null then
    raise exception 'login_required';
  end if;

  -- 그 달 불라방 배정 (예비등록생 포함, 종강 전). 대표 반은 월수금을 먼저 — 주5일이면 두 반 중 하나로 적는다
  select e.section_id
    into v_section
    from public.enrollments e
    join public.enrollment_orders o on o.id = e.order_id
    join public.class_sections s on s.id = e.section_id
   where e.student_id = v_uid
     and e.mode = 'live'
     and e.status = 'active'
     and o.status in ('preliminary', 'active')
     and s.term_id = p_term_id
     and v_today <= s.closes_at
   order by (s.track = 'mwf') desc, s.id
   limit 1;
  if v_section is null then
    raise exception 'not_eligible';
  end if;

  -- 내 레벨: 그 달 불라방 반의 강좌 레벨 + 속성반이 함께 듣는 레벨
  select coalesce(array_agg(distinct lv), '{}')
    into v_levels
    from (
      select unnest(c.includes_levels || c.target_score) as lv
        from public.enrollments e
        join public.enrollment_orders o on o.id = e.order_id
        join public.class_sections s on s.id = e.section_id
        join public.courses c on c.id = s.course_id
       where e.student_id = v_uid
         and e.mode = 'live'
         and e.status = 'active'
         and o.status in ('preliminary', 'active')
         and s.term_id = p_term_id
    ) x
   where lv is not null;

  -- 입력 검사 (화면이 먼저 보지만 믿지 않는다)
  if v_method not in ('parcel', 'pickup') then raise exception 'delivery'; end if;
  if char_length(v_recipient) not between 2 and 30 then raise exception 'recipient'; end if;
  if v_phone !~ '^01\d{8,9}$' then raise exception 'phone'; end if;
  if v_method = 'pickup' then
    -- 현장수령: 받으러 올 날짜(오늘부터 60일 안) · 시각. 배송지는 받지 않는다
    if p_pickup_date is null or p_pickup_date < v_today or p_pickup_date > v_today + 60 then raise exception 'pickup_date'; end if;
    if p_pickup_time is null then raise exception 'pickup_time'; end if;
    v_address := null;
    v_detail  := null;
    v_postal  := null;
  else
    if char_length(v_address) not between 5 and 200 then raise exception 'address'; end if;
    if v_detail is not null and char_length(v_detail) > 100 then raise exception 'address'; end if;
    if v_postal is not null and char_length(v_postal) <> 5 then raise exception 'postal'; end if;
  end if;
  if v_memo is not null and char_length(v_memo) > 200 then raise exception 'memo'; end if;
  if char_length(v_depositor) not between 1 and 30 then raise exception 'depositor'; end if;

  select s.shipping_fee, s.default_account_id into v_ship, v_default from public.textbook_settings s where s.id;
  -- 기본 계좌가 비었으면 쓰는 중인 첫 계좌
  if v_default is null or not exists (select 1 from public.textbook_accounts a where a.id = v_default and a.active) then
    select a.id into v_default from public.textbook_accounts a where a.active order by a.sort_order, a.id limit 1;
  end if;

  -- 고른 교재: 쓰는 중이고 내 레벨(또는 모든 레벨)인 것만. 하나라도 어긋나면 거절한다
  select count(distinct x) into v_wanted from unnest(coalesce(p_item_ids, '{}')) x;
  select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.id, 'name', i.name, 'price', i.price,
             'account_id', case when a.active then i.account_id else v_default end)
           order by i.sort_order, i.id), '[]'::jsonb),
         coalesce(sum(i.price), 0),
         count(*)
    into v_items, v_total, v_count
    from public.textbook_items i
    left join public.textbook_accounts a on a.id = i.account_id
   where i.id = any (p_item_ids)
     and i.active
     and (i.level is null or i.level = any (v_levels));
  if v_wanted = 0 or v_count <> v_wanted then
    raise exception 'invalid_items';
  end if;
  -- 현장수령은 배송비가 없다 (2026-10-07 Alan)
  v_ship := case when v_method = 'pickup' then 0 else coalesce(v_ship, 0) end;

  -- 계좌마다 얼마: 교재는 제 계좌(없으면 기본 계좌)로, 배송비는 기본 계좌로
  with lines as (
    select coalesce((e->>'account_id')::bigint, v_default) as account_id, (e->>'price')::int as amount
      from jsonb_array_elements(v_items) e
    union all
    select v_default, v_ship where v_ship > 0
  ),
  sums as (
    select account_id, sum(amount)::int as amount from lines group by account_id having sum(amount) > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
             'account_id', a.id, 'bank_name', a.bank_name, 'account_no', a.account_no,
             'holder', a.holder, 'label', a.label, 'amount', s.amount)
           order by a.sort_order, a.id), '[]'::jsonb)
    into v_pay
    from sums s
    left join public.textbook_accounts a on a.id = s.account_id;

  -- 낼 돈이 있는데 받을 계좌가 없으면 주문을 받지 않는다 (강사가 계좌부터 등록해야 한다)
  if v_total + v_ship > 0 and (v_default is null or exists (select 1 from jsonb_array_elements(v_pay) p where p->>'account_id' is null)) then
    raise exception 'no_account';
  end if;

  begin
    insert into public.textbook_orders (
      user_id, section_id, term_id, recipient_name, phone, postal_code, address, address_detail,
      quantity, memo, status, items, items_total, shipping_fee, total_amount, depositor_name, pay_to,
      delivery_method, pickup_date, pickup_time
    )
    values (
      v_uid, v_section, p_term_id, v_recipient, v_phone, v_postal, nullif(v_address, ''), v_detail,
      least(greatest(v_count, 1), 5), v_memo, 'requested', v_items, v_total, v_ship, v_total + v_ship, v_depositor, v_pay,
      v_method,
      case when v_method = 'pickup' then p_pickup_date end,
      case when v_method = 'pickup' then p_pickup_time end
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'duplicate';
  end;

  return v_id;
end;
$$;

comment on function public.create_textbook_order(bigint, bigint[], text, text, text, text, text, text, text, text, date, time) is
  '불라방 교재 주문. 품목·금액·입금 계좌를 서버가 정해 박아 둔다. 받는 방법 parcel(택배) | pickup(현장수령 — 배송비 없음 · 날짜 · 시각). '
  '오류: not_eligible · invalid_items · no_account · duplicate · delivery · pickup_date · pickup_time · 입력 칸 이름';

revoke all on function public.create_textbook_order(bigint, bigint[], text, text, text, text, text, text, text, text, date, time) from public, anon;
grant execute on function public.create_textbook_order(bigint, bigint[], text, text, text, text, text, text, text, text, date, time) to authenticated;
