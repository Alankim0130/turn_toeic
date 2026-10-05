-- ============================================================================
-- 850 2주완성 — 방학달에도 (2026-10-05 Alan "방학달에도 2주완성 있어")
--
--  * 방학달 850 은 시간 단위(70분) 없이 **통짜 한 반**이다 (8월 12:30~14:40 · 7월 15:30~16:50 — 2026년 여름 브로슈어).
--    2주완성 반이 품는 반을 "시간이 **안에 드는** 시간 단위 반"으로만 찾으면(20261005140000) 같은 시간의 통짜 반을 못 품어서,
--    방학달 2주완성 학생에게 불라방 링크 · 다시보기 · LC 음원 · 수업자료가 하나도 열리지 않는다 (time_block_contains 는 같은 시간을 빼는 엄격한 포함이다).
--    그래서 **시간이 같은 반도 품는다** — 묶음 반은 그대로 건너뛴다. 평달 850 140분 묶음 반(12:30~15:00)은 2주완성과 시간이 같지만
--    묶음이라 빠지고, 내용은 그 안의 70분 반 둘에 있다 (지금과 같다).
--  * 방학달 기본 줄(season vacation)에 2주완성 줄을 넣는다 — **850 통짜 시간마다 하나** (기본 줄에는 7월 · 8월 850 이 함께 있어서
--    20261005140000 의 "가장 이른 시작 ~ 가장 늦은 끝" 한 줄로는 12:30~16:50 이라는 없는 시간이 된다). 새 방학달 시간표를 만들면
--    시간과 함께 따라오고, 그 달에 쓰지 않는 850 시간을 지우면 그 시간의 2주완성 줄도 함께 지운다 (앱 deleteTimetableSlot · orphanTwoWeekRows).
--  * 이미 만든 방학달(이번 달부터) 시간표도 같은 모양으로 맞춘다 — 20261005140000 이 따로 떨어진 850 시간을 잇는 한 줄을 넣었을 수 있다.
--    **반이 쓰는 줄은 건드리지 않는다** (DB 가드 tg_timetable_month_guard 와 같은 조건 — 지우려 하면 배포가 통째로 실패한다).
--  * 방학달이 어느 달인지는 앱의 VACATION_MONTHS(src/lib/timetable.ts — 1 · 2 · 7 · 8월)와 같다. 이 파일은 한 번만 도는 데이터 정리라 그대로 적었다.
-- ============================================================================

-- ─── 1. 2주완성 반이 품는 반: 시간이 같은 통짜 반도 ──────────────────────────
-- 20261005140000 의 함수에서 2주완성 갈래의 시간 조건만 넓혔다 (묶음 반 · 스파르타 갈래는 그대로)
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
      and c.term_id = p.term_id
      and c.track = p.track
      and (
        -- 묶음 반(120분 · 140분): 같은 강좌에서 시간이 안에 들어오는 반
        (pc.program = 'score' and cc.id = pc.id and private.time_block_contains(p.time_block, c.time_block))
        or
        -- 스파르타반: 포함 레벨(자기 레벨 + includes_levels)의 점수보장반 중 시간이 겹치는 시간 단위 반.
        -- 묶음 반은 건너뛴다 — 내용은 시간 단위 반에 있고, 190분 스파르타가 850 140분 묶음까지 열면 안 된다
        (pc.program = 'sparta' and cc.program = 'score'
          and cc.target_score = any (pc.includes_levels || pc.target_score)
          and private.time_blocks_overlap(p.time_block, c.time_block)
          and not private.is_package_section(c.id))
        or
        -- 2주완성(2026-10-05): 같은 레벨 점수보장반 중 시간이 안에 들거나 **같은** 반 — 평달은 850 12:30~15:00 → 12:30~13:40 · 13:50~15:00,
        -- 방학달은 850 통짜 반 그 자체 (예: 12:30~14:40 → 12:30~14:40). 묶음 반은 건너뛴다 — 내용은 시간 단위 반에 있다.
        -- 앞 절반에서 닫히는 것은 2주완성 반 자체의 종강일이 한다
        (pc.program = 'twoweek' and cc.program = 'score'
          and cc.target_score = pc.target_score
          and (p.time_block = c.time_block or private.time_block_contains(p.time_block, c.time_block))
          and not private.is_package_section(c.id))
      )
  )
$$;

-- ─── 2. 방학달 기본 줄: 850 통짜 시간마다 2주완성 한 줄 ──────────────────────
-- 2주완성 강좌가 있는 레벨만 (지금은 850). 다른 점수보장반 줄 안에 드는 줄(시간 단위)은 빼고 바깥 줄만 — 방학달 850 은 통짜 한 줄씩이다
insert into public.timetable_slots (year, month, level, program, season, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf)
select null, null, s.level, 'twoweek', 'vacation', s.start_time, s.end_time, false, null, null, null
  from public.timetable_slots s
 where s.year is null
   and s.season = 'vacation'
   and s.program = 'score'
   and s.level in (select c.target_score from public.courses c where c.program = 'twoweek' and c.target_score is not null)
   and not exists (
     select 1 from public.timetable_slots o
      where o.year is null and o.season = 'vacation' and o.program = 'score' and o.level = s.level and o.id <> s.id
        and private.time_block_contains(private.slot_label(o.start_time, o.end_time), private.slot_label(s.start_time, s.end_time)))
   and not exists (
     select 1 from public.timetable_slots x
      where x.year is null and x.season = 'vacation' and x.program = 'twoweek' and x.level = s.level
        and x.start_time = s.start_time and x.end_time = s.end_time);

-- ─── 3. 이미 만든 방학달 시간표 (이번 달부터) ────────────────────────────────
-- 3-1) 그 달 850 통짜 시간과 맞지 않는 2주완성 줄을 지운다 — 그 달 반이 쓰는 줄은 남긴다 (DB 가드와 같은 조건)
delete from public.timetable_slots w
 where w.program = 'twoweek'
   and w.year is not null
   and w.month in (1, 2, 7, 8)
   and w.year * 12 + w.month >= extract(year from private.today_kst())::int * 12 + extract(month from private.today_kst())::int
   and not exists (
     select 1 from public.timetable_slots s
      where s.year = w.year and s.month = w.month and s.level = w.level and s.program = 'score'
        and s.start_time = w.start_time and s.end_time = w.end_time
        and not exists (
          select 1 from public.timetable_slots o
           where o.year = s.year and o.month = s.month and o.level = s.level and o.program = 'score' and o.id <> s.id
             and private.time_block_contains(private.slot_label(o.start_time, o.end_time), private.slot_label(s.start_time, s.end_time))))
   and not exists (
     select 1 from public.class_sections cs
       join public.terms t on t.id = cs.term_id
      where t.year = w.year and t.month = w.month
        and cs.time_block = private.slot_label(w.start_time, w.end_time)
        and cs.course_id in (select c.id from public.courses c where c.target_score = w.level and c.program = w.program));

-- 3-2) 850 통짜 시간마다 2주완성 줄이 없으면 넣는다 (기본 줄과 같은 규칙)
insert into public.timetable_slots (year, month, level, program, season, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf)
select s.year, s.month, s.level, 'twoweek', null, s.start_time, s.end_time, false, null, null, null
  from public.timetable_slots s
 where s.year is not null
   and s.month in (1, 2, 7, 8)
   and s.year * 12 + s.month >= extract(year from private.today_kst())::int * 12 + extract(month from private.today_kst())::int
   and s.program = 'score'
   and s.level in (select c.target_score from public.courses c where c.program = 'twoweek' and c.target_score is not null)
   and not exists (
     select 1 from public.timetable_slots o
      where o.year = s.year and o.month = s.month and o.level = s.level and o.program = 'score' and o.id <> s.id
        and private.time_block_contains(private.slot_label(o.start_time, o.end_time), private.slot_label(s.start_time, s.end_time)))
   and not exists (
     select 1 from public.timetable_slots x
      where x.year = s.year and x.month = s.month and x.level = s.level and x.program = 'twoweek'
        and x.start_time = s.start_time and x.end_time = s.end_time);
