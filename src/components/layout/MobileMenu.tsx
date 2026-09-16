"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { canUseFeature, featureHref, NAV_MAIN, STUDENT_FEATURES, STUDENT_HUB } from "@/lib/site";
import { cn } from "@/lib/utils";
import { isActivePath } from "./NavLinks";
import { isStudentAreaPath, type NavAccess } from "./DesktopNav";
import { StaffModeSwitch } from "./StaffModeSwitch";
import { signOut } from "@/app/(auth)/actions";

const noopSubscribe = () => () => {};

/**
 * 모바일·태블릿 메뉴. 오른쪽에서 밀려나오는 패널이고 화면 전체를 덮지 않는다.
 * 헤더의 backdrop-filter 가 fixed 요소의 기준을 바꾸므로 body 로 포털한다.
 */
export function MobileMenu({
  signedIn,
  staff,
  name,
  access,
}: {
  signedIn: boolean;
  staff: boolean;
  name: string | null;
  access: NavAccess;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 페이지를 옮기면 닫는다 (렌더 중 파생 상태 갱신)
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  const itemClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-xl px-3 py-3 text-base font-bold transition",
      active ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-surface",
    );

  const drawer = (
    <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")} inert={!open}>
      {/* 뒤 화면은 살짝만 어둡게. 누르면 닫힌다 */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn("absolute inset-0 bg-ink/25 transition-opacity duration-300", open ? "opacity-100" : "opacity-0")}
      />

      <aside
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="전체 메뉴"
        className={cn(
          "absolute inset-y-0 right-0 flex w-[84%] max-w-sm flex-col bg-paper shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* 머리 */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
          <Logo height={24} link={false} />
          <button
            ref={closeRef}
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setOpen(false)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-brand-50"
          >
            <span aria-hidden className="absolute h-0.5 w-5 rotate-45 rounded bg-ink" />
            <span aria-hidden className="absolute h-0.5 w-5 -rotate-45 rounded bg-ink" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
          {/* 계정 */}
          <div className="mb-4 rounded-xl2 bg-surface p-3">
            {signedIn ? (
              <Link href="/my" className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper ring-1 ring-line">
                  <Icon name="profile" size={24} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-black text-ink">{name ? `${name}님` : "마이페이지"}</span>
                  <span className="block text-xs text-slate">{access.active ? "수강생전용 기능 이용 중" : "마이페이지로 이동"}</span>
                </span>
              </Link>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/login" className="btn-dark !py-2.5">
                  로그인
                </Link>
                <Link href="/signup" className="btn-secondary !py-2.5">
                  회원가입
                </Link>
              </div>
            )}
          </div>

          <nav aria-label="모바일 메뉴">
            <ul className="space-y-1">
              {NAV_MAIN.map((item) => {
                if (item.group !== "student") {
                  const active = isActivePath(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link href={item.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                        <Icon name={item.icon} size={26} />
                        {item.label}
                      </Link>
                    </li>
                  );
                }

                // 수강생전용 묶음
                return (
                  <li key={item.href} className="py-1">
                    <div className="rounded-xl2 border border-brand-100 bg-brand-50/40 p-2">
                      <Link href={STUDENT_HUB.href} className={cn(itemClass(isActivePath(pathname, STUDENT_HUB.href)), "justify-between")}>
                        <span className="flex items-center gap-3">
                          <Icon name={STUDENT_HUB.icon} size={26} />
                          {STUDENT_HUB.label}
                        </span>
                        <span className="text-xs font-bold text-brand-600">{access.active ? "이용 중" : "소개 보기"}</span>
                      </Link>
                      <ul className="mt-1 grid grid-cols-2 gap-1">
                        {STUDENT_FEATURES.map((f) => {
                          const usable = canUseFeature(f, access);
                          const current = isActivePath(pathname, f.href);
                          return (
                            <li key={f.key}>
                              <Link
                                href={featureHref(f, access)}
                                aria-current={current ? "page" : undefined}
                                className={cn(
                                  "flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm font-bold transition",
                                  current ? "bg-paper text-brand-700 shadow-soft" : "text-ink-soft hover:bg-paper",
                                )}
                              >
                                <span className="relative shrink-0">
                                  <Icon name={f.icon} size={22} className={cn(!usable && "opacity-70")} />
                                  {!usable && (
                                    <span className="absolute -bottom-1 -right-1.5 rounded bg-paper p-px shadow-soft">
                                      <Icon name="lock" size={11} />
                                    </span>
                                  )}
                                </span>
                                <span className="truncate">{f.label}</span>
                                {!usable && <span className="sr-only">(수강생 전용, 잠김)</span>}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                      {!access.active && <p className="px-2 pb-1 pt-2 text-xs text-slate">수강생이 되면 모두 열려요</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* 바닥 */}
        <div className="shrink-0 space-y-2 border-t border-line p-3">
          {staff && <StaffModeSwitch variant="panel" />}
          {signedIn && (
            <form action={signOut}>
              <button type="submit" className="btn-ghost w-full">
                로그아웃
              </button>
            </form>
          )}
        </div>
      </aside>
    </div>
  );

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label="메뉴 열기"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
        className={cn(
          "relative flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-full hover:bg-brand-50",
          isStudentAreaPath(pathname) && "text-brand-600",
        )}
      >
        <span aria-hidden className="h-0.5 w-5 rounded bg-ink" />
        <span aria-hidden className="h-0.5 w-5 rounded bg-ink" />
        <span aria-hidden className="h-0.5 w-5 rounded bg-ink" />
      </button>
      {mounted && createPortal(drawer, document.body)}
    </div>
  );
}
