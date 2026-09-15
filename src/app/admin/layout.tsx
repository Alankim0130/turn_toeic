import type { Metadata } from "next";
import { requireStaff, ROLE_LABEL } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: { default: "관리자", template: "%s | 역전토익 관리자" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  return (
    <AdminShell name={profile.name || "스태프"} roleLabel={ROLE_LABEL[profile.role]}>
      {children}
    </AdminShell>
  );
}
