"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { adminHomeFor } from "@/lib/site";

/** 지금 보고 있는 화면이 관리자 화면인가 */
export const isStaffMode = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");

/** 관리자 쪽 칸의 이름은 그 사람 등급을 따른다 (2026-09-16 Alan) */
const STAFF_LABEL: Record<string, string> = { admin: "관리자 모드", instructor: "강사 모드", assistant: "조교 모드" };
const staffLabelOf = (role?: string | null) => STAFF_LABEL[role ?? ""] ?? "강사 모드";

const modesFor = (role?: string | null): { key: "student" | "staff"; label: string; href: string; icon: IconName }[] => [
  { key: "student", label: "학생 모드", href: "/my", icon: "profile" },
  { key: "staff", label: staffLabelOf(role), href: adminHomeFor(role), icon: "admin" },
];

/**
 * 강사 모드 ↔ 학생 모드 전환 (2026-09-16 Alan 요청).
 *
 * 모드는 따로 저장하지 않고 **지금 주소로 정해진다** — `/admin` 아래면 강사 모드, 그 밖은 학생 모드.
 * 저장해 두면 새로고침·뒤로가기·다른 기기에서 배지와 실제 화면이 어긋나는데, 주소로 정하면 그럴 일이 없다.
 * 화면을 바꿀 뿐이라 권한은 그대로다 — 학생 모드에서도 스태프는 수강생전용을 열어 볼 수 있다.
 */
export function StaffModeSwitch({
  variant = "header",
  role,
  className,
}: {
  variant?: "header" | "panel" | "compact";
  role?: string | null;
  className?: string;
}) {
  const pathname = usePathname();
  const staffMode = isStaffMode(pathname);
  const MODES = modesFor(role);
  const panel = variant === "panel";

  /**
   * 좁은 화면(햄버거 옆)의 모드 칸 (2026-09-17 Alan 요청 —
   * "현재 나의 상태가 보이고 오른쪽에 작은 아이콘을 클릭해서 변경할 수 있으면 좋겠어").
   *
   * **왼쪽은 지금 상태를 알려 주는 배지**(누르는 곳이 아니다), **오른쪽 동그란 버튼이 바꾼다.**
   * 버튼의 그림은 **갈 곳**이라 한 번 보면 어디로 가는지 알 수 있다.
   * 두 칸 토글은 로고·햄버거와 한 줄에 놓기엔 넓어서 이 모양을 따로 뒀다.
   */
  if (variant === "compact") {
    const now = staffMode ? MODES[1] : MODES[0];
    const target = staffMode ? MODES[0] : MODES[1];
    return (
      <div className={cn("flex shrink-0 items-center gap-1", className)}>
        <span
          aria-current="true"
          title={now.label}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-500 px-2 py-2 text-xs font-bold text-white shadow-pink min-[360px]:px-3"
        >
          <Icon name={now.icon} size={16} className="brightness-0 invert" />
          {/* 360px 미만에서는 글자를 접고 아이콘만 (2026-09-18 — 오른쪽에 로그인 표시가 더해져 320px 에서 넘쳤다) */}
          <span className="max-[359px]:sr-only">{now.label}</span>
        </span>
        <Link
          href={target.href}
          aria-label={`${target.label}로 바꾸기`}
          title={`${target.label}로 바꾸기`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-line transition hover:bg-brand-50 hover:ring-brand-300"
        >
          <Icon name={target.icon} size={16} />
        </Link>
      </div>
    );
  }

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
