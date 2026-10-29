"use client";

import { useEffect, useEffectEvent, useRef } from "react";

/**
 * 가운데 뜨는 작은 팝업. 결과를 놓치지 않게 할 때 쓴다 (등업신청 결과 — 2026-09-18 Alan "팝업으로").
 * - ESC · 배경 클릭으로 닫힌다. 열려 있는 동안 뒤 화면 스크롤을 막는다 (후기 팝업과 같은 규칙).
 * - 열릴 때 제목에 포커스를 준다 — 화면 낭독기가 팝업이 뜬 것을 안다.
 * 버튼은 호출하는 쪽이 children 으로 넣는다 (팝업마다 다르다).
 * `wide` — 표 만들기 · 고치기처럼 넓어야 하는 팝업 (2026-10-07).
 * `dismissible={false}` — 배경을 눌러도 닫히지 않는다 (ESC · 닫는 버튼으로만). 표 칸처럼 한참 적는 팝업에서 바깥을 잘못 눌러 적던 것을 잃지 않게
 *
 * **열릴 때 한 번만** 제목에 포커스를 준다 (2026-10-29 점검). 예전에는 효과가 `onClose` 에 묶여 있어, 부르는 쪽이 `onClose={() => …}` 처럼
 * 그릴 때마다 새 함수를 넘기면 **부모가 다시 그려질 때마다** 포커스가 제목으로 튀었다 — 반 편성 달력 특강 팝업에서 이미 있는 특강의 메모를
 * 한 글자 치면 칸에서 빠져 두 글자째가 안 들어갔다. ESC 는 늘 마지막 `onClose` 를 부른다 (`useEffectEvent`).
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  tone = "info",
  wide = false,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  tone?: "success" | "warning" | "info";
  wide?: boolean;
  dismissible?: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const bar = tone === "success" ? "bg-brand-500" : tone === "warning" ? "bg-amber-500" : "bg-ink";

  return (
    <div className="follow-screen fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div aria-hidden onClick={dismissible ? onClose : undefined} className="absolute inset-0 bg-ink/60 backdrop-blur-sm" />
      {/* 화면보다 길면 팝업 안에서 스크롤한다 — 뒤 화면은 잠겨 있어 잘린 아래쪽(버튼)에 닿을 길이 없다 (교재비 안내가 붙은 등업 팝업, 2026-10-02) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`card relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden p-0 shadow-pink ${wide ? "max-w-3xl" : "max-w-md"}`}
      >
        <div className={`h-1.5 shrink-0 ${bar}`} />
        <div className="overflow-y-auto overscroll-contain p-5 sm:p-6">
          <h2 id="dialog-title" ref={titleRef} tabIndex={-1} className="text-lg font-black text-ink outline-none">
            {title}
          </h2>
          <div className="mt-3 text-sm text-ink">{children}</div>
        </div>
      </div>
    </div>
  );
}
