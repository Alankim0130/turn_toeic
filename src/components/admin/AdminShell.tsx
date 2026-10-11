import { AdminSidebar, AdminMobileTabs } from "./AdminNav";
import { AdminBottomNav } from "./AdminBottomNav";
import { AdminModeMark } from "@/components/layout/ModeMemory";

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
      {/* 관리자 화면에 들어왔다 — 학생 모드 기억(쿠키)을 지운다. 다음에 앱을 켜면 관리자 모드다 (2026-10-11, src/lib/staff-landing.ts) */}
      <AdminModeMark />
    </>
  );
}
