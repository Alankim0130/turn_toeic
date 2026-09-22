"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 출석 명단 (2026-09-21 Alan — "조교에게도 명단을 열어줘"). **강사·관리자·조교** 가 쓴다.
 * 쓰기는 DB 함수(`attendance_set`)가 crew 인지 한 번 더 본다.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 출석 인정 · 결석 · 되돌리기. 사유는 꼭 적는다 (되돌리기 빼고) */
export async function setAttendance(formData: FormData) {
  await requireCrew();
  const student = String(formData.get("student_id") ?? "");
  const section = Number(formData.get("section_id"));
  const date = String(formData.get("date") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const back = `/admin/attendance?date=${DATE_RE.test(date) ? date : ""}`;
  if (!student || !Number.isInteger(section) || !DATE_RE.test(date) || !["manual", "absent", "clear"].includes(status)) redirect(`${back}&error=invalid`);
  if (status !== "clear" && !note) redirect(`${back}&error=note#s${section}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("attendance_set", { p_student: student, p_section: section, p_date: date, p_status: status, p_note: note });
  revalidatePath("/admin/attendance");
  redirect(`${back}&${error ? `error=${error.message.includes("note") ? "note" : "save"}` : "ok=1"}#s${section}`);
}
