-- ============================================================================
-- 권한 조이기
--
-- 이 프로젝트는 구(舊) 기본값으로 생성되어, public 스키마에 테이블을 만들면
-- anon / authenticated 에 모든 권한(select·insert·update·delete·truncate…)이
-- 자동 부여된다. RLS 가 행을 막고 있어 데이터가 새지는 않지만, Supabase 는
-- 2026-10-30 부터 모든 프로젝트를 "명시적 grant" 방식으로 전환한다.
-- 지금부터 그 방식으로 통일한다:
--   1) 앞으로 만들 테이블·시퀀스·함수에 자동 권한을 주지 않는다
--   2) 기존 테이블의 자동 권한을 전부 회수하고, init_schema §6 과 같은 최소 권한만 다시 준다
-- service_role 은 그대로 둔다 (Edge Function · 배치가 사용).
-- ============================================================================

-- ─── 1. 이후 생성되는 객체의 자동 권한 해제 (마이그레이션 실행 롤 = postgres) ──
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- ─── 2. 기존 객체의 자동 권한 회수 ──────────────────────────────────────────
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- ─── 3. 최소 권한 재부여 (init_schema §6 과 동일) ────────────────────────────
-- 비회원: 공개 마스터 데이터만
grant select on public.terms, public.courses, public.class_sections_public to anon;

-- 로그인 회원: 행·컬럼은 RLS 정책이 제한
grant select on public.terms, public.courses, public.class_sections_public to authenticated;
grant select on public.profiles to authenticated;
grant update (name, phone, role) on public.profiles to authenticated;
grant select, insert, update, delete on public.terms, public.courses to authenticated;
grant select, insert, update, delete on public.class_sections to authenticated;
grant select, insert, update, delete on public.session_dates to authenticated;
grant select, insert, update, delete on public.replays to authenticated;
grant select, update on public.enrollment_verifications to authenticated;
grant select, update on public.enrollment_orders to authenticated;
grant select, insert, update, delete on public.enrollments to authenticated;
grant usage, select on all sequences in schema public to authenticated;
