/**
 * 이 기기에서 웹 푸시 켜기 · 끄기 — 관리자 알림 설정(`PushSetup audience="staff"`)과 학생 알림(`PushSetup audience="student"` · `PushPrompt`)이 함께 쓴다.
 * 브라우저에서만 부른다 (서비스 워커 · Notification). 저장은 부르는 쪽이 넘긴 서버 액션이 한다.
 *
 * **아이폰 앱(mobile/) 안이면 애플 푸시(APNs)다** (2026-10-30) — 앱 화면(WKWebView)에는 웹 푸시가 없다. 권한을 묻고 애플이 준 기기 토큰을
 * `apns://production/<토큰>` 주소로 같은 표에 저장한다 (`native-app.ts` 의 `apnsEndpoint`). 그래서 화면 · 서버 액션 · 알림을 고르는 곳은 웹과 같고,
 * 보내는 길만 갈린다 (`src/lib/push.ts` → `src/lib/apns.ts`). 이 기기에 켠 주소는 기기에 적어 둔다 (`NATIVE_ENDPOINT_KEY` — 로그아웃 정리도 읽는다).
 */

import { apnsEndpoint, appPlugin, isNativeApp, type PluginListener, type PushNotificationsPlugin, type WinnerToeicPlugin } from "@/lib/native-app";

/** 아이폰 앱에서 켠 이 기기의 알림 주소 (`apns://…`) — 로그아웃 폼(`PushLogoutField`)도 이것을 읽어 서버가 이 기기를 지운다 */
export const NATIVE_ENDPOINT_KEY = "wt-native-push-endpoint";

export function nativeEndpoint(): string | null {
  try {
    return localStorage.getItem(NATIVE_ENDPOINT_KEY);
  } catch {
    return null;
  }
}

function rememberNativeEndpoint(endpoint: string | null) {
  try {
    if (endpoint) localStorage.setItem(NATIVE_ENDPOINT_KEY, endpoint);
    else localStorage.removeItem(NATIVE_ENDPOINT_KEY);
  } catch {
    // 적어 두지 못해도 알림은 켜졌다 — 다음에 켜기를 누르면 같은 토큰으로 다시 저장된다
  }
}

export type PushState = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";
export type SaveSubscription = (input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
export type DeleteSubscription = (endpoint: string) => Promise<unknown>;
/** 이 기기의 구독이 지금 로그인한 계정의 것으로 저장돼 있나 (서버 액션) */
export type OwnsSubscription = (endpoint: string) => Promise<boolean>;

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

/**
 * 아이폰은 홈 화면에 추가한 앱에서만 푸시가 된다(iOS 16.4+) — 사파리 · 크롬 창 안이면 그 안내부터.
 * 브라우저가 구독을 기억해도 **서버에 지금 계정의 것으로 저장돼 있어야** 켜진 것이다 (`owns`) — 같은 휴대폰을 다른 계정이 켰으면
 * 알림은 그 계정으로 가므로 '꺼짐' 으로 보여 주고, 켜기를 누르면 지금 계정으로 옮긴다. 묻다 실패하면 브라우저만 믿는다.
 */
export async function detectPush(owns?: OwnsSubscription): Promise<PushState> {
  if (isNativeApp()) return detectNativePush(owns);
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return "off";
  if (owns) {
    const mine = await owns(sub.endpoint).catch(() => true);
    if (!mine) return "off";
  }
  return "on";
}

/**
 * 권한을 묻고 구독해 서버에 저장한다. **버튼을 누른 바로 그 순간에 불러야 한다** — 아이폰은 사용자 동작 밖에서 권한을 묻지 못한다.
 * 결과: on(켜짐) · denied(거절) · off(창을 닫음). 저장이 실패하면 던진다.
 */
export async function enablePush(publicKey: string | null, save: SaveSubscription): Promise<"on" | "denied" | "off"> {
  if (isNativeApp()) return enableNativePush(save);
  if (!publicKey) throw new Error("서버에 알림 키가 설정되지 않았어요.");
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
  if (isNativeApp()) {
    const endpoint = nativeEndpoint();
    if (endpoint) await remove(endpoint);
    rememberNativeEndpoint(null);
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await remove(sub.endpoint);
    await sub.unsubscribe();
  }
}

// ─── 아이폰 앱 (애플 푸시) ─────────────────────────────────────────────────

type PushPermission = Awaited<ReturnType<PushNotificationsPlugin["checkPermissions"]>>["receive"];

async function detectNativePush(owns?: OwnsSubscription): Promise<PushState> {
  const push = appPlugin<PushNotificationsPlugin>("PushNotifications");
  if (!push) return "unsupported";
  const { receive } = await push.checkPermissions();
  if (receive === "denied") return "denied";
  if (receive !== "granted") return "off";
  const endpoint = nativeEndpoint();
  if (!endpoint) return "off";
  if (owns) {
    const mine = await owns(endpoint).catch(() => true);
    if (!mine) return "off";
  }
  return "on";
}

/** 애플이 주는 기기 토큰 — register() 를 부르면 이벤트로 온다 (15초 안에 안 오면 실패) */
async function nativeDeviceToken(push: PushNotificationsPlugin): Promise<string> {
  const listeners: PluginListener[] = [];
  try {
    const token = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("애플 알림 서버에 연결하지 못했어요.")), 15_000);
      void push
        .addListener("registration", (t) => {
          clearTimeout(timer);
          resolve(t.value);
        })
        .then((l) => listeners.push(l));
      void push
        .addListener("registrationError", (e) => {
          clearTimeout(timer);
          reject(new Error(e?.error || "애플 알림 서버에 연결하지 못했어요."));
        })
        .then((l) => listeners.push(l));
    });
    await push.register();
    return await token;
  } finally {
    for (const l of listeners) void l.remove();
  }
}

async function enableNativePush(save: SaveSubscription): Promise<"on" | "denied" | "off"> {
  const push = appPlugin<PushNotificationsPlugin>("PushNotifications");
  if (!push) throw new Error("이 앱 버전은 알림을 지원하지 않아요. 앱을 업데이트해 주세요.");
  let permission: PushPermission = (await push.checkPermissions()).receive;
  if (permission === "prompt" || permission === "prompt-with-rationale") permission = (await push.requestPermissions()).receive;
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const token = await nativeDeviceToken(push);
  const info = await appPlugin<WinnerToeicPlugin>("WinnerToeic")
    ?.getInfo()
    .catch(() => null);
  const endpoint = apnsEndpoint(token, info?.apnsSandbox === true);
  // 웹 푸시의 키 두 칸은 애플 푸시에 없다 — 표의 칸을 채우는 자리 표시 (서버가 apns:// 주소면 키를 보지 않는다)
  const res = await save({ endpoint, p256dh: "apns", auth: "apns", userAgent: navigator.userAgent });
  if (!res.ok) throw new Error(res.error);
  rememberNativeEndpoint(endpoint);
  return "on";
}
