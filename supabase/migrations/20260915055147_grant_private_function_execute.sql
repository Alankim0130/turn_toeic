-- ============================================================================
-- 버그 수정: RLS 헬퍼 함수 실행 권한
--
-- init_schema 에서 `revoke execute ... from public, anon` 을 하면서 PUBLIC 의 기본
-- EXECUTE 권한이 사라졌는데, authenticated 에 명시적으로 부여하지 않아
-- 로그인 사용자의 모든 정책 평가가 "permission denied for function is_staff" 로 실패했다.
-- (첫 로그인 사용자 스모크 테스트에서 발견)
-- ============================================================================

grant execute on function
  private.today_kst(),
  private.user_role(),
  private.is_staff(),
  private.is_admin(),
  private.can_manage_section(bigint),
  private.has_section_access(bigint)
to authenticated, service_role;

-- 앞으로 private 스키마에 만드는 함수는 PUBLIC 기본 실행 권한 없이 시작한다.
-- (필요한 함수마다 authenticated / service_role 에 명시적으로 grant 할 것)
alter default privileges for role postgres in schema private
  revoke execute on functions from public;
