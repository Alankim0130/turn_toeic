import { initialDay } from "./class-day";
import { week5SectionIds, type Week5Section } from "./week5";
import { youtubeEmbedSrc, youtubeVideo } from "./youtube-video";

/**
 * 강의 다시보기 일정표 (2026-10-07 Alan — 첫토익 화면을 보여 주며 "지금 강의다시보기를 지금 올린 이미지처럼 일정표 기반으로
 * 다시보기를 할 수 있으면 좋겠어! 본인 등급에 맞는 과정이 나오도록").
 *
 * 달력에 **내 수업일**을 트랙 색으로 칠하고, 날짜를 고르면 **그 날 녹화본**이 나온다. 어느 녹화본이 내 것인지는
 * `getMyReplays`(내 반 + 저녁 반의 오전 짝 — `my_section_ids()` · `term_recorded_pairs`)가 정한다 —
 * 여기는 그 목록을 날짜로 펼칠 뿐이고 **레벨 숫자로 따로 거르지 않는다** (등급 체계 10). 화면은 `ReplayCalendar`.
 */

export type ReplaySubject = "lc" | "rc";

/** 녹화본 한 편 — 서버가 다 만들어서 넘긴다 (반 · 기수 객체를 클라이언트로 실어 보내지 않는다) */
export type ReplayEntry = {
  id: number;
  /** 회차(`session_dates.id`) — 한 회차에 영상이 둘 이상이면 번호를 단다 (`replayParts`) */
  sessionId: number;
  /** 그 회차의 수업일 */
  date: string;
  /** 반의 회차 (그 반의 N번째 수업일 — 트랙마다 따로 센다). 정렬에만 쓴다 */
  seq: number;
  /** 화면에 적는 회차 — 주5일로 듣는 녹화본은 월수금 · 화목금을 합친 내 수업일 순서, 그 밖은 `seq` (`replayRounds`) */
  round: number;
  /** 강좌 레벨 (650 · 750 · 850) — 속성반 학생은 두 레벨이 함께 나온다 */
  level: number | null;
  /** 그 시간의 과목. 방학달 통짜 반처럼 두 과목을 이어 듣는 반은 null */
  subject: ReplaySubject | null;
  /** 수업 시간 `10:00~11:00` (반의 시간대 라벨) */
  time: string | null;
  /** mwf | ttf — 달력 색 */
  track: string;
  url: string;
  /**
   * 내 반이 아닌 **오전 짝 반**의 녹화본 — `recorded` = 화목금 인강 학생 · `evening` = 저녁 월수금 현장 학생 (도메인 규칙 1
   * "저녁 반 학생의 다시보기"). 내 반(묶음 반 · 속성반이 품은 시간 포함)의 녹화본이면 null
   */
  pair: "recorded" | "evening" | null;
};

/** 내 수업일 하나 — 달력에 칠하는 날 */
export type ClassDay = { date: string; track: string };

export type MonthKey = { year: number; month: number };

const monthKey = (m: MonthKey) => `${m.year}-${String(m.month).padStart(2, "0")}`;
const inMonth = (date: string, m: MonthKey) => date.slice(0, 7) === monthKey(m);

/** 날짜들이 걸친 달 — 오래된 달부터 (‹ › 로 넘기는 순서) */
export function monthsOf(dates: Iterable<string>): MonthKey[] {
  return [...new Set([...dates].map((d) => d.slice(0, 7)))].sort().map((k) => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)) }));
}

/**
 * 처음 고르는 날 — **오늘까지 녹화본이 올라온 날 중 가장 최근**. 다시보기는 볼 것을 찾으러 오는 화면이라
 * 수업 전 아침에 들어와도 어제 녹화본이 먼저 서 있어야 한다. 녹화본이 하나도 없으면 내 시간표와 같다
 * (`initialDay` — 오늘 → 다음 수업일 → 마지막 수업일). `month` 를 주면 그 달 안에서만 고른다 (달을 넘겼을 때).
 */
export function replayInitialDay(replayDates: readonly string[], classDates: readonly string[], today: string, month?: MonthKey): string | null {
  const within = (list: readonly string[]) => (month ? list.filter((d) => inMonth(d, month)) : [...list]);
  const watchable = within(replayDates)
    .filter((d) => d <= today)
    .sort();
  if (watchable.length) return watchable[watchable.length - 1];
  return initialDay(within([...classDates, ...replayDates]), today);
}

/** 오늘부터 그 날까지 며칠 (한국 날짜 `YYYY-MM-DD` 끼리). 오늘이면 0, 지났으면 음수 */
export function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

const TRACK_ORDER: Record<string, number> = { mwf: 0, ttf: 1 };

/** 그 날 녹화본 순서 — 수업 시간 → 레벨 → 과목 → 회차 (속성반이면 10:00 RC · 11:10 LC · 12:30 850 LC 순) */
export function sortReplays<T extends Pick<ReplayEntry, "id" | "seq" | "level" | "subject" | "time">>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) =>
      (a.time ?? "￿").localeCompare(b.time ?? "￿") ||
      (a.level ?? 0) - (b.level ?? 0) ||
      (a.subject ?? "").localeCompare(b.subject ?? "") ||
      a.seq - b.seq ||
      a.id - b.id,
  );
}

/**
 * 한 회차에 녹화본이 둘 이상이면(강사가 나눠 올렸다 — 등록 화면이 막지 않는다) 올린 순서로 `영상 1` · `영상 2` …
 * 하나뿐인 회차에는 번호를 달지 않는다. 녹화본 id → 번호
 */
export function replayParts(list: readonly Pick<ReplayEntry, "id" | "sessionId">[]): Map<number, number> {
  const bySession = new Map<number, number[]>();
  for (const r of list) bySession.set(r.sessionId, [...(bySession.get(r.sessionId) ?? []), r.id]);
  const out = new Map<number, number>();
  for (const ids of bySession.values()) if (ids.length > 1) [...ids].sort((a, b) => a - b).forEach((id, k) => out.set(id, k + 1));
  return out;
}

/** 회차를 셀 녹화본 하나 — 반은 서버에서 셀 때만 쓴다 (클라이언트로 넘기지 않는다) */
export type RoundInput = {
  id: number;
  date: string;
  seq: number;
  section: Week5Section;
  /** 녹화본이 올라온 반이 내 반(직접 배정 · 묶음 반 · 속성반이 품은 반)인가 — 아니면 저녁 반의 오전 짝 */
  own: boolean;
};

/**
 * 녹화본마다 화면에 적는 회차 (녹화본 id → 회차) — 2026-10-17 Alan "다시보기에서 지금 주5일 학생화면인데 월수금 1회차, 화목금 1회차라고 나오는데,
 * 주5일반학생은 1회차, 2회차, 3회차, … 이렇게 순서대로 표기되도록 부탁해".
 *
 * 반의 회차(`session_dates.seq`)는 **트랙마다 따로** 센다 — 10월이면 10/6(화) 화목금 1회차 · 10/7(수) 월수금 1회차 · 10/8(목) 화목금 2회차.
 * 주5일 학생은 두 트랙을 다 들어서 하루 건너 같은 번호가 두 번씩 섰다. 그래서
 * - **주5일로 듣는 녹화본**은 그 기수 **내 수업일(두 트랙을 합쳐 날짜순)에서 몇 번째 날**인가를 적는다 — 10/6 1회차 · 10/7 2회차 · 10/8 3회차 · 10/12 4회차 …
 *   같은 날 녹화본은 모두 같은 번호다 (120분이면 RC · LC 둘, 속성반이면 셋).
 *   주5일인지는 그 시간의 월수금 · 화목금 반이 둘 다 내 반인가로 본다 (`week5SectionIds` — 같은 기수 · 강좌 · 시간대).
 *   저녁 반의 오전 짝 녹화본은 내 반이 아니라서, 짝이 같은 기수 · 같은 강좌라는 것(DB `private.recorded_source_section`)으로 그 강좌를 주5일로 듣는지 본다.
 * - 그 밖(주3일 · 단과 — 단과 두 장이어도 시간이 다르면 따로 산 두 과정이다)은 **반의 회차 그대로**다 — 한 트랙뿐이라 그것이 곧 그 수업의 N번째 날이다.
 * - 내 수업일에서 그 날을 못 찾으면(수업일을 못 읽음) 반의 회차로 둔다 — 지어낸 번호를 적지 않는다.
 *
 * `classDays` 는 내 수업일(`getMySessions` — 2주완성은 앞 절반)이고 **기수마다 따로** 센다 (9월 종강 · 10월 개강이 겹쳐도 10월은 1회차부터).
 * 반 편성 달력이 진실의 원천이라 강사가 수업일을 고치면 번호도 따라간다. LC 음원의 강 · 수업자료실의 회차는 내용과 짝지은 번호라 여기를 따르지 않는다.
 */
export function replayRounds(
  list: readonly RoundInput[],
  mySections: readonly Week5Section[],
  classDays: readonly { termId: number | null; date: string }[],
): Map<number, number> {
  const week5 = week5SectionIds(mySections);
  const courseKey = (s: Pick<Week5Section, "term_id" | "course_id">) => `${s.term_id}|${s.course_id}`;
  const week5Courses = new Set(mySections.filter((s) => week5.has(s.id)).map(courseKey));

  // 기수마다 내 수업일 → 몇 번째 날 (두 트랙을 합쳐 날짜순, 같은 날은 한 번)
  const dates = new Map<number | null, Set<string>>();
  for (const d of classDays) dates.set(d.termId, (dates.get(d.termId) ?? new Set<string>()).add(d.date));
  const order = new Map<number | null, Map<string, number>>();
  for (const [term, set] of dates) order.set(term, new Map([...set].sort().map((date, i) => [date, i + 1])));

  const out = new Map<number, number>();
  for (const r of list) {
    const both = r.own ? week5.has(r.section.id) : week5Courses.has(courseKey(r.section));
    const n = both ? order.get(r.section.term_id)?.get(r.date) : undefined;
    out.set(r.id, n ?? r.seq);
  }
  return out;
}

/** 달력 칸 하나에 칠하는 트랙 하나 — `replays` 는 그 날 그 트랙에 올라온 녹화본 수 */
export type DayMark = { track: string; replays: number };

/**
 * 날짜 → 그 날 칠할 트랙과 녹화본 수. **내 수업일이 아닌 날에 올라온 녹화본도 칠한다** — 안 칠하면 그 녹화본은 누를 데가 없다.
 * (오전 짝 반 · 묶음 반이 품은 시간은 내 반과 같은 기수 · 트랙이라 수업일이 같다 — 보통은 늘 내 수업일 위에 선다)
 */
export function dayMarks(classDays: readonly ClassDay[], replays: readonly Pick<ReplayEntry, "date" | "track">[]): Map<string, DayMark[]> {
  const out = new Map<string, DayMark[]>();
  const at = (date: string, track: string) => {
    const list = out.get(date) ?? [];
    let mark = list.find((m) => m.track === track);
    if (!mark) {
      mark = { track, replays: 0 };
      list.push(mark);
      list.sort((a, b) => (TRACK_ORDER[a.track] ?? 9) - (TRACK_ORDER[b.track] ?? 9));
      out.set(date, list);
    }
    return mark;
  };
  for (const d of classDays) at(d.date, d.track);
  for (const r of replays) at(r.date, r.track).replays += 1;
  return out;
}

export type ReplayEmbed = { kind: "youtube" | "vimeo"; src: string } | { kind: "link" } | { kind: "none" };

/**
 * 녹화본을 **그 자리에서** 트는 주소. 누른 뒤에만 그리므로 바로 재생(autoplay)한다.
 * 유튜브는 `youtube-nocookie.com`(랜딩 소개 영상 · 수업자료실 링크와 같다 — `youtubeEmbedSrc`, 시작 위치 `?t=` 도 따라간다),
 * 비메오는 플레이어 주소(비공개 링크의 `/숫자/해시` 도), 그 밖의 http(s) 주소는 새 창으로 연다(`link`).
 * http(s) 가 아니면 열지 않는다(`none`) — 강사가 넣은 값이라도 `javascript:` 를 그대로 href 에 세우지 않는다
 */
export function replayEmbed(url: string): ReplayEmbed {
  const yt = youtubeVideo(url);
  if (yt) return { kind: "youtube", src: youtubeEmbedSrc(yt) };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: "none" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { kind: "none" };
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(?:^|\/)(\d+)(?:\/([0-9a-f]+))?/i);
    if (m) {
      const hash = m[2] ?? u.searchParams.get("h");
      return { kind: "vimeo", src: `https://player.vimeo.com/video/${m[1]}?autoplay=1${hash && /^[0-9a-f]+$/i.test(hash) ? `&h=${hash}` : ""}` };
    }
  }
  return { kind: "link" };
}

/** 다시보기를 볼 수 있는 기간 하나 — 기수마다 */
export type ReplayTerm = { termId: number; month: number | null; opens: string; closes: string };

/**
 * 기수마다 **다시보기를 볼 수 있는 기간** — 내가 직접 배정된 반의 개강일 ~ 종강일 중 **오늘이 든 것**.
 * 권한은 직접 배정된 반의 날짜가 정한다 (`has_section_access` — 묶음 반 · 속성반이 품은 반 · 저녁 반의 오전 짝도 부모 반의 날짜로 닫힌다).
 * 그래서 2주완성 학생은 품은 850 반의 종강일(그 달 끝)이 아니라 **앞 절반 마지막 날**이 끝이다. 한 기수에 반이 여럿이면 가장 늦은 종강일.
 */
export function replayTerms(
  sections: readonly { term_id: number; month: number | null; enrollment_opens_at: string; closes_at: string }[],
  today: string,
): ReplayTerm[] {
  const byTerm = new Map<number, ReplayTerm>();
  for (const s of sections) {
    if (!(s.enrollment_opens_at <= today && today <= s.closes_at)) continue;
    const prev = byTerm.get(s.term_id);
    if (!prev) byTerm.set(s.term_id, { termId: s.term_id, month: s.month, opens: s.enrollment_opens_at, closes: s.closes_at });
    else {
      if (s.enrollment_opens_at < prev.opens) prev.opens = s.enrollment_opens_at;
      if (s.closes_at > prev.closes) prev.closes = s.closes_at;
    }
  }
  return [...byTerm.values()].sort((a, b) => a.closes.localeCompare(b.closes) || a.termId - b.termId);
}

/** 달력 칸에 적는 `개강` · `종강` (기수가 둘이면 한 날에 둘이 설 수도 있다 — 9월 종강 · 10월 개강) */
export function termFlags(terms: readonly Pick<ReplayTerm, "opens" | "closes">[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (date: string, label: string) => {
    const list = (out[date] ??= []);
    if (!list.includes(label)) list.push(label);
  };
  // 종강을 먼저 — 같은 날이면 끝나는 기수가 앞에 선다
  for (const t of terms) add(t.closes, "종강");
  for (const t of terms) add(t.opens, "개강");
  return out;
}
