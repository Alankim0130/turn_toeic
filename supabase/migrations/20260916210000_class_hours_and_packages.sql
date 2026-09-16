-- ============================================================================
-- 60분 반과 120분 반, 그리고 주5일 (2026-09-16 Alan 요청)
--
--  "주5일은 월수금+화목금을 다 듣는 개념이야. 단 60분 수업과 120분 수업이 나눠져 있으니 잘 고려해 줘."
--
--  * 편성표의 실제 수업은 60분(650·750)·70분(850) **시간 단위**다 — 10:00–11:00 RC 다음 11:10–12:10 LC 로
--    강사가 바뀌고, 한 시간만 듣는 학생(주5일 60분 · 주3일 단과)도 있다. 브로슈어의 120분·140분은
--    그 시간 단위 둘을 이어 듣는 **등록 단위**다.
--  * 그래서 시간 단위 반이 진짜 수업이고, 120분·140분 반은 **묶음 반**이다. 묶음 반 학생은 같은 기수 · 트랙 ·
--    강좌에서 시간이 안에 들어오는 시간 단위 반의 권한(수업일 · 다시보기 · 불라방 · LC 교재)을 그대로 받는다.
--    스파르타반이 점수보장반을 포함하던 규칙(20260916180000)을 같은 함수에서 함께 판정한다.
--  * 녹화본 · 불라방 링크 · LC 교재는 **시간 단위 반에 한 번만** 둔다. 묶음 반에는 붙이지 않는다.
--  * 스파르타반은 이제 묶음 반은 건너뛰고 그 안의 시간 단위 반만 포함한다 (묶음 반에는 내용이 없고,
--    190분 스파르타가 850 140분 묶음(12:30~15:00)까지 열어 버리면 안 된다).
--  * 주5일 = 같은 기수 · 강좌 · 시간대의 월수금 반 + 화목금 반. 따로 저장하지 않고 이 조합으로 판정한다
--    (class_sections.bundle_id 는 "하나씩 만들기" 의 흔적일 뿐 판정에 쓰지 않는다).
--  * 시간표(timetable_slots)에 평달 60분 시간 단위와 850 140분 묶음을 넣는다 — 편성표 9·10월 원본.
--    방학달 시간대는 브로슈어에 시간 단위가 없어 그대로 둔다.
-- ============================================================================

-- ─── 1. 평달 시간대: 60분 시간 단위 (650 · 750) 와 850 140분 묶음 ──────────────
insert into public.timetable_slots (level, program, season, start_time, end_time)
values
  (650, 'score', 'regular', '10:00', '11:00'),
  (650, 'score', 'regular', '11:10', '12:10'),
  (650, 'score', 'regular', '18:30', '19:30'),
  (650, 'score', 'regular', '19:40', '20:40'),
  (750, 'score', 'regular', '10:00', '11:00'),
  (750, 'score', 'regular', '11:10', '12:10'),
  (750, 'score', 'regular', '18:30', '19:30'),
  (750, 'score', 'regular', '19:40', '20:40'),
  (850, 'score', 'regular', '12:30', '15:00')
on conflict (level, program, season, start_time, end_time) do nothing;

-- ─── 2. 시간대 라벨 포함 판정 ────────────────────────────────────────────────
-- p_inner 가 p_outer 안에 들어오되 같은 구간은 아닌가. src/lib/time-blocks.ts 의 blockContains 와 같은 규칙
create or replace function private.time_block_contains(p_outer text, p_inner text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_outer is null or p_inner is null
     or p_outer !~ '^\d{2}:\d{2}~\d{2}:\d{2}$' or p_inner !~ '^\d{2}:\d{2}~\d{2}:\d{2}$' then
    return false;
  end if;
  return split_part(p_inner, '~', 1)::time >= split_part(p_outer, '~', 1)::time
     and split_part(p_inner, '~', 2)::time <= split_part(p_outer, '~', 2)::time
     and (split_part(p_inner, '~', 1)::time > split_part(p_outer, '~', 1)::time
          or split_part(p_inner, '~', 2)::time < split_part(p_outer, '~', 2)::time);
end;
$$;

-- 이 반이 묶음 반인가 — 점수보장반에서 같은 기수 · 트랙 · 강좌에 시간이 안에 들어오는 반이 있으면 묶음.
-- 스파르타반은 190분·260분이 서로 다른 상품이라 묶음으로 보지 않는다
create or replace function private.is_package_section(p_section_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_sections p
    join public.courses pc on pc.id = p.course_id and pc.program = 'score'
    join public.class_sections c
      on c.term_id = p.term_id and c.track = p.track and c.course_id = p.course_id and c.id <> p.id
    where p.id = p_section_id
      and private.time_block_contains(p.time_block, c.time_block)
  )
$$;

-- ─── 3. 포함 판정 한곳: 묶음 반 → 시간 단위 반, 스파르타반 → 포함 레벨의 시간 단위 반 ──
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
      )
  )
$$;

revoke all on function private.time_block_contains(text, text), private.is_package_section(bigint) from public, anon;
grant execute on function private.time_block_contains(text, text), private.is_package_section(bigint) to authenticated, service_role;
