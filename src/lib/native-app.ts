/**
 * 아이폰 앱(`mobile/` — Capacitor) 안에서 열렸는지, 그리고 앱 전용 기능 부르기 (2026-10-30 Alan — "애플 앱 출시부터 먼저 진행해보자 …
 * 기존에 쓰는 학생들이 방해받지 않도록" → "같은 사이트, 앱에서만 켜기").
 *
 * 앱은 이 사이트(https://winnertoeic.com)를 그대로 띄우는 껍데기라 서버 · DB · 화면이 웹과 같다. 앱에서만 다른 것은 **앱 안에서 열렸을 때만** 켠다:
 * - 시작 화면(스플래시) 걷기 · 상태 표시줄 색 · 알림을 누르면 그 화면으로 (`NativeAppBridge`)
 * - 홈 화면 앱(PWA) 설치 안내를 숨기고 당겨서 새로고침을 켠다 (`install-store.ts` 의 standalone)
 * - 알림은 애플 푸시(APNs)로 (`push-client.ts` — 앱 화면에는 웹 푸시가 없다)
 * - 카카오 · 구글 로그인은 앱 안 브라우저 창으로, Apple 로그인은 아이폰의 Apple 로그인 창으로 (`SocialLogin`)
 * - PDF · Word · 그림 받기는 아이폰 공유 시트로 (`shareFileInApp`)
 * - 앱 밖 결제(YBM 수강 신청)로 이끄는 버튼을 숨긴다 — `hide-in-app` (App Store 심사 3.1.1)
 * 웹 · 홈 화면 앱에서는 이 파일의 함수가 모두 거짓 · null 이라 아무것도 바뀌지 않는다.
 *
 * 앱 플러그인은 앱이 넣어 주는 `window.Capacitor.Plugins` 로 부른다 — 사이트에 Capacitor 패키지를 더하지 않는다.
 * 앱 쪽 코드는 `mobile/ios/App/App/WinnerToeicPlugin.swift` · `AppViewController.swift`.
 */

/** 앱이 사용자 에이전트 끝에 붙이는 표시 — `mobile/capacitor.config.json` 의 `ios.appendUserAgent` 와 같아야 한다 (`native-app.test.ts`) */
export const APP_USER_AGENT_MARK = "WinnerToeicApp/";

/**
 * 앱 안에서 연 화면의 `<html>` 에 다는 표시 — 서버가 사용자 에이전트(`APP_USER_AGENT_MARK`)를 보고 루트 레이아웃에서 단다 (`isAppRequest`).
 * 서버가 그리는 HTML 에 처음부터 있어서 앱 밖 결제로 이끄는 버튼(`.hide-in-app`)이 한 번도 보이지 않는다 (CSS 가 이것을 본다)
 */
export const APP_HTML_ATTRIBUTE = "data-native-app";

/** 카카오 · 구글 로그인 창이 끝나면 돌아오는 앱 주소의 앞부분 (`/auth/app-callback` 이 여기로 넘긴다 · Swift 의 callbackURLScheme) */
export const APP_CALLBACK_SCHEME = "winnertoeic";
export const APP_AUTH_CALLBACK = `${APP_CALLBACK_SCHEME}://auth-callback`;

export function isAppUserAgent(ua: string | null | undefined): boolean {
  return typeof ua === "string" && ua.includes(APP_USER_AGENT_MARK);
}

type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

/** 아이폰 앱 안인가 — 브라우저에서만 참이 될 수 있다 (서버는 `native-app-server.ts` 의 `isAppRequest`) */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  if (capacitor()?.isNativePlatform?.() === true) return true;
  return isAppUserAgent(navigator.userAgent);
}

/** 앱 플러그인 — 앱이 아니거나 그 플러그인이 없으면 null */
export function appPlugin<T>(name: string): T | null {
  if (!isNativeApp()) return null;
  const plugin = capacitor()?.Plugins?.[name];
  return (plugin as T | undefined) ?? null;
}

/** 앱 플러그인이 낸 오류의 코드 (Swift 의 `call.reject(메시지, 코드)`) */
export function appErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

export type PluginListener = { remove: () => Promise<void> | void };

/** `mobile/ios/App/App/WinnerToeicPlugin.swift` */
export type WinnerToeicPlugin = {
  getInfo(): Promise<{ version: string; build: string; apnsSandbox: boolean }>;
  signInWithApple(options: { nonce: string }): Promise<{
    identityToken: string;
    authorizationCode?: string;
    user: string;
    email?: string;
    givenName?: string;
    familyName?: string;
  }>;
  openAuthSession(options: { url: string; scheme?: string }): Promise<{ url: string }>;
};

/** @capacitor/push-notifications 중 쓰는 것 */
export type PushNotificationsPlugin = {
  checkPermissions(): Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied" }>;
  requestPermissions(): Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied" }>;
  register(): Promise<void>;
  addListener(event: "registration", fn: (token: { value: string }) => void): Promise<PluginListener>;
  addListener(event: "registrationError", fn: (error: { error: string }) => void): Promise<PluginListener>;
  addListener(
    event: "pushNotificationActionPerformed",
    fn: (action: { actionId: string; notification: { data?: Record<string, unknown> } }) => void,
  ): Promise<PluginListener>;
};

// ─── 애플 푸시 기기 주소 ─────────────────────────────────────────────────────

/**
 * 앱 기기의 알림 주소 — 웹 푸시 주소(https://…)와 같은 표(`push_subscriptions.endpoint`)에 `apns://production/<토큰>` 꼴로 둔다.
 * 그래서 알림을 고르는 곳(관리자 알림 · 학생 알림 · 테스트 · 로그아웃 정리 · 기기 수 끝)이 웹 푸시와 똑같이 돌고, 보낼 때만 길이 갈린다 (`push.ts`).
 * sandbox = Xcode 에서 바로 설치한 앱(개발용 푸시 서버). 서버의 검사는 `push-endpoint.ts` 의 `parseApnsEndpoint`.
 */
export function apnsEndpoint(token: string, sandbox: boolean): string {
  return `apns://${sandbox ? "sandbox" : "production"}/${token.trim().toLowerCase()}`;
}

// ─── 파일 받기 ──────────────────────────────────────────────────────────────

/** @capacitor/filesystem · @capacitor/share 중 쓰는 것 */
type FilesystemPlugin = { writeFile(options: { path: string; data: string; directory: "CACHE"; recursive?: boolean }): Promise<{ uri: string }> };
type SharePlugin = { share(options: { files: string[]; dialogTitle?: string }): Promise<unknown> };

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/** 파일 이름에 못 쓰는 글자를 지운다 — 앱의 임시 폴더에 이 이름으로 둔다 (공유 시트가 이 이름으로 저장한다) */
export function appFileName(name: string, fallback = "download"): string {
  const clean = name.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return clean || fallback;
}

/**
 * 앱에서 파일을 아이폰 공유 시트로 넘긴다 (파일에 저장 · 프린트 · 카카오톡 …). 앱 화면(WKWebView)은 내려받기를 하지 못하고
 * PDF 를 화면에 띄우기만 해서 돌아갈 길이 없다 — 그래서 받은 파일을 앱의 임시 폴더에 쓰고 공유 시트를 연다.
 * 웹의 공유 시트(navigator.share)와 달리 '누른 순간' 이 지나도 열린다.
 */
export async function shareFileInApp(file: Blob, name: string): Promise<"shared" | "cancelled" | "failed"> {
  const fs = appPlugin<FilesystemPlugin>("Filesystem");
  const share = appPlugin<SharePlugin>("Share");
  if (!fs || !share) return "failed";
  let uri: string;
  try {
    ({ uri } = await fs.writeFile({ path: appFileName(name), data: await blobToBase64(file), directory: "CACHE", recursive: true }));
  } catch {
    return "failed";
  }
  try {
    await share.share({ files: [uri] });
    return "shared";
  } catch (error) {
    return /cancel/i.test(String((error as Error)?.message ?? error)) ? "cancelled" : "failed";
  }
}
