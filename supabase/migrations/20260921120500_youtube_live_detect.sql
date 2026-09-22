-- ============================================================================
-- 유튜브 방송을 감지해 불라방 링크를 저절로 넣는다 (2026-09-21 Alan — 첫토익 "OBS 방송 자동 게시")
--
--   "두 강사가 각자 유튜브 채널에서 일부공개로 새 방송을 킬꺼야. 해당시간 5~10분 전후로 방송이 올라오면
--    그 시간대에 불라방 링크가 들어가면 되고, 오전시간에 했던 영상링크는 다시보기로 올라가면 될 것 같아!"
--   "방송이 잡힌 순간 보내는 알림."
--
--   * 강사는 관리자 화면(/admin/live-channels)에서 **자기 유튜브 채널을 한 번 연결** 한다 (구글 동의, youtube.readonly).
--     일부공개 방송은 채널 페이지·검색에 안 나와서 긁어서는 영영 못 찾는다 — 채널 주인의 승인으로 조회한다 (첫토익 A2).
--   * DB 크론이 30초마다 **감지할 회차가 있을 때만** 우리 API(/api/cron/live-detect)를 부른다 → 유튜브 조회 →
--     방송 시작 시각이 수업 시작 ±10분이면 그 회차 링크 칸에 넣는다 (public.register_detected_live).
--     매칭은 **담당 강사 = 채널 주인** 으로 한다 — 강사 한 분은 한 시간대에 한 반만 맡는다 (9월 편성 실측).
--     합반처럼 같은 강사·같은 시각 반이 둘이면 둘 다 같은 링크를 받는다.
--   * 링크는 **시간 단위 반** 에만 넣는다 (묶음 반·속성반은 링크를 두지 않는다 — 도메인 규칙 1). 인강 반(저녁 화목금)은 뺀다.
--   * 오전반은 수업이 끝나면 그 링크가 그대로 다시보기가 된다 — 이미 있는 private.promote_live_replays 가 한다.
--   * **학생 알림은 링크가 들어오는 순간** 간다 (트리거). 알림 받는 학생은 그 시간 단위 반을 볼 수 있는 불라방 학생 전부 —
--     직접 배정 + 그 반을 품는 묶음 반·속성반 학생. 120분 학생은 방송이 바뀔 때마다(강사가 바뀔 때마다) 한 번씩 받는다 —
--     그때마다 새 링크로 들어가야 하기 때문이다. 보낸 표시는 그대로 (반, 날짜) 다.
--     링크가 없으면 보내지 않는다 — 들어갈 곳이 없는 "시작했어요" 는 쓸모가 없다 (예전에는 시각만 보고 보냈다).
-- ============================================================================

-- ─── 1. 강사 유튜브 채널 연결 ─────────────────────────────────────────────
create table if not exists public.youtube_channels (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  channel_id              text not null unique,
  channel_title           text,
  refresh_token           text not null,        -- **service_role 만 읽는다** (칸 권한을 주지 않았다)
  access_token            text,
  access_token_expires_at timestamptz,
  linked_at               timestamptz not null default now(),
  last_checked_at         timestamptz,
  last_live_at            timestamptz,          -- 마지막으로 방송을 찾아 링크를 넣은 시각
  last_error              text,
  last_error_at           timestamptz
);

comment on table public.youtube_channels is
  '강사 유튜브 채널 연결 (2026-09-21). 토큰 칸은 service_role 만 읽는다 — authenticated 에는 상태 칸만 칸 단위로 열었다';

alter table public.youtube_channels enable row level security;

create policy "youtube_channels: 스태프 조회" on public.youtube_channels
  for select to authenticated using ((select private.is_staff()));

-- 토큰은 빼고 상태 칸만 연다 (select * 를 하면 권한 오류가 난다 — 화면은 칸을 골라 읽는다)
grant select (user_id, channel_id, channel_title, linked_at, last_checked_at, last_live_at, last_error, last_error_at)
  on public.youtube_channels to authenticated;
grant all on public.youtube_channels to service_role;

-- ─── 2. 링크의 출처 ────────────────────────────────────────────────────────
alter table public.session_live_links
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'session_live_links_source_check' and conrelid = 'public.session_live_links'::regclass
  ) then
    alter table public.session_live_links
      add constraint session_live_links_source_check check (source in ('manual', 'youtube'));
  end if;
end;
$$;

comment on column public.session_live_links.source is 'manual(강사가 붙여 넣음) | youtube(방송을 감지해 저절로 넣음, 2026-09-21)';

-- ─── 3. 지금 감지할 회차 ──────────────────────────────────────────────────
-- 오늘 · 시간 단위 반 · 인강 아님 · 담당 강사가 채널을 연결함 · 링크 없음 · 수업 시작 10분 전 ~ 30분 뒤.
-- (매칭은 방송이 **시작한 시각** 이 수업 시작 ±10분인지로 API 가 한다. 여기 30분은 크론이 늦게 돌아도 놓치지 않게 넉넉히 둔 창이다)
create or replace function public.live_detect_candidates()
returns table (session_date_id bigint, section_id bigint, instructor_id uuid, starts_at timestamptz, label text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id,
         s.id,
         s.instructor_id,
         (d.date + private.time_block_start(s.time_block)) at time zone 'Asia/Seoul',
         concat_ws(' ', t.month || '월', c.name, case s.track when 'mwf' then '월수금' else '화목금' end, s.time_block, d.seq || '회차')
    from public.session_dates d
    join public.class_sections s on s.id = d.section_id
    join public.courses c on c.id = s.course_id
    join public.terms t on t.id = s.term_id
    join public.youtube_channels y on y.user_id = s.instructor_id
   where d.date = private.today_kst()
     and s.status <> 'draft'
     and not s.recorded
     and c.program = 'score'
     and not private.is_package_section(s.id)
     and private.time_block_start(s.time_block) is not null
     and private.today_kst() <= s.closes_at
     and not exists (select 1 from public.session_live_links l where l.session_date_id = d.id)
     and now() between ((d.date + private.time_block_start(s.time_block)) at time zone 'Asia/Seoul') - interval '10 minutes'
                   and ((d.date + private.time_block_start(s.time_block)) at time zone 'Asia/Seoul') + interval '30 minutes'
$$;

comment on function public.live_detect_candidates() is '지금 유튜브에서 방송을 찾아볼 회차. service_role 전용 (/api/cron/live-detect)';

-- 크론 문지기: 감지할 회차가 있을 때만 우리 API 를 부른다 (유튜브 할당량·호출을 아낀다)
create or replace function private.live_detect_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.live_detect_candidates())
$$;

-- 찾은 방송을 그 회차들에 넣는다. 그 사이 강사가 손으로 넣었으면 건드리지 않는다 (on conflict do nothing — 첫토익 경합 가드)
create or replace function public.register_detected_live(p_session_date_ids bigint[], p_url text)
returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
begin
  if p_url !~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{6,20}$' then
    raise exception 'bad_url';
  end if;
  with ins as (
    insert into public.session_live_links (session_date_id, live_url, source)
    select x, p_url, 'youtube' from unnest(coalesce(p_session_date_ids, '{}')) x
    on conflict (session_date_id) do nothing
    returning session_date_id
  )
  select coalesce(array_agg(ins.session_date_id), '{}') into v_ids from ins;
  return v_ids;
end;
$$;

comment on function public.register_detected_live(bigint[], text) is '감지한 유튜브 방송을 회차 불라방 링크로 넣는다 (이미 있으면 그대로). service_role 전용';

revoke all on function public.live_detect_candidates() from public, anon, authenticated;
revoke all on function public.register_detected_live(bigint[], text) from public, anon, authenticated;
revoke all on function private.live_detect_due() from public, anon, authenticated;
grant execute on function public.live_detect_candidates() to service_role;
grant execute on function public.register_detected_live(bigint[], text) to service_role;

-- ─── 4. 불라방 시작 알림 — 링크가 들어오는 순간 ────────────────────────────
-- 그 (반, 날짜) 방송을 볼 수 있는 불라방 학생에게 한 번만. 받은 사람 수를 돌려준다
create or replace function private.notify_live_session(p_section_id bigint, p_date date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r   record;
  v_n int;
begin
  select d.seq, s.time_block, s.recorded, c.name as course_name
    into r
    from public.session_dates d
    join public.class_sections s on s.id = d.section_id
    join public.courses c on c.id = s.course_id
   where d.section_id = p_section_id and d.date = p_date;
  -- 그 날 회차가 없거나 인강 반이면 라이브가 없다
  if not found or r.recorded then
    return 0;
  end if;

  -- 이미 보낸 (반, 날짜) 면 아무것도 넣지 않는다 — 크론·트리거가 여러 번 불러도 한 번만 간다
  insert into private.live_start_notices (section_id, class_date)
  values (p_section_id, p_date)
  on conflict (section_id, class_date) do nothing;
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
         left(concat_ws(' · ', r.time_block, r.seq || '회차') || ' 방송이 시작됐어요. 불라방에서 바로 입장해 주세요.', 1000),
         'live_start',
         jsonb_build_object('sectionId', p_section_id, 'date', p_date)
    from public.enrollments e
    join public.enrollment_orders o on o.id = e.order_id
    join public.class_sections es on es.id = e.section_id
   where e.mode = 'live'
     and e.status = 'active'
     and o.status = 'active'
     and not es.recorded
     and private.today_kst() <= es.closes_at
     and (e.section_id = p_section_id or private.section_includes(e.section_id, p_section_id))
   order by e.student_id;
  get diagnostics v_n = row_count;

  update private.live_start_notices
     set recipients = v_n
   where section_id = p_section_id and class_date = p_date;

  return v_n;
end;
$$;

comment on function private.notify_live_session(bigint, date) is
  '그 반·그 날 불라방이 시작됐다고 볼 수 있는 불라방 학생에게 한 번 알린다 (링크가 들어온 순간 · 미리 넣은 링크는 수업 시각에)';

-- 링크가 **수업 시각 앞뒤에** 들어오면 = 방송이 잡힌 순간. 미리 넣어 둔 링크는 수업 시각에 크론이 알린다
create or replace function private.tg_session_live_link_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_section bigint;
  v_date    date;
  v_block   text;
  v_start   time;
  v_end     time;
  v_now     timestamp := now() at time zone 'Asia/Seoul';
begin
  select d.section_id, d.date, s.time_block
    into v_section, v_date, v_block
    from public.session_dates d
    join public.class_sections s on s.id = d.section_id
   where d.id = new.session_date_id;
  if v_date is distinct from private.today_kst() then
    return new;
  end if;
  v_start := private.time_block_start(v_block);
  v_end   := private.time_block_end(v_block);
  if v_start is null then
    return new;
  end if;
  if v_now between (v_date + v_start) - interval '15 minutes' and (v_date + coalesce(v_end, v_start + interval '1 hour')) then
    perform private.notify_live_session(v_section, v_date);
  end if;
  return new;
end;
$$;

drop trigger if exists session_live_links_notify on public.session_live_links;
create trigger session_live_links_notify
  after insert or update of live_url on public.session_live_links
  for each row execute function private.tg_session_live_link_notify();

-- 수업 시각이 된 반 중 **링크가 이미 있는** 반 (미리 넣은 회차 링크 · 반의 상시 링크). 링크가 없으면 보내지 않는다
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
    select d.section_id, d.date
      from public.session_dates  d
      join public.class_sections s on s.id = d.section_id
     where d.date = v_today
       and not s.recorded
       and v_today <= s.closes_at
       and coalesce(s.start_time, private.time_block_start(s.time_block)) is not null
       and (d.date + coalesce(s.start_time, private.time_block_start(s.time_block))) <= v_now
       -- 크론이 멈췄다 살아나도 지난 수업까지 몰아 보내지 않는다 (15분이 넘으면 "지금 시작" 이 거짓말이다)
       and (d.date + coalesce(s.start_time, private.time_block_start(s.time_block))) > v_now - interval '15 minutes'
       and (exists (select 1 from public.session_live_links l where l.session_date_id = d.id)
            or exists (select 1 from public.section_live_links sl where sl.section_id = s.id))
  loop
    v_total := v_total + private.notify_live_session(r.section_id, r.date);
  end loop;
  return v_total;
end;
$$;

comment on function private.notify_live_class_start() is
  '수업 시각이 된 반 중 링크가 이미 있는 반의 불라방 학생에게 알린다 (링크가 수업 시각에 들어오면 트리거가 먼저 보낸다). pg_cron 5분마다';

-- (트리거 함수 tg_session_live_link_notify 는 직접 부를 수 없어 그대로 둔다 — 강사가 링크를 넣을 때 트리거로만 돈다)
revoke all on function private.notify_live_session(bigint, date), private.notify_live_class_start()
  from public, anon, authenticated;

-- ─── 5. 알림 설정: 내 방송이 잡혔다는 확인 ─────────────────────────────────
alter table public.notification_settings
  add column if not exists live_detected boolean not null default true;

comment on column public.notification_settings.live_detected is '내 유튜브 방송이 잡혀 불라방 링크가 저절로 들어가면 알림 (강사 본인에게만)';

-- ─── 6. 30초마다 (감지할 회차가 있을 때만 부른다) ──────────────────────────
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'live-detect' loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'live-detect',
  '30 seconds',
  $$ select private.call_app('/api/cron/live-detect') where private.live_detect_due() $$
);
