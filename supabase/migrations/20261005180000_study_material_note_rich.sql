-- ============================================================================
-- 비대면 자료 회차 안내도 수업자료실 공지와 같은 편집기로 (2026-10-05 Alan — "관리자모드에서 비대면자료 설정하는곳에 안내 부분도
-- 같은설정으로 넣어줘. 전체공개, 레벨별 이부분 빼고")
--
--   * 안내(study_material_items.note → 그 달 study_materials.note 로 복사 — private.sync_online_materials)는 이제 서식 글이다:
--     굵게 · 밑줄 · 색 · 크기 · 줄 정렬([center] · [right]) · 사진([img=notes/… w=NN]). 판독은 앱의 src/lib/note-format.ts.
--   * 태그까지 글자로 세므로 500자로는 모자라 5만 자로 늘린다 (수업자료실 안내 · 공지와 같다).
--     앱의 MATERIAL_NOTE_MAX(src/lib/study-rounds.ts)와 같은 값이다 — 바꾸면 둘 다 (study-note.test.ts 가 본다).
--   * 사진은 버킷 study-materials 의 notes/ 폴더에 둔다. 조회 정책에 "그 사진을 품은 안내가 보이는 사람" 갈래를 더한다 —
--     study_materials 행의 RLS 를 그대로 거치므로 학생은 **신청했고 · 그 회차 날짜가 됐고 · 수강 중인** 자료의 안내 사진만 서명 주소를 만든다.
--     자료 파일 갈래(file_path)는 그대로다.
--   * 두 번 돌아도 된다 (check 는 정의로 찾아 지우고 다시 걸고, 정책은 if exists 로 지우고 다시 만든다).
-- ============================================================================

-- 칸 옆에 적은 check 라 이름은 Postgres 가 지었다 (…_note_check) — 이름을 믿지 않고 정의로 찾아 지운다 (20261005150000 과 같은 방법)
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
     where c.conrelid in ('public.study_material_items'::regclass, 'public.study_materials'::regclass)
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%char_length(note)%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.study_material_items
  add constraint study_material_items_note_check check (note is null or char_length(note) <= 50000);
alter table public.study_materials
  add constraint study_materials_note_check check (note is null or char_length(note) <= 50000);

comment on column public.study_material_items.note is
  '회차 안내 (선택, 서식 글 5만 자 — 2026-10-05). 사진은 [img=notes/…]. 그 달 적용분(study_materials.note)으로 복사된다';
comment on column public.study_materials.note is
  '회차 안내 — 자료실(study_material_items.note)에서 복사. 직접 쓰지 않는다. 서식 글 5만 자 (2026-10-05)';

-- ─── 안내 사진 (버킷 study-materials, notes/ 폴더) ──────────────────────────────
drop policy if exists "study-materials: 신청자·스태프 조회" on storage.objects;
create policy "study-materials: 신청자·스태프 조회" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'study-materials'
    and (
      (select private.is_staff())
      or exists (select 1 from public.study_materials m where m.file_path = objects.name)
      or (
        objects.name like 'notes/%'
        and exists (select 1 from public.study_materials m where position(('[img=' || objects.name) in coalesce(m.note, '')) > 0)
      )
    )
  );
