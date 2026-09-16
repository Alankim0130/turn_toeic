-- ============================================================================
-- 시간표를 평달 · 방학달 두 벌로 나눈다 (2026-09-16 Alan 확정)
--
--  * 9·10월처럼 평소에 돌아가는 달과, 7·8월 같은 방학달의 시간대가 다르다.
--    **1·2월도 방학달과 같은 세팅**이다 (Alan 확인).
--  * 지금까지는 레벨당 한 세트뿐이라, 방학달 기수를 편성해도 표에 평달 시간대가 떴고
--    그대로 개설하면 `class_sections.time_block` 에 틀린 값이 박혔다 (OCR 시간대 대조가 어긋난다).
--  * 기존 행은 전부 평달(`regular`)이다 — 9·10월 편성표로 확인했다.
--  * **방학달 행은 여기서 만들지 않는다.** 방학달은 해마다·달마다 다르다
--    (같은 방학이어도 7월 850 은 80분 15:30, 8월 850 은 120분 12:30 이었다).
--    Alan 에게 그 해 값을 받아 넣기 전까지 방학달은 비어 있고, 화면이 "아직 없음"을 알린다.
-- ============================================================================

alter table public.timetable_slots
  add column season text not null default 'regular'
    check (season in ('regular', 'vacation'));

-- 같은 레벨·같은 시작 시각이라도 평달과 방학달은 따로 둔다
alter table public.timetable_slots drop constraint timetable_slots_level_start_time_key;
alter table public.timetable_slots add constraint timetable_slots_level_season_start_time_key unique (level, season, start_time);

comment on column public.timetable_slots.season is
  'regular(평달) | vacation(방학달 = 1·2·7·8월). 달마다 어느 쪽인지는 src/lib/timetable.ts 의 VACATION_MONTHS';
