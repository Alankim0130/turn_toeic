-- ============================================================================
-- 인수인계 체크리스트의 체크 칸 (2026-10-04 Alan — "햄버거 메뉴에서 인수인계 안보여" → 사이트 관리자 메뉴 `운영 → 인수인계`)
--
--   * 내용은 저장소의 docs/HANDOVER.md 이고 화면(/admin/handover)이 그 파일을 그린다. 이 표는 **어느 항목을 누가 언제 끝냈나** 만 적는다.
--     항목은 문서의 번호(`0-1` · `3-B` …)로 가리킨다 — 문서에서 번호를 바꾸면 그 칸의 체크는 화면에서 사라진다(행은 남는다).
--   * 강사·관리자만 읽고 쓴다 (조교는 아니다 — 관리자 화면 여섯 가지만 연다, CLAUDE.md 등급 체계 9-1).
--     인수자는 2단계에서 관리자가 된 뒤부터 같은 체크를 본다.
--   * 누가 · 언제는 트리거가 적는다 — 화면이 보낸 값을 믿지 않는다 (feature_flags 와 같은 규칙).
--     이름은 체크한 때의 이름을 그대로 남긴다 — 넘겨주는 사람의 계정을 나중에 지워도 "누가 끝냈나" 가 남게.
--   * 체크를 풀면 행을 지운다.
-- ============================================================================

create table if not exists public.handover_checks (
  item         text primary key check (item ~ '^[0-9]{1,2}-[0-9A-Z]{1,2}$'),
  checked_by   uuid references public.profiles (id) on delete set null,
  checked_name text,
  checked_at   timestamptz not null default now()
);

comment on table public.handover_checks is '인수인계 체크리스트(docs/HANDOVER.md)에서 끝낸 항목. item = 문서의 항목 번호. 강사·관리자만 (2026-10-04)';

create or replace function private.tg_handover_checks_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.checked_by := auth.uid();
  new.checked_name := private.my_profile_name();
  new.checked_at := now();
  return new;
end;
$$;

revoke execute on function private.tg_handover_checks_stamp() from public, anon, authenticated;

drop trigger if exists handover_checks_stamp on public.handover_checks;
create trigger handover_checks_stamp
  before insert on public.handover_checks
  for each row execute function private.tg_handover_checks_stamp();

alter table public.handover_checks enable row level security;

-- 넣을 때는 항목 번호만 — 누가 · 언제는 위 트리거가 채운다
grant select, delete on public.handover_checks to authenticated;
grant insert (item) on public.handover_checks to authenticated;
grant all on public.handover_checks to service_role;

create policy "handover_checks: 스태프 조회" on public.handover_checks
  for select to authenticated using ((select private.is_staff()));
create policy "handover_checks: 스태프 체크" on public.handover_checks
  for insert to authenticated with check ((select private.is_staff()));
create policy "handover_checks: 스태프 체크 풀기" on public.handover_checks
  for delete to authenticated using ((select private.is_staff()));
