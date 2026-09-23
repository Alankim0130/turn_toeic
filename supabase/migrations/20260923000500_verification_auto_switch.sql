-- ============================================================================
-- 수강증 자동 판정 긴급 스위치 (2026-09-22 Alan — firsttoeic 의 feature_flags 를 옮겨 온다: "자동 승인 긴급 스위치")
--
--   * **끄면 수강증을 기계가 판정하지 않는다** — 자동 승인도 자동 거절도 멈추고 모든 수강증이 강사 검토 대기로 간다.
--     OCR 은 그대로 돌려 읽은 값·찾은 반은 승인 화면에 미리 채워 둔다 (강사가 빨리 처리하도록).
--     다음 달 반이 열릴 때 맡겨 둔 예비 접수를 다시 맞추는 일(앱 `rematchHeldVerifications`)도 승인하지 않는다.
--   * 배포 없이 강사·관리자가 /admin/verifications 에서 켜고 끈다. **조교는 상태만 본다** —
--     조교에게 열어 준 적 없는 권한이다 (CLAUDE.md 등급 체계 2 — 조교에게 열 자리에만 is_crew).
--   * **읽지 못하면 꺼진 것으로 본다** (앱 `readAutoVerify`). 멈추는 스위치라 모르면 사람이 보는 쪽이 안전하다.
--     firsttoeic 은 반대(읽기 실패 = 켜짐)인데, 그쪽 스위치는 판독 경로(서버 ↔ 기기)를 바꾸는 것이라 켜진 쪽이 정상 경로였다.
--   * 누가 언제 바꿨는지는 트리거가 적는다 — 화면이 보낸 값을 믿지 않는다.
-- ============================================================================

create table if not exists public.feature_flags (
  key        text primary key check (key ~ '^[a-z_]{1,60}$'),
  enabled    boolean not null,
  note       text check (note is null or char_length(note) <= 200),   -- 왜 껐는지 (예: "YBM 앱 화면이 바뀌어 확인 중")
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.feature_flags is '배포 없이 켜고 끄는 긴급 스위치. verification_auto = 수강증 자동 판정(자동 승인 · 자동 거절)';

insert into public.feature_flags (key, enabled) values ('verification_auto', true) on conflict (key) do nothing;

create or replace function private.tg_feature_flags_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();   -- 서버(service_role)가 바꾸면 비어 있다
  return new;
end;
$$;

revoke execute on function private.tg_feature_flags_touch() from public, anon, authenticated;

drop trigger if exists feature_flags_touch on public.feature_flags;
create trigger feature_flags_touch
  before update on public.feature_flags
  for each row execute function private.tg_feature_flags_touch();

alter table public.feature_flags enable row level security;

-- 켜고 끄기(enabled)와 까닭(note)만 바꾼다. 행은 마이그레이션이 만들고 지우지 않는다
grant select on public.feature_flags to authenticated;
grant update (enabled, note) on public.feature_flags to authenticated;
grant all on public.feature_flags to service_role;

create policy "feature_flags: 스태프·조교 조회" on public.feature_flags
  for select to authenticated using ((select private.is_crew()));
create policy "feature_flags: 스태프 수정" on public.feature_flags
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
