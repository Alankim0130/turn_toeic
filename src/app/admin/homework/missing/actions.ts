"use server";

import { revalidatePath } from "next/cache";
import { requireCrew, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildMissingBoard, homeworkMissingMessage, missingRelated, MISSING_TITLE_MAX, rowOf, type MissingRow } from "@/lib/homework-missing";
import { autoTime, kstDay, nextAutoRun } from "@/lib/homework-missing-auto";
import { formatDate } from "@/lib/utils";
import { TERM_COLUMNS } from "../../_lib/queries";
import { loadMissingData, sectionSortKey } from "../_lib/missing";

/** 한 번에 보내는 학생 수 — 한 레벨의 한 달 학생이 이 안에 든다 (방학 600명도 레벨마다 나뉜다) */
const MAX_RECIPIENTS = 300;

export type MissingNoticeResult = { ok: true; sent: number; skipped: number; unsubscribed: number; already: number } | { ok: false; error: string };

/**
 * 숙제 미제출 알림 보내기 (2026-10-08 Alan — "안한사람은 일괄선택해서 알림메시지도 보낼 수 있으면 좋겠어" · "조교도 보낸다").
 *
 * 화면이 보낸 것은 **받을 학생 · 레벨 · 제목**뿐이다 — 글은 서버가 **지금 다시 세어** 학생마다 만든다 (`homeworkMissingMessage`).
 * 세는 기준은 **제출 기한**(같은 트랙 다음 수업일 오후 5시 — 2026-10-14 Alan)이 지난 숙제다.
 * 화면을 열어 둔 사이 학생이 숙제를 냈으면 그 날짜는 빠지고, 다 냈으면 그 학생에게는 보내지 않는다 (`skipped`).
 * **숙제제출 화면에서 '알림 안 받기' 를 누른 학생에게는 보내지 않는다** (2026-10-15 Alan — "알림 안받기를 신청하는걸로 하자") — 화면을 연 사이 눌렀으면 빠진다
 * (`unsubscribed`). DB 트리거도 끈 학생의 줄은 넣지 않는다 (두 겹). 그 밖의 학생은 모두 받는다.
 * 학생 알림함(`student_messages`, kind `homework_missing`)으로 간다 — 문자 · 카톡은 없고, **'알림 받기' 를 켠 학생 휴대폰으로도 간다**
 * (2026-10-15 — 넣는 순간 DB 트리거가 `/api/cron/student-push` 를 부른다, `student-push.ts`).
 *
 * **강사가 아닌 사람(조교 · 관리자)이 보내도 학생에게는 안 낸 과목의 선생님 이름으로 간다** — DB 트리거(`private.student_messages_homework_missing_sender`)가 바꾼다
 * (2026-10-08 저녁부터 관리자도 — 20261008160000). 여기서는 보내는 사람의 이름을 그대로 넣는다 (강사는 그 이름이 남는다). 조교 정책은 그 기수 반에 배정된 학생만 받는다.
 * 로그인한 세션으로 넣어 정책이 한 번 더 본다.
 * **화면을 연 뒤(`loadedAt`) 이 레벨 미제출 알림을 이미 받은 학생은 뺀다**(`already`, 2026-10-22 오류 점검) — 화면을 열어 둔 사이 자동 알림 · 다른 선생님 · 다른 창이
 * 보냈으면 같은 알림이 두 번 갔다. 다시 보내려면 새로고침해서 그 알림이 화면에 보인 뒤 고른다.
 */
export async function sendHomeworkMissingNotice(input: { termId: number; level: number; userIds: string[]; title: string; loadedAt?: string }): Promise<MissingNoticeResult> {
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
  const board = buildMissingBoard({ level, ...data, sortKeyOf: sectionSortKey(data.meta) });
  const found = ids.map((id) => rowOf(board, id)).filter((r): r is MissingRow => !!r);
  const unsubscribed = found.filter((r) => !r.alerts).length;
  const rows = found.filter((r) => r.alerts && r.missing.length > 0);
  if (rows.length === 0) {
    return {
      ok: false,
      error:
        found.length > 0 && unsubscribed === found.length
          ? "고른 학생은 숙제 미제출 알림을 받지 않기로 했어요. 새로고침해 주세요."
          : "고른 학생은 지금 기한이 지난 숙제가 없어요. 새로고침해 주세요.",
    };
  }
  // 화면을 연 뒤 받은 알림 — 그 기수 · 이 레벨에서 그 시각 뒤에 간 것만 (학생 × 레벨마다 한 줄이라 몇 줄 안 된다). 시각이 없으면(배포 사이 옛 화면) 예전처럼 보낸다
  const loadedAt = typeof input.loadedAt === "string" && Number.isFinite(Date.parse(input.loadedAt)) ? new Date(input.loadedAt).toISOString() : null;
  let received = new Set<string>();
  if (loadedAt) {
    const { data: recent, error: recentError } = await supabase.rpc("homework_missing_notices", { p_term_id: term.id }).eq("level", level).gt("sent_at", loadedAt);
    if (recentError) return { ok: false, error: "보낸 알림 기록을 읽지 못했어요. 잠시 뒤 다시 해 주세요." };
    received = new Set((recent ?? []).map((r) => r.user_id));
  }
  const fresh = rows.filter((r) => !received.has(r.id));
  if (fresh.length === 0) return { ok: false, error: "고른 학생은 화면을 연 뒤 이미 미제출 알림을 받았어요. 새로고침해서 확인해 주세요." };

  const { error } = await supabase.from("student_messages").insert(
    fresh.map((r) => ({
      user_id: r.id,
      sender_id: user.id, // 누가 보냈는지는 기록에 남는다 (학생은 이 id 로 이름을 못 읽는다)
      sender_name: profile.name || "", // 강사가 아니면(조교 · 관리자) DB 트리거가 안 낸 과목의 선생님 이름으로 바꾼다
      title,
      body: homeworkMissingMessage({ name: r.name, level, missing: r.missing, past: r.past, done: r.done }),
      kind: "homework_missing",
      related: missingRelated(term.id, level, r.missing),
    })),
  );
  if (error) return { ok: false, error: "알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요." };

  revalidatePath("/admin/homework/missing");
  revalidatePath("/my", "layout"); // 학생 알림함 배지
  return { ok: true, sent: fresh.length, skipped: ids.length - rows.length - unsubscribed, unsubscribed, already: rows.length - fresh.length };
}

export type MissingAutoResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * **자동 알림 설정 저장** (2026-10-19 Alan — "시간은 쌤들이 정할 수 있으며 … 여기 미제출알림 맨 위에 자동알림 보내기 설정칸이 있으면 좋겠어").
 * 켜기 · 보내는 시각(오후 5시 ~ 밤 11시 55분, 5분 단위)만 받는다. **강사 · 관리자만** — 조교는 같은 화면에서 보기만 한다 (DB 정책도 강사 · 관리자만 바꾼다).
 * 로그인한 사람의 세션으로 바꿔 정책이 한 번 더 막는다. 바꾼 사람 · 때와 켜는 순간 '첫 실행 날 0시부터 본다' 는 DB 트리거가 적는다.
 * 저장한 뒤에 오는 시각부터 보낸다 — 이미 지난 오늘 시각으로 바꿔도 그 자리에서 보내지 않는다 (`nextAutoRun` · DB `homework_missing_auto_due`).
 */
export async function saveHomeworkMissingAuto(input: { enabled: boolean; hour: string; minute: string }): Promise<MissingAutoResult> {
  await requireStaff();
  const enabled = input?.enabled === true;
  const time = autoTime(input?.hour, input?.minute);
  if (!time) return { ok: false, error: "보내는 시각을 골라 주세요 — 오후 5시부터 밤 11시 55분까지, 5분 단위예요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homework_missing_auto")
    .update({ enabled, send_time: time })
    .eq("id", true)
    .select("schedule_changed_at");
  if (error) return { ok: false, error: "저장하지 못했어요. 잠시 뒤 다시 해 주세요." };
  if (!data || data.length === 0) {
    return { ok: false, error: "저장하지 못했어요 — 테스트 등급을 켠 동안에는 바꿀 수 없어요. 방금 배포했다면 잠시 뒤 다시 해 주세요." };
  }
  revalidatePath("/admin/homework/missing");
  if (!enabled) return { ok: true, message: "자동 알림을 껐어요. 미제출 알림은 아래에서 골라 보낼 수 있어요." };

  const now = Date.now();
  const { data: run } = await supabase.from("homework_missing_auto_runs").select("finished_at").eq("run_date", kstDay(now)).maybeSingle();
  const next = nextAutoRun({ enabled, sendTime: time, scheduleChangedAt: Date.parse(data[0].schedule_changed_at) }, run ? { finished: !!run.finished_at } : null, now);
  return { ok: true, message: next ? `저장했어요. 다음 자동 알림은 ${formatDate(next.day)} ${next.time}에 가요.` : "저장했어요." };
}
