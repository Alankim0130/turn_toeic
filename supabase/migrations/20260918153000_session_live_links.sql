-- ============================================================================
-- 회차별 불라방 링크 → 수업이 끝나면 그 회차 다시보기로 (2026-09-18 Alan 요청)
--
--  "오전반에 불라방을 진행하고 나면, 해당 링크는 다시보기 링크로 자동으로 같이 연결이 되면 좋겠어.
--   그 이후에 진행하는 불라방은 다시보기랑 연관이 없이 순수하게 불라방만 진행을 할거야."
--
--  * 불라방 링크는 유튜브 라이브처럼 **방송이 끝나면 그 주소가 그대로 녹화본**이다. 그래서 링크를 반이 아니라
--    **회차(session_dates)** 에 붙이고, 그 회차의 수업이 끝난 뒤(시간대 종료 시각, KST) 다시보기가 없으면
--    같은 주소로 replays 를 만든다 — pg_cron 이 10분마다 private.promote_live_replays() 를 돈다.
--  * **오전반만** 그렇게 한다 (class_sections.live_to_replay). 저녁 반의 불라방은 다시보기와 연결하지 않는다.
--    시간표에 "화목금 인강" 이 켜진 줄(timetable_slots.ttf_recorded = 저녁 줄)의 반은 두 트랙 모두 live_to_replay = false 로 시작한다.
--    반 상세에서 반마다 켜고 끌 수 있다.
--  * 반 단위 상시 링크(section_live_links, Zoom 같은 고정 방)는 그대로 두고, 그 날 회차 링크가 없을 때만 쓴다.
--  * 저녁 화목금 인강 반 학생의 다시보기 (미확정 2-2 "화목금 다시보기 권한은 모두 부여"): 같은 기수 · 강좌 · 트랙에서 인강이 아닌 반 중
--    **같은 과목(LC 교재가 같거나 둘 다 RC) · 같은 묶음 여부**인 반이 오전 짝이다 — 편성표의 18:30 줄이 10:00 줄과 같은 650A 다.
--    **다시보기 조회에만** 쓴다. 수업일·불라방 링크는 오전 반 것이 열리지 않는다 (private.has_recorded_replay_access).
-- ============================================================================

-- ─── 1. 오전반 표시: 불라방이 끝나면 다시보기로 ────────────────────────────
alter table public.class_sections
  add column if not exists live_to_replay boolean not null default true;

comment on column public.class_sections.live_to_replay is
  '수업이 끝나면 그 회차 불라방 링크를 다시보기로 자동 연결한다 (2026-09-18 Alan: 오전반만). '
  '저녁 반(timetable_slots.ttf_recorded 줄)은 false 로 시작 — 그 뒤 불라방은 순수 라이브';

-- 저녁 줄(화목금 인강이 켜진 시간대)의 반은 두 트랙 모두 끈다
update public.class_sections s
   set live_to_replay = false
  from public.timetable_slots t, public.courses c
 where c.id = s.course_id
   and c.target_score = t.level
   and c.program = t.program
   and t.ttf_recorded
   and s.time_block = to_char(t.start_time, 'HH24:MI') || '~' || to_char(t.end_time, 'HH24:MI')
   and s.live_to_replay;

-- ─── 2. 회차별 불라방 링크 ─────────────────────────────────────────────────
create table if not exists public.session_live_links (
  session_date_id bigint primary key references public.session_dates (id) on delete cascade,
  live_url        text not null,
  updated_at      timestamptz not null default now(),
  promoted_at     timestamptz                      -- 이 링크로 다시보기를 만든 시각. 링크를 바꾸면 다시 판정한다
);

comment on table public.session_live_links is
  '회차별 불라방 입장 링크 (2026-09-18). 반의 live_to_replay 가 켜져 있으면 수업이 끝난 뒤 같은 주소로 replays 가 생긴다';

alter table public.session_live_links enable row level security;

create policy "session_live_links: 수강생·스태프 조회" on public.session_live_links
  for select to authenticated
  using (
    (select private.is_staff())
    or exists (select 1 from public.session_dates sd where sd.id = session_date_id and (select private.has_section_access(sd.section_id)))
  );

create policy "session_live_links: 담당 강사 등록" on public.session_live_links
  for insert to authenticated
  with check (exists (select 1 from public.session_dates sd where sd.id = session_date_id and (select private.can_manage_section(sd.section_id))));

create policy "session_live_links: 담당 강사 수정" on public.session_live_links
  for update to authenticated
  using (exists (select 1 from public.session_dates sd where sd.id = session_date_id and (select private.can_manage_section(sd.section_id))))
  with check (exists (select 1 from public.session_dates sd where sd.id = session_date_id and (select private.can_manage_section(sd.section_id))));

create policy "session_live_links: 담당 강사 삭제" on public.session_live_links
  for delete to authenticated
  using (exists (select 1 from public.session_dates sd where sd.id = session_date_id and (select private.can_manage_section(sd.section_id))));

grant select, insert, update, delete on public.session_live_links to authenticated;
grant all on public.session_live_links to service_role;

-- 링크를 바꾸면: 이미 만든 다시보기가 그 옛 주소면 함께 바꾸고, 없으면 다시 판정하도록 promoted_at 을 비운다
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
       and r.video_url = old.live_url;
    get diagnostics v_n = row_count;
    new.promoted_at := case when v_n > 0 then now() else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists session_live_links_changed on public.session_live_links;
create trigger session_live_links_changed
  before update on public.session_live_links
  for each row execute function private.tg_session_live_link_changed();

-- ─── 3. 수업이 끝난 회차의 링크를 다시보기로 ──────────────────────────────
-- "10:00~12:10" → 12:10. 형식이 다르면 null
create or replace function private.time_block_end(p_block text)
returns time
language sql
immutable
set search_path = ''
as $$
  select case when p_block ~ '^\d{2}:\d{2}~\d{2}:\d{2}$' then split_part(p_block, '~', 2)::time end
$$;

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
  '수업이 끝난 회차의 불라방 링크를 그 회차 다시보기로 만든다 (live_to_replay 반만). pg_cron 이 10분마다 부른다';

revoke all on function private.time_block_end(text), private.promote_live_replays() from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'promote-live-replays' loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'promote-live-replays',
  '*/10 * * * *',
  $$ select private.promote_live_replays() $$
);

-- ─── 4. 저녁 화목금 인강 반 → 오전 짝의 다시보기 ──────────────────────────
-- 인강 반의 오전 짝: 같은 기수 · 강좌 · 트랙에서 인강이 아닌 반 중 같은 과목(LC 교재 같음 / 둘 다 RC) · 같은 묶음 여부.
-- 여러 개면 가장 이른 시간대. 인강 반이 아니면 null
create or replace function private.recorded_source_section(p_section_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
    from public.class_sections e
    join public.class_sections m
      on m.term_id = e.term_id and m.course_id = e.course_id and m.track = e.track and m.id <> e.id and not m.recorded
   where e.id = p_section_id
     and e.recorded
     and m.book_set is not distinct from e.book_set
     and private.is_package_section(m.id) = private.is_package_section(e.id)
   order by m.time_block
   limit 1
$$;

-- 내가 인강 반 학생이고 p_section_id 가 그 오전 짝(또는 짝 묶음 반이 여는 시간 단위 반)인가 — 다시보기 조회 전용
create or replace function private.has_recorded_replay_access(p_section_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_role() in ('student', 'instructor', 'admin')
     and exists (
       select 1
         from public.enrollments en
         join public.enrollment_orders o on o.id = en.order_id
         join public.class_sections s on s.id = en.section_id
        where en.student_id = (select auth.uid())
          and en.status = 'active'
          and o.status = 'active'
          and private.today_kst() <= s.closes_at
          and s.recorded
          and (
            private.recorded_source_section(s.id) = p_section_id
            or private.section_includes(private.recorded_source_section(s.id), p_section_id)
          )
     )
$$;

revoke all on function private.recorded_source_section(bigint), private.has_recorded_replay_access(bigint) from public, anon;
grant execute on function private.recorded_source_section(bigint), private.has_recorded_replay_access(bigint) to authenticated, service_role;

-- 인강 학생이 오전 짝의 회차(날짜·회차 번호)도 읽어야 다시보기 화면에 날짜가 붙는다 — 정책 안의 session_dates 조회도 이 정책을 탄다
drop policy if exists "session_dates: 수강생·스태프 조회" on public.session_dates;
create policy "session_dates: 수강생·스태프 조회" on public.session_dates
  for select to authenticated
  using (
    (select private.has_section_access(section_id))
    or (select private.has_recorded_replay_access(section_id))
    or (select private.is_staff())
  );

drop policy if exists "replays: 수강생·스태프 조회" on public.replays;
create policy "replays: 수강생·스태프 조회" on public.replays
  for select to authenticated
  using (
    (select private.is_staff())
    or exists (
      select 1 from public.session_dates sd
       where sd.id = replays.session_date_id
         and ((select private.has_section_access(sd.section_id)) or (select private.has_recorded_replay_access(sd.section_id)))
    )
  );

-- 관리자 화면·학생 화면이 "이 반의 오전 짝" 을 보여 줄 때 쓴다
create or replace function public.recorded_source_section(p_section_id bigint)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select private.recorded_source_section(p_section_id)
$$;

revoke all on function public.recorded_source_section(bigint) from public, anon;
grant execute on function public.recorded_source_section(bigint) to authenticated, service_role;
