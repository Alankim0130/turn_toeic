-- 수업자료실 안내에 스크립트를 올린다 (2026-10-05 Alan — "여기 안내에 스크립트를 올려줄예정이야. 그래서 글을 쫌 길게 적을 수 있어야해").
-- 안내(class_materials.note)는 500자였다 (20261005100000). LC 한 회차 스크립트에 해석을 붙여도 들어가게 5만 자로 늘린다.
-- 앱의 CLASS_MATERIAL_NOTE_MAX(src/lib/class-materials.ts)와 같은 값이다 — 바꾸면 둘 다 (class-materials.test.ts 가 본다).
-- 조회 정책 · 저장소 정책은 그대로다 (학생은 내 과정 칸의 그 회차 수업일부터 — 20261005130000).

-- 표를 만들 때 칸 옆에 적은 check 라 이름은 Postgres 가 지었다 (class_materials_note_check) — 이름을 믿지 않고 정의로 찾아 지운다
do $$
declare r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.class_materials'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%char_length(note)%'
  loop
    execute format('alter table public.class_materials drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.class_materials
  add constraint class_materials_note_check check (note is null or char_length(note) <= 50000);

comment on column public.class_materials.note is
  '안내 · 스크립트 (5만 자, 2026-10-05). 학생에게 자료와 함께 보인다 — 짧으면 펼쳐 두고 길면 앞 몇 줄 + 전체 보기';
