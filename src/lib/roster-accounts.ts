/**
 * 명단에 누가 서나 — **강사 · 관리자 계정은 빼고, 조교 계정은 넣되 `조교` 라고 표시한다** (2026-10-16 Alan — "명단에서 강사랑 관리자는 제외하고
 * 수업이 설정되어 있는 조교는 조교라고 표시도 부탁해").
 *
 * 반에 배정된 강사 · 관리자 계정은 학생 화면을 보려고 넣은 테스트 배정이다 (테스터 — 도메인 규칙 3). 조교는 반에 배정돼 있으면 명단에 선다.
 * 2026-10-08 ~ 10-15 에는 숙제 미제출 명단 · 학생명단 반별 명단이 조교까지 뺐고(10-08 Alan 은 "강사계정과 관리자 계정" 만 빼 달라고 했다),
 * 출석 명단은 셋 모두를 `테스터` 로 맨 아래에 세웠다 — 그날 한 규칙으로 맞췄다.
 *
 * 쓰는 곳: 학생명단 반별 · 레벨별 명단(화면 · PDF · Word — 이름 뒤 `(조교)`) · 숙제 미제출 명단 · 출석 명단(날짜별 · 한눈에 보기 · 결석 알림 —
 * DB 함수 `attendance_roster` · `attendance_term_board` 가 같은 집합을 본다, 마이그레이션 20261016100000). 학생명단 등록생 수(`getRosterSets`) ·
 * 대시보드 등록생 위젯(`course-headcount`)은 처음부터 강사 · 관리자만 뺐다 (조교는 센다).
 * **진짜 등급(profiles.role)으로 본다** — 테스트 등급(test_role)은 강사 · 관리자만 가질 수 있다 (DB check).
 */

/** 명단에서 빼는 등급 — 강사 · 관리자 */
export const ROSTER_HIDDEN_ROLES = ["instructor", "admin"] as const;

/** 명단에서 빼는 계정인가 (강사 · 관리자) */
export const hiddenFromRoster = (role: string | null | undefined): boolean => (ROSTER_HIDDEN_ROLES as readonly string[]).includes(role ?? "");

/** 조교 계정인가 — 명단에 서되 `조교` 표시가 붙는다 */
export const isAssistantAccount = (role: string | null | undefined): boolean => role === "assistant";

/** 이름 옆 · 이름 뒤에 붙는 글자 */
export const ASSISTANT_MARK = "조교";
