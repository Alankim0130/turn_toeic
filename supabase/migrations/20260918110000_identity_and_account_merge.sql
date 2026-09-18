-- 이름·전화번호 확인과 계정 통합 (2026-09-18 Alan 요청)
--
-- "수강증 인증이 끝나면 바로 등록한 이름과 전화번호를 적도록 해줘 (동명이인 방지).
--  여러 계정을 만드는 것도 방지할 수 있을 것 같아. 계정 통합 안내가 나가면서 어떤 계정으로 통합할지 선택지를 주고,
--  통합하면 이전 계정에 있던 숙제 제출 내용들은 전부 새 계정으로 옮겨지도록."
--
-- Alan 확정 (2026-09-18, 네 가지 질문):
--   ① 본인 확인 — **옛 계정으로 로그인해야 통합된다.** 이름·전화번호만 맞으면 합쳐 주면
--      남의 이름·번호를 아는 사람이 그 학생의 기록을 가져간다. 그래서 **요청한 계정이 아닌 쪽에서 확인**해야 실행된다.
--   ② 옮길 것 — **학습 기록 전부** (숙제·스터디·특강·교재주문·문의·등록/반 배정·등업 기록).
--   ③ 옛 계정 — **로그인만 막고 보존** (`profiles.merged_into`). 지우지 않는다.
--   ④ 이름·전화번호 — 가입 때 이미 받으므로 **인증 직후 확인 화면**에서 다시 적어 맞는지 본다.
--
-- 이름은 학생이 못 바꾼다 (정책 "profiles: 본인·admin 수정" 과 같은 규칙) — 적은 이름이 가입 실명과 같은지 **확인만** 하고,
-- 바뀔 수 있는 전화번호만 저장한다. 다르면 스태프가 고친다.

-- ─── 1. profiles: 확인 시각과 통합 표시 ──────────────────────────────────────
alter table public.profiles
  add column if not exists identity_confirmed_at timestamptz,
  add column if not exists merged_into uuid references public.profiles (id) on delete set null;

comment on column public.profiles.identity_confirmed_at is
  '수강증 인증 뒤 학생이 이름·전화번호를 직접 확인한 시각 (동명이인 방지)';
comment on column public.profiles.merged_into is
  '이 계정이 통합되어 비워진 경우 남은 계정. null 이 아니면 로그인을 막는다 (기록은 보존)';

create index if not exists profiles_identity_idx
  on public.profiles (name, phone)
  where merged_into is null;

-- ─── 2. 통합 요청 ────────────────────────────────────────────────────────────
create table if not exists public.account_merge_requests (
  id           bigint generated always as identity primary key,
  -- 비워질 계정 (기록이 빠져나간다)
  from_user    uuid not null references public.profiles (id) on delete cascade,
  -- 남길 계정 (기록이 모인다)
  to_user      uuid not null references public.profiles (id) on delete cascade,
  -- 요청한 사람. **확인은 반대쪽 계정이 한다** (본인 확인 = 두 계정 모두 로그인할 수 있음)
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  moved        jsonb,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  constraint account_merge_requests_two_accounts check (from_user <> to_user)
);

create unique index if not exists account_merge_requests_pending_key
  on public.account_merge_requests (least(from_user, to_user), greatest(from_user, to_user))
  where status = 'pending';

alter table public.account_merge_requests enable row level security;

drop policy if exists "merge: 당사자 조회" on public.account_merge_requests;
create policy "merge: 당사자 조회" on public.account_merge_requests
  for select to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user or private.user_role() in ('instructor', 'admin'));

-- 쓰기는 아래 함수로만 한다 (authenticated 에게 insert·update 권한을 주지 않는다)
grant select on public.account_merge_requests to authenticated;

-- ─── 3. 이름·전화번호 확인 ───────────────────────────────────────────────────
create or replace function public.confirm_identity(p_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := regexp_replace(coalesce(p_name, ''), '\s', '', 'g');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_real  text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_phone !~ '^01[0-9]{8,9}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  select regexp_replace(p.name, '\s', '', 'g') into v_real
    from public.profiles p where p.id = v_uid for update;
  if v_real is null then
    raise exception 'no_profile' using errcode = '22023';
  end if;

  -- 이름은 여기서 바꾸지 않는다. 가입 실명과 같은지만 본다 (수강증 대조 기준이 가입 실명이다)
  if v_real <> v_name then
    raise exception 'name_mismatch' using errcode = '22023';
  end if;

  update public.profiles
     set phone = p_phone,
         identity_confirmed_at = now()
   where id = v_uid;
end;
$$;

revoke all on function public.confirm_identity(text, text) from public, anon;
grant execute on function public.confirm_identity(text, text) to authenticated, service_role;

-- ─── 4. 같은 사람으로 보이는 다른 계정 ───────────────────────────────────────
-- 이름(공백 무시) + 전화번호(숫자만)가 모두 같은 계정. 이메일은 가려서 돌려준다 —
-- 이름·전화번호만 아는 사람에게 남의 이메일을 그대로 보여 주지 않는다.
create or replace function public.merge_candidates()
returns table (user_id uuid, email_hint text, joined_at timestamptz, has_records boolean)
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
           or exists (select 1 from public.enrollment_orders e where e.user_id = o.id)
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

-- ─── 5. 통합 요청 만들기 ─────────────────────────────────────────────────────
-- p_other = 상대 계정, p_keep = 남길 계정 (둘 중 하나여야 한다)
create or replace function public.request_account_merge(p_other uuid, p_keep uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_from uuid;
  v_id   bigint;
  v_ok   boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_other is null or p_other = v_uid then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  if p_keep is distinct from v_uid and p_keep is distinct from p_other then
    raise exception 'invalid_keep' using errcode = '22023';
  end if;

  -- 같은 사람으로 보이는 계정인지 DB 가 다시 본다 (화면 값을 믿지 않는다)
  select exists (select 1 from public.merge_candidates() c where c.user_id = p_other) into v_ok;
  if not v_ok then
    raise exception 'not_a_candidate' using errcode = '22023';
  end if;

  v_from := case when p_keep = v_uid then p_other else v_uid end;

  delete from public.account_merge_requests r
   where r.status = 'pending'
     and least(r.from_user, r.to_user) = least(v_uid, p_other)
     and greatest(r.from_user, r.to_user) = greatest(v_uid, p_other);

  insert into public.account_merge_requests (from_user, to_user, requested_by)
  values (v_from, case when v_from = v_uid then p_other else v_uid end, v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.request_account_merge(uuid, uuid) from public, anon;
grant execute on function public.request_account_merge(uuid, uuid) to authenticated, service_role;

-- ─── 6. 실제 이동 ────────────────────────────────────────────────────────────
-- 한 트랜잭션에서 옮긴다. 이미 같은 것이 남길 계정에 있으면(같은 반 배정·같은 스터디 신청) 옮기지 않고 **지운다** —
-- 그대로 두면 죽은 계정이 정원을 계속 차지한다 (applied_count 트리거).
create or replace function private.merge_accounts(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  n int;
begin
  if p_from = p_to then
    raise exception 'same_account' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles p where p.id in (p_from, p_to) and (p.merged_into is not null or p.role in ('instructor', 'admin'))) then
    raise exception 'not_mergeable' using errcode = '22023';
  end if;

  -- 같은 반 배정이 이미 있으면 지우고, 없으면 옮긴다
  delete from public.enrollments e
   where e.student_id = p_from
     and exists (select 1 from public.enrollments t where t.student_id = p_to and t.section_id = e.section_id);
  update public.enrollments set student_id = p_to where student_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('enrollments', n);

  update public.enrollment_orders set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('enrollment_orders', n);

  update public.enrollment_verifications set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('verifications', n);

  update public.homework_submissions set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('homework', n);

  delete from public.study_signups s
   where s.user_id = p_from
     and exists (select 1 from public.study_signups t where t.user_id = p_to and t.study_id = s.study_id);
  update public.study_signups set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('study_signups', n);

  delete from public.lecture_signups l
   where l.user_id = p_from
     and exists (select 1 from public.lecture_signups t where t.user_id = p_to and t.lecture_id = l.lecture_id);
  update public.lecture_signups set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('lecture_signups', n);

  update public.textbook_orders set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('textbook_orders', n);

  update public.contact_messages set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('contacts', n);

  -- 남긴 계정의 등급을 등록에 맞춘다 (상태 전이 배치와 같은 규칙)
  update public.profiles p
     set role = 'student'
   where p.id = p_to
     and p.role in ('member', 'alumni')
     and exists (select 1 from public.enrollment_orders o where o.user_id = p_to and o.status = 'active');

  -- 비워진 계정: 로그인만 막고 보존한다
  update public.profiles
     set merged_into = p_to
   where id = p_from;

  return v;
end;
$$;

revoke all on function private.merge_accounts(uuid, uuid) from public, anon, authenticated;

-- ─── 7. 통합 확인 (반대쪽 계정이 누른다) ─────────────────────────────────────
create or replace function public.confirm_account_merge(p_request bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r     public.account_merge_requests%rowtype;
  v     jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into r from public.account_merge_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
  -- **요청한 계정은 확인할 수 없다.** 두 계정 모두에 로그인할 수 있어야 통합된다 (Alan 확정 ①)
  if v_uid = r.requested_by or v_uid not in (r.from_user, r.to_user) then
    raise exception 'not_the_other_account' using errcode = '42501';
  end if;

  v := private.merge_accounts(r.from_user, r.to_user);

  update public.account_merge_requests
     set status = 'done', decided_at = now(), moved = v
   where id = r.id;

  return v;
end;
$$;

revoke all on function public.confirm_account_merge(bigint) from public, anon;
grant execute on function public.confirm_account_merge(bigint) to authenticated, service_role;

-- 요청 취소 (양쪽 다 가능)
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
     and r.status = 'pending'
     and v_uid in (r.from_user, r.to_user);
  if not found then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.cancel_account_merge(bigint) from public, anon;
grant execute on function public.cancel_account_merge(bigint) to authenticated, service_role;
