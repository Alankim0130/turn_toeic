-- ============================================================================
-- 인쇄용 출석 QR (2026-09-21 Alan — "QR을 A5 크기로 2개 해서 A4로 인쇄할 수 있도록 디자인해서 만들어줘. 힉스필드로 제작부탁해!")
--
--   교실 화면의 QR 은 30초마다 바뀌어 종이에 인쇄할 수 없다 (인쇄하면 2분 뒤 쓸모가 없다).
--   그래서 **바뀌지 않는 인쇄용 토큰** 을 따로 둔다 — 첫토익의 벽 QR 포스터와 같다.
--   * 종이 QR 은 **사진을 찍어 보내면 교실 밖에서도 찍힌다** — 첫토익 문서 5.4 가 말한 정적 QR 의 한계다.
--     그래도 수업 시간 창(시작 30분 전 ~ 끝) · 현장 수강생 배정 · 30분 체류 규칙은 그대로 막는다.
--   * 새어 나가면 강사·관리자가 **새로 뽑는다** (public.rotate_attendance_poster) — 그 순간 옛 종이는 모두 무효, 다시 인쇄한다.
--   * 30초 화면(/admin/attendance/qr)은 그대로 둔다 — 더 엄격하게 쓰고 싶을 때의 길.
--   * 종이로 찍은 기록은 method = 'poster' 로 남긴다 (나중에 어떤 길로 찍었는지 가릴 수 있게).
-- ============================================================================

-- ─── 1. 인쇄용 토큰 (한 줄) ────────────────────────────────────────────────
create table if not exists private.attendance_poster (
  id         boolean primary key default true check (id),
  token      text not null,             -- 20자 16진수. 30초 토큰(12자)·코드(6자리)와 모양이 달라 섞이지 않는다
  created_at timestamptz not null default now(),
  created_by uuid
);

insert into private.attendance_poster (id, token)
values (true, upper(encode(extensions.gen_random_bytes(10), 'hex')))
on conflict (id) do nothing;

revoke all on table private.attendance_poster from public, anon, authenticated;

comment on table private.attendance_poster is
  '인쇄용 출석 QR 토큰 (2026-09-21). 새로 뽑으면 옛 종이는 무효 — public.rotate_attendance_poster';

-- ─── 2. 찍은 방법에 poster 를 더한다 ──────────────────────────────────────
-- 이름을 찍어 지우면 이름이 다를 때 조용히 지나가고 옛 제약이 그대로 막는다 — 정의로 찾아 지운다
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.attendance_stamps'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%method%'
  loop
    execute format('alter table public.attendance_stamps drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.attendance_stamps
  add constraint attendance_stamps_method_check
  check (method is null or method in ('qr', 'code', 'manual', 'poster'));

-- ─── 3. 인쇄 화면용: 지금 토큰 (강사·관리자·조교) · 새로 뽑기 (강사·관리자) ──
create or replace function public.attendance_poster_token()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if not private.is_crew() then
    raise exception 'forbidden';
  end if;
  select p.token, p.created_at into r from private.attendance_poster p where p.id;
  return jsonb_build_object('token', r.token, 'created_at', r.created_at);
end;
$$;

create or replace function public.rotate_attendance_poster()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'forbidden';
  end if;
  update private.attendance_poster
     set token      = upper(encode(extensions.gen_random_bytes(10), 'hex')),
         created_at = now(),
         created_by = (select auth.uid())
   where id;
  return public.attendance_poster_token();
end;
$$;

revoke all on function public.attendance_poster_token() from public, anon;
revoke all on function public.rotate_attendance_poster() from public, anon;
grant execute on function public.attendance_poster_token() to authenticated;
grant execute on function public.rotate_attendance_poster() to authenticated;

-- ─── 4. 출석 판정이 인쇄용 토큰도 받는다 (20260921130500 과 같고 토큰 확인만 다르다) ──
create or replace function public.attendance_scan(p_token text, p_method text default 'qr')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_now    timestamptz := now();
  v_kst    timestamp := now() at time zone 'Asia/Seoul';
  v_today  date := private.today_kst();
  v_step   bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_in     text := upper(regexp_replace(coalesce(p_token, ''), '[^0-9A-Za-z]', '', 'g'));
  v_method text := case when p_method = 'code' then 'code' else 'qr' end;
  v_open   record;
  v_target record;
  v_next   timestamp;
  v_label  text;
  v_stay   int;
  v_id     bigint;
  v_late   boolean;
begin
  if v_uid is null then
    return jsonb_build_object('action', 'login_required');
  end if;

  -- 틀린 코드를 10분에 10번 넣으면 잠시 막는다 (6자리를 맞혀 보는 것을 막는다)
  if (select count(*) from public.attendance_events ev
       where ev.student_id = v_uid and ev.kind = 'reject' and ev.result = 'bad_token' and ev.created_at > v_now - interval '10 minutes') >= 10 then
    return jsonb_build_object('action', 'too_many');
  end if;

  -- 인쇄용 QR(바뀌지 않는다) 이거나, 지금 칸과 앞 세 칸(2분)의 화면 토큰·코드
  if v_in <> '' and v_in = (select p.token from private.attendance_poster p where p.id) then
    v_method := 'poster';
  elsif v_in = '' or not exists (
    select 1
      from generate_series(v_step - 3, v_step) as g(step)
      cross join lateral private.attendance_token(g.step) t
     where t.token = v_in or t.code = v_in
  ) then
    insert into public.attendance_events (student_id, kind, method, result) values (v_uid, 'reject', v_method, 'bad_token');
    return jsonb_build_object('action', 'bad_token');
  end if;

  -- 오늘 교실에 올 반이 없으면 왜 없는지 알려 준다
  if not exists (select 1 from private.attendance_sessions(v_uid, v_today)) then
    return jsonb_build_object('action',
      case
        when exists (
          select 1 from public.enrollments e
            join public.enrollment_orders o on o.id = e.order_id
            join public.session_dates d on d.section_id = e.section_id and d.date = v_today
           where e.student_id = v_uid and e.status = 'active' and o.status = 'active' and e.mode = 'live') then 'live_student'
        when exists (
          select 1 from public.enrollments e
            join public.enrollment_orders o on o.id = e.order_id
            join public.class_sections s on s.id = e.section_id
            join public.session_dates d on d.section_id = s.id and d.date = v_today
           where e.student_id = v_uid and e.status = 'active' and o.status = 'active' and s.recorded) then 'recorded_day'
        when exists (select 1 from public.enrollment_orders o where o.user_id = v_uid and o.status = 'preliminary') then 'not_started'
        else 'no_class_today'
      end);
  end if;

  -- ① 퇴실: 오늘 입실만 한 기록 — 그 반 수업이 끝나고 30분까지
  select st.id, st.section_id, st.check_in_at, x.label
    into v_open
    from public.attendance_stamps st
    join private.attendance_sessions(v_uid, v_today) x on x.section_id = st.section_id
   where st.student_id = v_uid
     and st.class_date = v_today
     and st.status = 'in'
     and v_kst <= x.ends + interval '30 minutes'
   order by st.check_in_at desc
   limit 1;
  if found then
    v_stay := floor(extract(epoch from (v_now - v_open.check_in_at)) / 60)::int;
    if v_stay < 30 then
      return jsonb_build_object('action', 'already_in', 'label', v_open.label,
                                'at', to_char(v_open.check_in_at at time zone 'Asia/Seoul', 'HH24:MI'), 'stay', v_stay);
    end if;
    update public.attendance_stamps
       set status = 'out', check_out_at = v_now, updated_at = v_now
     where id = v_open.id and status = 'in';
    if not found then
      return jsonb_build_object('action', 'already_done', 'label', v_open.label);
    end if;
    insert into public.attendance_events (student_id, section_id, class_date, kind, method, result)
    values (v_uid, v_open.section_id, v_today, 'exit', v_method, 'check_out');
    return jsonb_build_object('action', 'check_out', 'label', v_open.label, 'at', to_char(v_kst, 'HH24:MI'), 'stay', v_stay);
  end if;

  -- ② 입실: 수업 시작 30분 전 ~ 끝, 아직 도장이 없는 반 중 가장 이른 것
  select x.section_id, x.label, x.starts, x.ends
    into v_target
    from private.attendance_sessions(v_uid, v_today) x
   where v_kst between x.starts - interval '30 minutes' and x.ends
     and not exists (
       select 1 from public.attendance_stamps st
        where st.student_id = v_uid and st.section_id = x.section_id and st.class_date = v_today)
   order by x.starts
   limit 1;
  if not found then
    select x.label into v_label
      from private.attendance_sessions(v_uid, v_today) x
      join public.attendance_stamps st on st.student_id = v_uid and st.section_id = x.section_id and st.class_date = v_today
     where v_kst between x.starts - interval '30 minutes' and x.ends + interval '30 minutes'
     limit 1;
    if v_label is not null then
      return jsonb_build_object('action', 'already_done', 'label', v_label);
    end if;
    select min(x.starts) into v_next
      from private.attendance_sessions(v_uid, v_today) x
     where x.starts - interval '30 minutes' > v_kst;
    if v_next is not null then
      return jsonb_build_object('action', 'too_early', 'opens', to_char(v_next - interval '30 minutes', 'HH24:MI'));
    end if;
    return jsonb_build_object('action', 'class_over');
  end if;

  v_late := v_kst > v_target.starts + interval '7 minutes';
  insert into public.attendance_stamps (student_id, section_id, class_date, status, check_in_at, late, method)
  values (v_uid, v_target.section_id, v_today, 'in', v_now, v_late, v_method)
  on conflict (student_id, section_id, class_date) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('action', 'already_done', 'label', v_target.label);
  end if;
  insert into public.attendance_events (student_id, section_id, class_date, kind, method, result)
  values (v_uid, v_target.section_id, v_today, 'enter', v_method, case when v_late then 'late' else 'check_in' end);

  return jsonb_build_object('action', 'check_in', 'label', v_target.label, 'at', to_char(v_kst, 'HH24:MI'),
                            'late', v_late, 'starts', to_char(v_target.starts, 'HH24:MI'), 'ends', to_char(v_target.ends, 'HH24:MI'));
end;
$$;

comment on function public.attendance_scan(text, text) is
  'QR·코드·인쇄용 QR 로 입실/퇴실. 토큰(화면 2분 · 인쇄용은 새로 뽑기 전까지)·배정·시각을 서버가 판정한다';

revoke all on function public.attendance_scan(text, text) from public, anon;
grant execute on function public.attendance_scan(text, text) to authenticated;
