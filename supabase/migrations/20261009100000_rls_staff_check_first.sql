-- 조회 정책에서 "스태프인가" 를 맨 앞으로 (2026-10-09 Alan "숙제미제출 알림 페이지를 클릭하면 로딩시간이 오래걸려").
--
-- 수업일 표(session_dates)의 조회 정책이 행마다 "이 반을 듣나(has_section_access)" · "저녁 반 다시보기인가(has_recorded_replay_access)" ·
-- "예비등록생 내 반인가(has_section_schedule_access)" 를 먼저 묻고 **맨 끝에서야** "조교 이상인가(is_crew)" 를 물었다.
-- 앞의 셋은 행마다 조회를 하는 함수라, 강사 · 관리자 · 조교가 한 달 수업일(반 38개 · 353줄)을 읽으면
-- 행마다 1ms 가까이 들어 숙제 미제출 알림 화면 하나에 0.85초가 갔다 (운영 크기로 채운 재생 DB 실측 — 줄 0.38초 + 개수 0.47초).
-- "조교 이상인가" 는 요청마다 한 번만 계산되는(InitPlan) 값이라 맨 앞에 두면 강사 · 관리자 · 조교는 행마다의 함수를 건너뛴다.
--
-- **누가 무엇을 보는지는 하나도 바뀌지 않는다** — OR 의 순서만 바꿨다. 예비등록생 정책에 넣은 is_crew 는 수강생·스태프·조교 정책이 이미 열어 주는 것이라
-- 두 정책을 합친 결과(허용 정책은 OR 로 합쳐진다)가 같다. 거기에도 넣은 까닭: 허용 정책을 합치는 순서는 Postgres 가 정해서
-- (재생 DB 에서는 예비등록생 정책이 먼저 섰다) 한쪽에만 두면 다른 쪽의 행마다 함수가 여전히 먼저 돈다.
-- 상시 불라방 링크(section_live_links)의 조회 정책도 같은 모양(스태프가 끝)이라 함께 바꿨다.
-- 다른 표의 조회 정책은 이미 스태프 확인이 앞이다 (class_notices · replays · session_live_links · study_materials — 2026-10-09 확인).

drop policy "session_dates: 수강생·스태프·조교 조회" on public.session_dates;
create policy "session_dates: 수강생·스태프·조교 조회" on public.session_dates
  for select to authenticated
  using (
    (select private.is_crew())
    or (select private.has_section_access(section_id))
    or (select private.has_recorded_replay_access(section_id))
  );

-- 20261002210000 에서 만든 정책 — create 가 두 줄이라 마이그레이션 테스트가 이름을 못 따라가서 if exists 로 쓴다 (운영에는 있다)
drop policy if exists "session_dates: 예비등록생 내 반 일정 조회" on public.session_dates;
create policy "session_dates: 예비등록생 내 반 일정 조회" on public.session_dates
  for select to authenticated
  using (
    (select private.is_crew())
    or (select private.has_section_schedule_access(section_id))
  );

drop policy "live_links: 수강생·스태프 조회" on public.section_live_links;
create policy "live_links: 수강생·스태프 조회" on public.section_live_links
  for select to authenticated
  using (
    (select private.is_staff())
    or (select private.has_section_access(section_id))
  );
