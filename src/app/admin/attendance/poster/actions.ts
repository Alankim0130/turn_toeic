"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 인쇄용 QR 새로 뽑기 — **강사·관리자만** (조교는 인쇄만 한다). 누르는 순간 붙어 있는 종이는 모두 안 찍힌다.
 * DB 함수(`rotate_attendance_poster`)가 is_staff 인지 한 번 더 본다.
 */
export async function rotateAttendancePoster(formData: FormData) {
  await requireStaff();
  if (formData.get("confirm") !== "on") redirect("/admin/attendance/poster?error=confirm");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rotate_attendance_poster");
  revalidatePath("/admin/attendance/poster");
  redirect(`/admin/attendance/poster?${error ? "error=save" : "rotated=1"}`);
}
