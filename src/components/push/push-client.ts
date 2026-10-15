/**
 * 이 기기에서 웹 푸시 켜기 · 끄기 — 관리자 알림 설정(`PushSetup audience="staff"`)과 학생 알림(`PushSetup audience="student"` · `PushPrompt`)이 함께 쓴다.
 * 브라우저에서만 부른다 (서비스 워커 · Notification). 저장은 부르는 쪽이 넘긴 서버 액션이 한다.
 */

export type PushState = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";
export type SaveSubscription = (input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
export type DeleteSubscription = (endpoint: string) => Promise<unknown>;

function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** 아이폰은 홈 화면에 추가한 앱에서만 푸시가 된다(iOS 16.4+) — 사파리 · 크롬 창 안이면 그 안내부터 */
export async function detectPush(): Promise<PushState> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/**
 * 권한을 묻고 구독해 서버에 저장한다. **버튼을 누른 바로 그 순간에 불러야 한다** — 아이폰은 사용자 동작 밖에서 권한을 묻지 못한다.
 * 결과: on(켜짐) · denied(거절) · off(창을 닫음). 저장이 실패하면 던진다.
 */
export async function enablePush(publicKey: string, save: SaveSubscription): Promise<"on" | "denied" | "off"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(publicKey) }));
  const json = sub.toJSON();
  const res = await save({
    endpoint: json.endpoint ?? sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: navigator.userAgent,
  });
  if (!res.ok) throw new Error(res.error);
  return "on";
}

export async function disablePush(remove: DeleteSubscription): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await remove(sub.endpoint);
    await sub.unsubscribe();
  }
}
