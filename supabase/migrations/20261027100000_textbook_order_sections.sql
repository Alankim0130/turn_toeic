-- ============================================================================
-- 불라방 교재주문에 그 달 내 불라방 반을 전부 적는다 (2026-10-27 Alan — "○○○ 학생이 불라방인데 750 주5일 60분이야. 근데 교재신청에는
--   월수금으로 교재신청이 들어가있어. 그래서 불라방 교재신청도 본인이 등업을 하면 해당 등업에 맞춰서 교재신청이 자동으로 선택되도록 하면 좋겠어")
--
--   * 주문은 반 하나(section_id — 대표 반, 월수금을 먼저)만 적어 왔다. 그래서 주5일 학생의 주문이 강사 · 조교 교재주문 화면에 '월수금 10:00~11:00'
--     으로 보였다 (교재 · 금액은 그 달 반 전부로 맞게 계산됐다). 이제 주문할 때 **그 달 내 불라방 반 전부**를 section_ids 에 적고,
--     화면은 학생명단 카드처럼 주5일 짝을 한 줄로 합쳐 보여 준다 (src/app/admin/_lib/queries.ts 의 orderClassLines).
--   * section_id 는 그대로 둔다 — 대표 반(section_ids 의 첫째)이고 예전 화면 · 외래 키가 쓴다.
--   * 이미 들어온 주문은 지금 그 학생의 그 달 불라방 배정으로 채운다 — 단 그 배정에 주문의 대표 반이 들어 있을 때만.
--     주문한 뒤 반을 바꿨으면(대표 반 배정이 없어졌으면) 주문한 때의 반을 알 수 없어 대표 반 하나로 둔다 (주문한 교재와 어긋나는 반을 적지 않는다).
--   * 주문 함수 create_textbook_order 는 반을 고르는 조건 그대로(불라방 · 배정 살아 있음 · 등록 예비 · 수강 중 · 종강 전) 전부를 모은다.
--     인자 · 오류 · 금액 규칙은 바꾸지 않는다 (마이그레이션 20261007110000 과 같다).
--   * 조교는 이 칸도 못 바꾼다 — guard_textbook_order_update 가 상태 · 송장 밖의 칸을 막는다 (새 칸도 그 밖이다).
-- ============================================================================

-- ─── 1. 칸 ─────────────────────────────────────────────────────────────────
alter table public.textbook_orders
  add column if not exists section_ids bigint[] not null default '{}';

comment on column public.textbook_orders.section_ids is
  '주문할 때 그 학생의 그 달 불라방 반 전부 (월수금 먼저 · id 순). 첫째가 section_id(대표 반). 주5일이면 월수금 · 화목금 둘 (2026-10-27)';

-- ─── 2. 이미 들어온 주문 ──────────────────────────────────────────────────
update public.textbook_orders t
   set section_ids = coalesce(
         (select array_agg(e.section_id order by (s.track = 'mwf') desc, s.id)
            from public.enrollments e
            join public.class_sections s on s.id = e.section_id
           where e.student_id = t.user_id
             and e.mode = 'live'
             and s.term_id = t.term_id
          having bool_or(e.section_id = t.section_id)),
         array[t.section_id])
 where t.section_ids = '{}';

-- ─── 3. 주문 넣기 — 그 달 불라방 반 전부를 적는다 ────────────────────────────
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
  v_sections  bigint[];
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

  -- 그 달 불라방 배정 전부 (예비등록생 포함, 종강 전) — 주5일이면 월수금 · 화목금 둘. 대표 반은 첫째(월수금 먼저)
  select coalesce(array_agg(e.section_id order by (s.track = 'mwf') desc, s.id), '{}')
    into v_sections
    from public.enrollments e
    join public.enrollment_orders o on o.id = e.order_id
    join public.class_sections s on s.id = e.section_id
   where e.student_id = v_uid
     and e.mode = 'live'
     and e.status = 'active'
     and o.status in ('preliminary', 'active')
     and s.term_id = p_term_id
     and v_today <= s.closes_at;
  v_section := v_sections[1];
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
      user_id, section_id, section_ids, term_id, recipient_name, phone, postal_code, address, address_detail,
      quantity, memo, status, items, items_total, shipping_fee, total_amount, depositor_name, pay_to,
      delivery_method, pickup_date, pickup_time
    )
    values (
      v_uid, v_section, v_sections, p_term_id, v_recipient, v_phone, v_postal, nullif(v_address, ''), v_detail,
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
  '그 달 내 불라방 반 전부를 section_ids 에 적는다(2026-10-27). '
  '오류: not_eligible · invalid_items · no_account · duplicate · delivery · pickup_date · pickup_time · 입력 칸 이름';

revoke all on function public.create_textbook_order(bigint, bigint[], text, text, text, text, text, text, text, text, date, time) from public, anon;
grant execute on function public.create_textbook_order(bigint, bigint[], text, text, text, text, text, text, text, text, date, time) to authenticated;
