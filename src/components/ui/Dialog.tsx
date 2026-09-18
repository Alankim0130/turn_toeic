"use client";

import { useEffect, useRef } from "react";

/**
 * 가운데 뜨는 작은 팝업. 결과를 놓치지 않게 할 때 쓴다 (등업신청 결과 — 2026-09-18 Alan "팝업으로").
 * - ESC · 배경 클릭으로 닫힌다. 열려 있는 동안 뒤 화면 스크롤을 막는다 (후기 팝업과 같은 규칙).
 * - 열릴 때 제목에 포커스를 준다 — 화면 낭독기가 팝업이 뜬 것을 안다.
 * 버튼은 호출하는 쪽이 children 으로 넣는다 (팝업마다 다르다).
 */
export function Dialog({ open, title, onClose, children, tone = "info" }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; tone?: "success" | "warning" | "info" }) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const bar = tone === "success" ? "bg-brand-500" : tone === "warning" ? "bg-amber-500" : "bg-ink";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-ink/60 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="card relative w-full max-w-md overflow-hidden p-0 shadow-pink">
        <div className={`h-1.5 ${bar}`} />
        <div className="p-5 sm:p-6">
          <h2 id="dialog-title" ref={titleRef} tabIndex={-1} className="text-lg font-black text-ink outline-none">
            {title}
          </h2>
          <div className="mt-3 text-sm text-ink">{children}</div>
        </div>
      </div>
    </div>
  );
}
