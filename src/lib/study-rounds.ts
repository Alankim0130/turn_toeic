/**
 * 비대면 자료 회차 (2026-09-22 Alan — "1회차, 2회차... 이렇게 설정하고 매달 강사들이 설정한 일정표에 따라 적용").
 *
 * 자료는 회차마다 한 번 올리고(`study_material_items`) 매달 다시 쓴다. **N회차 = 그 달(기수) N번째 수업일** —
 * 반 편성 달력의 월수금 + 화목금 수업일을 합쳐 날짜순으로 센다 (평일마다 하나, 개강일~종강일 안만).
 * DB 가 같은 규칙으로 그 달에 붙인다 (`private.term_class_days` · `private.sync_online_materials`, 마이그레이션 20260922124700).
 * 이 파일은 관리자 화면이 "이 달엔 N회차가 몇 월 며칠" 을 미리 보여 주는 데 쓴다 — 규칙을 바꾸면 SQL 과 함께 고친다.
 * 순수 함수 (`study-rounds.test.ts`).
 */

/** 회차 수의 끝 — DB check(seq between 1 and 60) 와 같다 */
export const MATERIAL_ROUND_MAX = 60;

/** 그 달 수업일(트랙 섞여도 됨) → 회차별 날짜. 같은 날이 두 트랙에 있어도 하루로 센다. 개강일~종강일이 있으면 그 안만 */
export function classDayRounds(dates: readonly string[], window: { opens?: string | null; closes?: string | null } = {}): string[] {
  return [...new Set(dates)]
    .filter((d) => (!window.opens || d >= window.opens) && (!window.closes || d <= window.closes))
    .sort();
}

/** 관리자 화면에 보일 회차 줄 수: 이 달 수업일 수와 올린 회차 중 큰 쪽 + 다음에 올릴 빈 줄 하나 */
export function roundRowCount(classDays: number, maxUploadedSeq: number): number {
  return Math.min(MATERIAL_ROUND_MAX, Math.max(classDays, maxUploadedSeq) + 1);
}
