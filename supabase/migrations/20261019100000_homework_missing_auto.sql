-- ============================================================================
-- 숙제 미제출 자동 알림 (2026-10-19 Alan)
--
--   Alan: "숙제 미알람을 자동으로 매일 보내주는 시스템이 생기면 좋겠어. 시간은 쌤들이 정할 수 있으며, 월수금, 화목금 위주로 알림을 보내줘.
--          그리고 알림을 안 받는다고 선택한 친구들에게는 보내지말고, 받는다고 한 친구에게도 두번 가는건 막아줘.
--          여기 미제출알림 맨 위에 자동알림 보내기 설정칸이 있으면 좋겠어."
--
--   숙제 기한은 같은 트랙 다음 수업일 오후 5시다 (20261014100000). 그래서 하루에 기한이 지나는 숙제는 그날 수업의 트랙 하나뿐이다 —
--   월수금 수업일 5시에는 월수금 숙제가, 화목금 수업일 5시에는 화목금 숙제가 지난다. 자동 알림은 **매일 쌤이 정한 저녁 시각(17:00 ~ 23:55)에 한 번**
--   그 뒤로 새로 기한이 지난 숙제를 안 낸 학생에게만 간다 → 월수금 날 저녁에는 월수금 숙제, 화목금 날 저녁에는 화목금 숙제 알림이 된다.
--
--   누구에게 · 무엇을 보내는지는 앱이 정한다 (src/lib/homework-missing-auto.ts — 손으로 보내는 미제출 알림과 같은 격자 · 같은 규칙):
--     · '알림 안 받기' 를 누른 학생 · 조교 · 강사 · 관리자 계정은 빼고 (DB 트리거 student_messages_homework_missing_optout 도 그대로 막는다)
--     · **두 번 가지 않게** — 하루 한 번만 돈다(아래 2 · 3) · 학생 한 명에게 한 통(속성반의 650 · 850 처럼 레벨이 둘이어도 한 통) ·
--       이미 알림을 받은(손으로든 자동으로든) 숙제로는 다시 보내지 않는다(그 레벨에서 마지막 알림 뒤에 기한이 지난 숙제가 있을 때만)
--
--   여기서 하는 것:
--     1. 설정 한 줄 homework_missing_auto (켜기 · 보내는 시각) — 강사 · 관리자가 바꾸고 조교는 본다. 처음엔 꺼져 있다.
--     2. 실행 기록 homework_missing_auto_runs — 하루 한 줄 (그날 실행을 가져가는 표시이자 결과). 화면이 마지막 자동 알림을 보여 준다.
--     3. pg_cron homework-missing-auto (5분마다 — 보낼 때가 됐을 때만 우리 API 를 부른다) → /api/cron/homework-missing-auto 가 claim_homework_missing_auto() 로
--        그날 실행을 가져가고 보낸 뒤 기록을 닫는다. 실행이 중간에 멈추면 15분 뒤 다시 가져간다 (이미 받은 학생은 위 규칙이 빼서 두 번 가지 않는다).
--     4. 자동 알림은 보낸 사람이 없다(sender_id null) — 보낸 이름 트리거가 안 낸 과목의 선생님 이름을 적는다 (손으로 보낸 조교 · 관리자 알림과 같다).
--     5. 한 통에 레벨이 여럿이면 related.levels 에 다 적는다 — 보낸 시각 함수(homework_missing_notices)가 레벨마다 펼쳐서
--        화면의 '알림 오늘 21:00' · '미제출 전체선택' 이 자동 알림도 센다 (그래서 손으로 다시 골라지지 않는다).
-- ============================================================================

-- ─── 1. 설정 한 줄 ─────────────────────────────────────────────────────────
create table if not exists public.homework_missing_auto (
  id                  boolean primary key default true constraint homework_missing_auto_one check (id),
  enabled             boolean not null default false,
  -- 숙제 기한(오후 5시) 뒤 · 5분 단위 — 그날 기한이 지난 숙제를 그날 저녁에 알린다 (크론이 5분마다 돈다)
  send_time           time not null default '21:00'
    constraint homework_missing_auto_time_check
    check (send_time between '17:00' and '23:55' and (extract(minute from send_time))::int % 5 = 0 and extract(second from send_time) = 0),
  -- 이 시각 뒤에 기한이 지난 숙제만 '새로 지난 숙제' 로 본다 — 실행이 끝나면 그 실행이 본 시각으로 올린다. 켜는 순간 첫 실행일 0시로 (꺼 둔 동안의 숙제를 한꺼번에 알리지 않는다)
  covered_until       timestamptz,
  -- 켜기 · 시각을 바꾼 때 — 그 뒤에 오는 시각부터 보낸다 (지난 시각으로 바꿔도 그 자리에서 보내지 않는다)
  schedule_changed_at timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id) on delete set null
);

comment on table public.homework_missing_auto is
  '숙제 미제출 자동 알림 설정 (2026-10-19 Alan) — 한 줄. 켜면 매일 send_time 에 새로 기한이 지난 숙제를 안 낸 학생에게 한 번 (/api/cron/homework-missing-auto)';

insert into public.homework_missing_auto (id) values (true) on conflict (id) do nothing;

-- 켜기 · 시각이 바뀔 때만 바꾼 사람 · 때를 적는다 (실행이 covered_until 을 올릴 때는 건드리지 않는다)
create or replace function private.tg_homework_missing_auto_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.today_kst();
begin
  if new.enabled is distinct from old.enabled or new.send_time is distinct from old.send_time then
    new.schedule_changed_at := now();
    new.updated_at := now();
    new.updated_by := auth.uid();   -- 서버(service_role)가 바꾸면 비어 있다
    -- 켜는 순간: 첫 자동 알림이 도는 날(오늘 시각이 아직이면 오늘, 지났으면 내일)의 0시부터 기한이 지난 숙제를 본다
    if new.enabled and not old.enabled then
      new.covered_until := case
        when (v_today + new.send_time) at time zone 'Asia/Seoul' > now() then v_today::timestamp at time zone 'Asia/Seoul'
        else (v_today + 1)::timestamp at time zone 'Asia/Seoul'
      end;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.tg_homework_missing_auto_touch() from public, anon, authenticated;

drop trigger if exists homework_missing_auto_touch on public.homework_missing_auto;
create trigger homework_missing_auto_touch
  before update on public.homework_missing_auto
  for each row execute function private.tg_homework_missing_auto_touch();

alter table public.homework_missing_auto enable row level security;

grant select on public.homework_missing_auto to authenticated;
grant update (enabled, send_time) on public.homework_missing_auto to authenticated;
grant all on public.homework_missing_auto to service_role;

-- 조교도 숙제 미제출 알림 화면을 쓴다 — 설정은 보고, 바꾸는 것은 강사 · 관리자 ("시간은 쌤들이 정할 수 있으며")
create policy "homework_missing_auto: 스태프·조교 조회" on public.homework_missing_auto
  for select to authenticated using ((select private.is_crew()));
create policy "homework_missing_auto: 스태프 수정" on public.homework_missing_auto
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

-- ─── 2. 실행 기록 — 하루 한 줄 ───────────────────────────────────────────────
create table if not exists public.homework_missing_auto_runs (
  run_date    date primary key,                  -- 한국 날짜 — 하루에 한 번만 돈다
  started_at  timestamptz not null default now(),
  window_from timestamptz,                       -- 이 실행이 본 기한의 시작 (그 뒤에 기한이 지난 숙제만 새로 지난 것)
  finished_at timestamptz,                       -- 비어 있으면 아직 도는 중이거나 멈췄다 (15분 뒤 다시 가져간다)
  sent        integer,                           -- 알림을 넣은 학생 수
  opted_out   integer,                           -- 새로 기한이 지난 숙제를 안 냈지만 '알림 안 받기' 라 뺀 학생 수
  tracks      text[] not null default '{}',      -- 이번에 새로 기한이 지난 숙제의 트랙 (mwf · ttf)
  error       text                               -- 멈춘 까닭 (다음 시도에서 지운다)
);

comment on table public.homework_missing_auto_runs is
  '숙제 미제출 자동 알림 실행 기록 — 하루 한 줄 (2026-10-19). 쓰기는 서버(service_role)만, 강사 · 관리자 · 조교가 본다';

alter table public.homework_missing_auto_runs enable row level security;

grant select on public.homework_missing_auto_runs to authenticated;
grant all on public.homework_missing_auto_runs to service_role;

create policy "homework_missing_auto_runs: 스태프·조교 조회" on public.homework_missing_auto_runs
  for select to authenticated using ((select private.is_crew()));

-- ─── 3. 그날 실행 가져가기 · 보낼 때가 됐나 ───────────────────────────────────
-- 오늘 정한 시각이 지났고 · 그 시각이 켜기/시각 바꾸기 뒤이고 · 오늘 실행이 끝나지 않았고 15분 안에 시작한 것도 없을 때 한 줄을 가져간다.
-- 설정 줄을 잠가서 두 호출이 겹쳐도 한 번만 가져간다. 우리 API(service_role)만 부른다.
create or replace function public.claim_homework_missing_auto()
returns table (claimed_day date, claimed_at timestamptz, claimed_from timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a        public.homework_missing_auto%rowtype;
  v_day    date := private.today_kst();
  v_at     timestamptz;
  v_from   timestamptz;
  r_day    date;
  r_at     timestamptz;
  r_from   timestamptz;
begin
  select * into a from public.homework_missing_auto where id for update;
  if not found or not a.enabled then
    return;
  end if;
  v_at := (v_day + a.send_time) at time zone 'Asia/Seoul';
  if v_at > now() or v_at <= a.schedule_changed_at then
    return;
  end if;
  v_from := coalesce(a.covered_until, v_day::timestamp at time zone 'Asia/Seoul');

  insert into public.homework_missing_auto_runs as r (run_date, started_at, window_from)
  values (v_day, now(), v_from)
  on conflict on constraint homework_missing_auto_runs_pkey do update
     set started_at = excluded.started_at, window_from = excluded.window_from, error = null
   where r.finished_at is null and r.started_at < now() - interval '15 minutes'
  returning r.run_date, r.started_at, r.window_from into r_day, r_at, r_from;

  if r_day is null then
    return;
  end if;
  claimed_day := r_day;
  claimed_at := r_at;
  claimed_from := r_from;
  return next;
end;
$$;

comment on function public.claim_homework_missing_auto() is
  '숙제 미제출 자동 알림 — 오늘 실행을 가져간다 (보낼 때가 됐고 오늘 아직 안 돌았을 때만, 멈춘 실행은 15분 뒤). service_role 전용 — /api/cron/homework-missing-auto';

revoke all on function public.claim_homework_missing_auto() from public, anon, authenticated;
grant execute on function public.claim_homework_missing_auto() to service_role;

create or replace function private.homework_missing_auto_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.homework_missing_auto a
     where a.enabled
       and (private.today_kst() + a.send_time) at time zone 'Asia/Seoul' <= now()
       and (private.today_kst() + a.send_time) at time zone 'Asia/Seoul' > a.schedule_changed_at
       and not exists (
         select 1
           from public.homework_missing_auto_runs r
          where r.run_date = private.today_kst()
            and (r.finished_at is not null or r.started_at > now() - interval '15 minutes')
       )
  )
$$;

revoke all on function private.homework_missing_auto_due() from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'homework-missing-auto' loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'homework-missing-auto',
  '*/5 * * * *',
  $$ select private.call_app('/api/cron/homework-missing-auto') where private.homework_missing_auto_due() $$
);

-- 우리 API 가 읽는 것 — 서버(service_role)도 부를 수 있게 적어 둔다 (Supabase 기본 권한에 기대지 않는다)
grant execute on function public.homework_due_dates(date[]) to service_role;

-- ─── 4. 자동 알림의 보낸 이름 — 안 낸 과목의 선생님 ────────────────────────────────
-- 보낸 사람이 없는(sender_id null — 자동) 미제출 알림도 강사가 아닌 사람이 보낸 알림과 같이 선생님 이름을 적는다 (20261008160000 에 갈래 하나)
create or replace function private.student_messages_homework_missing_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'homework_missing'
     and (new.sender_id is null
          or exists (select 1 from public.profiles p where p.id = new.sender_id and p.role <> 'instructor')) then
    new.sender_name := private.homework_missing_teacher(new.related);
  end if;
  return new;
end;
$$;

revoke all on function private.student_messages_homework_missing_sender() from public, anon, authenticated;

-- ─── 5. 보낸 시각 — 한 통에 레벨이 여럿이면 레벨마다 ─────────────────────────────────
-- related.levels(자동 알림 — 속성반 650 · 850 을 한 통에) 와 related.level(손으로 보낸 알림 — 레벨 탭 하나) 을 함께 본다
create or replace function private.homework_missing_levels(p_related jsonb)
returns setof integer
language sql
immutable
set search_path = ''
as $$
  select x::integer
    from jsonb_array_elements_text(case when jsonb_typeof(p_related -> 'levels') = 'array' then p_related -> 'levels' else '[]'::jsonb end) as t (x)
   where x ~ '^[0-9]{1,6}$'
  union
  select (p_related ->> 'level')::integer
   where p_related ->> 'level' ~ '^[0-9]{1,6}$'
$$;

revoke all on function private.homework_missing_levels(jsonb) from public, anon, authenticated;

comment on function private.homework_missing_levels(jsonb) is
  '숙제 미제출 알림이 다룬 레벨 — related.levels(자동 알림, 여러 레벨) ∪ related.level (2026-10-19). 앱의 noticeLevels 와 같은 규칙';

create or replace function public.homework_missing_notices(p_term_id bigint)
returns table (user_id uuid, level integer, sent_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_crew() then
    raise exception 'forbidden';
  end if;
  return query
  select m.user_id,
         l.level,
         max(m.created_at)
    from public.student_messages m
    left join lateral private.homework_missing_levels(m.related) as l (level) on true
   where m.kind = 'homework_missing'
     and private.homework_missing_term(m.related) = p_term_id
   group by 1, 2;
end;
$$;
