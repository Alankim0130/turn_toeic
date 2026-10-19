import { NextResponse, type NextRequest } from "next/server";
import { authorizedAppCall } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { kstDay } from "@/lib/homework-missing-auto";
import { shiftDate } from "@/lib/term-window";
import { runHomeworkMissingAuto } from "@/app/admin/homework/_lib/auto-run";

/**
 * 숙제 미제출 **자동 알림** (2026-10-19 Alan — "숙제 미알람을 자동으로 매일 보내주는 시스템이 생기면 좋겠어. 시간은 쌤들이 정할 수 있으며, 월수금, 화목금 위주로").
 *
 * DB 가 부른다 — pg_cron `homework-missing-auto` 가 5분마다 보고, 쌤이 정한 시각이 지났는데 오늘 아직 안 돌았을 때만 (`private.call_app`, 마이그레이션 20261019100000).
 *  1. `claim_homework_missing_auto` 로 **오늘 실행을 가져간다** — 하루 한 번만 (두 호출이 겹쳐도 하나만, 멈춘 실행은 15분 뒤 다시)
 *  2. 그 실행이 볼 기한의 시작(`claimed_from`) 뒤에 새로 기한이 지난 숙제를 안 낸 학생에게 한 통씩 넣는다 (`runHomeworkMissingAuto`)
 *  3. 끝나면 기록을 닫고 다음 실행이 볼 시작을 이번 실행의 시각으로 올린다. 못 끝내면 까닭만 적는다 (15분 뒤 다시)
 *
 * 응답에는 숫자만 담는다 (누구에게 무엇을 보냈는지는 담지 않는다).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 실행 기록은 석 달치만 둔다 */
const KEEP_DAYS = 90;

export async function POST(req: NextRequest) {
  if (!(await authorizedAppCall(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createAdminClient();

  const { data: claimed, error: claimError } = await admin.rpc("claim_homework_missing_auto");
  if (claimError) {
    console.error("[homework-missing-auto] claim", claimError.message);
    return NextResponse.json({ ok: false, error: "claim" }, { status: 500 });
  }
  const run = claimed?.[0];
  if (!run) return NextResponse.json({ ok: true, claimed: false });

  const windowFrom = Date.parse(run.claimed_from);
  let result;
  try {
    result = await runHomeworkMissingAuto(admin, { windowFrom: Number.isFinite(windowFrom) ? windowFrom : Date.now() - 24 * 60 * 60 * 1000 });
  } catch (error) {
    console.error("[homework-missing-auto] run", error);
    result = { ok: false as const, error: "보내는 중에 멈췄어요" };
  }

  if (!result.ok) {
    // 열어 둔 채 까닭만 — 15분 뒤 다시 가져간다
    await admin.from("homework_missing_auto_runs").update({ error: result.error }).eq("run_date", run.claimed_day).eq("started_at", run.claimed_at);
    return NextResponse.json({ ok: false, error: result.error });
  }

  const doneAt = new Date().toISOString();
  await admin
    .from("homework_missing_auto_runs")
    .update({ finished_at: doneAt, sent: result.sent, opted_out: result.optedOut, tracks: result.tracks, error: null })
    .eq("run_date", run.claimed_day)
    .eq("started_at", run.claimed_at);
  // 다음 실행은 이번에 본 시각 뒤에 기한이 지난 숙제부터 — 앞으로만 옮긴다 (그 사이 쌤이 껐다 켰으면 켠 날 0시가 더 뒤일 수 있다)
  const covered = new Date(result.now).toISOString();
  await admin.from("homework_missing_auto").update({ covered_until: covered }).eq("id", true).or(`covered_until.is.null,covered_until.lt.${covered}`);
  await admin.from("homework_missing_auto_runs").delete().lt("run_date", shiftDate(kstDay(result.now), -KEEP_DAYS));

  return NextResponse.json({ ok: true, claimed: true, terms: result.terms, sent: result.sent, optedOut: result.optedOut, tracks: result.tracks });
}
