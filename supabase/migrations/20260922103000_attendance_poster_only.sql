-- ============================================================================
-- 출석 QR 을 인쇄용 포스터 하나로 (2026-09-22 Alan)
--   "QR 자동으로 바뀌는 거는 없애줘. 그리고 새로 만들 수 있는 기능만 넣어놓고,
--    우리가 새로 만들고 싶을 때 새로 만들기 버튼을 누르면 인쇄까지 할 수 있도록 다운로드가 있으면 좋겠어."
--
--   * 30초마다 바뀌던 교실 화면 QR(/admin/attendance/qr)과 6자리 코드 입력(/my/attendance)을 없앤다 (앱은 같은 커밋에서 뺐다).
--   * attendance_scan 은 **인쇄용 토큰(private.attendance_poster) 하나만** 받는다. 나머지 판정(수업 시간 창·현장 배정·
--     입실 30분 뒤 퇴실·지각 7분·맞지 않는 QR 10번 잠금)은 20260921150500 과 똑같다 — 토큰 확인만 바뀌었다.
--   * 새로 만들기(public.rotate_attendance_poster, 강사·관리자)는 그대로다. 누르면 옛 종이는 그 순간 모두 찍히지 않는다.
--   * 30초 토큰을 만들던 함수(private.attendance_token · public.attendance_display)와 그 비밀(Vault attendance_qr_secret)을 지운다.
--   * 기록의 method 는 이제 늘 poster. 예전 값(qr · code)은 check 제약에 남겨 둔다 — 지난 기록을 지우지 않는다.
-- ============================================================================

-- ─── 1. 출석 판정: 인쇄용 토큰만 ───────────────────────────────────────────
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
  v_in     text := upper(regexp_replace(coalesce(p_token, ''), '[^0-9A-Za-z]', '', 'g'));
  v_method text := 'poster';  -- p_method 는 예전 호출과 모양을 맞추려고 남겨 둔 것 — 쓰지 않는다
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

  -- 맞지 않는 QR 을 10분에 10번 찍으면 잠시 막는다 (옛 종이를 계속 찍거나 주소를 지어내 보는 것)
  if (select count(*) from public.attendance_events ev
       where ev.student_id = v_uid and ev.kind = 'reject' and ev.result = 'bad_token' and ev.created_at > v_now - interval '10 minutes') >= 10 then
    return jsonb_build_object('action', 'too_many');
  end if;

  -- 인쇄용 QR 토큰 하나만 받는다 (새로 만들기 전까지 바뀌지 않는다)
  if v_in = '' or v_in is distinct from (select p.token from private.attendance_poster p where p.id) then
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
  '출석 QR 포스터(인쇄용 토큰)로 입실/퇴실. 토큰·배정·시각을 서버가 판정한다 (2026-09-22 포스터 하나로)';

revoke all on function public.attendance_scan(text, text) from public, anon;
grant execute on function public.attendance_scan(text, text) to authenticated;

-- ─── 2. 30초 화면 QR 을 만들던 것들 ─────────────────────────────────────────
-- 판정 함수를 먼저 바꿨으므로 아무도 부르지 않는다 (plpgsql 은 의존을 추적하지 않아 순서를 지켜야 한다)
drop function if exists public.attendance_display();
drop function if exists private.attendance_token(bigint);

delete from vault.secrets where name = 'attendance_qr_secret';
