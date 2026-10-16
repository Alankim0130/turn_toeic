import type { createClient } from "@/lib/supabase/server";
import { sortLectures, type LectureWayRow } from "@/lib/lecture";
import { studentLevels, type LevelCourse } from "@/lib/timetable";
import { LECTURE_KINDS, sortByWay } from "@/lib/utils";
import type { TermLite } from "../../_lib/queries";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** 메모만 있는 특강(무슨 특강 없음)의 종류 값 — 종류 버튼에서 `특강` */
export const MEMO_TYPE = "memo";

/** 특강의 종류 버튼 값 — 무슨 특강(rc · lc · mock1 · mock2), 메모만이면 `memo` */
export const lectureTypeOf = (l: { kinds: readonly string[] | null }) => (l.kinds ?? [])[0] ?? MEMO_TYPE;

/** 특강이 있는 기수 — 최근 달이 먼저 (특강 신청 · 특강 설정의 달 칩) */
export async function getLectureTerms(supabase: Supabase): Promise<TermLite[]> {
  const { data } = await supabase.from("special_lectures").select("term_id, term:terms(id, year, month, enrollment_opens_at, closes_at)");
  const map = new Map<number, TermLite>();
  for (const l of data ?? []) if (l.term) map.set(l.term.id, l.term);
  return [...map.values()].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
}

/** 그 달 특강 — 신청 방식(방식 순서)과 함께, 날짜 → 무슨 특강 순 */
export async function getTermLectures(supabase: Supabase, termId: number) {
  const { data, error } = await supabase
    .from("special_lectures")
    .select("id, date, content, kinds, signup, applied_count, notice, lecturer:lecturers(name), ways:special_lecture_ways(way, enabled, capacity, signup_condition, applied_count)")
    .eq("term_id", termId)
    .order("date")
    .order("id");
  return { lectures: sortLectures((data ?? []).map((l) => ({ ...l, ways: sortByWay<LectureWayRow>(l.ways ?? []) }))), error };
}
export type TermLecture = Awaited<ReturnType<typeof getTermLectures>>["lectures"][number];

/** 종류 버튼 — 그 달에 있는 종류만, RC특강 · LC특강 · 1차 · 2차 모의고사 · 특강(메모만) 순 */
export function lectureTypeTabs(lectures: readonly TermLecture[], count?: (type: string) => number) {
  const have = new Set(lectures.map(lectureTypeOf));
  const tabs = LECTURE_KINDS.filter((k) => have.has(k.value)).map((k) => ({ value: k.value as string, label: k.label as string }));
  if (have.has(MEMO_TYPE)) tabs.push({ value: MEMO_TYPE, label: "특강" });
  return tabs.map((t) => (count ? { ...t, count: count(t.value) } : t));
}

/**
 * 처음 보여 줄 종류 — 주소에 있으면 그것, 없으면 **신청 받는 중인 특강** → 앞으로 올 특강 → 첫 특강의 종류.
 * 강사가 특강 신청을 열면 지금 신청이 들어오는 특강부터 본다.
 */
export function pickLectureType(lectures: readonly TermLecture[], requested: string | undefined, today: string): string | null {
  const types = new Set(lectures.map(lectureTypeOf));
  if (requested && types.has(requested)) return requested;
  const first =
    lectures.find((l) => l.signup && l.date >= today) ??
    lectures.find((l) => l.date >= today) ??
    lectures[0];
  return first ? lectureTypeOf(first) : null;
}

const PAGE = 1000;

/** 학생 한 명의 레벨 이름표 — `650` · `650 중급속성` · `850 2주완성` (`studentLevels`) */
export type SignupLevel = { label: string; level: number | null };

/**
 * **신청자 레벨** — 그 특강 기수에 배정된 반의 강좌로 (2026-10-16 Alan — "특강 신청자 목록중에서 지금 이름과 전화번호가 나와있는데, 전화번호말고,
 * 학생 본인의 레벨이 나오도록해줘"). 그 기수의 반 → 배정 → 강좌의 레벨(`courses.target_score` — 코드에 레벨을 적지 않는다).
 * - 배정은 1,000줄씩 나눠 읽는다 — 방학달 600명 × 두 반은 PostgREST 한 번(1,000줄)을 넘는다 (학생명단 반별 명단과 같은 읽기).
 * - `levels` = 그 기수의 레벨 숫자, 작은 것부터 — 이름표 색 순서다 (반별 명단의 `ROSTER_TONES` 와 같은 자리: 650 살구 · 750 노랑 · 850 하늘).
 * - 읽다 실패하면 `ok` 가 거짓 — 화면은 레벨을 비우고 알린다 (배정이 있는 학생을 '반 미배정' 으로 잘못 적지 않게).
 */
export async function getTermLevels(supabase: Supabase, termId: number): Promise<{ byStudent: Map<string, SignupLevel[]>; levels: number[]; ok: boolean }> {
  const byStudent = new Map<string, SignupLevel[]>();
  const { data: sections, error } = await supabase.from("class_sections").select("id, course:courses(name, program, target_score)").eq("term_id", termId);
  if (error) return { byStudent, levels: [], ok: false };
  const courseOf = new Map<number, LevelCourse>();
  for (const s of sections ?? []) if (s.course) courseOf.set(s.id, s.course);
  const levels = [...new Set([...courseOf.values()].map((c) => c.target_score).filter((n): n is number => n != null))].sort((a, b) => a - b);
  const ids = [...courseOf.keys()];
  if (ids.length === 0) return { byStudent, levels, ok: true };

  const page = (from: number, count: boolean) =>
    supabase
      .from("enrollments")
      .select("student_id, section_id", count ? { count: "exact" } : undefined)
      .in("section_id", ids)
      .order("id")
      .range(from, from + PAGE - 1);
  const first = await page(0, true);
  if (first.error) return { byStudent, levels, ok: false };
  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  let ok = true;
  if (rows.length === PAGE && total > PAGE) {
    const rest = await Promise.all(Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => page((i + 1) * PAGE, false)));
    if (rest.some((r) => r.error)) ok = false;
    for (const r of rest) rows.push(...(r.data ?? []));
  }

  const courses = new Map<string, LevelCourse[]>();
  for (const r of rows) {
    const course = r.section_id != null ? courseOf.get(r.section_id) : undefined;
    if (course) courses.set(r.student_id, [...(courses.get(r.student_id) ?? []), course]);
  }
  for (const [id, list] of courses) byStudent.set(id, studentLevels(list));
  return { byStudent, levels, ok };
}
