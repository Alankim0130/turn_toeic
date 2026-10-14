/**
 * 반별 명단 (2026-10-14 Alan — 종이 명단 사진(`650A(화목금) · 650B(월수금) · 750A(월수금) · 750B(화목금) · 850N(월수금) · 850V(화목금)` 칸마다
 * 이름 가나다순, 이름 뒤에 `(불)` `(프)` `(월)` `(불/프)` …)을 보내며 "학생명단 부분을 조금 수정하고 싶어. 레벨별로 가나다순으로 보이도록 부탁해.
 * Pc모드에서는 지금 올린 이미지처럼 한페이지에서 구분이 가능하면 좋겠어. 그리고 다운로드해서 인쇄할 수 있으면 좋겠어").
 *
 * **한 칸 = 한 레벨의 수업 시간 한 칸** — 그 시간의 월수금 반과 화목금 반을 합친다 (`650B 10:00~11:00` = 10월 650 10:00 의 월수금 RC + 화목금 LC).
 * 같은 날 저녁 Alan — "학생명단 lc, rc구분하지말고 합쳐서 해줘. 그리고 단과생이 있다면 (LC) (RC) 이렇게 적어주면 좋겠어".
 * 그전 몇 시간은 **과목마다 한 장**(`LC 수업 · RC 수업`)이었고 칸이 트랙 하나(`650B (화목금)`)였다 — 사진이 9월 **LC 명단**이었기 때문이다
 * (속성반 학생이 850 은 화목금 칸에만 서 있다 — 속성반은 850 12:30 만 듣는데 그 시간 LC 가 화목금이다). **과목으로 다시 나누지 말 것.**
 * 시간 한 칸에는 늘 두 트랙이 있고 트랙마다 과목이 반대라(10:00 = 월수금 RC · 화목금 LC) 칸 수는 LC 명단 한 장과 같다 —
 * 칸 머리 둘째 줄에 `월 RC · 화 LC` 를 적어 어느 요일이 무슨 과목인지 보인다.
 * 종이의 850 `N` · `V` 는 우리 데이터의 과정 글자 `B` · `A` 다 (9월 850 13:50 = B · 12:30 = A) — 화면은 우리 글자를 쓴다.
 *
 * **누가 어느 칸에 서나** — 학생이 **직접 배정된 반**에서 출발한다:
 *  - 시간 단위 반이면 그 반 · 묶음 반(120 · 140분) · 속성반 · 2주완성이면 그 반이 품은 시간 단위 반 (DB `term_section_includes` — 앱에서 따로 계산하지 않는다).
 *    그 시간 단위 반이 든 칸에 선다 — 120분 학생은 두 시간 칸에, 주5일 60분은 한 칸에, 속성반은 650 칸과 850 12:30 칸에 다 선다. 한 칸에는 한 번만
 *  - **표시** (`/` 로 잇는다): `불` 그 칸으로 데려온 배정이 불라방(`enrollments.mode = live`) · `프` 속성반(프리미어 — 수강증 표기) · `2주` 2주완성 ·
 *    **`LC` · `RC` 단과** — 그 강좌에서 듣는 시간 단위 반이 전부 한 과목 (주3일 60 · 70분 단과, 단과 두 장이어도 같은 과목이면) ·
 *    `월` · `화` 단과가 아닌데 그 강좌를 한 트랙만 등록(주3일 120분 — 월수금만 · 화목금만). 단과는 `월` · `화` 를 적지 않는다 —
 *    칸 머리의 `월 RC · 화 LC` 가 단과 과목으로 요일을 말해 준다. 주5일 · 종합은 표시가 없다
 *  - 이름 가나다순 (`localeCompare(…, "ko")`), 같은 이름은 계정 순
 *  - **강사 · 관리자 · 조교 계정은 넣지 않는다** — 학생 화면을 보려고 넣은 테스트 배정이다 (숙제 미제출 알림과 같은 규칙)
 *  - **종강한 배정은 뺀다** (`closesAt < today`) — 앞 절반이 끝난 2주완성 학생이 그 달 끝까지 칸에 남지 않게
 * 칸은 레벨 → 시작 시각 순, 레벨마다 묶는다. 학생이 없는 칸은 그리지 않고 `empty` 에 둔다 (인쇄할 종이를 아낀다).
 * 순수 함수 (`class-roster.test.ts`). 화면 · PDF(`class-roster-pdf.ts`)가 같은 결과를 그린다.
 */
import { SUBJECT_LABEL, isSubject, type Subject } from "./instructor-subject";
import { parseTimeBlock } from "./time-blocks";
import { isContainerProgram } from "./two-week";
import { TRACK_LABEL } from "./utils";

/** 표시 글자와 뜻 — 화면 · PDF 의 범례가 이 순서로 쓴다 (종이 명단의 글자 + 단과) */
export const ROSTER_MARKS = [
  { mark: "불", label: "불라방" },
  { mark: "프", label: "프리미어(속성반)" },
  { mark: "2주", label: "2주완성" },
  { mark: "LC", label: "LC단과" },
  { mark: "RC", label: "RC단과" },
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
/** 칸 안의 트랙 하나 — 월수금 먼저 */
export type RosterTrack = { track: string; subject: string | null; recorded: boolean };
export type RosterColumn = {
  /** 강좌 · 시간 (시간이 없는 반은 반 하나) */
  key: string;
  sectionIds: number[];
  level: number | null;
  /** "650B" — 레벨 + 과정 글자 */
  title: string;
  /** "10:00~11:00" */
  time: string | null;
  tracks: RosterTrack[];
  students: RosterStudent[];
};
/** `tone` = 레벨 색 순서 — 그 기수의 시간 단위 반 레벨을 작은 것부터 센 자리 (650 살구 · 750 노랑 · 850 하늘 — `ROSTER_TONES`) */
export type RosterLevel = { key: string; level: number | null; label: string; tone: number; columns: RosterColumn[]; count: number };
export type ClassRoster = {
  levels: RosterLevel[];
  /** 학생이 없는 칸 — 그리지 않는다 */
  empty: RosterColumn[];
  /** 이 명단에 선 학생 수 (한 사람은 한 번) */
  total: number;
  /** 배정은 있는데 설 칸을 못 찾은 학생 수 (속성반 · 2주완성이 품을 반이 아직 안 열렸을 때 등) */
  unplaced: number;
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

/** "(불/RC)" — 표시가 없으면 빈 글자 */
export const marksText = (marks: readonly string[]): string => (marks.length > 0 ? `(${marks.join("/")})` : "");

/** 칸 이름 — "650B 10:00~11:00" (빈 칸 목록 · 마우스를 올렸을 때) */
export const columnHeading = (c: Pick<RosterColumn, "title" | "time">): string => [c.title, c.time].filter(Boolean).join(" ");

/** 트랙 짧은 이름 — 표시 글자 `(월)` · `(화)` 와 같은 글자 */
const TRACK_SHORT: Record<string, string> = { mwf: "월", ttf: "화" };
const trackShort = (t: string) => TRACK_SHORT[t] ?? TRACK_LABEL[t] ?? t;
const subjectText = (s: string | null) => (isSubject(s) ? SUBJECT_LABEL[s] : "RC·LC");

/**
 * 칸 머리 둘째 줄 — 트랙마다 과목: "월 RC · 화 LC" · 저녁 "월 RC · 화 LC 인강" · 한 트랙만 연 시간 "월 LC".
 * 과목 칸이 빈 시간(방학달 통짜 반 — 두 과목을 이어 듣는다)은 "RC·LC" (화목금이 인강이면 "RC·LC · 화 인강")
 */
export function columnDetail(c: Pick<RosterColumn, "tracks">): string {
  if (c.tracks.length > 0 && c.tracks.every((t) => t.subject == null)) {
    if (c.tracks.length === 1) return [trackShort(c.tracks[0].track), "RC·LC", c.tracks[0].recorded ? "인강" : null].filter(Boolean).join(" ");
    return ["RC·LC", ...c.tracks.filter((t) => t.recorded).map((t) => `${trackShort(t.track)} 인강`)].join(" · ");
  }
  return c.tracks.map((t) => [trackShort(t.track), subjectText(t.subject), t.recorded ? "인강" : null].filter(Boolean).join(" ")).join(" · ");
}

const levelKey = (level: number | null, courseName: string | null) => (level != null ? `L${level}` : `C${courseName ?? ""}`);

export function buildClassRoster(input: {
  sections: readonly RosterSection[];
  /** 부모 반 → 품은 반 (`term_section_includes`) */
  includes: ReadonlyMap<number, readonly number[]>;
  enrollments: readonly RosterEnrollment[];
  people: ReadonlyMap<string, RosterPerson>;
  today: string;
}): ClassRoster {
  const { includes, today } = input;
  const byId = new Map(input.sections.map((s) => [s.id, s]));
  // 시간 단위 반 = 그릇 과정(속성반 · 2주완성)이 아니고 품은 반이 없는 반 (묶음 반은 품은 반이 있다). 방학달 통짜 반도 여기다
  const isLeaf = (s: RosterSection) => !isContainerProgram(s.program) && (includes.get(s.id)?.length ?? 0) === 0;
  // 칸 = 강좌 × 시간 (두 트랙을 합친다). 시간이 없는 반은 합칠 근거가 없어 반 하나가 한 칸이다
  const columnKey = (s: RosterSection) => (s.timeBlock ? `${s.courseId ?? s.courseName ?? ""}|${s.timeBlock}` : `s${s.id}`);

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
  type Via = { section: RosterSection; mode: string | null };
  const directs = new Map<string, Via[]>();
  for (const e of input.enrollments) {
    const s = byId.get(e.sectionId);
    if (!s || s.closesAt < today || input.people.get(e.studentId)?.staff) continue;
    const list = directs.get(e.studentId) ?? [];
    if (!list.some((d) => d.section.id === s.id)) list.push({ section: s, mode: e.mode });
    directs.set(e.studentId, list);
  }

  // 칸 → 학생 → 그 칸으로 데려온 직접 배정들
  const cells = new Map<string, Map<string, Via[]>>();
  for (const [studentId, list] of directs) {
    for (const d of list) {
      for (const leaf of leavesOf(d.section.id)) {
        const key = columnKey(leaf);
        const col = cells.get(key) ?? new Map<string, Via[]>();
        const via = col.get(studentId) ?? [];
        if (!via.includes(d)) via.push(d);
        col.set(studentId, via);
        cells.set(key, col);
      }
    }
  }

  /** 그 강좌들의 직접 배정이 데려가는 시간 단위 반의 과목 — 하나뿐이면 단과 (과목 칸이 빈 반이 섞이면 두 과목이다) */
  const singleSubject = (vias: readonly Via[]): Subject | null => {
    let out: Subject | null = null;
    for (const d of vias) {
      for (const leaf of leavesOf(d.section.id)) {
        if (!isSubject(leaf.subject) || (out && out !== leaf.subject)) return null;
        out = leaf.subject;
      }
    }
    return out;
  };

  const marksOf = (studentId: string, via: readonly Via[]): string[] => {
    const courses = new Set(via.map((d) => d.section.courseId));
    // 그 강좌들의 직접 배정 전부 — 단과인지 · 한 트랙만 등록했는지를 본다 (이 칸으로 데려오지 않은 배정까지)
    const sameCourse = (directs.get(studentId) ?? []).filter((d) => courses.has(d.section.courseId));
    const marks: string[] = [];
    if (via.some((d) => d.mode === "live")) marks.push("불");
    if (via.some((d) => d.section.program === "sparta")) marks.push("프");
    if (via.some((d) => d.section.program === "twoweek")) marks.push("2주");
    const single = via.every((d) => !isContainerProgram(d.section.program)) ? singleSubject(sameCourse) : null;
    if (single) {
      marks.push(SUBJECT_LABEL[single]);
    } else {
      const tracks = new Set(sameCourse.map((d) => d.section.track));
      if (tracks.size === 1) {
        const [t] = tracks;
        if (t === "mwf") marks.push("월");
        else if (t === "ttf") marks.push("화");
      }
    }
    return marks;
  };

  // 레벨 색 — 그 기수의 시간 단위 반 레벨 순서 (달마다 같은 레벨이 같은 색)
  const toneKeys = [...new Map(input.sections.filter(isLeaf).map((s) => [levelKey(s.level, s.courseName), s] as const)).values()]
    .sort((a, b) => (a.level ?? Number.MAX_SAFE_INTEGER) - (b.level ?? Number.MAX_SAFE_INTEGER) || (a.courseName ?? "").localeCompare(b.courseName ?? "", "ko"))
    .map((s) => levelKey(s.level, s.courseName));

  // 칸 만들기 — 시간 단위 반을 강좌 × 시간으로 묶는다
  const groups = new Map<string, RosterSection[]>();
  for (const s of input.sections) {
    if (!isLeaf(s)) continue;
    const key = columnKey(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const span = (s: RosterSection) => parseTimeBlock(s.timeBlock);
  const ordered = [...groups.entries()]
    .map(([key, list]) => ({ key, list: [...list].sort((a, b) => Number(a.track !== "mwf") - Number(b.track !== "mwf") || a.id - b.id) }))
    .sort(
      (a, b) =>
        (a.list[0].level ?? Number.MAX_SAFE_INTEGER) - (b.list[0].level ?? Number.MAX_SAFE_INTEGER) ||
        (a.list[0].courseName ?? "").localeCompare(b.list[0].courseName ?? "", "ko") ||
        (span(a.list[0])?.start ?? 9999) - (span(b.list[0])?.start ?? 9999) ||
        (span(a.list[0])?.end ?? 9999) - (span(b.list[0])?.end ?? 9999) ||
        a.list[0].id - b.list[0].id,
    );

  const levels: RosterLevel[] = [];
  const empty: RosterColumn[] = [];
  const everyone = new Set<string>();
  for (const { key, list } of ordered) {
    const first = list[0];
    const sets = [...new Set(list.map((s) => s.bookSet).filter((b): b is string => !!b))].sort();
    const students: RosterStudent[] = [...(cells.get(key) ?? new Map<string, Via[]>()).entries()]
      .map(([id, via]) => ({ id, name: input.people.get(id)?.name ?? "", marks: marksOf(id, via) }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));
    const column: RosterColumn = {
      key,
      sectionIds: list.map((s) => s.id),
      level: first.level,
      title: `${first.level ?? first.courseName ?? "반"}${sets.join("/")}`,
      time: first.timeBlock,
      tracks: list.map((s) => ({ track: s.track, subject: s.subject, recorded: s.recorded })),
      students,
    };
    if (students.length === 0) {
      empty.push(column);
      continue;
    }
    const lk = levelKey(first.level, first.courseName);
    let group = levels.find((l) => l.key === lk);
    if (!group) {
      group = { key: lk, level: first.level, label: first.level != null ? String(first.level) : (first.courseName ?? "기타"), tone: Math.max(0, toneKeys.indexOf(lk)), columns: [], count: 0 };
      levels.push(group);
    }
    group.columns.push(column);
    for (const st of students) everyone.add(st.id);
  }
  for (const g of levels) g.count = new Set(g.columns.flatMap((c) => c.students.map((s) => s.id))).size;

  return { levels, empty, total: everyone.size, unplaced: [...directs.keys()].filter((id) => !everyone.has(id)).length };
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

/** PDF 파일 이름 — `역전토익_반별명단_2026-10.pdf` (LC · RC 를 합친 한 장 — 2026-10-14 저녁) */
export function rosterFileName(term: { year: number; month: number }): string {
  return `역전토익_반별명단_${term.year}-${String(term.month).padStart(2, "0")}.pdf`;
}

/** 내려받기 머리 — 한글 이름(filename*)과 영문 이름(옛 브라우저) */
export function rosterDisposition(term: { year: number; month: number }): string {
  const name = rosterFileName(term);
  const ascii = name.replace("역전토익_반별명단", "winnertoeic-class-roster").replace(/[^\x20-\x7e]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
