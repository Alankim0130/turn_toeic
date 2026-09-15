"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { NAV_ADMIN } from "@/lib/site";
import { cn } from "@/lib/utils";
import { isAdminActive } from "./AdminNav";

const BOTTOM_HREFS = ["/admin", "/admin/students", "/admin/sections", "/admin/verifications", "/admin/textbook-orders"];

/** 관리자 모바일 하단 네비 (5개) */
export function AdminBottomNav() {
  const pathname = usePathname();
  const items = BOTTOM_HREFS.map((h) => NAV_ADMIN.find((n) => n.href === h)!).filter(Boolean);

  return (
    <nav
      aria-label="관리자 하단 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 glass md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid h-[4.25rem] grid-cols-5">
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
                <span className={cn("flex h-8 w-11 items-center justify-center rounded-full transition", active ? "bg-brand-100" : "bg-transparent")}>
                  <Icon name={item.icon} size={24} className={cn(!active && "opacity-60 grayscale")} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
