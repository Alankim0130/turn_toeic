"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { HANDOVER_KEY } from "@/lib/handover";
import { createClient } from "@/lib/supabase/server";
import { readHandover } from "../_lib/handover-doc";

export type HandoverCheckState = { error?: string };

/**
 * 인수인계 항목 하나를 끝냄 / 안 끝냄으로 (2026-10-04). 강사·관리자만 — 조교에게 연 화면이 아니다.
 * 로그인한 사람의 세션으로 써서 RLS(`handover_checks: 스태프 …`)가 한 번 더 막는다. 누가 · 언제는 DB 트리거가 적는다.
 */
export async function toggleHandoverItem(key: string, done: boolean): Promise<HandoverCheckState> {
  const { profile } = await requireStaff();
  // 테스트 등급을 켜면 RLS 가 학생으로 본다 — 화면도 칸을 잠그지만 열어 둔 옛 화면에서 누를 수 있다
  if (profile.test_role) return { error: "테스트 등급으로 보는 중이라 체크할 수 없어요 — 테스트를 끝내고 다시 눌러 주세요." };
  if (typeof key !== "string" || !HANDOVER_KEY.test(key)) return { error: "없는 항목이에요." };
  // 문서에 없는 번호는 받지 않는다 — 문서를 읽지 못했을 때는 번호 꼴(DB check 와 같다)만 본다
  const doc = await readHandover().catch(() => null);
  if (doc && !doc.tasks.some((t) => t.key === key)) return { error: "체크리스트에 없는 항목이에요 — 새로고침해 주세요." };

  const supabase = await createClient();
  if (done === true) {
    const { error } = await supabase.from("handover_checks").insert({ item: key });
    // 다른 사람이 먼저 체크했으면(23505) 이미 끝난 것이다
    if (error && error.code !== "23505") return { error: `저장하지 못했어요. ${error.message}` };
  } else {
    const { error } = await supabase.from("handover_checks").delete().eq("item", key);
    if (error) return { error: `저장하지 못했어요. ${error.message}` };
  }

  revalidatePath("/admin/handover");
  return {};
}
