-- ============================================================================
-- 스파르타반 등급 · 반 권한 · 방학달 시간표 (2026-09-16 Alan 요청 — 브로슈어 9·10월 / 7·8월, 9·10월 편성표)
--
--  * 브로슈어의 과정은 두 가지다.
--      한 달 점수보장반(score) — 650+ 왕기초반 · 750+ 유형마스터 · 850+ 문제마스터
--      스파르타반(sparta, 프리미어반) — 650+ 중급속성 = 650 LC/RC + 850 LC/RC, 750+ 실전속성 = 750 LC/RC + 850 LC/RC
--    → courses.program, courses.includes_levels (스파르타가 함께 듣는 레벨. 예: {850})
--    → timetable_slots.program. 같은 650 이라도 점수보장반(10:00~12:10)과 스파르타반(10:00~13:40)의 시간대가 다르다.
--  * 9·10월 편성표 12:30·13:50 의 "문풀A / 문풀B" 는 문법이 아니라 **850+ 문제마스터(문제풀이반)** 다.
--    그래서 850 도 평달에 열고, 기존 850 시간대 12:30~13:40 · 13:50~15:00 은 그대로 맞다.
--  * 반 권한: 스파르타 반에 배정된 학생은 **같은 기수 · 같은 트랙**에서 **시간이 겹치는 포함 레벨의 점수보장반**
--    (예: 스파르타 650 10:00~13:40 → 650 10:00~12:10 + 850 12:30~13:40)의 수업일 · 다시보기 · 불라방 링크를 함께 본다.
--    판정은 private.section_includes 한곳에서 하고 private.has_section_access 가 쓴다.
--    그래서 녹화본은 점수보장반에 한 번만 올리면 되고, 스파르타 학생에게 850 13:50 반처럼 듣지 않는 반이 열리지 않는다.
--  * 방학달(season = vacation) 시간표를 2026년 7·8월 브로슈어로 채운다. 7월과 8월이 조금 달라 **두 달 시간대를 모두** 넣는다
--    (반 일괄 개설 표에서 그 달에 실제로 여는 칸만 고른다).
-- ============================================================================

-- ─── 1. 강좌: 과정 · 함께 듣는 레벨 ────────────────────────────────────────
alter table public.courses
  add column program text not null default 'score' check (program in ('score', 'sparta')),
  add column includes_levels int[] not null default '{}'
    check (10 <= all (includes_levels) and 990 >= all (includes_levels)),
  add constraint courses_sparta_includes_levels check ((program = 'sparta') = (cardinality(includes_levels) > 0));

comment on column public.courses.program is 'score(한 달 점수보장반) | sparta(스파르타반). 스파르타는 포함 레벨의 점수보장반 권한을 함께 받는다';
comment on column public.courses.includes_levels is '스파르타반이 함께 듣는 레벨 (예: 650+ 중급속성 = {850}). 점수보장반은 빈 배열';

-- ─── 2. 시간표: 과정별 시간대 ──────────────────────────────────────────────
alter table public.timetable_slots
  add column program text not null default 'score' check (program in ('score', 'sparta'));

-- 스파르타 750 은 같은 10:00 시작이 190분·260분 두 개라 끝 시각까지 묶는다
alter table public.timetable_slots drop constraint timetable_slots_level_season_start_time_key;
alter table public.timetable_slots
  add constraint timetable_slots_level_program_season_time_key unique (level, program, season, start_time, end_time);

comment on column public.timetable_slots.program is 'score(한 달 점수보장반) | sparta(스파르타반). courses.program 과 짝지어 반 일괄 개설 표에 나온다';

insert into public.timetable_slots (level, program, season, start_time, end_time) values
  -- 평달 스파르타반 (9·10월 브로슈어)
  (650, 'sparta', 'regular', '10:00', '13:40'),   -- 190분
  (750, 'sparta', 'regular', '10:00', '13:40'),   -- 190분
  (750, 'sparta', 'regular', '10:00', '15:00'),   -- 260분
  -- 방학달 점수보장반 (7·8월 브로슈어)
  (650, 'score', 'vacation', '10:00', '12:10'),   -- 7·8월
  (650, 'score', 'vacation', '12:30', '14:40'),   -- 7월
  (650, 'score', 'vacation', '17:00', '19:10'),   -- 7·8월, 월수금 현강 + 화목금 인강
  (750, 'score', 'vacation', '10:00', '12:10'),   -- 7·8월
  (750, 'score', 'vacation', '12:30', '14:40'),   -- 7·8월
  (750, 'score', 'vacation', '17:00', '19:10'),   -- 7·8월, 월수금 현강 + 화목금 인강
  (850, 'score', 'vacation', '15:30', '16:50'),   -- 7월 80분 (15:00~15:30 셀프문제풀이)
  (850, 'score', 'vacation', '12:30', '14:40'),   -- 8월 120분
  -- 방학달 스파르타반
  (650, 'sparta', 'vacation', '12:30', '16:50'),  -- 7월 200분
  (650, 'sparta', 'vacation', '15:30', '19:10'),  -- 7월 200분, 월수금 현강 + 화목금 인강
  (650, 'sparta', 'vacation', '10:00', '13:30'),  -- 8월 180분
  (750, 'sparta', 'vacation', '12:30', '16:50'),  -- 7월 200분
  (750, 'sparta', 'vacation', '15:30', '19:10'),  -- 7월 200분, 월수금 현강 + 화목금 인강
  (750, 'sparta', 'vacation', '10:00', '14:40'),  -- 8월 240분
  (750, 'sparta', 'vacation', '10:00', '13:30')   -- 8월 180분
on conflict do nothing;

-- ─── 3. 강좌 마스터 (브로슈어 과정명) ──────────────────────────────────────
insert into public.courses (code, name, course_type, target_score, program, includes_levels) values
  ('650', '650+ 왕기초반', 'full', 650, 'score', '{}'),
  ('750', '750+ 유형마스터', 'full', 750, 'score', '{}'),
  ('850', '850+ 문제마스터', 'full', 850, 'score', '{}'),
  ('SPARTA650', '스파르타 650+ 중급속성', 'full', 650, 'sparta', '{850}'),
  ('SPARTA750', '스파르타 750+ 실전속성', 'full', 750, 'sparta', '{850}')
on conflict (code) do nothing;

-- ─── 4. 반 권한: 스파르타 반이 포함하는 점수보장반 ─────────────────────────
-- "HH:MM~HH:MM" 두 라벨의 시간이 겹치는가. 라벨이 없거나 형식이 다르면 겹치지 않는다고 본다
create or replace function private.time_blocks_overlap(a text, b text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if a is null or b is null
     or a !~ '^\d{2}:\d{2}~\d{2}:\d{2}$' or b !~ '^\d{2}:\d{2}~\d{2}:\d{2}$' then
    return false;
  end if;
  return split_part(a, '~', 1)::time < split_part(b, '~', 2)::time
     and split_part(b, '~', 1)::time < split_part(a, '~', 2)::time;
end;
$$;

-- p_parent 가 스파르타 반이고, p_child 가 같은 기수·같은 트랙에서 시간이 겹치는
-- 포함 레벨(자기 레벨 + includes_levels)의 점수보장반인가
create or replace function private.section_includes(p_parent bigint, p_child bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_sections p
    join public.courses pc on pc.id = p.course_id
    join public.class_sections c on c.id = p_child
    join public.courses cc on cc.id = c.course_id
    where p.id = p_parent
      and c.id <> p.id
      and pc.program = 'sparta'
      and cc.program = 'score'
      and c.term_id = p.term_id
      and c.track = p.track
      and cc.target_score = any (pc.includes_levels || pc.target_score)
      and private.time_blocks_overlap(p.time_block, c.time_block)
  )
$$;

-- 콘텐츠 접근 (CLAUDE.md §3): 직접 배정된 반 + 배정된 스파르타 반이 포함하는 반
create or replace function private.has_section_access(p_section_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_role() in ('student', 'instructor', 'admin')
     and exists (
       select 1
       from public.enrollments e
       join public.enrollment_orders o on o.id = e.order_id
       join public.class_sections s on s.id = e.section_id
       where e.student_id = (select auth.uid())
         and e.status = 'active'
         and o.status = 'active'
         and private.today_kst() <= s.closes_at
         and (e.section_id = p_section_id or private.section_includes(e.section_id, p_section_id))
     )
$$;

-- 내가 지금 접근할 수 있는 반 id (직접 배정 + 스파르타가 포함하는 반).
-- LC 음원 화면이 "내 레벨 · 내 반 교재" 를 정할 때 쓴다 — 스파르타 650 이면 650 과 850 이 함께 나온다
create or replace function public.my_section_ids()
returns bigint[]
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select s.id, s.term_id, s.track
    from public.enrollments e
    join public.enrollment_orders o on o.id = e.order_id
    join public.class_sections s on s.id = e.section_id
    where e.student_id = (select auth.uid())
      and e.status = 'active'
      and o.status = 'active'
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

-- 기수 안의 스파르타 반 → 권한을 함께 주는 반 (반 편성 목록 · 반 상세 표시용)
create or replace function public.term_section_includes(p_term_id bigint)
returns table (section_id bigint, included_id bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, c.id
  from public.class_sections p
  join public.class_sections c on c.term_id = p.term_id and c.track = p.track and c.id <> p.id
  where p.term_id = p_term_id
    and private.section_includes(p.id, c.id)
  order by p.id, c.time_block, c.id
$$;

revoke all on function
  private.time_blocks_overlap(text, text),
  private.section_includes(bigint, bigint)
from public, anon;
grant execute on function
  private.time_blocks_overlap(text, text),
  private.section_includes(bigint, bigint)
to authenticated, service_role;

revoke all on function public.my_section_ids(), public.term_section_includes(bigint) from public, anon;
grant execute on function public.my_section_ids(), public.term_section_includes(bigint) to authenticated, service_role;
