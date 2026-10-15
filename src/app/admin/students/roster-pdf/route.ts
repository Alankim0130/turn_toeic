import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { printedAtKST, ROSTER_NAME, rosterDisposition, rosterPeriod, type RosterBy } from "@/lib/class-roster";
import { buildClassRosterPdf } from "@/lib/class-roster-pdf";
import { loadRosterFont } from "@/lib/class-roster-font";
import { TERM_COLUMNS } from "../../_lib/queries";
import { loadClassRoster } from "../_lib/class-roster";

export const dynamic = "force-dynamic";

/**
 * 반별 명단 PDF 내려받기 (2026-10-14 Alan — "다운로드해서 인쇄할 수 있으면 좋겠어"). `?term=YYYY-MM`.
 * LC · RC 를 합친 한 장이다 (같은 날 저녁 — 예전 주소의 `&subject=` 는 읽지 않는다).
 * `&view=levels` 면 레벨별 명단(레벨 × 월수금 · 화목금, 시간을 합친다 — 같은 날 밤 Alan "시간대는 없애고 … 월수금/ 화목금만 분리"). 그 밖의 값은 반별 명단.
 * 강사 · 관리자만 — 학생명단과 같다 (레이아웃을 타지 않는 라우트라 여기서 직접 막는다. 조교는 요청 가로채기에서도 막힌다).
 * 받을 때마다 지금 배정으로 새로 그린다 (저장해 두지 않는다). 캐시에 남기지 않는다 — 학생 이름이 든 파일이다.
 */
export async function GET(req: NextRequest) {
  await requireStaff();
  const headers = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" };
  const text = (status: number, body: string) => new Response(body, { status, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });

  const m = (req.nextUrl.searchParams.get("term") ?? "").match(/^(\d{4})-(\d{2})$/);
  const by: RosterBy = req.nextUrl.searchParams.get("view") === "levels" ? "track" : "time";
  if (!m) return text(400, "어느 달 명단인지 알 수 없어요. 학생명단 화면에서 다시 받아 주세요.");

  const supabase = await createClient();
  const { data: terms } = await supabase.from("terms").select(TERM_COLUMNS);
  const term = (terms ?? []).find((t) => t.year === Number(m[1]) && t.month === Number(m[2]));
  if (!term) return text(404, "그 달 기수가 없어요. 학생명단 화면에서 다시 받아 주세요.");

  const { roster, ok } = await loadClassRoster(supabase, term, todayKST(), by);
  // 일부만 읽은 명단을 인쇄물로 내보내지 않는다 — 빠진 학생을 모른 채 종이에 적힌다
  if (!ok) return text(503, "명단을 다 불러오지 못했어요. 잠시 뒤 다시 받아 주세요.");

  const pdf = await buildClassRosterPdf({
    roster,
    title: `${term.year}년 ${term.month}월 ${ROSTER_NAME[by]}`,
    period: rosterPeriod(term),
    printedAt: printedAtKST(),
    font: await loadRosterFont(),
  });
  return new Response(pdf.bytes as BodyInit, {
    headers: { ...headers, "content-type": "application/pdf", "content-disposition": rosterDisposition(term, by) },
  });
}
