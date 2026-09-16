-- ============================================================================
-- 테스터: 강사·관리자 계정의 테스트 등급 (2026-09-16 Alan 요청)
--
--  * "강사계정, 관리자계정도 학생명단에 '테스터'로 추가 — 등급설정을 임의로 해서 테스트해 보려고"
--  * 진짜 등급(role)을 학생으로 내리면 그 계정은 관리자 화면을 잃고 스스로 되돌릴 수 없다.
--    그래서 스태프 계정에만 **테스트 등급(test_role)** 을 따로 둔다: 회원(member) · 수강생(student) · 졸업생(alumni).
--  * test_role 이 있으면 private.user_role() 이 그 값을 돌려준다 → 모든 RLS 가 그 등급의 학생으로 판정한다.
--    스태프 전체 열람이 꺼지고 그 계정에 배정된 반·등록만 보인다. 반 배정은 실제 학생과 똑같이 한다
--    (예: 10월 반에 배정하면 예비등록생, 스파르타 650 반에 배정하면 650 + 850 권한).
--  * test_role 은 authenticated 에 쓰기 권한을 주지 않는다. 서버가 진짜 등급(role)을 확인한 뒤 서비스 롤로만 바꾼다
--    — 테스트 중에는 RLS 상 관리자가 아니라서 세션으로는 스스로 끌 수 없기 때문이다.
--  * 테스트 등급은 권한을 낮추기만 한다 (강사·관리자 값은 넣을 수 없다).
-- ============================================================================

alter table public.profiles
  add column test_role public.user_role,
  add constraint profiles_test_role_staff_only check (
    test_role is null
    or (role in ('instructor', 'admin') and test_role in ('member', 'student', 'alumni'))
  );

comment on column public.profiles.test_role is
  '테스터(강사·관리자) 계정의 테스트 등급 (member|student|alumni). 있으면 RLS 가 이 등급으로 판정한다. 서버가 서비스 롤로만 바꾼다';

-- 현재 사용자의 등급 — 테스트 등급이 켜져 있으면 그 값
create or replace function private.user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.test_role, p.role) from public.profiles p where p.id = (select auth.uid())
$$;
