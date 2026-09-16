/** 반 일괄 개설 공통 규칙. 화면과 서버가 같은 방식으로 "이미 있는 반"을 판단하도록 한곳에 둔다. */

/** 시간표 시간대 → 반의 시간대 라벨 ("10:00~12:10") */
export const timeBlockOf = (start: string | null, end: string | null) =>
  start && end ? `${String(start).slice(0, 5)}~${String(end).slice(0, 5)}` : null;

/** 같은 (강좌 · 트랙 · 시간대) 면 같은 반으로 본다 */
export const sectionKeyOf = (courseId: number, track: string, timeBlock: string | null) => `${courseId}|${track}|${timeBlock ?? ""}`;
