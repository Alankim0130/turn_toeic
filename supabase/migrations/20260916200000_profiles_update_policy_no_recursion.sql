-- ============================================================================
-- profiles 수정 정책의 무한 재귀 고치기 (2026-09-16 발견)
--
--  * 정책 "profiles: 본인·admin 수정" 의 WITH CHECK 가 profiles 를 다시 조회해서
--    (name = (select p.name from profiles p ...)) 로그인 세션의 profiles UPDATE 가 **전부** 42P17
--    (infinite recursion detected in policy) 로 실패했다. 관리자라도 마찬가지 —
--    /admin/students/[id] 의 등급 변경(updateStudentRole, 세션으로 쓴다)이 한 번도 성공할 수 없었다.
--  * 같은 조건을 security definer 함수로 읽어 재귀를 없앤다. 규칙은 그대로다:
--      관리자 → 누구의 행이든 수정
--      본인   → 이름(수강증 대조 키)과 등급은 못 바꾼다
--  * 본인 등급 비교는 테스트 등급이 아니라 **진짜 등급**과 한다 — 테스터가 테스트 중에도
--    전화번호 같은 본인 정보를 고칠 수 있게 (등급을 바꿀 수 없는 것은 같다).
-- ============================================================================

-- 로그인한 사람의 진짜 등급 (테스트 등급과 무관)
create or replace function private.my_real_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

-- 로그인한 사람의 가입 실명
create or replace function private.my_profile_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.name from public.profiles p where p.id = (select auth.uid())
$$;

revoke all on function private.my_real_role(), private.my_profile_name() from public, anon;
grant execute on function private.my_real_role(), private.my_profile_name() to authenticated, service_role;

drop policy "profiles: 본인·admin 수정" on public.profiles;
create policy "profiles: 본인·admin 수정" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()))
  with check (
    (select private.is_admin())
    or (
      (select auth.uid()) = id
      and role = (select private.my_real_role())
      and name = (select private.my_profile_name())
    )
  );
