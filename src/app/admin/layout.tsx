import type { Metadata, Viewport } from "next";
import { ADMIN_VIEWPORT } from "@/lib/theme-color";
import { requireCrew, ROLE_LABEL } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: { default: "관리자", template: "%s | 역전토익 관리자" },
  robots: { index: false, follow: false },
};

// 관리자 모드는 토스 회색 바탕이라 상태 표시줄 · 브라우저 색도 그 회색이다 (2026-10-11 — 핑크로 두면 회색 화면 위에 핑크 띠가 선다)
export const viewport: Viewport = ADMIN_VIEWPORT;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 조교도 들어온다 — 어느 화면까지 쓸 수 있는지는 화면마다 requireStaff()/requireCrew() 가 정한다
  const { profile } = await requireCrew();
  return (
    <AdminShell name={profile.name || "스태프"} roleLabel={ROLE_LABEL[profile.role]} role={profile.role}>
      {children}
    </AdminShell>
  );
}
