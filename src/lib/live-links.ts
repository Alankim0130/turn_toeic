/**
 * 불라방 링크 화면의 규칙 (2026-09-30 Alan — "불라방은 zoom으로 올리고, 다시보기는 유튜브로 따로 한 번 더 업로드 예정.
 * 그래서 불라방 링크를 쉽게 올릴 수 있도록 강사 대시보드에서 불라방 위젯을 하나 만들어주면 좋겠어. 위젯에 들어가면
 * 현재 시간을 기준점으로 최상단에 링크를 올릴 수 있는 공간이 나오고" · "불라방 링크는 강사아이디별로 나오면 좋겠어").
 *
 * - **어느 회차가 맨 위에 서나** (`pickFocus`): 지금 하는 수업(시작 30분 전 ~ 끝) → 오늘 남은 첫 수업 → 다음 수업일의 첫 수업.
 *   같은 날 같은 시각에 시작하는 회차는 함께 선다 (관리자 화면에서는 두 강사 수업이 한 시간에 겹친다).
 * - **다시보기로 올라가는 것은 유튜브 주소뿐이다** (`isYoutubeUrl`). 유튜브 라이브는 방송이 끝나면 그 주소가 곧 녹화본이지만
 *   Zoom 입장 링크는 수업이 끝나면 들어갈 곳이 없다 — DB `private.is_youtube_url` 과 같은 규칙이다 (마이그레이션 20260930110000).
 *
 * 순수 함수 (`live-links.test.ts`). 조회는 `src/app/admin/_lib/live-links.ts`.
 */
import { parseTimeBlock } from "./time-blocks";

/** 지금 하는 수업으로 보는 창 — 시작 몇 분 전부터 (강사가 수업 직전에 링크를 넣는다) */
export const LIVE_FOCUS_LEAD_MINUTES = 30;

/** 유튜브 주소인가 (youtube.com · 하위 도메인 · youtu.be). DB `private.is_youtube_url` 과 같다 */
export function isYoutubeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();
    return h === "youtu.be" || h === "youtube.com" || h.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

/** Zoom 주소인가 (zoom.us · 하위 도메인) — 화면에 `Zoom` 칩을 붙이는 데만 쓴다 */
export function isZoomUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "zoom.us" || h.endsWith(".zoom.us");
  } catch {
    return false;
  }
}

/** 링크 칩 이름 */
export function linkKindLabel(url: string | null | undefined): string {
  if (isZoomUrl(url)) return "Zoom";
  if (isYoutubeUrl(url)) return "유튜브";
  return "링크";
}

/** 한국 시간 지금 → { date: "YYYY-MM-DD", minutes: 자정부터 분 } */
export function nowKst(at: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  return { date: `${p("year")}-${p("month")}-${p("day")}`, minutes: Number(p("hour")) * 60 + Number(p("minute")) };
}

export type SessionTimeLike = { date: string; time_block: string | null };

/** 회차의 상태 — 지난 수업 · 지금(시작 30분 전 ~ 끝) · 앞으로 */
export type SessionState = "past" | "now" | "later";

export function sessionState(s: SessionTimeLike, today: string, nowMinutes: number): SessionState {
  if (s.date < today) return "past";
  if (s.date > today) return "later";
  const span = parseTimeBlock(s.time_block);
  if (!span) return "later"; // 시간을 모르면 그 날 내내 앞으로 올 수업으로 둔다 (지난 것으로 치워 버리지 않는다)
  if (nowMinutes > span.end) return "past";
  if (nowMinutes >= span.start - LIVE_FOCUS_LEAD_MINUTES) return "now";
  return "later";
}

/**
 * 강사 화면에 보일 회차 (2026-09-30 Alan "불라방 링크는 강사아이디별로 나오면 좋겠어. 다른강사는 안 보여줘도 괜찮아") —
 * 내가 담당인 반 + **담당이 비어 있는 반**. 담당이 비는 것은 두 과목을 이어 듣는 반(방학달 120분 반)이거나
 * 시간표에서 과목을 아직 안 고른 반이라, 어느 한 분에게만 두면 아무도 링크를 못 넣는다 (도메인 규칙 1 "담당 강사").
 * 관리자(알런)는 수업을 맡지 않으므로 이 거르기 없이 전부 본다.
 */
export function forInstructor<T extends { instructorId: string | null }>(rows: readonly T[], userId: string): T[] {
  return rows.filter((r) => r.instructorId === userId || r.instructorId === null);
}

/** 날짜 → 시작 시각 순 (시간을 모르는 회차는 그 날 맨 뒤) */
export function compareSessions(a: SessionTimeLike, b: SessionTimeLike): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const sa = parseTimeBlock(a.time_block)?.start ?? 24 * 60;
  const sb = parseTimeBlock(b.time_block)?.start ?? 24 * 60;
  return sa - sb;
}

/**
 * 맨 위에 올릴 회차.
 * - 지금 하는 수업이 있으면 **그 시간의 회차 전부**(`now`) — 수업 중이거나 30분 안에 시작하는 것. 10:50 이면 10:00 수업(진행 중)과
 *   11:10 수업(곧 시작)이 함께 선다 — 진행 중인 수업에는 이미 링크가 있고, 넣어야 할 것은 다음 수업이기 때문이다.
 * - 없으면 앞으로 올 가장 가까운 수업(`next`) — 같은 날 같은 시작 시각의 회차를 함께.
 * - 앞으로 올 수업이 하나도 없으면 빈 배열.
 */
export function pickFocus<T extends SessionTimeLike>(rows: readonly T[], today: string, nowMinutes: number): { focus: T[]; state: "now" | "next" | null } {
  const sorted = [...rows].sort(compareSessions);
  const now = sorted.filter((r) => sessionState(r, today, nowMinutes) === "now");
  if (now.length > 0) return { focus: now, state: "now" };
  const later = sorted.filter((r) => sessionState(r, today, nowMinutes) === "later");
  const first = later[0];
  if (!first) return { focus: [], state: null };
  const start = parseTimeBlock(first.time_block)?.start ?? null;
  return { focus: later.filter((r) => r.date === first.date && (parseTimeBlock(r.time_block)?.start ?? null) === start), state: "next" };
}
