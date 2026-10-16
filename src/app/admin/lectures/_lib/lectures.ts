import type { createClient } from "@/lib/supabase/server";
import { sortLectures, type LectureWayRow } from "@/lib/lecture";
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
