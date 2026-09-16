"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { NAV_ADMIN } from "@/lib/site";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/(auth)/actions";

export function isAdminActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
}

/**
 * 데스크톱 사이드바.
 * 메뉴가 화면보다 길면 사이드바 안에서만 스크롤한다 — 휠이 메뉴 위에 있으면 메뉴가 내려가고,
 * 끝에 닿아도 본문으로 스크롤이 넘어가지 않는다(overscroll-contain).
 */
export function AdminSidebar({ name, roleLabel }: { name: string; roleLabel: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] self-start overflow-y-auto overscroll-contain md:block">
      <div className="card p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper ring-1 ring-brand-100">
            <Icon name="admin" size={26} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-ink">{name}</p>
            <p className="text-xs font-semibold text-brand-600">{roleLabel}</p>
          </div>
        </div>
        <nav aria-label="관리자 메뉴">
          <ul className="space-y-0.5">
            {NAV_ADMIN.map((item) => {
              const active = isAdminActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                      active ? "bg-brand-500 text-white shadow-pink" : "text-ink-soft hover:bg-brand-50 hover:text-brand-600",
                    )}
                  >
                    <Icon name={item.icon} size={22} className={cn(active && "brightness-0 invert")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-3 space-y-1 border-t border-line pt-3">
          <Link href="/my" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-brand-50 hover:text-brand-600">
            <Icon name="profile" size={22} />
            학생 페이지로
          </Link>
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink-soft hover:bg-brand-50 hover:text-brand-600">
              <Icon name="logout" size={22} />
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

/** 모바일 상단 가로 스크롤 탭 */
export function AdminMobileTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="관리자 메뉴" className="-mx-4 mb-5 overflow-x-auto px-4 md:hidden">
      <ul className="flex w-max gap-2 pb-1">
        {NAV_ADMIN.map((item) => {
          const active = isAdminActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-bold transition",
                  active ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-paper text-ink-soft",
                )}
              >
                <Icon name={item.icon} size={16} className={cn(active && "brightness-0 invert")} />
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <Link href="/my" className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-paper px-3.5 py-2 text-xs font-bold text-ink-soft">
            <Icon name="profile" size={16} />
            학생 페이지
          </Link>
        </li>
      </ul>
    </nav>
  );
}
