import type { Metadata } from "next";
import { requireCrew, ROLE_LABEL } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: { default: "관리자", template: "%s | 역전토익 관리자" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 조교도 들어온다 — 어느 화면까지 쓸 수 있는지는 화면마다 requireStaff()/requireCrew() 가 정한다
  const { profile } = await requireCrew();
  return (
    <AdminShell name={profile.name || "스태프"} roleLabel={ROLE_LABEL[profile.role]} role={profile.role}>
      {children}
    </AdminShell>
  );
}
