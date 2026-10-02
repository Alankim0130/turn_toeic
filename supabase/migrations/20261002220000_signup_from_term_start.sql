-- ============================================================================
-- 스터디 · 특강 신청은 개강일부터 (2026-10-02 Alan — "수강생전용 페이지를 전부다 개강일에 맞춰서 오픈하는 걸로",
-- 선택 ② "교재주문은 배정되면 바로")
--
--  * private.is_term_enrollee — 그 달 반에 배정된 수강생인가. **예비등록생(개강 전)을 뺀다**: 개강일 ≤ 오늘 ≤ 종강일인 배정만.
--    스터디 신청·변경(study_signups 정책) · 특강 조회(special_lectures 정책) · 특강 신청(lecture_signup_open)이 이 함수를 본다.
--    2026-09-15 부터 예비등록생도 포함했었다 — 그때는 Alan 확인 전 기본값이었다.
--    불라방 교재주문은 private.has_live_enrollment 를 보므로 그대로 개강 전에도 주문한다 (첫 수업 전에 책이 와야 한다).
--
--  * private.lecture_signup_open — 신청 시작(signup_opens_at)이 비어 있으면 "바로" 가 아니라 **특강 7일 전 자정(KST)** 부터
--    (Alan "특강신청도 지금 전부다 열려있는데, 일주일전부터 하나씩 열어주면"). 강사가 따로 적은 시각은 그대로 쓴다.
--    앱의 lectureOpensAt(src/lib/lecture.ts, lecture.test.ts) 과 같은 규칙 — 바꾸면 둘 다 고친다.
-- ============================================================================

create or replace function private.is_term_enrollee(p_term_id bigint)
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
      and o.status = 'active'
      and private.today_kst() between s.enrollment_opens_at and s.closes_at
  )
$$;
comment on function private.is_term_enrollee(bigint) is
  '그 달 반에 배정돼 지금 수강 중(개강일~종강일)인가 — 스터디·특강 신청 자격. 예비등록생은 제외 (2026-10-02 Alan). 교재주문은 has_live_enrollment';

create or replace function private.lecture_signup_open(p_lecture_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.special_lectures l
    where l.id = p_lecture_id
      and l.signup
      and coalesce(l.signup_opens_at, (l.date - 7)::timestamp at time zone 'Asia/Seoul') <= now()
      and private.today_kst() <= l.date
      and private.is_term_enrollee(l.term_id)
  )
$$;
comment on function private.lecture_signup_open(bigint) is
  '신청 받는 중인가 — 신청 시작(비우면 특강 7일 전 자정 KST)부터 특강 당일까지, 그 달 수강 중인 학생만. 앱 lectureState 와 같은 규칙';
