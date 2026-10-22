-- ============================================================================
-- 평달 반 자동 세팅 — 버튼 없이 (2026-10-22 Alan)
--
--   Alan: "방학달 1,2,7,8월만 강사가 직접 반을 열어야하고 나머지는 자동으로 세팅되도록 부탁해!"
--         → 반 편성 카드의 '11월 시간표 · 반 한 번에 만들기' 를 눌러 보고 "버튼을 안눌러도 자동으로 세팅되도록 부탁해"
--
--   평달 달력을 저장할 때 · 시간표 설정에서 그 달 시간표를 만들 때는 앱이 그 자리에서 시간표와 반을 연다
--   (src/app/admin/sections/_lib/open-month.ts 의 autoOpenMonth). 그래도 반이 없는 평달 — 이 기능 전에 달력을 저장해 둔 달 ·
--   그때 못 연 달 · 강사가 반을 다 지운 달 — 은 그동안 반 편성 카드의 버튼을 눌러야 했다. 이제 DB 가 10분마다 보고 앱을 불러 저절로 연다.
--
--   1. public.open_month_sections(기수, 반 줄들, 빈 달만) — 반을 넣는 한곳. 기수마다 잠금(advisory lock)을 건 뒤 세고 넣어서
--      달력 저장 · 10분 확인 · 새 반 개설이 같은 순간에 돌아도 같은 반이 두 벌 생기지 않는다 (class_sections 에는 (기수 · 강좌 · 트랙 · 시간대) unique 가 없다 —
--      운영 데이터를 못 보고 unique 를 걸면 겹친 옛 반 때문에 배포가 통째로 실패할 수 있어 잠금으로 막는다).
--      빈 달만(기본) = 그 기수에 반이 **하나도 없을 때만** 넣는다 (자동 세팅). 새 반 개설은 빈 달만을 끄고 부른다 — 이미 있는 (강좌 · 트랙 · 시간대)는 건너뛴다.
--      부른 사람의 권한으로 돈다(security invoker) — 강사 · 관리자 세션이면 반 개설 정책("class_sections: 강사 개설")이, 10분 확인(service_role)이면 서버 권한이 넣는다.
--   2. public.month_auto_open_state — 기수마다 10분 확인의 마지막 결과 (못 열었으면 까닭). 강사 · 관리자가 반 편성 카드에서 보고, 서버만 쓴다.
--   3. private.month_auto_open_due() — 열 달이 있나: 평달 · 개강일 · 종강일 있음 · 종강 전 · 반 0개.
--      방학달(1 · 2 · 7 · 8월)은 시간표가 해마다 달라 강사가 직접 연다 — 앱 VACATION_MONTHS(src/lib/timetable.ts)와 같은 목록 (month-open.test.ts 가 본다).
--   4. pg_cron month-auto-open — 10분마다, 열 달이 있을 때만 /api/cron/month-auto-open 을 부른다 (private.call_app).
--      못 여는 까닭이 남아 있어도(가져올 시간표가 없음 등) 10분마다 다시 해 본다 — 강사가 시간표를 더하는 순간 다음 확인에서 열린다.
-- ============================================================================

-- ─── 1. 반 넣기 — 기수마다 잠금 · 빈 달만 · 겹치는 반 건너뛰기 ─────────────────────────
create or replace function public.open_month_sections(p_term bigint, p_rows jsonb, p_only_if_empty boolean default true)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_term is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  -- 같은 기수에 반을 넣는 호출은 줄을 선다 — 뒤 호출은 앞 호출이 넣은 반을 보고 세거나 건너뛴다
  perform pg_advisory_xact_lock(hashtextextended('open_month_sections', p_term));
  if coalesce(p_only_if_empty, true) and exists (select 1 from public.class_sections s where s.term_id = p_term) then
    return 0;
  end if;

  insert into public.class_sections (
    term_id, course_id, track, time_block, enrollment_opens_at, closes_at, target_sessions,
    instructor_id, capacity, status, book_set, subject, recorded, live_to_replay, bundle_id
  )
  select p_term, r.course_id, r.track, r.time_block, r.enrollment_opens_at, r.closes_at, r.target_sessions,
         r.instructor_id, r.capacity, coalesce(r.status, 'open'), r.book_set, r.subject,
         coalesce(r.recorded, false), coalesce(r.live_to_replay, true), r.bundle_id
    from jsonb_to_recordset(p_rows) as r(
      course_id bigint, track text, time_block text, enrollment_opens_at date, closes_at date, target_sessions integer,
      instructor_id uuid, capacity integer, status text, book_set text, subject text, recorded boolean, live_to_replay boolean, bundle_id uuid
    )
   -- 이미 있는 (강좌 · 트랙 · 시간대)는 건너뛴다 — 화면이 세고 나서 넣기까지의 틈에 다른 길이 넣었어도 두 벌이 되지 않게
   where not exists (
     select 1
       from public.class_sections s
      where s.term_id = p_term
        and s.course_id = r.course_id
        and s.track = r.track
        and s.time_block is not distinct from r.time_block
   );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.open_month_sections(bigint, jsonb, boolean) is
  '반 넣기 — 기수마다 잠금, 빈 달만(기본)이면 그 기수에 반이 하나도 없을 때만, 이미 있는 (강좌 · 트랙 · 시간대)는 건너뛴다. 넣은 수를 돌려준다. 부른 사람의 권한으로 돈다 — 강사 · 관리자 세션 또는 서버';

revoke all on function public.open_month_sections(bigint, jsonb, boolean) from public, anon;
grant execute on function public.open_month_sections(bigint, jsonb, boolean) to authenticated, service_role;

-- ─── 2. 10분 확인의 마지막 결과 ─────────────────────────────────────────────────
create table if not exists public.month_auto_open_state (
  term_id   bigint primary key references public.terms (id) on delete cascade,
  tried_at  timestamptz not null default now(),
  -- 못 연 까닭 — no_timetable(가져올 시간표가 없음) · timetable_error · sections_error · forbidden · no_sections(시간표에 이 달 강좌의 시간대가 없음). 열었으면 null (앱 AUTO_OPEN_STATE_ERRORS)
  error     text constraint month_auto_open_state_error_check check (error is null or error in ('no_timetable', 'timetable_error', 'sections_error', 'forbidden', 'no_sections')),
  -- 열었으면 연 반 수
  sections  integer not null default 0
);

comment on table public.month_auto_open_state is
  '평달 자동 세팅 — 기수마다 10분 확인(/api/cron/month-auto-open)의 마지막 결과. 강사 · 관리자가 반 편성 카드에서 본다, 서버만 쓴다';

alter table public.month_auto_open_state enable row level security;

drop policy if exists "month_auto_open_state: 스태프 조회" on public.month_auto_open_state;
create policy "month_auto_open_state: 스태프 조회" on public.month_auto_open_state
  for select to authenticated
  using ((select private.is_staff()));

revoke all on public.month_auto_open_state from anon, authenticated;
grant select on public.month_auto_open_state to authenticated;
grant select, insert, update, delete on public.month_auto_open_state to service_role;

-- ─── 3. 열 달이 있나 ──────────────────────────────────────────────────────────
create or replace function private.month_auto_open_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.terms t
     where t.enrollment_opens_at is not null
       and t.closes_at is not null
       and t.closes_at >= private.today_kst()
       -- 방학달은 강사가 직접 연다 (앱 VACATION_MONTHS 와 같은 목록)
       and t.month not in (1, 2, 7, 8)
       and not exists (select 1 from public.class_sections s where s.term_id = t.id)
  )
$$;

revoke all on function private.month_auto_open_due() from public, anon, authenticated;

-- ─── 4. 10분마다 — 열 달이 있을 때만 우리 API 를 부른다 ─────────────────────────────
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'month-auto-open' loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'month-auto-open',
  '*/10 * * * *',
  $$ select private.call_app('/api/cron/month-auto-open') where private.month_auto_open_due() $$
);
