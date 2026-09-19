/**
 * 주5일 — 학생에게는 한 줄로 보여 준다 (2026-09-16 Alan 요청).
 *
 * "주5일이면 시스템적으로 월수금+화목금 이구나. **알고는 있되, 학생들에게 보이는거는 주5일**이라고 해줘"
 *
 * 저장 구조는 그대로다 — 주5일은 **같은 기수 · 같은 강좌 · 같은 시간대의 월수금 반 + 화목금 반**에
 * 함께 배정된 것이고 따로 저장하는 값이 없다 (도메인 규칙 1). 여기서 그 짝을 찾아 **표시만** 바꾼다.
 * 반 편성·반 배정 같은 관리자 화면은 트랙을 그대로 보여 준다 — 편성은 트랙 단위로 한다.
 * **학생명단 카드만 예외로 여기서 합친다** (2026-09-19 Alan) — 명단은 편성하는 화면이 아니라 훑어보는 화면이라,
 * 같은 반이 월수금·화목금 두 줄로 서면 한 사람이 두 반을 듣는 것처럼 보인다.
 */

export const WEEK5_LABEL = "주5일";

export type Week5Section = {
  id: number;
  term_id: number | null;
  course_id: number | null;
  time_block: string | null;
  track: string;
};

/** 짝을 가르는 키. 시간대가 없으면 같은 반으로 묶지 않는다 (시간 미정 반끼리 엮이면 안 된다) */
export const pairKey = (s: Week5Section) => (s.time_block ? `${s.term_id}|${s.course_id}|${s.time_block}` : null);

/**
 * 내가 듣는 반 중 **주5일인 반의 id**. 같은 (기수·강좌·시간대)에 월수금과 화목금이 **둘 다** 있어야 짝이다.
 * 한 트랙만 있으면 주3일이라 트랙 이름을 그대로 보여 준다.
 */
export function week5SectionIds(sections: Week5Section[]): Set<number> {
  const tracks = new Map<string, Set<string>>();
  for (const s of sections) {
    const k = pairKey(s);
    if (!k) continue;
    tracks.set(k, (tracks.get(k) ?? new Set()).add(s.track));
  }
  const out = new Set<number>();
  for (const s of sections) {
    const k = pairKey(s);
    const t = k ? tracks.get(k) : null;
    if (t && t.has("mwf") && t.has("ttf")) out.add(s.id);
  }
  return out;
}

/** 학생에게 보여 줄 이름. 주5일이면 `주5일`, 아니면 트랙 이름 그대로 */
export function studentTrackLabel(
  section: { id: number; track: string },
  week5: Set<number>,
  trackLabel: Record<string, string>,
): string {
  return week5.has(section.id) ? WEEK5_LABEL : (trackLabel[section.track] ?? section.track);
}

/**
 * 주5일 짝에서 **한 줄만 남긴다** (내 등록 현황처럼 반 목록을 그대로 늘어놓는 곳).
 * 월수금 줄을 남겨 순서를 고정한다 — 둘 중 아무거나 남기면 새로고침마다 시간대가 달라 보인다.
 */
export function collapseWeek5<T>(rows: T[], sectionOf: (row: T) => Week5Section | null, week5: Set<number>): T[] {
  // 짝마다 남길 줄을 먼저 정한다 — **월수금 줄**. 들어온 순서대로 첫 줄을 남기면
  // 목록 정렬이 조금만 달라져도 같은 등록이 화목금으로 보였다 월수금으로 보였다 한다
  const keep = new Map<string, number>();
  for (const row of rows) {
    const s = sectionOf(row);
    if (!s || !week5.has(s.id)) continue;
    const k = pairKey(s)!;
    if (!keep.has(k) || s.track === "mwf") keep.set(k, s.id);
  }
  return rows.filter((row) => {
    const s = sectionOf(row);
    if (!s || !week5.has(s.id)) return true;
    return keep.get(pairKey(s)!) === s.id;
  });
}
