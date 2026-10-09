"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { activeAdminHref, navAdminFor, navAdminSectionsFor } from "@/lib/site";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/(auth)/actions";
import { NavPendingRing } from "@/components/layout/NavPending";

export function isAdminActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
}

/**
 * 데스크톱 사이드바 — 햄버거 서랍과 같은 묶음(운영 · 학생 · 수업 편성 · 수업 자료 · 학습)으로 그린다 (2026-10-02 Alan).
 * 메뉴가 화면보다 길면 사이드바 안에서만 스크롤한다 — 휠이 메뉴 위에 있으면 메뉴가 내려가고,
 * 끝에 닿아도 본문으로 스크롤이 넘어가지 않는다(overscroll-contain).
 * 켜 둘 메뉴는 **가장 긴 주소** 하나다 (`/admin/study/plan` 이 `/admin/study` 까지 켜지 않게).
 * 모양은 토스 — 켜진 줄은 연한 바탕에 파란 글자(꽉 찬 칸 · 그림자 없음), 휴대폰 상단 탭의 켜진 칸은 잉크색 알약 (2026-10-09 Alan "관리자모드는 토스 디자인처럼").
 */
export function AdminSidebar({ name, roleLabel, role }: { name: string; roleLabel: string; role?: string | null }) {
  const pathname = usePathname();
  const sections = navAdminSectionsFor(role);
  const activeHref = activeAdminHref(navAdminFor(role), pathname);
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
          {sections.map((sec) => (
            <div key={sec.label} className="pt-2">
              <p aria-hidden className="flex items-center gap-2 px-3 pb-1 text-[11px] font-bold tracking-wide text-mist">
                {sec.label}
                <span className="flex-1 border-t border-dashed border-line" />
              </p>
              <ul aria-label={sec.label} className="space-y-0.5">
                {sec.items.map((item) => {
                  const active = item.href === activeHref;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                          active ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-surface hover:text-ink",
                        )}
                      >
                        <Icon name={item.icon} size={22} />
                        {item.label}
                        <NavPendingRing />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-3 space-y-1 border-t border-line pt-3">
          <Link href="/my" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface hover:text-ink">
            <Icon name="profile" size={22} />
            학생 모드로
          </Link>
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink-soft hover:bg-surface hover:text-ink">
              <Icon name="logout" size={22} />
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

/** 모바일 상단 가로 스크롤 탭 (평평한 목록 — 좁은 화면에서는 한 줄로 넘긴다) */
export function AdminMobileTabs({ role }: { role?: string | null }) {
  const pathname = usePathname();
  const items = navAdminFor(role);
  const activeHref = activeAdminHref(items, pathname);
  return (
    <nav aria-label="관리자 메뉴" className="-mx-4 mb-5 overflow-x-auto px-4 md:hidden">
      <ul className="flex w-max gap-2 pb-1">
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-bold transition",
                  active ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink-soft",
                )}
              >
                <Icon name={item.icon} size={16} className={cn(active && "brightness-0 invert")} />
                {item.label}
                <NavPendingRing />
              </Link>
            </li>
          );
        })}
        <li>
          <Link href="/my" className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-paper px-3.5 py-2 text-xs font-bold text-ink-soft">
            <Icon name="profile" size={16} />
            학생 모드
          </Link>
        </li>
      </ul>
    </nav>
  );
}
