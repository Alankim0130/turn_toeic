-- ============================================================================
-- 저녁반 화목금은 인강 (2026-09-17 Alan 확정: "650,750 둘 다 저녁에는 화목금 인강이야")
--
--  저녁반은 **월수금은 현장에 나와 듣고, 화목금은 그 날 오전에 수업한 녹화본을 본다.**
--  라이브방송(불라방)이 아니므로 `enrollments.mode` 는 그대로 `onsite` 다 (2026-09-16 Alan).
--  달라지는 것은 **그 반이 인강인가** 뿐이라 반의 성질로 둔다.
--
--  어느 시간대가 그런지는 **시간표가 정한다** — 브로슈어에 "월 현강/화 인강" 이 찍힌 줄이다.
--  그래서 `timetable_slots.ttf_recorded` 에 적고, 반을 만들 때 화목금 반에만 복사한다
--  (LC 교재 `book_set` 과 같은 방식). 코드에 시각을 못박지 않는다 (작업 원칙 4).
-- ============================================================================

alter table public.timetable_slots
  add column if not exists ttf_recorded boolean not null default false;

comment on column public.timetable_slots.ttf_recorded is
  '이 시간대는 화목금이 인강이다 (월수금 현장 + 화목금은 오전 수업 녹화본 시청). 브로슈어의 "월 현강/화 인강" 줄';

alter table public.class_sections
  add column if not exists recorded boolean not null default false;

comment on column public.class_sections.recorded is
  '이 반은 인강이다 — 교실에 나오지 않고 그 날 오전 수업의 녹화본을 본다 (2026-09-17 Alan: 저녁반 화목금). '
  '불라방(enrollments.mode = live)과 다르다. 반 개설 때 timetable_slots.ttf_recorded 에서 화목금 반에만 복사한다';

-- ─── 저녁 시간대 표시 ──────────────────────────────────────────────────────
-- 650·750 점수보장반의 저녁 줄: 평달 18:30~20:40 · 18:30~19:30 · 19:40~20:40,
-- 방학달 17:00~19:10 (이 줄은 브로슈어에 "월수금 현강 + 화목금 인강" 으로 이미 적혀 있다).
-- 850·스파르타는 저녁 반이 없다.
update public.timetable_slots
   set ttf_recorded = true
 where level in (650, 750)
   and program = 'score'
   and start_time >= time '17:00';

-- ─── 이미 만들어 둔 반에도 채운다 ─────────────────────────────────────────
update public.class_sections s
   set recorded = true
  from public.timetable_slots t, public.courses c
 where s.track = 'ttf'
   and t.ttf_recorded
   and c.id = s.course_id
   and c.target_score = t.level
   and c.program = t.program
   and s.time_block = to_char(t.start_time, 'HH24:MI') || '~' || to_char(t.end_time, 'HH24:MI')
   and s.recorded is distinct from true;
