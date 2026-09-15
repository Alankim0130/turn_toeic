"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { canUseFeature, featureHref, NAV_MAIN, STUDENT_FEATURES, STUDENT_HUB } from "@/lib/site";
import { cn } from "@/lib/utils";
import { isActivePath } from "./NavLinks";

export type NavAccess = { active: boolean; enrollee: boolean };

/** 수강생전용 소개 페이지이거나 그 하위 기능 페이지인지 */
export function isStudentAreaPath(pathname: string) {
  return isActivePath(pathname, STUDENT_HUB.href) || STUDENT_FEATURES.some((f) => isActivePath(pathname, f.href));
}

const linkClass = (active: boolean) =>
  cn(
    "relative inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition hover:bg-brand-50 hover:text-brand-600",
    active ? "text-brand-600" : "text-ink-soft",
  );

function ActiveBar() {
  return <span aria-hidden className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-500" />;
}

/** 데스크톱 상단 메뉴. "수강생전용"은 하위 메뉴가 펼쳐진다 */
export function DesktopNav({ access }: { access: NavAccess }) {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1">
      {NAV_MAIN.map((item) => {
        if (item.group === "student") {
          return (
            <li key={item.href}>
              <StudentDropdown access={access} pathname={pathname} />
            </li>
          );
        }
        const active = isActivePath(pathname, item.href);
        return (
          <li key={item.href}>
            <Link href={item.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
              {item.label}
              {active && <ActiveBar />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function StudentDropdown({ access, pathname }: { access: NavAccess; pathname: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  // 페이지를 옮기면 닫는다 (렌더 중 파생 상태 갱신)
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const openNow = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  const active = isStudentAreaPath(pathname);

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="student-menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(linkClass(active), "gap-1.5")}
      >
        {STUDENT_HUB.label}
        <span
          aria-hidden
          className={cn(
            "inline-block h-1.5 w-1.5 border-b-2 border-r-2 border-current transition-transform",
            open ? "translate-y-0.5 -rotate-[135deg]" : "-translate-y-0.5 rotate-45",
          )}
        />
        {active && <ActiveBar />}
      </button>

      <div
        id="student-menu"
        className={cn(
          "absolute left-1/2 top-full z-50 w-[36rem] -translate-x-1/2 pt-3 transition duration-150",
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
        )}
      >
        <div className="card p-3">
          <ul className="grid grid-cols-2 gap-1">
            {STUDENT_FEATURES.map((f) => {
              const usable = canUseFeature(f, access);
              const current = isActivePath(pathname, f.href);
              return (
                <li key={f.key}>
                  <Link
                    href={featureHref(f, access)}
                    onClick={() => setOpen(false)}
                    aria-current={current ? "page" : undefined}
                    className={cn("flex items-center gap-3 rounded-xl p-3 transition hover:bg-brand-50", current && "bg-brand-50")}
                  >
                    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100">
                      <Icon name={f.icon} size={28} />
                      {!usable && (
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-md bg-paper shadow-soft ring-1 ring-line">
                          <Icon name="lock" size={13} />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-black text-ink">
                        {f.label}
                        {!usable && <span className="sr-only">(수강생 전용, 잠김)</span>}
                      </span>
                      <span className="block truncate text-xs text-slate">{f.summary}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5 text-xs">
            <span className="text-slate">{access.active ? "모든 기능을 이용할 수 있어요" : "수강생이 되면 모두 열려요"}</span>
            <Link href={STUDENT_HUB.href} onClick={() => setOpen(false)} className="font-bold text-brand-600 hover:underline">
              수강생전용 한눈에 보기 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
