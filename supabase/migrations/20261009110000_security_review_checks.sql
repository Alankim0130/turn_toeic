-- 전체 보안 검토에서 찾은 틈을 DB 가 막는다 (2026-10-09 Alan "Lc음원 보안뿐만 아니라 전체적으로 보안 설계를 부탁해").
-- 앱이 이미 거르는 값이라도 **화면을 거치지 않고 API 로 바로 넣는 길**은 표의 check · grant 만 막는다 — 그래서 여기 둔다.
-- 길이 · 꼴 check 는 전부 `not valid` — 이미 들어온 줄은 그대로 두고 새 줄부터 본다 (옛 줄 하나 때문에 배포가 멈추지 않게).

-- ─── 1. 문의 — 비회원(anon)도 표에 바로 넣을 수 있는 유일한 쓰기 경로 ──────────────────────────────
-- 서버 액션은 이름 40 · 이메일 120 · 본문 2,000자를 보지만 표는 본문만 봤다. 전화는 앱이 숫자만 남긴다(최대 11자리).
alter table public.contact_messages
  add constraint contact_messages_name_len check (char_length(name) between 1 and 40) not valid,
  add constraint contact_messages_email_len check (email is null or char_length(email) <= 120) not valid,
  add constraint contact_messages_phone_len check (phone is null or char_length(phone) <= 20) not valid;

-- ─── 2. 프로필 — 본인이 API 로 바꿀 수 있는 칸의 길이 · 사진 경로 ─────────────────────────────────
-- 가입 · 내 정보 화면은 이름 20 · 대학 · 학과 60자를 보지만(이번에 맞췄다) 표에는 상한이 없어 몇 MB 글자도 들어갔다 — 학생명단 · 마케팅 분석 화면에 그대로 섰을 것이다.
-- 사진 경로(avatar_path)는 **본인 폴더(`{id}/…`)만** — 예전에는 아무 경로나 적을 수 있었고, 프로필 사진 지우기가 서비스 롤로 그 경로를 지워 남의 사진을 지울 수 있었다
-- (앱도 본인 세션 · 본인 폴더로 바꿨다 — src/app/my/profile/actions.ts).
alter table public.profiles
  add constraint profiles_name_len check (char_length(name) <= 40) not valid,
  add constraint profiles_phone_len check (phone is null or char_length(phone) <= 20) not valid,
  add constraint profiles_university_len check (university is null or char_length(university) <= 100) not valid,
  add constraint profiles_department_len check (department is null or char_length(department) <= 100) not valid,
  add constraint profiles_avatar_own_folder check (avatar_path is null or (avatar_path like id::text || '/%' and position('..' in avatar_path) = 0)) not valid;

-- ─── 3. 불라방 · 다시보기 링크는 http(s) 주소만 ───────────────────────────────────────────────
-- 앱(서버 액션)은 이미 http(s) 만 받지만 조교 · 강사 세션은 표에 바로 쓸 수 있다(정책). 학생 불라방 화면이 이 값을 그대로 링크로 세우므로 표가 꼴을 본다.
alter table public.session_live_links add constraint session_live_links_url_http check (live_url ~* '^https?://') not valid;
alter table public.section_live_links add constraint section_live_links_url_http check (live_url ~* '^https?://') not valid;
alter table public.replays add constraint replays_url_http check (video_url ~* '^https?://') not valid;

-- ─── 4. 수강증 판정 기록은 학생이 못 읽는다 ───────────────────────────────────────────────────
-- 학생 화면은 처음부터 candidates 를 가져오지 않았지만(src/app/my/_lib/queries.ts), 표 전체에 select 가 열려 있어 **자기 세션으로 API 를 부르면**
-- 위조 신호(같은 파일 · 같은 초 캡처 · 전에 판정된 캡처) · 자동 승인을 막은 까닭 · 꺼진 스위치였다면 거절했을 사유가 그대로 왔다 — "학생에게는 위조 의심을 말하지 않는다"(CLAUDE.md 미확정 11).
-- 이제 학생(authenticated)은 결과 · 사유 · 읽은 값 · 배정 반만 읽고, 판정 기록(candidates · ocr_raw · file_hash · confidence)은 **강사 · 관리자 · 조교 화면이 서비스 롤로** 읽는다
-- (화면마다 requireCrew/requireStaff 가 먼저다). `hold`(받아 둔 다음 달)는 학생 화면이 보여 주는 값이라 따로 칸을 두어 연다.
alter table public.enrollment_verifications
  add column hold_month integer generated always as (case when jsonb_typeof(candidates -> 'hold') = 'number' then (candidates ->> 'hold')::integer end) stored;
comment on column public.enrollment_verifications.hold_month is '받아 둔 다음 달 수강증의 달 (candidates.hold) — 학생이 읽을 수 있는 유일한 판정 칸';

revoke select on public.enrollment_verifications from authenticated;
grant select (id, user_id, file_path, created_at, result, reject_reason, parsed, matched_section, requested_section_ids, source, file_deleted_at, hold_month)
  on public.enrollment_verifications to authenticated;

-- ─── 5. 같은 수강증을 동시에 두 번 내면 확인 중 기록이 둘 생겼다 ───────────────────────────────────
-- 같은 학생 · 같은 파일의 확인 중(result 없음) 기록은 하나다. 이미 둘이면 먼저 것을 지운다 (같은 그림이라 잃는 것이 없다).
delete from public.enrollment_verifications a
  using public.enrollment_verifications b
  where a.user_id = b.user_id and a.file_path = b.file_path and a.result is null and b.result is null and a.id < b.id;
create unique index enrollment_verifications_pending_file_uq
  on public.enrollment_verifications (user_id, file_path) where result is null;
