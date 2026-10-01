"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCrew, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { absenteesOf, kstNow } from "@/lib/attendance-board";
import { inTerm, pickCurrentTerm, termWindow } from "@/lib/term-window";
import { todayKST } from "@/lib/utils";

/**
 * 출석 명단 (2026-09-21 Alan — "조교에게도 명단을 열어줘"). **강사·관리자·조교** 가 쓴다.
 * 쓰기는 DB 함수(`attendance_set`)가 crew 인지 한 번 더 본다.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TERM_RE = /^\d{4}-\d{2}$/;

/** 출석 인정 · 결석 · 되돌리기. 사유는 꼭 적는다 (되돌리기 빼고) */
export async function setAttendance(formData: FormData) {
  await requireCrew();
  const student = String(formData.get("student_id") ?? "");
  const section = Number(formData.get("section_id"));
  const date = String(formData.get("date") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  // 끝난 기수를 정정하던 중이면 그 기수 화면으로 돌아간다 (page.tsx 의 ?term=, 종강 뒤 7일).
  // (2026-10-01 까지 이 정규식이 `/^d{4}-d{2}$/` 로 역슬래시가 빠져 있어 늘 지금 기수 화면으로 돌아갔다)
  const term = String(formData.get("term") ?? "");
  const back = `/admin/attendance?${TERM_RE.test(term) ? `term=${term}&` : ""}date=${DATE_RE.test(date) ? date : ""}`;
  if (!student || !Number.isInteger(section) || !DATE_RE.test(date) || !["manual", "absent", "clear"].includes(status)) redirect(`${back}&error=invalid`);
  if (status !== "clear" && !note) redirect(`${back}&error=note#s${section}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("attendance_set", { p_student: student, p_section: section, p_date: date, p_status: status, p_note: note });
  revalidatePath("/admin/attendance");
  // not_in_section = 그 반 학생이 아니거나 · 그 날 수업이 없거나 · 그 반의 개강일~종강일 밖 날짜 (DB 가 다시 본다)
  const code = error ? (error.message.includes("note") ? "note" : error.message.includes("not_in_section") ? "term" : "save") : null;
  redirect(`${back}&${code ? `error=${code}` : "ok=1"}#s${section}`);
}

export type AbsenceSendResult = { ok: boolean; error?: string; sent?: number };

/**
 * 결석 알림 — 그 날 결석·미출석 학생에게 한 번에 (2026-10-01 Alan — "결석한 학생들에게는 전체 알림 메시지를 보낼 수 있도록").
 * **강사·관리자만** 보낸다 — 학생 알림함 쓰기 정책("student_messages: 스태프 발송")이 스태프만 열려 있고, 로그인한 세션으로 넣어 그 정책이 한 번 더 막는다.
 * 받는 사람은 **화면이 보낸 목록을 믿지 않고 서버가 다시 고른다**: 지금 기수(개강일~종강일) 안의 날짜 · 그 날 명단(`attendance_roster`) 중
 * 수업이 끝났고(끝나고 30분) 기록이 없거나 결석으로 정한 학생 — 화면을 열어 둔 사이 학생이 찍었으면 빠진다.
 * 종강한 기수의 날짜에는 보내지 않는다 (2026-10-01 Alan — "종강일이 되면 모두 사라지고 … 새로운 수강생들로").
 */
export async function sendAbsenceNotice(input: { date: string; userIds: string[]; title: string; body: string }): Promise<AbsenceSendResult> {
  const { user, profile } = await requireStaff();

  const date = String(input?.date ?? "");
  const title = String(input?.title ?? "").trim();
  const body = String(input?.body ?? "").trim();
  const wanted = [...new Set((Array.isArray(input?.userIds) ? input.userIds : []).filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (!DATE_RE.test(date)) return { ok: false, error: "잘못된 날짜예요." };
  if (wanted.length === 0) return { ok: false, error: "받을 학생을 골라 주세요." };
  if (wanted.length > 300) return { ok: false, error: "한 번에 300명까지 보낼 수 있어요." };
  if (title.length < 1 || title.length > 80) return { ok: false, error: "제목은 1~80자로 적어 주세요." };
  if (body.length < 1 || body.length > 1000) return { ok: false, error: "내용은 1~1,000자로 적어 주세요." };

  const supabase = await createClient();
  const today = todayKST();
  const { data: termRows } = await supabase.from("terms").select("id, year, month, enrollment_opens_at, closes_at");
  const current = pickCurrentTerm((termRows ?? []).filter((t) => termWindow(t).dated), today, { datedOnly: true });
  if (!current || !inTerm(date, current) || date > today) return { ok: false, error: "지금 기수의 지난 수업에만 결석 알림을 보낼 수 있어요." };

  const { data: roster, error: rosterError } = await supabase.rpc("attendance_roster", { p_date: date });
  if (rosterError) return { ok: false, error: "명단을 불러오지 못했어요. 잠시 뒤 다시 해 주세요." };
  const absent = new Map(absenteesOf(roster ?? [], date, kstNow()).map((a) => [a.student_id, a]));
  const ids = wanted.filter((id) => absent.has(id));
  if (ids.length === 0) return { ok: false, error: "고른 학생이 이 날 결석·미출석이 아니에요 — 그 사이 출석했을 수 있어요. 새로고침해 주세요." };

  const { error, count } = await supabase.from("student_messages").insert(
    ids.map((uid) => ({
      user_id: uid,
      sender_id: user.id,
      sender_name: profile.name,
      title,
      body,
      kind: "attendance",
      related: { date, sections: absent.get(uid)!.sectionIds },
    })),
    { count: "exact" },
  );
  if (error) return { ok: false, error: `보내지 못했어요. ${error.message}` };

  revalidatePath("/admin/attendance");
  revalidatePath("/my", "layout");
  return { ok: true, sent: count ?? ids.length };
}
