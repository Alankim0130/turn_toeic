-- ============================================================================
-- 조교에게 등업 관리를 연다 (2026-09-19 Alan — "역전토익쌤들은 조교가 등업관리를 다 하기 때문에,
-- 조교에게도 등업신청을 보고 확인 후 수락해주거나 등급권한을 부여해주는 권한이 있으면 좋겠어")
--
-- 여는 것
--   ① 등업신청(enrollment_verifications) 조회 + 수강증 이미지(storage `receipts`) 조회
--   ② 학생명단의 계정 정보(student_auth_info)
--   ③ 등급 변경 — **학생 등급인 사람을 학생 등급으로만** (guest·member·student·alumni)
--   ④ has_section_access 에 조교 추가 — 반에 배정된 조교의 학생 화면이 강사·관리자와 같아진다
--
-- 열지 않는 것 — `private.is_staff()` 는 **그대로 둔다** (넓히면 관리자 화면이 통째로 열린다).
--   반 편성 · 다시보기 등록 · 숙제점검 · LC 음원 · 문의 · 알림 · 마케팅 분석 · 대시보드 ·
--   계정 합치기 · 테스트 등급은 계속 스태프만.
--
-- 쓰기(승인·거절·반 배정)는 서버 액션이 서비스 롤로 하고 권한은 `requireCrew()` 가 본다.
-- 그래서 "verifications: 스태프 정정"(세션 UPDATE) 은 스태프 전용 그대로 둔다 —
-- 좁은 쪽은 구멍이 아니고, 넓히면 쓰는 길이 두 개가 된다.
--
-- 앱의 같은 판정은 `src/lib/auth.ts` 의 `canAssignRole()` · `isStudentGrade()` 다 —
-- **한쪽만 고치면 화면은 열리는데 RLS 가 막거나, 그 반대가 된다** (`src/lib/roles.test.ts` 가 지킨다).
-- ============================================================================

-- ─── 1. 학생 등급 = 관리자 화면을 하나도 못 쓰는 등급 ──────────────────────
create or replace function private.is_student_grade(p_role public.user_role)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_role in ('guest', 'member', 'student', 'alumni')
$$;

revoke execute on function private.is_student_grade(public.user_role) from public, anon;
grant execute on function private.is_student_grade(public.user_role) to authenticated, service_role;

-- ─── 2. 등업신청 조회 · 수강증 이미지 ──────────────────────────────────────
-- 지금 살아 있는 정책은 본인 조회와 합쳐진 "verifications: 본인·스태프 조회" 다
-- (init_schema 의 "verifications: 스태프 조회" 는 20260915045300 에서 이미 없어졌다).
drop policy "verifications: 본인·스태프 조회" on public.enrollment_verifications;
create policy "verifications: 본인·스태프·조교 조회" on public.enrollment_verifications
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_crew()));

-- 승인 화면이 **로그인한 사람의 세션으로** 서명 URL 을 만든다 (page.tsx 의 createSignedUrl) —
-- 여기를 안 열면 조교에게는 수강증 이미지가 안 보여 승인 판단을 할 수 없다
drop policy "receipts: 스태프 조회" on storage.objects;
create policy "receipts: 스태프·조교 조회" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (select private.is_crew()));

-- ─── 3. 학생명단의 계정 정보 (이메일·로그인 방식·마지막 접속) ───────────────
-- 조교가 등업을 처리하려면 동명이인을 갈라야 한다. 이름·전화번호는 이미 조교에게 열려 있다
create or replace function public.student_auth_info(p_ids uuid[])
returns table (
  user_id         uuid,
  email           text,
  providers       text[],
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- 학생·회원은 못 부른다 (남의 이메일을 읽는 길이 된다)
  if not private.is_crew() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select u.id,
         u.email::text,
         coalesce(
           (select array_agg(distinct i.provider order by i.provider)
              from auth.identities i
             where i.user_id = u.id),
           case
             when coalesce(u.raw_app_meta_data ->> 'provider', '') <> ''
               then array[u.raw_app_meta_data ->> 'provider']
             else array[]::text[]
           end
         ),
         u.last_sign_in_at
    from auth.users u
   where u.id = any(p_ids);
end;
$$;

comment on function public.student_auth_info(uuid[]) is
  '학생명단용 계정 정보 (이메일·로그인 방식·마지막 접속). 스태프·조교만.';

-- ─── 4. 등급 변경 — 조교는 학생 등급인 사람을 학생 등급으로만 ───────────────
-- using 은 **바꾸기 전(OLD)** 의 등급을, with check 는 **바꾼 뒤(NEW)** 의 등급을 본다.
-- 그래서 조교는 ① 스태프 계정을 건드릴 수 없고(관리자를 졸업생으로 내려 서비스를 멈추는 길 차단)
--            ② 누구도 강사·관리자·조교로 올릴 수 없으며(스스로 권한을 올리는 길 차단)
--            ③ 본인 행의 등급도 못 바꾼다.
-- 조건에 필요한 값은 전부 security definer 함수로 읽는다 — 정책 안에서 profiles 를 다시 조회하면
-- 42P17(무한 재귀)로 세션 UPDATE 가 통째로 막힌다 (2026-09-16 에 실제로 그랬다).
drop policy "profiles: 본인·admin 수정" on public.profiles;
create policy "profiles: 본인·스태프·조교 수정" on public.profiles
  for update to authenticated
  using (
    (select auth.uid()) = id
    or (select private.is_admin())
    or ((select private.my_real_role()) = 'assistant' and private.is_student_grade(role))
  )
  with check (
    (select private.is_admin())
    or (
      (select private.my_real_role()) = 'assistant'
      and (select auth.uid()) <> id
      and private.is_student_grade(role)
    )
    or (
      (select auth.uid()) = id
      and role = (select private.my_real_role())
      and name = (select private.my_profile_name())
    )
  );

-- 조교가 남의 행에서 **등급 말고 다른 칸을 바꾸지 못하게** 한다.
-- RLS 는 칸 단위로 막지 못하므로(그건 GRANT 의 몫이고 조교만 따로 줄일 수 없다) 트리거로 본다.
-- 이름은 수강증 대조 키라, 조용히 바뀌면 자동 등업이 통째로 어긋난다.
create or replace function private.guard_assistant_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 본인 행은 기존 정책이 이미 이름·등급을 잠근다. 서비스 롤(auth.uid() 가 없다)은 지나간다
  if (select auth.uid()) is not null
     and new.id <> (select auth.uid())
     and (select private.my_real_role()) = 'assistant'
     and to_jsonb(new) - 'role' is distinct from to_jsonb(old) - 'role'
  then
    raise exception 'assistant_role_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_assistant_profile_update on public.profiles;
create trigger guard_assistant_profile_update
  before update on public.profiles
  for each row execute function private.guard_assistant_profile_update();

-- ─── 5. 조교의 학생 화면을 강사·관리자와 같게 ──────────────────────────────
-- has_term_access 에는 이미 조교가 들어 있어 **스터디 자료·LC 음원·숙제는 열리는데**
-- 내 시간표(session_dates) · 다시보기(replays) · 불라방 링크(section/session_live_links)는 막혀 있었다.
-- 이 함수는 "반에 실제로 배정돼 있나" 를 함께 보므로, 배정이 없는 조교에게는 아무것도 열리지 않는다.
create or replace function private.has_section_access(p_section_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_role() in ('student', 'instructor', 'admin', 'assistant')
     and exists (
       select 1
       from public.enrollments e
       join public.enrollment_orders o on o.id = e.order_id
       join public.class_sections s on s.id = e.section_id
       where e.student_id = (select auth.uid())
         and e.status = 'active'
         and o.status = 'active'
         and private.today_kst() <= s.closes_at
         and (e.section_id = p_section_id or private.section_includes(e.section_id, p_section_id))
     )
$$;
