-- 2026-10-02 Alan — 학생 관리의 "반 배정 추가" 가 9월 수업이 다 끝났는데(마지막 수업 10/1, 종강 10/3) 9월 반을 먼저 보여 줬다.
-- 이제 그 칸은 **다음 수업이 남아 있는 기수**를 기본으로 고르는데, 그러려면 수업일을 읽어야 한다.
-- 조교도 반 배정을 하므로(2026-09-19 Alan "조교가 등업관리를 다 한다") 조교에게도 수업일 **조회만** 연다.
-- 이 표는 기수 · 날짜 · 트랙뿐이라 개인정보가 없다. 등록 · 삭제는 그대로 스태프만 (정책 "스태프 등록" · "스태프 삭제").
-- is_staff() 를 넓히지 않고 조교에게 열 자리에만 is_crew() 를 쓴다 (CLAUDE.md 등급 체계 2).
create policy "term_class_dates: 조교 조회" on public.term_class_dates
  for select to authenticated using ((select private.is_crew()));
