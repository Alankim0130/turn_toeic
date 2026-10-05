-- ============================================================================
-- 850 2주완성 (2026-10-05 Alan — "850반 2주완성반이 있어. 새로운 등급을 만들어야해. 단과반은 없어. 대신 불라방은 있어.
-- 2주완성은 절반만 수업을 듣는거야. 개강일부터 시작이야." · 고른 것 "같은 850 수업의 앞 절반" · "앞 절반 마지막 수업일에 자동으로")
--
--  * 과정(courses.program · timetable_slots.program)에 twoweek 를 더한다 — 강좌 `850+ 2주완성`(TWOWEEK850, 목표 850, 종합).
--    단과(60 · 70분)는 없다 — 850 시간 전체(12:30~15:00) 한 줄이다.
--  * 2주완성 반은 **그릇**이다 (속성반처럼 과정 · 과목 · 담당 강사가 없다): 같은 기수 · 같은 트랙에서 시간이 안에 드는 850 점수보장반
--    시간 단위 반(12:30~13:40 · 13:50~15:00)을 품는다 (private.section_includes). 교실 · 불라방 링크 · 다시보기 · LC 교재 · 수업자료가
--    일반 850 과 같다 — 링크 · 녹화본은 시간 단위 반에 한 번만 둔다. 주5일이면 월수금 · 화목금 두 반에 배정한다.
--  * **개강일부터 앞 절반만**: 2주완성 반의 종강일 = 그 달 수업일(월수금 + 화목금 합쳐 날짜순, 개강일~종강일 안)의 앞 절반 마지막 날
--    (private.term_half_date — N일이면 ceil(N/2) 번째: 18일 → 9번째, 19일 → 10번째). 회차(session_dates)도 개강일부터 그날까지만.
--    강사가 날짜를 정하지 않는다 — 달력(수업일 · 개강일 · 종강일)을 고치면 저절로 다시 맞춘다 (private.sync_section_schedule).
--    반의 종강일이 곧 권한의 끝이라(has_section_access · my_section_ids 는 배정된 반의 날짜를 본다) 그다음 날부터 품은 반까지 모두 닫히고,
--    등록 기간(sync_order_window)도 그날로 맞춰져 상태 · 등급이 날짜대로 바뀐다 (만료 · 졸업생). 수업일이 아직 없으면 개강일 하루로 둔다.
--  * 현장 · 불라방 둘 다 (enrollments.mode). 불라방 시작 알림 · 출석도 품는 반 · 제 회차로 그대로 간다.
--    유튜브 송출 감지 후보는 아니다 (점수보장반 시간 단위 반만 — 그대로).
--  * 시간표: 이번 달부터 이미 만든 달 시간표에 850 2주완성 줄을 그 달 850 시간(가장 이른 시작 ~ 가장 늦은 끝)으로 넣는다.
--    850 시간을 고치면 2주완성 줄도 따라간다 (tg_timetable_month_sync — 한달완성 줄과 같은 규칙). 반은 강사가 새 반 개설에서 연다.
-- 앱의 src/lib/two-week.ts(termHalfDate · isContainerProgram)와 같은 규칙이다 — 바꾸면 둘 다.
-- ============================================================================

-- ─── 1. 과정 값 ─────────────────────────────────────────────────────────────
-- 20260916180000 이 열 안에 붙인 check 는 이름이 저절로 붙었다 — 이름을 짐작하지 않고 정의로 찾아 지운다
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('public.courses'::regclass, 'public.timetable_slots'::regclass)
       and pg_get_constraintdef(c.oid) ilike '%program%sparta%'
       and pg_get_constraintdef(c.oid) not ilike '%includes_levels%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.courses add constraint courses_program_check check (program in ('score', 'sparta', 'twoweek'));
alter table public.timetable_slots add constraint timetable_slots_program_check check (program in ('score', 'sparta', 'twoweek'));

comment on column public.courses.program is
  'score(한 달 점수보장반) | sparta(스파르타반 — 포함 레벨의 점수보장반 권한) | twoweek(2주완성 — 같은 레벨 점수보장반의 앞 절반, 2026-10-05)';

insert into public.courses (code, name, course_type, target_score, program, includes_levels)
values ('TWOWEEK850', '850+ 2주완성', 'full', 850, 'twoweek', '{}')
on conflict (code) do nothing;

-- ─── 2. 앞 절반의 마지막 수업일 ──────────────────────────────────────────────
create or replace function private.term_half_date(p_term_id bigint)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select x.date
    from (
      select d.date, row_number() over (order by d.date) as rn, count(*) over () as n
        from (
          select distinct c.date
            from public.term_class_dates c
            join public.terms t on t.id = c.term_id
           where c.term_id = p_term_id
             and (t.enrollment_opens_at is null or c.date >= t.enrollment_opens_at)
             and (t.closes_at is null or c.date <= t.closes_at)
        ) d
    ) x
   where x.rn = ceil(x.n / 2.0)
$$;
comment on function private.term_half_date(bigint) is
  '그 달 수업일(월수금 + 화목금, 개강일~종강일) 앞 절반의 마지막 날 — N일이면 ceil(N/2) 번째. 2주완성 반의 종강일 (2026-10-05). 앱 termHalfDate 와 같은 규칙';

revoke all on function private.term_half_date(bigint) from public, anon, authenticated;

-- ─── 3. 반 날짜 · 회차: 2주완성은 개강일부터 앞 절반까지 ─────────────────────
-- 20260922113000 의 함수에서 2주완성만 다르게 했다 (종강일 = 앞 절반 마지막 날, 회차 = 그 사이 날짜). 나머지 반은 그대로다
create or replace function private.sync_section_schedule(p_section_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_term_id  bigint;
  v_track    text;
  v_opens    date;
  v_closes   date;
  v_program  text;
  v_blocked  text;
  v_count    int;
begin
  select s.term_id, s.track, t.enrollment_opens_at, t.closes_at, c.program
    into v_term_id, v_track, v_opens, v_closes, v_program
  from public.class_sections s
  join public.terms t on t.id = s.term_id
  left join public.courses c on c.id = s.course_id
  where s.id = p_section_id;
  if not found then
    return;
  end if;

  -- 2주완성: 종강일 = 그 달 수업일 앞 절반의 마지막 날 (수업일이 아직 없으면 개강일 하루)
  if v_program = 'twoweek' then
    v_closes := coalesce(private.term_half_date(v_term_id), v_opens);
  end if;

  -- 1) 빠질 회차에 다시보기가 붙어 있으면 막는다
  select string_agg(to_char(sd.date, 'YYYY-MM-DD'), ',' order by sd.date)
    into v_blocked
  from public.session_dates sd
  where sd.section_id = p_section_id
    and not exists (
      select 1 from public.term_class_dates d
      where d.term_id = v_term_id and d.track = v_track and d.date = sd.date
        and (v_program is distinct from 'twoweek' or (d.date >= v_opens and d.date <= v_closes))
    )
    and exists (select 1 from public.replays r where r.session_date_id = sd.id);
  if v_blocked is not null then
    raise exception 'replay_block' using errcode = 'P0001', detail = v_blocked;
  end if;

  -- 2) 달력에서 빠진 날짜 삭제 (2주완성은 앞 절반 밖 날짜도)
  delete from public.session_dates sd
  where sd.section_id = p_section_id
    and not exists (
      select 1 from public.term_class_dates d
      where d.term_id = v_term_id and d.track = v_track and d.date = sd.date
        and (v_program is distinct from 'twoweek' or (d.date >= v_opens and d.date <= v_closes))
    );

  -- 3) 새 날짜 추가 (임시 회차 번호 — 아래에서 날짜순으로 다시 매긴다)
  insert into public.session_dates (section_id, seq, date)
  select p_section_id, 100000 + row_number() over (order by d.date), d.date
  from public.term_class_dates d
  where d.term_id = v_term_id
    and d.track = v_track
    and (v_program is distinct from 'twoweek' or (d.date >= v_opens and d.date <= v_closes))
    and not exists (
      select 1 from public.session_dates sd
      where sd.section_id = p_section_id and sd.date = d.date
    );

  -- 4) 회차 번호를 날짜순 1..n 으로. unique(section_id, seq) 충돌을 피하려고 먼저 비켜 둔다
  update public.session_dates set seq = seq + 200000 where section_id = p_section_id;
  update public.session_dates sd
  set seq = o.rn
  from (
    select id, row_number() over (order by date) as rn
    from public.session_dates
    where section_id = p_section_id
  ) o
  where sd.id = o.id;

  -- 5) 반의 개강일·종강일·회차 수
  select count(*) into v_count from public.session_dates where section_id = p_section_id;
  update public.class_sections s
  set enrollment_opens_at = coalesce(v_opens, s.enrollment_opens_at),
      closes_at           = coalesce(v_closes, s.closes_at),
      target_sessions     = case when v_count > 0 then v_count else s.target_sessions end
  where s.id = p_section_id
    and (s.enrollment_opens_at, s.closes_at, s.target_sessions) is distinct from
        (coalesce(v_opens, s.enrollment_opens_at), coalesce(v_closes, s.closes_at),
         case when v_count > 0 then v_count else s.target_sessions end);

  -- 6) 이 반이 들어간 등록: 활성화일 = 배정된 반 중 가장 이른 개강일, 만료일 = 가장 늦은 종강일.
  --    끝난 등록(expired)도 맞춘다 — 강사가 종강일을 늘리면 다시 열려야 한다. 상태·등급은 트리거가 날짜로 다시 정한다
  perform private.sync_order_window(array(select distinct e.order_id from public.enrollments e where e.section_id = p_section_id));
end;
$function$;

-- ─── 4. 2주완성 반이 품는 반 ────────────────────────────────────────────────
-- 20260916210000 의 함수에 2주완성 갈래 하나를 더했다 (묶음 반 · 스파르타 갈래는 그대로)
create or replace function private.section_includes(p_parent bigint, p_child bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_sections p
    join public.courses pc on pc.id = p.course_id
    join public.class_sections c on c.id = p_child
    join public.courses cc on cc.id = c.course_id
    where p.id = p_parent
      and c.id <> p.id
      and c.term_id = p.term_id
      and c.track = p.track
      and (
        -- 묶음 반(120분 · 140분): 같은 강좌에서 시간이 안에 들어오는 반
        (pc.program = 'score' and cc.id = pc.id and private.time_block_contains(p.time_block, c.time_block))
        or
        -- 스파르타반: 포함 레벨(자기 레벨 + includes_levels)의 점수보장반 중 시간이 겹치는 시간 단위 반.
        -- 묶음 반은 건너뛴다 — 내용은 시간 단위 반에 있고, 190분 스파르타가 850 140분 묶음까지 열면 안 된다
        (pc.program = 'sparta' and cc.program = 'score'
          and cc.target_score = any (pc.includes_levels || pc.target_score)
          and private.time_blocks_overlap(p.time_block, c.time_block)
          and not private.is_package_section(c.id))
        or
        -- 2주완성(2026-10-05): 같은 레벨 점수보장반 중 시간이 안에 드는 시간 단위 반 (850 12:30~15:00 → 12:30~13:40 · 13:50~15:00).
        -- 묶음 반은 건너뛴다 — 내용은 시간 단위 반에 있다. 앞 절반에서 닫히는 것은 2주완성 반 자체의 종강일이 한다
        (pc.program = 'twoweek' and cc.program = 'score'
          and cc.target_score = pc.target_score
          and private.time_block_contains(p.time_block, c.time_block)
          and not private.is_package_section(c.id))
      )
  )
$$;

-- ─── 5. 담당 강사: 2주완성 반도 그릇이라 비운다 ──────────────────────────────
-- 20261002110000 의 함수에서 그릇 판정만 넓혔다 (sparta → 점수보장반이 아닌 과정 전부)
create or replace function private.section_instructor_plan(p_term_id bigint)
returns table (
  section_id    bigint,
  current_id    uuid,
  is_package    boolean,
  is_known      boolean,
  subj          text,
  teacher_id    uuid
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with s as (
    select cs.id, cs.subject, cs.instructor_id,
           (c.program <> 'score' or private.is_package_section(cs.id)) as pkg
      from public.class_sections cs
      join public.courses c on c.id = cs.course_id
     where cs.term_id = p_term_id
  ),
  teacher as (
    -- 과목마다 한 사람. 강사를 관리자보다 앞에, 먼저 가입한 순 (이혜영 lc · 이영수 rc). 합쳐진 옛 계정은 뺀다
    select distinct on (p.subject) p.subject, p.id
      from public.profiles p
     where p.subject in ('lc', 'rc') and p.role in ('instructor', 'admin') and p.merged_into is null
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
  '기수의 반마다 담당 강사 판정 (2026-09-23: 과목 칸 class_sections.subject 로, 2026-10-02: 합쳐진 계정 제외, 2026-10-05: 2주완성도 그릇). '
  '앱의 src/lib/instructor-subject.ts planSubjects 와 같은 규칙';

-- ─── 6. 시간표: 850 시간을 고치면 2주완성 줄도 따라간다 ──────────────────────
-- 20260929160000 의 트리거 함수에서 "한달완성 줄이 안에 든 시간을 따라간다" 를 2주완성 줄까지 넓혔다.
-- 2주완성 줄은 같은 레벨 850 시간 전체라, 한달완성 줄과 끝을 함께 쓰거나 한달완성 줄 그 자체와 같다
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

  -- 한달완성(묶음) 줄 · 2주완성 줄은 안에 든 시간을 따라간다 — 끝을 함께 쓰는 줄만 (점수보장반 시간을 고쳤을 때).
  -- 2주완성 줄은 한달완성 줄과 같은 시간이라, 한달완성 줄 자체를 고쳐도 따라간다
  if tg_op = 'UPDATE' and new.program = 'score'
     and (old.start_time, old.end_time) is distinct from (new.start_time, new.end_time) then
    update public.timetable_slots p
       set start_time = case when p.start_time = old.start_time then new.start_time else p.start_time end,
           end_time = case when p.end_time = old.end_time then new.end_time else p.end_time end
     where p.year = new.year and p.month = new.month
       and p.level = new.level and p.program in ('score', 'twoweek')
       and p.id <> new.id
       and (
         (p.start_time <= old.start_time and p.end_time >= old.end_time
          and (p.start_time, p.end_time) <> (old.start_time, old.end_time)
          and (p.start_time = old.start_time or p.end_time = old.end_time))
         or (p.program = 'twoweek' and (p.start_time, p.end_time) = (old.start_time, old.end_time))
       );
  end if;

  return null;
end;
$$;

-- ─── 7. 시간표 줄 넣기 — 이번 달부터 이미 만든 달 · 평달 기본 줄 ─────────────
insert into public.timetable_slots (year, month, level, program, season, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf)
select s.year, s.month, s.level, 'twoweek', null, min(s.start_time), max(s.end_time), false, null, null, null
  from public.timetable_slots s
 where s.year is not null
   and s.level = 850
   and s.program = 'score'
   and s.year * 12 + s.month >= extract(year from private.today_kst())::int * 12 + extract(month from private.today_kst())::int
   and not exists (
     select 1 from public.timetable_slots x
      where x.year = s.year and x.month = s.month and x.level = s.level and x.program = 'twoweek')
 group by s.year, s.month, s.level;

insert into public.timetable_slots (year, month, level, program, season, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf)
select null, null, s.level, 'twoweek', 'regular', min(s.start_time), max(s.end_time), false, null, null, null
  from public.timetable_slots s
 where s.year is null
   and s.season = 'regular'
   and s.level = 850
   and s.program = 'score'
   and not exists (
     select 1 from public.timetable_slots x
      where x.year is null and x.season = 'regular' and x.level = s.level and x.program = 'twoweek')
 group by s.level;
