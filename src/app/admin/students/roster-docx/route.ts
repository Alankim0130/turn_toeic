import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { printedAtKST, ROSTER_NAME, rosterDisposition } from "@/lib/class-roster";
import { buildClassRosterDocx } from "@/lib/class-roster-docx";
import { FILE_KINDS } from "@/lib/file-download";
import { loadRosterDownload, ROSTER_HEADERS } from "../_lib/roster-download";

export const dynamic = "force-dynamic";

/**
 * 반별 명단 · 레벨별 명단 **Word(.docx)** 내려받기 (2026-10-15 Alan "학생명단 워드로도 다운받을 수 있게 부탁해"). 주소는 PDF 와 같은 꼴이다 —
 * `?term=YYYY-MM`, `&view=levels` 면 레벨별 명단. PDF 와 **같은 쪽 · 같은 칸**을 고쳐 쓸 수 있는 Word 표로 준다 (`src/lib/class-roster-docx.ts`).
 * 강사 · 관리자만 — 학생명단 · PDF 와 같다 (레이아웃을 타지 않는 라우트라 여기서 직접 막는다. 조교는 요청 가로채기에서도 막힌다).
 * 받을 때마다 지금 배정으로 새로 만들고 저장해 두지 않는다. 캐시에 남기지 않는다 — 학생 이름이 든 파일이다.
 */
export async function GET(req: NextRequest) {
  await requireStaff();
  const got = await loadRosterDownload(req);
  if (!got.ok) return got.response;
  const { term, by, roster, period } = got;

  const docx = buildClassRosterDocx({
    roster,
    title: `${term.year}년 ${term.month}월 ${ROSTER_NAME[by]}`,
    period,
    printedAt: printedAtKST(),
  });
  return new Response(docx.bytes as BodyInit, {
    headers: { ...ROSTER_HEADERS, "content-type": FILE_KINDS.docx.mime, "content-disposition": rosterDisposition(term, by, "docx") },
  });
}
