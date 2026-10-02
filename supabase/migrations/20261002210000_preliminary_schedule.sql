-- 예비등록생(개강 전)에게도 내 시간표의 수업일을 보여 준다 (2026-10-02 Alan — "강사가 설정한 10월 일정표가 학생화면에 제대로 안나오고 있어.
-- 주5일, 월수금, 화목금 제대로 연동이 되어있는지 한번 확인해줘").
--
-- 달력 → 반 → 회차는 맞았다 (10월 반 36개 모두 그 트랙 달력과 같은 9회 — 월수금 10/7~, 화목금 10/6~). 화면에 안 선 까닭은 읽는 길이었다:
-- 내 시간표는 my_section_ids() 로 내 반을 고르고 회차(session_dates)는 has_section_access 가 연다 — 둘 다 수강 중(개강일~종강일)만 본다.
-- 10월 등록은 10/6 개강 전이라 전부 예비등록이어서, 학생 달력에 10월 특강만 서고 월수금 · 화목금 수업일은 하나도 안 섰다.
--
-- 그래서 **일정(날짜 · 시간)만** 예비등록생에게 연다. 불라방 링크 · 다시보기 · 숙제 · LC 음원은 그대로 개강일부터다 —
-- has_section_access · my_section_ids 는 손대지 않는다 (넓히면 예비등록생에게 불라방 · 다시보기가 열린다).

-- 내 시간표에 세울 반: 수강 중 + 개강 전(예비등록), 종강 전. 함께 듣는 반(묶음 · 속성반이 여는 시간 단위 반)까지 — my_section_ids 와 같은 꼴
create or replace function public.my_schedule_section_ids()
returns bigint[]
language sql
stable
set search_path = ''
as $$
  with mine as (
    select s.id, s.term_id, s.track
    from public.enrollments e
    join public.enrollment_orders o on o.id = e.order_id
    join public.class_sections s on s.id = e.section_id
    where e.student_id = (select auth.uid())
      and e.status = 'active'
      and o.status in ('preliminary', 'active')
      and private.today_kst() <= s.closes_at
  )
  select coalesce(array_agg(distinct x.id order by x.id), '{}')
  from (
    select id from mine
    union
    select c.id
    from mine m
    join public.class_sections c on c.term_id = m.term_id and c.track = m.track and c.id <> m.id
    where private.section_includes(m.id, c.id)
  ) x
$$;

revoke all on function public.my_schedule_section_ids() from public, anon;
grant execute on function public.my_schedule_section_ids() to authenticated, service_role;

-- 그 반의 회차(날짜 · 시간)를 읽어도 되나 — 위와 같은 집합
create or replace function private.has_section_schedule_access(p_section_id bigint)
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
      and e.status = 'active'
      and o.status in ('preliminary', 'active')
      and private.today_kst() <= s.closes_at
      and (e.section_id = p_section_id or private.section_includes(e.section_id, p_section_id))
  )
$$;

revoke all on function private.has_section_schedule_access(bigint) from public, anon;
grant execute on function private.has_section_schedule_access(bigint) to authenticated, service_role;

drop policy if exists "session_dates: 예비등록생 내 반 일정 조회" on public.session_dates;
create policy "session_dates: 예비등록생 내 반 일정 조회"
  on public.session_dates for select to authenticated
  using ((select private.has_section_schedule_access(session_dates.section_id)));
