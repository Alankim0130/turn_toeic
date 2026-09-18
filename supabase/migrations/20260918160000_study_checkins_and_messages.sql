-- 비대면 스터디 인증 + 학생 알림함 (2026-09-18 Alan 요청)
--
-- "비대면 스터디를 신청한 학생은 자료를 받아 풀고 **인증을 항상** 한다. 인증은 비대면 스터디 페이지에서.
--  인증을 안 했으면 강사 모드에서 날짜별로 누가 안 했는지 보고 그 학생에게 메시지를 보낼 수 있게.
--  + 학생 계정에 선생님 알림을 받는 공간."
--
-- 1) study_checkins — 자료(날짜) 하나에 학생 인증 1건 (사진 1~10장). 자료가 열린 날부터, 수강 중일 때만.
-- 2) student_messages — 스태프가 학생에게 보내는 알림. 학생은 읽음 표시만 바꿀 수 있다.
-- 3) 계정 통합(private.merge_accounts)이 두 표도 함께 옮긴다.

-- ─── 1. 인증 ───────────────────────────────────────────────────────────────
create table if not exists public.study_checkins (
  id          bigint generated always as identity primary key,
  material_id bigint not null references public.study_materials (id) on delete cascade,
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  unique (material_id, user_id)
);
comment on table public.study_checkins is '비대면 스터디 인증 - 자료(날짜)마다 학생 1건. 사진은 study_checkin_files';

create table if not exists public.study_checkin_files (
  id           bigint generated always as identity primary key,
  checkin_id   bigint not null references public.study_checkins (id) on delete cascade,
  file_path    text not null unique,
  file_name    text not null,
  file_size    bigint not null check (file_size > 0),
  content_type text not null,
  created_at   timestamptz not null default now()
);

create index if not exists study_checkins_material_idx on public.study_checkins (material_id);
create index if not exists study_checkins_user_idx on public.study_checkins (user_id);

alter table public.study_checkins enable row level security;
alter table public.study_checkin_files enable row level security;

drop policy if exists "study_checkins: 본인·스태프 조회" on public.study_checkins;
create policy "study_checkins: 본인·스태프 조회" on public.study_checkins
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff()));

-- 신청한 스터디의 자료여야 하고, 그 자료 날짜가 됐어야 하고, 지금 수강 중이어야 한다
drop policy if exists "study_checkins: 본인 인증" on public.study_checkins;
create policy "study_checkins: 본인 인증" on public.study_checkins
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.study_materials m
        join public.studies s on s.id = m.study_id
        join public.study_signups sg on sg.study_id = s.id and sg.user_id = (select auth.uid())
       where m.id = study_checkins.material_id
         and m.date <= (select private.today_kst())
         and private.has_term_access(s.term_id)
    )
  );

-- 다시 하려면 지우고 다시 올린다
drop policy if exists "study_checkins: 본인 삭제" on public.study_checkins;
create policy "study_checkins: 본인 삭제" on public.study_checkins
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "study_checkin_files: 본인·스태프 조회" on public.study_checkin_files;
create policy "study_checkin_files: 본인·스태프 조회" on public.study_checkin_files
  for select to authenticated
  using (
    (select private.is_staff())
    or exists (select 1 from public.study_checkins c where c.id = study_checkin_files.checkin_id and c.user_id = (select auth.uid()))
  );

drop policy if exists "study_checkin_files: 본인 추가" on public.study_checkin_files;
create policy "study_checkin_files: 본인 추가" on public.study_checkin_files
  for insert to authenticated
  with check (
    split_part(file_path, '/', 1) = (select auth.uid())::text
    and exists (select 1 from public.study_checkins c where c.id = study_checkin_files.checkin_id and c.user_id = (select auth.uid()))
  );

drop policy if exists "study_checkin_files: 본인 삭제" on public.study_checkin_files;
create policy "study_checkin_files: 본인 삭제" on public.study_checkin_files
  for delete to authenticated
  using (exists (select 1 from public.study_checkins c where c.id = study_checkin_files.checkin_id and c.user_id = (select auth.uid())));

grant select, insert, delete on public.study_checkins to authenticated;
grant select, insert, delete on public.study_checkin_files to authenticated;

-- 사진 버킷 — 숙제와 같은 규칙 (본인 폴더 업로드, 본인·스태프 조회)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-checkins', 'study-checkins', false, 20 * 1024 * 1024, array['image/*'])
on conflict (id) do nothing;

drop policy if exists "study-checkins: 본인 폴더 업로드" on storage.objects;
create policy "study-checkins: 본인 폴더 업로드" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'study-checkins' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "study-checkins: 본인·스태프 조회" on storage.objects;
create policy "study-checkins: 본인·스태프 조회" on storage.objects
  for select to authenticated
  using (bucket_id = 'study-checkins' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff())));

drop policy if exists "study-checkins: 본인 삭제" on storage.objects;
create policy "study-checkins: 본인 삭제" on storage.objects
  for delete to authenticated
  using (bucket_id = 'study-checkins' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─── 2. 학생 알림함 ─────────────────────────────────────────────────────────
create table if not exists public.student_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,   -- 받는 학생
  sender_id   uuid references public.profiles (id) on delete set null,           -- 보낸 스태프
  sender_name text not null default '',   -- 학생은 스태프 프로필을 못 읽으므로(RLS) 보낼 때 이름을 박아 둔다
  title       text not null check (char_length(title) between 1 and 80),
  body        text not null check (char_length(body) between 1 and 1000),
  kind        text not null default 'general' check (kind in ('general', 'study_checkin')),
  related     jsonb,                        -- 예: {"materialId": 12, "date": "2026-09-18"}
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
comment on table public.student_messages is '스태프 -> 학생 알림 (앱 안 알림함). 문자·알림톡·학생 푸시는 아니다';

create index if not exists student_messages_user_idx on public.student_messages (user_id, read_at, created_at desc);

alter table public.student_messages enable row level security;

drop policy if exists "student_messages: 본인·스태프 조회" on public.student_messages;
create policy "student_messages: 본인·스태프 조회" on public.student_messages
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff()));

drop policy if exists "student_messages: 스태프 발송" on public.student_messages;
create policy "student_messages: 스태프 발송" on public.student_messages
  for insert to authenticated
  with check ((select private.is_staff()) and sender_id = (select auth.uid()));

-- 학생은 읽음 표시(read_at)만 바꾼다 — 컬럼 grant 로 그 칸만 열어 둔다
drop policy if exists "student_messages: 본인 읽음" on public.student_messages;
create policy "student_messages: 본인 읽음" on public.student_messages
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert on public.student_messages to authenticated;
grant update (read_at) on public.student_messages to authenticated;

-- ─── 3. 계정 통합이 두 표도 옮긴다 (20260918110000 의 함수에 두 문장 추가) ─────
create or replace function private.merge_accounts(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  n int;
begin
  if p_from = p_to then
    raise exception 'same_account' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles p where p.id in (p_from, p_to) and (p.merged_into is not null or p.role in ('instructor', 'admin'))) then
    raise exception 'not_mergeable' using errcode = '22023';
  end if;

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

  update public.textbook_orders set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('textbook_orders', n);

  update public.contact_messages set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('contacts', n);

  -- 알림함도 따라간다
  update public.student_messages set user_id = p_to where user_id = p_from;
  get diagnostics n = row_count; v := v || jsonb_build_object('messages', n);

  update public.profiles p
     set role = 'student'
   where p.id = p_to
     and p.role in ('member', 'alumni')
     and exists (select 1 from public.enrollment_orders o where o.user_id = p_to and o.status = 'active');

  update public.profiles
     set merged_into = p_to
   where id = p_from;

  return v;
end;
$$;

revoke all on function private.merge_accounts(uuid, uuid) from public, anon, authenticated;
