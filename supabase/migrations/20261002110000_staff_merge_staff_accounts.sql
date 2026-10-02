-- ============================================================================
-- 스태프 계정도 합칠 수 있게 (2026-10-02 Alan 요청)
--
--  "이혜영 강사님이 아이디가 두 개가 생겼어. dodo8961@naver.com(이메일 가입) 이랑 dodo-2000@hanmail.net(카카오).
--   새로 로그인한 카카오 계정은 강사로 등록시켜 놨어. 둘 다 같은 계정이라는 기록을 남겨줘."
--
--  * 계정 합치기(private.merge_accounts)는 지금까지 **학생 계정만** 받았다 — 이름·전화번호만으로 남의 기록을
--    가져가는 길을 막으려고 스태프 계정은 거부했다. 그 보호는 그대로 두고, **스태프가 직접 합치는 길
--    (public.staff_merge_accounts)에서만** 스태프 계정도 받는다. 학생 쪽 신청·확인 흐름은 여전히 거부한다.
--  * 두 계정이 **같은 등급**이어야 한다 (role_mismatch). 강사 계정을 회원 계정에 합쳐 강사 권한이 사라지거나,
--    반대로 회원이 강사가 되는 일을 막는다 — 등급은 먼저 /admin/students/[id] 에서 맞춘다.
--  * 스태프 계정은 학생 기록 말고 **강사 쪽 참조**를 쥐고 있다: 반의 담당 강사(class_sections.instructor_id),
--    숙제 점검·문의 답변·알림 보낸 사람·출석 처리한 사람, 올린 음원·자료, 푸시 구독·알림 설정·유튜브 채널,
--    강사 이름 예약(private.reserved_staff.claimed_by), 담당 과목(profiles.subject). 전부 남길 계정으로 옮긴다 —
--    안 옮기면 반 20개가 로그인도 못 하는 계정을 담당 강사로 가리키고, 담당 강사 자동 배정도 죽은 계정을 고른다.
--  * 담당 강사 판정(private.section_instructor_plan)은 합쳐진 계정을 **보지 않는다** (merged_into is null).
--  * 합친 뒤 옛 계정은 지금처럼 로그인만 막고(/account-merged) 기록은 보존한다. 되돌리려면 merged_into 를 비우고
--    위 참조를 다시 옮기면 된다 — 지우는 것은 없다.
-- ============================================================================

-- ─── 1. merge_accounts: p_staff 가 참일 때만 스태프 계정을 받는다 ──────────────────────────
drop function if exists private.merge_accounts(uuid, uuid);

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
  '계정 합치기의 실제 이동. 학생 기록 + 강사 쪽 참조(담당 반·점검·답변·올린 자료·푸시·이름 예약·과목)를 남길 계정으로 옮기고 '
  '옛 계정에 merged_into 를 찍는다. 스태프 계정은 p_staff 가 참이고 두 등급이 같을 때만 (2026-10-02)';

-- ─── 2. 스태프가 직접 합칠 때는 스태프 계정도 받는다 ──────────────────────────────────────
create or replace function public.staff_merge_accounts(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'invalid_pair' using errcode = '22023';
  end if;

  -- 이동 규칙은 학생 쪽과 같고, 스태프 계정은 여기서만 받는다 (등급이 같아야 한다 — role_mismatch)
  v := private.merge_accounts(p_from, p_to, true);

  insert into public.account_merge_requests (from_user, to_user, requested_by, status, moved, decided_at)
  values (p_from, p_to, auth.uid(), 'done', v, now());

  return v;
end;
$$;

-- ─── 3. 합치기 후보: 스태프 계정을 볼 때는 스태프 계정도 후보에 든다 ───────────────────────
create or replace function public.staff_merge_candidates(p_user uuid)
returns table (
  user_id    uuid,
  name       text,
  phone      text,
  email_hint text,
  joined_at  timestamptz,
  role       text,
  same_name  boolean,
  same_phone boolean,
  has_records boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with target as (
    select p.id,
           p.role in ('instructor', 'admin') as is_staff,
           regexp_replace(p.name, '\s', '', 'g') as name_key,
           regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') as phone_key
      from public.profiles p
     where p.id = p_user
  )
  select o.id,
         o.name,
         o.phone,
         case when u.email is null or position('@' in u.email) < 2 then '비공개'
              else left(u.email, 2) || '***@' || split_part(u.email, '@', 2) end,
         o.created_at,
         o.role::text,
         regexp_replace(o.name, '\s', '', 'g') = t.name_key,
         t.phone_key <> '' and regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g') = t.phone_key,
         exists (select 1 from public.homework_submissions h where h.user_id = o.id)
           or exists (select 1 from public.enrollment_orders e where e.user_id = o.id)
           or exists (select 1 from public.class_sections c where c.instructor_id = o.id)
    from target t
    join public.profiles o
      on o.id <> t.id
     and o.merged_into is null
     -- 학생을 볼 때는 스태프 계정이 후보에 들지 않는다. 스태프 계정을 볼 때는 스태프 계정만 (등급이 같아야 합쳐진다)
     and ((o.role in ('instructor', 'admin')) = t.is_staff)
    left join auth.users u on u.id = o.id
   where regexp_replace(o.name, '\s', '', 'g') = t.name_key
      or (t.phone_key <> '' and regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g') = t.phone_key)
   order by o.created_at;
end;
$$;

-- ─── 4. 담당 강사 자동 배정은 합쳐진 계정을 보지 않는다 ───────────────────────────────────
create or replace function private.section_instructor_plan(p_term_id bigint)
returns table (
  section_id    bigint,
  current_id    uuid,
  is_package    boolean,
  is_known      boolean,
  subj          text,
  teacher_id    uuid
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with s as (
    select cs.id, cs.subject, cs.instructor_id,
           (c.program = 'sparta' or private.is_package_section(cs.id)) as pkg
      from public.class_sections cs
      join public.courses c on c.id = cs.course_id
     where cs.term_id = p_term_id
  ),
  teacher as (
    -- 과목마다 한 사람. 강사를 관리자보다 앞에, 먼저 가입한 순 (이혜영 lc · 이영수 rc). 합쳐진 옛 계정은 뺀다
    select distinct on (p.subject) p.subject, p.id
      from public.profiles p
     where p.subject in ('lc', 'rc') and p.role in ('instructor', 'admin') and p.merged_into is null
     order by p.subject, (p.role = 'instructor') desc, p.created_at
  )
  select s.id,
         s.instructor_id,
         s.pkg,
         (not s.pkg and s.subject is not null),
         s.subject,
         t.id
    from s
    left join teacher t on t.subject = s.subject
$fn$;

comment on function private.section_instructor_plan(bigint) is
  '기수의 반마다 담당 강사 판정 (2026-09-23: 과목 칸 class_sections.subject 로, 2026-10-02: 합쳐진 계정 제외). '
  '앱의 src/lib/instructor-subject.ts planSubjects 와 같은 규칙';
