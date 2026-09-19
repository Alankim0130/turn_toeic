-- ============================================================================
-- 수업이 시작되면 불라방 학생에게 알림 (2026-09-19 Alan 요청)
--
--   "불라방 안내에서 수업시작 10분전 입장이라는 문구가 있는데, 아니야.
--    수업이 시작되면 알림을 보내주도록 설정해줘. 불라방학생들에게만"
--
-- **앱 안 알림함(`student_messages`)으로만 간다** (2026-09-19 Alan 선택) —
-- 문자·알림톡·학생 푸시는 여전히 없다 (도메인 규칙 6-2). 학생 푸시를 켜려면
-- 학생용 "알림 받기" 화면과 분 단위 크론이 따로 필요하다.
--
-- 보내는 쪽이 사람이 아니라 크론이라 **문구가 SQL 에 있다** — 이 파일 한곳이다.
-- (pg_cron 은 우리 서버를 못 부르므로 TypeScript 로 만들 수 없다. pg_net 을 켜면 옮길 수 있다.)
-- ============================================================================

-- ─── 1. 시간대 라벨의 시작 시각 ─────────────────────────────────────────────
-- "10:00~12:10" → 10:00. 형식이 다르면 null (private.time_block_end 의 짝, 20260918153000)
create or replace function private.time_block_start(p_block text)
returns time
language sql
immutable
set search_path = ''
as $$
  select case when p_block ~ '^\d{2}:\d{2}~\d{2}:\d{2}$' then split_part(p_block, '~', 1)::time end
$$;

-- ─── 2. 보낸 표시 ──────────────────────────────────────────────────────────
-- 크론이 5분마다 도니 같은 수업을 여러 번 보내지 않게 막아야 한다.
-- **(반, 날짜) 로 잡는다** — session_dates 는 반 편성을 고치면 지워졌다 다시 생겨 id 가 바뀐다
-- (private.sync_section_schedule). id 로 잡으면 편성을 고친 날 수업 알림이 두 번 간다.
create table if not exists private.live_start_notices (
  section_id  bigint not null references public.class_sections (id) on delete cascade,
  class_date  date   not null,
  notified_at timestamptz not null default now(),
  recipients  int not null default 0,
  primary key (section_id, class_date)
);
comment on table private.live_start_notices is
  '수업 시작 알림을 이미 보낸 (반, 날짜). private 스키마라 앱에서 읽지 않는다';

-- ─── 3. 알림 종류에 live_start 를 더한다 ────────────────────────────────────
-- 이름을 찍어 drop 하면 이름이 다를 때 조용히 지나가고 옛 제약이 그대로 막는다 (20260919140000 과 같은 이유)
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     rel on rel.oid = con.conrelid
      join pg_namespace ns  on ns.oid  = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'student_messages'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%homework_checked%'
  loop
    execute format('alter table public.student_messages drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.student_messages
  add constraint student_messages_kind_check
  check (kind in ('general', 'study_checkin', 'homework_checked', 'live_start'));

comment on column public.student_messages.kind is
  'general(그냥 알림) | study_checkin(비대면 인증 독촉) | homework_checked(숙제 점검완료) | live_start(불라방 수업 시작). 넷은 서로 다른 일이다';

-- ─── 4. 수업이 시작된 반의 불라방 학생에게 ──────────────────────────────────
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
  v_n     int;
  v_total int := 0;
begin
  for r in
    -- 오늘 회차가 있고 시작 시각이 방금 지난 반
    select d.section_id, d.date, d.seq, s.time_block, c.name as course_name
      from public.session_dates  d
      join public.class_sections s on s.id = d.section_id
      join public.courses        c on c.id = s.course_id
     where d.date = v_today
       -- **인강 반은 뺀다** — 그 시간에 라이브가 없다. 학생은 오전 수업 녹화본을 본다 (도메인 규칙 1)
       and not s.recorded
       and v_today <= s.closes_at
       -- 시간대를 모르면 언제 시작하는지 알 수 없다 — 짐작하지 않는다
       and coalesce(s.start_time, private.time_block_start(s.time_block)) is not null
       and (d.date + coalesce(s.start_time, private.time_block_start(s.time_block))) <= v_now
       -- 크론이 멈췄다 살아나도 지난 수업까지 몰아 보내지 않는다 (15분이 넘으면 "지금 시작" 이 거짓말이다)
       and (d.date + coalesce(s.start_time, private.time_block_start(s.time_block))) > v_now - interval '15 minutes'
  loop
    -- 이미 보낸 (반, 날짜) 면 아무것도 넣지 않아 found 가 거짓이 된다 — 크론이 5분마다 돌아도 한 번만 간다
    insert into private.live_start_notices (section_id, class_date)
    values (r.section_id, r.date)
    on conflict (section_id, class_date) do nothing;
    if not found then continue; end if;

    -- **불라방(mode='live') 학생만.** 직접 배정된 반으로만 센다 — 묶음 반 학생에게 그 안의
    -- 시간 단위 반까지 세면 한 수업에 알림이 두세 개 간다 (도메인 규칙 1 "반 권한")
    insert into public.student_messages (user_id, sender_id, sender_name, title, body, kind, related)
    select e.student_id,
           null,
           '',   -- 사람이 보낸 것이 아니라 자동 알림이다. 화면은 이름이 비면 시각만 적는다
           left(r.course_name || ' 수업이 시작됐어요', 80),
           left(concat_ws(' · ', r.time_block, r.seq || '회차') || ' 수업이 시작됐어요. 불라방에서 입장해 주세요.', 1000),
           'live_start',
           jsonb_build_object('sectionId', r.section_id, 'date', r.date)
      from public.enrollments e
      join public.enrollment_orders o on o.id = e.order_id
     where e.section_id = r.section_id
       and e.mode = 'live'
       and e.status = 'active'
       and o.status = 'active';
    get diagnostics v_n = row_count;

    update private.live_start_notices
       set recipients = v_n
     where section_id = r.section_id and class_date = r.date;

    v_total := v_total + v_n;
  end loop;

  return v_total;
end;
$$;

comment on function private.notify_live_class_start() is
  '수업이 시작된 반의 불라방 학생에게 앱 안 알림을 보낸다 (인강 반 제외). pg_cron 이 5분마다 부른다';

revoke all on function private.time_block_start(text), private.notify_live_class_start() from public, anon, authenticated;
revoke all on table private.live_start_notices from public, anon, authenticated;

-- ─── 5. pg_cron ────────────────────────────────────────────────────────────
-- 5분마다. 실제 수업 시작 시각(10:00 · 11:10 · 12:30 · 13:50 · 18:30 · 19:40)이 전부 5의 배수라
-- 보통 0분 안에 나간다. 같은 이름의 예전 일정이 있으면 지우고 다시 건다
do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname = 'notify-live-class-start' loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'notify-live-class-start',
  '*/5 * * * *',
  $$ select private.notify_live_class_start() $$
);
