-- ============================================================================
-- 계정 합치기 — 최근 로그인 표시 · 학생이 남길 계정 고르기 / 승인 뒤 남은 수강증 닫기 (2026-10-02 Alan 요청)
--
--  "학생이 실수로 잘못 올려서 반려가 되었는데, 뒤에 다시 제대로 올려서 승인이 되고 나면, 수동처리 목록에서 빼주면 좋겠어.
--   계정 합치기를 하려고 하니, 가장 최근 로그인으로 해야 하는데 어느 계정이 최근 로그인 계정인지 알 수가 없어. 표시를 해주면 좋겠어.
--   두 개의 계정이 파악되고 나면 학생이 직접 어느 계정을 남길 것인지 선택할 수 있도록 하는 게 가장 좋은 방법인 것 같아."
--
--  1. 수강증 결과에 **닫힘(closed)** 을 더한다. 승인이 끝난 학생의 남은 검토 대기 건(같은 수강증을 또 올린 것)은 반려가 아니라
--     "다른 수강증이 승인돼 닫음" 이다. 닫는 쪽은 앱(approveVerificationWith · submitVerification)이고, 여기서는 값만 열고
--     이미 승인 뒤 같은 수강증을 또 올려 쌓여 있던 것을 한 번 닫는다. 다음 달 수강증(hold)과 "반이 달라요" 정정 요청(correctionOf)은 두지 않는다.
--  2. 통합 요청에 **학생 선택(choice)** 상태. 스태프가 두 계정이 같은 사람임을 확인하고 `staff_request_merge_choice` 로 보내면
--     두 계정 모두에 알림(student_messages, kind merge_choice)이 가고, 학생이 **어느 계정에서든** `choose_merge_account` 로 남길 계정을 고르면
--     그 자리에서 합쳐진다. 학생 흐름(두 계정 모두 로그인)과 달리 스태프가 같은 사람임을 보증했으므로 한쪽 로그인으로 충분하다.
--  3. 후보 목록에 **로그인 방법 · 최근 로그인**(auth.users.last_sign_in_at)을 함께 준다 — 학생이 실제로 쓰는 계정을 고를 수 있게.
-- ============================================================================

-- ─── 1. 수강증 결과 closed ───────────────────────────────────────────────────────────────
alter table public.enrollment_verifications drop constraint if exists enrollment_verifications_result_check;
alter table public.enrollment_verifications
  add constraint enrollment_verifications_result_check check (result in ('approved', 'rejected', 'closed'));

comment on column public.enrollment_verifications.result is
  'approved | rejected | closed(다른 수강증이 승인돼 닫음 — 반려가 아니다, 2026-10-02) | null(검토 대기)';

-- 승인된 뒤 같은 수강증을 또 올려 검토 대기에 쌓여 있던 것 (blockers 에 already_enrolled + decided_before)
update public.enrollment_verifications v
   set result = 'closed',
       reject_reason = '이미 같은 수강증으로 승인돼 있어 닫았어요'
 where v.result is null
   and (v.candidates ->> 'hold') is null
   and (v.candidates ->> 'correctionOf') is null
   and (v.candidates -> 'blockers') ? 'already_enrolled'
   and (v.candidates -> 'blockers') ? 'decided_before'
   and exists (select 1 from public.enrollment_verifications a
                where a.user_id = v.user_id and a.result = 'approved' and a.created_at < v.created_at);

-- ─── 2. 통합 요청: 학생 선택(choice) 상태 ───────────────────────────────────────────────────
alter table public.account_merge_requests drop constraint if exists account_merge_requests_status_check;
alter table public.account_merge_requests
  add constraint account_merge_requests_status_check check (status in ('pending', 'choice', 'done', 'cancelled'));

drop index if exists public.account_merge_requests_pending_key;
create unique index account_merge_requests_pending_key
  on public.account_merge_requests (least(from_user, to_user), greatest(from_user, to_user))
  where status in ('pending', 'choice');

comment on column public.account_merge_requests.status is
  'pending(학생이 신청, 반대쪽 계정이 확인) | choice(스태프가 보내고 학생이 남길 계정을 고른다, 2026-10-02) | done | cancelled';

-- 알림 종류 merge_choice
alter table public.student_messages drop constraint if exists student_messages_kind_check;
alter table public.student_messages
  add constraint student_messages_kind_check
  check (kind in ('general', 'study_checkin', 'homework_checked', 'live_start', 'contact_reply', 'attendance', 'merge_choice'));

-- ─── 3. 로그인 방법 (학생명단의 student_auth_info 와 같은 규칙) ────────────────────────────
create or replace function private.login_providers(p_uid uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select array_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id = p_uid),
    case when coalesce(u.raw_app_meta_data ->> 'provider', '') <> '' then array[u.raw_app_meta_data ->> 'provider'] else array[]::text[] end
  )
  from auth.users u where u.id = p_uid
$$;
revoke all on function private.login_providers(uuid) from public, anon, authenticated;

-- ─── 4. 학생 후보: 로그인 방법 · 최근 로그인 추가 (반환 칸이 늘어 지우고 다시 만든다) ────────────
drop function if exists public.merge_candidates();
create function public.merge_candidates()
returns table (user_id uuid, email_hint text, joined_at timestamptz, has_records boolean, providers text[], last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id,
           regexp_replace(p.name, '\s', '', 'g')    as name_key,
           regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') as phone_key
      from public.profiles p
     where p.id = auth.uid()
       and p.merged_into is null
       and p.identity_confirmed_at is not null
       and p.role not in ('instructor', 'admin')
  )
  select o.id,
         case when u.email is null or position('@' in u.email) < 2 then '비공개'
              else left(u.email, 2) || '***@' || split_part(u.email, '@', 2) end,
         o.created_at,
         exists (select 1 from public.homework_submissions h where h.user_id = o.id)
           or exists (select 1 from public.enrollment_orders e where e.user_id = o.id),
         private.login_providers(o.id),
         u.last_sign_in_at
    from me
    join public.profiles o
      on o.id <> me.id
     and o.merged_into is null
     and o.role not in ('instructor', 'admin')
     and regexp_replace(o.name, '\s', '', 'g') = me.name_key
     and regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g') = me.phone_key
     and me.phone_key <> ''
    left join auth.users u on u.id = o.id
   order by o.created_at;
$$;
revoke all on function public.merge_candidates() from public, anon;
grant execute on function public.merge_candidates() to authenticated, service_role;

-- ─── 5. 스태프 후보: 로그인 방법 · 최근 로그인 추가 (20261002110000 의 스태프 짝 규칙은 그대로) ───
drop function if exists public.staff_merge_candidates(uuid);
create function public.staff_merge_candidates(p_user uuid)
returns table (
  user_id    uuid,
  name       text,
  phone      text,
  email_hint text,
  joined_at  timestamptz,
  role       text,
  same_name  boolean,
  same_phone boolean,
  has_records boolean,
  providers  text[],
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with target as (
    select p.id,
           p.role in ('instructor', 'admin') as is_staff,
           regexp_replace(p.name, '\s', '', 'g') as name_key,
           regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') as phone_key
      from public.profiles p
     where p.id = p_user
  )
  select o.id,
         o.name,
         o.phone,
         case when u.email is null or position('@' in u.email) < 2 then '비공개'
              else left(u.email, 2) || '***@' || split_part(u.email, '@', 2) end,
         o.created_at,
         o.role::text,
         regexp_replace(o.name, '\s', '', 'g') = t.name_key,
         t.phone_key <> '' and regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g') = t.phone_key,
         exists (select 1 from public.homework_submissions h where h.user_id = o.id)
           or exists (select 1 from public.enrollment_orders e where e.user_id = o.id)
           or exists (select 1 from public.class_sections c where c.instructor_id = o.id),
         private.login_providers(o.id),
         u.last_sign_in_at
    from target t
    join public.profiles o
      on o.id <> t.id
     and o.merged_into is null
     and ((o.role in ('instructor', 'admin')) = t.is_staff)
    left join auth.users u on u.id = o.id
   where regexp_replace(o.name, '\s', '', 'g') = t.name_key
      or (t.phone_key <> '' and regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g') = t.phone_key)
   order by o.created_at;
end;
$$;
revoke all on function public.staff_merge_candidates(uuid) from public, anon;
grant execute on function public.staff_merge_candidates(uuid) to authenticated, service_role;

-- ─── 6. 스태프: 학생이 남길 계정을 고르게 보낸다 ───────────────────────────────────────────
create or replace function public.staff_request_merge_choice(p_a uuid, p_b uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_id   bigint;
  v_name text;
  v_ok   boolean;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'invalid_pair' using errcode = '22023';
  end if;
  -- 학생 계정 둘이어야 한다 (학생은 스태프 계정을 합칠 수 없다). 이름이나 전화번호가 같아야 한다 — 후보 규칙 그대로
  select exists (
           select 1 from public.staff_merge_candidates(p_a) c
            where c.user_id = p_b and c.role not in ('instructor', 'admin'))
     and not exists (select 1 from public.profiles p where p.id = p_a and p.role in ('instructor', 'admin'))
    into v_ok;
  if not v_ok then
    raise exception 'not_a_candidate' using errcode = '22023';
  end if;

  delete from public.account_merge_requests r
   where r.status in ('pending', 'choice')
     and least(r.from_user, r.to_user) = least(p_a, p_b)
     and greatest(r.from_user, r.to_user) = greatest(p_a, p_b);

  insert into public.account_merge_requests (from_user, to_user, requested_by, status)
  values (p_a, p_b, v_uid, 'choice')
  returning id into v_id;

  -- 두 계정 모두에 알림 — 어느 쪽으로 로그인해도 고를 수 있다
  select coalesce(p.name, '') into v_name from public.profiles p where p.id = v_uid;
  insert into public.student_messages (user_id, sender_id, sender_name, title, body, kind, related)
  select u, v_uid, v_name,
         '계정이 두 개 있어요 — 남길 계정을 골라 주세요',
         '같은 사람의 계정이 두 개 확인됐어요. 남길 계정을 고르면 숙제 · 스터디 · 특강 신청 · 교재주문 · 수강 기록이 그 계정으로 모두 옮겨지고, 다른 계정은 기록을 보존한 채 로그인만 막혀요. 지금 로그인한 계정에서 바로 고를 수 있어요.',
         'merge_choice',
         jsonb_build_object('mergeRequest', v_id)
    from unnest(array[p_a, p_b]) as u;

  return v_id;
end;
$$;
revoke all on function public.staff_request_merge_choice(uuid, uuid) from public, anon;
grant execute on function public.staff_request_merge_choice(uuid, uuid) to authenticated, service_role;

-- ─── 7. 고르는 화면이 볼 두 계정의 정보 ────────────────────────────────────────────────────
create or replace function public.merge_choice_info(p_request bigint)
returns table (user_id uuid, name text, email_hint text, providers text[], last_sign_in_at timestamptz, joined_at timestamptz, has_records boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.account_merge_requests%rowtype;
begin
  select * into r from public.account_merge_requests where id = p_request;
  if not found or r.status <> 'choice' then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
  if auth.uid() not in (r.from_user, r.to_user) and not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select p.id,
         p.name,
         case when u.email is null or position('@' in u.email) < 2 then '비공개'
              else left(u.email, 2) || '***@' || split_part(u.email, '@', 2) end,
         private.login_providers(p.id),
         u.last_sign_in_at,
         p.created_at,
         exists (select 1 from public.homework_submissions h where h.user_id = p.id)
           or exists (select 1 from public.enrollment_orders e where e.user_id = p.id)
    from public.profiles p
    left join auth.users u on u.id = p.id
   where p.id in (r.from_user, r.to_user)
   order by p.created_at;
end;
$$;
revoke all on function public.merge_choice_info(bigint) from public, anon;
grant execute on function public.merge_choice_info(bigint) to authenticated, service_role;

-- ─── 8. 학생이 남길 계정을 고른다 → 그 자리에서 합친다 ───────────────────────────────────────
create or replace function public.choose_merge_account(p_request bigint, p_keep uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  r       public.account_merge_requests%rowtype;
  v_other uuid;
  v       jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into r from public.account_merge_requests where id = p_request for update;
  if not found or r.status <> 'choice' then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
  if v_uid not in (r.from_user, r.to_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_keep is null or p_keep not in (r.from_user, r.to_user) then
    raise exception 'invalid_keep' using errcode = '22023';
  end if;

  v_other := case when p_keep = r.from_user then r.to_user else r.from_user end;
  -- 학생 규칙으로 옮긴다 (스태프 계정은 거부된다)
  v := private.merge_accounts(v_other, p_keep);

  update public.account_merge_requests
     set from_user = v_other, to_user = p_keep, status = 'done', decided_at = now(), moved = v
   where id = r.id;

  return jsonb_build_object('kept', p_keep, 'moved', v);
end;
$$;
revoke all on function public.choose_merge_account(bigint, uuid) from public, anon;
grant execute on function public.choose_merge_account(bigint, uuid) to authenticated, service_role;

-- ─── 9. 취소: 당사자뿐 아니라 스태프도, 학생 선택 중인 것도 ───────────────────────────────
create or replace function public.cancel_account_merge(p_request bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  update public.account_merge_requests r
     set status = 'cancelled', decided_at = now()
   where r.id = p_request
     and r.status in ('pending', 'choice')
     and (v_uid in (r.from_user, r.to_user) or private.is_admin());
  if not found then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.cancel_account_merge(bigint) from public, anon;
grant execute on function public.cancel_account_merge(bigint) to authenticated, service_role;
