import { NextResponse, type NextRequest } from "next/server";
import { authorizedAppCall } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured, pushStudentMessages } from "@/lib/push";

/**
 * 학생 휴대폰 푸시 (2026-10-15 Alan — "숙제 미제출이랑 불라방 시작 알림 푸시로 만들어줘").
 *
 * DB 가 부른다 — 학생 알림함에 숙제 미제출(`homework_missing`) · 불라방 시작(`live_start`) 줄이 들어오는 순간 트리거가 한 번,
 * 그 호출이 실패했으면 pg_cron `student-push-retry` 가 1분마다 (`private.call_app`, 마이그레이션 20261015120000).
 *
 * 1. `claim_student_pushes` 로 아직 안 보낸 줄(15분 안)을 **가져가며 표시**한다 — 두 호출이 겹쳐도 한 줄은 한 번만 나간다
 * 2. 그 학생이 '알림 받기' 를 켜 둔 기기로 알림함 줄의 제목 · 본문을 그대로 보낸다 (`pushStudentMessages`)
 *
 * 받는 사람은 알림함과 같다 — 여기서 새로 고르지 않는다 (불라방은 그 교시를 듣는 불라방 학생만 — DB 가 정했다).
 * 응답에는 숫자만 담는다 (누구에게 무엇을 보냈는지는 담지 않는다).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await authorizedAppCall(req))) return NextResponse.json({ ok: false }, { status: 401 });
  // 알림 키가 없으면 가져가지 않는다 — 가져가면 '보냄' 으로 표시만 되고 사라진다 (키를 넣으면 15분 안의 줄은 다시 부르기가 보낸다)
  if (!pushConfigured()) return NextResponse.json({ ok: false, error: "vapid" }, { status: 503 });

  const { data, error } = await createAdminClient().rpc("claim_student_pushes");
  if (error) {
    console.error("[student-push] claim", error.message);
    return NextResponse.json({ ok: false, error: "claim" }, { status: 500 });
  }
  const rows = data ?? [];
  if (rows.length === 0) return NextResponse.json({ ok: true, claimed: 0 });

  const result = await pushStudentMessages(rows);
  return NextResponse.json({ ok: true, claimed: rows.length, messages: result.messages, sent: result.sent, failed: result.failed, removed: result.removed });
}
