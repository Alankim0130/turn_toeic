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
  // 끝난 기수를 정정하던 중이면 그 기수 화면으로 돌아간다 (page.tsx 의 ?term=, 종강 뒤 7일)
  const term = String(formData.get("term") ?? "");
  const back = `/admin/attendance?${/^d{4}-d{2}$/.test(term) ? `term=${term}&` : ""}date=${DATE_RE.test(date) ? date : ""}`;
  if (!student || !Number.isInteger(section) || !DATE_RE.test(date) || !["manual", "absent", "clear"].includes(status)) redirect(`${back}&error=invalid`);
  if (status !== "clear" && !note) redirect(`${back}&error=note#s${section}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("attendance_set", { p_student: student, p_section: section, p_date: date, p_status: status, p_note: note });
  revalidatePath("/admin/attendance");
  // not_in_section = 그 반 학생이 아니거나 · 그 날 수업이 없거나 · 그 반의 개강일~종강일 밖 날짜 (DB 가 다시 본다)
  const code = error ? (error.message.includes("note") ? "note" : error.message.includes("not_in_section") ? "term" : "save") : null;
  redirect(`${back}&${code ? `error=${code}` : "ok=1"}#s${section}`);
}
