import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedCron } from "@/lib/cron-auth";
import { site } from "@/lib/site";
import { looksLikeRegression, parseYbmReviewStats } from "@/lib/ybm-stats";

/**
 * YBM 공식 페이지의 수강후기 통계를 하루 한 번 읽어 온다 (2026-10-01 Alan — "매일 한 번씩 가지고 와서 … 8개 항목 숫자를 다 반영").
 * Vercel Cron 이 매일 04:10 KST 에 부른다 (`vercel.ts`). 결과는 `ybm_review_stats` 한 줄 — 랜딩의 `Stats` · 히어로 · 헤드라인 띠가 읽는다.
 *
 * **못 읽은 날은 숫자를 그대로 둔다** — `last_error` 만 적는다. 페이지가 바뀌어 0 이나 엉뚱한 수가 올라가면 랜딩이 거짓말을 한다.
 * 판독은 `parseYbmReviewStats` 가 엄격하게 하고(총수 + 태그 8개), 누적 후기가 반 넘게 줄어든 값도 받지 않는다.
 */
export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const fail = async (error: string, status = 502) => {
    console.error(`[ybm-stats] ${error}`);
    await admin.from("ybm_review_stats").update({ last_attempt_at: now, last_error: error.slice(0, 500), last_error_at: now }).eq("id", true);
    return NextResponse.json({ ok: false, error }, { status });
  };

  let html: string;
  try {
    const res = await fetch(site.academy.ybmUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; winnertoeic-stats/1.0; +https://winnertoeic.com)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ko-KR,ko;q=0.9",
      },
    });
    if (!res.ok) return fail(`YBM 페이지 응답 ${res.status}`);
    html = await res.text();
  } catch (e) {
    return fail(`YBM 페이지를 못 받았어요: ${e instanceof Error ? e.message : String(e)}`);
  }

  let stats;
  try {
    stats = parseYbmReviewStats(html);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 422);
  }

  const { data: prev } = await admin.from("ybm_review_stats").select("total").eq("id", true).maybeSingle();
  if (looksLikeRegression(prev?.total ?? null, stats.total)) {
    return fail(`누적 후기가 ${prev?.total} → ${stats.total} 으로 줄었어요 — 페이지가 바뀐 것 같아 받지 않았어요`, 422);
  }

  const { error } = await admin.from("ybm_review_stats").upsert(
    {
      id: true,
      total: stats.total,
      tags: stats.tags,
      fetched_at: now,
      source_url: site.academy.ybmReviewUrl,
      last_attempt_at: now,
      last_error: null,
      last_error_at: null,
    },
    { onConflict: "id" },
  );
  if (error) {
    console.error(`[ybm-stats] 저장 실패: ${error.message}`);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, total: stats.total, tags: stats.tags.length, fetched_at: now });
}
