import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedCron } from "@/lib/cron-auth";
import { purgeCutoff, RECEIPT_RETENTION_DAYS } from "@/lib/receipt-retention";

/** 한 번에 처리할 수 — 매일 돌므로 밀린 것은 다음 날 이어서 지운다 */
const BATCH = 500;

/**
 * 보관 기간이 지난 수강증 **원본 파일**을 지운다 (2026-09-20 Alan: 2개월. 미확정 6 해결).
 * Vercel Cron 이 매일 03:20 KST 에 부른다 (`vercel.ts`).
 *
 * **기록은 지우지 않는다** — `ocr_raw`(읽은 원문) · `parsed`(판독 결과) · `result`·`reject_reason` 은 남는다.
 * 그래야 "왜 이 반에 배정됐나" 를 되짚을 수 있고, 위조 신호(같은 초 캡처 등)도 그 기록으로 잡는다.
 *
 * **pg_cron 이 아니라 여기서 하는 까닭**: `storage.objects` 행만 지우면 실제 파일은 저장소에 그대로 남아
 * 떠돈다. 진짜로 지우려면 스토리지 API 를 거쳐야 하고, 그건 서비스 롤을 쥔 이쪽에서만 할 수 있다.
 */
export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const cutoff = purgeCutoff();

  // 판정이 끝났고(result 있음) · 아직 안 지웠고 · 올린 지 보관 기간이 지난 것
  const { data: rows, error } = await admin
    .from("enrollment_verifications")
    .select("id, file_path")
    .not("result", "is", null)
    .is("file_deleted_at", null)
    .lt("created_at", cutoff)
    .order("created_at")
    .limit(BATCH);
  if (error) {
    console.error(`[purge-receipts] 대상을 못 읽었어요: ${error.message}`);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!rows?.length) return NextResponse.json({ ok: true, purged: 0, days: RECEIPT_RETENTION_DAYS });

  const candidates = [...new Set(rows.map((r) => r.file_path).filter(Boolean))];

  // ★ 같은 파일을 아직 쓰는 신청이 있으면 건너뛴다.
  // 거절당한 학생이 수동으로 다시 낼 때 **이미 올린 파일을 그대로 재사용**하므로(도메인 규칙 4-2),
  // 오래된 거절 건 하나 때문에 지우면 **아직 검토 중인 새 신청의 그림이 사라져** 스태프가 승인을 못 한다.
  const { data: stillUsed, error: usedError } = await admin
    .from("enrollment_verifications")
    .select("file_path")
    .in("file_path", candidates)
    .is("file_deleted_at", null)
    .or(`result.is.null,created_at.gte.${cutoff}`);
  if (usedError) {
    console.error(`[purge-receipts] 쓰는 중인 파일을 못 확인했어요: ${usedError.message}`);
    return NextResponse.json({ ok: false, error: usedError.message }, { status: 500 });
  }
  const keep = new Set((stillUsed ?? []).map((r) => r.file_path));

  const paths = candidates.filter((p) => !keep.has(p));
  const ids = rows.filter((r) => !keep.has(r.file_path)).map((r) => r.id);
  if (!paths.length) return NextResponse.json({ ok: true, purged: 0, kept: keep.size, days: RECEIPT_RETENTION_DAYS });

  const { error: removeError } = await admin.storage.from("receipts").remove(paths);
  if (removeError) {
    // 표시를 남기지 않는다 — 다음 날 그대로 다시 시도한다 (지운 척하는 것이 가장 나쁘다)
    console.error(`[purge-receipts] 파일을 못 지웠어요: ${removeError.message}`);
    return NextResponse.json({ ok: false, error: removeError.message }, { status: 500 });
  }

  const { error: markError } = await admin
    .from("enrollment_verifications")
    .update({ file_deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (markError) {
    // 파일은 이미 없다. 표시만 실패했으므로 다음 날 다시 지우려 하지만, 없는 파일 삭제는 조용히 지나간다
    console.error(`[purge-receipts] 지운 표시를 못 남겼어요: ${markError.message}`);
    return NextResponse.json({ ok: false, removed: paths.length, error: markError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, purged: ids.length, kept: keep.size, days: RECEIPT_RETENTION_DAYS });
}
