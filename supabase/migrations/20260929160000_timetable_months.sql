-- 시간표를 달마다 한 벌로 — 과정 A/B · 과목 LC/RC 도 시간표에서 (2026-09-29 Alan)
--
-- > "월별로 디테일하게 확인하기 위해서 최상단에 월별 설정을 할 수 있으면 좋겠어. 1월방학 시간표를 11월이나 12월달에 미리 세팅을 할예정인데,
-- >  그때 1월 시간표를 정확하게 세팅하고, 2월 시간표까지 미리 정확하게 세팅할 수 있기 때문이야."
-- > "시간대마다 A과정과 B과정이 LC, RC가 구분되어있잖아? 이것도 확인할 수 있고, 또 변경이 가능하면 좋겠어.
-- >  (기존의 매달 변경규칙은 그대로 가져가서 미리 세팅이 되어있으면 편할 것 같아)" · "시간대별로 과목도 미리 보여주면 좋겠어 … 직접 변경도"
-- > "이 모든 변경과 세팅은 가입되어있는 모든 학생들에게 (기존의 학생, 신규학생들)에게 적용이 되어야해."
--
-- 그동안(2026-09-23 ①) 시간표는 평달·방학달 두 벌이었고 반과 이어져 있지 않았다 — 반에는 시간이 글자(time_block)로 박혀 있을 뿐이고
-- 과정·과목은 반마다 따로 골랐다. 이제는:
--
--   * **달마다 한 벌.** year · month 가 있는 줄이 그 달 시간표다. 그 줄의 season 은 비운다 — 평달·방학달은 달이 정한다(앱의 VACATION_MONTHS).
--     year · month 가 빈 줄은 예전 두 벌(season 이 있는 줄)이고, 이제는 **앞선 같은 계절 달이 없을 때 시간을 가져오는 씨앗**으로만 쓴다
--     (2027년 1월처럼 처음 여는 방학달). 예전 앱은 season 으로만 거르므로 달 줄을 보지 못한다 — 배포 순서와 상관없이 같은 줄이 두 번 뜨지 않는다.
--   * **줄마다 과정(book_set A/B)과 트랙별 과목(subject_mwf · subject_ttf).** 편성표 그대로다 — 시간 단위 줄에만 있고,
--     한달완성(묶음) 줄과 스파르타 줄은 비운다 (그 반은 안에 든 · 함께 듣는 시간 단위 반의 것을 쓴다). 방학달 통짜 줄은 과정(= LC 교재 글자)만.
--   * **달 줄이 그 달 반의 진실이다.** 줄을 고치면 그 달(terms) · 같은 강좌(레벨 × 과정) · 같은 시간대 라벨의 반이 저절로 따라간다 —
--     time_block · book_set · subject(트랙별) · recorded(화목금 인강) · live_to_replay(저녁 줄 여부가 바뀔 때만 기본값으로).
--     그 반을 읽는 모든 것 — 담당 강사 자동 매칭 · 학생의 LC 교재 · 저녁 반 다시보기 짝 · 불라방 감지와 수업 시작 알림 · 출석 시간 ·
--     묶음 반 권한(시간 포함 관계) · 수강증 시간 대조 — 이 반의 칸을 그때그때 읽으므로 기존 학생·새 학생 모두에게 함께 맞춰진다.
--     값이 같은 반은 건드리지 않는다 (담당 강사 재매칭이 일부러 손으로 고친 담당을 되돌리지 않게).
--   * **한달완성(묶음) 줄은 안에 든 두 시간을 따라간다.** 시간 단위 줄의 시작·끝이 바뀌면 그 끝을 함께 쓰는 묶음 줄도 옮긴다 (점수보장반만 —
--     스파르타 190분·260분은 서로 다른 상품이라 겹쳐도 따라가지 않는다). 묶음 줄이 바뀌면 그 반의 이름도 위 규칙으로 함께 바뀐다.
--   * **그 달 반이 쓰고 있는 줄은 지울 수 없다** (timetable_slot_in_use) — 줄만 지우면 반은 남는데 시간표에서 보이지 않게 된다.
--
-- 9월·10월은 이미 반이 있어 **반에서 거꾸로 채운다** (같은 계절 기본 줄 + 그 반의 과정·과목) — 2026-09-29 조회로 확인: 반 72개 전부
-- 기본 줄과 라벨이 맞고, 두 트랙의 과정이 같고, 인강·라이브→다시보기가 시간표와 어긋난 반이 없다. 그래서 채워도 반은 한 칸도 바뀌지 않는다.

-- ─── 칸 ────────────────────────────────────────────────────────────────────
alter table public.timetable_slots
  add column if not exists year int,
  add column if not exists month int,
  add column if not exists book_set text,
  add column if not exists subject_mwf text,
  add column if not exists subject_ttf text;

-- season 의 기본값('regular', 20260916170000)도 뺀다 — 남겨 두면 season 을 안 적은 달 줄이 평달 기본 줄로 들어가려다 아래 검사에 걸린다
alter table public.timetable_slots alter column season drop not null;
alter table public.timetable_slots alter column season drop default;

alter table public.timetable_slots
  add constraint timetable_slots_year_check check (year between 2020 and 2100),
  add constraint timetable_slots_month_check check (month between 1 and 12),
  -- 기본 줄 = season 만 · 달 줄 = year·month 만 (둘을 섞으면 예전 앱이 달 줄을 기본 줄로 읽는다)
  add constraint timetable_slots_kind_check check (
    (year is null and month is null and season is not null)
    or (year is not null and month is not null and season is null)),
  add constraint timetable_slots_book_set_check check (book_set in ('A', 'B')),
  add constraint timetable_slots_subject_mwf_check check (subject_mwf in ('lc', 'rc')),
  add constraint timetable_slots_subject_ttf_check check (subject_ttf in ('lc', 'rc'));

alter table public.timetable_slots drop constraint timetable_slots_level_program_season_time_key;
create unique index timetable_slots_template_key
  on public.timetable_slots (level, program, season, start_time, end_time) where year is null;
create unique index timetable_slots_month_key
  on public.timetable_slots (year, month, level, program, start_time, end_time) where year is not null;

comment on table public.timetable_slots is
  '수업 시간표 (2026-09-29 부터 달마다 한 벌). year·month 줄 = 그 달 시간표이자 그 달 반의 진실 — 고치면 반(time_block·과정·과목·인강)이 따라간다. '
  'year 가 빈 줄 = 예전 평달·방학달 두 벌, 처음 여는 계절의 씨앗. 랜딩 수업시간표 · 반 일괄 개설 · 저녁 줄 판정이 읽는다. /admin/timetable 에서 강사·관리자가 고친다';
comment on column public.timetable_slots.year is '달 줄의 연도. 비어 있으면 기본 줄(season 으로 평달·방학달)';
comment on column public.timetable_slots.month is '달 줄의 달 (1~12). 평달·방학달은 이 값이 정한다 — season 은 비운다';
comment on column public.timetable_slots.book_set is
  '과정 A|B (편성표). 시간 단위 줄만 — 두 트랙이 같고 달마다 뒤바뀐다. LC 시간에는 곧 LC 교재. 방학달 통짜 줄은 교재 글자. 한달완성·스파르타 줄은 null';
comment on column public.timetable_slots.subject_mwf is '월수금 반의 과목 lc|rc. 시간 단위 줄만 (묶음·스파르타·방학달 통짜 줄은 null)';
comment on column public.timetable_slots.subject_ttf is '화목금 반의 과목 lc|rc. 시간 단위 줄만 (묶음·스파르타·방학달 통짜 줄은 null)';

-- ─── 라벨 ──────────────────────────────────────────────────────────────────
-- 반의 time_block 과 같은 모양 ("10:00~11:00") — 앱의 timeBlockOf 와 같다
create or replace function private.slot_label(p_start time, p_end time)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_start, 'HH24:MI') || '~' || to_char(p_end, 'HH24:MI')
$$;

-- ─── 달 줄 → 그 달 반 ───────────────────────────────────────────────────────
create or replace function private.tg_timetable_month_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term bigint;
  v_to text := private.slot_label(new.start_time, new.end_time);
  v_from text := v_to;
  v_level int := new.level;
  v_program text := new.program;
  v_evening_changed boolean := false;
begin
  if new.year is null then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    v_from := private.slot_label(old.start_time, old.end_time);
    v_level := old.level;
    v_program := old.program;
    v_evening_changed := old.ttf_recorded is distinct from new.ttf_recorded;
  end if;

  select t.id into v_term from public.terms t where t.year = new.year and t.month = new.month;
  if v_term is not null then
    update public.class_sections s
       set time_block = x.time_block,
           book_set = x.book_set,
           subject = x.subject,
           recorded = x.recorded,
           live_to_replay = x.live_to_replay
      from (
        select cs.id,
               v_to as time_block,
               new.book_set as book_set,
               case cs.track when 'mwf' then new.subject_mwf when 'ttf' then new.subject_ttf else cs.subject end as subject,
               (cs.track = 'ttf' and new.ttf_recorded) as recorded,
               case when v_evening_changed then not new.ttf_recorded else cs.live_to_replay end as live_to_replay
          from public.class_sections cs
         where cs.term_id = v_term
           and cs.time_block = v_from
           and cs.course_id in (select c.id from public.courses c where c.target_score = v_level and c.program = v_program)
      ) x
     where s.id = x.id
       and (s.time_block, s.book_set, s.subject, s.recorded, s.live_to_replay)
           is distinct from (x.time_block, x.book_set, x.subject, x.recorded, x.live_to_replay);
  end if;

  -- 한달완성(묶음) 줄은 안에 든 시간을 따라간다 — 끝을 함께 쓰는 줄만 (점수보장반)
  if tg_op = 'UPDATE' and new.program = 'score'
     and (old.start_time, old.end_time) is distinct from (new.start_time, new.end_time) then
    update public.timetable_slots p
       set start_time = case when p.start_time = old.start_time then new.start_time else p.start_time end,
           end_time = case when p.end_time = old.end_time then new.end_time else p.end_time end
     where p.year = new.year and p.month = new.month
       and p.level = new.level and p.program = 'score'
       and p.id <> new.id
       and p.start_time <= old.start_time and p.end_time >= old.end_time
       and (p.start_time, p.end_time) <> (old.start_time, old.end_time)
       and (p.start_time = old.start_time or p.end_time = old.end_time);
  end if;

  return null;
end;
$$;

drop trigger if exists timetable_slots_month_sync_ins on public.timetable_slots;
create trigger timetable_slots_month_sync_ins
  after insert on public.timetable_slots
  for each row when (new.year is not null)
  execute function private.tg_timetable_month_sync();

drop trigger if exists timetable_slots_month_sync_upd on public.timetable_slots;
create trigger timetable_slots_month_sync_upd
  after update on public.timetable_slots
  for each row when (
    new.year is not null
    and (old.start_time, old.end_time, old.ttf_recorded, old.book_set, old.subject_mwf, old.subject_ttf)
        is distinct from (new.start_time, new.end_time, new.ttf_recorded, new.book_set, new.subject_mwf, new.subject_ttf))
  execute function private.tg_timetable_month_sync();

-- ─── 그 달 반이 쓰는 줄은 지우지 않는다 ─────────────────────────────────────
create or replace function private.tg_timetable_month_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term bigint;
  v_n int;
begin
  select t.id into v_term from public.terms t where t.year = old.year and t.month = old.month;
  if v_term is null then
    return old;
  end if;
  select count(*) into v_n
    from public.class_sections s
   where s.term_id = v_term
     and s.time_block = private.slot_label(old.start_time, old.end_time)
     and s.course_id in (select c.id from public.courses c where c.target_score = old.level and c.program = old.program);
  if v_n > 0 then
    raise exception 'timetable_slot_in_use'
      using errcode = 'P0001', detail = v_n::text, hint = '그 달 반이 이 시간대를 쓰고 있어요. 반 편성에서 반을 먼저 정리해 주세요.';
  end if;
  return old;
end;
$$;

drop trigger if exists timetable_slots_month_guard on public.timetable_slots;
create trigger timetable_slots_month_guard
  before delete on public.timetable_slots
  for each row when (old.year is not null)
  execute function private.tg_timetable_month_guard();

-- ─── 이미 반이 있는 달(9월 · 10월)은 반에서 거꾸로 채운다 ──────────────────────
-- 1) 그 계절 기본 줄마다 달 줄을 만들고 과정·과목은 그 달 반에서 읽는다 (반이 없는 줄은 비워 둔다)
insert into public.timetable_slots (year, month, level, program, season, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf)
select t.year, t.month, s.level, s.program, null, s.start_time, s.end_time, s.ttf_recorded,
       sec.book_set, sec.subject_mwf, sec.subject_ttf
  from public.terms t
  join public.timetable_slots s
    on s.year is null
   and s.season = case when t.month in (1, 2, 7, 8) then 'vacation' else 'regular' end
  left join lateral (
    select max(cs.book_set) as book_set,
           max(cs.subject) filter (where cs.track = 'mwf') as subject_mwf,
           max(cs.subject) filter (where cs.track = 'ttf') as subject_ttf
      from public.class_sections cs
      join public.courses c on c.id = cs.course_id
     where cs.term_id = t.id
       and c.target_score = s.level and c.program = s.program
       and cs.time_block = private.slot_label(s.start_time, s.end_time)
  ) sec on true
 where exists (select 1 from public.class_sections cs where cs.term_id = t.id);

-- 2) 기본 줄에 없는 시간대로 만든 반이 있으면 그 반의 시간으로도 줄을 만든다 (2026-09-29 조회로는 없다 — 빠뜨리지 않게만)
insert into public.timetable_slots (year, month, level, program, season, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf)
select t.year, t.month, c.target_score, c.program, null,
       split_part(cs.time_block, '~', 1)::time, split_part(cs.time_block, '~', 2)::time,
       bool_or(cs.track = 'ttf' and cs.recorded),
       max(cs.book_set),
       max(cs.subject) filter (where cs.track = 'mwf'),
       max(cs.subject) filter (where cs.track = 'ttf')
  from public.class_sections cs
  join public.terms t on t.id = cs.term_id
  join public.courses c on c.id = cs.course_id
 where cs.time_block ~ '^\d{2}:\d{2}~\d{2}:\d{2}$'
   and c.target_score is not null
   and not exists (
     select 1 from public.timetable_slots x
      where x.year = t.year and x.month = t.month and x.level = c.target_score and x.program = c.program
        and private.slot_label(x.start_time, x.end_time) = cs.time_block)
   and exists (select 1 from public.timetable_levels l where l.level = c.target_score)
 group by t.year, t.month, c.target_score, c.program, cs.time_block;
