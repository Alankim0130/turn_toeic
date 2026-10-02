-- ============================================================================
-- 프로필 사진 (2026-10-02 Alan 요청)
--
--  "카카오톡 로그인할 때 프로필 사진도 같이 가지고 오는 걸로 되어 있는데, 지금 프사를 가지고 온 프로필이 하나도 없어.
--   강사는 프로필 사진을 클릭했을 때 큰 화면으로 보도록, 학생·조교는 클릭이 안 되도록.
--   학생 개인이 프로필 사진을 설정할 수 있도록."
--
--  * 카카오 사진이 안 보이던 까닭은 DB 가 아니라 앱이다 — 카카오가 주는 주소가 `http://` 라 `https://` 만 받던 판정에서 떨어졌다
--    (src/lib/avatar.ts 에서 고쳤다). 여기서는 명단이 그 사진을 볼 수 있게 `student_auth_info` 에 `avatar_url` 을 더한다.
--  * 학생이 직접 올리는 사진은 private 버킷 `avatars` 에 두고 경로를 `profiles.avatar_path` 에 적는다. 본인 폴더에만 올리고,
--    보는 사람은 본인과 crew(강사·관리자·조교) — 명단·학생 관리에서 본다. 올린 사진이 있으면 카카오·구글 사진보다 앞선다.
-- ============================================================================

alter table public.profiles add column if not exists avatar_path text;

comment on column public.profiles.avatar_path is
  '학생이 직접 올린 프로필 사진의 저장소 경로 (버킷 avatars, {uid}/{파일}). 없으면 카카오·구글 사진(auth user_metadata.avatar_url) (2026-10-02)';

-- 본인 행 수정 정책이 그대로 적용된다 (이름·등급은 못 바꾸고 나머지 칸은 본인이 고친다). 조교는 트리거가 남의 행을 막는다
grant update (avatar_path) on public.profiles to authenticated;

-- ─── 사진 버킷 ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5 * 1024 * 1024, array['image/*'])
on conflict (id) do nothing;

drop policy if exists "avatars: 본인 폴더 업로드" on storage.objects;
create policy "avatars: 본인 폴더 업로드" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 본인 + crew(강사·관리자·조교 — 명단을 보는 사람)
drop policy if exists "avatars: 본인·크루 조회" on storage.objects;
create policy "avatars: 본인·크루 조회" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_crew())));

drop policy if exists "avatars: 본인 삭제" on storage.objects;
create policy "avatars: 본인 삭제" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─── 명단용 계정 정보에 카카오·구글 프로필 사진 주소 ────────────────────────────────────────
drop function if exists public.student_auth_info(uuid[]);
create function public.student_auth_info(p_ids uuid[])
returns table (
  user_id         uuid,
  email           text,
  providers       text[],
  last_sign_in_at timestamptz,
  avatar_url      text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- 학생·회원은 못 부른다 (남의 이메일을 읽는 길이 된다)
  if not private.is_crew() then
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
         u.last_sign_in_at,
         coalesce(nullif(u.raw_user_meta_data ->> 'avatar_url', ''), nullif(u.raw_user_meta_data ->> 'picture', ''))
    from auth.users u
   where u.id = any(p_ids);
end;
$$;

comment on function public.student_auth_info(uuid[]) is
  '학생명단용 계정 정보 (이메일·로그인 방식·마지막 접속·카카오/구글 프로필 사진 주소). 스태프·조교만.';

revoke all on function public.student_auth_info(uuid[]) from public, anon;
grant execute on function public.student_auth_info(uuid[]) to authenticated, service_role;
