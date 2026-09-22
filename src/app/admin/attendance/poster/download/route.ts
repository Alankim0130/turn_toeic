import { requireCrew } from "@/lib/auth";
import { attendUrl } from "@/lib/attendance";
import { posterDisposition } from "@/lib/attendance-poster";
import { loadPosterAssets } from "@/lib/attendance-poster-assets";
import { buildPosterPdf } from "@/lib/attendance-poster-pdf";
import { qrMatrix } from "@/lib/qr";
import { site } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * 출석 QR 포스터 PDF 내려받기 (2026-09-22 Alan — "새로 만들기 버튼을 누르면 인쇄까지 할 수 있도록 다운로드"). 강사·관리자·조교.
 * A4 가로 한 장에 A5 포스터 두 장 — `attendance-poster-pdf.ts` 가 그린다. 지금 유효한 토큰으로 그때그때 만든다
 * (파일을 저장해 두지 않는다 — 새로 만들면 옛 파일은 찍히지 않으므로 늘 지금 것을 준다). 캐시에 남기지 않는다.
 */
export async function GET() {
  // 조교에게도 열린 화면이다 — 레이아웃을 타지 않는 라우트라 여기서 직접 막는다
  await requireCrew();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_poster_token");
  const d = data as { token?: string; created_at?: string } | null;
  const headers = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" };
  if (error || !d?.token) {
    return new Response("포스터 QR 을 받지 못했어요. 잠시 뒤 다시 받아 주세요.", {
      status: 503,
      headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
    });
  }
  const pdf = await buildPosterPdf({ qr: qrMatrix(attendUrl(site.url, d.token), "H"), issuedAt: d.created_at, assets: await loadPosterAssets() });
  if (pdf.shrunk.length) console.warn("[attendance-poster] 칸보다 길어 줄여 그린 줄", pdf.shrunk);
  return new Response(pdf.bytes as BodyInit, {
    headers: { ...headers, "content-type": "application/pdf", "content-disposition": posterDisposition(d.created_at) },
  });
}
