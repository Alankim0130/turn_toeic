import "server-only";

import type { createAdminClient } from "./supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * 반이 배정돼 **지금 수강 중**이 됐을 때 등급을 올린다.
 * 반 배정(`assignSections`)과 수강증 승인(`approveVerificationWith`) 두 곳이 함께 쓴다 —
 * 규칙이 갈라지면 한쪽으로 들어온 학생만 화면이 잠긴다.
 *
 * **테스트 등급(test_role)도 함께 올린다** (2026-09-19 Alan — "관리자가 650 주5 120분 10시로
 * 등급설정을 해놨는데, 등업신청이 안되있다고 나오고 있어"). 테스터는 진짜 등급이 강사·관리자라
 * `role` 이 올라가지 않는데, 학생 화면 판정(`effectiveRole`)과 RLS(`private.user_role()`)는 둘 다
 * test_role 을 본다. 그래서 test_role 이 `회원` 인 채로 반만 배정되면 **배정은 됐는데 불라방·다시보기가
 * 잠긴 채** 남고, 잠금 화면은 "수강증을 올려 등업하세요" 라는 엉뚱한 안내를 한다.
 * 테스터의 반 배정은 실제 학생과 똑같이 움직여야 한다 (도메인 규칙 3 "테스터").
 *
 * 두 UPDATE 모두 **올라갈 수 있는 값일 때만** 바꾼다 — 강사·관리자의 진짜 등급과 이미 수강생인
 * 테스트 등급은 건드리지 않는다. test_role 은 authenticated 에 쓰기 권한이 없어 서비스 롤로 쓴다.
 * 개강 전(예비등록) 배정은 여기를 부르지 않는다 — 개강일에 `private.run_daily_status_transition()`
 * 이 같은 규칙으로 올린다.
 */
export async function promoteToStudent(admin: AdminClient, userId: string) {
  await admin.from("profiles").update({ role: "student" }).eq("id", userId).in("role", ["member", "alumni"]);
  await admin.from("profiles").update({ test_role: "student" }).eq("id", userId).in("test_role", ["member", "alumni"]);
}
