import { requireCrew } from "@/lib/auth";
import { attendUrl } from "@/lib/attendance";
import { posterSheetHtml } from "@/lib/attendance-poster";
import { qrMatrix } from "@/lib/qr";
import { site } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * 인쇄용 출석 QR 포스터 — A4 가로 한 장에 A5 두 장 (2026-09-21 Alan). 강사·관리자·조교.
 * 루트 레이아웃(헤더·하단 바)이 같이 인쇄되지 않게 페이지가 아니라 완성된 HTML 을 돌려준다 (`attendance-poster.ts`).
 * 토큰은 새로 뽑기 전까지 바뀌지 않으므로 캐시에 남기지 않는다.
 */
export async function GET() {
  // 조교에게도 열린 화면이다 — 레이아웃을 타지 않는 라우트라 여기서 직접 막는다
  await requireCrew();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_poster_token");
  const d = data as { token?: string; created_at?: string } | null;
  const headers = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" };
  if (error || !d?.token) {
    return new Response("포스터 QR 을 받지 못했어요. 잠시 뒤 다시 열어 주세요.", {
      status: 503,
      headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
    });
  }
  const url = attendUrl(site.url, d.token);
  return new Response(posterSheetHtml({ qr: qrMatrix(url, "H"), issuedAt: d.created_at }), {
    headers: { ...headers, "content-type": "text/html; charset=utf-8" },
  });
}
