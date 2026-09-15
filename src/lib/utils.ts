export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** 한국 시간 기준 오늘 (YYYY-MM-DD) */
export function todayKST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export function formatDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", weekday: "short" }) {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00+09:00" : "")) : d;
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", ...opts });
}

export function formatTime(t: string) {
  // "09:30:00" → "09:30"
  return t.slice(0, 5);
}

export function formatWon(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export const TRACK_LABEL: Record<string, string> = { mwf: "월수금", ttf: "화목금" };
export const MODE_LABEL: Record<string, string> = { onsite: "현장", live: "불라방" };
export const COURSE_TYPE_LABEL: Record<string, string> = { full: "종합", lc: "단과 LC", rc: "단과 RC" };
