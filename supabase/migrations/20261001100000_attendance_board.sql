-- 출석 한눈에 보기 · 내 출석 달력 · 결석 알림 (2026-10-01 Alan)
--
-- "이걸 하는 진짜 이유는 두가지가 있어. 1. 강사들이 지각생들과 결석생들을 알아보고 관리를 해주기 위함
--  2. 학생들이 스스로 출석을 계속 하고 있다는 걸 알고 뿌듯함을 느끼게 해주기 위함.
--  즉, 강사모드에서 학생들 출결상태를 편하게 볼 수 있으면 좋겠어. 나아가서 결석한 학생들에게는 전체 알림 메시지를 보낼 수 있도록 …
--  그리고 학생들도 본인이 출석을 잘 하고 있는지 확인 할 수 있는 공간이 따로 마련되면 좋겠어!"
-- "우리의 모든 세팅은 강사가 설정한 개강일과 종강일을 기준선으로 권한과 기록이 시작되고 종료되도록 설계되어있어.
--  따라서 해당 출석같은 경우도 해당달의 종강일이 되면 모두 사라지고, 다음달의 개강일에 맞춰서 새로운 수강생들로 자동으로 매번 바꿔야해"
--
-- 1. public.attendance_term_board(기수) — 강사·관리자·조교. 그 기수의 현장 수강생마다 한 줄, 수업일마다 한 칸(days jsonb).
--    세는 규칙은 attendance_term_summary(20260922113000)와 같다: 반에 들어온 날(배정일, KST)부터 · 그 반의 종강일까지 ·
--    현장(onsite)만 · 인강 반 제외 · 시간을 못 읽는 반 제외 · "끝난 수업" = 끝나고 30분(퇴실 마감)이 지난 회차.
--    한 사람이 한 줄이라 방학에 600명이어도 PostgREST 1,000줄 상한에 걸리지 않는다 (칸마다 한 줄로 펴면 만 줄이 넘는다).
-- 2. public.my_attendance_days() — 학생 본인(auth.uid()). **지금 기수와 아직 시작하지 않은 기수**의 내 수업일마다 한 줄.
--    종강일이 지난 기수는 내려 주지 않는다 — 그래서 종강일이 지나면 내 출석 화면에서 사라지고 다음 기수로 새로 쌓인다
--    (기록 자체는 attendance_stamps 에 그대로 남는다). 화면은 지금 기수가 있으면 그것을, 없으면 가장 가까운 다음 기수를 보여 준다.
--    세는 규칙은 my_attendance_summary 와 같다 (출석률 카드와 달력이 같은 날을 센다).
-- 3. 학생 알림함 종류에 attendance(결석 안내)를 더한다 — 강사가 출석 화면에서 결석·미출석 학생에게 보낸다.
--    보내는 길은 예전과 같다: 로그인한 스태프 세션으로 넣고 정책 "student_messages: 스태프 발송"(is_staff)이 한 번 더 막는다.

-- ─── 1. 기수 출석 한눈에 보기 (강사·관리자·조교) ─────────────────────────────
create or replace function public.attendance_term_board(p_term_id bigint)
returns table (student_id uuid, student_name text, tester boolean, section_ids bigint[], days jsonb)
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
    -- attendance_term_summary 와 같은 반·같은 시작일 (배정일부터 센다 — 개강 뒤에 들어온 학생에게 그 전 수업은 내 수업이 아니다)
    select distinct e.student_id, s.id as section_id, s.time_block, s.closes_at,
           greatest(s.enrollment_opens_at, (e.created_at at time zone 'Asia/Seoul')::date) as counts_from
      from public.enrollments e
      join public.class_sections s on s.id = e.section_id
     where s.term_id = p_term_id
       and e.status = 'active'
       and e.mode = 'onsite'
       and not s.recorded
       and private.time_block_end(s.time_block) is not null
  ),
  dd as (
    select en.student_id, en.section_id, d.date,
           d.date + private.time_block_end(en.time_block) + interval '30 minutes' <= v_now as done
      from enr en
      join public.session_dates d on d.section_id = en.section_id
     where d.date between en.counts_from and en.closes_at
  )
  select p.id, p.name,
         (p.test_role is not null or p.role in ('instructor', 'admin', 'assistant')),
         (select array_agg(distinct en.section_id order by en.section_id) from enr en where en.student_id = p.id),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'd', dd.date,
                    's', dd.section_id,
                    'done', dd.done,
                    'st', st.status,
                    'late', coalesce(st.late, false),
                    'in', to_char(st.check_in_at at time zone 'Asia/Seoul', 'HH24:MI'),
                    'out', to_char(st.check_out_at at time zone 'Asia/Seoul', 'HH24:MI'))
                  order by dd.date, dd.section_id)
             from dd
             left join public.attendance_stamps st
               on st.student_id = dd.student_id and st.section_id = dd.section_id and st.class_date = dd.date
            where dd.student_id = p.id), '[]'::jsonb)
    from public.profiles p
   where p.id in (select en.student_id from enr en)
   order by p.name;
end;
$$;

comment on function public.attendance_term_board(bigint) is
  '기수 출석 한눈에 보기 (강사·관리자·조교). 학생마다 한 줄, days = 수업일마다 {d, s, done, st, late, in, out}. 세는 규칙은 attendance_term_summary 와 같다 (2026-10-01)';

revoke all on function public.attendance_term_board(bigint) from public, anon;
grant execute on function public.attendance_term_board(bigint) to authenticated;

-- ─── 2. 내 출석 달력 (학생 본인) ──────────────────────────────────────────────
create or replace function public.my_attendance_days()
returns table (
  term_id bigint, year integer, month integer, opens date, closes date,
  class_date date, section_id bigint, course_name text, track text, time_block text,
  done boolean, status text, late boolean, check_in_at timestamptz, check_out_at timestamptz, decided_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_today date := private.today_kst();
  v_now   timestamp := now() at time zone 'Asia/Seoul';
begin
  if v_uid is null then
    return;
  end if;
  return query
  with enr as (
    -- my_attendance_summary 와 같은 반 — 다만 아직 시작하지 않은 기수도 내려 준다 (개강 전 예비등록생에게 다음 달 수업일을 미리 보여 준다)
    select distinct s.id as section_id, s.term_id, s.track, s.time_block, s.closes_at, c.name as course_name,
           greatest(s.enrollment_opens_at, (e.created_at at time zone 'Asia/Seoul')::date) as counts_from
      from public.enrollments e
      join public.class_sections s on s.id = e.section_id
      join public.courses c on c.id = s.course_id
     where e.student_id = v_uid
       and e.status = 'active'
       and e.mode = 'onsite'
       and not s.recorded
       and v_today <= s.closes_at          -- 종강일이 지난 기수는 내려 주지 않는다
       and private.time_block_end(s.time_block) is not null
  )
  select t.id, t.year, t.month, t.enrollment_opens_at, t.closes_at,
         d.date, en.section_id, en.course_name, en.track, en.time_block,
         d.date + private.time_block_end(en.time_block) + interval '30 minutes' <= v_now,
         st.status, coalesce(st.late, false), st.check_in_at, st.check_out_at, st.decided_note
    from enr en
    join public.terms t on t.id = en.term_id
    join public.session_dates d on d.section_id = en.section_id
    left join public.attendance_stamps st
      on st.student_id = v_uid and st.section_id = en.section_id and st.class_date = d.date
   where d.date between en.counts_from and en.closes_at
   order by d.date, en.time_block;
end;
$$;

comment on function public.my_attendance_days() is
  '내 출석 달력 (학생 본인). 지금 기수 + 아직 시작 안 한 기수의 내 현장 수업일마다 한 줄. 종강한 기수는 빠진다 (2026-10-01)';

revoke all on function public.my_attendance_days() from public, anon;
grant execute on function public.my_attendance_days() to authenticated;

-- ─── 3. 학생 알림함 — 결석 안내(attendance) ───────────────────────────────────
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     rel on rel.oid = con.conrelid
      join pg_namespace ns  on ns.oid  = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'student_messages'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%contact_reply%'
  loop
    execute format('alter table public.student_messages drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.student_messages
  add constraint student_messages_kind_check
  check (kind in ('general', 'study_checkin', 'homework_checked', 'live_start', 'contact_reply', 'attendance'));

comment on column public.student_messages.kind is
  'general(그냥 알림) | study_checkin(비대면 인증 독촉) | homework_checked(숙제 점검완료) | live_start(불라방 수업 시작) | contact_reply(문의 답변) | attendance(결석 안내). 서로 다른 일이다';
