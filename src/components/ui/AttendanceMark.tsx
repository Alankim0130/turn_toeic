import { MARK_STYLE, type MarkKind } from "@/lib/attendance-board";
import { cn } from "@/lib/utils";

/**
 * 출석 도장 하나 — 강사 출석 격자와 학생 출석 달력이 함께 쓴다 (2026-10-01).
 * 출석은 체크, 그 밖은 한 글자(지 · 결)다. 예정은 점선 동그라미. (결석은 한 단어 — 2026-10-10 전의 `미`(미출석) 도장은 없다)
 * 모양은 **도형(인라인 SVG)과 글자**뿐이다 — 이모지를 쓰지 않는다. 작은 칸 안에 `sr-only` 를 두지 않고
 * `aria-label` 로 설명한다 (격자는 가로로 밀리는 상자라 절대 위치 자식이 밖으로 새면 화면이 옆으로 밀린다).
 */
export function AttendanceMark({ kind, label, size = "sm" }: { kind: MarkKind; label?: string; size?: "xs" | "sm" | "md" }) {
  const s = MARK_STYLE[kind];
  const dim = size === "md" ? "h-9 w-9 text-sm" : size === "xs" ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]";
  const text = label ?? s.label;
  return (
    <span role="img" aria-label={text} title={text} className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-black leading-none", dim, s.className)}>
      {kind === "present" ? (
        <svg viewBox="0 0 16 16" aria-hidden className="h-[62%] w-[62%]" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
      ) : (
        s.letter
      )}
    </span>
  );
}
