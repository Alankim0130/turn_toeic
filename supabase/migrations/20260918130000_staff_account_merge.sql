-- 관리자 화면에서 강사가 직접 계정 합치기 (2026-09-18 Alan 요청)
--
-- 학생 스스로 합치는 길(마이그레이션 20260918110000)은 **두 계정 모두에 로그인**해야 한다.
-- 그런데 학생이 옛 계정의 비밀번호를 잊거나 옛 계정의 소셜 로그인을 못 쓰는 경우가 있다.
-- 그때는 강사가 두 사람이 같은 사람인지 확인하고 직접 합친다 — 학생 확인 절차 없이.
--
-- 이동 규칙은 학생 쪽과 **같은 함수**(private.merge_accounts)를 쓴다. 옮길 것이 바뀌면 그 함수 한 곳만 고친다.
-- 기록은 account_merge_requests 에 status = 'done' · requested_by = 처리한 스태프로 남는다 (누가 합쳤는지 남긴다).

-- ─── 같은 사람으로 보이는 계정 (스태프용) ────────────────────────────────────
-- 학생용(public.merge_candidates)은 이름 **과** 전화번호가 모두 같아야 하지만,
-- 스태프용은 **이름이 같거나 전화번호가 같으면** 보여 준다 — 번호를 잘못 적어 계정이 갈린 경우를 찾아야 한다.
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
  has_records boolean
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
    from target t
    join public.profiles o
      on o.id <> t.id
     and o.merged_into is null
     and o.role not in ('instructor', 'admin')
    left join auth.users u on u.id = o.id
   where regexp_replace(o.name, '\s', '', 'g') = t.name_key
      or (t.phone_key <> '' and regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g') = t.phone_key)
   order by o.created_at;
end;
$$;

revoke all on function public.staff_merge_candidates(uuid) from public, anon;
grant execute on function public.staff_merge_candidates(uuid) to authenticated, service_role;

-- ─── 스태프가 바로 합치기 ────────────────────────────────────────────────────
create or replace function public.staff_merge_accounts(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'invalid_pair' using errcode = '22023';
  end if;

  -- 이동 규칙은 학생 쪽과 같다 (스태프·이미 합쳐진 계정은 이 함수가 거부한다)
  v := private.merge_accounts(p_from, p_to);

  insert into public.account_merge_requests (from_user, to_user, requested_by, status, moved, decided_at)
  values (p_from, p_to, auth.uid(), 'done', v, now());

  return v;
end;
$$;

revoke all on function public.staff_merge_accounts(uuid, uuid) from public, anon;
grant execute on function public.staff_merge_accounts(uuid, uuid) to authenticated, service_role;
