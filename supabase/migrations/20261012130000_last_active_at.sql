-- ============================================================================
-- 마지막 접속 = 마지막 로그인이 아니라 **마지막으로 사이트를 쓴 때** (2026-10-12 Alan — "혜영쌤이 매일 들어오는데 접속시기가 4일전으로 나오고,
-- 다른 학생들도 뭔가 이상해. 실시간으로 제대로 작동하도록")
--
-- 지금까지 auth.users.last_sign_in_at 을 보여 줬다 — 이 값은 **새로 로그인할 때만** 바뀐다. 홈 화면 앱 · 브라우저에 로그인이 남아 있는 학생은
-- 매일 들어와도 로그인을 다시 하지 않고 접속 토큰만 갱신하므로(1시간마다) 며칠 전 값이 그대로 선다.
-- 토큰을 갱신하면 auth.sessions.refreshed_at(· updated_at)이 바뀌고 auth.refresh_tokens 에 새 줄이 생긴다 — 그 가운데 가장 늦은 때가 마지막 접속이다.
--  * private.last_active_at(계정) = greatest(last_sign_in_at, 세션의 refreshed_at · updated_at · created_at, 갱신 토큰의 created_at · updated_at).
--    로그아웃하면 세션 · 토큰 줄이 지워져 last_sign_in_at 로 돌아간다. 정확도는 토큰 수명(1시간) 안 — "오늘 · 어제 · N일 전" 에는 충분하다.
--  * 학생명단 · 학생 관리(student_auth_info) · 계정 합치기 후보 셋(merge_candidates · staff_merge_candidates · merge_choice_info)의
--    last_sign_in_at 칸이 이 값을 돌려준다 (칸 이름은 그대로 — 앱이 그 이름으로 읽는다).
--  * public.my_last_active_at() — 내 계정의 값 (계정 합치기 화면이 "내 계정" 줄에 쓴다. 그전에는 로그인 서버의 last_sign_in_at).
-- ============================================================================

create or replace function private.last_active_at(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    (select u.last_sign_in_at from auth.users u where u.id = p_user),
    (select max(greatest(s.refreshed_at, s.updated_at, s.created_at)) from auth.sessions s where s.user_id = p_user),
    (select max(greatest(t.created_at, t.updated_at)) from auth.refresh_tokens t where t.user_id = p_user::text)
  )
$$;
comment on function private.last_active_at(uuid) is
  '마지막으로 사이트를 쓴 때 — 로그인 · 세션 갱신 · 토큰 갱신 중 가장 늦은 시각 (2026-10-12). last_sign_in_at 은 새로 로그인할 때만 바뀐다';
revoke all on function private.last_active_at(uuid) from public, anon, authenticated;

create or replace function public.my_last_active_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select private.last_active_at(auth.uid())
$$;
comment on function public.my_last_active_at() is '내 계정의 마지막 접속 (private.last_active_at) — 계정 합치기 화면';
revoke all on function public.my_last_active_at() from public, anon;
grant execute on function public.my_last_active_at() to authenticated, service_role;

-- ─── 아래 넷은 20261002170000 · 20261003100000 의 정의 그대로이고 u.last_sign_in_at 만 private.last_active_at(u.id) 로 바꿨다 ───
create or replace function public.merge_candidates()
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
         private.last_active_at(u.id)
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

create or replace function public.staff_merge_candidates(p_user uuid)
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
         private.last_active_at(u.id)
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
         private.last_active_at(u.id),
         p.created_at,
         exists (select 1 from public.homework_submissions h where h.user_id = p.id)
           or exists (select 1 from public.enrollment_orders e where e.user_id = p.id)
    from public.profiles p
    left join auth.users u on u.id = p.id
   where p.id in (r.from_user, r.to_user)
   order by p.created_at;
end;
$$;

create or replace function public.student_auth_info(p_ids uuid[])
returns table (user_id uuid, email text, providers text[], last_sign_in_at timestamptz, avatar_url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- 학생명단 · 학생 관리 전용 — 둘 다 강사 · 관리자 화면이다 (2026-10-03 조교 제외)
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select u.id,
         u.email::text,
         coalesce(
           (select array_agg(distinct i.provider order by i.provider)
              from auth.identities i
             where i.user_id = u.id),
           case
             when coalesce(u.raw_app_meta_data ->> 'provider', '') <> ''
               then array[u.raw_app_meta_data ->> 'provider']
             else array[]::text[]
           end
         ),
         private.last_active_at(u.id),
         coalesce(nullif(u.raw_user_meta_data ->> 'avatar_url', ''), nullif(u.raw_user_meta_data ->> 'picture', ''))
    from auth.users u
   where u.id = any(p_ids);
end;
$$;
