-- 방학달 통짜 반의 **두 교시 · 두 방송** (2026-11-05 Alan — 방학 통짜 120분 반은 LC · RC 두 분이 "각자 방송을 진행해").
--
-- 방학달 통짜 반(점수보장반 · 시간 단위가 없는 긴 한 구간)은 두 과목을 이어 듣는 반이라 과목 칸이 비고 담당 강사가 없었다 — 유튜브 송출 감지가
-- "담당 강사 = 채널 주인" 이라 이 반은 후보에서 빠졌다 (d1-live.md 지킬 것 5 · 미확정 12). 이제 통짜 반에 **교시(part)** 를 둔다:
--
--   * 시간표 통짜 줄에 **앞 교시 과목(월수금 · 화목금)** 과 **뒤 교시 시작 시각** 을 적는다 (timetable_slots.first_mwf · first_ttf · second_start).
--     그 달 반(class_sections.first_subject · second_start)은 트리거가 따라간다 (평달의 과정 · 과목과 같은 길 — tg_timetable_month_sync).
--   * 회차의 불라방 링크 · 유튜브 송출 · 다시보기 · 시작 알림 표시가 **교시(part 1 · 2)** 를 갖는다 (session_live_links · session_streams · replays · live_start_notices).
--     예전 줄은 전부 part 1 이다 — 시간 단위 반은 교시가 하나뿐이라 아무것도 달라지지 않는다.
--   * 감지 후보는 통짜 반이면 교시마다 하나 — 앞 교시는 그 과목 선생님 · 반 시작 시각, 뒤 교시는 다른 과목 선생님 · 뒤 교시 시작 시각
--     (private.section_parts · part_subject · part_start · part_end · subject_teacher). 교시마다 새 방송이라 "방송 시작 ±10분" 규칙은 그대로다.
--   * 수업이 끝나면 교시마다 다시보기가 된다 — 앞 교시는 뒤 교시가 시작한 뒤, 뒤 교시는 반이 끝난 뒤. 불라방 시작 알림도 교시마다 간다 (제목에 과목).
-- 앱의 같은 규칙: src/lib/class-parts.ts (sectionParts · partSubject · partSpan) — 바꾸면 둘 다.

-- ─── 1. 시간표 통짜 줄 — 앞 교시 과목 · 뒤 교시 시작 ───────────────────────────
alter table public.timetable_slots
  add column if not exists first_mwf text,
  add column if not exists first_ttf text,
  add column if not exists second_start time;

alter table public.timetable_slots drop constraint if exists timetable_slots_first_mwf_check;
alter table public.timetable_slots add constraint timetable_slots_first_mwf_check check (first_mwf in ('lc', 'rc'));
alter table public.timetable_slots drop constraint if exists timetable_slots_first_ttf_check;
alter table public.timetable_slots add constraint timetable_slots_first_ttf_check check (first_ttf in ('lc', 'rc'));
alter table public.timetable_slots drop constraint if exists timetable_slots_second_start_check;
alter table public.timetable_slots add constraint timetable_slots_second_start_check
  check (second_start is null or (second_start > start_time and second_start < end_time));

comment on column public.timetable_slots.first_mwf is '방학달 통짜 줄 — 월수금 반의 앞 교시 과목 lc|rc (뒤 교시는 다른 과목). 시간 단위 · 묶음 · 스파르타 · 2주완성 줄은 null (2026-11-05)';
comment on column public.timetable_slots.first_ttf is '방학달 통짜 줄 — 화목금 반의 앞 교시 과목 lc|rc (2026-11-05)';
comment on column public.timetable_slots.second_start is '방학달 통짜 줄 — 뒤 교시가 시작하는 시각 (시작 · 끝 사이). 유튜브 송출 감지 · 다시보기 · 시작 알림이 교시를 가르는 기준 (2026-11-05)';

-- ─── 2. 반 — 시간표 줄을 따라간다 ─────────────────────────────────────────────
alter table public.class_sections
  add column if not exists first_subject text,
  add column if not exists second_start time;

alter table public.class_sections drop constraint if exists class_sections_first_subject_check;
alter table public.class_sections add constraint class_sections_first_subject_check check (first_subject in ('lc', 'rc'));
alter table public.class_sections drop constraint if exists class_sections_second_start_check;
alter table public.class_sections add constraint class_sections_second_start_check
  check (second_start is null or time_block is null
         or (second_start > private.time_block_start(time_block) and second_start < private.time_block_end(time_block)));

comment on column public.class_sections.first_subject is '방학달 통짜 반의 앞 교시 과목 lc|rc — 그 달 시간표 통짜 줄(first_mwf · first_ttf)을 따라간다. 과목 칸(subject)은 그대로 비어 있다 (2026-11-05)';
comment on column public.class_sections.second_start is '방학달 통짜 반의 뒤 교시 시작 시각 — 시간표 줄(second_start)을 따라간다 (2026-11-05)';

-- 달 줄 → 그 달 반 (20261005140000 의 함수에 앞 교시 과목 · 뒤 교시 시작을 더했다 — 나머지는 그대로)
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
           live_to_replay = x.live_to_replay,
           first_subject = x.first_subject,
           second_start = x.second_start
      from (
        select cs.id,
               v_to as time_block,
               new.book_set as book_set,
               case cs.track when 'mwf' then new.subject_mwf when 'ttf' then new.subject_ttf else cs.subject end as subject,
               (cs.track = 'ttf' and new.ttf_recorded) as recorded,
               case when v_evening_changed then not new.ttf_recorded else cs.live_to_replay end as live_to_replay,
               -- 방학달 통짜 줄의 앞 교시 과목 · 뒤 교시 시작 (2026-11-05) — 다른 줄은 비어 있어 반도 비운다
               case cs.track when 'mwf' then new.first_mwf when 'ttf' then new.first_ttf else cs.first_subject end as first_subject,
               new.second_start as second_start
          from public.class_sections cs
         where cs.term_id = v_term
           and cs.time_block = v_from
           and cs.course_id in (select c.id from public.courses c where c.target_score = v_level and c.program = v_program)
      ) x
     where s.id = x.id
       and (s.time_block, s.book_set, s.subject, s.recorded, s.live_to_replay, s.first_subject, s.second_start)
           is distinct from (x.time_block, x.book_set, x.subject, x.recorded, x.live_to_replay, x.first_subject, x.second_start);
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

-- ─── 3. 교시 판정 — DB 한곳 (앱 src/lib/class-parts.ts 와 같은 규칙) ─────────────
-- 두 교시 = 점수보장반 · 묶음 아님 · 과목 칸이 비고(두 과목을 이어 듣는 통짜) · 앞 교시 과목과 뒤 교시 시작이 있다. 그 밖은 교시 하나
create or replace function private.section_parts(p_section_id bigint)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when s.subject is null and s.first_subject in ('lc', 'rc') and s.second_start is not null
                and c.program = 'score' and not private.is_package_section(s.id)
           then 2 else 1 end
    from public.class_sections s
    join public.courses c on c.id = s.course_id
   where s.id = p_section_id
$$;

-- 교시의 과목 — 앞 교시는 first_subject, 뒤 교시는 다른 과목. 교시가 하나인 반은 반의 과목
create or replace function private.part_subject(p_section_id bigint, p_part int)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when private.section_parts(s.id) = 2 then
             case when p_part = 2 then (case s.first_subject when 'lc' then 'rc' else 'lc' end) else s.first_subject end
           else s.subject end
    from public.class_sections s
   where s.id = p_section_id
$$;

-- 교시의 시작 · 끝 — 앞 교시 = 반 시작 ~ 뒤 교시 시작, 뒤 교시 = 뒤 교시 시작 ~ 반 끝. 교시가 하나면 반의 시간대 그대로
create or replace function private.part_start(p_section_id bigint, p_part int)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.section_parts(s.id) = 2 and p_part = 2 then s.second_start else private.time_block_start(s.time_block) end
    from public.class_sections s
   where s.id = p_section_id
$$;

create or replace function private.part_end(p_section_id bigint, p_part int)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.section_parts(s.id) = 2 and p_part = 1 then s.second_start else private.time_block_end(s.time_block) end
    from public.class_sections s
   where s.id = p_section_id
$$;

-- 과목의 선생님 — section_instructor_plan 의 teacher 와 같은 고르기 (강사를 관리자보다 앞에, 먼저 가입한 순, 합쳐진 옛 계정 제외)
create or replace function private.subject_teacher(p_subject text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.profiles p
   where p.subject = p_subject
     and p.subject in ('lc', 'rc')
     and p.role in ('instructor', 'admin')
     and p.merged_into is null
   order by (p.role = 'instructor') desc, p.created_at
   limit 1
$$;

revoke all on function private.section_parts(bigint), private.part_subject(bigint, int), private.part_start(bigint, int), private.part_end(bigint, int), private.subject_teacher(text)
  from public, anon, authenticated;

-- ─── 4. 회차의 링크 · 송출 · 다시보기 · 알림 표시에 교시 ────────────────────────
alter table public.session_live_links add column if not exists part smallint not null default 1;
alter table public.session_live_links drop constraint if exists session_live_links_part_check;
alter table public.session_live_links add constraint session_live_links_part_check check (part in (1, 2));
alter table public.session_live_links drop constraint if exists session_live_links_pkey;
alter table public.session_live_links add primary key (session_date_id, part);

alter table public.session_streams add column if not exists part smallint not null default 1;
alter table public.session_streams drop constraint if exists session_streams_part_check;
alter table public.session_streams add constraint session_streams_part_check check (part in (1, 2));
alter table public.session_streams drop constraint if exists session_streams_pkey;
alter table public.session_streams add primary key (session_date_id, part);

alter table public.replays add column if not exists part smallint not null default 1;
alter table public.replays drop constraint if exists replays_part_check;
alter table public.replays add constraint replays_part_check check (part in (1, 2));

alter table private.live_start_notices add column if not exists part smallint not null default 1;
alter table private.live_start_notices drop constraint if exists live_start_notices_pkey;
alter table private.live_start_notices add primary key (section_id, class_date, part);

comment on column public.session_live_links.part is '교시 — 방학달 통짜 반만 1 · 2 (앞 교시 · 뒤 교시). 시간 단위 반은 늘 1 (2026-11-05)';
comment on column public.session_streams.part is '교시 — 방학달 통짜 반만 1 · 2. 시간 단위 반은 늘 1 (2026-11-05)';
comment on column public.replays.part is '교시 — 방학달 통짜 반만 1 · 2. 시간 단위 반은 늘 1 (2026-11-05)';

-- ─── 5. 감지 후보 — 통짜 반은 교시마다 (과목 선생님 · 교시 시작) ───────────────
-- 돌려주는 모양이 바뀌므로 지우고 다시 만든다. private.live_detect_due() 는 이름으로 부르므로 그대로 따라온다
drop function if exists public.live_detect_candidates();

create function public.live_detect_candidates()
returns table (session_date_id bigint, section_id bigint, instructor_id uuid, starts_at timestamptz, label text, live_to_replay boolean, part int)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id,
         s.id,
         x.instructor_id,
         (d.date + x.starts) at time zone 'Asia/Seoul',
         concat_ws(' ', t.month || '월', c.name, case s.track when 'mwf' then '월수금' else '화목금' end, s.time_block, d.seq || '회차',
                   case when x.parts = 2 then upper(x.subj) || ' 교시' end),
         s.live_to_replay,
         x.part
    from public.session_dates d
    join public.class_sections s on s.id = d.section_id
    join public.courses c on c.id = s.course_id
    join public.terms t on t.id = s.term_id
    cross join lateral (
      -- 교시가 하나인 반(시간 단위 반)은 예전 그대로 — 담당 강사 · 반 시작 시각
      select 1 as part, s.instructor_id, private.time_block_start(s.time_block) as starts, null::text as subj, 1 as parts
       where private.section_parts(s.id) = 1
      union all
      -- 통짜 반은 교시마다 — 그 교시 과목의 선생님 · 그 교시 시작 시각 (2026-11-05)
      select g.p, private.subject_teacher(private.part_subject(s.id, g.p)), private.part_start(s.id, g.p), private.part_subject(s.id, g.p), 2
        from generate_series(1, 2) as g(p)
       where private.section_parts(s.id) = 2
    ) x
    join public.youtube_channels y on y.user_id = x.instructor_id
   where d.date = private.today_kst()
     and s.status <> 'draft'
     and not s.recorded                        -- 인강 반은 라이브가 없다 (오전 수업 녹화본을 본다)
     and c.program = 'score'
     and not private.is_package_section(s.id)
     and x.starts is not null
     and private.today_kst() <= s.closes_at
     and not exists (select 1 from public.session_streams st where st.session_date_id = d.id and st.part = x.part)
     and not exists (select 1 from public.replays r where r.session_date_id = d.id and r.part = x.part)
     and now() between ((d.date + x.starts) at time zone 'Asia/Seoul') - interval '10 minutes'
                   and ((d.date + x.starts) at time zone 'Asia/Seoul') + interval '30 minutes'
$$;

comment on function public.live_detect_candidates() is
  '지금 유튜브에서 방송을 찾아볼 회차 — 송출·다시보기가 아직 없는 시간 단위 반, 저녁 반 포함 (2026-10-04). 방학달 통짜 반은 교시마다 (2026-11-05). 다시보기 승격은 live_to_replay 반만. service_role 전용 (/api/cron/live-detect)';

revoke all on function public.live_detect_candidates() from public, anon, authenticated;
grant execute on function public.live_detect_candidates() to service_role;

-- 찾은 방송을 그 회차 · 교시에 걸어 둔다 (예전 두 인자 함수는 지운다 — 같은 이름이 둘이면 PostgREST 가 고르지 못한다)
drop function if exists public.register_detected_stream(bigint[], text);

create or replace function public.register_detected_stream(p_session_date_ids bigint[], p_url text, p_part int default 1)
returns table (session_date_id bigint, live_linked boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ids bigint[];
  v_linked bigint[];
begin
  if p_url !~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{6,20}$' then
    raise exception 'bad_url';
  end if;
  if p_part not in (1, 2) then
    raise exception 'bad_part';
  end if;

  -- ① 송출 표 — 그 사이 다른 방송이 먼저 잡혔으면 건드리지 않는다
  with ins as (
    insert into public.session_streams (session_date_id, part, video_url)
    select x, p_part, p_url from unnest(coalesce(p_session_date_ids, '{}')) x
    on conflict (session_date_id, part) do nothing
    returning session_streams.session_date_id
  )
  select coalesce(array_agg(ins.session_date_id), '{}') into v_ids from ins;

  -- ② 불라방 링크가 비어 있는 교시에는 같은 주소를 불라방 링크로도 (손으로 넣은 링크는 그대로). 트리거가 학생 알림을 보낸다
  with ins as (
    insert into public.session_live_links (session_date_id, part, live_url, source)
    select x, p_part, p_url, 'youtube' from unnest(v_ids) x
    on conflict (session_date_id, part) do nothing
    returning session_live_links.session_date_id
  )
  select coalesce(array_agg(ins.session_date_id), '{}') into v_linked from ins;

  return query
    select x, (x = any (v_linked)) from unnest(v_ids) x;
end;
$$;

revoke all on function public.register_detected_stream(bigint[], text, int) from public, anon, authenticated;
grant execute on function public.register_detected_stream(bigint[], text, int) to service_role;

-- ─── 6. 다시보기 승격 — 교시마다, 그 교시가 끝난 뒤 ───────────────────────────
create or replace function private.promote_live_replays()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_streams int := 0;
  v_links   int := 0;
begin
  -- ① 유튜브 송출 (Zoom → 유튜브, 2026-10-01) — 교시가 끝난 뒤 (앞 교시는 뒤 교시 시작, 그 밖은 반 끝)
  with due as (
    select st.session_date_id, st.part, st.video_url
      from public.session_streams st
      join public.session_dates d on d.id = st.session_date_id
      join public.class_sections s on s.id = d.section_id
     where st.promoted_at is null
       and s.live_to_replay
       and not exists (select 1 from public.replays r where r.session_date_id = d.id and r.part = st.part)
       and (d.date + coalesce(private.part_end(s.id, st.part), time '23:59')) <= (now() at time zone 'Asia/Seoul')
  ),
  ins as (
    insert into public.replays (session_date_id, part, video_url)
    select session_date_id, part, video_url from due
    returning session_date_id, part
  )
  update public.session_streams st
     set promoted_at = now()
    from ins
   where st.session_date_id = ins.session_date_id and st.part = ins.part;
  get diagnostics v_streams = row_count;

  -- ② 회차 불라방 링크가 유튜브 주소일 때 (유튜브 라이브로 돌아갈 때를 위해 남긴다 — 20260930110000)
  with due as (
    select l.session_date_id, l.part, l.live_url
      from public.session_live_links l
      join public.session_dates d on d.id = l.session_date_id
      join public.class_sections s on s.id = d.section_id
     where l.promoted_at is null
       and s.live_to_replay
       and private.is_youtube_url(l.live_url)
       and not exists (select 1 from public.replays r where r.session_date_id = d.id and r.part = l.part)
       and (d.date + coalesce(private.part_end(s.id, l.part), time '23:59')) <= (now() at time zone 'Asia/Seoul')
  ),
  ins as (
    insert into public.replays (session_date_id, part, video_url)
    select session_date_id, part, live_url from due
    returning session_date_id, part
  )
  update public.session_live_links l
     set promoted_at = now()
    from ins
   where l.session_date_id = ins.session_date_id and l.part = ins.part;
  get diagnostics v_links = row_count;

  -- ③ 같은 회차 · 같은 교시 · 같은 주소로 다시보기가 이미 있으면 다른 갈래의 표시도 맞춘다 (한쪽이 만든 다시보기를 다른 쪽이 건너뛴 경우)
  update public.session_streams st
     set promoted_at = now()
    from public.replays r
   where r.session_date_id = st.session_date_id
     and r.part = st.part
     and st.promoted_at is null
     and r.video_url = st.video_url;

  update public.session_live_links l
     set promoted_at = now()
    from public.replays r
   where r.session_date_id = l.session_date_id
     and r.part = l.part
     and l.promoted_at is null
     and r.video_url = l.live_url;

  return v_streams + v_links;
end;
$$;

-- 링크를 바꾸면: 이미 만든 그 교시 다시보기가 그 옛 주소면 함께 바꾸고, 없으면 다시 판정하도록 promoted_at 을 비운다
create or replace function private.tg_session_live_link_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  new.updated_at := now();
  if new.live_url is distinct from old.live_url then
    update public.replays r
       set video_url = new.live_url
     where r.session_date_id = new.session_date_id
       and r.part = new.part
       and r.video_url = old.live_url
       and private.is_youtube_url(new.live_url);
    get diagnostics v_n = row_count;
    new.promoted_at := case when v_n > 0 then now() else null end;
  end if;
  return new;
end;
$$;

-- ─── 7. 불라방 시작 알림 — 교시마다 한 번 ─────────────────────────────────────
drop function if exists private.notify_live_session(bigint, date);

create or replace function private.notify_live_session(p_section_id bigint, p_date date, p_part int default 1)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r      record;
  v_n    int;
  v_subj text;
begin
  select d.seq, s.time_block, s.recorded, s.subject, c.name as course_name
    into r
    from public.session_dates d
    join public.class_sections s on s.id = d.section_id
    join public.courses c on c.id = s.course_id
   where d.section_id = p_section_id and d.date = p_date;
  -- 그 날 회차가 없거나 인강 반이면 라이브가 없다
  if not found or r.recorded then
    return 0;
  end if;
  -- 본문의 과목 (20261015120000 — 120분 학생은 교시마다 RC 한 번 · LC 한 번 받는다): 두 교시 반은 그 교시 과목에 '교시' 를 붙인다, 시간 단위 반은 반의 과목
  v_subj := case when private.section_parts(p_section_id) = 2 then upper(private.part_subject(p_section_id, p_part)) || ' 교시' else upper(r.subject) end;

  -- 이미 보낸 (반, 날짜, 교시) 면 아무것도 넣지 않는다 — 크론·트리거가 여러 번 불러도 한 번만 간다
  insert into private.live_start_notices (section_id, class_date, part)
  values (p_section_id, p_date, p_part)
  on conflict (section_id, class_date, part) do nothing;
  if not found then
    return 0;
  end if;

  -- 이 시간 단위 반을 볼 수 있는 불라방 학생: 직접 배정 + 이 반을 품는 묶음 반·속성반 배정.
  -- 한 학생에게 한 번 (묶음 반과 시간 단위 반에 함께 배정돼 있어도)
  insert into public.student_messages (user_id, sender_id, sender_name, title, body, kind, related)
  select distinct on (e.student_id)
         e.student_id,
         null,
         '',   -- 사람이 보낸 것이 아니라 자동 알림이다. 화면은 이름이 비면 시각만 적는다
         left(r.course_name || ' 불라방이 시작됐어요', 80),
         left(concat_ws(' · ', r.time_block, r.seq || '회차', v_subj) || ' 방송이 시작됐어요. 불라방에서 바로 입장해 주세요.', 1000),
         'live_start',
         jsonb_build_object('sectionId', p_section_id, 'date', p_date, 'part', p_part)
    from public.enrollments e
    join public.enrollment_orders o on o.id = e.order_id
    join public.class_sections es on es.id = e.section_id
   where e.mode = 'live'
     and e.status = 'active'
     and o.status = 'active'
     and not es.recorded
     and private.today_kst() between es.enrollment_opens_at and es.closes_at
     and (e.section_id = p_section_id or private.section_includes(e.section_id, p_section_id))
   order by e.student_id;
  get diagnostics v_n = row_count;

  update private.live_start_notices
     set recipients = v_n
   where section_id = p_section_id and class_date = p_date and part = p_part;

  return v_n;
end;
$$;

comment on function private.notify_live_session(bigint, date, int) is
  '그 반·그 날·그 교시 불라방이 시작됐다고 볼 수 있는 불라방 학생에게 한 번 알린다 (링크가 들어온 순간 · 미리 넣은 링크는 교시 시각에). 2026-11-05 교시';

-- 링크가 들어온 순간 — 그 교시 시작 15분 전 ~ 교시 끝 사이면 바로 알린다
create or replace function private.tg_session_live_link_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_section bigint;
  v_date    date;
  v_start   time;
  v_end     time;
  v_now     timestamp := now() at time zone 'Asia/Seoul';
begin
  select d.section_id, d.date
    into v_section, v_date
    from public.session_dates d
   where d.id = new.session_date_id;
  if v_date is distinct from private.today_kst() then
    return new;
  end if;
  v_start := private.part_start(v_section, new.part);
  v_end   := private.part_end(v_section, new.part);
  if v_start is null then
    return new;
  end if;
  if v_now between (v_date + v_start) - interval '15 minutes' and (v_date + coalesce(v_end, v_start + interval '1 hour')) then
    perform private.notify_live_session(v_section, v_date, new.part::int);
  end if;
  return new;
end;
$$;

-- 수업(교시) 시각이 된 반 중 링크가 이미 있는 반 — pg_cron 5분마다
create or replace function private.notify_live_class_start()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now   timestamp := now() at time zone 'Asia/Seoul';
  v_today date      := private.today_kst();
  r       record;
  v_total int := 0;
begin
  for r in
    select d.section_id, d.date, p.part
      from public.session_dates  d
      join public.class_sections s on s.id = d.section_id
      cross join lateral generate_series(1, private.section_parts(s.id)) as p(part)
     where d.date = v_today
       and not s.recorded
       and v_today <= s.closes_at
       and coalesce(case when p.part = 1 then s.start_time end, private.part_start(s.id, p.part)) is not null
       and (d.date + coalesce(case when p.part = 1 then s.start_time end, private.part_start(s.id, p.part))) <= v_now
       -- 크론이 멈췄다 살아나도 지난 수업까지 몰아 보내지 않는다 (15분이 넘으면 "지금 시작" 이 거짓말이다)
       and (d.date + coalesce(case when p.part = 1 then s.start_time end, private.part_start(s.id, p.part))) > v_now - interval '15 minutes'
       and (exists (select 1 from public.session_live_links l where l.session_date_id = d.id and l.part = p.part)
            or exists (select 1 from public.section_live_links sl where sl.section_id = s.id))
  loop
    v_total := v_total + private.notify_live_session(r.section_id, r.date, r.part);
  end loop;
  return v_total;
end;
$$;

revoke all on function private.notify_live_session(bigint, date, int), private.notify_live_class_start()
  from public, anon, authenticated;
