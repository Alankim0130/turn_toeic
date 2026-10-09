"use client";

import { useLinkStatus } from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * 누른 메뉴가 다음 화면을 받는 동안 **누른 자리에 바로** 보이는 표시 (2026-10-09 Alan "화면 전환이 좀 느린데").
 * 보통은 구역마다 둔 `loading.tsx`(빈 화면 틀 — `PageSkeleton`)가 누르는 순간 떠서 이 표시는 지나간다 —
 * 화면 틀을 미리 받아 두지 못했을 때(느린 인터넷 · 막 연 화면) 누른 메뉴가 바로 켜져 "눌렸다" 를 알린다.
 * **`<Link>` 안에서만** 쓴다 (Next 의 `useLinkStatus`). 크기가 고정된 요소의 색 · 투명도만 바꾼다 — 글자가 밀리지 않게.
 */

/** 하단 바의 아이콘 알약 — 누른 칸은 화면이 오기 전에도 켜진 모양이 되고 깜빡인다 */
export function NavTabIcon({ active, icon, children }: { active: boolean; icon: IconName | string; children?: React.ReactNode }) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  return (
    <span className={cn("relative flex h-8 w-11 items-center justify-center rounded-full transition", on ? "bg-brand-100" : "bg-transparent", pending && "animate-pulse")}>
      <Icon name={icon} size={24} className={cn(!on && "opacity-60 grayscale")} />
      {children}
    </span>
  );
}

/** 메뉴 줄 · 알약 위에 겹치는 테두리 — 누른 줄에만 나타난다. 부모 `<Link>` 에 `relative` 와 둥근 모서리가 있어야 한다 */
export function NavPendingRing() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-brand-400 transition-opacity", pending ? "animate-pulse opacity-100" : "opacity-0")}
    />
  );
}
