"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navAdminFor } from "@/lib/site";
import { cn } from "@/lib/utils";
import { isAdminActive } from "./AdminNav";
import { NavTabIcon } from "@/components/layout/NavPending";

const BOTTOM_HREFS = ["/admin", "/admin/students", "/admin/sections", "/admin/verifications", "/admin/textbook-orders"];
/**
 * 조교의 하단 바 (2026-10-03 Alan 조교 권한) — 조교가 쓰는 여섯 화면 중 휴대폰에서 자주 여는 다섯.
 * 스터디 신청자는 햄버거 서랍에 있다. 위 줄은 대부분 조교가 못 여는 화면이라 그대로 거르면 두 칸만 남는다
 */
const ASSISTANT_BOTTOM_HREFS = ["/admin/attendance", "/admin/verifications", "/admin/live", "/admin/homework", "/admin/textbook-orders"];

/** 관리자 모바일 하단 네비 (5개) */
export function AdminBottomNav({ role }: { role?: string | null }) {
  const pathname = usePathname();
  // 조교는 쓸 수 있는 메뉴만 (2026-09-16 Alan) — 목록을 따로 두어도 메뉴 권한(navAdminFor)으로 한 번 더 거른다
  const allowed = navAdminFor(role);
  const hrefs = role === "assistant" ? ASSISTANT_BOTTOM_HREFS : BOTTOM_HREFS;
  const items = hrefs.map((h) => allowed.find((n) => n.href === h)).filter((n) => !!n);

  return (
    <nav
      aria-label="관리자 하단 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 glass md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid h-[4.25rem]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isAdminActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition",
                  active ? "text-brand-600" : "text-mist",
                )}
              >
                {/* 누른 칸은 다음 화면이 오기 전에도 바로 켜진다 (NavPending — 2026-10-09 화면 전환 속도) */}
                <NavTabIcon active={active} icon={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
