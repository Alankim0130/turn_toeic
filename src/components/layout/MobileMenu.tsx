"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { NAV_MAIN } from "@/lib/site";
import { cn } from "@/lib/utils";
import { isActivePath } from "./NavLinks";
import { signOut } from "@/app/(auth)/actions";

export function MobileMenu({ signedIn, staff, name }: { signedIn: boolean; staff: boolean; name: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 경로가 바뀌면 메뉴를 닫는다 (렌더 중 파생 상태 갱신 패턴)
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="xl:hidden">
      <button
        type="button"
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-full hover:bg-brand-50"
      >
        <span className={cn("h-0.5 w-5 rounded bg-ink transition", open && "translate-y-2 rotate-45")} />
        <span className={cn("h-0.5 w-5 rounded bg-ink transition", open && "opacity-0")} />
        <span className={cn("h-0.5 w-5 rounded bg-ink transition", open && "-translate-y-2 -rotate-45")} />
      </button>

      <div
        id="mobile-menu"
        className={cn(
          "fixed inset-0 top-16 z-40 bg-surface transition-opacity duration-200",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="container-x flex h-full flex-col gap-6 overflow-y-auto py-6">
          <nav aria-label="모바일 메뉴">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {NAV_MAIN.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl2 border p-4 text-base font-bold transition",
                        active ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-paper text-ink",
                      )}
                    >
                      <Icon name={item.icon} size={28} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-auto flex flex-col gap-2 pb-24">
            {staff && (
              <Link href="/admin" className="btn-primary">
                <Icon name="admin" size={20} className="brightness-0 invert" />
                관리자 페이지로 이동
              </Link>
            )}
            {signedIn ? (
              <>
                <Link href="/my" className="btn-secondary">
                  <Icon name="profile" size={20} />
                  {name ? `${name}님 마이페이지` : "마이페이지"}
                </Link>
                <form action={signOut}>
                  <button type="submit" className="btn-ghost w-full">
                    로그아웃
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="btn-dark">
                  로그인
                </Link>
                <Link href="/signup" className="btn-secondary">
                  회원가입
                </Link>
              </>
            )}
            <div className="mt-4 flex justify-center opacity-60">
              <Logo height={22} link={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
