/**
 * 알림을 눌렀을 때 이미 열려 있는 우리 창이 할 일 (2026-10-19 Alan — "불라방 알람이 푸시로 왔을때 클릭하면 해당 불라방페이지로 바로 이어지면 좋겠어").
 *
 * 서비스 워커(`public/sw.js` 의 notificationclick)가 열려 있는 창에게 `wt-open` 으로 "이 화면을 열어" 라고 묻고, 창(`PwaRegister`)이 정한다:
 * - **refresh** — 이미 그 화면이다. 새로 받아 온다 (불라방 화면을 열어 둔 채 기다리다 알림을 누르면 방금 들어온 링크가 보여야 한다)
 * - **go** — 홈 화면 앱 창이면 그 자리에서 그 화면으로 옮긴다. 아이폰 홈 화면 앱은 창이 하나뿐이라 서비스 워커의 openWindow 가
 *   이미 떠 있는 앱을 옮기지 못하고 보던 화면만 앞으로 가져왔다
 * - **stay** — 브라우저 탭(PC · 휴대폰 브라우저)은 옮기지 않는다. 쓰던 화면(글쓰기 등)을 날리지 않게 서비스 워커가 예전처럼 새 창을 연다.
 *   다른 사이트 주소도 그대로 둔다
 *
 * 앱이 꺼져 있다가 알림으로 켜졌는데 시작 화면으로 열렸으면, 열린 화면이 `wt-pending` 으로 서비스 워커에 물어 같은 규칙(go 만)으로 옮긴다.
 * 순수 함수 (`notification-open.test.ts` — 서비스 워커 쪽도 그 파일이 실제 sw.js 를 돌려 본다).
 */

/** 서비스 워커 → 창: 이 화면을 열어 (답: `{ ok }` — 열었거나 새로 받았으면 참) */
export const OPEN_MESSAGE = "wt-open";
/** 창 → 서비스 워커: 알림으로 열어야 할 화면이 있나 (답: `{ url }` — 없으면 null) */
export const PENDING_MESSAGE = "wt-pending";

export type NotificationMove = { action: "refresh" } | { action: "go"; path: string } | { action: "stay" };

export function notificationMove(url: string, here: string, standalone: boolean): NotificationMove {
  let current: URL;
  let target: URL;
  try {
    current = new URL(here);
    target = new URL(url, current);
  } catch {
    return { action: "stay" };
  }
  if (target.origin !== current.origin) return { action: "stay" };
  if (target.pathname === current.pathname && target.search === current.search) return { action: "refresh" };
  if (!standalone) return { action: "stay" };
  return { action: "go", path: `${target.pathname}${target.search}${target.hash}` };
}
