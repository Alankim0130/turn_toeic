-- ============================================================================
-- 잡힌 유튜브 송출을 불라방 링크로도 넣는다 (2026-10-01 Alan)
--
--   "지금은 줌 링크를 학생들에게 보내는데, 어차피 유튜브 라이브스트리밍도 자동으로 연결될테니, 강사와 시간에 맞춰서
--    너가 불라방도 유튜브 링크를 가져와서 바로 연결을 해줄 수 있어? 그리고 해당영상이 다시보기 영상으로 넘어가는거야."
--
--   20261001140000 은 감지한 송출을 session_streams 에만 두고 불라방 링크(Zoom)는 건드리지 않았다. 이제
--     * register_detected_stream 이 송출을 걸어 둔 회차 중 **불라방 링크가 비어 있는 회차**에는 같은 주소를 불라방 링크로도 넣는다
--       (session_live_links, source = 'youtube'). 그 순간 session_live_links 트리거가 불라방 학생에게 "불라방이 시작됐어요" 를 보낸다
--       (수업 시각 앞뒤일 때 — 20260921120500). **강사가 손으로 넣어 둔 링크(Zoom 등)는 덮어쓰지 않는다** — on conflict do nothing.
--     * 돌려주는 값은 회차마다 (session_date_id, live_linked) — 강사 푸시가 "불라방 링크로도 들어갔다" 를 말할 수 있게.
--     * promote_live_replays 는 다시보기를 만든 뒤 같은 회차·같은 주소의 송출·불라방 링크 둘 다 promoted_at 을 맞춘다 —
--       한쪽 갈래가 만든 다시보기를 다른 쪽이 `not exists replays` 로 건너뛰면 그쪽 표시(끝나면 다시보기로 · 송출 잡힘)가 영영 안 바뀐다.
-- ============================================================================

-- 돌려주는 모양이 바뀌므로(bigint[] → 표) 먼저 지운다
drop function if exists public.register_detected_stream(bigint[], text);

create or replace function public.register_detected_stream(p_session_date_ids bigint[], p_url text)
returns table (session_date_id bigint, live_linked boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
-- 돌려주는 칸 이름(session_date_id)이 on conflict 의 칸 이름과 겹친다 — 표의 칸으로 푼다
declare
  v_ids bigint[];
  v_linked bigint[];
begin
  if p_url !~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{6,20}$' then
    raise exception 'bad_url';
  end if;

  -- ① 송출 표 — 그 사이 다른 방송이 먼저 잡혔으면 건드리지 않는다
  with ins as (
    insert into public.session_streams (session_date_id, video_url)
    select x, p_url from unnest(coalesce(p_session_date_ids, '{}')) x
    on conflict (session_date_id) do nothing
    returning session_streams.session_date_id
  )
  select coalesce(array_agg(ins.session_date_id), '{}') into v_ids from ins;

  -- ② 불라방 링크가 비어 있는 회차에는 같은 주소를 불라방 링크로도 (손으로 넣은 링크는 그대로). 트리거가 학생 알림을 보낸다
  with ins as (
    insert into public.session_live_links (session_date_id, live_url, source)
    select x, p_url, 'youtube' from unnest(v_ids) x
    on conflict (session_date_id) do nothing
    returning session_live_links.session_date_id
  )
  select coalesce(array_agg(ins.session_date_id), '{}') into v_linked from ins;

  return query
    select x, (x = any (v_linked)) from unnest(v_ids) x;
end;
$$;

comment on function public.register_detected_stream(bigint[], text) is
  '감지한 유튜브 송출을 회차에 걸어 두고, 불라방 링크가 비어 있으면 그 주소를 불라방 링크로도 넣는다 (2026-10-01). 수업이 끝나면 promote_live_replays 가 다시보기로. service_role 전용';

revoke all on function public.register_detected_stream(bigint[], text) from public, anon, authenticated;
grant execute on function public.register_detected_stream(bigint[], text) to service_role;

-- ─── 승격 뒤 두 갈래의 표시를 맞춘다 ─────────────────────────────────────
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
  -- ① 유튜브 송출 (Zoom → 유튜브, 2026-10-01)
  with due as (
    select st.session_date_id, st.video_url
      from public.session_streams st
      join public.session_dates d on d.id = st.session_date_id
      join public.class_sections s on s.id = d.section_id
     where st.promoted_at is null
       and s.live_to_replay
       and not exists (select 1 from public.replays r where r.session_date_id = d.id)
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

  -- ② 회차 불라방 링크가 유튜브 주소일 때 (유튜브 라이브로 돌아갈 때를 위해 남긴다 — 20260930110000)
  with due as (
    select l.session_date_id, l.live_url
      from public.session_live_links l
      join public.session_dates d on d.id = l.session_date_id
      join public.class_sections s on s.id = d.section_id
     where l.promoted_at is null
       and s.live_to_replay
       and private.is_youtube_url(l.live_url)
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

  -- ③ 같은 회차 · 같은 주소로 다시보기가 이미 있으면 다른 갈래의 표시도 맞춘다 (한쪽이 만든 다시보기를 다른 쪽이 건너뛴 경우)
  update public.session_streams st
     set promoted_at = now()
    from public.replays r
   where r.session_date_id = st.session_date_id
     and st.promoted_at is null
     and r.video_url = st.video_url;

  update public.session_live_links l
     set promoted_at = now()
    from public.replays r
   where r.session_date_id = l.session_date_id
     and l.promoted_at is null
     and r.video_url = l.live_url;

  return v_streams + v_links;
end;
$$;

comment on function private.promote_live_replays() is
  '수업이 끝난 회차의 유튜브 송출(session_streams)과 유튜브 주소인 불라방 링크를 그 회차 다시보기로 만들고, 같은 주소의 두 갈래 표시를 맞춘다 (live_to_replay 반만). pg_cron 이 10분마다 부른다';

revoke all on function private.promote_live_replays() from public, anon, authenticated;

comment on column public.session_live_links.source is
  'manual(강사가 붙여 넣음) | youtube(감지한 송출이 비어 있는 칸에 저절로 들어감 — 2026-10-01 부터 다시, 2026-09-21~30 에도 그랬다)';
