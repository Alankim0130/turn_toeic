"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ScanResult } from "@/lib/attendance";

/**
 * 출석 찍기 (2026-09-21). QR 을 찍어 열린 `/attend?t=…` 와 `/my/attendance` 의 코드 입력이 함께 쓴다.
 * 판정은 전부 DB 함수 `public.attendance_scan` 이 한다 — 여기서는 로그인한 사람의 세션으로 부르기만 한다.
 */
export async function scanAttendance(token: string, method: "qr" | "code"): Promise<ScanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { action: "login_required" };
  const { data, error } = await supabase.rpc("attendance_scan", { p_token: String(token ?? "").slice(0, 40), p_method: method });
  if (error || !data) {
    console.error("[attendance] scan", error?.message);
    return { action: "error" };
  }
  revalidatePath("/my/attendance");
  return data as ScanResult;
}

export type CodeState = { result?: ScanResult };

/** 앱 안 코드 입력 — 강의실 화면의 6자리 */
export async function submitAttendanceCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { result: { action: "bad_token" } };
  return { result: await scanAttendance(code, "code") };
}
