/**
 * 내 시간표에서 **달력이 처음 고르는 날짜** (2026-09-17 Alan 요청 — "해당 날짜에 해당되는것만 보여줘").
 *
 * 한 달 목록을 통째로 쌓으면 9월만 18줄이라 휴대폰에서 스크롤만 하게 된다.
 * 그래서 달력에서 날짜를 고르면 그 날 수업만 보여 주는데, **처음 들어왔을 때 무엇을 고를지**가 여기 있다.
 *
 * 오늘 수업이 있으면 오늘, 없으면 **다음 수업일**, 그것도 없으면(다 지난 달) **마지막 수업일**.
 * 빈 날을 골라 두면 들어오자마자 "수업이 없어요" 를 보게 되므로 **수업이 있는 날만 고른다.**
 */
export function initialDay(dates: readonly string[], today: string): string | null {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return null;
  if (sorted.includes(today)) return today;
  return sorted.find((d) => d > today) ?? sorted[sorted.length - 1];
}
