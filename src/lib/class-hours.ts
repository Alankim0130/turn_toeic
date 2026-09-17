import { parseTimeBlock } from "./time-blocks";
import { subjectsWithin, type Subject } from "./instructor-subject";

/**
 * "함께 듣는 시간" — 내 반이 **실제로 여는 시간 단위 반**만 (2026-09-16 Alan 지적으로 바로잡음).
 *
 * 처음에는 "그 날 내려온 반 중 묶음이 아닌 것" 으로 만들었는데, 그러면 **내가 등록하지도 않은 반**이
 * 줄줄이 붙는다 (650 주5일 하나만 등록했는데 750·850·저녁반까지 나왔다). 스태프는 RLS 가 모든 반을
 * 내려 주므로 특히 심하다.
 *
 * 진실의 원천은 DB 의 `private.section_includes` 다 (도메인 규칙 1 "반 권한") —
 * `public.term_section_includes(기수)` 가 **부모 반 → 함께 열리는 반** 짝을 준다.
 * 묶음 반(120분·140분)이면 그 안의 60분·70분 반, 스파르타 반이면 겹치는 레벨의 시간 단위 반이다.
 * **여기서 포함 관계를 다시 계산하지 말 것.**
 */

export type HourSection = {
  id: number;
  course_id: number | null;
  time_block: string | null;
  book_set: string | null;
  course?: { name?: string | null } | null;
};

/** 화면 한 줄: 시간대 · 과목 · (다른 강좌면) 강좌 이름 */
export type ClassHour = { block: string; subject: Subject | null; course: string | null };

/**
 * @param ownId      내가 등록한 반
 * @param sameDay    그 날 같은 트랙의 반들 (수업이 실제로 있는 것만 들어온다)
 * @param includes   부모 반 → 함께 열리는 반 id (term_section_includes)
 */
export function classHours(ownId: number, sameDay: HourSection[], includes: Map<number, Set<number>>): HourSection[] {
  const opened = includes.get(ownId);
  if (!opened?.size) return [];
  const seen = new Set<string>();
  return sameDay
    .filter((s) => opened.has(s.id) && s.time_block)
    .sort((a, b) => (parseTimeBlock(a.time_block)?.start ?? 0) - (parseTimeBlock(b.time_block)?.start ?? 0))
    .filter((s) => {
      const k = `${s.course_id}|${s.time_block}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** 위 결과를 화면 줄로. 과목은 그 묶음의 LC 교재가 말해 준다 (`subjectsWithin`) */
export function toClassHours(sections: HourSection[]): ClassHour[] {
  const subject = subjectsWithin(sections);
  return sections.map((s) => ({
    block: (s.time_block ?? "").replace("~", "–"),
    subject: subject.get(s.id) ?? null,
    course: s.course?.name ?? null,
  }));
}
