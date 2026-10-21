import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 그 칸(레벨 × 과목 × 과정) · 그 회차의 끝 번호 + 1 — 새로 올린 자료 · 다른 회차에서 옮겨 온 자료 · 직원 게시판에서 옮겨 온 자료가 **그 회차의 끝**에 서게.
 * 2026-10-12 순서 마이그레이션이 있던 자료를 0, 1, 2 … 로 매긴 뒤로 새 자료가 0 으로 들어가 두 번째 자리에 끼어들었다 (정렬이 sort_order → 올린 시각).
 * 못 읽으면 0 — 저장은 막지 않는다 (자리만 어긋나고 ▲▼ 로 고친다).
 */
export async function nextMaterialOrder(supabase: SupabaseClient, cell: { level: number; subject: string; set: string; seq: number }): Promise<number> {
  const { data } = await supabase
    .from("class_materials")
    .select("sort_order")
    .eq("level", cell.level)
    .eq("subject", cell.subject)
    .eq("book_set", cell.set)
    .eq("seq", cell.seq)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.sort_order === "number" ? data.sort_order + 1 : 0;
}
