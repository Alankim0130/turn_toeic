-- 학생명단에 계정 정보 (2026-09-18 Alan 요청 — "접속된 이메일, 로그인방식, 최근접속날짜")
--
-- 이메일 · 로그인 방식 · 마지막 접속은 전부 auth 스키마에 있고 앱에서는 못 읽는다
-- (authenticated 에 auth.users 조회 권한이 없다 — 그래야 학생이 남의 이메일을 읽지 못한다).
-- 그래서 **스태프만 부를 수 있는 security definer 함수**로 필요한 네 칸만 꺼낸다.
-- 서비스 롤로 전체 사용자 목록을 받아 오는 길(auth.admin.listUsers)은 쓰지 않는다 —
-- 화면에 안 쓰는 계정까지 통째로 들고 오게 되고, 한 번에 받을 수 있는 수에 상한이 있다.
--
-- 로그인 방식은 auth.identities 에서 읽는다 (한 계정에 이메일 + 구글이 함께 붙을 수 있다).
-- 행이 없는 옛 계정은 app_metadata 의 provider 로 대신한다.

create or replace function public.student_auth_info(p_ids uuid[])
returns table (
  user_id         uuid,
  email           text,
  providers       text[],
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- 조교는 학생명단을 못 본다 (requireStaff 와 같은 집합)
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
         u.last_sign_in_at
    from auth.users u
   where u.id = any(p_ids);
end;
$$;

comment on function public.student_auth_info(uuid[]) is
  '학생명단용 계정 정보 (이메일·로그인 방식·마지막 접속). 스태프만.';

revoke all on function public.student_auth_info(uuid[]) from public;
grant execute on function public.student_auth_info(uuid[]) to authenticated;
