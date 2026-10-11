"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { forgetStudentMode, rememberStudentMode } from "@/lib/staff-landing";

/**
 * 강사 · 관리자의 "지금 쓰는 모드" 기억 (2026-10-11 — 첫 화면은 관리자 모드, src/lib/staff-landing.ts).
 * 화면을 바꾸는 것이 아니라 **쿠키 하나를 두고 지우는 것**이 전부다 — 모드 자체는 여전히 주소가 정한다.
 */

/** 학생 레이아웃(`/my*`)에 강사 · 관리자일 때만 — 학생 화면을 옮겨 다니는 동안 한 시간짜리 쿠키를 계속 밀어 둔다 */
export function StudentModeKeeper() {
  const pathname = usePathname();
  useEffect(() => {
    rememberStudentMode();
  }, [pathname]);
  return null;
}

/** 관리자 틀(`AdminShell`)에 — 관리자 화면에 들어오면 학생 모드 기억을 지운다 */
export function AdminModeMark() {
  useEffect(() => {
    forgetStudentMode();
  }, []);
  return null;
}
