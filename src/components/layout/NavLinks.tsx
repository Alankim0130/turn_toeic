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
                "relative rounded-full px-3.5 py-2 text-sm font-semibold transition hover:bg-brand-50 hover:text-brand-600",
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
