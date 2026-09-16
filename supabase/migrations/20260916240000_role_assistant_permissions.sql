-- ============================================================================
-- 등급 정리 (2026-09-16 Alan 확정)
--
--  1. **강사(instructor) 권한 = 관리자(admin) 와 동일.** 이혜영·이영수가 강사다.
--     그래서 `private.is_admin()` 이 강사도 참으로 본다 — 등급 변경·알림 설정 등
--     admin 만 열던 것이 강사에게도 열린다. 알런은 관리자 그대로.
--  2. **조교(assistant) 등급 신설.**
--     - 학생 모드: 강사·관리자와 똑같이 연다 (has_term_access).
--     - 관리자 모드: **불라방 교재주문 · 스터디 신청자 두 가지만.**
--       그래서 is_staff() 는 넓히지 않고, 그 두 화면이 읽는 테이블에만
--       `private.is_crew()`(스태프 + 조교) 로 길을 낸다.
--       반 편성·학생명단·등업 로그 같은 나머지는 조교에게 계속 닫혀 있다.
-- ============================================================================

-- ─── 1. 강사 = 관리자 ──────────────────────────────────────────────────────
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.user_role() in ('instructor', 'admin'), false)
$$;

comment on function private.is_admin() is
  '강사·관리자 (2026-09-16 Alan: 강사 권한은 관리자와 같다). is_staff() 와 같은 집합이지만 뜻이 달라 둘 다 둔다';

-- ─── 2. 조교 ───────────────────────────────────────────────────────────────
create or replace function private.is_assistant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.user_role() = 'assistant', false)
$$;

-- 스태프 + 조교. 조교에게 열어 주는 곳에만 쓴다 (전체 관리자 권한이 아니다)
create or replace function private.is_crew()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or private.is_assistant()
$$;

revoke execute on function private.is_assistant(), private.is_crew() from public, anon;
grant execute on function private.is_assistant(), private.is_crew() to authenticated, service_role;

-- ─── 3. 학생 모드: 조교도 강사·관리자와 같게 ────────────────────────────────
create or replace function private.has_term_access(p_term_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_role() in ('student', 'instructor', 'admin', 'assistant')
     and exists (
       select 1
       from public.enrollments e
       join public.enrollment_orders o on o.id = e.order_id
       join public.class_sections s on s.id = e.section_id
       where e.student_id = (select auth.uid())
         and (p_term_id is null or s.term_id = p_term_id)
         and e.status = 'active'
         and o.status = 'active'
         and private.today_kst() <= s.closes_at
     )
$$;

-- ─── 4. 조교가 보는 두 화면 ────────────────────────────────────────────────
-- 교재주문·스터디 신청자 명단에는 학생 이름과 그 학생의 반이 함께 나온다.
-- 그래서 profiles·enrollments·enrollment_orders 조회도 함께 열어 준다 (조회만).
drop policy "profiles: 본인·스태프 조회" on public.profiles;
create policy "profiles: 본인·스태프·조교 조회" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select private.is_crew()));

drop policy "orders: 본인·스태프 조회" on public.enrollment_orders;
create policy "orders: 본인·스태프·조교 조회" on public.enrollment_orders
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_crew()));

drop policy "enrollments: 본인·스태프 조회" on public.enrollments;
create policy "enrollments: 본인·스태프·조교 조회" on public.enrollments
  for select to authenticated
  using ((select auth.uid()) = student_id or (select private.is_crew()));

-- 교재주문: 조회 + 처리 (상태 바꾸기)
drop policy "textbook_orders: 본인·스태프 조회" on public.textbook_orders;
create policy "textbook_orders: 본인·스태프·조교 조회" on public.textbook_orders
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_crew()));

drop policy "textbook_orders: 본인 취소·스태프 처리" on public.textbook_orders;
create policy "textbook_orders: 본인 취소·스태프·조교 처리" on public.textbook_orders
  for update to authenticated
  using ((select auth.uid()) = user_id or (select private.is_crew()))
  with check (
    (select private.is_crew())
    or ((select auth.uid()) = user_id and status in ('requested', 'cancelled'))
  );

-- 스터디 신청자: 명단 조회 + 스태프 취소
drop policy "study_signups: 본인·스태프 조회" on public.study_signups;
create policy "study_signups: 본인·스태프·조교 조회" on public.study_signups
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_crew()));

drop policy "study_signups: 본인 취소·스태프 정리" on public.study_signups;
create policy "study_signups: 본인 취소·스태프·조교 정리" on public.study_signups
  for delete to authenticated
  using (
    (select private.is_crew())
    or (
      (select auth.uid()) = user_id
      and exists (select 1 from public.studies s where s.id = study_signups.study_id and s.status = 'open')
    )
  );
