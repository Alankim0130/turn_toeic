"use client";

import { useState } from "react";

/** 계좌번호 복사 — 누르면 "복사됨" 으로 잠깐 바뀐다. 복사가 막힌 브라우저에서는 아무 일도 없다 (번호는 화면에 그대로 있다) */
export function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost !px-2.5 !py-1 text-xs"
      aria-label={`${text} ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // 복사가 막힌 브라우저 — 번호는 화면에 그대로 있다
        }
      }}
    >
      {done ? "복사됨" : label}
    </button>
  );
}
