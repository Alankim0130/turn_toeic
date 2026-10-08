-- ============================================================================
-- 숙제 · 인증 알림의 보낸 이름 — 조교만이 아니라 **선생님(강사 등급)이 아닌 사람 전부** (2026-10-08 Alan — "조교가 숙제검사했다고 알리지 말아줘. !!!!!!")
--
--   * 같은 날 낮의 20261008120000(숙제 점검완료) · 20261008140000(비대면 인증 확인) · 20261008150000(숙제 미제출)은 보낸 사람의 등급이
--     **조교(assistant)일 때만** 이름을 바꿨다. 그런데 그날 숙제를 점검한 계정(윤혜원)은 **관리자 등급**이라 세 트리거 어디에도 안 걸려,
--     10/7 ~ 10/8 에 점검완료 알림 165건이 학생 알림함에 "윤혜원 선생님" 으로 갔다 — Alan 이 "조교가 했다고" 알림이 가는 것을 다시 봤다.
--   * 이제 **보낸 사람이 강사 등급(instructor — 과목이 있는 이혜영 · 이영수)이 아니면** 세 트리거가 똑같이 이름을 정한다:
--     숙제 점검완료 → 그 숙제 과목의 선생님(private.homework_notice_teacher) · 숙제 미제출 → 안 낸 과목의 선생님(private.homework_missing_teacher) ·
--     비대면 인증 확인 → 빈 이름(시각만). 조교든 관리자든(수업을 맡지 않는 계정 — 알런 포함) 학생에게는 그 과목 선생님만 보인다.
--     강사가 직접 점검한 알림은 그대로 그 강사 이름이다.
--   * 정책은 손대지 않는다 — 관리자는 "student_messages: 스태프 발송"(is_staff + sender_id = 본인) 으로 넣고 그 정책은 이름을 보지 않는다.
--     조교 갈래(20261008150000)도 그대로다.
--   * 이미 보낸 알림도 같은 규칙으로 고친다 (보낸 사람이 지금 강사 등급이 아닌 숙제 점검완료 · 미제출 · 인증 확인 알림).
--     sender_id 는 그대로라 누가 점검했는지는 기록과 관리자 화면(checked_by)에 남는다.
-- ============================================================================

-- 숙제 점검완료 — 선생님이 아닌 사람이 보내면 그 숙제 과목의 선생님 이름으로
create or replace function private.student_messages_homework_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'homework_checked'
     and exists (select 1 from public.profiles p where p.id = new.sender_id and p.role <> 'instructor') then
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

-- 숙제 미제출 — 선생님이 아닌 사람이 보내면 안 낸 과목의 선생님 이름으로
create or replace function private.student_messages_homework_missing_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'homework_missing'
     and exists (select 1 from public.profiles p where p.id = new.sender_id and p.role <> 'instructor') then
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

-- 비대면 인증 확인 — 선생님이 아닌 사람이 보내면 이름 없이 (비대면 스터디는 과목이 없어 선생님을 정할 수 없다)
create or replace function private.student_messages_study_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'study_checked'
     and exists (select 1 from public.profiles p where p.id = new.sender_id and p.role <> 'instructor') then
    new.sender_name := '';
  end if;
  return new;
end;
$$;

revoke all on function private.student_messages_study_sender() from public, anon, authenticated;

drop trigger if exists student_messages_study_sender on public.student_messages;
create trigger student_messages_study_sender
  before insert on public.student_messages
  for each row execute function private.student_messages_study_sender();

-- 이미 보낸 알림 — 보낸 사람이 강사 등급이 아닌 것을 같은 규칙으로
update public.student_messages m
   set sender_name = private.homework_notice_teacher(m.related)
  from public.profiles p
 where m.kind = 'homework_checked'
   and p.id = m.sender_id
   and p.role <> 'instructor'
   and m.sender_name is distinct from private.homework_notice_teacher(m.related);

update public.student_messages m
   set sender_name = private.homework_missing_teacher(m.related)
  from public.profiles p
 where m.kind = 'homework_missing'
   and p.id = m.sender_id
   and p.role <> 'instructor'
   and m.sender_name is distinct from private.homework_missing_teacher(m.related);

update public.student_messages m
   set sender_name = ''
  from public.profiles p
 where m.kind = 'study_checked'
   and p.id = m.sender_id
   and p.role <> 'instructor'
   and m.sender_name <> '';
