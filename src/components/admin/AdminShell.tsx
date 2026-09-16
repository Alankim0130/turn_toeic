import { AdminSidebar, AdminMobileTabs } from "./AdminNav";
import { AdminBottomNav } from "./AdminBottomNav";

export function AdminShell({ name, roleLabel, role, children }: { name: string; roleLabel: string; role?: string | null; children: React.ReactNode }) {
  return (
    <>
      <div className="container-x py-6 md:py-8">
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
