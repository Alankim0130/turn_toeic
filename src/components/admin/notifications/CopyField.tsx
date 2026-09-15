"use client";

import { useState } from "react";

/** 복사할 수 있는 값. secret 이면 처음엔 가려서 보여준다 */
export function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShown(true);
    }
  }

  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-soft">
          {shown ? value : "•".repeat(Math.min(24, value.length))}
        </code>
        {secret && (
          <button type="button" onClick={() => setShown((v) => !v)} className="btn-ghost !px-3 !py-2">
            {shown ? "가리기" : "보기"}
          </button>
        )}
        <button type="button" onClick={copy} className="btn-secondary !px-3 !py-2">
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}
