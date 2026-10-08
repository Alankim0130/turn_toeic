-- ============================================================================
-- 숙제 미제출 알림 (2026-10-08 Alan — "숙제제출 리스트를 볼 수 있으면 좋겠어. 안한사람은 일괄선택해서 알림메시지도 보낼 수 있으면 좋겠어.
--   여기서 레벨별로도 선택할 수 있으면 좋겠어" → 첫토익 "숙제 미제출 알림" 화면을 보여 주며 "이렇게 표시해주면 좋겠어.
--   날짜는 강사가 설정한 수업일수를 매달 참고하면 좋겠어" · 숙제는 "수업마다 꼭 있다" · 알림은 "조교도 보낸다")
--
--   새 화면 /admin/homework/missing 이 그 달 수업일 × RC · LC 격자로 누가 냈는지 보여 주고, 안 낸 학생을 골라 한 번에 알림을 보낸다.
--   격자는 앱이 반 · 회차 · 제출에서 계산한다 (src/lib/homework-missing.ts) — 표를 새로 만들지 않는다. 여기서 하는 것은 알림 쪽뿐이다:
--
--   1. 학생 알림 종류 homework_missing(숙제 미제출 안내)을 더한다.
--   2. 조교도 보낸다 — 정책 "student_messages: 조교 발송" 에 갈래 하나. **받는 학생이 그 기수(related.termId) 반에 배정된 학생일 때만**
--      (선생님 이름이 붙는 알림을 조교가 아무 회원에게나 보내지 못하게 — 숙제 점검완료 · 인증 확인 갈래와 같은 꼴).
--   3. 조교가 보낸 미제출 알림에는 **조교 이름이 남지 않는다** (2026-10-08 Alan 숙제 알림 — "조교가 했다고 알림가는거 빨리 없애줘").
--      BEFORE INSERT 트리거가 보낸 이름을 **안 낸 과목(related.subjects)의 선생님 이름**으로 바꾼다 — RC 만이면 이영수, LC 만이면 이혜영,
--      둘 다면 "이영수 · 이혜영" (알림함은 "○○○ 선생님 · 시각" 으로 그린다). 선생님을 못 찾으면 빈 이름(시각만).
--      보낸 사람(sender_id)은 그대로 조교다 — 누가 보냈는지는 기록에 남는다. 강사 · 관리자가 보낸 알림은 그 사람 이름 그대로다.
--      정책의 미제출 갈래는 이름을 보지 않는다 — RLS 의 with check 는 BEFORE 트리거가 고친 행을 본다 (20261008120000 머리말).
--   4. 그 기수에 미제출 알림을 언제 보냈는지 — 강사 · 조교 화면이 "알림 10/8" 을 적고, 오늘 이미 받은 학생은 '미제출 전체선택' 에서 뺀다.
--      학생 알림함 조회는 본인 · 강사 · 관리자뿐이라(조교는 못 읽는다) 시각만 주는 함수로 연다 (내용은 주지 않는다).
-- ============================================================================

-- ─── 1. 알림 종류 homework_missing ─────────────────────────────────────────────
alter table public.student_messages drop constraint if exists student_messages_kind_check;
alter table public.student_messages
  add constraint student_messages_kind_check
  check (kind in ('general', 'study_checkin', 'homework_checked', 'live_start', 'contact_reply', 'attendance', 'merge_choice', 'textbook', 'study_checked', 'homework_missing'));

-- 미제출 알림의 related.termId → 기수 id. 숫자가 아니면 null (형이 틀린 알림이 넣기 · 정책에서 오류로 터지지 않게)
create or replace function private.homework_missing_term(p_related jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_related ->> 'termId' ~ '^[0-9]{1,18}$' then (p_related ->> 'termId')::bigint end;
$$;

-- ─── 2. 조교 정책의 미제출 갈래 — 받는 학생이 그 기수 반에 배정된 학생일 때만 ──────────────────────
create or replace function private.homework_missing_notice_ok(p_related jsonb, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.enrollments e
      join public.class_sections s on s.id = e.section_id
     where e.student_id = p_user_id
       and s.term_id = private.homework_missing_term(p_related)
  );
$$;

-- ─── 3. 안 낸 과목의 선생님 이름 — RC 먼저, 과목마다 강사 한 명(이름 순 첫째 — subject_instructors 와 같은 줄 세우기) ──────
create or replace function private.homework_missing_teacher(p_related jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select string_agg(n.name, ' · ' order by n.ord)
      from (
        select t.name, min(t.ord) as ord
          from (
            select distinct on (s.subject) s.ord, i.name
              from (values ('rc', 1), ('lc', 2)) as s (subject, ord)
              join public.profiles i on i.subject = s.subject and i.merged_into is null
             where jsonb_typeof(p_related -> 'subjects') = 'array'
               and (p_related -> 'subjects') ? s.subject
             order by s.subject, i.name
          ) t
         group by t.name
      ) n
  ), '');
$$;

-- 정책 식은 넣는 사람(authenticated)의 권한으로 함수를 부른다 — notice_ok 만 열어 둔다 (private 스키마는 PostgREST 로 못 부른다)
revoke all on function private.homework_missing_term(jsonb) from public, anon, authenticated;
revoke all on function private.homework_missing_teacher(jsonb) from public, anon, authenticated;
revoke all on function private.homework_missing_notice_ok(jsonb, uuid) from public, anon;
grant execute on function private.homework_missing_notice_ok(jsonb, uuid) to authenticated;

comment on function private.homework_missing_teacher(jsonb) is
  '숙제 미제출 알림에 붙일 선생님 이름 — 안 낸 과목(related.subjects)의 강사(profiles.subject), RC 먼저 " · " 로 잇는다. 조교가 보낸 알림의 보낸 이름 (2026-10-08)';

-- 보낸 사람이 조교인 미제출 알림 → 보낸 이름을 안 낸 과목의 선생님으로
create or replace function private.student_messages_homework_missing_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'homework_missing'
     and exists (select 1 from public.profiles p where p.id = new.sender_id and p.role = 'assistant') then
    new.sender_name := private.homework_missing_teacher(new.related);
  end if;
  return new;
end;
$$;

revoke all on function private.student_messages_homework_missing_sender() from public, anon, authenticated;

drop trigger if exists student_messages_homework_missing_sender on public.student_messages;
create trigger student_messages_homework_missing_sender
  before insert on public.student_messages
  for each row execute function private.student_messages_homework_missing_sender();

-- 조교가 보내는 학생 알림 — 비대면 인증 독촉은 자기 이름, 숙제 점검완료는 그 학생의 점검된 숙제,
-- 비대면 인증 확인은 그 학생의 확인된 인증, 숙제 미제출은 그 기수 반에 배정된 학생 (뒤의 셋은 트리거가 이름을 정한다)
drop policy "student_messages: 조교 발송" on public.student_messages;
create policy "student_messages: 조교 발송" on public.student_messages
  for insert to authenticated
  with check (
    (select private.is_assistant())
    and sender_id = (select auth.uid())
    and (
      (kind = 'study_checkin' and sender_name = (select private.my_profile_name()))
      or (kind = 'homework_checked' and private.homework_notice_ok(related, user_id))
      or (kind = 'study_checked' and private.study_checkin_notice_ok(related, user_id))
      or (kind = 'homework_missing' and private.homework_missing_notice_ok(related, user_id))
    )
  );

-- ─── 4. 그 기수에 미제출 알림을 보낸 시각 (강사 · 관리자 · 조교) — 학생 · 레벨마다 마지막 시각만 ─────────────
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
         case when m.related ->> 'level' ~ '^[0-9]{1,6}$' then (m.related ->> 'level')::integer end,
         max(m.created_at)
    from public.student_messages m
   where m.kind = 'homework_missing'
     and private.homework_missing_term(m.related) = p_term_id
   group by 1, 2;
end;
$$;

comment on function public.homework_missing_notices(bigint) is
  '숙제 미제출 알림을 보낸 시각 (강사·관리자·조교) — 그 기수 · 학생 · 레벨마다 마지막 시각만. 내용은 주지 않는다 (2026-10-08)';

revoke all on function public.homework_missing_notices(bigint) from public, anon;
grant execute on function public.homework_missing_notices(bigint) to authenticated;
