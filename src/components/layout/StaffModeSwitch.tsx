"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/** 지금 보고 있는 화면이 관리자 화면인가 */
export const isStaffMode = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");

const MODES: { key: "student" | "staff"; label: string; href: string; icon: IconName }[] = [
  { key: "student", label: "학생 모드", href: "/my", icon: "profile" },
  { key: "staff", label: "강사 모드", href: "/admin", icon: "admin" },
];

/**
 * 강사 모드 ↔ 학생 모드 전환 (2026-09-16 Alan 요청).
 *
 * 모드는 따로 저장하지 않고 **지금 주소로 정해진다** — `/admin` 아래면 강사 모드, 그 밖은 학생 모드.
 * 저장해 두면 새로고침·뒤로가기·다른 기기에서 배지와 실제 화면이 어긋나는데, 주소로 정하면 그럴 일이 없다.
 * 화면을 바꿀 뿐이라 권한은 그대로다 — 학생 모드에서도 스태프는 수강생전용을 열어 볼 수 있다.
 */
export function StaffModeSwitch({ variant = "header", className }: { variant?: "header" | "panel"; className?: string }) {
  const pathname = usePathname();
  const staffMode = isStaffMode(pathname);
  const panel = variant === "panel";

  return (
    <div
      role="group"
      aria-label="화면 모드"
      className={cn("inline-flex items-center rounded-full bg-surface p-0.5 ring-1 ring-line", panel && "flex w-full", className)}
    >
      {MODES.map((m) => {
        const on = (m.key === "staff") === staffMode;
        const shared = cn(
          "flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-bold transition",
          panel ? "flex-1 px-3 py-2.5 text-sm" : "px-3 py-1.5 text-xs",
        );
        return on ? (
          <span key={m.key} aria-current="true" className={cn(shared, "bg-brand-500 text-white shadow-pink")}>
            <Icon name={m.icon} size={panel ? 20 : 16} className="brightness-0 invert" />
            {m.label}
          </span>
        ) : (
          <Link key={m.key} href={m.href} className={cn(shared, "text-ink-soft hover:text-brand-600")}>
            <Icon name={m.icon} size={panel ? 20 : 16} />
            {m.label}
          </Link>
        );
      })}
    </div>
  );
}
