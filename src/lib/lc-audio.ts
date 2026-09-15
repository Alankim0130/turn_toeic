/** LC 음원 공통. 레벨 목록(650·750·850 …)은 DB 의 lc_levels 에서 읽는다. */

/** "Unit 2" 가 "Unit 10" 보다 앞에 오도록 숫자를 숫자로 비교해 정렬 */
export const sortTracks = <T extends { title: string }>(tracks: T[]) =>
  [...tracks].sort((a, b) => a.title.localeCompare(b.title, "ko", { numeric: true }));

/** ?level=750 → 목록에 있는 레벨이면 그 값 */
export function pickLevel(param: string | undefined, levels: number[], preferred?: number | null): number | null {
  const n = Number(param);
  if (param && levels.includes(n)) return n;
  if (preferred && levels.includes(preferred)) return preferred;
  return levels[0] ?? null;
}
