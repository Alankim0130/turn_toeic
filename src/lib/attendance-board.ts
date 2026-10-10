/**
 * 출석 한눈에 보기 · 결석 알림 · 내 출석 달력 (2026-10-01 Alan).
 *
 * "이걸 하는 진짜 이유는 두가지가 있어. 1. 강사들이 지각생들과 결석생들을 알아보고 관리를 해주기 위함
 *  2. 학생들이 스스로 출석을 계속 하고 있다는 걸 알고 뿌듯함을 느끼게 해주기 위함."
 *
 * 수업일 한 칸(학생 · 반 · 날짜)의 상태를 **한 가지 표시**로 정하고, 그 표시를 강사 격자와 학생 달력이 함께 쓴다.
 * 세는 규칙은 DB 의 `attendance_term_board` · `my_attendance_days` · `my_attendance_summary` 와 같다 — 바꾸면 SQL 과 이 파일을 같이 고친다:
 *  - "끝난 수업" = 수업이 끝난 회차 (DB 가 `done` 으로 내려 준다. 2026-10-10 전에는 끝나고 30분 = 퇴실 마감)
 *  - 출석 = 한 번 찍음(present) + 선생님이 출석 인정(manual) · 결석 = 선생님이 정한 absent · 미출석 = 끝났는데 기록 없음
 *  - 지각은 따로 세는 표시다 (수업이 시작된 뒤에 찍음 — 1초라도. 2026-10-10 Alan "지각처리만 확실하게")
 *  - 2026-10-10 전의 입실만(in) · 퇴실까지(out)는 마이그레이션 20261010100000 이 전부 present 로 바꿨다 — 그 상태는 더 없다
 * 기수(개강일~종강일)를 고르는 일은 DB 함수와 `pickCurrentTerm` 이 한다 — 여기서는 받은 칸만 다룬다.
 */

/** DB `attendance_term_board.days` 의 한 칸 — `at` 은 찍은 시각 HH:MM */
export type BoardDay = { d: string; s: number; done: boolean; st: string | null; late: boolean; at?: string | null };

export type BoardRow = { student_id: string; student_name: string; tester: boolean; section_ids: number[] | null; days: BoardDay[] };

/**
 * 한 칸의 표시.
 * present 출석 · late 지각 출석 · absent 결석(선생님이 정함) · missing 미출석(끝났는데 기록 없음) · upcoming 예정(아직 안 끝났고 기록 없음)
 * (찍은 순간 출석이 정해지므로 "수업 중 입실" 같은 중간 상태는 없다)
 */
export type MarkKind = "present" | "late" | "absent" | "missing" | "upcoming";

export function dayMark(day: { done: boolean; st: string | null; late: boolean }): MarkKind {
  if (day.st === "absent") return "absent";
  // 출석 인정은 지각 표시를 지운다 (DB attendance_set) — manual 이면 late 는 늘 false 다
  if (day.st === "present" || day.st === "manual") return day.late ? "late" : "present";
  return day.done ? "missing" : "upcoming";
}

/** 출석으로 세는 표시 — 지각해도 찍었으면 출석이다 */
export const isPresentMark = (k: MarkKind) => k === "present" || k === "late";

/**
 * 표시의 이름 · 한 글자 · 색. 강사 격자와 학생 달력이 같이 쓴다 (도장 안에는 한 글자, 넓은 화면에는 이름).
 * 출석은 **브랜드 핫핑크 도장**이다 — 학생이 "출석!" 화면에서 본 그 색이다. 지각은 하늘색(명단의 지각 칩과 같은 색).
 */
export const MARK_STYLE: Record<MarkKind, { label: string; letter: string; className: string }> = {
  present: { label: "출석", letter: "출", className: "bg-brand-500 text-white" },
  late: { label: "지각", letter: "지", className: "bg-sky-500 text-white" },
  absent: { label: "결석", letter: "결", className: "bg-red-500 text-white" },
  missing: { label: "미출석", letter: "미", className: "bg-red-100 text-red-700" },
  upcoming: { label: "예정", letter: "", className: "border-2 border-dashed border-line bg-paper text-mist" },
};

/** 표시 설명 (격자·달력 위의 범례) — 화면에 실제로 나온 것만 적는다 */
export const MARK_ORDER: MarkKind[] = ["present", "late", "absent", "missing", "upcoming"];

export type DayCounts = { total: number; past: number; present: number; late: number; absent: number; missing: number };

/** 칸들을 센다 — DB `my_attendance_summary` 와 같은 뜻 (past 이하 숫자는 끝난 수업만) */
export function countDays(days: readonly { done: boolean; st: string | null; late: boolean }[]): DayCounts {
  const c: DayCounts = { total: days.length, past: 0, present: 0, late: 0, absent: 0, missing: 0 };
  for (const d of days) {
    if (!d.done) continue;
    c.past++;
    if (d.st === "present" || d.st === "manual") c.present++;
    if (d.late) c.late++;
    if (d.st === "absent") c.absent++;
    if (d.st === null) c.missing++;
  }
  return c;
}

/** 출석률 (끝난 수업 중 출석) — 끝난 수업이 없으면 null (0% 로 적지 않는다) */
export const attendancePct = (c: Pick<DayCounts, "past" | "present">) => (c.past > 0 ? Math.min(100, Math.round((c.present / c.past) * 100)) : null);

/**
 * 강사 격자의 줄 순서: **결석·미출석이 많은 학생 → 지각이 많은 학생 → 이름** (2026-10-01 Alan —
 * "지각생들과 결석생들을 알아보고"). 테스터(강사·관리자 계정)는 맨 아래로 — 진짜 학생 사이에 섞이면 눈에 걸린다.
 */
export function rankBoard<T extends { student_name: string; tester: boolean; days: BoardDay[] }>(rows: readonly T[]): (T & { counts: DayCounts })[] {
  return rows
    .map((r) => ({ ...r, counts: countDays(r.days) }))
    .sort(
      (a, b) =>
        Number(a.tester) - Number(b.tester) ||
        b.counts.absent + b.counts.missing - (a.counts.absent + a.counts.missing) ||
        b.counts.late - a.counts.late ||
        (a.student_name || "").localeCompare(b.student_name || "", "ko"),
    );
}

/** 격자의 날짜 칸 — 누군가 수업이 있는 날만, 날짜순 */
export function boardDates(rows: readonly { days: readonly { d: string }[] }[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const d of r.days) set.add(d.d);
  return [...set].sort();
}

// ─── 끝난 수업 ────────────────────────────────────────────────────────────────

/** 지금 한국 시간 — 날짜와 그날 0시부터 지난 분 */
export function kstNow(d: Date = new Date()): { date: string; minutes: number } {
  const date = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const [h, m] = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number);
  return { date, minutes: h * 60 + m };
}

const dayNumber = (ymd: string) => Math.round(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) / 86_400_000);

/**
 * 그 날 그 반 수업이 **끝났나** — DB 의 `d.date + time_block_end <= 지금(KST)` 과 같다 (2026-10-10 — 그전에는 끝나고 30분, 퇴실 마감).
 * 끝나면 더 찍을 수 없으므로 그때부터 기록이 없으면 미출석이다. 시간을 못 읽는 반은 출석을 찍지 않으므로 끝난 것으로 보지 않는다.
 */
export function classDone(date: string, timeBlock: string | null | undefined, now: { date: string; minutes: number }): boolean {
  const m = timeBlock?.match(/^(\d{2}):(\d{2})~(\d{2}):(\d{2})$/);
  if (!m) return false;
  const end = Number(m[3]) * 60 + Number(m[4]);
  return (dayNumber(now.date) - dayNumber(date)) * 1440 + now.minutes >= end;
}

// ─── 결석 알림 ─────────────────────────────────────────────────────────────────

/** DB `attendance_roster` 한 줄 중 결석 알림에 쓰는 칸 */
export type RosterLike = {
  section_id: number;
  course_name: string;
  track: string;
  time_block: string | null;
  student_id: string;
  student_name: string;
  tester: boolean;
  status: string | null;
};

export type Absentee = { student_id: string; student_name: string; tester: boolean; sectionIds: number[]; labels: string[]; absent: boolean };

const TRACK_NAME: Record<string, string> = { mwf: "월수금", ttf: "화목금" };

/**
 * 그 날 **결석·미출석** 학생 — 수업이 끝났는데 기록이 없거나 선생님이 결석으로 정한 학생.
 * 아직 안 끝난 수업은 넣지 않는다 (올 시간이 남았다). 지각생은 왔으므로 넣지 않는다.
 * 한 사람이 그 날 두 반을 빠졌으면 한 줄로 합친다 — 알림은 한 사람에 한 번이다.
 */
export function absenteesOf(rows: readonly RosterLike[], date: string, now: { date: string; minutes: number }): Absentee[] {
  const by = new Map<string, Absentee>();
  for (const r of rows) {
    if (!(r.status === null || r.status === "absent")) continue;
    if (!classDone(date, r.time_block, now)) continue;
    const a = by.get(r.student_id) ?? { student_id: r.student_id, student_name: r.student_name, tester: r.tester, sectionIds: [], labels: [], absent: false };
    if (!a.sectionIds.includes(r.section_id)) {
      a.sectionIds.push(r.section_id);
      a.labels.push([r.course_name, TRACK_NAME[r.track] ?? r.track, r.time_block].filter(Boolean).join(" "));
    }
    if (r.status === "absent") a.absent = true;
    by.set(r.student_id, a);
  }
  return [...by.values()].sort((x, y) => Number(x.tester) - Number(y.tester) || (x.student_name || "").localeCompare(y.student_name || "", "ko"));
}

/** 결석 알림 기본 문구 — 강사가 보내기 전에 고친다. 알림함 제목 80자 · 본문 1,000자 안 */
export function absenceNoticeMessage(date: string): { title: string; body: string } {
  const [, mo, da] = date.split("-").map(Number);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(Number(date.slice(0, 4)), mo - 1, da)).getUTCDay()];
  return {
    title: `${mo}월 ${da}일 수업 결석 안내`,
    body: `${mo}월 ${da}일(${wd}) 수업에 출석 기록이 없어요.\n사정이 있었다면 선생님께 말씀해 주세요. 다음 수업에서 꼭 만나요!`,
  };
}

// ─── 내 출석 (학생) ────────────────────────────────────────────────────────────

/**
 * 연속 출석 — 가장 최근에 끝난 수업부터 거꾸로, 출석(지각 포함)이 이어진 횟수.
 * 끝나지 않은 수업은 세지도 끊지도 않는다 (오늘 수업이 아직 진행 중이어도 어제까지의 연속이 그대로 보인다).
 * 결석·미출석이면 거기서 끊긴다 — 출석으로 세지 않는 날이다.
 */
export function streakOf(days: readonly { d: string; done: boolean; st: string | null; late: boolean; order?: string | null }[]): number {
  const past = days.filter((d) => d.done).sort((a, b) => a.d.localeCompare(b.d) || (a.order ?? "").localeCompare(b.order ?? ""));
  let n = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (!isPresentMark(dayMark(past[i]))) break;
    n++;
  }
  return n;
}

/**
 * 내 출석 화면에 보여 줄 기수 — **지금 기수**(오늘이 개강일~종강일 안)가 있으면 그것(겹치는 며칠엔 둘 다),
 * 없으면 **가장 가까운 다음 기수**(개강 전 예비등록생). 종강한 기수는 DB 가 아예 내려 주지 않는다.
 * (2026-10-01 Alan — "해당달의 종강일이 되면 모두 사라지고, 다음달의 개강일에 맞춰서 새로운 …")
 */
export function pickRecordTerms<T extends { term_id: number; opens: string; closes: string }>(rows: readonly T[], today: string): number[] {
  const terms = new Map<number, { opens: string; closes: string }>();
  for (const r of rows) if (!terms.has(r.term_id)) terms.set(r.term_id, { opens: r.opens, closes: r.closes });
  const list = [...terms.entries()].sort((a, b) => a[1].opens.localeCompare(b[1].opens));
  const current = list.filter(([, t]) => t.opens <= today && today <= t.closes).map(([id]) => id);
  if (current.length) return current;
  const next = list.find(([, t]) => t.opens > today);
  return next ? [next[0]] : [];
}

/** 달력 칸 — 그 달 1일의 요일만큼 비우고, 마지막 주를 채운다 (일요일 시작) */
export function monthCells(year: number, month: number): Array<{ day: number; date: string } | null> {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 기간이 걸친 달들 — 개강이 9월 말이고 종강이 10월이면 [9월, 10월] */
export function monthsBetween(from: string, to: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4));
  const em = Number(to.slice(5, 7));
  while ((y < ey || (y === ey && m <= em)) && out.length < 4) {
    out.push({ year: y, month: m });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
