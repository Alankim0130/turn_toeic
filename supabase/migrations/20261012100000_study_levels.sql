-- ============================================================================
-- 스터디 레벨 — 단어 스터디 · 비대면 스터디 둘만, 레벨 1 · 2 · 3 으로 신청한다 (2026-10-12 Alan)
--   "대면스터디 명칭을 '단어 스터디'로 바꿔줘. 그리고 레벨을 쫌 구분해서 신청을 받을거야. 레벨 1, 2, 3 이렇게 크게 3단계야.
--    단어스터디는 레벨1,2 / 비대면 스터디는 레벨1,2,3. 그리고 내가 신청한 레벨만 자료를 볼 수 있어도록 설정해줘.
--    그리고 학생이 스터디 레벨을 변경하고 싶다면 신청한 후 조교나 강사승인이 있어야지 변경이 가능하도록해줘.
--    기존에 있던 비대면스터디 자료도 레벨별로 업로드가 가능하도록"
--   → "신청한 학생은 없어. 기존 단어스터디를 없애자. 레벨은 학생이 직접 고르는걸로 일단 해줘. 시간대마다 레벨을 고를 수 있도록 해줘"
--
--   1. 종류는 둘 — offline(= **단어 스터디**, 옛 대면스터디 — 시간대를 골라 신청) · online(비대면). 옛 단어스터디(vocab)는 없앤다 (신청자 없음 — Alan).
--      값 'offline' 은 그대로 둔다 — 화면 이름만 바뀐다 (저장된 값 · 정책 · 함수가 그 글자를 본다).
--   2. 레벨
--      * 단어 스터디: **시간대마다** 강사가 레벨(1 · 2)을 정한다 (study_slots.level). 학생은 시간대를 고르고 레벨은 그 시간대의 것이다 (study_signups.level 로 복사).
--      * 비대면: 학생이 신청할 때 레벨(1 · 2 · 3)을 직접 고른다 (study_signups.level — 새 신청은 꼭 고른다).
--      * 레벨이 생기기 전 신청(10월 비대면)은 level 이 비어 있다 — 학생이 내 스터디에서 **한 번은 바로** 고른다 (승인 없이, set_study_level).
--   3. 자료는 레벨마다 올린다 — study_material_items.level: 0 = **모든 레벨 공통**, 1 · 2 · 3. 회차 × 레벨이 한 칸이다.
--      지금까지 올린 자료는 전부 공통(0)이 된다 — 레벨 없이 신청한 학생도 그대로 받는다.
--      학생은 **내 레벨의 자료와 공통 자료만** 본다 (조회 정책 · 인증 정책 · 저장소는 그 행으로 판정한다). 레벨을 아직 안 고른 학생은 공통만.
--   4. 레벨 변경은 **요청 → 조교 · 강사 승인** — study_signups.requested_level(· requested_slot_id) 에 적어 두고(set_study_level),
--      decide_study_level(승인 · 거절)이 바꾼다. 학생은 level 칸을 직접 못 고친다 (트리거 study_signups_level — 시간대를 옮겨도 레벨이 바뀌면 막는다).
--      결과(request_result · request_decided_at)는 학생이 내 스터디에서 본다 (알림은 보내지 않는다 — 요청받지 않은 기능이다).
--   5. 함수 셋은 auth.uid() 로 거른다 (학생용 둘) · is_crew() (승인). 레벨 규칙은 private.study_level_max(kind) 한곳 = 앱 STUDY_LEVELS (src/lib/study.ts).
-- ============================================================================

-- ─── 1. 옛 단어스터디(vocab) 없애기 ────────────────────────────────────────────
-- Alan "신청한 학생은 없어" — 그래도 배포가 멈추지 않게 신청 → 스터디(시간대는 cascade) 순서로 지운다
delete from public.study_signups g
 where exists (select 1 from public.studies s where s.id = g.study_id and s.kind = 'vocab');
delete from public.study_materials m
 where exists (select 1 from public.studies s where s.id = m.study_id and s.kind = 'vocab');
delete from public.studies where kind = 'vocab';

-- kind check 를 둘로 — 이름이 자동으로 붙은 제약이라 정의로 찾아 지운다
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.studies'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.studies drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.studies add constraint studies_kind_check check (kind in ('offline', 'online'));
comment on table public.studies is
  '월별 스터디. kind: offline=단어 스터디(시간대 · 레벨 1~2, 2026-10-12 — 그전 이름 대면스터디), online=비대면(레벨 1~3). vocab 은 2026-10-12 없앴다. status: draft 비공개 / open 신청 중 / closed 신청 마감';

-- 시간대는 단어 스터디에만 (예전엔 offline · vocab)
drop policy "study_slots: 스태프 등록" on public.study_slots;
create policy "study_slots: 스태프 등록" on public.study_slots
  for insert to authenticated
  with check (
    (select private.is_staff())
    and exists (select 1 from public.studies s where s.id = study_slots.study_id and s.kind = 'offline')
  );

-- ─── 2. 레벨 칸 ───────────────────────────────────────────────────────────────
-- 시간대의 레벨 (단어 스터디 1 · 2). 레벨이 생기기 전 시간대는 비어 있다 — 화면이 '레벨 미정' 으로 보여 주고 강사가 채운다
alter table public.study_slots
  add column if not exists level smallint check (level is null or level between 1 and 2);
comment on column public.study_slots.level is '단어 스터디 시간대의 레벨 1 · 2 (2026-10-12 Alan "시간대마다 레벨을 고를 수 있도록"). 신청하면 study_signups.level 로 복사된다';
grant insert (level) on public.study_slots to authenticated;
grant update (level) on public.study_slots to authenticated;

alter table public.study_signups
  add column if not exists level smallint check (level is null or level between 1 and 3),
  add column if not exists requested_level smallint check (requested_level is null or requested_level between 1 and 3),
  add column if not exists requested_slot_id bigint,
  add column if not exists requested_at timestamptz,
  add column if not exists request_result text check (request_result is null or request_result in ('approved', 'rejected')),
  add column if not exists request_decided_at timestamptz;
comment on column public.study_signups.level is
  '신청한 레벨 — 비대면 1~3 (학생이 고른다), 단어 스터디는 시간대의 레벨이 복사된다. 비어 있으면 레벨이 생기기 전 신청 — 학생이 한 번은 바로 고른다 (set_study_level)';
comment on column public.study_signups.requested_level is
  '레벨 변경 요청 (2026-10-12 Alan "조교나 강사승인이 있어야지 변경이 가능"). decide_study_level 이 승인 · 거절하며 비운다';
comment on column public.study_signups.request_result is '마지막 변경 요청의 결과 approved · rejected (학생이 내 스터디에서 본다). 새 요청을 내면 비운다';
grant insert (level) on public.study_signups to authenticated;

-- 자료는 레벨마다 — 0 = 모든 레벨 공통 (지금까지 올린 자료는 전부 공통이 된다)
alter table public.study_material_items
  add column if not exists level smallint not null default 0 check (level between 0 and 3);
alter table public.study_materials
  add column if not exists level smallint not null default 0 check (level between 0 and 3);
comment on column public.study_material_items.level is '자료의 레벨 — 0 공통(모든 레벨) · 1 · 2 · 3 (2026-10-12). 회차 × 레벨이 한 칸이다';
comment on column public.study_materials.level is '그 달 적용분의 레벨 — 자료실(study_material_items.level)에서 복사. 학생은 내 레벨과 공통(0)만 본다';

-- 회차 하나에 자료 하나 → 회차 × 레벨에 하나. 자동 이름의 unique 를 정의로 찾아 지운다
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.study_material_items'::regclass
       and contype = 'u'
       and pg_get_constraintdef(oid) = 'UNIQUE (seq)'
  loop
    execute format('alter table public.study_material_items drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.study_material_items add constraint study_material_items_seq_level_key unique (seq, level);

drop index if exists public.study_materials_study_seq_key;
create unique index if not exists study_materials_study_seq_level_key on public.study_materials (study_id, seq, level);

-- ─── 3. 레벨 규칙 ─────────────────────────────────────────────────────────────
-- 종류마다 고를 수 있는 가장 높은 레벨 — 앱 STUDY_LEVELS(src/lib/study.ts)와 같은 값. 바꾸면 둘 다
create or replace function private.study_level_max(p_kind text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (case when p_kind = 'online' then 3 when p_kind = 'offline' then 2 else 0 end)::smallint
$$;
revoke all on function private.study_level_max(text) from public, anon;
grant execute on function private.study_level_max(text) to authenticated, service_role;

-- 레벨 변경이 함수(set_study_level · decide_study_level)를 거쳐 왔는가 — 트랜잭션 안에서만 사는 표시
create or replace function private.study_level_bypass()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('private.study_level_bypass', true), '') = '1'
$$;
revoke all on function private.study_level_bypass() from public, anon, authenticated;

/*
 * 신청 행의 레벨 규칙 (BEFORE INSERT · UPDATE — study_signups_sync 보다 먼저 돈다, 이름 순).
 *  - 단어 스터디: 레벨은 늘 시간대의 것 (slot.level 복사). 비대면: 새 신청은 레벨을 꼭 고른다 (1~3).
 *  - 레벨 · 변경 요청 칸을 바꾸는 것은 함수(bypass)와 스태프 · 조교 · 서비스 롤만 — 학생이 시간대를 옮겨 레벨이 달라지면 막는다 (study_level_locked).
 *    레벨이 비어 있던 신청(레벨 전 10월)은 시간대를 옮겨 레벨이 처음 생기는 것을 막지 않는다.
 *  - 넣을 때 변경 요청 칸은 비운다.
 */
create or replace function private.study_signups_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_slot_level smallint;
  v_free boolean;
begin
  select s.kind into v_kind from public.studies s where s.id = new.study_id;
  if v_kind is null then
    raise exception 'study_not_found' using errcode = '23503';
  end if;

  -- 단어 스터디: 레벨 = 시간대의 레벨
  if v_kind = 'offline' then
    if new.slot_id is not null then
      select l.level into v_slot_level from public.study_slots l where l.id = new.slot_id;
      new.level := v_slot_level;
    else
      new.level := null;
    end if;
  elsif new.level is not null and (new.level < 1 or new.level > private.study_level_max(v_kind)) then
    raise exception 'study_level_rule' using errcode = '23514', detail = '이 스터디에서 고를 수 있는 레벨이 아닙니다.';
  end if;

  if tg_op = 'INSERT' then
    if v_kind = 'online' and new.level is null then
      raise exception 'study_level_required' using errcode = '23514', detail = '비대면 스터디는 레벨을 골라 신청합니다.';
    end if;
    new.requested_level := null;
    new.requested_slot_id := null;
    new.requested_at := null;
    new.request_result := null;
    new.request_decided_at := null;
    return new;
  end if;

  -- UPDATE — 누가 바꾸나
  v_free := private.study_level_bypass()
         or (select auth.uid()) is null            -- 서비스 롤 · 트리거 안
         or (select private.is_crew());
  if not v_free then
    if old.level is not null and new.level is distinct from old.level then
      raise exception 'study_level_locked' using errcode = '42501',
        detail = '레벨을 바꾸려면 변경 요청을 내고 조교 · 강사의 승인을 받아야 합니다.';
    end if;
    if (new.requested_level, new.requested_slot_id, new.requested_at, new.request_result, new.request_decided_at)
       is distinct from (old.requested_level, old.requested_slot_id, old.requested_at, old.request_result, old.request_decided_at) then
      raise exception 'study_level_locked' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.study_signups_level() from public, anon, authenticated;

drop trigger if exists study_signups_level on public.study_signups;
create trigger study_signups_level
  before insert or update on public.study_signups
  for each row execute function private.study_signups_level();

-- 강사가 시간대의 레벨을 바꾸면 그 시간대 신청자의 레벨도 따라간다 (단어 스터디의 레벨은 늘 시간대의 것)
create or replace function private.study_slots_level_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.level is distinct from old.level then
    perform set_config('private.study_level_bypass', '1', true);
    update public.study_signups set level = new.level where slot_id = new.id and level is distinct from new.level;
    perform set_config('private.study_level_bypass', '', true);
  end if;
  return null;
end;
$$;
revoke all on function private.study_slots_level_sync() from public, anon, authenticated;

drop trigger if exists study_slots_level_sync on public.study_slots;
create trigger study_slots_level_sync
  after update of level on public.study_slots
  for each row execute function private.study_slots_level_sync();

-- ─── 4. 학생 — 레벨 고르기 · 변경 요청 · 요청 취소 ───────────────────────────────
/*
 * 레벨 고르기 또는 변경 요청 (학생 본인 — auth.uid()).
 *  - 비대면: p_level (1~3). 단어 스터디: p_slot_id (그 시간대의 레벨이 곧 레벨).
 *  - 아직 레벨이 없으면(레벨 전 신청) **바로** 적용한다 — 단어 스터디는 신청 받는 중일 때만 시간대를 옮기고, 아니면 요청으로 남긴다.
 *  - 레벨이 있으면 변경 요청으로 남긴다 (조교 · 강사 승인 — decide_study_level). 같은 레벨이면 거절한다.
 * 돌려주는 것: {"applied": true|false}
 */
create or replace function public.set_study_level(p_signup_id bigint, p_level int default null, p_slot_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  g record;
  s record;
  v_level smallint;
  v_slot bigint := null;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_level is not null and (p_level < 1 or p_level > 3) then
    raise exception 'study_level_rule' using errcode = '23514';
  end if;
  v_level := p_level::smallint;
  select * into g from public.study_signups where id = p_signup_id and user_id = v_uid;
  if not found then
    raise exception 'study_signup_not_found' using errcode = 'P0001';
  end if;
  select st.id, st.kind, st.status, st.term_id into s from public.studies st where st.id = g.study_id;
  if s.status = 'draft' or not private.is_term_enrollee(s.term_id) then
    raise exception 'study_not_enrollee' using errcode = '42501';
  end if;

  if s.kind = 'offline' then
    if p_slot_id is null then
      raise exception 'study_slot_rule' using errcode = '23514', detail = '단어 스터디는 시간대를 골라야 합니다.';
    end if;
    select l.level into v_level from public.study_slots l where l.id = p_slot_id and l.study_id = s.id;
    if not found then
      raise exception 'study_slot_rule' using errcode = '23514', detail = '이 스터디의 시간대가 아닙니다.';
    end if;
    if v_level is null then
      raise exception 'study_slot_level_missing' using errcode = 'P0001';
    end if;
    v_slot := p_slot_id;
  else
    if v_level is null or v_level < 1 or v_level > private.study_level_max(s.kind) then
      raise exception 'study_level_rule' using errcode = '23514';
    end if;
  end if;

  if g.level is not null and g.level = v_level and (s.kind <> 'offline' or g.slot_id = v_slot) then
    raise exception 'study_level_same' using errcode = 'P0001';
  end if;

  perform set_config('private.study_level_bypass', '1', true);
  -- 레벨이 아직 없으면 바로 (단어 스터디는 신청 받는 중일 때만 시간대를 옮긴다 — 아니면 아래 요청으로)
  if g.level is null and (s.kind <> 'offline' or private.study_signup_open(s.id)) then
    update public.study_signups
       set level = v_level,
           slot_id = coalesce(v_slot, slot_id),
           requested_level = null, requested_slot_id = null, requested_at = null,
           request_result = null, request_decided_at = null
     where id = g.id;
    perform set_config('private.study_level_bypass', '', true);
    return jsonb_build_object('applied', true, 'level', v_level);
  end if;

  update public.study_signups
     set requested_level = v_level,
         requested_slot_id = v_slot,
         requested_at = now(),
         request_result = null,
         request_decided_at = null
   where id = g.id;
  perform set_config('private.study_level_bypass', '', true);
  return jsonb_build_object('applied', false, 'level', v_level);
end;
$$;
comment on function public.set_study_level(bigint, int, bigint) is
  '학생이 스터디 레벨을 고르거나(레벨이 없던 신청 — 바로) 변경을 요청한다(조교 · 강사 승인 — decide_study_level). auth.uid() 로 거른다 (2026-10-12)';
revoke all on function public.set_study_level(bigint, int, bigint) from public, anon;
grant execute on function public.set_study_level(bigint, int, bigint) to authenticated;

-- 변경 요청 취소 (학생 본인)
create or replace function public.cancel_study_level_request(p_signup_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  n int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  perform set_config('private.study_level_bypass', '1', true);
  update public.study_signups
     set requested_level = null, requested_slot_id = null, requested_at = null
   where id = p_signup_id and user_id = v_uid and requested_level is not null;
  get diagnostics n = row_count;
  perform set_config('private.study_level_bypass', '', true);
  return n > 0;
end;
$$;
revoke all on function public.cancel_study_level_request(bigint) from public, anon;
grant execute on function public.cancel_study_level_request(bigint) to authenticated;

-- ─── 5. 조교 · 강사 — 승인 · 거절 ─────────────────────────────────────────────
/*
 * 레벨 변경 요청을 승인하거나 거절한다 (is_crew — 스터디는 조교가 운영한다, 2026-10-03 Alan).
 * 승인: 단어 스터디는 요청한 시간대로 옮기고(정원은 study_signups_sync 가 본다 — 찼으면 study_slot_full), 비대면은 레벨만 바꾼다.
 * 결과는 request_result 에 남고 요청 칸은 비운다. 돌려주는 것: {"result": "approved"|"rejected", "level": N}
 */
create or replace function public.decide_study_level(p_signup_id bigint, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
  s record;
  v_slot_level smallint;
begin
  if not (select private.is_crew()) then
    raise exception 'crew_only' using errcode = '42501';
  end if;
  select * into g from public.study_signups where id = p_signup_id;
  if not found or g.requested_level is null then
    raise exception 'study_request_not_found' using errcode = 'P0001';
  end if;
  select st.id, st.kind into s from public.studies st where st.id = g.study_id;

  perform set_config('private.study_level_bypass', '1', true);
  if not p_approve then
    update public.study_signups
       set requested_level = null, requested_slot_id = null, requested_at = null,
           request_result = 'rejected', request_decided_at = now()
     where id = g.id;
    perform set_config('private.study_level_bypass', '', true);
    return jsonb_build_object('result', 'rejected', 'level', g.level);
  end if;

  if s.kind = 'offline' then
    select l.level into v_slot_level from public.study_slots l where l.id = g.requested_slot_id and l.study_id = s.id;
    if not found or v_slot_level is distinct from g.requested_level then
      perform set_config('private.study_level_bypass', '', true);
      raise exception 'study_slot_gone' using errcode = 'P0001', detail = '요청한 시간대가 없어졌거나 레벨이 바뀌었습니다.';
    end if;
    update public.study_signups
       set slot_id = g.requested_slot_id,
           requested_level = null, requested_slot_id = null, requested_at = null,
           request_result = 'approved', request_decided_at = now()
     where id = g.id;
  else
    update public.study_signups
       set level = g.requested_level,
           requested_level = null, requested_slot_id = null, requested_at = null,
           request_result = 'approved', request_decided_at = now()
     where id = g.id;
  end if;
  perform set_config('private.study_level_bypass', '', true);
  return jsonb_build_object('result', 'approved', 'level', g.requested_level);
end;
$$;
comment on function public.decide_study_level(bigint, boolean) is
  '스터디 레벨 변경 요청 승인 · 거절 — 강사 · 관리자 · 조교 (2026-10-12 Alan "조교나 강사승인이 있어야지 변경이 가능")';
revoke all on function public.decide_study_level(bigint, boolean) from public, anon;
grant execute on function public.decide_study_level(bigint, boolean) to authenticated, service_role;

-- ─── 6. 자료 — 레벨마다 적용 (20261005120000 의 함수에 level 만 더했다) ──────────────
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
      (study_id, seq, level, date, item_id, title, note, file_path, file_name, file_size, content_type, uploaded_by, updated_at)
    select r.study_id, d.seq, i.level, d.date, i.id, i.title, i.note, i.file_path, i.file_name, i.file_size, i.content_type, i.uploaded_by, now()
      from private.online_study_days(r.term_id) d
      join public.study_material_items i on i.seq = d.seq
    on conflict (study_id, seq, level) do update
       set date = excluded.date, item_id = excluded.item_id, title = excluded.title, note = excluded.note, file_path = excluded.file_path,
           file_name = excluded.file_name, file_size = excluded.file_size, content_type = excluded.content_type,
           uploaded_by = excluded.uploaded_by, updated_at = now()
     where (m.date, m.item_id, m.title, m.note, m.file_path, m.file_name, m.file_size, m.content_type)
           is distinct from
           (excluded.date, excluded.item_id, excluded.title, excluded.note, excluded.file_path, excluded.file_name, excluded.file_size, excluded.content_type);

    -- 더는 없는 회차 × 레벨(수업일이 줄었거나 자료를 지웠다)은 뺀다 — 인증이 붙은 행은 남긴다 (지우면 인증이 함께 지워진다)
    delete from public.study_materials m
     where m.study_id = r.study_id
       and not exists (
         select 1
           from private.online_study_days(r.term_id) d
           join public.study_material_items i on i.seq = d.seq
          where d.seq = m.seq and i.level = m.level)
       and not exists (select 1 from public.study_checkins c where c.material_id = m.id);
  end loop;
end;
$$;
revoke all on function private.sync_online_materials() from public, anon, authenticated;

-- ─── 7. 조회 — 내 레벨의 자료와 공통 자료만 (스태프 · 조교 확인이 맨 앞 — 2026-10-09 "화면 전환 속도" 4) ──
drop policy "study_materials: 신청자·스태프·조교 조회" on public.study_materials;
create policy "study_materials: 신청자·스태프·조교 조회" on public.study_materials
  for select to authenticated
  using (
    (select private.is_crew())
    or (
      date <= (select private.today_kst())
      and exists (
        select 1
          from public.study_signups g
          join public.studies s on s.id = g.study_id
         where g.study_id = study_materials.study_id
           and g.user_id = (select auth.uid())
           and (study_materials.level = 0 or study_materials.level = g.level)
           and private.has_term_access(s.term_id)
      )
    )
  );

-- 인증도 내 레벨 · 공통 자료에만
drop policy "study_checkins: 본인 인증" on public.study_checkins;
create policy "study_checkins: 본인 인증" on public.study_checkins
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.study_materials m
        join public.studies s on s.id = m.study_id
        join public.study_signups sg on sg.study_id = s.id and sg.user_id = (select auth.uid())
       where m.id = study_checkins.material_id
         and m.date <= (select private.today_kst())
         and (m.level = 0 or m.level = sg.level)
         and private.has_term_access(s.term_id)
    )
  );

-- 지금 열려 있는 달의 적용분을 레벨 칸까지 맞춘다 (기존 행은 전부 공통 0 — 바뀌는 값은 없다)
select private.sync_online_materials();
