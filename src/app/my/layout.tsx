import { isStaff, requireUser } from "@/lib/auth";
import { StudentModeKeeper } from "@/components/layout/ModeMemory";

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser("/my");

  // 마이페이지 위에 있던 메뉴 줄(대시보드 · 등업신청 · 내 시간표 …)은 2026-09-18 Alan 요청으로 없앴다 —
  // 햄버거 메뉴(`MobileMenu`, `NAV_DRAWER`)가 묶음으로 다 담는다. PC 는 헤더 메뉴. **다시 만들지 말 것**
  return (
    <div className="container-x py-6 sm:py-10">
      {/* 강사 · 관리자가 학생 화면을 보는 동안 "학생 모드 중" 쿠키를 둔다 — 새로고침 · 앱 켜기가 관리자 모드로 돌아가지 않게 (2026-10-11, src/lib/staff-landing.ts) */}
      {isStaff(profile?.role) && <StudentModeKeeper />}
      {children}
    </div>
  );
}
