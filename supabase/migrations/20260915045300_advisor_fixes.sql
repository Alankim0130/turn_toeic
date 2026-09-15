-- ============================================================================
-- Security / Performance Advisor 지적 반영
--
--  [ERROR] security_definer_view: class_sections_public 뷰가 소유자 권한으로 실행됨
--    → live_url 을 별도 테이블(section_live_links)로 분리하고 뷰를 없앤다.
--      class_sections 자체는 draft 를 제외하고 공개 조회 가능하게 한다.
--      (tuition 은 YBM 공식 사이트에 공개된 값이므로 공개 컬럼으로 둔다)
--
--  [WARN] multiple_permissive_policies: 같은 role·action 에 permissive 정책이 2개
--    → "본인 OR 스태프" 를 정책 하나로 합치고, 스태프 "for all" 정책은
--      insert / update / delete 로 분리한다.
-- ============================================================================

-- ─── 1. live_url → section_live_links ──────────────────────────────────────
create table public.section_live_links (
  section_id  bigint primary key references public.class_sections (id) on delete cascade,
  live_url    text not null,
  updated_at  timestamptz not null default now()
);
comment on table public.section_live_links is '불라방 입장 링크. 해당 반에 접근 가능한 수강생과 스태프만 조회';

insert into public.section_live_links (section_id, live_url)
select id, live_url from public.class_sections where live_url is not null;

drop view public.class_sections_public;
alter table public.class_sections drop column live_url;

grant select, insert, update, delete on public.section_live_links to authenticated;
grant all on public.section_live_links to service_role;
alter table public.section_live_links enable row level security;

create policy "live_links: 수강생·스태프 조회" on public.section_live_links
  for select to authenticated
  using ((select private.has_section_access(section_id)) or (select private.is_staff()));
create policy "live_links: 담당 강사 등록" on public.section_live_links
  for insert to authenticated
  with check ((select private.can_manage_section(section_id)));
create policy "live_links: 담당 강사 수정" on public.section_live_links
  for update to authenticated
  using ((select private.can_manage_section(section_id)))
  with check ((select private.can_manage_section(section_id)));
create policy "live_links: 담당 강사 삭제" on public.section_live_links
  for delete to authenticated
  using ((select private.can_manage_section(section_id)));

-- ─── 2. class_sections: draft 제외 공개 조회 ────────────────────────────────
-- anon 정책은 private 함수를 호출할 수 없으므로 role 별로 나눈다 (role 이 다르면 중복 경고 없음)
drop policy "class_sections: 수강생 조회" on public.class_sections;
drop policy "class_sections: 스태프 조회" on public.class_sections;
grant select on public.class_sections to anon;

create policy "class_sections: 비회원 조회" on public.class_sections
  for select to anon
  using (status <> 'draft');
create policy "class_sections: 회원 조회" on public.class_sections
  for select to authenticated
  using (status <> 'draft' or (select private.is_staff()));

-- ─── 3. permissive 정책 병합 ────────────────────────────────────────────────

-- profiles
drop policy "profiles: 본인 조회" on public.profiles;
drop policy "profiles: 스태프 전체 조회" on public.profiles;
drop policy "profiles: 본인 수정" on public.profiles;
drop policy "profiles: admin 수정" on public.profiles;

create policy "profiles: 본인·스태프 조회" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select private.is_staff()));
create policy "profiles: 본인(전화번호만)·admin 수정" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()))
  with check (
    (select private.is_admin())
    or (
      (select auth.uid()) = id
      and role = (select private.user_role())
      and name = (select p.name from public.profiles p where p.id = (select auth.uid()))
    )
  );

-- terms / courses: 공개 조회 1개 + 스태프 쓰기는 action 별로
drop policy "terms: 공개 조회" on public.terms;
drop policy "terms: 스태프 쓰기" on public.terms;
create policy "terms: 공개 조회" on public.terms
  for select to anon, authenticated using (true);
create policy "terms: 스태프 등록" on public.terms
  for insert to authenticated with check ((select private.is_staff()));
create policy "terms: 스태프 수정" on public.terms
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "terms: 스태프 삭제" on public.terms
  for delete to authenticated using ((select private.is_staff()));

drop policy "courses: 공개 조회" on public.courses;
drop policy "courses: 스태프 쓰기" on public.courses;
create policy "courses: 공개 조회" on public.courses
  for select to anon, authenticated using (true);
create policy "courses: 스태프 등록" on public.courses
  for insert to authenticated with check ((select private.is_staff()));
create policy "courses: 스태프 수정" on public.courses
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "courses: 스태프 삭제" on public.courses
  for delete to authenticated using ((select private.is_staff()));

-- session_dates
drop policy "session_dates: 수강생 조회" on public.session_dates;
drop policy "session_dates: 스태프 조회" on public.session_dates;
create policy "session_dates: 수강생·스태프 조회" on public.session_dates
  for select to authenticated
  using ((select private.has_section_access(section_id)) or (select private.is_staff()));

-- replays
drop policy "replays: 수강생 시청" on public.replays;
drop policy "replays: 스태프 조회" on public.replays;
create policy "replays: 수강생·스태프 조회" on public.replays
  for select to authenticated
  using (
    (select private.is_staff())
    or exists (
      select 1 from public.session_dates sd
      where sd.id = session_date_id
        and (select private.has_section_access(sd.section_id))
    )
  );

-- enrollment_verifications
drop policy "verifications: 본인 조회" on public.enrollment_verifications;
drop policy "verifications: 스태프 조회" on public.enrollment_verifications;
create policy "verifications: 본인·스태프 조회" on public.enrollment_verifications
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff()));

-- enrollment_orders
drop policy "orders: 본인 조회" on public.enrollment_orders;
drop policy "orders: 스태프 조회" on public.enrollment_orders;
create policy "orders: 본인·스태프 조회" on public.enrollment_orders
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff()));

-- enrollments
drop policy "enrollments: 본인 조회" on public.enrollments;
drop policy "enrollments: 스태프 관리" on public.enrollments;
create policy "enrollments: 본인·스태프 조회" on public.enrollments
  for select to authenticated
  using ((select auth.uid()) = student_id or (select private.is_staff()));
create policy "enrollments: 스태프 등록" on public.enrollments
  for insert to authenticated with check ((select private.is_staff()));
create policy "enrollments: 스태프 수정" on public.enrollments
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "enrollments: 스태프 삭제" on public.enrollments
  for delete to authenticated using ((select private.is_staff()));
