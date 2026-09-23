-- 저녁 월수금 현장 반에도 다시보기를 연다 (2026-09-23 Alan "저녁 월수금 현장반 학생에게도 다시보기를 열어줘").
--
-- 그동안 오전 짝(private.recorded_source_section)은 **인강 반(recorded)** 에만 있었다. 저녁 줄의 화목금은 인강이라
-- 오전 화목금 반의 녹화본이 곧 수업이었지만, 저녁 월수금은 현장 수업이라 짝이 없었고 live_to_replay 도 저녁 줄이라 꺼진 채라
-- **그 반 학생에게는 다시보기가 아예 없었다** (CLAUDE.md 도메인 규칙 1 "아직 안 정한 것"). 이제 저녁 월수금 현장 반 학생도
-- 같은 과목의 오전 월수금 반 녹화본을 다시보기로 본다 (복습용 — 화목금 인강 학생에게는 수업 그 자체).
--
-- **저녁 반인지는 데이터로 안다 — 시각을 못박지 않는다.** 저녁 줄 = 시간표에서 화목금이 인강인 줄(timetable_slots.ttf_recorded)이고,
-- 반 개설이 그 값을 화목금 반의 recorded 로 복사한다. 그래서 같은 기수·강좌·시간대의 **다른 트랙 반이 인강이면** 그 반도 저녁 줄이다
-- (private.is_evening_section). 화목금 인강 반이 함께 개설돼 있지 않은 월수금 반은 저녁 줄로 보지 않는다 (짝 없음 — 예전과 같다).
--
-- 짝 규칙은 그대로다: 같은 기수·강좌·트랙 · 인강 아님 · 저녁 아님 · 같은 과목(LC 교재 같음 / 둘 다 RC) · 같은 묶음 여부 중 이른 시간대 하나.
-- 권한(private.has_recorded_replay_access)은 이제 recorded 조건 없이 "내 반의 오전 짝" 이면 연다 — 오전 반은 짝이 없어 그대로 닫힌다.
-- 열리는 것은 예전과 같이 **다시보기와 그 회차 날짜뿐**이다 (오전 반의 불라방 링크·수업일 줄·LC 교재는 아니다).
-- public.term_recorded_pairs(기수) 도 인강 반만이 아니라 짝이 있는 저녁 반 전부를 돌려준다 (다시보기 등록 화면의 안내).

create or replace function private.is_evening_section(p_section_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.class_sections e
      left join public.class_sections s
        on s.term_id = e.term_id
       and s.course_id = e.course_id
       and s.time_block is not distinct from e.time_block
       and s.track <> e.track
       and s.recorded
     where e.id = p_section_id
       and (e.recorded or s.id is not null)
  )
$$;

comment on function private.is_evening_section(bigint) is
  '저녁 줄의 반인가 — 인강 반이거나, 같은 기수·강좌·시간대의 다른 트랙 반이 인강이면 참 (시각을 못박지 않는다)';

create or replace function private.recorded_source_section(p_section_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
    from public.class_sections e
    join public.class_sections m
      on m.term_id = e.term_id
     and m.course_id = e.course_id
     and m.track = e.track
     and m.id <> e.id
     and not m.recorded
   where e.id = p_section_id
     and private.is_evening_section(e.id)
     and not private.is_evening_section(m.id)
     and m.book_set is not distinct from e.book_set
     and private.is_package_section(m.id) = private.is_package_section(e.id)
   order by m.time_block
   limit 1
$$;

comment on function private.recorded_source_section(bigint) is
  '저녁 반(화목금 인강 · 월수금 현장)의 오전 짝 — 같은 기수·강좌·트랙, 인강·저녁 아님, 같은 LC 교재(둘 다 RC), 같은 묶음 여부. 오전 반이면 null';

create or replace function private.has_recorded_replay_access(p_section_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_role() in ('student', 'instructor', 'admin', 'assistant')
     and exists (
       select 1
         from public.enrollments en
         join public.enrollment_orders o on o.id = en.order_id
         join public.class_sections s on s.id = en.section_id
        where en.student_id = (select auth.uid())
          and en.status = 'active'
          and o.status = 'active'
          and private.today_kst() between s.enrollment_opens_at and s.closes_at
          and (
            private.recorded_source_section(s.id) = p_section_id
            or private.section_includes(private.recorded_source_section(s.id), p_section_id)
          )
     )
$$;

comment on function private.has_recorded_replay_access(bigint) is
  '내가 배정된 저녁 반(인강 · 현장)의 오전 짝이 이 반인가 — replays · session_dates 조회 정책이 쓴다. 다시보기와 회차 날짜만 연다';

create or replace function public.term_recorded_pairs(p_term_id bigint)
returns table (recorded_id bigint, source_id bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, private.recorded_source_section(e.id)
  from public.class_sections e
  where e.term_id = p_term_id
    and private.recorded_source_section(e.id) is not null
  order by e.id
$$;

comment on function public.term_recorded_pairs(bigint) is
  '그 기수의 저녁 반(recorded_id: 화목금 인강 · 월수금 현장) → 녹화본을 올릴 오전 짝 반(source_id). 다시보기 등록 화면의 안내에 쓴다';
