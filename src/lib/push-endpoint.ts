/**
 * 웹 푸시 구독 주소(endpoint) 검사 — 브라우저 회사의 푸시 서비스로 가는 주소만 받는다 (2026-10-15 학생 휴대폰 알림 점검).
 *
 * 알림을 보낼 때 우리 서버가 이 주소로 직접 요청을 보낸다. 2026-10-15 전에는 강사 · 관리자만 기기를 등록했는데,
 * 학생 휴대폰 알림이 생기며 **로그인한 누구나** 주소를 넣을 수 있게 됐다 — https 이기만 하면 받으면,
 * 아무 사이트 주소를 기기로 등록하고 '테스트 알림' 을 눌러 우리 서버가 그 주소로 요청을 보내게 만들 수 있다.
 * 그래서 실제 푸시 서비스 주소만 받는다:
 *   크롬 · 삼성 인터넷 · 웨일 · 엣지(안드로이드) · 오페라 → fcm.googleapis.com (옛 android.googleapis.com)
 *   아이폰 · 맥 사파리 → web.push.apple.com
 *   파이어폭스 → updates.push.services.mozilla.com
 *   윈도우 엣지 → *.notify.windows.com
 * 새 브라우저가 다른 주소를 쓰면 여기에 더한다 (그때까지 그 브라우저는 '구독 주소를 받을 수 없어요' 가 뜬다).
 */

const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];

/** 그 호스트거나 그 호스트의 하위 이름 (점으로 끊어서 — `evilpush.apple.com.example` 은 아니다) */
function hostMatches(host: string, suffix: string) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((suffix) => hostMatches(host, suffix));
}
