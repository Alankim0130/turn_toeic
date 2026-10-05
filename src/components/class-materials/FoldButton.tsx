"use client";

/** 고정 머리글 높이 + 숨 쉴 틈 */
const HEADER_GAP = 80;

/**
 * 펼친 긴 스크립트 끝의 `접기` (2026-10-05) — 위쪽 `접기` 까지 화면 몇 장을 거슬러 올라가지 않게.
 * 접고 나면 그 자료 카드가 화면에 오도록 옮긴다 (안 옮기면 접힌 만큼 아래 자료가 올라와 어디까지 봤는지 놓친다).
 * `<details>` 는 안에서 닫을 길이 없어 이 버튼 하나만 클라이언트 컴포넌트다.
 */
export function FoldButton() {
  return (
    <button
      type="button"
      onClick={(e) => {
        const details = e.currentTarget.closest("details");
        if (!details) return;
        details.open = false;
        // 자료 카드(li)의 제목까지 보이게 — 위의 고정 머리글(64px) 아래로. 이미 보이면 그대로 둔다
        const top = (details.closest("li") ?? details).getBoundingClientRect().top;
        if (top < HEADER_GAP) window.scrollBy({ top: top - HEADER_GAP });
      }}
      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-600"
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-none stroke-current stroke-[3]">
        <path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      접기
    </button>
  );
}
