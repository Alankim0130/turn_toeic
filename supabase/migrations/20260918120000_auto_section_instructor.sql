-- ============================================================================
-- 담당 강사 자동 매칭 (2026-09-18 Alan 요청)
--
--  "담당강사 지정이 왜 아직 알런인지 모르겠어. 이혜영, 이영수로 맞춰서 변경쫌 부탁해.
--   그리고 앞으로도 반편성과 달에 따라서 자동으로 매칭되도록 설정부탁해."
--
--  지금까지는 /admin/sections 의 [편성표대로 채우기] 버튼을 **사람이 눌러야만** 담당이 바뀌었다.
--  9월 반 36개는 그 버튼을 누르기 전 상태(반을 만든 사람 = 알런)로 남아 있었다. 누르는 단계를 없앤다.
--
--  규칙은 그대로다 (도메인 규칙 1 "담당 강사는 과목으로 저절로 정해진다", src/lib/instructor-subject.ts):
--    · 반의 LC 교재(class_sections.book_set)가 있으면 그 시간은 LC → 이혜영(profiles.subject = 'lc'),
--      없으면 RC → 이영수('rc'). 같은 강좌·시간대 묶음에 교재가 하나도 없으면 안 넣은 것인지 RC 인지 몰라 그대로 둔다.
--    · 묶음 반(120분·140분)·스파르타 반은 두 과목을 이어 들어 담당이 한 명이 아니다 → 비운다.
--    · 그 과목 강사 계정이 아직 없으면(가입 전) 그대로 둔다.
--
--  이제 DB 가 스스로 맞춘다:
--    ① class_sections 에 반이 생기거나 편성(book_set · time_block · course_id · term_id · track)이 바뀌면 그 기수를 다시 맞춘다.
--    ② profiles 에 과목이 생기거나 등급이 바뀌면(강사 가입) 아직 안 끝난 기수를 전부 다시 맞춘다.
--    ③ 이 마이그레이션이 지금 있는 기수를 전부 한 번 맞춘다 (9월 36개가 여기서 고쳐진다).
--
--  손으로 바꾼 담당(instructor_id 만 바꾸는 UPDATE)은 트리거를 깨우지 않으므로 편성이 다시 바뀌기 전까지 남는다.
--  판정 한곳: private.section_instructor_plan(기수). 앱의 planSubjects 는 화면에 미리 보여 주는 용도이고
--  [편성표대로 채우기] 버튼은 public.sync_term_instructors(기수) 를 불러 같은 함수를 돌린다.
-- ============================================================================

-- ─── 1. 기수 하나의 계획: 반마다 (묶음인가 · 과목을 읽을 수 있나 · 과목 · 그 과목 강사) ─────────
create or replace function private.section_instructor_plan(p_term_id bigint)
returns table (
  section_id    bigint,
  current_id    uuid,      -- 지금 담당
  is_package    boolean,   -- 묶음 반·스파르타 반 → 담당을 비운다
  is_known      boolean,   -- 같은 강좌·시간대 묶음에 LC 교재가 하나라도 있어 과목을 읽을 수 있다
  subj          text,      -- lc | rc (is_known 일 때만 뜻이 있다)
  teacher_id    uuid       -- 그 과목의 강사. 계정이 없으면 null
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select cs.id, cs.course_id, cs.time_block, cs.book_set, cs.instructor_id,
           (c.program = 'sparta' or private.is_package_section(cs.id)) as pkg
      from public.class_sections cs
      join public.courses c on c.id = cs.course_id
     where cs.term_id = p_term_id
  ),
  known as (
    select distinct s.course_id, s.time_block from s where not s.pkg and s.book_set is not null
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
         (k.course_id is not null),
         case when s.book_set is not null then 'lc' else 'rc' end,
         t.id
    from s
    left join known k on k.course_id = s.course_id and k.time_block is not distinct from s.time_block
    left join teacher t on t.subject = case when s.book_set is not null then 'lc' else 'rc' end
$$;

comment on function private.section_instructor_plan(bigint) is
  '기수의 반마다 담당 강사 판정 (2026-09-18). 앱의 src/lib/instructor-subject.ts planSubjects 와 같은 규칙';

-- ─── 2. 기수 하나를 계획대로 맞춘다 → {assigned, cleared, unknown, missing[]} ────────────────
create or replace function private.sync_term_instructors(p_term_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assigned int := 0;
  v_cleared  int := 0;
  v_unknown  int := 0;
  v_missing  text[] := '{}';
begin
  with plan as (
    select * from private.section_instructor_plan(p_term_id)
  ),
  upd as (
    update public.class_sections cs
       set instructor_id = case when p.is_package then null else p.teacher_id end
      from plan p
     where cs.id = p.section_id
       and (p.is_package or (p.is_known and p.teacher_id is not null))
       and cs.instructor_id is distinct from (case when p.is_package then null else p.teacher_id end)
    returning p.is_package as pkg
  )
  select count(*) filter (where not u.pkg), count(*) filter (where u.pkg)
    into v_assigned, v_cleared
    from upd u;

  select count(*) filter (where not p.is_package and not p.is_known),
         coalesce(array_agg(distinct p.subj) filter (where not p.is_package and p.is_known and p.teacher_id is null), '{}')
    into v_unknown, v_missing
    from private.section_instructor_plan(p_term_id) p;

  return jsonb_build_object('assigned', v_assigned, 'cleared', v_cleared, 'unknown', v_unknown, 'missing', to_jsonb(v_missing));
end;
$$;

comment on function private.sync_term_instructors(bigint) is
  '기수의 담당 강사를 편성표대로 맞춘다 (2026-09-18). 트리거·마이그레이션·[편성표대로 채우기] 버튼이 부른다';

revoke all on function private.section_instructor_plan(bigint), private.sync_term_instructors(bigint) from public, anon;
grant execute on function private.section_instructor_plan(bigint), private.sync_term_instructors(bigint) to service_role;

-- ─── 3. 버튼용 공개 함수 (강사·관리자만) ──────────────────────────────────────────────────
create or replace function public.sync_term_instructors(p_term_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_term_id is null or not exists (select 1 from public.terms t where t.id = p_term_id) then
    raise exception 'invalid_term' using errcode = '22023';
  end if;
  return private.sync_term_instructors(p_term_id);
end;
$$;

comment on function public.sync_term_instructors(bigint) is
  '담당 강사 편성표대로 채우기 (2026-09-18). 트리거가 이미 자동으로 맞추고, 이 함수는 어긋나 보일 때 다시 맞추는 버튼용';

revoke all on function public.sync_term_instructors(bigint) from public, anon;
grant execute on function public.sync_term_instructors(bigint) to authenticated, service_role;

-- ─── 4. 반이 생기거나 편성이 바뀌면 그 기수를 다시 맞춘다 ─────────────────────────────────
--  문장 단위 트리거(transition table)라 일괄 개설 76개도 기수마다 한 번만 돈다.
--  Postgres 는 transition table 과 `update of 컬럼` 을 같이 못 쓰므로(0A000) 함수 안에서 편성 컬럼이
--  바뀐 행만 고른다 — sync 가 instructor_id 만 바꾸는 UPDATE 는 여기서 걸러져 재귀하지 않는다.
create or replace function private.tg_sections_sync_instructors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term bigint;
begin
  if tg_op = 'INSERT' then
    for v_term in select distinct c.term_id from changed c loop
      perform private.sync_term_instructors(v_term);
    end loop;
  elsif tg_op = 'UPDATE' then
    -- 편성 컬럼이 바뀐 반의 기수 (옮겨 간 기수와 떠난 기수 둘 다 — 묶음 관계가 달라질 수 있다)
    for v_term in
      select distinct x.term_id
        from (
          select c.term_id from changed c join before b on b.id = c.id
           where (c.book_set, c.time_block, c.course_id, c.term_id, c.track)
                 is distinct from (b.book_set, b.time_block, b.course_id, b.term_id, b.track)
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
$$;

drop trigger if exists class_sections_sync_instructors_ins on public.class_sections;
create trigger class_sections_sync_instructors_ins
  after insert on public.class_sections
  referencing new table as changed
  for each statement execute function private.tg_sections_sync_instructors();

drop trigger if exists class_sections_sync_instructors_upd on public.class_sections;
create trigger class_sections_sync_instructors_upd
  after update on public.class_sections
  referencing old table as before new table as changed
  for each statement execute function private.tg_sections_sync_instructors();

drop trigger if exists class_sections_sync_instructors_del on public.class_sections;
create trigger class_sections_sync_instructors_del
  after delete on public.class_sections
  referencing old table as before
  for each statement execute function private.tg_sections_sync_instructors();

-- ─── 5. 강사가 가입해 과목이 생기면 아직 안 끝난 기수를 전부 다시 맞춘다 ─────────────────────
--  (이영수가 나중에 가입해도 버튼을 누를 필요가 없다.) 학생 등급 변경은 subject 가 없어 바로 나간다.
create or replace function private.tg_profiles_sync_instructors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term bigint;
begin
  if new.subject is null or new.role not in ('instructor', 'admin') then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.subject is not distinct from new.subject and old.role = new.role then
    return null;
  end if;
  for v_term in
    select t.id from public.terms t
     where t.closes_at is null or t.closes_at >= private.today_kst()
  loop
    perform private.sync_term_instructors(v_term);
  end loop;
  return null;
end;
$$;

drop trigger if exists profiles_sync_instructors on public.profiles;
create trigger profiles_sync_instructors
  after insert or update of subject, role on public.profiles
  for each row execute function private.tg_profiles_sync_instructors();

-- ─── 6. 지금 있는 기수를 전부 한 번 맞춘다 (9월 36개: 시간 단위 20개 → 이혜영·이영수, 묶음·스파르타 16개 → 비움) ──
do $$
declare
  v_term bigint;
begin
  for v_term in select t.id from public.terms t order by t.id loop
    perform private.sync_term_instructors(v_term);
  end loop;
end;
$$;
