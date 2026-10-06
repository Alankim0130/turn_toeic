-- ============================================================================
-- 검증용 시험 계정 둘 지우기 (2026-10-06 Alan — "응 지워줘").
--
-- 2026-10-02 에 기능을 확인하려고 만든 계정 둘(검증예비불라방 · 검증예비현장 — 받을 수 없는 @example.com 주소 · 지어낸 번호)이
-- 학생명단에 10월 예비등록생으로 남았다. 10/6 개강으로 등록생이 되면서 대시보드 인원 · 출석 명단 · 결석 알림 대상에 섞인다.
--   * **이메일(gtest-…@example.com)과 이름이 둘 다 맞고 학생 쪽 등급인 계정만** 지운다 — 같은 이름의 진짜 학생이 생겨도 건드리지 않는다.
--     둘을 넘게 찾으면(모양이 예상과 다르면) 지우지 않는다.
--   * auth.users 를 지우면 profiles 와 그 계정의 수강증 기록 · 등록 · 반 배정 · 알림 · 교재주문 · 출석이 함께 지워지고(on delete cascade),
--     문의는 남고 계정 칸만 빈다 — 대시보드의 Delete user 와 같다 (로컬 재생 DB 로 확인).
--   * 지우지 못해도 배포를 막지 않는다 — 알림만 남기고, 그때는 Supabase → Authentication → Users 에서 지운다. 다시 돌려도 같다.
-- ============================================================================

do $$
declare
  v_ids uuid[];
  n     int;
begin
  select array_agg(u.id) into v_ids
    from auth.users u
    join public.profiles p on p.id = u.id
   where lower(u.email) like 'gtest-%@example.com'
     and p.name in ('검증예비불라방', '검증예비현장')
     and p.role in ('member', 'student', 'alumni');

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise notice '지울 시험 계정이 없다 (이미 지웠다)';
    return;
  end if;
  if array_length(v_ids, 1) > 2 then
    raise notice '시험 계정 모양이 %개라 지우지 않았다 — 둘이어야 한다', array_length(v_ids, 1);
    return;
  end if;

  delete from auth.users where id = any (v_ids);
  get diagnostics n = row_count;
  raise notice '시험 계정 %개를 지웠다', n;
exception when others then
  raise notice '시험 계정을 지우지 못했다 (%) — 대시보드에서 지운다', sqlerrm;
end $$;
