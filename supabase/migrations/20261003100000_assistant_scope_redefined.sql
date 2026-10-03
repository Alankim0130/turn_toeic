-- 조교 권한을 다시 정한다 (2026-10-03 Alan)
--
--   "조교의 권한
--    1. 수동등업 수락을 확인 후 할 수 있다
--    2. 불라방 교재주문을 해야한다 (불라방 주문 페이지)
--    3. 스터디를 조교가 운영한다 (스터디 신청자 페이지)
--    4. 불라방 링크 올리기
--    5. 숙제점검
--    6. 출석확인
--    없는 권한
--    1. 학생명단 (개인정보가 있기때문에)
--    2. 반배정 (강사가 직접 배정를 해준다)
--    3. 이하 다른 관리자페이지"
--
-- 화면 · 서버 액션의 가드와 메뉴(crew 표시)는 앱이 바꾸고, 여기서는 **DB 가 같은 집합을 보게** 맞춘다
-- (CLAUDE.md 등급 체계 1 "DB 와 앱은 늘 같은 집합이다"). 등업 로그 · 교재주문 · 스터디 신청자 · 출석은 이미 조교에게 열려 있다.
-- 정책 이름은 마이그레이션을 순서대로 재생해 지금 살아 있는 이름을 확인했다 (없는 정책을 drop 하면 배포가 통째로 실패한다).

-- ─── 1. 빼는 것 — 학생 등급 바꾸기 ─────────────────────────────────────────────
-- 등급은 학생 관리 화면에서 바꾸는데, 학생명단 · 학생 관리가 강사 · 관리자 전용이 됐다 (2026-09-19 부터 조교가 학생 등급끼리 바꿀 수 있었다).
-- 수강증 승인으로 수강생이 되는 것은 서버(서비스 롤)가 하므로 이 정책과 상관없다 — 조교의 등업 수락은 그대로 된다.
drop policy "profiles: 본인·스태프·조교 수정" on public.profiles;
create policy "profiles: 본인·스태프 수정" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()))
  with check (
    (select private.is_admin())
    or (
      (select auth.uid()) = id
      and role = (select private.my_real_role())
      and name = (select private.my_profile_name())
    )
  );
-- private.guard_assistant_profile_update 트리거는 그대로 둔다 — 이제는 정책이 먼저 막지만 두 겹으로 둔다.

-- ─── 2. 빼는 것 — 학생명단 · 학생 관리만 쓰던 것 ────────────────────────────────
-- 계정 정보(이메일 · 로그인 방식 · 마지막 접속 · 카카오·구글 사진): 강사 · 관리자만
create or replace function public.student_auth_info(p_ids uuid[])
returns table (user_id uuid, email text, providers text[], last_sign_in_at timestamptz, avatar_url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- 학생명단 · 학생 관리 전용 — 둘 다 강사 · 관리자 화면이다 (2026-10-03 조교 제외)
  if not private.is_staff() then
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
         u.last_sign_in_at,
         coalesce(nullif(u.raw_user_meta_data ->> 'avatar_url', ''), nullif(u.raw_user_meta_data ->> 'picture', ''))
    from auth.users u
   where u.id = any(p_ids);
end;
$$;

-- 학생이 올린 프로필 사진 — 명단 · 학생 관리에만 보인다
drop policy "avatars: 본인·크루 조회" on storage.objects;
create policy "avatars: 본인·스태프 조회" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff())));

-- 학생 관리의 반 배정 추가가 읽던 수업일 (20261002160000 에서 조교에게 열었다). 반 배정은 강사가 한다
drop policy "term_class_dates: 조교 조회" on public.term_class_dates;

-- ─── 3. 더하는 것 — 불라방 링크 올리기 (/admin/live) ─────────────────────────────
-- 조교는 강사 두 분의 수업 전부를 본다. 회차 · 회차 링크를 읽고, 링크를 넣고 고치고 지운다.
-- 링크가 들어오면 불라방 학생에게 "수업이 시작됐어요" 를 보내는 트리거(tg_session_live_link_notify)와
-- 다시보기 주소를 따라 바꾸는 트리거(tg_session_live_link_changed)는 security definer 라 조교가 저장해도 그대로 돈다.
drop policy "session_dates: 수강생·스태프 조회" on public.session_dates;
create policy "session_dates: 수강생·스태프·조교 조회" on public.session_dates
  for select to authenticated
  using (
    (select private.has_section_access(section_id))
    or (select private.has_recorded_replay_access(section_id))
    or (select private.is_crew())
  );

drop policy "session_live_links: 수강생·스태프 조회" on public.session_live_links;
create policy "session_live_links: 수강생·스태프·조교 조회" on public.session_live_links
  for select to authenticated
  using (
    (select private.is_crew())
    or exists (
      select 1 from public.session_dates sd
       where sd.id = session_live_links.session_date_id
         and (select private.has_section_access(sd.section_id))
    )
  );

create policy "session_live_links: 조교 등록" on public.session_live_links
  for insert to authenticated
  with check ((select private.is_assistant()));
create policy "session_live_links: 조교 수정" on public.session_live_links
  for update to authenticated
  using ((select private.is_assistant()))
  with check ((select private.is_assistant()));
create policy "session_live_links: 조교 삭제" on public.session_live_links
  for delete to authenticated
  using ((select private.is_assistant()));

-- ─── 4. 더하는 것 — 숙제점검 (/admin/homework) ──────────────────────────────────
-- 제출 목록 · 사진을 보고 점검완료(+ 코멘트)한다. 바꿀 수 있는 칸은 칸 단위 grant 가 이미 status · checked_* · feedback 뿐이다.
-- homework_files 의 조회 정책은 homework_submissions 가 보이는지를 따르므로 따로 고치지 않는다.
drop policy "homework_submissions: 본인·스태프 조회" on public.homework_submissions;
create policy "homework_submissions: 본인·스태프·조교 조회" on public.homework_submissions
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_crew()));

drop policy "homework_submissions: 스태프 점검" on public.homework_submissions;
create policy "homework_submissions: 스태프·조교 점검" on public.homework_submissions
  for update to authenticated
  using ((select private.is_crew()))
  with check ((select private.is_crew()));

drop policy "homework: 본인·스태프 조회" on storage.objects;
create policy "homework: 본인·스태프·조교 조회" on storage.objects
  for select to authenticated
  using (bucket_id = 'homework' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_crew())));

-- ─── 5. 더하는 것 — 스터디 운영: 비대면 인증 현황 (/admin/study) ──────────────────
-- 그전에는 자료 · 인증이 강사 · 관리자에게만 보여서 조교 화면에 "이 달에 들어간 자료가 없어요" 가 떴다 (2026-10-03 점검).
-- 인증 사진 자체는 관리자 화면 어디서도 열지 않으므로(사진 수만 센다) storage 정책은 그대로 둔다.
drop policy "study_materials: 신청자·스태프 조회" on public.study_materials;
create policy "study_materials: 신청자·스태프·조교 조회" on public.study_materials
  for select to authenticated
  using (
    (select private.is_crew())
    or (
      date <= (select private.today_kst())
      and exists (
        select 1
          from public.study_signups g
          join public.studies s on s.id = g.study_id
         where g.study_id = study_materials.study_id
           and g.user_id = (select auth.uid())
           and private.has_term_access(s.term_id)
      )
    )
  );

drop policy "study_checkins: 본인·스태프 조회" on public.study_checkins;
create policy "study_checkins: 본인·스태프·조교 조회" on public.study_checkins
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_crew()));

drop policy "study_checkin_files: 본인·스태프 조회" on public.study_checkin_files;
create policy "study_checkin_files: 본인·스태프·조교 조회" on public.study_checkin_files
  for select to authenticated
  using (
    (select private.is_crew())
    or exists (
      select 1 from public.study_checkins c
       where c.id = study_checkin_files.checkin_id
         and c.user_id = (select auth.uid())
    )
  );

-- ─── 6. 더하는 것 — 조교가 보내는 학생 알림: 비대면 인증 독촉 · 숙제 점검완료 두 가지만 ─────────
-- 강사 · 관리자는 그대로 무엇이든 보낸다("student_messages: 스태프 발송"). 조교는 하는 일에 딸린 두 종류뿐이고,
-- 보낸 이 이름은 자기 이름이어야 한다 — 화면을 거치지 않고 강사 이름으로 보내는 길을 막는다.
-- 결석 알림(attendance)은 강사 · 관리자만이다 (출석은 확인까지 — 2026-10-03).
create policy "student_messages: 조교 발송" on public.student_messages
  for insert to authenticated
  with check (
    (select private.is_assistant())
    and sender_id = (select auth.uid())
    and kind in ('study_checkin', 'homework_checked')
    and sender_name = (select private.my_profile_name())
  );

-- ─── 7. 고치는 것 — 교재주문: 조교는 상태 · 송장만 바꾼다 ───────────────────────────
-- 2026-10-03 점검: 정책("textbook_orders: 스태프·조교 처리")이 조교에게 행 전체를 열어 두어, 화면을 거치지 않고 API 를 부르면
-- **학생에게 보이는 입금 계좌(pay_to) · 금액 · 주문자 · 주소**까지 바꿀 수 있었다 (로컬 재생 DB 에서 재현).
-- 학생 주문 화면은 주문에 저장된 계좌를 그대로 보여 주므로, 계좌가 바뀌면 학생이 다른 통장으로 입금하게 된다.
-- 조교 화면이 바꾸는 칸은 상태 · 송장번호 · 수정 시각뿐이다 (received_at 은 아래에서 이 트리거가 지운다).
create or replace function private.guard_textbook_order_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (select private.my_real_role()) = 'assistant' then
    if (to_jsonb(new) - array['status', 'tracking_no', 'updated_at', 'received_at'])
       is distinct from (to_jsonb(old) - array['status', 'tracking_no', 'updated_at', 'received_at']) then
      raise exception 'assistant_status_only' using errcode = '42501';
    end if;
    -- 금액확인은 강사 · 관리자만 — 금액확인 전(또는 취소) 주문을 배송 대기 · 배송완료로 넘기지 못한다 (2026-10-02)
    if new.status in ('confirmed', 'shipped') and old.status in ('requested', 'cancelled') then
      raise exception 'confirm_staff_only' using errcode = '42501';
    end if;
  end if;
  if new.status <> 'shipped' then
    new.received_at := null;
  end if;
  return new;
end;
$$;
