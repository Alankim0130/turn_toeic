-- 불라방 교재주문 — 학생이 올리는 **이체 화면 캡처** (2026-11-04 Alan — "불라방 교재주문할때 쌤들이 하나씩 확인하는게 힘들어. 그래서 학생이 이체를 하고 난 뒤에,
-- 해당 화면을 스크린샷찍어서 올려주면 조교들이 바로 확인하고 배송을 시작할 수 있도록 해주면 좋겠어").
--
--   * 주문 한 건에 캡처 하나 (textbook_orders.transfer_*). 금액확인 전(requested)에만 올리거나 바꾼다 — 학생은 DB 함수 `attach_textbook_transfer` 로만 쓴다
--     (auth.uid() 로 내 주문만 · 경로는 내 폴더 · 사진 형식 · 10MB). 되돌려주는 값은 바꾸기 전 경로 — 앱이 저장소에서 지운다.
--   * **이체 캡처가 있는 주문은 조교도 금액확인(requested → confirmed)한다.** 캡처가 없는 주문은 예전처럼 강사 · 관리자만 (교재비가 강사 통장으로 들어와 조교는 대조할 수 없다).
--     배송완료(shipped)로 바로 건너뛰는 것은 그대로 막는다. 조교 세션이 바꾸는 칸은 그대로 status · tracking_no 뿐이다 (guard_textbook_order_update).
--   * 버킷 `textbook-transfers` 는 비공개 · 사진 형식 · 10MB. 본인 폴더 올리기 · 본인 삭제, 조회는 조교 · 강사 · 관리자와 본인.
--     파일은 `/files/transfer/{주문 id}` 가 사용자 세션으로 주문 행을 읽고(RLS) 서명 주소로 보낸다.
-- 수강증(receipts 버킷 · enrollment_verifications)과는 다른 것이라 이름에 receipt 를 쓰지 않는다.

alter table public.textbook_orders
  add column if not exists transfer_path text,
  add column if not exists transfer_type text,
  add column if not exists transfer_size integer,
  add column if not exists transfer_name text,
  add column if not exists transfer_at timestamptz;

comment on column public.textbook_orders.transfer_path is '학생이 올린 이체 화면 캡처 (2026-11-04) — 버킷 textbook-transfers 의 {학생 id}/{무작위}.ext. 있으면 조교도 금액확인한다';

alter table public.textbook_orders drop constraint if exists textbook_orders_transfer_check;
alter table public.textbook_orders add constraint textbook_orders_transfer_check check (
  (transfer_path is null and transfer_type is null and transfer_size is null and transfer_name is null and transfer_at is null)
  or (transfer_path is not null and transfer_path not like '%..%' and transfer_at is not null and transfer_size > 0 and transfer_size <= 10 * 1024 * 1024)
);

-- ─── 학생이 캡처를 붙인다 — 내 주문 · 금액확인 전에만. 되돌려주는 값은 바꾸기 전 경로 (앱이 저장소에서 지운다) ───
create or replace function public.attach_textbook_transfer(p_id bigint, p_path text, p_type text, p_size integer, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old text;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  -- 경로는 내 폴더 바로 아래 한 단계 — 무작위 이름 + 확장자 (앱 objectName). 다른 폴더 · 상위 이동 없음
  if p_path is null or p_path !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'bad_path' using errcode = '22023';
  end if;
  if p_type is null or p_type !~ '^image/(jpeg|jpg|png|webp|gif|heic|heif|avif|bmp|tiff)$' then
    raise exception 'bad_type' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0 or p_size > 10 * 1024 * 1024 then
    raise exception 'bad_size' using errcode = '22023';
  end if;

  select o.transfer_path, o.status::text into v_old, v_status
    from public.textbook_orders o
   where o.id = p_id and o.user_id = v_uid
   for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'requested' then
    raise exception 'not_requested' using errcode = 'P0001';
  end if;

  update public.textbook_orders
     set transfer_path = p_path,
         transfer_type = p_type,
         transfer_size = p_size,
         transfer_name = left(coalesce(p_name, ''), 200),
         transfer_at = now(),
         updated_at = now()
   where id = p_id;
  return v_old;
end;
$$;

revoke all on function public.attach_textbook_transfer(bigint, text, text, integer, text) from public, anon;
grant execute on function public.attach_textbook_transfer(bigint, text, text, integer, text) to authenticated;

-- ─── 조교의 금액확인 — 이체 캡처가 있는 주문만 (2026-10-02 · 2026-10-03 규칙에 한 줄) ───
create or replace function private.guard_textbook_order_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (select private.my_real_role()) = 'assistant' then
    -- 조교 세션은 상태 · 송장번호만 바꾼다 (2026-10-03) — 캡처 칸도 못 바꾼다
    if (to_jsonb(new) - array['status', 'tracking_no', 'updated_at', 'received_at'])
       is distinct from (to_jsonb(old) - array['status', 'tracking_no', 'updated_at', 'received_at']) then
      raise exception 'assistant_status_only' using errcode = '42501';
    end if;
    -- 금액확인 전(또는 취소) 주문을 배송 대기 · 배송완료로 넘기는 것은 강사 · 관리자만 (2026-10-02) —
    -- 단 **이체 캡처가 있는 금액확인 전 주문의 금액확인(→ 배송 대기)은 조교도 한다** (2026-11-04). 배송완료로 바로 건너뛰는 것은 그대로 막는다
    if new.status in ('confirmed', 'shipped') and old.status in ('requested', 'cancelled')
       and not (new.status = 'confirmed' and old.status = 'requested' and old.transfer_path is not null) then
      raise exception 'confirm_staff_only' using errcode = '42501';
    end if;
  end if;
  if new.status <> 'shipped' then
    new.received_at := null;
  end if;
  return new;
end;
$$;

-- ─── 버킷 — 비공개 · 사진 형식 · 10MB ───
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'textbook-transfers', 'textbook-transfers', false, 10 * 1024 * 1024,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif', 'image/bmp', 'image/tiff']
)
on conflict (id) do nothing;

drop policy if exists "textbook-transfers: 본인 폴더 업로드" on storage.objects;
create policy "textbook-transfers: 본인 폴더 업로드" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'textbook-transfers' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 조회: 조교 · 강사 · 관리자 확인을 맨 앞에 (조교가 캡처를 보고 금액확인한다)
drop policy if exists "textbook-transfers: 스태프·조교·본인 조회" on storage.objects;
create policy "textbook-transfers: 스태프·조교·본인 조회" on storage.objects
  for select to authenticated
  using (bucket_id = 'textbook-transfers' and ((select private.is_crew()) or (storage.foldername(name))[1] = (select auth.uid())::text));

drop policy if exists "textbook-transfers: 본인 삭제" on storage.objects;
create policy "textbook-transfers: 본인 삭제" on storage.objects
  for delete to authenticated
  using (bucket_id = 'textbook-transfers' and (storage.foldername(name))[1] = (select auth.uid())::text);
