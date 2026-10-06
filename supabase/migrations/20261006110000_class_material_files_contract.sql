-- ============================================================================
-- 수업자료실 파일 — 옮기기 마무리 (contract). 20261006100000 의 다음 단계 — 새 앱(파일은 class_material_files)이 뜬 뒤에 배포한다
-- (2026-10-06 Alan — "파일업로드를 안하고 글만 적어서 올릴수도 있도록 … 파일을 한번에 여러개 올릴 수 있도록").
--
--   * 그 사이 아직 떠 있던 옛 앱이 class_materials 의 파일 칸에 바로 올린 자료가 있으면 파일 표로 옮긴다 (새 번호 — 앞 단계의
--     "자료와 같은 id" 규칙은 새 앱이 만든 파일 번호와 겹칠 수 있어 쓰지 않는다).
--   * 저장소 조회 정책에서 옛 칸 갈래를 뺀다 — 이제 파일 표의 행이 보이는지만 본다 (정책을 먼저 바꿔야 아래 칸을 지울 수 있다).
--   * class_materials 의 파일 칸 넷을 지운다 (file_path 의 unique 도 함께 사라진다). 파일은 class_material_files 에만 있다.
-- ============================================================================

insert into public.class_material_files (material_id, file_path, file_name, file_size, content_type, sort_order, created_at)
select m.id, m.file_path, coalesce(nullif(left(m.file_name, 200), ''), '파일'), m.file_size, m.content_type, 0, m.created_at
  from public.class_materials m
 where m.file_path is not null
   and not exists (select 1 from public.class_material_files f where f.file_path = m.file_path)
on conflict do nothing;

drop policy if exists "class-materials: 자료가 보이는 사람·스태프 조회" on storage.objects;
create policy "class-materials: 자료가 보이는 사람·스태프 조회" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'class-materials'
    and (
      (select private.is_staff())
      or exists (select 1 from public.class_material_files f where f.file_path = objects.name)
    )
  );

alter table public.class_materials
  drop column if exists file_path,
  drop column if exists file_name,
  drop column if exists file_size,
  drop column if exists content_type;

comment on table public.class_materials is
  '수업자료실 — 레벨(lc_levels) × 과목(rc|lc) × 과정(A|B) × 회차 자료(제목 · 안내). 파일은 class_material_files 에 0 ~ N개. 학생은 내 반의 그 회차 수업일부터(private.my_open_rounds), 쓰기는 강사·관리자 (2026-10-05 · 10-06)';
