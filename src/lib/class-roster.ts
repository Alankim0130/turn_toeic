/**
 * 반별 명단 (2026-10-14 Alan — 종이 명단 사진(`650A(화목금) · 650B(월수금) · 750A(월수금) · 750B(화목금) · 850N(월수금) · 850V(화목금)` 칸마다
 * 이름 가나다순, 이름 뒤에 `(불)` `(프)` `(월)` `(불/프)` …)을 보내며 "학생명단 부분을 조금 수정하고 싶어. 레벨별로 가나다순으로 보이도록 부탁해.
 * Pc모드에서는 지금 올린 이미지처럼 한페이지에서 구분이 가능하면 좋겠어. 그리고 다운로드해서 인쇄할 수 있으면 좋겠어").
 *
 * **종이 명단의 한 칸 = 수업 한 반이다** — 한 과목(LC 또는 RC)의 **시간 단위 반**(60 · 70분, 방학달은 통짜 반)이고 머리는 `레벨 + 과정 글자 (트랙)`.
 * 사진은 9월 LC 명단이었다: 9월 편성에서 LC 수업은 650 화목금 10:00(A과정) · 650 월수금 11:10(B) · 750 월수금 10:00(A) · 750 화목금 11:10(B) ·
 * 850 화목금 12:30 · 850 월수금 13:50 이고, 속성반 학생이 850 은 **화목금 칸에만** 서 있는 것까지 맞는다 (속성반은 850 12:30 만 듣는데 그 시간 LC 가 화목금이다).
 * 그래서 과목마다 한 장이다 — `lc` · `rc` (그 반의 과목 칸이 비어 있으면 — 방학달 통짜 반 · 아직 안 고름 — 두 과목 명단에 다 선다).
 * 종이의 850 `N` · `V` 는 우리 데이터의 과정 글자 `B` · `A` 다 (9월 850 13:50 = B · 12:30 = A) — 화면은 우리 글자를 쓴다.
 *
 * **누가 어느 칸에 서나** — 학생이 **직접 배정된 반**에서 출발한다:
 *  - 시간 단위 반이면 그 반 · 묶음 반(120 · 140분) · 속성반 · 2주완성이면 그 반이 품은 시간 단위 반 (DB `term_section_includes` — 앱에서 따로 계산하지 않는다).
 *    그래서 120분 학생은 두 시간 중 그 과목 시간의 칸에, 주5일 60분은 트랙마다 과목이 달라 한 과목 명단에 한 칸, 속성반은 650 칸과 850 칸에 다 선다
 *  - **표시** (종이와 같은 글자, `/` 로 잇는다): `불` 그 칸으로 데려온 배정이 불라방(`enrollments.mode = live`) · `프` 속성반(프리미어 — 수강증 표기) ·
 *    `2주` 2주완성 · `월` · `화` 그 강좌를 한 트랙만 등록(주3일 — 월수금만 · 화목금만). 주5일은 표시가 없다
 *  - 이름 가나다순 (`localeCompare(…, "ko")`), 같은 이름은 계정 순
 *  - **강사 · 관리자 · 조교 계정은 넣지 않는다** — 학생 화면을 보려고 넣은 테스트 배정이다 (숙제 미제출 알림과 같은 규칙)
 *  - **종강한 배정은 뺀다** (`closesAt < today`) — 앞 절반이 끝난 2주완성 학생이 그 달 끝까지 칸에 남지 않게
 * 칸은 레벨 → 시작 시각 → 트랙(월수금 먼저) 순, 레벨마다 묶는다. 학생이 없는 반은 칸을 그리지 않고 `empty` 에 둔다 (인쇄할 종이를 아낀다).
 * 순수 함수 (`class-roster.test.ts`). 화면 · PDF(`class-roster-pdf.ts`)가 같은 결과를 그린다.
 */
import { parseTimeBlock } from "./time-blocks";
import { isContainerProgram } from "./two-week";
import { TRACK_LABEL } from "./utils";

export const ROSTER_SUBJECTS = ["lc", "rc"] as const;
export type RosterSubject = (typeof ROSTER_SUBJECTS)[number];
export const ROSTER_SUBJECT_LABEL: Record<RosterSubject, string> = { lc: "LC", rc: "RC" };
export const isRosterSubject = (v: unknown): v is RosterSubject => v === "lc" || v === "rc";

/** 표시 글자와 뜻 — 화면 · PDF 의 범례가 이 순서로 쓴다 (종이 명단의 글자 그대로) */
export const ROSTER_MARKS = [
  { mark: "불", label: "불라방" },
  { mark: "프", label: "프리미어(속성반)" },
  { mark: "2주", label: "2주완성" },
  { mark: "월", label: "월수금만(주3일)" },
  { mark: "화", label: "화목금만(주3일)" },
] as const;

export type RosterSection = {
  id: number;
  track: string;
  timeBlock: string | null;
  /** 그 시간의 과목 lc · rc. 비어 있으면 두 과목 (방학달 통짜 반 · 아직 안 고름) */
  subject: string | null;
  /** 과정 A · B (`class_sections.book_set`) */
  bookSet: string | null;
  /** 인강 반 (저녁 화목금) */
  recorded: boolean;
  /** 반의 종강일 — 2주완성 반은 앞 절반 마지막 날 */
  closesAt: string;
  courseId: number | null;
  /** 강좌 레벨 (`courses.target_score`) */
  level: number | null;
  /** score · sparta · twoweek */
  program: string | null;
  courseName: string | null;
};

/** 직접 배정 하나 (`enrollments` — status active) */
export type RosterEnrollment = { studentId: string; sectionId: number; mode: string | null };
export type RosterPerson = { name: string; staff: boolean };

export type RosterStudent = { id: string; name: string; marks: string[] };
export type RosterColumn = {
  sectionId: number;
  level: number | null;
  /** "650B" — 레벨 + 과정 글자 */
  title: string;
  track: string;
  /** "10:00~11:00" */
  time: string | null;
  recorded: boolean;
  /** 과목 칸이 비어 RC · LC 를 이어 하는 반 */
  bothSubjects: boolean;
  students: RosterStudent[];
};
/** `tone` = 레벨 색 순서 — 그 기수의 시간 단위 반 레벨을 작은 것부터 센 자리라 LC · RC 명단이 같은 색을 쓴다 (650 살구 · 750 노랑 · 850 하늘 — `ROSTER_TONES`) */
export type RosterLevel = { key: string; level: number | null; label: string; tone: number; columns: RosterColumn[]; count: number };
export type ClassRoster = {
  subject: RosterSubject;
  levels: RosterLevel[];
  /** 학생이 없는 반 — 칸은 그리지 않는다 */
  empty: RosterColumn[];
  /** 이 명단에 선 학생 수 (한 사람은 한 번) */
  total: number;
  /** 그 기수에 배정됐지만 이 과목 수업이 없는 학생 수 (LC 명단의 RC 단과 등) */
  elsewhere: number;
};

/**
 * 레벨 색 — 종이 명단과 같은 엑셀 기본 연한 색 (650 살구 · 750 노랑 · 850 하늘, 그다음 연두 · 보라 · 회색). `RosterLevel.tone` 순서로 쓰고
 * 화면(`ClassRosterView`)과 PDF(`class-roster-pdf.ts`)가 같은 값을 쓴다. `ink` 는 칸 머리 글자색. 브랜드 핑크가 아니라 관리자 모드(토스 파랑)에서도 그대로다
 */
export const ROSTER_TONES = [
  { head: "#F8CBAD", body: "#FCE4D6", ink: "#6E3410" },
  { head: "#FFE699", body: "#FFF2CC", ink: "#5E4A00" },
  { head: "#BDD7EE", body: "#DDEBF7", ink: "#1F4E79" },
  { head: "#C6E0B4", body: "#E2EFDA", ink: "#33501F" },
  { head: "#CCC0DA", body: "#E4DFEC", ink: "#3D2F50" },
  { head: "#D9D9D9", body: "#F2F2F2", ink: "#333333" },
] as const;
export const toneOf = (tone: number) => ROSTER_TONES[((tone % ROSTER_TONES.length) + ROSTER_TONES.length) % ROSTER_TONES.length];

/** "(불/프)" — 표시가 없으면 빈 글자 */
export const marksText = (marks: readonly string[]): string => (marks.length > 0 ? `(${marks.join("/")})` : "");

/** 칸 머리 한 줄 — "650B (화목금)" */
export const columnHeading = (c: Pick<RosterColumn, "title" | "track">): string => `${c.title} (${TRACK_LABEL[c.track] ?? c.track})`;

/** 칸 머리 둘째 줄 — "18:30~19:30 인강" · "10:00~12:10 RC·LC" (좁은 칸에 들어가게 가운뎃점 없이) */
export function columnDetail(c: Pick<RosterColumn, "time" | "recorded" | "bothSubjects">): string {
  return [c.time, c.recorded ? "인강" : null, c.bothSubjects ? "RC·LC" : null].filter(Boolean).join(" ");
}

const levelKey = (level: number | null, courseName: string | null) => (level != null ? `L${level}` : `C${courseName ?? ""}`);

export function buildClassRoster(input: {
  sections: readonly RosterSection[];
  /** 부모 반 → 품은 반 (`term_section_includes`) */
  includes: ReadonlyMap<number, readonly number[]>;
  enrollments: readonly RosterEnrollment[];
  people: ReadonlyMap<string, RosterPerson>;
  subject: RosterSubject;
  today: string;
}): ClassRoster {
  const { includes, subject, today } = input;
  const byId = new Map(input.sections.map((s) => [s.id, s]));
  // 시간 단위 반 = 그릇 과정(속성반 · 2주완성)이 아니고 품은 반이 없는 반 (묶음 반은 품은 반이 있다). 방학달 통짜 반도 여기다
  const isLeaf = (s: RosterSection) => !isContainerProgram(s.program) && (includes.get(s.id)?.length ?? 0) === 0;
  const inSubject = (s: RosterSection) => s.subject == null || s.subject === subject;

  /** 직접 배정된 반이 데려가는 시간 단위 반 — 품은 반이 다시 품으면 따라간다(지금 DB 는 한 단계뿐이다) */
  const leavesOf = (id: number, seen = new Set<number>()): RosterSection[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const s = byId.get(id);
    if (!s) return [];
    if (isLeaf(s)) return [s];
    return (includes.get(id) ?? []).flatMap((c) => leavesOf(c, seen));
  };

  // 학생 → 살아 있는 직접 배정 (강사 · 관리자 · 조교 계정과 종강한 배정은 뺀다)
  const directs = new Map<string, { section: RosterSection; mode: string | null }[]>();
  for (const e of input.enrollments) {
    const s = byId.get(e.sectionId);
    if (!s || s.closesAt < today || input.people.get(e.studentId)?.staff) continue;
    const list = directs.get(e.studentId) ?? [];
    if (!list.some((d) => d.section.id === s.id)) list.push({ section: s, mode: e.mode });
    directs.set(e.studentId, list);
  }

  // 칸 → 학생 → 그 칸으로 데려온 직접 배정들
  const cells = new Map<number, Map<string, { section: RosterSection; mode: string | null }[]>>();
  for (const [studentId, list] of directs) {
    for (const d of list) {
      for (const leaf of leavesOf(d.section.id)) {
        if (!inSubject(leaf)) continue;
        const col = cells.get(leaf.id) ?? new Map();
        col.set(studentId, [...(col.get(studentId) ?? []), d]);
        cells.set(leaf.id, col);
      }
    }
  }

  const marksOf = (studentId: string, via: { section: RosterSection; mode: string | null }[]): string[] => {
    const courses = new Set(via.map((d) => d.section.courseId));
    // 그 강좌를 등록한 트랙 — 한 트랙뿐이면 주3일
    const tracks = new Set((directs.get(studentId) ?? []).filter((d) => courses.has(d.section.courseId)).map((d) => d.section.track));
    const marks: string[] = [];
    if (via.some((d) => d.mode === "live")) marks.push("불");
    if (via.some((d) => d.section.program === "sparta")) marks.push("프");
    if (via.some((d) => d.section.program === "twoweek")) marks.push("2주");
    if (tracks.size === 1) {
      const [t] = tracks;
      if (t === "mwf") marks.push("월");
      else if (t === "ttf") marks.push("화");
    }
    return marks;
  };

  const columnOf = (s: RosterSection, students: RosterStudent[]): RosterColumn => ({
    sectionId: s.id,
    level: s.level,
    title: `${s.level ?? s.courseName ?? "반"}${s.bookSet ?? ""}`,
    track: s.track,
    time: s.timeBlock,
    recorded: s.recorded,
    bothSubjects: s.subject == null,
    students,
  });

  // 레벨 색 — 과목과 상관없이 그 기수의 시간 단위 반 레벨 순서 (LC 명단과 RC 명단의 색이 같게)
  const toneKeys = [...new Map(input.sections.filter(isLeaf).map((s) => [levelKey(s.level, s.courseName), s] as const)).values()]
    .sort((a, b) => (a.level ?? Number.MAX_SAFE_INTEGER) - (b.level ?? Number.MAX_SAFE_INTEGER) || (a.courseName ?? "").localeCompare(b.courseName ?? "", "ko"))
    .map((s) => levelKey(s.level, s.courseName));

  const leaves = input.sections.filter((s) => isLeaf(s) && inSubject(s));
  const span = (s: RosterSection) => parseTimeBlock(s.timeBlock);
  leaves.sort(
    (a, b) =>
      (a.level ?? Number.MAX_SAFE_INTEGER) - (b.level ?? Number.MAX_SAFE_INTEGER) ||
      (a.courseName ?? "").localeCompare(b.courseName ?? "", "ko") ||
      (span(a)?.start ?? 9999) - (span(b)?.start ?? 9999) ||
      (span(a)?.end ?? 9999) - (span(b)?.end ?? 9999) ||
      Number(a.track !== "mwf") - Number(b.track !== "mwf") ||
      a.id - b.id,
  );

  const levels: RosterLevel[] = [];
  const empty: RosterColumn[] = [];
  const everyone = new Set<string>();
  for (const s of leaves) {
    const col = cells.get(s.id);
    const students: RosterStudent[] = [...(col ?? new Map<string, never[]>()).entries()]
      .map(([id, via]) => ({ id, name: input.people.get(id)?.name ?? "", marks: marksOf(id, via) }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));
    const column = columnOf(s, students);
    if (students.length === 0) {
      empty.push(column);
      continue;
    }
    const key = levelKey(s.level, s.courseName);
    let group = levels.find((l) => l.key === key);
    if (!group) {
      group = { key, level: s.level, label: s.level != null ? String(s.level) : (s.courseName ?? "기타"), tone: Math.max(0, toneKeys.indexOf(key)), columns: [], count: 0 };
      levels.push(group);
    }
    group.columns.push(column);
    for (const st of students) everyone.add(st.id);
  }
  for (const g of levels) g.count = new Set(g.columns.flatMap((c) => c.students.map((s) => s.id))).size;

  return { subject, levels, empty, total: everyone.size, elsewhere: [...directs.keys()].filter((id) => !everyone.has(id)).length };
}

/**
 * 카드 명단을 **레벨별 · 가나다순**으로 (2026-10-14 Alan "레벨별로 가나다순으로 보이도록") — 휴대폰 기본 화면 · `카드` 보기.
 * 학생마다 레벨(그 탭의 반 — 등록생은 수강 중인 반, 예비등록생은 개강 전 반)을 받아 레벨마다 묶는다.
 * 두 레벨을 듣는 학생(650 단과 + 750 단과)은 두 묶음에 다 선다. 반이 없으면 맨 끝 `반 미배정`. 레벨은 작은 것부터, 묶음 안은 이름 가나다순.
 */
export function groupByLevel<T>(items: readonly T[], levelsOf: (item: T) => readonly (number | null)[], nameOf: (item: T) => string): { level: number | null; items: T[] }[] {
  const groups = new Map<number | null, T[]>();
  for (const item of items) {
    const levels = [...new Set(levelsOf(item).filter((l): l is number => l != null))];
    for (const level of levels.length > 0 ? levels : [null]) groups.set(level, [...(groups.get(level) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER))
    .map(([level, list]) => ({ level, items: [...list].sort((x, y) => nameOf(x).localeCompare(nameOf(y), "ko")) }));
}

/**
 * 명단을 고를 기수 — 아직 종강하지 않은 기수(개강일 · 종강일을 정한 것), 개강일 순.
 * 종강한 기수는 배정이 다 끝나 빈 명단이라 고르지 않는다.
 */
export function rosterTerms<T extends { year: number; month: number; enrollment_opens_at?: string | null; closes_at?: string | null }>(terms: readonly T[], today: string): T[] {
  return terms
    .filter((t) => !!t.enrollment_opens_at && !!t.closes_at && t.closes_at >= today)
    .sort((a, b) => (a.enrollment_opens_at ?? "").localeCompare(b.enrollment_opens_at ?? "") || a.year - b.year || a.month - b.month);
}

/** "10/6 개강 ~ 11/3 종강" — 날짜를 안 정한 기수는 빈 글자 */
export function rosterPeriod(term: { enrollment_opens_at?: string | null; closes_at?: string | null }): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return term.enrollment_opens_at && term.closes_at ? `${md(term.enrollment_opens_at)} 개강 ~ ${md(term.closes_at)} 종강` : "";
}

/** 출력 시각 (한국 시간) — "2026-10-14 21:05" */
export const printedAtKST = (now = new Date()): string => now.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);

/** PDF 파일 이름 — `역전토익_반별명단_2026-10_LC.pdf` */
export function rosterFileName(term: { year: number; month: number }, subject: RosterSubject): string {
  return `역전토익_반별명단_${term.year}-${String(term.month).padStart(2, "0")}_${ROSTER_SUBJECT_LABEL[subject]}.pdf`;
}

/** 내려받기 머리 — 한글 이름(filename*)과 영문 이름(옛 브라우저) */
export function rosterDisposition(term: { year: number; month: number }, subject: RosterSubject): string {
  const name = rosterFileName(term, subject);
  const ascii = name.replace("역전토익_반별명단", "winnertoeic-class-roster").replace(/[^\x20-\x7e]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
