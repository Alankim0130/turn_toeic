-- ============================================================================
-- 비대면 자료 회차마다 안내 문구 (2026-09-30 Alan — "비대면 자료실에 각 회차마다 안내문구 넣기!")
--
--   * 자료실 회차(study_material_items)에 `note` 를 두고, 그 달에 적용된 회차(study_materials)로 **복사**한다 —
--     학생은 자료실 표를 못 읽는다(스태프 전용). 파일·제목을 복사하는 것과 같은 길(private.sync_online_materials)이다.
--   * 학생 쪽 공개 규칙은 그대로다 — 문구는 자료 행의 한 칸이라 그 날짜가 되고 신청·수강 중일 때만 보인다 (RLS).
--   * 끝난 달(종강일 지남)은 sync 가 건드리지 않으므로 지난달 회차의 문구는 그때 것 그대로 남는다.
-- ============================================================================

alter table public.study_material_items
  add column if not exists note text check (note is null or char_length(note) <= 500);
alter table public.study_materials
  add column if not exists note text check (note is null or char_length(note) <= 500);

comment on column public.study_material_items.note is '회차 안내 문구 (선택, 500자). 그 달 적용분(study_materials.note)으로 복사된다 — 2026-09-30';
comment on column public.study_materials.note is '회차 안내 문구 — 자료실(study_material_items.note)에서 복사. 직접 쓰지 않는다';

-- 20260922124700 의 함수에 note 한 칸만 더했다 (나머지는 그대로)
create or replace function private.sync_online_materials()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select s.id as study_id, s.term_id
      from public.studies s
      join public.terms t on t.id = s.term_id
     where s.kind = 'online'
       and (t.closes_at is null or t.closes_at >= private.today_kst())   -- 끝난 달은 지난 기록이다
  loop
    insert into public.study_materials as m
      (study_id, seq, date, item_id, title, note, file_path, file_name, file_size, content_type, uploaded_by, updated_at)
    select r.study_id, d.seq, d.date, i.id, i.title, i.note, i.file_path, i.file_name, i.file_size, i.content_type, i.uploaded_by, now()
      from private.term_class_days(r.term_id) d
      join public.study_material_items i on i.seq = d.seq
    on conflict (study_id, seq) do update
       set date = excluded.date, item_id = excluded.item_id, title = excluded.title, note = excluded.note, file_path = excluded.file_path,
           file_name = excluded.file_name, file_size = excluded.file_size, content_type = excluded.content_type,
           uploaded_by = excluded.uploaded_by, updated_at = now()
     where (m.date, m.item_id, m.title, m.note, m.file_path, m.file_name, m.file_size, m.content_type)
           is distinct from
           (excluded.date, excluded.item_id, excluded.title, excluded.note, excluded.file_path, excluded.file_name, excluded.file_size, excluded.content_type);

    -- 더는 없는 회차(수업일이 줄었거나 자료를 지웠다)는 뺀다 — 인증이 붙은 행은 남긴다 (지우면 인증이 함께 지워진다)
    delete from public.study_materials m
     where m.study_id = r.study_id
       and not exists (
         select 1
           from private.term_class_days(r.term_id) d
           join public.study_material_items i on i.seq = d.seq
          where d.seq = m.seq)
       and not exists (select 1 from public.study_checkins c where c.material_id = m.id);
  end loop;
end;
$$;

revoke all on function private.sync_online_materials() from public, anon, authenticated;
