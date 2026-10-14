-- ============================================================================
-- 숙제 제출 기한 · 숙제 미제출 알림 신청 (2026-10-14 Alan)
--   "숙제 미제출 알림에 대해서 조건을 쫌 달아야할 것 같아 … 월수금 학생들 입장에서 월요일 숙제는 수요일까지 제출하면 돼 … 항상 다음수업 시간까지
--    제출기간이 되는거야. 화목금반도 항상 다음시간까지. 근데 주5반은 월수금과 화목반을 합친거니 월수금숙제 원리와 화목금 숙제원리를 그대로 따라가면 돼.
--    그리고 시간은 오후 5시야" · "숙제검사알림을 받고 싶은 사람은 숙제제출하는 곳 페이지에서 신청하기 버튼을 누르면 좋겠어. 그럼 안 누른사람에게는
--    알림보내기 명단에서 빠지고 누른사람은 추가되어서 진행되면 좋겠어"
--
--   1. public.homework_due_dates(dates) — 수업일마다 숙제 기한 날짜 = **같은 트랙의 다음 수업일** (반 편성 달력 term_class_dates, 기수를 넘어서도 —
--      그 달 마지막 수업의 숙제는 다음 달 첫 같은 트랙 수업일). 다음 수업일이 아직 달력에 없으면 null — 앱은 기한을 모르는 것으로 보고 미제출로 세지 않는다.
--      시각(오후 5시)은 앱이 붙인다 (src/lib/homework-missing.ts 의 HOMEWORK_DUE_TIME). 달력 표는 강사 · 관리자만 읽어서(조교 · 학생은 못 읽는다)
--      날짜만 돌려주는 함수로 연다 — 학생 숙제제출 화면이 기한을 보여 주고, 조교도 쓰는 미제출 알림 화면이 같은 기한으로 센다.
--   2. public.homework_missing_optins — 숙제 미제출 알림을 받겠다고 신청한 학생 (한 사람에 한 줄). 본인이 넣고 지운다, 본인 · 강사 · 관리자 · 조교가 본다.
--   3. **신청하지 않은 학생에게는 미제출 알림(homework_missing)이 들어가지 않는다** — BEFORE INSERT 트리거가 그 줄만 건너뛴다 (보내는 사람이 누구든,
--      화면을 거치지 않고 API 로 넣어도). 앱의 서버 액션은 보내기 직전에 신청을 다시 읽어 거르므로 평소에는 건너뛸 줄이 없다
--      (그 사이 학생이 신청을 취소한 경우만). 이름이 student_messages_homework_missing_optin 이라 같은 BEFORE 트리거 중 먼저 돈다 (이름 순).
--   4. 계정을 합치면 신청도 남길 계정으로 (private.merge_accounts — 20261002110000 의 마지막 정의에 한 덩어리를 더했다).
-- ============================================================================

-- ─── 1. 숙제 기한 날짜 — 같은 트랙의 다음 수업일 ─────────────────────────────────────
-- 한 날짜는 한 기수 · 한 트랙에만 속한다(save_term_schedule 이 막는다). 그래도 겹쳐 있으면 날짜마다 한 줄 — 더 이른 기한.
-- 한 번에 400 날짜까지 (화면은 한 기수 40 남짓 · 학생은 내 수업일만 보낸다 — 아무 크기나 받지 않는다)
create or replace function public.homework_due_dates(p_dates date[])
returns table (class_date date, due_date date)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (d.date)
         d.date,
         (select min(n.date) from public.term_class_dates n where n.track = d.track and n.date > d.date)
    from public.term_class_dates d
   where d.date = any (p_dates[1:400])
   order by d.date, 2 nulls last;
$$;

comment on function public.homework_due_dates(date[]) is
  '수업일마다 숙제 기한 날짜 = 같은 트랙의 다음 수업일(반 편성 달력, 기수를 넘어서도). 시각(오후 5시)은 앱이 붙인다. 다음 수업일이 없으면 null (2026-10-14)';

revoke all on function public.homework_due_dates(date[]) from public, anon;
grant execute on function public.homework_due_dates(date[]) to authenticated;

-- ─── 2. 숙제 미제출 알림 신청 ───────────────────────────────────────────────
create table public.homework_missing_optins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.homework_missing_optins is
  '숙제 미제출 알림을 받겠다고 신청한 학생 (숙제제출 화면의 신청하기). 없으면 미제출 알림 명단에서 빠지고 알림이 들어가지 않는다 (2026-10-14 Alan)';

alter table public.homework_missing_optins enable row level security;

grant all on public.homework_missing_optins to service_role;
grant select, delete on public.homework_missing_optins to authenticated;
-- 넣을 때는 user_id 칸만 — 신청 시각은 DB 가 적는다
grant insert (user_id) on public.homework_missing_optins to authenticated;

-- 조회는 스태프(조교) 확인을 맨 앞에 (CLAUDE.md 보안 점검 — 조회 정책의 순서)
create policy "homework_missing_optins: 본인·스태프·조교 조회" on public.homework_missing_optins
  for select to authenticated
  using ((select private.is_crew()) or user_id = (select auth.uid()));
create policy "homework_missing_optins: 본인 신청" on public.homework_missing_optins
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "homework_missing_optins: 본인 취소" on public.homework_missing_optins
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─── 3. 신청하지 않은 학생에게는 미제출 알림이 들어가지 않는다 ─────────────────────────────
create or replace function private.student_messages_homework_missing_optin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'homework_missing'
     and not exists (select 1 from public.homework_missing_optins o where o.user_id = new.user_id) then
    return null; -- 그 줄만 건너뛴다 (같이 넣은 다른 학생의 알림은 그대로 들어간다)
  end if;
  return new;
end;
$$;

revoke all on function private.student_messages_homework_missing_optin() from public, anon, authenticated;

drop trigger if exists student_messages_homework_missing_optin on public.student_messages;
create trigger student_messages_homework_missing_optin
  before insert on public.student_messages
  for each row execute function private.student_messages_homework_missing_optin();

-- ─── 4. 계정 합치기 — 신청도 남길 계정으로 (20261002110000 의 정의 + 신청 한 덩어리) ─────────────────
create or replace function private.merge_accounts(p_from uuid, p_to uuid, p_staff boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  n int;
  v_from public.profiles%rowtype;
  v_to   public.profiles%rowtype;
begin
  if p_from = p_to then
    raise exception 'same_account' using errcode = '22023';
  end if;

  select * into v_from from public.profiles where id = p_from;
  select * into v_to   from public.profiles where id = p_to;
  if v_from.id is null or v_to.id is null or v_from.merged_into is not null or v_to.merged_into is not null then
    raise exception 'not_mergeable' using errcode = '22023';
  end if;

  -- 스태프 계정은 스태프가 직접 합칠 때(p_staff)만, 그리고 두 계정의 등급이 같을 때만
  if v_from.role in ('instructor', 'admin') or v_to.role in ('instructor', 'admin') then
    if not p_staff then
      raise exception 'not_mergeable' using errcode = '22023';
    end if;
    if v_from.role <> v_to.role then
      raise exception 'role_mismatch' using errcode = '22023';
    end if;
  end if;

  -- ── 옛 계정부터 표시한다 (순서가 중요하다) ──
  -- 담당 과목을 남길 계정에 넣으면 profiles 트리거(tg_profiles_sync_instructors)가 열린 기수의 담당 강사를 다시 맞춘다.
  -- 그때 옛 계정이 아직 과목을 쥐고 있으면 먼저 가입한 옛 계정이 뽑혀 담당 반이 도로 옛 계정으로 간다.
  -- 그래서 옛 계정의 merged_into 를 찍고 과목을 비운 **다음에** 남길 계정의 과목을 채운다.
  update public.profiles
     set merged_into = p_to,
         subject     = null
   where id = p_from;
  if v_to.subject is null and v_from.subject is not null then
    update public.profiles set subject = v_from.subject where id = p_to;
    v := v || jsonb_build_object('subject', v_from.subject);
  end if;

  -- ── 학생 기록 (20260921130500 과 같다) ──
  delete from public.enrollments e
   where e.student_id = p_from
     and exists (select 1 from public.enrollments t where t.student_id = p_to and t.section_id = e.section_id);
  update public.enrollments set student_id = p_to where student_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('enrollments', n);

  update public.enrollment_orders set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('enrollment_orders', n);

  update public.enrollment_verifications set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('verifications', n);

  update public.homework_submissions set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('homework', n);

  delete from public.study_signups s
   where s.user_id = p_from
     and exists (select 1 from public.study_signups t where t.user_id = p_to and t.study_id = s.study_id);
  update public.study_signups set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('study_signups', n);

  -- 비대면 스터디 인증: 남길 계정에 같은 자료 인증이 있으면 지우고, 없으면 옮긴다
  delete from public.study_checkins c
   where c.user_id = p_from
     and exists (select 1 from public.study_checkins t where t.user_id = p_to and t.material_id = c.material_id);
  update public.study_checkins set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('study_checkins', n);

  delete from public.lecture_signups l
   where l.user_id = p_from
     and exists (select 1 from public.lecture_signups t where t.user_id = p_to and t.lecture_id = l.lecture_id);
  update public.lecture_signups set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('lecture_signups', n);

  -- 교재주문: 같은 달 주문이 둘이면 옮겨 오는 쪽의 달을 비운다 (입금·발송 기록은 그대로 남는다)
  update public.textbook_orders f
     set term_id = null
   where f.user_id = p_from
     and f.term_id is not null
     and f.status <> 'cancelled'
     and exists (select 1 from public.textbook_orders t where t.user_id = p_to and t.term_id = f.term_id and t.status <> 'cancelled');
  update public.textbook_orders set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('textbook_orders', n);

  update public.contact_messages set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('contacts', n);

  -- 알림함도 따라간다
  update public.student_messages set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('messages', n);

  -- 출석: 남길 계정에 같은 반·같은 날 도장이 있으면 그것을 남기고, 없으면 옮긴다. 기록은 전부 옮긴다
  delete from public.attendance_stamps a
   where a.student_id = p_from
     and exists (select 1 from public.attendance_stamps t where t.student_id = p_to and t.section_id = a.section_id and t.class_date = a.class_date);
  update public.attendance_stamps set student_id = p_to where student_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('attendance', n);
  update public.attendance_events set student_id = p_to where student_id = p_from;

  -- ── 강사 쪽 참조 (2026-10-02). 누가 했는지의 기록은 같은 사람이므로 남길 계정으로 ──
  update public.class_sections set instructor_id = p_to where instructor_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('sections', n);

  update public.homework_submissions   set checked_by  = p_to where checked_by  = p_from;
  update public.contact_messages       set replied_by  = p_to where replied_by  = p_from;
  update public.student_messages       set sender_id   = p_to where sender_id   = p_from;
  update public.attendance_stamps      set decided_by  = p_to where decided_by  = p_from;
  update public.attendance_events      set actor_id    = p_to where actor_id    = p_from;
  update public.lc_audio_tracks        set uploaded_by = p_to where uploaded_by = p_from;
  update public.lc_books               set updated_by  = p_to where updated_by  = p_from;
  update public.study_materials        set uploaded_by = p_to where uploaded_by = p_from;
  update public.study_material_items   set uploaded_by = p_to where uploaded_by = p_from;
  update public.feature_flags          set updated_by  = p_to where updated_by  = p_from;

  -- 기기별 푸시 구독은 그대로 옮기고, 한 사람에 한 줄인 설정·채널은 남길 계정 것이 있으면 그것을 둔다
  update public.push_subscriptions set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('push', n);
  delete from public.notification_settings s
   where s.user_id = p_from and exists (select 1 from public.notification_settings t where t.user_id = p_to);
  update public.notification_settings set user_id = p_to where user_id = p_from;
  delete from public.youtube_channels y
   where y.user_id = p_from and exists (select 1 from public.youtube_channels t where t.user_id = p_to);
  update public.youtube_channels set user_id = p_to where user_id = p_from;

  -- 강사 이름 예약도 남길 계정으로
  update private.reserved_staff set claimed_by = p_to where claimed_by = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('reserved_staff', n);

  -- 숙제 미제출 알림 신청 (2026-10-14) — 한 사람에 한 줄. 어느 쪽이든 신청했으면 남길 계정이 받는다
  insert into public.homework_missing_optins (user_id, created_at)
  select p_to, o.created_at from public.homework_missing_optins o where o.user_id = p_from
  on conflict (user_id) do nothing;
  get diagnostics n = row_count; v := v || jsonb_build_object('homework_alerts', n);
  delete from public.homework_missing_optins where user_id = p_from;

  update public.profiles p
     set role = 'student'
   where p.id = p_to
     and p.role in ('member', 'alumni')
     and exists (select 1 from public.enrollment_orders o where o.user_id = p_to and o.status = 'active');

  return v;
end;
$$;

revoke all on function private.merge_accounts(uuid, uuid, boolean) from public, anon, authenticated;

comment on function private.merge_accounts(uuid, uuid, boolean) is
  '계정 합치기의 실제 이동. 학생 기록 + 강사 쪽 참조(담당 반·점검·답변·올린 자료·푸시·이름 예약·과목) + 숙제 미제출 알림 신청을 남길 계정으로 옮기고 '
  '옛 계정에 merged_into 를 찍는다. 스태프 계정은 p_staff 가 참이고 두 등급이 같을 때만 (2026-10-02 · 신청 2026-10-14)';
