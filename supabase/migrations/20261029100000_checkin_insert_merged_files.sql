-- ============================================================================
-- 2026-10-29 전체 점검 (Alan "다른 종류 버그도 전체적으로 점검해줘") — DB 쪽 고침 둘
--
--   1. 비대면 인증 — **학생이 처음부터 '선생님 확인 완료' 인 인증을 넣을 수 있었다.**
--      study_checkins 의 insert 권한이 표 전체(grant insert, 2026-09-18)라 2026-10-08 에 더한 확인 칸(status · checked_by · checked_at · feedback)까지
--      학생이 직접 쓸 수 있었고, 정책 "study_checkins: 본인 인증" 은 status 를 보지 않았다. 브라우저 콘솔에서
--      insert({ material_id, user_id, status: 'checked', checked_by: <강사 id>, feedback: '아주 잘했어요!' }) 를 부르면 사진 없이도
--      학생 화면에 '선생님 확인 완료' 와 가짜 코멘트가 섰고, 강사 게시판의 '확인 전' 목록에서 빠져 아무도 보지 않았다 (재생 DB 로 재현).
--      또 확인이 끝난 인증에도 학생이 사진 줄을 더하고(study_checkin_files: 본인 추가) 확인된 사진을 저장소에서 지울 수 있었다(study-checkins: 본인 삭제).
--      → 학생은 자료 · 본인 · 메모 칸만 넣는다(칸 단위 grant — 숙제와 같다) · 정책도 확인 전 모양만 받는다 ·
--        사진 줄은 확인 전 인증에만 더한다 · 확인된 인증의 사진은 저장소에서도 못 지운다 (숙제 "homework: 점검 전 본인 삭제" 와 같은 규칙).
--   2. 계정 합치기 뒤 — **남긴 계정이 옛 계정에서 낸 숙제 사진 · 음성 · 비대면 인증 사진을 못 열었다(404).**
--      private.merge_accounts 는 숙제 · 인증 줄의 user_id 를 남길 계정으로 옮기지만 파일은 옛 계정 폴더({옛 uid}/…)에 그대로 있고,
--      저장소 조회 · 삭제 정책은 "내 폴더" 만 본다. /files 는 보는 사람의 세션으로 서명하므로 남긴 계정의 학생에게는 옛 숙제 그림이 다 404 였고,
--      그 숙제를 취소하면 파일이 저장소에 영영 남았다 (재생 DB 로 재현 — 강사 · 조교는 crew 정책으로 봐서 학생만 알아챈다).
--      → private.my_merged_folders() = 나에게 합쳐진 옛 계정들의 폴더(합치기가 이어졌으면 끝까지) — 숙제 · 인증 저장소의 조회 · 삭제 정책이 함께 본다.
--        삭제는 예전처럼 점검 · 확인 전 파일만이다.
-- ============================================================================

-- ─── 1. 비대면 인증 — 확인 칸은 강사 · 조교 몫 ────────────────────────────────────
revoke insert on public.study_checkins from authenticated;
grant insert (material_id, user_id, note) on public.study_checkins to authenticated;

drop policy if exists "study_checkins: 본인 인증" on public.study_checkins;
create policy "study_checkins: 본인 인증" on public.study_checkins
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    -- 확인 전 모양으로만 — 칸 단위 grant 가 이미 막지만 정책도 같은 말을 한다
    and status = 'submitted'
    and checked_by is null
    and checked_at is null
    and feedback is null
    and exists (
      select 1
        from public.study_materials m
        join public.studies s on s.id = m.study_id
        join public.study_signups sg on sg.study_id = s.id and sg.user_id = (select auth.uid())
       where m.id = study_checkins.material_id
         and m.date <= (select private.today_kst())
         and (m.level = 0 or m.level = sg.level)
         and private.has_term_access(s.term_id)
    )
  );

-- 사진 줄은 확인 전 인증에만 더한다 (숙제 "homework_files: 점검 전 본인 추가" 와 같다)
drop policy if exists "study_checkin_files: 본인 추가" on public.study_checkin_files;
create policy "study_checkin_files: 본인 추가" on public.study_checkin_files
  for insert to authenticated
  with check (
    split_part(file_path, '/', 1) = (select auth.uid())::text
    and exists (
      select 1 from public.study_checkins c
       where c.id = study_checkin_files.checkin_id
         and c.user_id = (select auth.uid())
         and c.status = 'submitted'
    )
  );

-- ─── 2. 합쳐진 옛 계정의 폴더 ───────────────────────────────────────────────────
create or replace function private.my_merged_folders()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  -- A → B 로 합친 뒤 B → C 로 합치면 A 의 merged_into 는 B 그대로다 — C 에게는 A · B 둘 다
  with recursive m(id) as (
    select p.id from public.profiles p where p.merged_into = (select auth.uid())
    union
    select p.id from public.profiles p join m on p.merged_into = m.id
  )
  select coalesce(array_agg(id::text), '{}') from m
$$;
comment on function private.my_merged_folders() is
  '나에게 합쳐진 옛 계정들의 저장소 폴더 이름(uid) — 합치기가 이어졌으면 끝까지 (2026-10-29). 숙제 · 비대면 인증 저장소의 조회 · 삭제 정책이 본다 — 옮겨 온 기록의 파일이 옛 폴더에 있다';
revoke all on function private.my_merged_folders() from public, anon;
grant execute on function private.my_merged_folders() to authenticated, service_role;

-- 숙제 (사진 · 음성)
drop policy if exists "homework: 본인·스태프·조교 조회" on storage.objects;
create policy "homework: 본인·스태프·조교 조회" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'homework'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_crew())
      or array[(storage.foldername(name))[1]] <@ (select private.my_merged_folders())
    )
  );

drop policy if exists "homework: 점검 전 본인 삭제" on storage.objects;
create policy "homework: 점검 전 본인 삭제" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'homework'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or array[(storage.foldername(name))[1]] <@ (select private.my_merged_folders())
    )
    and not exists (
      select 1
        from public.homework_files f
        join public.homework_submissions s on s.id = f.submission_id
       where f.file_path = objects.name
         and s.status = 'checked'
    )
  );

-- 비대면 인증 사진
drop policy if exists "study-checkins: 본인·스태프·조교 조회" on storage.objects;
create policy "study-checkins: 본인·스태프·조교 조회" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'study-checkins'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_crew())
      or array[(storage.foldername(name))[1]] <@ (select private.my_merged_folders())
    )
  );

drop policy if exists "study-checkins: 본인 삭제" on storage.objects;
create policy "study-checkins: 본인 삭제" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'study-checkins'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or array[(storage.foldername(name))[1]] <@ (select private.my_merged_folders())
    )
    -- 선생님이 확인한 인증의 사진은 지우지 못한다 (줄은 "study_checkin_files: 본인 삭제" 가 이미 막는다)
    and not exists (
      select 1
        from public.study_checkin_files f
        join public.study_checkins c on c.id = f.checkin_id
       where f.file_path = objects.name
         and c.status = 'checked'
    )
  );
