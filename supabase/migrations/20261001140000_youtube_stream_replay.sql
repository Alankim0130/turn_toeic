-- ============================================================================
-- Zoom 수업을 유튜브로 함께 송출하면 그 영상이 그 회차 다시보기로 (2026-10-01 Alan)
--
--   "Zoom에서 고급에 들어가면 유튜브를 자동으로 연결하는 기능이 있다 … 쌤들이 Zoom으로 수업을 하되, 유튜브 자동연결을 통해서
--    미공개로 송출이 된다는 말이잖아? 그럼 해당 유튜브 링크를 자동으로 다시보기란으로 넣어줄 수 있을까?"
--
--   20260921120500 은 감지한 유튜브 방송을 **불라방 링크**(session_live_links)에 넣었다 — 그때는 불라방이 유튜브 라이브였다.
--   2026-09-30 부터 불라방은 Zoom 이라(20260930110000) 그 칸은 Zoom 입장 링크가 차지한다. 그래서 지금 구조로는
--     * 후보 함수의 `링크 없음` 조건 때문에 Zoom 링크를 넣어 둔 회차는 아예 감지하지 않았고,
--     * 감지하더라도 `on conflict do nothing` 이라 유튜브 주소가 버려졌다.
--
--   이제 감지한 방송은 **회차별 유튜브 송출 표(session_streams)** 에 따로 둔다 — 불라방 링크(Zoom)는 건드리지 않는다.
--     * 후보 = 오늘 · 시간 단위 반 · 인강 아님 · **live_to_replay 반**(끝나면 다시보기로 만들 반 — 저녁 반은 오전 녹화본을 본다) ·
--       담당 강사가 채널 연결 · **송출도 다시보기도 아직 없음** · 수업 시작 −10분 ~ +30분. 불라방 링크가 있든 없든 상관없다.
--     * 수업이 끝나면 promote_live_replays 가 그 주소를 그 회차 다시보기(replays)로 만든다 (유튜브 라이브 주소는 끝나면 그대로 녹화본).
--     * 학생 알림은 가지 않는다 — "불라방이 시작됐어요" 는 Zoom 링크가 들어올 때 session_live_links 트리거가 보낸다. 강사 본인에게만 확인 푸시.
--   유튜브 주소를 불라방 링크로 넣던 옛 함수 register_detected_live 는 지운다 (쓰는 곳이 없다).
-- ============================================================================

-- ─── 1. 회차별 유튜브 송출 ─────────────────────────────────────────────────
create table if not exists public.session_streams (
  session_date_id bigint primary key references public.session_dates (id) on delete cascade,
  video_url       text not null,
  detected_at     timestamptz not null default now(),
  promoted_at     timestamptz                      -- 이 주소로 다시보기를 만든 시각
);

comment on table public.session_streams is
  '회차별 유튜브 송출 (2026-10-01). Zoom 수업을 유튜브로 함께 송출한 방송을 감지해 두고, 수업이 끝나면 그 회차 다시보기로 만든다. 불라방 링크와 별개다';

alter table public.session_streams enable row level security;

create policy "session_streams: 스태프 조회" on public.session_streams
  for select to authenticated using ((select private.is_staff()));

grant select on public.session_streams to authenticated;
grant all on public.session_streams to service_role;

-- ─── 2. 지금 감지할 회차 ──────────────────────────────────────────────────
-- 오늘 · 시간 단위 반 · 인강 아님 · live_to_replay · 담당 강사가 채널을 연결함 · 송출·다시보기 없음 · 수업 시작 10분 전 ~ 30분 뒤.
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
     and s.live_to_replay                      -- 끝나면 다시보기로 만들 반만 (저녁 반은 오전 짝의 녹화본을 본다)
     and c.program = 'score'
     and not private.is_package_section(s.id)
     and private.time_block_start(s.time_block) is not null
     and private.today_kst() <= s.closes_at
     and not exists (select 1 from public.session_streams st where st.session_date_id = d.id)
     and not exists (select 1 from public.replays r where r.session_date_id = d.id)
     and now() between ((d.date + private.time_block_start(s.time_block)) at time zone 'Asia/Seoul') - interval '10 minutes'
                   and ((d.date + private.time_block_start(s.time_block)) at time zone 'Asia/Seoul') + interval '30 minutes'
$$;

comment on function public.live_detect_candidates() is
  '지금 유튜브에서 방송을 찾아볼 회차 — 송출·다시보기가 아직 없는 live_to_replay 반 (2026-10-01). service_role 전용 (/api/cron/live-detect)';

-- ─── 3. 찾은 방송을 송출 표에 넣는다 ──────────────────────────────────────
drop function if exists public.register_detected_live(bigint[], text);

-- 그 사이 다른 방송이 먼저 잡혔으면 건드리지 않는다 (on conflict do nothing). 넣은 회차 id 를 돌려준다
create or replace function public.register_detected_stream(p_session_date_ids bigint[], p_url text)
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
    insert into public.session_streams (session_date_id, video_url)
    select x, p_url from unnest(coalesce(p_session_date_ids, '{}')) x
    on conflict (session_date_id) do nothing
    returning session_date_id
  )
  select coalesce(array_agg(ins.session_date_id), '{}') into v_ids from ins;
  return v_ids;
end;
$$;

comment on function public.register_detected_stream(bigint[], text) is
  '감지한 유튜브 송출을 회차에 걸어 둔다 (이미 있으면 그대로). 수업이 끝나면 promote_live_replays 가 다시보기로 만든다. service_role 전용';

revoke all on function public.register_detected_stream(bigint[], text) from public, anon, authenticated;
grant execute on function public.register_detected_stream(bigint[], text) to service_role;

-- ─── 4. 수업이 끝난 회차 → 다시보기 ───────────────────────────────────────
-- ① 유튜브 송출(session_streams) ② 회차 불라방 링크가 유튜브 주소일 때(유튜브 라이브로 돌아갈 때를 위해 남긴다 — 20260930110000).
-- 둘 다 live_to_replay 반만, 이미 다시보기가 있는 회차는 건너뛴다
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
  with due as (
    select st.session_date_id, st.video_url
      from public.session_streams st
      join public.session_dates d on d.id = st.session_date_id
      join public.class_sections s on s.id = d.section_id
     where st.promoted_at is null
       and s.live_to_replay
       and not exists (select 1 from public.replays r where r.session_date_id = d.id)
       -- 시간대가 없는 반은 그 날이 지나면
       and (d.date + coalesce(private.time_block_end(s.time_block), time '23:59')) <= (now() at time zone 'Asia/Seoul')
  ),
  ins as (
    insert into public.replays (session_date_id, video_url)
    select session_date_id, video_url from due
    returning session_date_id
  )
  update public.session_streams st
     set promoted_at = now()
    from ins
   where st.session_date_id = ins.session_date_id;
  get diagnostics v_streams = row_count;

  with due as (
    select l.session_date_id, l.live_url
      from public.session_live_links l
      join public.session_dates d on d.id = l.session_date_id
      join public.class_sections s on s.id = d.section_id
     where l.promoted_at is null
       and s.live_to_replay
       and private.is_youtube_url(l.live_url)   -- Zoom 입장 링크는 녹화본이 아니다 (2026-09-30)
       and not exists (select 1 from public.replays r where r.session_date_id = d.id)
       and (d.date + coalesce(private.time_block_end(s.time_block), time '23:59')) <= (now() at time zone 'Asia/Seoul')
  ),
  ins as (
    insert into public.replays (session_date_id, video_url)
    select session_date_id, live_url from due
    returning session_date_id
  )
  update public.session_live_links l
     set promoted_at = now()
    from ins
   where l.session_date_id = ins.session_date_id;
  get diagnostics v_links = row_count;

  return v_streams + v_links;
end;
$$;

comment on function private.promote_live_replays() is
  '수업이 끝난 회차의 유튜브 송출(session_streams)과 유튜브 주소인 불라방 링크를 그 회차 다시보기로 만든다 (live_to_replay 반만). pg_cron 이 10분마다 부른다';

revoke all on function private.promote_live_replays() from public, anon, authenticated;

-- ─── 5. 알림 설정 뜻 갱신 ─────────────────────────────────────────────────
comment on column public.notification_settings.live_detected is
  '내 유튜브 송출이 잡혀 그 회차 다시보기로 예약되면 알림 (강사 본인에게만, 2026-10-01 — 그전에는 불라방 링크가 들어갔을 때)';
