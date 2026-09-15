export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** 한국 시간 기준 오늘 (YYYY-MM-DD) */
export function todayKST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export function formatDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", weekday: "short" }) {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00+09:00" : "")) : d;
  // Node 24(ICU 78)는 한국어 오전·오후를 "AM·PM"으로 내보내서 되돌린다
  return date
    .toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", ...opts })
    .replace(/\bAM\b/g, "오전")
    .replace(/\bPM\b/g, "오후");
}

export function formatTime(t: string | null | undefined) {
  // "09:30:00" → "09:30". 반 편성에서 수업 시간을 받지 않으므로 반·회차 시간은 비어 있을 수 있다
  return t ? t.slice(0, 5) : "";
}

/** "09:30–11:50". 시작·종료 중 하나라도 없으면 빈 문자열 */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined) {
  return start && end ? `${formatTime(start)}–${formatTime(end)}` : "";
}

export function formatWon(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export const TRACK_LABEL: Record<string, string> = { mwf: "월수금", ttf: "화목금" };
export const MODE_LABEL: Record<string, string> = { onsite: "현장", live: "불라방" };
export const COURSE_TYPE_LABEL: Record<string, string> = { full: "종합", lc: "단과 LC", rc: "단과 RC" };
