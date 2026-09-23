-- 기수(terms)의 개강일·종강일을 고치면 그 달 반·회차·등록 기간이 **어느 길로 고쳐도** 따라온다 (2026-09-23 전수조사).
--
-- 반 편성 달력의 저장 함수(public.save_term_schedule)는 이미 private.sync_term_sections 로 반을 맞추지만,
-- terms 는 스태프에게 UPDATE 가 열려 있어(정책 "terms: 스태프 수정") SQL 편집기나 다른 화면이 terms 를 바로 고치면
-- 반의 enrollment_opens_at / closes_at 이 옛 값으로 남았다. RLS(private.has_term_access · has_section_access …)는
-- **반의 날짜**로 판정하므로 그 순간부터 기수와 권한이 어긋난다. 이제 terms 행 트리거가 같은 동기화를 한 번 더 돈다.
--
-- private.sync_section_schedule 은 반의 날짜 복사 → 회차(session_dates) 재생성 → 등록 기간(sync_order_window) 까지 이어지고,
-- 등록 상태·등급은 enrollment_orders 트리거가 날짜로 다시 정한다 (마이그레이션 20260922113000). 스태프 확인은 하지 않는다 —
-- terms 를 고칠 수 있었다면 이미 스태프(정책)이거나 서비스 롤이다. 달력 저장 안에서는 같은 동기화가 두 번 돌지만 멱등이라 해가 없다.

create or replace function private.tg_terms_sync_sections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  for v_id in select id from public.class_sections where term_id = new.id order by id loop
    perform private.sync_section_schedule(v_id);
  end loop;
  return null;
end;
$$;

drop trigger if exists terms_sync_sections on public.terms;
create trigger terms_sync_sections
  after update of enrollment_opens_at, closes_at on public.terms
  for each row
  when (old.enrollment_opens_at is distinct from new.enrollment_opens_at or old.closes_at is distinct from new.closes_at)
  execute function private.tg_terms_sync_sections();
