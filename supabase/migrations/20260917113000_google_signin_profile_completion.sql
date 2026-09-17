-- ============================================================================
-- 구글 로그인 (2026-09-17 Alan 요청 "구글 이메일 로그인을 만들고 싶어")
--
--  * 구글 계정으로 처음 들어오면 auth.users 는 생기지만 **실명·휴대폰이 없다.**
--    구글이 넣어 주는 raw_user_meta_data.name 은 구글 표시 이름(닉네임·영문)이라 수강증 대조 실명(G3)으로 쓸 수 없다.
--  * 그래서 가입 트리거는 **우리 가입 폼이 보낸 메타데이터만 믿는다** (app_metadata.provider = 'email').
--    외부 로그인은 이름을 비운 채 회원(member)으로 만들고, 앱이 /signup/complete 로 보내 본인이 한 번 채운다.
--  * 채우는 일은 public.complete_profile() 이 한다 — 이름은 **비어 있을 때 한 번만** 정할 수 있고 그 뒤에는
--    정책 "profiles: 본인·admin 수정" 이 그대로 잠근다 (이름 = 수강증 대조 키). 예약된 강사 이름
--    (private.reserved_staff)은 이때도 가입 트리거와 똑같이 잡는다 — 가입 방법이 달라도 규칙은 하나다.
--  * 같은 이메일로 이미 이메일 가입한 사람이 구글로 들어오면 Supabase 가 같은 계정에 붙인다(자동 연결).
--    profiles 는 그대로라 여기 손댈 것이 없다.
-- ============================================================================

-- ─── 가입 트리거: 외부 로그인(구글)은 메타데이터를 믿지 않는다 ─────────────
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 우리 가입 폼(이메일·비밀번호)이 보낸 값만 믿는다. 구글 같은 외부 로그인은 provider 가 다르고
  -- name 이 구글 표시 이름이라 실명이 아니다 → 이름을 비워 두고 /signup/complete 에서 채운다
  v_own     boolean := coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'email';
  v_meta    jsonb := case when v_own then coalesce(new.raw_user_meta_data, '{}'::jsonb) else '{}'::jsonb end;
  v_name    text := coalesce(nullif(btrim(v_meta ->> 'name'), ''), '');
  v_role    public.user_role;
  v_subject text;
begin
  -- 예약된 강사 이름이면 그 등급·과목을 준다. 잡는 즉시 잠기므로 한 사람만 받는다
  if v_name <> '' then
    update private.reserved_staff r
       set claimed_by = new.id, claimed_at = now()
     where r.name = v_name
       and r.claimed_by is null
    returning r.role, r.subject into v_role, v_subject;
  end if;

  insert into public.profiles (id, name, phone, role, subject, university, department, gender)
  values (
    new.id,
    v_name,
    nullif(btrim(v_meta ->> 'phone'), ''),
    coalesce(v_role, 'member'),
    v_subject,
    nullif(btrim(v_meta ->> 'university'), ''),
    nullif(btrim(v_meta ->> 'department'), ''),
    case
      when v_meta ->> 'gender' in ('male', 'female', 'other', 'undisclosed')
        then v_meta ->> 'gender'
      else null
    end
  );
  return new;
end;
$$;

comment on function private.handle_new_user() is
  '가입하면 profiles 를 만든다. 우리 가입 폼(provider=email)의 메타데이터만 믿고, 구글 등 외부 로그인은 이름을 비워 '
  '/signup/complete 에서 채우게 한다. private.reserved_staff 에 예약된 이름이면 그 등급·과목으로 시작한다 (2026-09-17)';

-- ─── 가입 정보 채우기: 구글로 들어온 회원이 실명·휴대폰을 한 번 적는다 ─────
create or replace function public.complete_profile(
  p_name       text,
  p_phone      text,
  p_university text default null,
  p_department text default null,
  p_gender     text default 'undisclosed'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_name      text := btrim(coalesce(p_name, ''));
  v_phone     text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_gender    text := coalesce(nullif(btrim(p_gender), ''), 'undisclosed');
  v_exists    boolean;
  v_cur_name  text;
  v_cur_phone text;
  v_role      public.user_role;
  v_subject   text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_phone !~ '^01[0-9]{8,9}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if v_gender not in ('male', 'female', 'other', 'undisclosed') then
    raise exception 'invalid_gender' using errcode = '22023';
  end if;

  -- 행을 잠근다 — 두 번 눌러도 예약을 한 번만 잡는다
  select p.name, p.phone
    into v_cur_name, v_cur_phone
    from public.profiles p
   where p.id = v_uid
     for update;
  v_exists := found;

  if v_exists and v_cur_name <> '' and v_cur_phone is not null then
    raise exception 'already_completed' using errcode = '22023';
  end if;

  -- 이름은 비어 있을 때만 정한다 (정책 "profiles: 본인·admin 수정" 과 같은 규칙). 이미 있으면 그대로 두고 나머지만 채운다
  if v_exists and v_cur_name <> '' then
    v_name := v_cur_name;
  else
    -- 예약된 강사 이름이면 가입 트리거와 똑같이 그 등급·과목을 준다
    update private.reserved_staff r
       set claimed_by = v_uid, claimed_at = now()
     where r.name = v_name
       and r.claimed_by is null
    returning r.role, r.subject into v_role, v_subject;
  end if;

  if v_exists then
    update public.profiles p
       set name       = v_name,
           phone      = v_phone,
           university = nullif(btrim(p_university), ''),
           department = nullif(btrim(p_department), ''),
           gender     = v_gender,
           role       = coalesce(v_role, p.role),
           subject    = coalesce(v_subject, p.subject)
     where p.id = v_uid;
  else
    -- 가입 트리거가 행을 못 만든 계정의 복구 경로 (정상 흐름에서는 오지 않는다)
    insert into public.profiles (id, name, phone, role, subject, university, department, gender)
    values (
      v_uid, v_name, v_phone, coalesce(v_role, 'member'), v_subject,
      nullif(btrim(p_university), ''), nullif(btrim(p_department), ''), v_gender
    );
  end if;
end;
$$;

revoke all on function public.complete_profile(text, text, text, text, text) from public, anon;
grant execute on function public.complete_profile(text, text, text, text, text) to authenticated, service_role;

comment on function public.complete_profile(text, text, text, text, text) is
  '구글 등 외부 로그인으로 들어온 회원이 실명·휴대폰·대학·학과·성별을 한 번 채운다. 이름은 비어 있을 때만 정해지고 '
  '(그 뒤에는 정책이 잠근다), 예약된 강사 이름이면 가입 트리거와 같이 그 등급·과목을 준다 (2026-09-17)';
