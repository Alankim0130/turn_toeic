"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { KakaoMark } from "@/components/ui/BrandMarks";
import { canUseFeature, CONTACT_OPTIONS, featureHref, NAV_MAIN, STUDENT_FEATURES, STUDENT_HUB } from "@/lib/site";
import { cn } from "@/lib/utils";
import { ExternalMark, isActivePath } from "./NavLinks";

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

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-1.5 w-1.5 border-b-2 border-r-2 border-current transition-transform",
        open ? "translate-y-0.5 -rotate-[135deg]" : "-translate-y-0.5 rotate-45",
      )}
    />
  );
}

/** 데스크톱 상단 메뉴. "수강생전용"과 "연락하기"는 하위 메뉴가 펼쳐진다 */
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
        if (item.group === "contact") {
          return (
            <li key={item.href}>
              <ContactDropdown pathname={pathname} />
            </li>
          );
        }
        if (item.external) {
          // 바깥으로 나가는 링크. 새 창으로 열고 현재 페이지 표시는 없다
          return (
            <li key={item.href}>
              <a href={item.href} target="_blank" rel="noopener noreferrer" className={cn(linkClass(false), "gap-1")}>
                {item.label}
                <ExternalMark className="text-mist" />
                <span className="sr-only">(새 창)</span>
              </a>
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

/**
 * 드롭다운 공통 동작 — 마우스를 올리면 열리고 떼면 잠시 뒤 닫힌다, 바깥 클릭·ESC·페이지 이동으로 닫힌다.
 * 수강생전용과 연락하기가 같이 쓴다 (한쪽만 고치면 두 메뉴가 다르게 움직인다).
 * 돌려주는 값은 **구조 분해해서** 받을 것 — ref 가 든 객체를 `d.open` 처럼 읽으면 react-hooks/refs 가 렌더 중 ref 접근으로 본다.
 */
function useDropdown(pathname: string) {
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
  const toggle = () => setOpen((v) => !v);
  const close = () => setOpen(false);

  return { open, wrapRef, openNow, closeSoon, toggle, close };
}

const panelClass = (open: boolean) =>
  cn("absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3 transition duration-150", open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0");

function StudentDropdown({ access, pathname }: { access: NavAccess; pathname: string }) {
  const { open, wrapRef, openNow, closeSoon, toggle, close } = useDropdown(pathname);
  const active = isStudentAreaPath(pathname);

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button type="button" aria-expanded={open} aria-haspopup="true" aria-controls="student-menu" onClick={toggle} className={cn(linkClass(active), "gap-1.5")}>
        {STUDENT_HUB.label}
        <Chevron open={open} />
        {active && <ActiveBar />}
      </button>

      <div id="student-menu" className={cn(panelClass(open), "w-[36rem]")}>
        <div className="card p-3">
          <ul className="grid grid-cols-2 gap-1">
            {STUDENT_FEATURES.map((f) => {
              const usable = canUseFeature(f, access);
              const current = isActivePath(pathname, f.href);
              return (
                <li key={f.key}>
                  <Link
                    href={featureHref(f, access)}
                    onClick={close}
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
            <Link href={STUDENT_HUB.href} onClick={close} className="font-bold text-brand-600 hover:underline">
              수강생전용 한눈에 보기 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 연락하기 드롭다운 (2026-10-01 Alan — 연락하기 · 네이버 상담예약 두 항목을 하나로 합치고 셋 중 고른다).
 * 목록은 `CONTACT_OPTIONS` 한곳 — 카카오톡(새 창) · 이메일 문의(/contact) · 네이버 예약(새 창). 카카오 줄은 노란 타일에 카카오 심벌.
 */
function ContactDropdown({ pathname }: { pathname: string }) {
  const { open, wrapRef, openNow, closeSoon, toggle, close } = useDropdown(pathname);
  const active = isActivePath(pathname, "/contact");

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button type="button" aria-expanded={open} aria-haspopup="true" aria-controls="contact-menu" onClick={toggle} className={cn(linkClass(active), "gap-1.5")}>
        연락하기
        <Chevron open={open} />
        {active && <ActiveBar />}
      </button>

      <div id="contact-menu" className={cn(panelClass(open), "w-72")}>
        <div className="card p-2">
          <ul className="space-y-0.5">
            {CONTACT_OPTIONS.map((o) => {
              const current = !o.external && isActivePath(pathname, o.href);
              const body = (
                <>
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1",
                      o.key === "kakao" ? "bg-[#FEE500] ring-[#F2DA00]" : "bg-brand-50 ring-brand-100",
                    )}
                  >
                    {o.key === "kakao" ? <KakaoMark size={22} /> : <Icon name={o.icon} size={24} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-ink">{o.label}</span>
                    <span className="block truncate text-xs text-slate">{o.summary}</span>
                  </span>
                  {o.external && <ExternalMark className="text-mist" />}
                </>
              );
              const className = cn("flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-brand-50", current && "bg-brand-50");
              return (
                <li key={o.key}>
                  {o.external ? (
                    <a href={o.href} target="_blank" rel="noopener noreferrer" onClick={close} className={className}>
                      {body}
                      <span className="sr-only">(새 창)</span>
                    </a>
                  ) : (
                    <Link href={o.href} onClick={close} aria-current={current ? "page" : undefined} className={className}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
