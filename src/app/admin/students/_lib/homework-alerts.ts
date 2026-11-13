import { readAll } from "@/lib/read-all";
import type { DB } from "../../_lib/queries";

/**
 * 학생명단에 숙제 미제출 알림을 **끈 학생** 표시 (2026-11-13 Alan — "학생명단에서 숙제 미제출 알림 희망자를 신청했는지 안했는지 알 수 있으면 좋겠어.
 * 직관적으로 표시가 되어있으면 좋겠어").
 *
 * 미제출 알림은 **모두가 기본으로 받고 끈 학생만 빠진다** (도메인 규칙 7 — 2026-10-15 에 신청 방식에서 뒤집었다. 신청 방식으로 되돌리지 말 것).
 * 그래서 읽는 것은 `homework_missing_optouts`(행이 있으면 끔) 하나이고, 한 사람에 한 줄이라 표가 작다 — 통째로 읽는다 (숙제 미제출 명단과 같은 길).
 *
 * **모르면 `null`** — 화면은 그때 켜짐 · 꺼짐을 적지 않는다 (읽기 오류를 빈 목록으로 보면 끈 학생까지 모두 '켜짐' 으로 보인다):
 *  - 읽다 실패했을 때
 *  - **테스트 등급을 켠 강사 · 관리자** — 조회 정책(`is_crew()`)이 테스트 등급으로 판정해 본인 줄만 오류 없이 돌려준다 (0줄 = 모두 켜짐 으로 보인다)
 *
 * 값은 끈 때(`created_at`) — 학생명단의 `숙제 미제출 알림을 끈 학생` 목록이 `11/5 끔` 으로 적는다 (같은 날 Alan "별도로 뺀 리스트").
 */
export async function loadHomeworkAlertsOff(supabase: DB, viewer: { test_role?: string | null }): Promise<ReadonlyMap<string, string> | null> {
  if (viewer.test_role) return null;
  const { rows, ok } = await readAll<{ user_id: string; created_at: string }>((from, to, count) =>
    supabase
      .from("homework_missing_optouts")
      .select("user_id, created_at", count ? { count: "exact" } : undefined)
      .order("user_id")
      .range(from, to),
  );
  return ok ? new Map(rows.map((r) => [r.user_id, r.created_at])) : null;
}
