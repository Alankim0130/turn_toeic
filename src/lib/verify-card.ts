/**
 * `/my` 대시보드의 **등업신청 현황** 카드를 그릴지 (2026-10-02 Alan — "마이 페이지를 클릭하니 맨처음 일정표가 나와. 그리고 바로 아래에
 * 등업신청 현황이 나오는데, 이미 신청 완료가 되었다면 해당표시는 없는게 더 깔끔할 것 같아").
 *
 * **지금 유효한 등록(수강 중 · 예비등록)이 있으면 등업은 끝난 것이라 그리지 않는다** — 수강증으로 승인됐든 스태프가 배정했든 같다.
 * 단 그 뒤에 할 일이 남았으면 그린다:
 *  - 확인 중인 신청(받아 둔 다음 달 수강증 포함) — 다음 달 등업이 진행 중이다
 *  - 지금 등록보다 **나중에** 반려된 신청 — 다음 달 신청이 막혔으니 사유를 봐야 한다 (그 전의 반려는 이미 지난 일이다)
 * 유효한 등록이 없으면(졸업생 · 아직 등업 전) 그대로 그린다 — `신청하기` 로 가는 길이다.
 * 등업신청으로 가는 길은 카드가 없어도 바로가기 · 햄버거 서랍 · PC 상단 메뉴에 그대로 있다.
 */
export function needsVerifyCard(
  liveOrders: readonly { created_at: string }[],
  latest: { result: string | null; created_at: string } | null | undefined,
): boolean {
  if (liveOrders.length === 0) return true;
  if (!latest) return false;
  if (latest.result === null) return true;
  if (latest.result !== "rejected") return false;
  const newestOrder = Math.max(...liveOrders.map((o) => Date.parse(o.created_at)));
  return Date.parse(latest.created_at) > newestOrder;
}
