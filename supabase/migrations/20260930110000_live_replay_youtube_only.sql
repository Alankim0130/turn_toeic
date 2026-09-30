-- ============================================================================
-- 불라방은 Zoom, 다시보기는 유튜브에 따로 올린다 (2026-09-30 Alan)
--   "불라방은 zoom으로 올리고, 다시보기는 유튜브로 따로 한 번 더 업로드 예정"
--
--   20260918153000 은 "오전반 불라방 주소 = 끝나면 그대로 녹화본" 이라는 유튜브 라이브의 성질에 기대어,
--   수업이 끝난 회차의 불라방 링크를 그대로 다시보기(replays)로 만들었다 (private.promote_live_replays, 10분마다).
--   Zoom 입장 링크는 수업이 끝나면 들어갈 곳이 없다 — 그대로 두면 학생 다시보기에 **죽은 Zoom 링크**가 선다.
--
--   * 다시보기로 올리는 것은 **유튜브 주소일 때만** (private.is_youtube_url). Zoom 링크는 불라방에만 쓰인다.
--     녹화본은 강사가 유튜브에 올린 뒤 다시보기 등록(/admin/replays)에서 회차에 붙인다.
--   * 링크를 고칠 때 이미 만든 다시보기 주소를 따라 바꾸는 트리거도 **새 주소가 유튜브일 때만** 바꾼다 —
--     유튜브 녹화본이 붙은 회차의 불라방 링크를 Zoom 으로 바꿔도 녹화본은 그대로 남는다.
--   * 2026-09-30 운영 DB: 회차 링크 · 상시 링크 · 다시보기 모두 0건 — 고칠 지난 데이터가 없다.
-- ============================================================================

-- 앱의 isYoutubeUrl (src/lib/live-links.ts) 과 같은 규칙: youtube.com · 그 하위 도메인 · youtu.be
create or replace function private.is_youtube_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_url ~* '^https?://(([a-z0-9-]+[.])*youtube[.]com|youtu[.]be)([:/?#]|$)', false)
$$;

revoke all on function private.is_youtube_url(text) from public, anon, authenticated;

create or replace function private.promote_live_replays()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int := 0;
begin
  with due as (
    select l.session_date_id, l.live_url
      from public.session_live_links l
      join public.session_dates d on d.id = l.session_date_id
      join public.class_sections s on s.id = d.section_id
     where l.promoted_at is null
       and s.live_to_replay
       and private.is_youtube_url(l.live_url)   -- Zoom 입장 링크는 녹화본이 아니다 (2026-09-30)
       and not exists (select 1 from public.replays r where r.session_date_id = d.id)
       -- 시간대가 없는 반은 그 날이 지나면
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
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function private.promote_live_replays() is
  '수업이 끝난 회차의 불라방 링크가 유튜브 주소면 그 회차 다시보기로 만든다 (live_to_replay 반만, Zoom 링크는 안 올린다 — 2026-09-30). pg_cron 이 10분마다 부른다';

revoke all on function private.promote_live_replays() from public, anon, authenticated;

-- 링크를 바꾸면: 새 주소가 유튜브일 때만 이미 만든 다시보기(옛 주소)를 따라 바꾼다
create or replace function private.tg_session_live_link_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int := 0;
begin
  new.updated_at := now();
  if new.live_url is distinct from old.live_url then
    if private.is_youtube_url(new.live_url) then
      update public.replays r
         set video_url = new.live_url
       where r.session_date_id = new.session_date_id
         and r.video_url = old.live_url;
      get diagnostics v_n = row_count;
    end if;
    new.promoted_at := case when v_n > 0 then now() else null end;
  end if;
  return new;
end;
$$;
