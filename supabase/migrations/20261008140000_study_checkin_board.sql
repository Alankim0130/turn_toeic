-- ============================================================================
-- 비대면스터디 인증 게시판 (2026-10-08 Alan — "비대면 스터디도 숙제 점검 처럼 게시판이 필요합니당~ "비대면스터디 인증" 카테고리 하나 만들어줘.
--   별도의 페이지가 있으면 좋겠어")
--
--   * 지금까지 강사 · 조교 화면(스터디 신청자의 인증 현황)에는 **인증했는지 · 사진 몇 장인지만** 보였고 학생이 올린 사진과 메모를 볼 길이 없었다.
--     새 화면 /admin/study-checkins 가 숙제점검처럼 인증 한 건을 한 줄로 늘어놓고, 누르면 사진을 넘겨 보며 확인 완료 + 코멘트를 한다.
--   * **숙제(homework_submissions)와는 여전히 완전히 다른 표 · 화면 · 알림 종류다** (2026-09-19 Alan "철저하게 분리") — 모양만 같다.
--
--   1. study_checkins 에 확인 칸 넷 — status(submitted 확인 전 · checked 확인 완료) · checked_by · checked_at · feedback(코멘트 1,000자).
--      고치는 것은 스태프 · 조교(is_crew)이고 칸 단위 grant 라 그 넷만 바뀐다. 스터디는 조교가 운영한다 (2026-10-03 Alan).
--   2. 확인이 끝난 인증은 학생이 지우지 못한다 (숙제와 같은 규칙 — 확인 · 코멘트가 사라지지 않게). 사진 줄도 같다.
--   3. 학생 알림 종류 study_checked(인증 확인 완료)를 더한다. 조교는 **받는 학생의, 확인이 끝난 인증을 가리키는 알림만** 넣는다
--      (private.study_checkin_notice_ok — 숙제 점검 알림의 homework_notice_ok 와 같은 꼴).
--   4. 조교가 보낸 study_checked 알림에는 **조교 이름이 남지 않는다** (2026-10-08 Alan 숙제 알림 — "조교가 했다고 알림가는거 빨리 없애줘").
--      비대면 스터디는 과목이 없어 선생님 이름을 정할 수 없으므로 이름을 비운다 — 알림함은 이름이 비면 시각만 적는다.
--      보낸 사람(sender_id)은 그대로 남아 누가 확인했는지는 기록에 있다.
--   5. 인증 사진(저장소 study-checkins)을 조교도 본다 — 행(study_checkin_files)은 2026-10-03 부터 조교에게 열려 있었는데 저장소 조회는 스태프만이라
--      조교 세션으로는 서명 주소가 안 나왔다.
-- ============================================================================

-- ─── 1. 확인 칸 ─────────────────────────────────────────────────────────────
alter table public.study_checkins
  add column if not exists status text not null default 'submitted',
  add column if not exists checked_by uuid references public.profiles (id) on delete set null,
  add column if not exists checked_at timestamptz,
  add column if not exists feedback text;

alter table public.study_checkins drop constraint if exists study_checkins_status_check;
alter table public.study_checkins
  add constraint study_checkins_status_check check (status in ('submitted', 'checked'));
alter table public.study_checkins drop constraint if exists study_checkins_feedback_check;
alter table public.study_checkins
  add constraint study_checkins_feedback_check check (feedback is null or char_length(feedback) <= 1000);

comment on column public.study_checkins.status is '확인 상태 — submitted(확인 전) · checked(강사 · 조교가 확인 완료). 2026-10-08 비대면스터디 인증 게시판';
comment on column public.study_checkins.feedback is '확인하며 남긴 코멘트 (1,000자). 같은 글이 학생 알림함(study_checked)으로도 간다';

drop policy if exists "study_checkins: 스태프·조교 확인" on public.study_checkins;
create policy "study_checkins: 스태프·조교 확인" on public.study_checkins
  for update to authenticated
  using ((select private.is_crew()))
  with check ((select private.is_crew()));

grant update (status, checked_by, checked_at, feedback) on public.study_checkins to authenticated;

-- ─── 2. 확인이 끝난 인증은 학생이 지우지 못한다 ─────────────────────────────────────
drop policy "study_checkins: 본인 삭제" on public.study_checkins;
create policy "study_checkins: 본인 삭제" on public.study_checkins
  for delete to authenticated
  using ((select auth.uid()) = user_id and status = 'submitted');

drop policy "study_checkin_files: 본인 삭제" on public.study_checkin_files;
create policy "study_checkin_files: 본인 삭제" on public.study_checkin_files
  for delete to authenticated
  using (
    exists (
      select 1 from public.study_checkins c
       where c.id = study_checkin_files.checkin_id
         and c.user_id = (select auth.uid())
         and c.status = 'submitted'
    )
  );

-- ─── 3. 알림 종류 study_checked ────────────────────────────────────────────────
alter table public.student_messages drop constraint if exists student_messages_kind_check;
alter table public.student_messages
  add constraint student_messages_kind_check
  check (kind in ('general', 'study_checkin', 'homework_checked', 'live_start', 'contact_reply', 'attendance', 'merge_choice', 'textbook', 'study_checked'));

-- 인증 확인 알림의 related.checkinId → 그 인증 id. 숫자가 아니면 null (형이 틀린 알림이 정책에서 오류로 터지지 않게)
create or replace function private.study_checkin_notice_id(p_related jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_related ->> 'checkinId' ~ '^[0-9]{1,18}$' then (p_related ->> 'checkinId')::bigint end;
$$;

-- 조교 정책의 인증 확인 갈래 — 받는 학생의 인증이고 확인이 끝난 것만 (확인 알림은 확인을 저장한 뒤에 넣는다 — checkStudyCheckin)
create or replace function private.study_checkin_notice_ok(p_related jsonb, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.study_checkins c
     where c.id = private.study_checkin_notice_id(p_related)
       and c.user_id = p_user_id
       and c.status = 'checked'
  );
$$;

revoke all on function private.study_checkin_notice_id(jsonb) from public, anon, authenticated;
revoke all on function private.study_checkin_notice_ok(jsonb, uuid) from public, anon;
grant execute on function private.study_checkin_notice_ok(jsonb, uuid) to authenticated;

-- 조교가 보내는 학생 알림 — 비대면 인증 독촉은 자기 이름, 숙제 점검완료는 그 학생의 점검된 숙제,
-- 비대면 인증 확인은 그 학생의 확인된 인증 (두 확인 알림의 이름은 트리거가 정한다)
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
    )
  );

-- ─── 4. 조교가 보낸 인증 확인 알림은 이름 없이 ──────────────────────────────────────
create or replace function private.student_messages_study_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'study_checked'
     and exists (select 1 from public.profiles p where p.id = new.sender_id and p.role = 'assistant') then
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

-- ─── 5. 인증 사진 — 조교도 본다 ─────────────────────────────────────────────────
drop policy "study-checkins: 본인·스태프 조회" on storage.objects;
create policy "study-checkins: 본인·스태프·조교 조회" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'study-checkins'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_crew()))
  );
