"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ScanResult } from "@/lib/attendance";

/**
 * 출석 찍기 (2026-09-21). 강의실 앞 출석 QR 포스터를 찍어 열린 `/attend?t=…` 가 쓴다.
 * 판정은 전부 DB 함수 `public.attendance_scan` 이 한다 — 여기서는 로그인한 사람의 세션으로 부르기만 한다.
 * (6자리 코드 입력은 30초 화면 QR 과 함께 2026-09-22 에 없앴다 — 포스터 QR 하나로 통일)
 */
export async function scanAttendance(token: string): Promise<ScanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { action: "login_required" };
  const { data, error } = await supabase.rpc("attendance_scan", { p_token: String(token ?? "").slice(0, 40) });
  if (error || !data) {
    console.error("[attendance] scan", error?.message);
    return { action: "error" };
  }
  revalidatePath("/my/attendance");
  return data as ScanResult;
}
