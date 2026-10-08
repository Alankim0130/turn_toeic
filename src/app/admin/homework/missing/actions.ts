"use server";

import { revalidatePath } from "next/cache";
import { requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { buildMissingBoard, homeworkMissingMessage, missingRelated, MISSING_TITLE_MAX, rowOf, type MissingRow } from "@/lib/homework-missing";
import { TERM_COLUMNS } from "../../_lib/queries";
import { loadMissingData, sectionSortKey } from "../_lib/missing";

/** 한 번에 보내는 학생 수 — 한 레벨의 한 달 학생이 이 안에 든다 (방학 600명도 레벨마다 나뉜다) */
const MAX_RECIPIENTS = 300;

export type MissingNoticeResult = { ok: true; sent: number; skipped: number } | { ok: false; error: string };

/**
 * 숙제 미제출 알림 보내기 (2026-10-08 Alan — "안한사람은 일괄선택해서 알림메시지도 보낼 수 있으면 좋겠어" · "조교도 보낸다").
 *
 * 화면이 보낸 것은 **받을 학생 · 레벨 · 제목**뿐이다 — 글은 서버가 **지금 다시 세어** 학생마다 만든다 (`homeworkMissingMessage`).
 * 화면을 열어 둔 사이 학생이 숙제를 냈으면 그 날짜는 빠지고, 다 냈으면 그 학생에게는 보내지 않는다 (`skipped`).
 * 학생 알림함(`student_messages`, kind `homework_missing`)으로만 간다 — 문자 · 카톡 · 푸시는 없다.
 *
 * **조교가 보내도 학생에게는 안 낸 과목의 선생님 이름으로 간다** — DB 트리거(`private.student_messages_homework_missing_sender`)가 바꾼다.
 * 여기서는 보내는 사람의 이름을 그대로 넣는다 (강사 · 관리자는 그 이름이 남는다). 조교 정책은 그 기수 반에 배정된 학생만 받는다.
 * 로그인한 세션으로 넣어 정책이 한 번 더 본다.
 */
export async function sendHomeworkMissingNotice(input: { termId: number; level: number; userIds: string[]; title: string }): Promise<MissingNoticeResult> {
  const { user, profile } = await requireCrew();
  const title = String(input.title ?? "").trim();
  if (!title) return { ok: false, error: "알림 제목을 적어 주세요." };
  if (title.length > MISSING_TITLE_MAX) return { ok: false, error: `제목은 ${MISSING_TITLE_MAX}자까지 적을 수 있어요.` };
  const termId = Number(input.termId);
  const level = Number(input.level);
  if (!Number.isInteger(termId) || !Number.isInteger(level)) return { ok: false, error: "잘못된 요청이에요." };
  const ids = [...new Set((Array.isArray(input.userIds) ? input.userIds : []).filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (ids.length === 0) return { ok: false, error: "알림을 받을 학생을 골라 주세요." };
  if (ids.length > MAX_RECIPIENTS) return { ok: false, error: `한 번에 ${MAX_RECIPIENTS}명까지 보낼 수 있어요. 나눠서 보내 주세요.` };

  const supabase = await createClient();
  const { data: term } = await supabase.from("terms").select(TERM_COLUMNS).eq("id", termId).maybeSingle();
  if (!term) return { ok: false, error: "그 달 기수를 찾지 못했어요. 새로고침해 주세요." };

  const data = await loadMissingData(supabase, term, { students: ids });
  // 일부를 못 읽었으면 낸 숙제가 '안 냄' 으로 보이거나 강사 · 관리자 계정을 못 가린다 — 틀린 알림을 보내느니 멈춘다
  if (!data.ok) return { ok: false, error: "숙제 기록을 다 읽지 못했어요. 잠시 뒤 다시 해 주세요." };
  const board = buildMissingBoard({ level, today: todayKST(), ...data, sortKeyOf: sectionSortKey(data.meta) });
  const rows = ids.map((id) => rowOf(board, id)).filter((r): r is MissingRow => !!r && r.missing.length > 0);
  if (rows.length === 0) return { ok: false, error: "고른 학생은 지금 안 낸 숙제가 없어요. 새로고침해 주세요." };

  const { error } = await supabase.from("student_messages").insert(
    rows.map((r) => ({
      user_id: r.id,
      sender_id: user.id, // 누가 보냈는지는 기록에 남는다 (학생은 이 id 로 이름을 못 읽는다)
      sender_name: profile.name || "", // 조교면 DB 트리거가 안 낸 과목의 선생님 이름으로 바꾼다
      title,
      body: homeworkMissingMessage({ name: r.name, level, missing: r.missing, past: r.past, done: r.done }),
      kind: "homework_missing",
      related: missingRelated(term.id, level, r.missing),
    })),
  );
  if (error) return { ok: false, error: "알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요." };

  revalidatePath("/admin/homework/missing");
  revalidatePath("/my", "layout"); // 학생 알림함 배지
  return { ok: true, sent: rows.length, skipped: ids.length - rows.length };
}
