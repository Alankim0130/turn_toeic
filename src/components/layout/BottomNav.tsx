"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { bottomNavLift } from "@/lib/bottom-nav";
import { Icon } from "@/components/ui/Icon";
import { canUseFeature, featureHref, NAV_BOTTOM, STUDENT_FEATURES } from "@/lib/site";
import { cn } from "@/lib/utils";
import { isActivePath } from "./NavLinks";
import type { NavAccess } from "./DesktopNav";

/** 모바일 하단 네비게이션. 관리자 영역은 자체 네비를 쓰므로 숨긴다. */
export function BottomNav({ access }: { access: NavAccess }) {
  const pathname = usePathname();
  const hidden = pathname.startsWith("/admin");
  const ref = useRef<HTMLElement>(null);

  // 보이는 화면 바닥에 붙인다 (iOS 사파리 도구막대 — src/lib/bottom-nav.ts).
  // **훅은 아래 early return 보다 위에 있어야 한다** — /admin 을 드나들 때 훅 개수가 달라진다
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (hidden || !vv) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const tag = document.activeElement?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      el.style.transform = `translateY(-${bottomNavLift(document.documentElement.clientHeight, vv.height, vv.offsetTop, typing)}px)`;
    };
    // 스크롤 도중에는 매 픽셀마다 오므로 한 프레임에 한 번만 고쳐 쓴다
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav
      ref={ref}
      aria-label="하단 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 glass md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid h-[4.25rem] grid-cols-5">
        {NAV_BOTTOM.map((item) => {
          const feature = item.feature ? STUDENT_FEATURES.find((f) => f.key === item.feature) : undefined;
          const locked = feature ? !canUseFeature(feature, access) : false;
          const href = feature ? featureHref(feature, access) : item.href;
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition",
                  active ? "text-brand-600" : "text-mist",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-8 w-11 items-center justify-center rounded-full transition",
                    active ? "bg-brand-100" : "bg-transparent",
                  )}
                >
                  <Icon name={item.icon} size={24} className={cn(!active && "opacity-60 grayscale")} />
                  {locked && (
                    <span className="absolute -right-0.5 -top-0.5 rounded bg-paper p-px shadow-soft">
                      <Icon name="lock" size={11} />
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap">{item.label}</span>
                {locked && <span className="sr-only">(수강생 전용, 잠김)</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
