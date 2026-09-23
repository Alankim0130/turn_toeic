-- 과정 A/B 는 (강좌·시간대) 단위이고 과목은 따로 적는다 (2026-09-23 Alan).
--
--   Alan: "RC도 A과정 B과정에 따라서 움직이잖아." · "12월 달까지는 자동채움으로 가도 괜찮아.
--          1,2,7,8은 방학달이라서 시간표가 변경될테니 그것도 알고 있으면 좋겠어."
--
-- 편성표의 A/B 는 LC 교재가 아니라 **과정**이다 — 9월 10:00 은 650A 과정이고 그 안에서 월수금이 RC · 화목금이 LC 다.
-- 달이 바뀌면 과정 글자만 뒤집히고(9월 10:00 A → 10월 10:00 B) 과목 배치는 그대로다.
-- 그동안 DB 는 A/B 를 LC 시간에만 적고 RC 시간은 비워 "비어 있으면 RC" 로 과목을 읽었다. 그래서
--   · RC 시간이 어느 과정인지 적을 자리가 없었고,
--   · 10월 반 30개는 아무것도 안 적혀 담당 강사·내 교재·저녁-오전 다시보기 짝이 전부 비어 있었다.
--
-- 이제:
--   1. class_sections.subject (lc | rc) — 시간 단위 반의 과목. 묶음 반·스파르타 반·방학달 통짜 반은 null (두 과목을 이어 듣는다).
--   2. class_sections.book_set 의 뜻을 **과정 A/B** 로 넓힌다 — RC 시간에도 같은 시간대의 글자를 적는다. LC 시간에는 곧 LC 교재다.
--   3. 채우기: 교재가 있던 반 → lc, 같은 기수·강좌·시간대의 반대 트랙 → rc, 아직 없는 반은 바로 앞 달 같은 자리(강좌·트랙·시간대)의 과목을 잇는다.
--      과정은 같은 시간대 LC 짝의 글자를, 없으면 앞 달 같은 자리를 뒤집은 글자를 넣는다 (10월이 여기서 채워진다).
--      다음 달부터는 반 일괄 개설 화면이 같은 규칙으로 미리 채운다 (src/lib/course-set.ts) — 방학달(계절이 바뀌는 달)은 채우지 않는다.
--   4. 과목을 읽던 DB 함수 셋을 subject 로 바꾼다: private.section_instructor_plan · private.tg_sections_sync_instructors · private.recorded_source_section.

alter table public.class_sections add column if not exists subject text check (subject in ('lc', 'rc'));

-- class_sections 는 칸 단위 grant 다 — 새 칸을 열어 주지 않으면 조회·개설·수정이 조용히 막힌다
grant select (subject) on public.class_sections to anon, authenticated;
grant insert (subject), update (subject) on public.class_sections to authenticated;

comment on column public.class_sections.subject is
  '시간 단위 반의 과목 lc|rc (20260923160000). 묶음 반·스파르타 반·방학달 통짜 반은 null — 두 과목을 이어 듣는다. 담당 강사·단과 표시·내 교재·다시보기 짝이 읽는다';
comment on column public.class_sections.book_set is
  '과정 A|B (20260923160000 부터 — 그전에는 LC 교재만). (강좌·시간대) 단위로 두 트랙이 같고 달마다 뒤바뀐다. LC 시간(subject=lc)에는 곧 LC 교재. 묶음 반·스파르타 반은 null';

-- ─── 담당 강사 판정: 과목 칸으로 ───────────────────────────────────────────────
create or replace function private.section_instructor_plan(p_term_id bigint)
returns table (
  section_id    bigint,
  current_id    uuid,      -- 지금 담당
  is_package    boolean,   -- 묶음 반·스파르타 반 → 담당을 비운다
  is_known      boolean,   -- 과목이 적혀 있어 담당을 정할 수 있다
  subj          text,      -- lc | rc (is_known 일 때만 뜻이 있다)
  teacher_id    uuid       -- 그 과목의 강사. 계정이 없으면 null
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with s as (
    select cs.id, cs.subject, cs.instructor_id,
           (c.program = 'sparta' or private.is_package_section(cs.id)) as pkg
      from public.class_sections cs
      join public.courses c on c.id = cs.course_id
     where cs.term_id = p_term_id
  ),
  teacher as (
    -- 과목마다 한 사람. 강사를 관리자보다 앞에, 먼저 가입한 순 (이혜영 lc · 이영수 rc)
    select distinct on (p.subject) p.subject, p.id
      from public.profiles p
     where p.subject in ('lc', 'rc') and p.role in ('instructor', 'admin')
     order by p.subject, (p.role = 'instructor') desc, p.created_at
  )
  select s.id,
         s.instructor_id,
         s.pkg,
         (not s.pkg and s.subject is not null),
         s.subject,
         t.id
    from s
    left join teacher t on t.subject = s.subject
$fn$;

comment on function private.section_instructor_plan(bigint) is
  '기수의 반마다 담당 강사 판정 (2026-09-23: 과목 칸 class_sections.subject 로). 앱의 src/lib/instructor-subject.ts planSubjects 와 같은 규칙';

-- 편성 컬럼에 subject 를 더한다 — 과목을 바꾸면 그 기수의 담당을 다시 맞춘다
create or replace function private.tg_sections_sync_instructors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_term bigint;
begin
  if tg_op = 'INSERT' then
    for v_term in select distinct c.term_id from changed c loop
      perform private.sync_term_instructors(v_term);
    end loop;
  elsif tg_op = 'UPDATE' then
    for v_term in
      select distinct x.term_id
        from (
          select c.term_id from changed c join before b on b.id = c.id
           where (c.book_set, c.subject, c.time_block, c.course_id, c.term_id, c.track)
                 is distinct from (b.book_set, b.subject, b.time_block, b.course_id, b.term_id, b.track)
          union
          select b.term_id from before b join changed c on c.id = b.id
           where b.term_id <> c.term_id
        ) x
    loop
      perform private.sync_term_instructors(v_term);
    end loop;
  elsif tg_op = 'DELETE' then
    for v_term in select distinct b.term_id from before b loop
      perform private.sync_term_instructors(v_term);
    end loop;
  end if;
  return null;
end;
$fn$;

-- ─── 저녁 반의 오전 짝: 같은 과정(A/B) 에 더해 같은 과목 ───────────────────────
create or replace function private.recorded_source_section(p_section_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $fn$
  select m.id
    from public.class_sections e
    join public.class_sections m
      on m.term_id = e.term_id
     and m.course_id = e.course_id
     and m.track = e.track
     and m.id <> e.id
     and not m.recorded
   where e.id = p_section_id
     and private.is_evening_section(e.id)
     and not private.is_evening_section(m.id)
     and m.book_set is not distinct from e.book_set
     and m.subject is not distinct from e.subject
     and private.is_package_section(m.id) = private.is_package_section(e.id)
   order by m.time_block
   limit 1
$fn$;

comment on function private.recorded_source_section(bigint) is
  '저녁 반(화목금 인강 · 월수금 현장)의 오전 짝 — 같은 기수·강좌·트랙, 인강·저녁 아님, 같은 과정(A/B)·같은 과목, 같은 묶음 여부. 오전 반이면 null';

-- ─── 지금 있는 반 채우기 (한 번) ─────────────────────────────────────────────
create or replace function private.backfill_section_subjects()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  rec record;
  n_lc int; n_rc int; n_copy int := 0; n_set_sib int := 0; n_set_flip int := 0; n int;
begin
  -- ① 교재가 있던 시간 단위 반은 LC
  update public.class_sections cs
     set subject = 'lc'
   where cs.subject is null
     and cs.book_set is not null
     and exists (select 1 from public.courses c where c.id = cs.course_id and c.program = 'score')
     and not private.is_package_section(cs.id);
  get diagnostics n_lc = row_count;

  -- ② 같은 기수·강좌·시간대에 LC 가 있는 반대 트랙은 RC
  update public.class_sections cs
     set subject = 'rc'
   where cs.subject is null
     and exists (select 1 from public.courses c where c.id = cs.course_id and c.program = 'score')
     and not private.is_package_section(cs.id)
     and exists (
       select 1 from public.class_sections o
        where o.term_id = cs.term_id and o.course_id = cs.course_id
          and o.time_block is not distinct from cs.time_block
          and o.track <> cs.track and o.subject = 'lc');
  get diagnostics n_rc = row_count;

  -- ③ 기수를 달 순서로: 과목은 바로 앞 달 같은 자리를 잇고, 과정은 LC 짝의 글자 → 없으면 앞 달 같은 자리를 뒤집은 글자
  for rec in select t.id, t.year, t.month from public.terms t order by t.year, t.month loop
    update public.class_sections cs
       set subject = p.subject
      from public.class_sections p
      join public.terms pt on pt.id = p.term_id
     where cs.term_id = rec.id
       and cs.subject is null
       and exists (select 1 from public.courses c where c.id = cs.course_id and c.program = 'score')
       and not private.is_package_section(cs.id)
       and pt.year * 12 + pt.month = rec.year * 12 + rec.month - 1
       and p.course_id = cs.course_id and p.track = cs.track
       and p.time_block is not distinct from cs.time_block
       and p.subject is not null;
    get diagnostics n = row_count; n_copy := n_copy + n;

    update public.class_sections cs
       set book_set = o.book_set
      from public.class_sections o
     where cs.term_id = rec.id
       and cs.book_set is null
       and cs.subject is not null
       and o.term_id = cs.term_id and o.course_id = cs.course_id
       and o.time_block is not distinct from cs.time_block
       and o.id <> cs.id and o.book_set is not null
       and not private.is_package_section(o.id);
    get diagnostics n = row_count; n_set_sib := n_set_sib + n;

    update public.class_sections cs
       set book_set = case p.book_set when 'A' then 'B' when 'B' then 'A' end
      from public.class_sections p
      join public.terms pt on pt.id = p.term_id
     where cs.term_id = rec.id
       and cs.book_set is null
       and cs.subject is not null
       and pt.year * 12 + pt.month = rec.year * 12 + rec.month - 1
       and p.course_id = cs.course_id and p.track = cs.track
       and p.time_block is not distinct from cs.time_block
       and p.book_set in ('A', 'B');
    get diagnostics n = row_count; n_set_flip := n_set_flip + n;
  end loop;

  return jsonb_build_object('lc', n_lc, 'rc', n_rc, 'subject_copied', n_copy, 'set_from_sibling', n_set_sib, 'set_flipped', n_set_flip);
end;
$fn$;

select private.backfill_section_subjects();
drop function private.backfill_section_subjects();
