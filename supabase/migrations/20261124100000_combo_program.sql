-- 합반 속성반(650+750) — 과정 하나 더 (2026-11-24 Alan — 시간표 설정의 스파르타반 카드(650 중급속성 · 750 실전속성)를 보내며
-- "그리고 방학에는 650+750 속성반이 하나 더 있어! 새로운 등급을 하나만 더 만들어줘").
--
-- 속성반은 포함 레벨(자기 레벨 + includes_levels)의 점수보장반 시간 단위 반을 시간이 겹치는 만큼 함께 연다 (section_includes 의 스파르타 갈래).
-- 650+750 도 똑같은 반인데, 시간표 줄 · 반 · 강좌는 (레벨 × 과정)으로 짝지어지고(tg_timetable_month_sync · tg_timetable_month_guard · 반 개설)
-- 650 스파르타에는 이미 중급속성(650 + 850)이 있다 — 같은 열쇠의 강좌가 둘이면 서로의 시간대에 반이 생기고 평달 자동 세팅도 duplicate_course 로 멈춘다.
-- 그래서 과정 `combo`(합반 속성반)를 더하고 권한은 스파르타와 같은 갈래로 본다. 앱은 `isSpartaProgram`(src/lib/timetable.ts) 한곳.
-- 강좌: 레벨 650 + 포함 750 — 시간표 설정의 스파르타반 제목 아래 `650+750 속성반` 카드로 서고, 강사가 그 카드에 시간대를 더한다 (방학달 10:00~14:40 등).

alter table public.courses drop constraint if exists courses_program_check;
alter table public.courses add constraint courses_program_check
  check (program = any (array['score', 'sparta', 'combo', 'twoweek']));

alter table public.timetable_slots drop constraint if exists timetable_slots_program_check;
alter table public.timetable_slots add constraint timetable_slots_program_check
  check (program = any (array['score', 'sparta', 'combo', 'twoweek']));

-- 함께 듣는 레벨은 속성반(스파르타 · 합반)만 가진다
alter table public.courses drop constraint if exists courses_sparta_includes_levels;
alter table public.courses add constraint courses_sparta_includes_levels
  check ((program in ('sparta', 'combo')) = (cardinality(includes_levels) > 0));

comment on column public.courses.program is
  'score(한 달 점수보장반) | sparta(스파르타반) | combo(합반 속성반 — 650+750, 2026-11-24) | twoweek(2주완성). sparta · combo 는 includes_levels 의 시간 단위 반을 함께 연다';

-- 반 권한 — 스파르타 갈래에 합반 속성반을 더한다 (나머지는 20261005160000 그대로)
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
        -- 속성반(스파르타 · 합반 속성반 2026-11-24): 포함 레벨(자기 레벨 + includes_levels)의 점수보장반 중 시간이 겹치는 시간 단위 반.
        -- 묶음 반은 건너뛴다 — 내용은 시간 단위 반에 있고, 190분 스파르타가 850 140분 묶음까지 열면 안 된다
        (pc.program in ('sparta', 'combo') and cc.program = 'score'
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

-- 강좌 — 아직 없을 때만 (이름은 다른 속성반처럼 `스파르타 레벨 …` — 화면은 `650+750 속성반`)
insert into public.courses (code, name, course_type, target_score, program, includes_levels)
select 'COMBO650750', '스파르타 650+750 속성반', 'full', 650, 'combo', array[750]
where not exists (select 1 from public.courses c where c.program = 'combo')
  and not exists (select 1 from public.courses c where c.code = 'COMBO650750');
