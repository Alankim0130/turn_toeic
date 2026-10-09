import { AdminSidebar, AdminMobileTabs } from "./AdminNav";
import { AdminBottomNav } from "./AdminBottomNav";

export function AdminShell({ name, roleLabel, role, children }: { name: string; roleLabel: string; role?: string | null; children: React.ReactNode }) {
  return (
    <>
      {/* data-admin-theme — 이 아래(와 :root 전체)가 토스 모양 토큰으로 바뀐다 (globals.css "관리자 모드 = 토스 모양") */}
      <div data-admin-theme="" className="container-x py-6 md:py-8">
        <div className="md:grid md:grid-cols-[230px_1fr] md:gap-8">
          <AdminSidebar name={name} roleLabel={roleLabel} role={role} />
          <div className="min-w-0 pb-24 md:pb-0">
            <AdminMobileTabs role={role} />
            {children}
          </div>
        </div>
      </div>
      <AdminBottomNav role={role} />
    </>
  );
}
