-- ============================================================================
-- 조교가 숙제를 점검해도 학생 알림에는 그 과목 선생님 이름으로 (2026-10-08 Alan — "지금 조교가 숙제검사했을때 조교가 했다고 알림이 가고 있어!
--   이러면 안되잖아 으휴. 조교가 했다고 알림가는거 빨리 없애줘")
--
--   * 숙제 점검완료 알림(kind homework_checked)은 학생 알림함에 "보낸 이름 + 선생님 · 시각" 으로 선다. 2026-10-03 조교가 점검을 맡으며
--     정책 "student_messages: 조교 발송" 이 보낸 이름을 조교 자기 이름으로 못박아, 학생에게 조교 이름이 "○○○ 선생님" 으로 갔다.
--   * 이제 **보낸 사람이 조교인 숙제 알림은 BEFORE INSERT 트리거가 보낸 이름을 그 숙제 과목의 선생님 이름으로 바꾼다**
--     (RC 이영수 · LC 이혜영 — profiles.subject, 숙제점검 과목 탭의 subject_instructors 와 같은 규칙). 선생님을 못 찾으면 빈 이름
--     (알림함은 이름이 비면 시각만 적는다). 앱 · 배포 중인 옛 앱 · API 직접 호출 어느 길로 넣어도 조교 이름이 남지 않는다.
--   * 보낸 사람(sender_id)은 그대로 조교다 — 누가 점검했는지는 기록에 남는다 (학생은 이 id 로 이름을 못 읽는다 — profile_names 는 crew 만).
--     관리자 숙제점검 화면의 "점검완료 · 이름" 도 homework_submissions.checked_by 그대로라 강사 · 관리자는 누가 했는지 본다.
--   * 정책 "student_messages: 조교 발송" — RLS 의 with check 는 BEFORE 트리거가 고친 행을 본다 (로컬 Postgres 16 에서 확인).
--     그대로 두면 바뀐 이름이 "자기 이름" 조건에 걸려 조교의 숙제 알림이 통째로 막힌다. 그래서 숙제 갈래는 이름 대신
--     **그 학생의 점검된 숙제를 가리키는 알림인지**를 본다 — 선생님 이름이 붙는 알림을 조교가 아무 학생에게나 보내지 못하게
--     (2026-10-03 에 막은 "강사 이름으로 보내는 길" 을 숙제 점검 한 가지로만 연다). 비대면 인증 독촉(study_checkin)은 예전대로 자기 이름.
--   * 이미 보낸 알림도 같은 규칙으로 고친다 (보낸 사람이 지금 조교 등급인 숙제 알림).
--   * 강사 · 관리자가 점검한 알림은 그대로 그 사람 이름이다.
-- ============================================================================

-- 숙제 알림의 related.submissionId → 그 숙제 id. 숫자가 아니면 null (형이 틀린 알림이 넣기 · 정책에서 오류로 터지지 않게)
create or replace function private.homework_notice_submission(p_related jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_related ->> 'submissionId' ~ '^[0-9]{1,18}$' then (p_related ->> 'submissionId')::bigint end;
$$;

-- 그 숙제 과목의 선생님 이름 (없으면 빈 이름). 과목 강사가 둘이면 이름 순 첫째 — subject_instructors 와 같은 줄 세우기
create or replace function private.homework_notice_teacher(p_related jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select i.name
      from public.homework_submissions s
      join public.profiles i on i.subject = s.subject and i.merged_into is null
     where s.id = private.homework_notice_submission(p_related)
     order by i.name
     limit 1
  ), '');
$$;

-- 조교 정책의 숙제 갈래 — 받는 학생의 숙제이고 점검이 끝난 것만 (점검완료 알림은 점검을 저장한 뒤에 넣는다 — checkHomework)
create or replace function private.homework_notice_ok(p_related jsonb, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.homework_submissions s
     where s.id = private.homework_notice_submission(p_related)
       and s.user_id = p_user_id
       and s.status = 'checked'
  );
$$;

-- 정책 식은 넣는 사람(authenticated)의 권한으로 함수를 부른다 — homework_notice_ok 만 열어 둔다 (private 스키마는 PostgREST 로 못 부른다)
revoke all on function private.homework_notice_submission(jsonb) from public, anon, authenticated;
revoke all on function private.homework_notice_teacher(jsonb) from public, anon, authenticated;
revoke all on function private.homework_notice_ok(jsonb, uuid) from public, anon;
grant execute on function private.homework_notice_ok(jsonb, uuid) to authenticated;

comment on function private.homework_notice_teacher(jsonb) is
  '숙제 점검완료 알림에 붙일 선생님 이름 — 그 숙제 과목의 강사(profiles.subject). 조교가 점검한 알림의 보낸 이름 (2026-10-08)';

-- 보낸 사람이 조교인 숙제 알림 → 보낸 이름을 그 과목 선생님으로
create or replace function private.student_messages_homework_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'homework_checked'
     and exists (select 1 from public.profiles p where p.id = new.sender_id and p.role = 'assistant') then
    new.sender_name := private.homework_notice_teacher(new.related);
  end if;
  return new;
end;
$$;

revoke all on function private.student_messages_homework_sender() from public, anon, authenticated;

drop trigger if exists student_messages_homework_sender on public.student_messages;
create trigger student_messages_homework_sender
  before insert on public.student_messages
  for each row execute function private.student_messages_homework_sender();

-- 조교가 보내는 학생 알림 — 비대면 인증 독촉은 자기 이름, 숙제 점검완료는 그 학생의 점검된 숙제 (이름은 위 트리거가 정한다)
drop policy "student_messages: 조교 발송" on public.student_messages;
create policy "student_messages: 조교 발송" on public.student_messages
  for insert to authenticated
  with check (
    (select private.is_assistant())
    and sender_id = (select auth.uid())
    and (
      (kind = 'study_checkin' and sender_name = (select private.my_profile_name()))
      or (kind = 'homework_checked' and private.homework_notice_ok(related, user_id))
    )
  );

-- 이미 보낸 알림 — 보낸 사람이 조교인 숙제 알림의 이름을 같은 규칙으로
update public.student_messages m
   set sender_name = private.homework_notice_teacher(m.related)
  from public.profiles p
 where m.kind = 'homework_checked'
   and p.id = m.sender_id
   and p.role = 'assistant'
   and m.sender_name is distinct from private.homework_notice_teacher(m.related);
