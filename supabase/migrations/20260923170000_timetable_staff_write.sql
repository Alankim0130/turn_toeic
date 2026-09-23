-- 시간표를 관리자 모드에서 직접 고친다 (2026-09-23 Alan — "관리자모드에서 평달과 방학 시간표를 직접 설정할수 있도록 만들어놓는건 어때?
-- 템플릿은 브로슈어와 비슷하게" · ①: 평달·방학달 두 벌을 두고 방학 전에 고쳐 쓴다).
--
-- 그동안 timetable_levels · timetable_slots 는 마이그레이션·SQL 로만 고쳤다 (CLAUDE.md 미확정 1 "시간대 관리 화면을 만들지는 Alan 이 정한다").
-- 이제 /admin/timetable 에서 강사·관리자가 시간대를 더하고 고치고 지운다. 쓰기는 로그인한 사람의 세션으로 하므로 여기 정책이 한 번 더 막는다.
-- 조교는 못 고친다 (is_staff — 조교 때문에 is_staff 를 넓히지 않는다, 등급 체계 2).
-- 지운 시간대로 이미 만든 반은 그대로 남는다 — 반에는 시간대가 글자(time_block)로 박혀 있다.

grant insert, update, delete on public.timetable_slots to authenticated;
grant update on public.timetable_levels to authenticated;

drop policy if exists "timetable_slots: 스태프 등록" on public.timetable_slots;
create policy "timetable_slots: 스태프 등록" on public.timetable_slots
  for insert to authenticated with check ((select private.is_staff()));

drop policy if exists "timetable_slots: 스태프 수정" on public.timetable_slots;
create policy "timetable_slots: 스태프 수정" on public.timetable_slots
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

drop policy if exists "timetable_slots: 스태프 삭제" on public.timetable_slots;
create policy "timetable_slots: 스태프 삭제" on public.timetable_slots
  for delete to authenticated using ((select private.is_staff()));

drop policy if exists "timetable_levels: 스태프 수정" on public.timetable_levels;
create policy "timetable_levels: 스태프 수정" on public.timetable_levels
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

comment on table public.timetable_slots is
  '수업 시간표 — 평달·방학달 두 벌 (level × program × season × 시간). 랜딩 수업시간표 · 반 일괄 개설 표 · 저녁 줄 판정이 읽는다. /admin/timetable 에서 강사·관리자가 고친다 (2026-09-23)';
