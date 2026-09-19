"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { canUseFeature, featureHref, NAV_DRAWER, navAdminFor, STUDENT_FEATURES, type NavItem, type NavSection } from "@/lib/site";
import { cn } from "@/lib/utils";
import { ExternalMark, isActivePath } from "./NavLinks";
import { isStudentAreaPath, type NavAccess } from "./DesktopNav";
import { StaffModeSwitch, isStaffMode } from "./StaffModeSwitch";
import { Avatar } from "./Avatar";
import { InstallApp } from "@/components/pwa/InstallApp";
import { RefreshButton } from "@/components/pwa/RefreshButton";
import { signOut } from "@/app/(auth)/actions";

const noopSubscribe = () => () => {};

/** "2026-09-30" → "9/30" (서랍 머리의 종강·개강 배지) */
const monthDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
};

/**
 * 모바일·태블릿 메뉴 (2026-09-18 Alan — "햄버거를 첫토익처럼 왼쪽으로, 슬라이드도 왼쪽에서").
 * **왼쪽에서 밀려나오는 서랍**이고 화면 전체를 덮지 않는다. 헤더의 backdrop-filter 가 fixed 요소의 기준을 바꾸므로 body 로 포털한다.
 *
 * 맨 위는 내 정보(이름 · 등급 · 종강/개강 날짜), 그 아래 메뉴는 `NAV_DRAWER` 의 묶음(안내 · 마이페이지 · 수업 · 학습 · 연락)이다 —
 * 마이페이지 위에 있던 메뉴 줄을 여기로 옮기고 정리한 것. `/admin` 아래에서는 관리자 메뉴 한 묶음(`navAdminFor`)이 대신 나온다.
 */
export function MobileMenu({
  signedIn,
  staff,
  role,
  name,
  roleLabel,
  access,
  until,
  opensOn,
}: {
  signedIn: boolean;
  staff: boolean;
  role?: string | null;
  name: string | null;
  /** 등급 이름 (테스트 등급이면 그것). 서랍 머리의 칩 */
  roleLabel: string | null;
  access: NavAccess;
  /** 수강생전용을 쓸 수 있는 마지막 날(종강일). 스태프는 null */
  until: string | null;
  /** 예비등록생이면 가장 가까운 개강일 */
  opensOn: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const adminMode = isStaffMode(pathname);
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

  // 관리자 모드에서는 그 등급의 관리자 메뉴 한 묶음 (2026-09-16 Alan — 조교는 쓸 수 있는 줄만)
  const sections: NavSection[] = adminMode
    ? [{ label: staffLabel(role), items: navAdminFor(role) }]
    : NAV_DRAWER;

  // 머리 오른쪽 날짜 배지: 수강 중이면 종강일, 개강 전이면 개강일. 둘 다 없으면(스태프·회원) 안 그린다
  const badge = access.active && until
    ? { label: "종강", value: monthDay(until) }
    : opensOn
      ? { label: "개강", value: monthDay(opensOn) }
      : until
        ? { label: "종강", value: monthDay(until) }
        : null;

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
          "absolute inset-y-0 left-0 flex w-[84%] max-w-sm flex-col bg-paper shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* 머리: 내 정보 (첫토익처럼 맨 위에 프로필) */}
        <div className="shrink-0 border-b border-line bg-gradient-to-br from-brand-50 to-paper px-4 pb-4 pt-2">
          <div className="flex h-12 items-center justify-between">
            <Logo height={22} link={false} />
            <button
              ref={closeRef}
              type="button"
              aria-label="메뉴 닫기"
              onClick={() => setOpen(false)}
              className="relative -mr-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-brand-100/60"
            >
              <span aria-hidden className="absolute h-0.5 w-5 rotate-45 rounded bg-ink" />
              <span aria-hidden className="absolute h-0.5 w-5 -rotate-45 rounded bg-ink" />
            </button>
          </div>

          {signedIn ? (
            <Link href="/my" className="mt-1 flex items-center gap-3">
              <Avatar name={name} size={48} className="shadow-pink" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-black leading-tight text-ink">{name ? `${name}님` : "마이페이지"}</span>
                {roleLabel && <span className="chip mt-1.5 !px-2.5 !py-0.5">{roleLabel}</span>}
              </span>
              {badge && (
                <span className="flex shrink-0 flex-col items-center rounded-xl2 bg-paper px-3 py-1.5 shadow-soft ring-1 ring-line">
                  <span className="text-[10px] font-bold leading-tight text-mist">{badge.label}</span>
                  <span className="text-base font-black leading-tight text-brand-600">{badge.value}</span>
                </span>
              )}
            </Link>
          ) : (
            <div className="mt-1">
              <p className="text-sm font-bold text-ink">로그인하면 내 시간표와 수강생전용 메뉴가 열려요</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/login" className="btn-dark !py-2.5">
                  로그인
                </Link>
                <Link href="/signup" className="btn-secondary !py-2.5">
                  회원가입
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* 메뉴 — 묶음마다 작은 제목 + 점선 */}
        <nav aria-label={adminMode ? "관리자 메뉴" : "전체 메뉴"} className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
          {sections.map((sec) => (
            <div key={sec.label} className="pt-3">
              <p aria-hidden className="flex items-center gap-2 px-3 pb-1 text-[11px] font-bold tracking-wide text-mist">
                {sec.label}
                <span className="flex-1 border-t border-dashed border-line" />
              </p>
              <ul aria-label={sec.label} className="space-y-0.5">
                {sec.items.map((item) => (
                  <li key={item.href}>
                    <Row item={item} pathname={pathname} access={access} onExternal={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!adminMode && !access.active && (
            <p className="px-3 pt-4 text-xs text-slate">자물쇠가 붙은 메뉴는 수강생이 되면 열려요</p>
          )}
        </nav>

        {/* 바닥 */}
        <div className="shrink-0 space-y-2 border-t border-line p-3">
          {/* 홈 화면 앱은 주소창이 없어 새로고침할 길이 없다 (2026-09-16 Alan) — 앱으로 열었을 때만 보인다 */}
          <RefreshButton onStart={() => setOpen(false)} />
          <InstallApp variant="menu" onStart={() => setOpen(false)} />
          {staff && <StaffModeSwitch variant="panel" role={role} />}
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
          "relative -ml-2 flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-full text-ink hover:bg-brand-50",
          isStudentAreaPath(pathname) && "text-brand-600",
        )}
      >
        <span aria-hidden className="h-0.5 w-5 rounded bg-current" />
        <span aria-hidden className="h-0.5 w-5 rounded bg-current" />
        <span aria-hidden className="h-0.5 w-5 rounded bg-current" />
      </button>
      {mounted && createPortal(drawer, document.body)}
    </div>
  );
}

/** 관리자 모드 묶음의 제목 — 등급을 따른다 (StaffModeSwitch 의 이름과 같은 규칙) */
function staffLabel(role?: string | null) {
  return role === "admin" ? "관리자 메뉴" : role === "assistant" ? "조교 메뉴" : "강사 메뉴";
}

/** 메뉴 한 줄. 수강생전용 기능은 못 쓰면 자물쇠를 붙이고 소개 페이지로 보낸다 (PC 드롭다운과 같은 규칙) */
function Row({ item, pathname, access, onExternal }: { item: NavItem; pathname: string; access: NavAccess; onExternal: () => void }) {
  const feature = item.feature ? STUDENT_FEATURES.find((f) => f.key === item.feature) : undefined;
  const locked = feature ? !canUseFeature(feature, access) : false;
  const href = feature ? featureHref(feature, access) : item.href;
  const active = !item.external && isActivePath(pathname, item.href);
  const className = cn(
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-bold transition",
    active ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-surface",
  );
  const icon = (
    <span className="relative shrink-0">
      <Icon name={item.icon} size={24} className={cn(locked && "opacity-60")} />
      {locked && (
        <span className="absolute -bottom-1 -right-1.5 rounded bg-paper p-px shadow-soft">
          <Icon name="lock" size={11} />
        </span>
      )}
    </span>
  );

  if (item.external) {
    // 네이버 상담예약처럼 바깥으로 나가는 링크. 새 창으로 열리므로 서랍은 닫는다
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={onExternal} className={className}>
        {icon}
        <span className="flex-1 truncate">{item.label}</span>
        <ExternalMark className="text-mist" />
        <span className="sr-only">(새 창)</span>
      </a>
    );
  }
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={className}>
      {icon}
      <span className="flex-1 truncate">{item.label}</span>
      {locked && <span className="sr-only">(수강생 전용, 잠김)</span>}
    </Link>
  );
}
