import { after, NextResponse, type NextRequest } from "next/server";
import { authorizedAppCall } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rematchHeldVerifications } from "@/lib/rematch-held";
import { todayKST } from "@/lib/utils";
import { autoOpenStateOf, autoOpensMonth } from "@/lib/month-open";
import { autoOpenMonth } from "@/app/admin/sections/_lib/open-month";

/**
 * **평달 반 자동 세팅 — 버튼 없이** (2026-10-22 Alan — 반 편성 카드의 '11월 시간표 · 반 한 번에 만들기' 를 눌러 보고
 * "버튼을 안눌러도 자동으로 세팅되도록 부탁해").
 *
 * 평달 달력을 저장하면 그 자리에서 열린다(`saveTermSchedule` → `autoOpenMonth`). 그래도 반이 없는 평달 — 이 기능 전에 저장해 둔 달 ·
 * 그때 못 연 달 · 강사가 반을 다 지운 달 — 을 DB 가 10분마다 보고 부른다 (pg_cron `month-auto-open` → `private.call_app`, 마이그레이션 20261022100000 —
 * 열 달이 있을 때만 부른다: `private.month_auto_open_due()`).
 *
 * 하는 일은 달력 저장과 **같은 함수**(`autoOpenMonth`)다 — 그 달 반이 하나도 없을 때만 시간표를 만들고 강좌마다 모든 반을 연다.
 * 방학달(1 · 2 · 7 · 8월)은 강사가 직접 연다 — 여기서 건너뛴다. 반은 잠금을 건 DB 함수로만 넣어서 달력 저장과 겹쳐도 두 벌이 되지 않는다.
 * 기수마다 마지막 결과(못 열었으면 까닭)를 `month_auto_open_state` 에 남긴다 — 반 편성 카드가 보여 준다.
 *
 * 응답에는 숫자만 담는다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await authorizedAppCall(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createAdminClient();
  const today = todayKST();

  // 개강일 · 종강일을 정했고 아직 끝나지 않은 기수 — 반이 있는지는 autoOpenMonth 가 다시 센다
  const { data: terms, error } = await admin
    .from("terms")
    .select("id, year, month")
    .not("enrollment_opens_at", "is", null)
    .not("closes_at", "is", null)
    .gte("closes_at", today)
    .order("year")
    .order("month");
  if (error) {
    console.error("[month-auto-open] terms", error.message);
    return NextResponse.json({ ok: false, error: "terms" }, { status: 500 });
  }

  let opened = 0;
  let failed = 0;
  for (const term of terms ?? []) {
    if (!autoOpensMonth(term.month)) continue;
    let state: ReturnType<typeof autoOpenStateOf> = null;
    try {
      state = autoOpenStateOf(await autoOpenMonth(admin, { y: term.year, m: term.month }, today, { rematch: false }));
    } catch (e) {
      console.error("[month-auto-open] open", term.year, term.month, e);
      state = { error: "sections_error", sections: 0 };
    }
    if (!state) continue;
    if (state.error) failed++;
    else opened++;
    const { error: saveError } = await admin
      .from("month_auto_open_state")
      .upsert({ term_id: term.id, tried_at: new Date().toISOString(), error: state.error, sections: state.sections }, { onConflict: "term_id" });
    if (saveError) console.error("[month-auto-open] state", saveError.message);
  }

  // 받아 둔 수강증 다시 맞추기는 끝에 한 번만 — 두 달을 함께 열어도 같은 수강증을 두 번 보지 않는다 (2026-10-22 오류 점검)
  if (opened > 0) after(() => rematchHeldVerifications(admin, { notify: true }));

  return NextResponse.json({ ok: true, opened, failed });
}
