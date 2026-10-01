import "server-only";
import { createClient } from "@/lib/supabase/server";
import { tagsFromJson, type YbmTag } from "./ybm-stats";

export type YbmReviewStatsRow = { total: number; tags: YbmTag[]; fetchedAt: string };

/**
 * 랜딩이 읽는 YBM 수강후기 통계 (`ybm_review_stats` 한 줄 — 크론이 매일 갱신, 모두에게 조회가 열려 있다).
 * **못 읽으면 null** — 그러면 랜딩은 그 숫자를 아예 안 적는다. 지어낸 수를 적지 않는다 (작업 원칙 4).
 */
export async function getYbmReviewStats(): Promise<YbmReviewStatsRow | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ybm_review_stats").select("total, tags, fetched_at").eq("id", true).maybeSingle();
    if (error || !data) return null;
    return { total: data.total, tags: tagsFromJson(data.tags), fetchedAt: data.fetched_at };
  } catch {
    return null;
  }
}
