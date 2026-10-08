import { HOMEWORK_SUBJECTS, type HomeworkSubject, homeworkLabel, isSubject } from "@/lib/homework";

/**
 * **숙제 미제출 알림** — 정규 수업 숙제를 누가 냈고 누가 안 냈는지 수업일 × RC · LC 격자로 보고, 안 낸 학생에게 한 번에 알림을 보낸다
 * (2026-10-08 Alan — "숙제제출 리스트를 볼 수 있으면 좋겠어. 안한사람은 일괄선택해서 알림메시지도 보낼 수 있으면 좋겠어.
 *  여기서 레벨별로도 선택할 수 있으면 좋겠어" → 첫토익 "숙제 미제출 알림" 화면을 보여 주며 "이렇게 표시해주면 좋겠어.
 *  날짜는 강사가 설정한 수업일수를 매달 참고하면 좋겠어" · 숙제는 "수업마다 꼭 있다" · 알림은 "조교도 보낸다"). 미확정 9 를 닫는다.
 *
 * **숙제 칸 하나 = (수업일 · 레벨 · 과목)** — 학생이 숙제제출에서 그 날짜 · 레벨의 RC/LC 를 올리는 단위와 같다 (`homework_submissions`).
 * 날짜는 강사가 반 편성 달력에 정한 수업일에서 나온 반의 회차(`session_dates`)이고, 무엇을 내야 하는지는 반이 정한다:
 *  - 학생이 **직접 배정된 반**마다 그 반의 회차 날짜 — 2주완성 반은 회차가 앞 절반뿐이라 저절로 앞 절반만 센다
 *  - 그 날의 숙제는 그 반이 품은 **시간 단위 반**(DB `term_section_includes` — 120 · 140분 묶음 · 속성반 · 2주완성)마다,
 *    품은 반이 없으면 그 반 자신 (교재 권수와 같은 규칙 — `booksForSections`). 앱에서 품는 관계를 따로 계산하지 않는다
 *  - 시간 단위 반의 **과목 칸이 그 시간의 숙제 과목**이다 — 주3일 60분(단과)은 한 과목, 주5일 60분은 트랙마다 다른 과목,
 *    120분 · 속성반은 두 과목. 과목 칸이 빈 반(방학달 통짜 반 · 아직 안 고름)은 두 과목
 *  - 레벨은 그 시간 단위 반의 강좌 레벨 — 속성반 학생은 650 칸과 850 칸을 따로 갖는다 (레벨 탭마다 따로 보인다)
 *  - **반에 들어온 날(배정일, KST)부터 종강일까지** — 출석 한눈에 보기와 같은 규칙. 개강 뒤에 등록한 학생에게 그 전 수업 숙제는 묻지 않는다
 *  - **어제까지 지난 수업만 미제출로 센다** — 오늘 수업 숙제는 아직 낼 때가 아니다 (첫토익과 같다 — "오늘 회차는 아직 수업 전")
 *
 * 화면(`/admin/homework/missing`)과 서버 액션이 이 파일 하나로 계산한다 — 보내기 전에 서버가 다시 세서 알림 글을 만든다.
 */

/** 반 하나 — 격자 계산에 필요한 것만 */
export type MissingSection = {
  id: number;
  track: string;
  /** 그 반 강좌의 레벨 (`courses.target_score`) */
  level: number | null;
  /** 그 시간의 과목 rc · lc. 비어 있으면 두 과목 (방학달 통짜 반 · 아직 안 고름) */
  subject: string | null;
  /** 반의 개강일 · 종강일 (`class_sections.enrollment_opens_at` · `closes_at`) */
  opens: string;
  closes: string;
  /** 회차 날짜 (`session_dates.date`) */
  dates: readonly string[];
};

/** 학생의 직접 배정 하나 — `from` 은 배정한 날(KST) */
export type MissingEnrollment = { studentId: string; sectionId: number; from: string };

/** 낸 숙제 하나 — 수업일 · 레벨 · 과목 */
export type MissingSubmission = { userId: string; date: string; level: number; subject: string };

/** 칸 하나: 냄 · 안 냄(지난 수업) · 아직(오늘 · 앞으로) · 해당 없음(배정 전 · 그 시간 수업이 아님) */
export type MissingCell = "done" | "missing" | "upcoming" | "none";

const slotKey = (date: string, subject: string) => `${date}|${subject}`;

/** 시간 단위 반의 숙제 과목 — 과목 칸이 비면 두 과목 */
const subjectsOf = (s: Pick<MissingSection, "subject">): HomeworkSubject[] => (s.subject && isSubject(s.subject) ? [s.subject] : [...HOMEWORK_SUBJECTS]);

/**
 * 직접 배정된 반 하나가 만드는 숙제 칸 — 레벨 하나에서 날짜 → 과목들.
 * `from` 을 주면 그 날부터 (배정일), 안 주면 개강일부터 (반 격자의 열을 만들 때).
 */
function slotsOfSection(
  sectionId: number,
  level: number,
  includes: ReadonlyMap<number, readonly number[]>,
  sections: ReadonlyMap<number, MissingSection>,
  from: string | null,
  out: Map<string, Set<HomeworkSubject>>,
) {
  const s = sections.get(sectionId);
  if (!s) return;
  const start = from && from > s.opens ? from : s.opens;
  const inner = includes.get(sectionId) ?? [];
  const leaves = (inner.length > 0 ? inner : [sectionId]).map((id) => sections.get(id)).filter((x): x is MissingSection => !!x && x.level === level);
  if (leaves.length === 0) return;
  const leafDates = leaves.map((l) => new Set(l.dates));
  for (const d of s.dates) {
    if (d < start || d > s.closes) continue;
    leaves.forEach((leaf, i) => {
      if (!leafDates[i].has(d)) return;
      const set = out.get(d) ?? new Set<HomeworkSubject>();
      for (const subj of subjectsOf(leaf)) set.add(subj);
      out.set(d, set);
    });
  }
}

/** 한 학생이 그 레벨에서 낼 숙제 칸 — 날짜 → 과목들 (배정일부터 종강일까지) */
export function expectedSlots(
  enrollments: readonly Pick<MissingEnrollment, "sectionId" | "from">[],
  level: number,
  includes: ReadonlyMap<number, readonly number[]>,
  sections: ReadonlyMap<number, MissingSection>,
): Map<string, Set<HomeworkSubject>> {
  const out = new Map<string, Set<HomeworkSubject>>();
  for (const e of enrollments) slotsOfSection(e.sectionId, level, includes, sections, e.from, out);
  return out;
}

/** 격자의 열 하나 — 그 반의 수업일 (`seq` 는 화면에 나온 열 안에서 날짜 순 1, 2, 3 …) */
export type MissingColumn = {
  date: string;
  seq: number;
  /** 그 날이 어느 트랙 수업인가 — 주5일 반에서 월수금 · 화목금을 가른다 */
  track: string | null;
  /** 그 날 숙제 과목 (RC 먼저) */
  subjects: HomeworkSubject[];
};

/** 미제출 날짜 하나 */
export type MissingSlot = { date: string; subject: HomeworkSubject };

export type MissingRow = {
  id: string;
  name: string;
  /** 열마다 · 그 열의 과목마다 */
  cells: MissingCell[][];
  /** 지난 수업 숙제 칸 수 · 그중 낸 칸 수 */
  past: number;
  done: number;
  /** 안 낸 지난 수업 숙제 — 날짜 순, 같은 날은 RC 먼저 */
  missing: MissingSlot[];
  /** 제출률 % — 지난 수업이 없으면 null (0% 로 적지 않는다) */
  rate: number | null;
};

export type MissingGroup = {
  /** 직접 배정된 반 id 들 (정렬) */
  key: string;
  sectionIds: number[];
  columns: MissingColumn[];
  rows: MissingRow[];
};

type GroupSortKey = (string | number)[];

/**
 * 레벨 하나의 격자 — 직접 배정된 반이 같은 학생끼리 한 묶음(카드)이다.
 * 열은 그 묶음의 반들이 그 레벨에 숙제가 있는 수업일(개강일 ~ 종강일), 칸은 학생마다 배정일부터 센다.
 * 그 레벨에 숙제가 하나도 없는 학생 · 묶음은 빠진다 (속성반 학생은 650 탭과 850 탭에 다 선다).
 *
 * **강사 · 관리자 · 조교 계정(`staff`)은 반에 배정돼 있어도 넣지 않는다** (2026-10-08 Alan — "미제출 알림에 리스트 명단에 강사계정과 관리자 계정도
 * 포함되어있어. 이건 빼줘"). 학생 화면을 보려고 넣은 테스트 배정이다 — 줄 · 묶음 · 탭 숫자 · 전체선택 · 보내기 어디에도 없다
 * (처음엔 출석 한눈에 보기처럼 `테스터` 표를 달아 맨 아래에 뒀다). 그 계정만 배정된 반은 카드도 없다.
 *
 * 묶음 순서는 `sortKeyOf`(반 id → 정렬 키)가 정한다 — 반 이름 · 시간 같은 것은 화면 쪽이 안다. 줄 순서는 **안 낸 숙제가 많은 학생 → 이름**.
 */
export function buildMissingBoard(input: {
  level: number;
  today: string;
  sections: ReadonlyMap<number, MissingSection>;
  includes: ReadonlyMap<number, readonly number[]>;
  enrollments: readonly MissingEnrollment[];
  submissions: readonly MissingSubmission[];
  /** 이름과 강사 · 관리자 · 조교 계정인지 (`staff` 면 명단에 넣지 않는다) */
  people: ReadonlyMap<string, { name: string; staff: boolean }>;
  sortKeyOf?: (sectionId: number) => GroupSortKey;
}): MissingGroup[] {
  const { level, today, sections, includes } = input;

  // 학생 → 직접 배정 (강사 · 관리자 · 조교 계정의 테스트 배정은 뺀다)
  const byStudent = new Map<string, MissingEnrollment[]>();
  for (const e of input.enrollments) {
    if (!sections.has(e.sectionId) || input.people.get(e.studentId)?.staff) continue;
    byStudent.set(e.studentId, [...(byStudent.get(e.studentId) ?? []), e]);
  }

  // 낸 숙제 — 학생 → (날짜|과목) (이 레벨만)
  const doneBy = new Map<string, Set<string>>();
  for (const s of input.submissions) {
    if (s.level !== level || !isSubject(s.subject)) continue;
    const set = doneBy.get(s.userId) ?? new Set<string>();
    set.add(slotKey(s.date, s.subject));
    doneBy.set(s.userId, set);
  }

  // 묶음 — 직접 배정된 반 id 들이 같은 학생끼리
  const groups = new Map<string, { sectionIds: number[]; students: string[] }>();
  for (const [studentId, list] of byStudent) {
    const ids = [...new Set(list.map((e) => e.sectionId))].sort((a, b) => a - b);
    const key = ids.join(",");
    const g = groups.get(key) ?? { sectionIds: ids, students: [] };
    g.students.push(studentId);
    groups.set(key, g);
  }

  const out: MissingGroup[] = [];
  for (const [key, g] of groups) {
    // 열 — 반의 수업일(개강일부터) 중 이 레벨에 숙제가 있는 날
    const colSlots = new Map<string, Set<HomeworkSubject>>();
    for (const id of g.sectionIds) slotsOfSection(id, level, includes, sections, null, colSlots);
    if (colSlots.size === 0) continue;
    const trackOf = (d: string) => g.sectionIds.map((id) => sections.get(id)).find((s) => s?.dates.includes(d))?.track ?? null;
    const columns: MissingColumn[] = [...colSlots.keys()].sort().map((date, i) => ({
      date,
      seq: i + 1,
      track: trackOf(date),
      subjects: HOMEWORK_SUBJECTS.filter((s) => colSlots.get(date)!.has(s)),
    }));

    const rows: MissingRow[] = g.students.map((id) => {
      const mine = expectedSlots(byStudent.get(id) ?? [], level, includes, sections);
      const done = doneBy.get(id) ?? new Set<string>();
      let past = 0;
      let doneCount = 0;
      const missing: MissingSlot[] = [];
      const cells = columns.map((c) =>
        c.subjects.map((subject): MissingCell => {
          const submitted = done.has(slotKey(c.date, subject));
          if (!mine.get(c.date)?.has(subject)) return submitted ? "done" : "none";
          if (c.date < today) {
            past++;
            if (submitted) doneCount++;
            else missing.push({ date: c.date, subject });
          }
          return submitted ? "done" : c.date < today ? "missing" : "upcoming";
        }),
      );
      const person = input.people.get(id);
      return {
        id,
        name: person?.name ?? "",
        cells,
        past,
        done: doneCount,
        missing,
        rate: past > 0 ? Math.round((doneCount / past) * 100) : null,
      };
    });
    // 안 낸 숙제가 많은 학생 → 이름 순
    rows.sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name, "ko"));
    out.push({ key, sectionIds: g.sectionIds, columns, rows });
  }

  const sortKey = (g: MissingGroup): GroupSortKey => {
    const keys = g.sectionIds.map((id) => input.sortKeyOf?.(id) ?? [id]).sort(compareKeys);
    return [...(keys[0] ?? []), g.sectionIds.length];
  };
  return out.sort((a, b) => compareKeys(sortKey(a), sortKey(b)) || a.key.localeCompare(b.key));
}

function compareKeys(a: GroupSortKey, b: GroupSortKey): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y), "ko");
  }
  return 0;
}

/** 레벨 탭의 숫자 — 안 낸 숙제가 있는 학생 수 (한 사람은 한 번) */
export function missingStudentCount(groups: readonly MissingGroup[]): number {
  const ids = new Set<string>();
  for (const g of groups) for (const r of g.rows) if (r.missing.length > 0) ids.add(r.id);
  return ids.size;
}

/**
 * 제출률 단계 — 첫토익과 같은 문턱 (개근 100 · 양호 70 이상 · 주의 40 이상 · 위험 그 아래). 지난 수업이 없으면 `none`.
 * 색은 우리 핫핑크다 (구조만 첫토익).
 */
export type MissingStatus = "perfect" | "good" | "warn" | "risk" | "none";
export function missingStatus(rate: number | null): MissingStatus {
  if (rate === null) return "none";
  if (rate >= 100) return "perfect";
  if (rate >= 70) return "good";
  if (rate >= 40) return "warn";
  return "risk";
}
export const MISSING_STATUS_LABEL: Record<MissingStatus, string> = { perfect: "개근", good: "양호", warn: "주의", risk: "위험", none: "시작 전" };

/**
 * '미제출 전체선택' 이 고르는 학생 — 안 낸 지난 수업 숙제가 있는 학생 (첫토익 "제출률 100% 미만").
 * **오늘 이미 미제출 알림을 받은 학생은 뺀다** — 같은 날 두 번 가지 않게 (결석 알림과 같은 규칙). 손으로는 다시 고를 수 있다.
 */
export function defaultPicks(groups: readonly MissingGroup[], notifiedToday: ReadonlySet<string> = new Set()): string[] {
  const ids = new Set<string>();
  for (const g of groups) for (const r of g.rows) if (r.missing.length > 0 && !notifiedToday.has(r.id)) ids.add(r.id);
  return [...ids];
}

/** 레벨 하나에서 학생 한 명의 줄 — 묶음이 여럿이어도 학생은 한 묶음에만 선다 */
export function rowOf(groups: readonly MissingGroup[], studentId: string): MissingRow | null {
  for (const g of groups) for (const r of g.rows) if (r.id === studentId) return r;
  return null;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
/** "목" — 날짜(YYYY-MM-DD)의 요일. 형식이 다르면 빈 글자 */
export function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
/** "10/9" — 격자 머리글 */
export function monthDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return m && d ? `${m}/${d}` : date;
}
/** "10/9(목)" — 알림 글에 쓴다 */
export function shortDay(date: string): string {
  const w = weekdayOf(date);
  return w ? `${monthDay(date)}(${w})` : date;
}

/** 알림 제목 (강사가 고칠 수 있다 — 알림함 제목 한도 80자) */
export const HOMEWORK_MISSING_TITLE = "아직 내지 않은 숙제가 있어요";
export const MISSING_TITLE_MAX = 80;
/** 알림함 본문 한도 — DB check (student_messages.body) 와 같다 */
const BODY_MAX = 1000;
/** 한 과목 줄에 적는 날짜 수 — 넘으면 "외 N개" (본문이 알림함 한도를 넘지 않게) */
const DATES_PER_LINE = 24;

/**
 * 학생 한 명에게 갈 알림 글 — 학생마다 이름과 안 낸 날짜가 다르다 (첫토익처럼 "각 학생 이름과 상황에 맞게").
 * 학생은 숙제제출 달력에서 **날짜**로 찾으므로 회차 번호가 아니라 날짜를 적고, 레벨도 적는다 (속성반은 한 날짜에 레벨이 둘이다).
 */
export function homeworkMissingMessage(input: { name: string; level: number; missing: readonly MissingSlot[]; past: number; done: number }): string {
  const lines: string[] = [];
  for (const subject of HOMEWORK_SUBJECTS) {
    const days = [...new Set(input.missing.filter((m) => m.subject === subject).map((m) => m.date))].sort();
    if (days.length === 0) continue;
    const shown = days.slice(0, DATES_PER_LINE).map(shortDay).join(", ");
    const more = days.length > DATES_PER_LINE ? ` 외 ${days.length - DATES_PER_LINE}개` : "";
    lines.push(`· ${homeworkLabel(input.level, subject)} — ${shown}${more}`);
  }
  const who = input.name.trim() ? `${input.name.trim()} 학생, ` : "";
  const body = [
    `${who}아직 올리지 않은 숙제가 있어요.`,
    "",
    ...lines,
    "",
    `숙제제출에서 그 수업 날짜를 눌러 올려 주세요. 지금까지 숙제 ${input.past}개 중 ${input.done}개를 냈어요.`,
  ].join("\n");
  return body.length > BODY_MAX ? `${body.slice(0, BODY_MAX - 1)}…` : body;
}

/** 알림에 붙이는 표시 — 조교가 보내면 DB 트리거가 이 과목들의 선생님 이름을 보낸 이름으로 적는다 (RC 먼저) */
export function missingRelated(termId: number, level: number, missing: readonly MissingSlot[]) {
  return {
    termId,
    level,
    subjects: HOMEWORK_SUBJECTS.filter((s) => missing.some((m) => m.subject === s)),
    missing: missing.length,
  };
}
