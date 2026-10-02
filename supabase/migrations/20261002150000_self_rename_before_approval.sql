-- ============================================================================
-- 이름을 잘못 적은 학생에게 고칠 기회를 (2026-10-02 Alan 요청)
--
--  "학생이 실수로 이름을 잘못 기입하니깐 바로 반려를 시켜버리는데, 수정의 기회를 주면 좋겠어.
--   추가적으로 학생이 '내 정보' 수정을 할 수 있는 공간이 없는 것 같아. 하나 있으면 좋을 것 같아."
--
--  * 지금까지 실명은 학생이 못 바꿨다 (정책 "profiles: 본인·스태프·조교 수정" 의 name = my_profile_name()).
--    수강증 대조(G3)의 기준이라서다. 그런데 가입할 때 오타를 내면 수강증 이름과 달라 자동 등업이 막히고,
--    이름·전화번호 확인(confirm_identity)도 name_mismatch 로 튕겨 "선생님께 문의" 말고는 길이 없었다.
--  * 규칙: **그 이름으로 등업이 된 적이 없을 때까지만 본인이 고친다** (private.can_rename_self).
--    승인된 수강증이나 등록(enrollment_orders)이 하나라도 생기면 잠긴다 — 그 뒤에는 스태프만 고친다.
--    등업 전 오타는 바로잡아도 잃을 것이 없고, 등업 뒤에 이름을 바꾸면 남의 수강증으로 다음 달 등업을 받을 수 있다.
--  * 스태프 계정은 못 바꾼다 (강사 이름은 예약·고정). 아직 아무도 쓰지 않은 예약 강사 이름으로도 못 바꾼다.
--  * 정책은 그대로 둔다. security definer 함수 둘로만 연다 — public.rename_myself(이름, /my/profile 내 정보) 와
--    public.confirm_identity(이름·전화번호 확인 — 이름이 다르면 고칠 수 있을 때 고친다).
-- ============================================================================

-- ─── 1. 본인이 이름을 고칠 수 있는가 ─────────────────────────────────────────────────────
create or replace function private.can_rename_self(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.profiles p
            where p.id = p_uid
              and p.merged_into is null
              and p.role in ('guest', 'member', 'student', 'alumni'))
     and not exists (select 1 from public.enrollment_orders o where o.user_id = p_uid)
     and not exists (select 1 from public.enrollment_verifications v where v.user_id = p_uid and v.result = 'approved')
$$;

revoke all on function private.can_rename_self(uuid) from public, anon, authenticated;

comment on function private.can_rename_self(uuid) is
  '본인이 실명을 고칠 수 있는가 — 승인된 수강증·등록이 없는 학생 계정만 (2026-10-02). 등업 뒤에는 스태프가 고친다';

create or replace function public.can_rename_self()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_rename_self(auth.uid())
$$;

revoke all on function public.can_rename_self() from public, anon;
grant execute on function public.can_rename_self() to authenticated, service_role;

-- 이름 정리: 앞뒤 공백을 떼고 안쪽 공백은 하나로 (대조는 공백을 무시하지만 저장은 보기 좋게)
create or replace function private.clean_name(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')
$$;

-- ─── 2. 내 정보에서 이름 고치기 ─────────────────────────────────────────────────────────
create or replace function public.rename_myself(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_new text := private.clean_name(p_name);
  v_key text := regexp_replace(private.clean_name(p_name), '\s', '', 'g');
  v_old text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(v_key) < 2 or char_length(v_new) > 20 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  select p.name into v_old from public.profiles p where p.id = v_uid for update;
  if v_old is null then
    raise exception 'no_profile' using errcode = '22023';
  end if;
  if regexp_replace(v_old, '\s', '', 'g') = v_key then
    return jsonb_build_object('renamed', false, 'name', v_old);
  end if;

  if not private.can_rename_self(v_uid) then
    raise exception 'name_locked' using errcode = '22023';
  end if;
  -- 아직 아무도 쓰지 않은 예약 강사 이름은 받지 않는다 (등급은 가입 때만 주지만, 이름이 겹치면 명단이 헷갈린다)
  if exists (select 1 from private.reserved_staff r where r.name = v_key and r.claimed_by is null) then
    raise exception 'reserved_name' using errcode = '22023';
  end if;

  update public.profiles set name = v_new where id = v_uid;
  return jsonb_build_object('renamed', true, 'from', v_old, 'to', v_new);
end;
$$;

revoke all on function public.rename_myself(text) from public, anon;
grant execute on function public.rename_myself(text) to authenticated, service_role;

comment on function public.rename_myself(text) is
  '학생이 내 정보(/my/profile)에서 실명을 고친다. 승인된 수강증·등록이 생기면 name_locked (2026-10-02 Alan: 오타를 고칠 기회)';

-- ─── 3. 이름·전화번호 확인: 이름이 다르면 (고칠 수 있을 때) 고친다 ───────────────────────────
-- 반환값이 바뀌어(void → jsonb) 지우고 다시 만든다. 화면은 renamed 를 보고 "이름을 고쳤어요" 를 말한다
drop function if exists public.confirm_identity(text, text);

create function public.confirm_identity(p_name text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_new     text := private.clean_name(p_name);
  v_key     text := regexp_replace(private.clean_name(p_name), '\s', '', 'g');
  v_phone   text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_old     text;
  v_renamed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_phone !~ '^01[0-9]{8,9}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if char_length(v_key) < 2 or char_length(v_new) > 20 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  select p.name into v_old from public.profiles p where p.id = v_uid for update;
  if v_old is null then
    raise exception 'no_profile' using errcode = '22023';
  end if;

  -- 가입 실명과 다르다: 등업 전이면 적은 이름으로 고친다 (오타를 고칠 기회). 등업 뒤에는 그대로 name_mismatch
  if regexp_replace(v_old, '\s', '', 'g') <> v_key then
    if not private.can_rename_self(v_uid) then
      raise exception 'name_mismatch' using errcode = '22023';
    end if;
    if exists (select 1 from private.reserved_staff r where r.name = v_key and r.claimed_by is null) then
      raise exception 'reserved_name' using errcode = '22023';
    end if;
    v_renamed := true;
  end if;

  -- 전화번호는 숫자만 저장한다 (가입 폼과 같은 모양 — 예전에는 적은 그대로 들어가 하이픈이 섞였다)
  update public.profiles
     set name = case when v_renamed then v_new else name end,
         phone = v_phone,
         identity_confirmed_at = now()
   where id = v_uid;

  return jsonb_build_object('renamed', v_renamed, 'from', v_old, 'to', case when v_renamed then v_new else v_old end);
end;
$$;

revoke all on function public.confirm_identity(text, text) from public, anon;
grant execute on function public.confirm_identity(text, text) to authenticated, service_role;

comment on function public.confirm_identity(text, text) is
  '수강증 인증 뒤 이름·전화번호 확인. 이름이 가입 실명과 다르면 등업 전(can_rename_self)에는 고치고, 등업 뒤에는 name_mismatch (2026-10-02)';
