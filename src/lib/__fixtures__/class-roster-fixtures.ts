/**
 * 반별 명단 · 레벨별 명단 시험용 명단 — PDF(`class-roster-pdf.test.ts`) · Word(`class-roster-docx.test.ts`) 테스트가 같은 명단을 쓴다.
 * 이름은 지어낸 것이다 — 실명을 넣지 않는다 (저장소가 공개다).
 */
import { buildClassRoster, type RosterEnrollment, type RosterLevel, type RosterPerson, type RosterSection } from "../class-roster";

export const sec = (id: number, o: Partial<RosterSection> & Pick<RosterSection, "track" | "timeBlock">): RosterSection => ({
  id,
  subject: "lc",
  bookSet: "A",
  recorded: false,
  closesAt: "2026-11-03",
  courseId: 650,
  level: 650,
  program: "score",
  courseName: "650+ 왕기초반",
  ...o,
});

/** 지어낸 이름 (가나다 섞어) */
export const NAMES = ["하늘", "가온", "나리", "다온", "라온", "마루", "바다", "사랑", "아라", "자람", "차오름", "카라", "타라", "파랑", "한별"];

/** 칸(반)마다 학생 수 — `perLevel` 칸씩 한 레벨 (650 → 750 → 850 …) */
export function rosterOf(counts: number[], extra: { name: string; sectionIndex: number }[] = [], perLevel = 2) {
  const levelOf = (i: number) => 650 + 100 * Math.floor(i / perLevel);
  const sections = counts.map((_, i) => sec(i + 1, { track: i % 2 ? "ttf" : "mwf", timeBlock: `1${i % 10}:00~1${i % 10}:50`, level: levelOf(i), courseId: levelOf(i) }));
  const enrollments: RosterEnrollment[] = [];
  const people = new Map<string, RosterPerson>();
  counts.forEach((n, i) => {
    for (let k = 0; k < n; k++) {
      const id = `s${i}-${k}`;
      people.set(id, { name: `${NAMES[k % NAMES.length]}${k >= NAMES.length ? k : ""}`, staff: false });
      enrollments.push({ studentId: id, sectionId: i + 1, mode: k % 3 === 0 ? "live" : "onsite" });
    }
  });
  extra.forEach((e, j) => {
    people.set(`x${j}`, { name: e.name, staff: false });
    enrollments.push({ studentId: `x${j}`, sectionId: e.sectionIndex + 1, mode: "onsite" });
  });
  return buildClassRoster({ sections, includes: new Map(), enrollments, people, today: "2026-10-14" });
}

/**
 * 레벨별 명단 — 레벨마다 [월수금 학생 수, 화목금 학생 수]. 레벨마다 두 시간(10:00 · 11:10) × 두 트랙 반을 열고 학생은 두 시간에 번갈아 넣는다
 * (레벨별 명단은 시간을 합치므로 칸에는 섞여 선다)
 */
export function trackRosterOf(perLevel: [number, number][]) {
  const sections: RosterSection[] = [];
  const enrollments: RosterEnrollment[] = [];
  const people = new Map<string, RosterPerson>();
  perLevel.forEach(([mwf, ttf], li) => {
    const lv = 650 + 100 * li;
    const ids = { mwf: [lv * 10 + 1, lv * 10 + 2], ttf: [lv * 10 + 3, lv * 10 + 4] };
    for (const track of ["mwf", "ttf"] as const) {
      ids[track].forEach((id, t) => sections.push(sec(id, { track, timeBlock: t ? "11:10~12:10" : "10:00~11:00", level: lv, courseId: lv })));
      const n = track === "mwf" ? mwf : ttf;
      for (let k = 0; k < n; k++) {
        const id = `${lv}-${track}-${k}`;
        people.set(id, { name: `${NAMES[k % NAMES.length]}${k >= NAMES.length ? k : ""}`, staff: false });
        enrollments.push({ studentId: id, sectionId: ids[track][k % 2], mode: k % 4 === 0 ? "live" : "onsite" });
      }
    }
  });
  return buildClassRoster({ sections, includes: new Map(), enrollments, people, today: "2026-10-14", by: "track" });
}

/** 칸만 있는 레벨 (쪽 나누기 시험) */
export const levelWithColumns = (label: string, n: number, tone: number): RosterLevel => ({
  key: label,
  level: Number(label),
  label,
  tone,
  count: n,
  columns: Array.from({ length: n }, (_, i) => ({ key: `${label}-${i}`, sectionIds: [tone * 100 + i], level: Number(label), title: label, time: null, track: null, tracks: [], students: [] })),
});
