"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/site";
import { cn } from "@/lib/utils";

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/my") return pathname === "/my";
  return pathname === href || pathname.startsWith(href + "/");
}

/** 새 창으로 나가는 링크 표시. 드롭다운 화살표처럼 CSS·SVG 로 그린 구조 기호라 힉스필드 아이콘을 쓰지 않는다 */
export function ExternalMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-3 w-3 shrink-0", className)}
    >
      <path d="M4.5 2.5h5v5" />
      <path d="M9.5 2.5 2.5 9.5" />
    </svg>
  );
}

export function NavLinks({ items, className, onNavigate }: { items: NavItem[]; className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className={cn("flex items-center gap-1", className)}>
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition hover:bg-brand-50 hover:text-brand-600",
                active ? "text-brand-600" : "text-ink-soft",
              )}
            >
              {item.label}
              {active && <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-500" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
