-- ============================================================================
-- 조교에게 비대면 자료실을 연다 (2026-10-07 Alan — "비대면자료를 조교들이 올릴 수 있으면 좋겠어. 조교들에게 비대면 자료실 권한을 부여해줘").
--
--   조교의 관리자 화면은 2026-10-03 에 Alan 이 정한 여섯(출석 · 등업 로그 · 교재주문 · 불라방 링크 · 스터디 신청자 · 숙제점검)에 **비대면 자료**가 더해져 일곱이다.
--   화면 가드(requireCrew) · 메뉴(crew: true)는 앱이 바꾸고, 여기서는 DB 가 같은 집합을 보게 맞춘다 (CLAUDE.md 등급 체계 1).
--
--   * study_material_items(회차별 공통 자료실) — 조회 · 등록 · 수정 · 삭제를 is_staff → is_crew.
--     그 달 적용분(study_materials)은 security definer 트리거(private.tg_sync_online_materials)가 채우므로 그 표의 쓰기 정책은 그대로 스태프다.
--     조회 정책은 이미 crew 다 (20261003100000 — 인증 현황).
--   * 버킷 study-materials — 업로드 · 수정 · 삭제를 is_crew 로, 조회의 스태프 갈래도 is_crew 로 (아직 어느 달에도 적용되지 않은 회차 파일 · 안내 사진을 조교도 본다).
--   * 그 달 비대면 스터디를 여는 것(studies 쓰기)은 그대로 스태프 — 조교 화면에는 "열기" 카드 대신 강사에게 부탁하라는 안내다.
--   정책 이름은 운영 DB 의 pg_policies 로 확인했다. **두 번 돌아도 된다**(옛 이름 · 새 이름 모두 drop if exists) — 운영에 먼저 적용한 뒤 머지 때 연동이 다시 돌린다.
-- ============================================================================

-- ─── 1. 자료실 표 ───────────────────────────────────────────────────────────
drop policy if exists "study_material_items: 스태프 조회" on public.study_material_items;
drop policy if exists "study_material_items: 스태프·조교 조회" on public.study_material_items;
create policy "study_material_items: 스태프·조교 조회" on public.study_material_items
  for select to authenticated
  using ((select private.is_crew()));

drop policy if exists "study_material_items: 스태프 등록" on public.study_material_items;
drop policy if exists "study_material_items: 스태프·조교 등록" on public.study_material_items;
create policy "study_material_items: 스태프·조교 등록" on public.study_material_items
  for insert to authenticated
  with check ((select private.is_crew()));

drop policy if exists "study_material_items: 스태프 수정" on public.study_material_items;
drop policy if exists "study_material_items: 스태프·조교 수정" on public.study_material_items;
create policy "study_material_items: 스태프·조교 수정" on public.study_material_items
  for update to authenticated
  using ((select private.is_crew()))
  with check ((select private.is_crew()));

drop policy if exists "study_material_items: 스태프 삭제" on public.study_material_items;
drop policy if exists "study_material_items: 스태프·조교 삭제" on public.study_material_items;
create policy "study_material_items: 스태프·조교 삭제" on public.study_material_items
  for delete to authenticated
  using ((select private.is_crew()));

-- ─── 2. 파일 버킷 ───────────────────────────────────────────────────────────
drop policy if exists "study-materials: 신청자·스태프 조회" on storage.objects;
drop policy if exists "study-materials: 신청자·스태프·조교 조회" on storage.objects;
create policy "study-materials: 신청자·스태프·조교 조회" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'study-materials'
    and (
      (select private.is_crew())
      or exists (select 1 from public.study_materials m where m.file_path = objects.name)
      or (name like 'notes/%' and exists (select 1 from public.study_materials m where position(('[img=' || objects.name) in coalesce(m.note, '')) > 0))
    )
  );

drop policy if exists "study-materials: 스태프 업로드" on storage.objects;
drop policy if exists "study-materials: 스태프·조교 업로드" on storage.objects;
create policy "study-materials: 스태프·조교 업로드" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'study-materials' and (select private.is_crew()));

drop policy if exists "study-materials: 스태프 수정" on storage.objects;
drop policy if exists "study-materials: 스태프·조교 수정" on storage.objects;
create policy "study-materials: 스태프·조교 수정" on storage.objects
  for update to authenticated
  using (bucket_id = 'study-materials' and (select private.is_crew()))
  with check (bucket_id = 'study-materials' and (select private.is_crew()));

drop policy if exists "study-materials: 스태프 삭제" on storage.objects;
drop policy if exists "study-materials: 스태프·조교 삭제" on storage.objects;
create policy "study-materials: 스태프·조교 삭제" on storage.objects
  for delete to authenticated
  using (bucket_id = 'study-materials' and (select private.is_crew()));
