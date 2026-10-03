-- 조교에게는 학생 정보 중 이름만 (2026-10-03 Alan)
--
--   "등업화면은 전화번호 안보이게 해줘" → "Api를 부른다는 말이 무슨말이지?" → "응 이것도 막아줘"
--
-- 화면에서 번호를 숨겨도(같은 날 앱 — 등업 검토의 연락처 줄) 조교가 자기 로그인으로 데이터베이스에 바로 물으면
-- 학생 전화번호 · 대학 · 학과 · 성별이 그대로 왔다. 길이 셋이었다 (마이그레이션을 재생해 조교가 읽을 수 있는 표 · 부를 수 있는 함수를 전부 훑었다):
--   1. profiles 조회 정책 "본인·스태프·조교 조회"(20260916240000) — 조교에게 남의 행을 **모든 칸째** 열었다.
--      칸 단위로는 못 막는다 — grant 는 authenticated 전체에 걸려 강사 · 관리자 · 학생 본인까지 함께 막힌다.
--   2. attendance_roster(날짜) — 조교가 부르는 출석 명단 함수가 phone 을 돌려줬다 (화면은 2026-09-23 부터 그리지 않았다).
--   3. attendance_term_summary(기수) — 앱은 더 부르지 않지만(2026-10-01 한눈에 보기로 바뀜) 조교가 부를 수 있었고 phone 을 돌려줬다.
-- 그 밖에 조교가 읽는 표 · 부르는 함수에는 학생 개인정보 칸이 없다 (교재주문의 받는 사람 연락처 · 주소는 배송에 필요해 둔다 — Alan).
--
-- 그래서:
--   1. profiles 조회는 본인 · 강사 · 관리자만. 조교에게 열린 여섯 화면의 이름은 **이름 · 등급만 주는 함수**(profile_names)로 읽는다.
--   2. 숙제점검 과목 탭의 강사 이름(RC · 이영수)은 subject_instructors 로.
--   3. 등업 검토의 "한 학생의 계정 둘" 대조(이름 · 전화번호가 같은 계정, 2026-10-02)는 verification_twins 가 DB 안에서 한다 — 번호는 밖으로 나가지 않는다.
--   4. 출석 함수 둘에서 phone 칸을 뺀다 (돌려주는 칸이 바뀌면 create or replace 가 안 되어 drop → create, 본문은 그대로).
-- 정책 이름은 마이그레이션을 순서대로 재생해 지금 살아 있는 이름을 확인했다 (없는 정책을 drop 하면 배포가 통째로 실패한다).

-- ─── 1. profiles 조회 — 본인 · 강사 · 관리자만 ─────────────────────────────────
-- 조교 갈래를 다시 넣지 말 것 — 남의 행을 열면 모든 칸이 같이 열린다. 조교 화면에 이름이 필요하면 profile_names 를 쓴다.
-- (강사 · 관리자가 테스트 등급을 켜면 is_staff() 가 거짓이라 본인 행만 보인다 — 예전과 같다)
drop policy "profiles: 본인·스태프·조교 조회" on public.profiles;
create policy "profiles: 본인·스태프 조회" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select private.is_staff()));

-- ─── 2. 조교 화면의 이름 — 이름 · 등급만 ────────────────────────────────────────
-- 등업 로그 · 교재주문 · 스터디 신청자 · 숙제점검 · 불라방 링크가 학생 이름 · 점검한 사람 · 담당 강사 · 스위치를 바꾼 사람을 이걸로 읽는다.
-- 강사 · 관리자도 같은 화면에서 같은 함수를 쓴다 (화면 길이 하나). 전화번호 · 대학 · 학과 · 성별 · 사진은 주지 않는다.
create or replace function public.profile_names(p_ids uuid[])
returns table (user_id uuid, name text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_crew() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, p.role::text
    from public.profiles p
   where p.id = any(p_ids);
end;
$$;

revoke all on function public.profile_names(uuid[]) from public, anon;
grant execute on function public.profile_names(uuid[]) to authenticated;

comment on function public.profile_names(uuid[]) is
  '강사·관리자·조교 화면의 사람 이름 (2026-10-03 — 조교는 profiles 를 못 읽는다). 이름 · 등급만 준다';

-- ─── 3. 숙제점검 과목 탭의 강사 이름 ─────────────────────────────────────────────
-- 강사는 과목으로 고정이라(profiles.subject: 이혜영 lc · 이영수 rc) 과목 탭에 이름을 붙인다 (2026-09-22). 이름 · 과목만 준다.
create or replace function public.subject_instructors()
returns table (subject text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_crew() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select p.subject, p.name
    from public.profiles p
   where p.subject in ('lc', 'rc')
     and p.merged_into is null
   order by p.subject, p.name;
end;
$$;

revoke all on function public.subject_instructors() from public, anon;
grant execute on function public.subject_instructors() to authenticated;

comment on function public.subject_instructors() is
  '숙제점검 과목 탭의 강사 이름 (강사·관리자·조교). 과목 · 이름만 준다 (2026-10-03)';

-- ─── 4. 등업 검토 — 같은 수강증을 올린 다른 계정이 같은 사람인가 ─────────────────────
-- 같은 파일(file_hash) · 같은 초 캡처(parsed.capturedAt)를 다른 계정이 올렸을 때, 그 계정이 **이름 · 전화번호가 같으면** 돌려쓰기가 아니라
-- 한 학생의 계정 둘이다 (2026-10-02 운영 점검). 그 대조를 화면이 번호를 읽어서 하던 것을 DB 안에서 한다 — 조교는 번호를 못 읽는다.
-- 찾는 범위는 업로드 때 남긴 신호(candidates.flags)를 따른다 — 신호가 없으면 찾지 않는다 (화면이 하던 그대로).
-- 아무 계정 둘이나 견줄 수 있는 함수로 만들지 않았다 — 수강증 한 건만 받으므로 "이 두 사람 번호가 같나" 를 아무에게나 물을 수 없다.
create or replace function public.verification_twins(p_id bigint)
returns table (user_id uuid, same_person boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_hash text;
  v_capture text;
  v_name text;
  v_phone text;
begin
  if not private.is_crew() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select ev.user_id,
         case when ev.candidates -> 'flags' -> 'duplicateImage' = 'true'::jsonb then ev.file_hash end,
         case when ev.candidates -> 'flags' -> 'sameCapture' = 'true'::jsonb and jsonb_typeof(ev.parsed -> 'capturedAt') = 'string'
              then ev.parsed ->> 'capturedAt' end
    into v_user, v_hash, v_capture
    from public.enrollment_verifications ev
   where ev.id = p_id;
  if v_user is null or (v_hash is null and v_capture is null) then
    return;
  end if;

  select regexp_replace(coalesce(p.name, ''), '\s', '', 'g'), regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')
    into v_name, v_phone
    from public.profiles p
   where p.id = v_user;

  return query
  select t.uid,
         coalesce(v_name, '') <> '' and coalesce(v_phone, '') <> ''
           and regexp_replace(coalesce(o.name, ''), '\s', '', 'g') = v_name
           and regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') = v_phone
    from (
      select distinct e.user_id as uid
        from public.enrollment_verifications e
       where e.user_id <> v_user
         and ((v_hash is not null and e.file_hash = v_hash)
           or (v_capture is not null and e.parsed ->> 'capturedAt' = v_capture))
    ) t
    left join public.profiles o on o.id = t.uid;
end;
$$;

revoke all on function public.verification_twins(bigint) from public, anon;
grant execute on function public.verification_twins(bigint) to authenticated;

comment on function public.verification_twins(bigint) is
  '등업 검토: 같은 수강증(같은 파일 · 같은 초 캡처)을 올린 다른 계정과 이름·전화번호가 같은지 (강사·관리자·조교). 번호는 돌려주지 않는다 (2026-10-03)';

-- ─── 5. 출석 명단 — phone 칸을 뺀다 ────────────────────────────────────────────
-- 본문은 20260922113000 그대로이고 p.phone 만 뺐다. 화면(출석 · 결석 알림)은 원래 번호를 쓰지 않는다.
drop function public.attendance_roster(date);
create function public.attendance_roster(p_date date)
returns table (
  section_id bigint, course_name text, target_score integer, track text, time_block text,
  student_id uuid, student_name text, tester boolean, status text,
  check_in_at timestamptz, check_out_at timestamptz, late boolean, decided_note text, decided_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_crew() then
    raise exception 'forbidden';
  end if;
  return query
  select s.id, c.name, c.target_score, s.track, s.time_block,
         p.id, p.name,
         (p.test_role is not null or p.role in ('instructor', 'admin', 'assistant')),
         st.status, st.check_in_at, st.check_out_at, coalesce(st.late, false), st.decided_note, dp.name
    from public.session_dates d
    join public.class_sections s on s.id = d.section_id
    join public.courses c on c.id = s.course_id
    join public.enrollments e on e.section_id = s.id and e.status = 'active' and e.mode = 'onsite'
    join public.enrollment_orders o on o.id = e.order_id
     and o.status in ('active', 'expired') and o.activates_on <= p_date and p_date <= o.access_until
    join public.profiles p on p.id = e.student_id
    left join public.attendance_stamps st on st.student_id = p.id and st.section_id = s.id and st.class_date = p_date
    left join public.profiles dp on dp.id = st.decided_by
   where d.date = p_date
     and d.date between s.enrollment_opens_at and s.closes_at
     and not s.recorded
   order by s.time_block, c.target_score, s.track, p.name;
end;
$$;

revoke all on function public.attendance_roster(date) from public, anon;
grant execute on function public.attendance_roster(date) to authenticated;

-- ─── 6. 기수별 출석 현황 — phone 칸을 뺀다 ───────────────────────────────────────
-- 앱은 더 부르지 않지만(한눈에 보기 attendance_term_board 가 같은 규칙으로 센다 — 그 함수의 설명이 이 함수를 가리킨다) 남겨 둔다.
-- 본문은 20260922113000 그대로이고 p.phone 만 뺐다.
drop function public.attendance_term_summary(bigint);
create function public.attendance_term_summary(p_term_id bigint)
returns table (
  student_id uuid, student_name text, tester boolean, sections text,
  classes integer, present integer, late integer, in_only integer, absent integer, missing integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone 'Asia/Seoul';
begin
  if not private.is_crew() then
    raise exception 'forbidden';
  end if;
  return query
  with enr as (
    -- 반에 들어온 날(배정일, KST)부터 센다 — 개강 뒤에 등록한 학생에게 등록 전 수업을 미출석으로 세지 않는다.
    -- 수업 시간이 없는 반(time_block 을 읽을 수 없음)은 찍을 수 없어(attendance_sessions 가 뺀다) 여기서도 뺀다
    select distinct e.student_id, s.id as section_id, s.time_block, s.closes_at,
           greatest(s.enrollment_opens_at, (e.created_at at time zone 'Asia/Seoul')::date) as counts_from,
           concat_ws(' ', c.name, case s.track when 'mwf' then '월수금' else '화목금' end, s.time_block) as label
      from public.enrollments e
      join public.class_sections s on s.id = e.section_id
      join public.courses c on c.id = s.course_id
     where s.term_id = p_term_id
       and e.status = 'active'
       and e.mode = 'onsite'
       and not s.recorded
       and private.time_block_end(s.time_block) is not null
  ),
  past as (
    select en.student_id, en.section_id, d.date
      from enr en
      join public.session_dates d on d.section_id = en.section_id
     where d.date between en.counts_from and en.closes_at
       and d.date + private.time_block_end(en.time_block) + interval '30 minutes' <= v_now
  ),
  per as (
    select en.student_id, string_agg(distinct en.label, ' / ') as sections
      from enr en
     group by en.student_id
  ),
  cnt as (
    select pa.student_id,
           count(*)::int                                                  as classes,
           (count(*) filter (where st.status in ('out', 'manual')))::int  as present,
           (count(*) filter (where st.late))::int                          as late,
           (count(*) filter (where st.status = 'in'))::int                 as in_only,
           (count(*) filter (where st.status = 'absent'))::int             as absent,
           (count(*) filter (where st.id is null))::int                    as missing
      from past pa
      left join public.attendance_stamps st
        on st.student_id = pa.student_id and st.section_id = pa.section_id and st.class_date = pa.date
     group by pa.student_id
  )
  select p.id, p.name,
         (p.test_role is not null or p.role in ('instructor', 'admin', 'assistant')),
         per.sections,
         coalesce(cnt.classes, 0), coalesce(cnt.present, 0), coalesce(cnt.late, 0),
         coalesce(cnt.in_only, 0), coalesce(cnt.absent, 0), coalesce(cnt.missing, 0)
    from per
    join public.profiles p on p.id = per.student_id
    left join cnt on cnt.student_id = per.student_id
   order by p.name;
end;
$$;

revoke all on function public.attendance_term_summary(bigint) from public, anon;
grant execute on function public.attendance_term_summary(bigint) to authenticated;
