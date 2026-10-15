import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { printedAtKST, ROSTER_NAME, rosterDisposition } from "@/lib/class-roster";
import { buildClassRosterPdf } from "@/lib/class-roster-pdf";
import { loadRosterFont } from "@/lib/class-roster-font";
import { loadRosterDownload, ROSTER_HEADERS } from "../_lib/roster-download";

export const dynamic = "force-dynamic";

/**
 * 반별 명단 PDF 내려받기 (2026-10-14 Alan — "다운로드해서 인쇄할 수 있으면 좋겠어"). `?term=YYYY-MM`.
 * LC · RC 를 합친 한 장이다 (같은 날 저녁 — 예전 주소의 `&subject=` 는 읽지 않는다).
 * `&view=levels` 면 레벨별 명단(레벨 × 월수금 · 화목금, 시간을 합친다 — 같은 날 밤 Alan "시간대는 없애고 … 월수금/ 화목금만 분리"). 그 밖의 값은 반별 명단.
 * 강사 · 관리자만 — 학생명단과 같다 (레이아웃을 타지 않는 라우트라 여기서 직접 막는다. 조교는 요청 가로채기에서도 막힌다).
 * 받을 때마다 지금 배정으로 새로 그린다 (저장해 두지 않는다). 캐시에 남기지 않는다 — 학생 이름이 든 파일이다.
 * 같은 쪽을 Word 표로 받는 길은 `../roster-docx` (읽기는 `_lib/roster-download.ts` 를 함께 쓴다).
 */
export async function GET(req: NextRequest) {
  await requireStaff();
  const got = await loadRosterDownload(req);
  if (!got.ok) return got.response;
  const { term, by, roster, period } = got;

  const pdf = await buildClassRosterPdf({
    roster,
    title: `${term.year}년 ${term.month}월 ${ROSTER_NAME[by]}`,
    period,
    printedAt: printedAtKST(),
    font: await loadRosterFont(),
  });
  return new Response(pdf.bytes as BodyInit, {
    headers: { ...ROSTER_HEADERS, "content-type": "application/pdf", "content-disposition": rosterDisposition(term, by) },
  });
}
