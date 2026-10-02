-- ============================================================================
-- 예비등록생도 그 달 특강 날짜를 미리 본다 (2026-10-02 Alan "예비등록생 내 시간표에도 특강 날짜는 미리 보여줘").
--
--  * 조회만이다. 신청은 private.lecture_signup_open → private.is_term_enrollee(개강일~종강일) 그대로라 개강 전에는 못 한다
--    (마이그레이션 20261002220000). 수업일을 예비등록생에게 미리 연 20261002210000 과 같은 결의 변경이다.
--  * private.is_term_assignee — 그 달 반에 배정돼 있나 (예비등록 포함, 종강 전). 예전 is_term_enrollee 의 뜻이다.
--    special_lectures 의 수강생 조회 정책이 이것을 본다.
-- ============================================================================

create or replace function private.is_term_assignee(p_term_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.enrollment_orders o on o.id = e.order_id
    join public.class_sections s on s.id = e.section_id
    where e.student_id = (select auth.uid())
      and s.term_id = p_term_id
      and e.status = 'active'
      and o.status in ('preliminary', 'active')
      and private.today_kst() <= s.closes_at
  )
$$;
comment on function private.is_term_assignee(bigint) is
  '그 달 반에 배정돼 있나 — 예비등록생 포함, 종강 전. 특강 날짜 미리 보기(조회)에만 쓴다. 신청 자격은 is_term_enrollee';
grant execute on function private.is_term_assignee(bigint) to authenticated, service_role;

drop policy if exists "special_lectures: 수강생 조회" on public.special_lectures;
create policy "special_lectures: 수강생 조회" on public.special_lectures
  for select to authenticated
  using ((select private.is_term_assignee(special_lectures.term_id)));
