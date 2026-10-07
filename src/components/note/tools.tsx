import type { NoteAlign } from "@/lib/note-format";
import { cn } from "@/lib/utils";

/**
 * 글 편집기(`NoteEditor`)와 표 만들기 팝업(`TableEditDialog`)이 함께 쓰는 도구 버튼.
 * 누르는 순간 칸의 선택 · 커서를 빼앗지 않게 `pointerdown` · `mousedown` 기본 동작을 막는다 (편집기의 고른 글자 · 표의 고른 셀이 그대로 남는다).
 * `on` 을 주면 켜고 끄는 버튼이다 (`aria-pressed`). 안 주면 그냥 버튼이다
 */
export function Tool({
  label,
  on,
  onUse,
  disabled,
  wide,
  children,
}: {
  label: string;
  on?: boolean;
  onUse: () => void;
  disabled?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={disabled}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onUse}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-lg border text-sm text-ink transition disabled:opacity-50",
        on ? "border-brand-600 bg-brand-100 ring-2 ring-brand-500" : "border-line bg-white hover:border-brand-300 hover:bg-brand-50",
        wide ? "px-2 text-xs font-bold" : "w-8",
      )}
    >
      {children}
    </button>
  );
}

export const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />;

/** 정렬 버튼 그림 — 줄 셋의 길이로 왼쪽 · 가운데 · 오른쪽 */
export function AlignGlyph({ align }: { align: NoteAlign }) {
  const rows: [number, number][] = align === "left" ? [[4, 20], [4, 14], [4, 18]] : align === "center" ? [[4, 20], [7, 17], [5, 19]] : [[4, 20], [10, 20], [6, 20]];
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current stroke-2">
      {rows.map(([x1, x2], i) => (
        <path key={i} d={`M${x1} ${7 + i * 5}H${x2}`} strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** 표 그림 — `표 넣기` 버튼 */
export function TableGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current stroke-2">
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18M3 14.5h18M9 4.5v15M15 4.5v15" />
    </svg>
  );
}
