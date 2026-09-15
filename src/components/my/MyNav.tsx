"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/my", label: "대시보드", icon: "profile" },
  { href: "/my/verify", label: "등업신청", icon: "verify" },
  { href: "/my/class", label: "내 시간표", icon: "calendar" },
  { href: "/my/live", label: "불라방", icon: "live" },
  { href: "/my/textbook", label: "교재신청", icon: "textbook" },
  { href: "/my/replay", label: "다시보기", icon: "replay" },
  { href: "/my/study", label: "내 스터디", icon: "study" },
  { href: "/my/homework", label: "숙제제출", icon: "homework" },
  { href: "/my/lc-audio", label: "LC 음원", icon: "headphones" },
];

export function MyNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="마이페이지 메뉴" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-2 sm:flex-wrap">
        {ITEMS.map((item) => {
          const active = item.href === "/my" ? pathname === "/my" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-bold transition",
                  active
                    ? "border-brand-500 bg-brand-500 text-white shadow-pink"
                    : "border-line bg-paper text-ink-soft hover:border-brand-300 hover:text-brand-600",
                )}
              >
                <Icon name={item.icon} size={18} className={cn(active && "brightness-0 invert")} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
