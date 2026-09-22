"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 출석 QR 새로 만들기 — **강사·관리자만** (조교는 PDF 받기만 한다). 누르는 순간 붙어 있는 종이는 모두 안 찍힌다.
 * DB 함수(`rotate_attendance_poster`)가 is_staff 인지 한 번 더 본다. 끝나면 포스터 화면이 "새 포스터가 준비됐어요" 와 PDF 받기를 띄운다.
 */
export async function rotateAttendancePoster(formData: FormData) {
  await requireStaff();
  if (formData.get("confirm") !== "on") redirect("/admin/attendance/poster?error=confirm");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rotate_attendance_poster");
  revalidatePath("/admin/attendance/poster");
  redirect(`/admin/attendance/poster?${error ? "error=save" : "made=1"}`);
}
