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
 *  - **제출 기한이 지나야 미제출로 센다** (2026-10-14 Alan — "항상 다음수업 시간까지 제출기간이 되는거야 … 주5반은 월수금숙제 원리와
 *    화목금 숙제원리를 그대로 따라가면 돼. 그리고 시간은 오후 5시야"). 기한 = **그 수업과 같은 트랙의 다음 수업일 오후 5시(KST)** —
 *    월수금 월요일 숙제는 수요일 5시, 금요일 숙제는 다음 주 월요일 5시, 화목금도 같다. 다음 수업일은 반 편성 달력(`term_class_dates`)이 정하고
 *    기수를 넘어서도 본다 (그 달 마지막 수업의 숙제 = 다음 달 첫 같은 트랙 수업일). DB `public.homework_due_dates` 가 날짜를 주고 시각은 여기서 붙인다.
 *    다음 수업일이 아직 달력에 없으면(다음 달 편성 전) 기한을 모르는 것이라 미제출로 세지 않는다 — 틀린 알림을 보내느니 기다린다.
 *    (2026-10-08 ~ 10-14 에는 "어제까지 지난 수업" 이었다 — 월요일 숙제가 화요일 0시에 벌써 '안 냄' 이 됐다)
 *  - **알림은 기본으로 모두 받고, '알림 안 받기' 를 누른 학생만 빠진다** (2026-10-15 Alan — "숙제 미제출알림 신청하는거 반대로 부탁해!
 *    알림 안받기를 신청하는걸로 하자". 2026-10-14 하루는 거꾸로 숙제제출 화면에서 '신청하기' 를 누른 학생만 받았다).
 *    줄마다 `alerts`(받는가 — 안 받기를 누르지 않았나)를 달고, 화면은 받는 학생만 그린다 (`onlyAlerted` — 끈 학생은 체크박스로 볼 수만 있다).
 *    전체선택 · 보내기는 받는 학생만.
 *
 * 화면(`/admin/homework/missing`)과 서버 액션이 이 파일 하나로 계산한다 — 보내기 전에 서버가 다시 세서 알림 글을 만든다.
 */

/** 숙제 제출 기한의 시각 — 다음 같은 트랙 수업일의 오후 5시 (KST) */
export const HOMEWORK_DUE_TIME = "17:00";
export const HOMEWORK_DUE_LABEL = "오후 5시";

/** 기한 날짜(YYYY-MM-DD)의 오후 5시 — 견줄 수 있는 시각(ms). 날짜 꼴이 틀리면 NaN */
export function dueAt(due: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(due) ? Date.parse(`${due}T${HOMEWORK_DUE_TIME}:00+09:00`) : NaN;
}

/** 기한이 지났는가 — 5시를 **넘기면** 지난 것이다 (Alan "5시를 넘겼으니 제출기간이 지났지?"). 기한을 모르면(다음 수업일이 달력에 없음) 지나지 않은 것으로 본다 */
export function isOverdue(due: string | null | undefined, now: number = Date.now()): boolean {
  if (!due) return false;
  const at = dueAt(due);
  return Number.isFinite(at) && now > at;
}

/** "10/16(금) 오후 5시" — 학생 달력 · 관리자 칸 설명에 쓴다 */
export function dueLabel(due: string): string {
  return `${shortDay(due)} ${HOMEWORK_DUE_LABEL}`;
}

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

/** 칸 하나: 냄 · 안 냄(기한 지남) · 아직(기한 전) · 해당 없음(배정 전 · 그 시간 수업이 아님) */
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
  /** 그 날 숙제의 기한 날짜 (같은 트랙 다음 수업일 — 오후 5시) · 모르면 null */
  due: string | null;
  /** 기한이 지났는가 */
  overdue: boolean;
};

/** 미제출 숙제 하나 — 수업일 · 과목 · 기한 날짜 */
export type MissingSlot = { date: string; subject: HomeworkSubject; due: string };

export type MissingRow = {
  id: string;
  name: string;
  /** 숙제 미제출 알림을 받는가 — 숙제제출 화면에서 '알림 안 받기' 를 눌렀으면 거짓, 고를 수도 보낼 수도 없다 (2026-10-15 Alan) */
  alerts: boolean;
  /** 열마다 · 그 열의 과목마다 */
  cells: MissingCell[][];
  /** 기한이 지난 숙제 칸 수 · 그중 낸 칸 수 */
  past: number;
  done: number;
  /** 기한이 지났는데 안 낸 숙제 — 날짜 순, 같은 날은 RC 먼저 */
  missing: MissingSlot[];
  /** 제출률 % — 기한이 지난 숙제가 없으면 null (0% 로 적지 않는다) */
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
 * 칸이 '안 냄' 이 되는 것은 **그 날 숙제의 기한(`due` — 같은 트랙 다음 수업일, 오후 5시)이 지났을 때**다 (2026-10-14 — 머리말).
 *
 * **강사 · 관리자 · 조교 계정(`staff`)은 반에 배정돼 있어도 넣지 않는다** (2026-10-08 Alan — "미제출 알림에 리스트 명단에 강사계정과 관리자 계정도
 * 포함되어있어. 이건 빼줘"). 학생 화면을 보려고 넣은 테스트 배정이다 — 줄 · 묶음 · 탭 숫자 · 전체선택 · 보내기 어디에도 없다
 * (처음엔 출석 한눈에 보기처럼 `테스터` 표를 달아 맨 아래에 뒀다). 그 계정만 배정된 반은 카드도 없다.
 *
 * **'알림 안 받기' 를 누른 학생도 줄은 만든다** (`alerts: false`) — 화면이 기본으로 빼고(`onlyAlerted`) 체크박스를 켜면 볼 수만 있게 그린다.
 * 탭 숫자 · 전체선택 · 보내기는 받는 학생만 센다.
 *
 * 묶음 순서는 `sortKeyOf`(반 id → 정렬 키)가 정한다 — 반 이름 · 시간 같은 것은 화면 쪽이 안다.
 * 줄 순서는 **알림 받는 학생 먼저 → 안 낸 숙제가 많은 학생 → 이름**.
 */
export function buildMissingBoard(input: {
  level: number;
  /** 지금 (ms) — 기한과 견준다. 안 주면 지금 시각 (시험은 정해진 시각을 준다) */
  now?: number;
  /** 수업일 → 그 날 숙제의 기한 날짜 (DB `homework_due_dates`). 없거나 null 이면 기한을 모른다 — 미제출로 세지 않는다 */
  due: ReadonlyMap<string, string | null>;
  sections: ReadonlyMap<number, MissingSection>;
  includes: ReadonlyMap<number, readonly number[]>;
  enrollments: readonly MissingEnrollment[];
  submissions: readonly MissingSubmission[];
  /** 이름과 강사 · 관리자 · 조교 계정인지 (`staff` 면 명단에 넣지 않는다) */
  people: ReadonlyMap<string, { name: string; staff: boolean }>;
  /** 숙제 미제출 알림을 끈 학생 ('알림 안 받기') — 그 밖은 모두 받는다 */
  optedOut: ReadonlySet<string>;
  sortKeyOf?: (sectionId: number) => GroupSortKey;
}): MissingGroup[] {
  const { level, sections, includes } = input;
  const now = input.now ?? Date.now();
  const dueOf = (date: string) => input.due.get(date) ?? null;

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
    const columns: MissingColumn[] = [...colSlots.keys()].sort().map((date, i) => {
      const due = dueOf(date);
      return {
        date,
        seq: i + 1,
        track: trackOf(date),
        subjects: HOMEWORK_SUBJECTS.filter((s) => colSlots.get(date)!.has(s)),
        due,
        overdue: isOverdue(due, now),
      };
    });

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
          // 기한(같은 트랙 다음 수업일 오후 5시)이 지난 숙제만 센다 — 기한 전에 낸 것은 '냄' 으로 보이되 제출률에는 기한이 지난 뒤 들어간다
          if (c.overdue) {
            past++;
            if (submitted) doneCount++;
            else missing.push({ date: c.date, subject, due: c.due! });
          }
          return submitted ? "done" : c.overdue ? "missing" : "upcoming";
        }),
      );
      const person = input.people.get(id);
      return {
        id,
        name: person?.name ?? "",
        alerts: !input.optedOut.has(id),
        cells,
        past,
        done: doneCount,
        missing,
        rate: past > 0 ? Math.round((doneCount / past) * 100) : null,
      };
    });
    // 알림 받는 학생 먼저 → 안 낸 숙제가 많은 학생 → 이름 순
    rows.sort((a, b) => Number(b.alerts) - Number(a.alerts) || b.missing.length - a.missing.length || a.name.localeCompare(b.name, "ko"));
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

/** 화면에 그릴 묶음 — 알림을 받는 학생만 (끈 학생만 있는 묶음은 뺀다). 체크박스로 끈 학생도 볼 때는 이것을 거치지 않는다 */
export function onlyAlerted(groups: readonly MissingGroup[]): MissingGroup[] {
  return groups.map((g) => ({ ...g, rows: g.rows.filter((r) => r.alerts) })).filter((g) => g.rows.length > 0);
}

/** 레벨 탭의 숫자 — **알림을 받는 학생 중** 기한이 지난 숙제를 안 낸 학생 수 (한 사람은 한 번) */
export function missingStudentCount(groups: readonly MissingGroup[]): number {
  const ids = new Set<string>();
  for (const g of groups) for (const r of g.rows) if (r.alerts && r.missing.length > 0) ids.add(r.id);
  return ids.size;
}

/** '알림 안 받기' 를 누른 학생 수 (한 사람은 한 번) — 체크박스 이름에 적는다 */
export function optedOutCount(groups: readonly MissingGroup[]): number {
  const ids = new Set<string>();
  for (const g of groups) for (const r of g.rows) if (!r.alerts) ids.add(r.id);
  return ids.size;
}

/**
 * **새로 기한이 지난** 안 낸 숙제 — 그 레벨에서 마지막으로 미제출 알림을 받은 뒤(`lastSent`, ms)에 기한이 지난 것.
 * 알림 글은 그때 기한이 지난 안 낸 숙제를 다 적으므로, 알림 뒤에 기한이 지난 숙제만 아직 안 알린 것이다
 * (Alan 의 예 — 수요일 밤에는 월요일 숙제, 목요일 저녁에는 화요일 숙제). 알림을 받은 적이 없으면 안 낸 숙제 전부.
 */
export function newMissingOf(row: Pick<MissingRow, "missing">, lastSent: number | null | undefined): MissingSlot[] {
  if (lastSent == null || !Number.isFinite(lastSent)) return [...row.missing];
  return row.missing.filter((m) => dueAt(m.due) > lastSent);
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
 * '미제출 전체선택' 이 고르는 학생 — **알림을 받고(끄지 않았고) · 마지막 알림 뒤에 새로 기한이 지난 숙제를 안 낸** 학생 (`newMissingOf`).
 * 2026-10-14 Alan: "목요일 오후 6시라면 화요일 숙제를 제출하는거고 마감이 되었지? 그럼 미제출 알림을 보낼려면 화요일반 미제출한사람에 대해서
 * 알림을 보내면 돼" — 수요일 밤에 월요일 숙제로 알림을 받은 월수금 학생은 목요일 저녁에 다시 골라지지 않는다 (손으로는 고를 수 있다).
 * 2026-10-08 ~ 10-14 에는 "오늘 이미 알림을 받은 학생" 만 뺐다 — 다음 날이면 같은 숙제로 또 골라졌다.
 */
export function defaultPicks(groups: readonly MissingGroup[], lastSent: ReadonlyMap<string, number> = new Map()): string[] {
  const ids = new Set<string>();
  for (const g of groups) for (const r of g.rows) if (r.alerts && newMissingOf(r, lastSent.get(r.id)).length > 0) ids.add(r.id);
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
 * 적는 것은 **기한이 지난** 안 낸 숙제 전부다 — 새로 기한이 지난 것만이 아니라 전에 알린 것도 아직 안 냈으면 다시 적는다.
 */
export function homeworkMissingMessage(input: { name: string; level: number; missing: readonly Pick<MissingSlot, "date" | "subject">[]; past: number; done: number }): string {
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
    `${who}제출 기한이 지났는데 아직 올리지 않은 숙제가 있어요.`,
    "",
    ...lines,
    "",
    `숙제제출에서 그 수업 날짜를 눌러 올려 주세요. 숙제는 다음 수업일 ${HOMEWORK_DUE_LABEL}까지 내요. 기한이 지난 숙제 ${input.past}개 중 ${input.done}개를 냈어요.`,
  ].join("\n");
  return body.length > BODY_MAX ? `${body.slice(0, BODY_MAX - 1)}…` : body;
}

/** 알림에 붙이는 표시 — 조교가 보내면 DB 트리거가 이 과목들의 선생님 이름을 보낸 이름으로 적는다 (RC 먼저) */
export function missingRelated(termId: number, level: number, missing: readonly Pick<MissingSlot, "date" | "subject">[]) {
  return {
    termId,
    level,
    subjects: HOMEWORK_SUBJECTS.filter((s) => missing.some((m) => m.subject === s)),
    missing: missing.length,
  };
}
