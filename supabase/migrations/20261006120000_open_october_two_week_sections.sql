-- ============================================================================
-- 10월 850 2주완성 반 열기 (2026-10-06 Alan — "응 열어줘").
--
-- 10월 반은 2주완성 과정이 생기기 전(10/5)에 열어서 2주완성 반이 없었다. 그래서 그날 올라온 2주완성 수강증이 승인 화면에서 고를 반이 없었다.
-- 새 반 개설 화면의 일괄 개설(bulkCreateSections)과 **같은 값으로** 월수금 · 화목금 두 반을 연다:
--   * 시간은 **10월 시간표의 850 2주완성 줄**에서 읽는다 (코드에 시각을 적지 않는다 — 20261005140000 이 10월 850 시간으로 넣어 둔 줄).
--   * 개강일 · 종강일은 기수에서, 회차 수는 그 트랙 수업일 수 — 넣는 순간 반 트리거(private.sync_section_schedule)가
--     2주완성 규칙대로 종강일을 앞 절반 마지막 수업일로 바꾸고 회차도 그날까지만 만든다.
--   * 담당 강사 · 과정 · 과목은 비운다 (그릇 반 — section_instructor_plan 도 비운다). 인강 아님 · 모집 중(open).
--   * 같은 (강좌 · 트랙 · 시간대) 반이 이미 있으면 건너뛴다 — 강사가 그사이 직접 열었어도 두 번 생기지 않는다. 다시 돌려도 같다.
-- 줄 · 기수 · 강좌가 없으면 아무것도 하지 않고 알림만 남긴다 (배포를 막지 않는다).
-- ============================================================================

do $$
declare
  v_term   record;
  v_course bigint;
  v_slot   record;
  v_block  text;
  v_track  text;
  n        int := 0;
begin
  select id, enrollment_opens_at, closes_at into v_term
    from public.terms where year = 2026 and month = 10;
  if not found or v_term.enrollment_opens_at is null or v_term.closes_at is null then
    raise notice '10월 기수의 개강일 · 종강일이 없어 2주완성 반을 열지 않았다';
    return;
  end if;

  select id into v_course
    from public.courses where program = 'twoweek' and target_score = 850 and is_active
   order by id limit 1;
  if v_course is null then
    raise notice '850 2주완성 강좌가 없어 반을 열지 않았다';
    return;
  end if;

  for v_slot in
    select start_time, end_time, coalesce(ttf_recorded, false) as ttf_recorded
      from public.timetable_slots
     where year = 2026 and month = 10 and level = 850 and program = 'twoweek'
     order by start_time
  loop
    -- 앱의 timeBlockOf 와 같은 꼴 (HH:MM~HH:MM)
    v_block := to_char(v_slot.start_time, 'HH24:MI') || '~' || to_char(v_slot.end_time, 'HH24:MI');
    foreach v_track in array array['mwf', 'ttf'] loop
      continue when exists (
        select 1 from public.class_sections s
         where s.term_id = v_term.id and s.course_id = v_course and s.track = v_track and s.time_block is not distinct from v_block);
      insert into public.class_sections
        (term_id, course_id, track, time_block, enrollment_opens_at, closes_at, target_sessions,
         instructor_id, capacity, status, book_set, subject, recorded, live_to_replay, bundle_id)
      values
        (v_term.id, v_course, v_track, v_block, v_term.enrollment_opens_at, v_term.closes_at,
         greatest((select count(*) from public.term_class_dates d where d.term_id = v_term.id and d.track = v_track), 1)::int,
         null, null, 'open', null, null, v_slot.ttf_recorded and v_track = 'ttf', not v_slot.ttf_recorded, null);
      n := n + 1;
    end loop;
  end loop;

  raise notice '10월 850 2주완성 반 %개를 열었다', n;
end $$;
