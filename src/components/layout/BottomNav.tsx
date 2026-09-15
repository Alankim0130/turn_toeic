"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { NAV_BOTTOM } from "@/lib/site";
import { cn } from "@/lib/utils";
import { isActivePath } from "./NavLinks";

/** 모바일 하단 네비게이션. 관리자 영역은 자체 네비를 쓰므로 숨긴다. */
export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <nav
      aria-label="하단 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 glass md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid h-[4.25rem] grid-cols-5">
        {NAV_BOTTOM.map((item) => {
          const active = isActivePath(pathname, item.href);
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
                <span
                  className={cn(
                    "flex h-8 w-11 items-center justify-center rounded-full transition",
                    active ? "bg-brand-100" : "bg-transparent",
                  )}
                >
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
