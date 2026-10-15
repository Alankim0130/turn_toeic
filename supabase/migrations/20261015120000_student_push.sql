-- ============================================================================
-- 학생 휴대폰 푸시 — 숙제 미제출 안내 · 불라방 시작 (2026-10-15 Alan)
--
--   Alan: "숙제 미제출이랑 불라방 시작 알림 푸시로 만들어줘. 단 불라방은 불라방 학생들에게만 보내줘야해.
--          그리고 본인이 신청한 시간대의 학생에게만 보내주면 될 것 같아."
--
--   두 알림은 지금도 학생 알림함(student_messages)에 들어간다 — 숙제 미제출은 강사 · 조교가 화면에서 보내고(kind homework_missing),
--   불라방 시작은 DB 가 보낸다(kind live_start, private.notify_live_session — 그 시간 단위 반을 듣는 불라방 학생에게만, 교시마다 한 번).
--   **받는 사람은 그대로다.** 여기서는 알림함에 들어간 그 줄을 학생이 '알림 받기' 를 켜 둔 휴대폰으로도 보낸다.
--
--   웹 푸시는 VAPID 서명이 필요해 DB 가 직접 못 보낸다 → 우리 API(/api/cron/student-push)가 보낸다:
--     1. student_messages 에 두 종류가 들어가면 문장 트리거가 우리 API 를 한 번 부른다 (private.call_app — 커밋 뒤에 나간다)
--     2. API 는 public.claim_student_pushes() 로 아직 안 보낸 줄을 **가져가며 표시**하고(동시에 불려도 한 번만) 학생 기기로 보낸다
--     3. 1 의 호출이 실패했으면(사이트 배포 중 · 응답 없음) pg_cron `student-push-retry` 가 1분마다 남은 줄이 있는지 보고 다시 부른다
--   **15분이 지난 알림은 보내지 않는다** — "지금 시작" 이 거짓말이 된다 (수업 시작 알림 크론과 같은 규칙).
--   학생이 '숙제 미제출 알림 안 받기' 를 눌렀으면 알림함 줄 자체가 안 생기므로(트리거 student_messages_homework_missing_optout) 휴대폰으로도 안 간다.
-- ============================================================================

-- ─── 1. 휴대폰으로 보낼 차례가 지난 줄 ──────────────────────────────────────
alter table public.student_messages add column if not exists pushed_at timestamptz;

comment on column public.student_messages.pushed_at is
  '휴대폰 푸시를 처리한 시각 (2026-10-15 — 숙제 미제출 · 불라방 시작만). 알림을 켠 기기가 없어 안 보낸 줄도 찍힌다. 비어 있는 옛 줄은 15분이 지나 보내지 않는다';

create index if not exists student_messages_push_pending_idx
  on public.student_messages (created_at)
  where pushed_at is null and kind in ('live_start', 'homework_missing');

-- ─── 2. 보낼 줄 가져가기 — 우리 API 만 (service_role) ────────────────────────
-- 가져가는 순간 pushed_at 을 찍는다. 두 호출이 겹쳐도 skip locked 라 한 줄은 한 번만 나간다
create or replace function public.claim_student_pushes(p_limit int default 500)
returns table (id bigint, user_id uuid, kind text, title text, body text, related jsonb)
language sql
volatile
security definer
set search_path = ''
as $$
  with picked as (
    select m.id
      from public.student_messages m
     where m.pushed_at is null
       and m.kind in ('live_start', 'homework_missing')
       and m.created_at > now() - interval '15 minutes'
     order by m.created_at
     limit greatest(1, least(coalesce(p_limit, 500), 1000))
     for update skip locked
  )
  update public.student_messages m
     set pushed_at = now()
    from picked
   where m.id = picked.id
  returning m.id, m.user_id, m.kind, m.title, m.body, m.related
$$;

comment on function public.claim_student_pushes(int) is
  '휴대폰으로 보낼 학생 알림(숙제 미제출 · 불라방 시작, 15분 안)을 가져가며 표시한다. service_role 전용 — /api/cron/student-push';

revoke all on function public.claim_student_pushes(int) from public, anon, authenticated;
grant execute on function public.claim_student_pushes(int) to service_role;

-- ─── 3. 들어오는 순간 부르기 ────────────────────────────────────────────────
-- 문장마다 한 번 (숙제 미제출 50명을 한 번에 넣어도 한 번). 알림을 켠 기기가 하나도 없으면 부르지 않는다.
-- **부르다 실패해도 알림함 줄은 그대로 들어간다** — 휴대폰 알림 때문에 알림 자체가 막히면 안 된다
create or replace function private.tg_student_messages_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
      from new_rows n
      join public.push_subscriptions p on p.user_id = n.user_id
     where n.kind in ('live_start', 'homework_missing')
       and n.pushed_at is null
       and n.created_at > now() - interval '15 minutes'
  ) then
    begin
      perform private.call_app('/api/cron/student-push');
    exception when others then
      raise warning 'student push: 우리 API 를 부르지 못했어요 (%)', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

revoke all on function private.tg_student_messages_push() from public, anon, authenticated;

drop trigger if exists student_messages_push on public.student_messages;
create trigger student_messages_push
  after insert on public.student_messages
  referencing new table as new_rows
  for each statement execute function private.tg_student_messages_push();

-- ─── 4. 놓친 것 다시 부르기 (1분마다 — 남은 줄이 있을 때만 실제로 부른다) ────
-- 1분이 지나도 안 나간 줄 = 들어올 때 부른 것이 실패했다. 기기가 없는 학생의 줄은 세지 않는다
create or replace function private.student_push_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.student_messages m
      join public.push_subscriptions p on p.user_id = m.user_id
     where m.pushed_at is null
       and m.kind in ('live_start', 'homework_missing')
       and m.created_at > now() - interval '15 minutes'
       and m.created_at < now() - interval '1 minute'
  )
$$;

revoke all on function private.student_push_due() from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'student-push-retry' loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'student-push-retry',
  '* * * * *',
  $$ select private.call_app('/api/cron/student-push') where private.student_push_due() $$
);

-- ─── 5. 불라방 시작 알림에 과목(RC · LC)을 적는다 ──────────────────────────
-- 120분 학생은 교시마다(RC 한 번 · LC 한 번) 받는다 — 휴대폰 알림만 보고도 어느 교시인지 알게.
-- 받는 사람 · 한 번만 보내는 규칙은 20260922113000 그대로다 (본문 한 줄만 바뀐다)
CREATE OR REPLACE FUNCTION private.notify_live_session(p_section_id bigint, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r   record;
  v_n int;
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
         left(concat_ws(' · ', r.time_block, upper(r.subject), r.seq || '회차') || ' 방송이 시작됐어요. 불라방에서 바로 입장해 주세요.', 1000),
         'live_start',
         jsonb_build_object('sectionId', p_section_id, 'date', p_date)
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
   where section_id = p_section_id and class_date = p_date;

  return v_n;
end;
$function$;

-- ─── 6. 기기 표 설명 ───────────────────────────────────────────────────────
comment on table public.push_subscriptions is
  '기기별 웹 푸시 구독 — 스태프(관리자 알림) · 학생(숙제 미제출 · 불라방 시작, 2026-10-15). 쓰기는 서버만, 조회는 본인만. 발송 실패(404/410) 시 서버가 지운다';
