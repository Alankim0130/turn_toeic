/**
 * 홈 화면 앱 설치 (브라우저 전용 상태·판별·경로).
 *
 * 웹사이트가 사용자 확인 없이 스스로를 설치하는 방법은 어느 브라우저에도 없다. 대신 "앱 설치" 한 번으로
 * 기기에 맞는 가장 짧은 길로 데려간다 (2026-09 기준으로 확인한 동작):
 * - 안드로이드 크롬·엣지·웨일: beforeinstallprompt → 원터치 설치 창. 크롬은 한 번 이상 누르고 30초 머문 뒤에야 신호를 준다.
 * - 삼성 인터넷 27+: 신호를 주지 않는다 (브라우저 자체 설치만) → 메뉴 위치를 가리키는 안내.
 * - iOS: 설치 API 가 없다 → 공유 버튼 위치를 가리키는 안내. Safari 26 부터는 ⋯ → 공유 경로이고,
 *   UA 의 iOS 버전은 18.6 으로 고정되므로 `Version/26` 으로 판별한다.
 * - 카카오톡 등 앱 안 브라우저: 설치 불가 → 외부 브라우저로 넘기고(?install=1) 거기서 안내를 이어서 연다.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallEnv = {
  /** 이미 홈 화면 앱으로 열려 있음 */
  standalone: boolean;
  ios: boolean;
  ipad: boolean;
  android: boolean;
  browser: "safari" | "chrome" | "samsung" | "other";
  /** Safari 주 버전 (Version/26 → 26) */
  safariMajor: number | null;
  /** 앱 안 브라우저 */
  inApp: "kakao" | "line" | "other" | null;
};

export type Glyph = "share" | "more-h" | "more-v" | "menu" | "add";
export type InstallStep = { glyph?: Glyph; text: string };
export type InstallPlan =
  | { kind: "prompt" }
  | { kind: "escape"; browserName: string; href: string; steps: InstallStep[] }
  | {
      kind: "guide";
      browserName: string;
      /** 눌러야 할 브라우저 버튼이 있는 곳. 화살표가 그쪽을 가리킨다 */
      pointer: "bottom-center" | "bottom-right" | "top-right" | null;
      steps: InstallStep[];
      note?: string;
    };

let deferred: InstallPromptEvent | null = null;
let state = { canPrompt: false, installed: false, sheetOpen: false };
const listeners = new Set<() => void>();

function emit(next: Partial<typeof state>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // preventDefault 는 하지 않는다 — 브라우저가 스스로 띄우는 설치 안내도 그대로 둔다
    deferred = e as InstallPromptEvent;
    emit({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit({ canPrompt: false, installed: true, sheetOpen: false });
  });
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getInstallState = () => state;
export const getServerInstallState = () => state;

export const closeInstallSheet = () => emit({ sheetOpen: false });
export const openInstallSheet = () => emit({ sheetOpen: true });

/** 브라우저 설치 창을 띄운다 (사용자가 누른 직후에만 가능). 설치했으면 true */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  emit({ canPrompt: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") emit({ installed: true, sheetOpen: false });
  return outcome === "accepted";
}

let env: InstallEnv | null = null;
/** 기기·브라우저 판별. 서버 렌더와 어긋나지 않도록 마운트 뒤에만 읽는다 */
export function getInstallEnv(): InstallEnv {
  if (env) return env;
  const ua = navigator.userAgent;
  const ipad = /iPad/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const ios = ipad || /iPhone|iPod/.test(ua);
  const android = /Android/i.test(ua);
  const inApp = /KAKAOTALK/i.test(ua)
    ? "kakao"
    : /\bLine\//i.test(ua)
      ? "line"
      : /NAVER\(inapp|Instagram|FBAN|FBAV|DaumApps|BAND\/|; wv\)/i.test(ua)
        ? "other"
        : null;
  let browser: InstallEnv["browser"] = "other";
  if (ios) {
    if (/CriOS/.test(ua)) browser = "chrome";
    else if (!/FxiOS|EdgiOS|Whale|NAVER|DaumApps/.test(ua) && /Version\/\d+.*Safari\//.test(ua)) browser = "safari";
  } else if (android) {
    if (/SamsungBrowser/.test(ua)) browser = "samsung";
    else if (/Chrome\/\d+/.test(ua) && !/EdgA|OPR|Whale|YaBrowser|; wv\)/.test(ua)) browser = "chrome";
  }
  const version = ua.match(/Version\/(\d+)/);
  env = {
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    ios,
    ipad,
    android,
    browser,
    safariMajor: browser === "safari" && version ? Number(version[1]) : null,
    inApp,
  };
  return env;
}

/** 외부 브라우저에서 열렸을 때 설치 안내를 이어서 띄우도록 표시를 붙인 현재 주소 */
function continueUrl(extra?: [string, string]) {
  const url = new URL(window.location.href);
  url.searchParams.set("install", "1");
  if (extra) url.searchParams.set(extra[0], extra[1]);
  return url.toString();
}

/** 지금 기기에서 "앱 설치"를 눌렀을 때 갈 길. 설치할 수 없는 환경(데스크톱에서 신호 없음)이면 null */
export function getInstallPlan(env: InstallEnv, canPrompt: boolean): InstallPlan | null {
  if (env.standalone) return null;

  // 앱 안 브라우저 (iOS 의 다른 브라우저도 Safari 로 넘기는 편이 가장 짧다)
  if (env.inApp || (env.ios && env.browser === "other")) {
    const browserName = env.ios ? "Safari" : "Chrome";
    const steps: InstallStep[] = [
      { glyph: "more-h", text: "화면 위(또는 아래)의 더보기 메뉴를 누르세요" },
      { text: env.ios ? "‘Safari로 열기’를 고르세요" : "‘다른 브라우저로 열기’를 고르세요" },
      { text: "열린 브라우저에서 설치 안내가 이어서 나와요" },
    ];
    let href: string;
    if (env.inApp === "kakao") href = `kakaotalk://web/openExternal?url=${encodeURIComponent(continueUrl())}`;
    else if (env.inApp === "line") href = continueUrl(["openExternalBrowser", "1"]);
    else if (env.android) {
      const target = continueUrl();
      href = `intent://${target.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target)};end`;
    } else href = continueUrl().replace(/^https:/, "x-safari-https:").replace(/^http:/, "x-safari-http:");
    return { kind: "escape", browserName, href, steps };
  }

  if (canPrompt) return { kind: "prompt" };

  if (env.ios) {
    if (env.browser === "chrome") {
      return {
        kind: "guide",
        browserName: "Chrome",
        pointer: "top-right",
        steps: [
          { glyph: "share", text: "주소창 오른쪽의 공유 버튼을 누르세요" },
          { glyph: "add", text: "‘홈 화면에 추가’를 누르세요" },
          { text: "오른쪽 위 ‘추가’를 누르면 끝이에요" },
        ],
      };
    }
    const modern = (env.safariMajor ?? 0) >= 26;
    if (env.ipad) {
      return {
        kind: "guide",
        browserName: "Safari",
        pointer: "top-right",
        steps: [
          { glyph: "share", text: modern ? "주소창 오른쪽 공유 버튼(없으면 ⋯ 안의 ‘공유’)을 누르세요" : "주소창 오른쪽의 공유 버튼을 누르세요" },
          { glyph: "add", text: "‘홈 화면에 추가’를 누르세요" },
          { text: "‘추가’를 누르면 끝이에요" },
        ],
      };
    }
    return modern
      ? {
          kind: "guide",
          browserName: "Safari",
          pointer: "bottom-right",
          steps: [
            { glyph: "more-h", text: "주소창 오른쪽의 ⋯ 버튼을 누르세요" },
            { glyph: "share", text: "‘공유’를 누르세요" },
            { glyph: "add", text: "아래로 내려 ‘홈 화면에 추가’를 누르세요" },
            { text: "오른쪽 위 ‘추가’를 누르면 끝이에요" },
          ],
        }
      : {
          kind: "guide",
          browserName: "Safari",
          pointer: "bottom-center",
          steps: [
            { glyph: "share", text: "화면 아래 가운데의 공유 버튼을 누르세요" },
            { glyph: "add", text: "아래로 내려 ‘홈 화면에 추가’를 누르세요" },
            { text: "오른쪽 위 ‘추가’를 누르면 끝이에요" },
          ],
        };
  }

  if (env.android) {
    if (env.browser === "samsung") {
      return {
        kind: "guide",
        browserName: "삼성 인터넷",
        pointer: "bottom-right",
        steps: [
          { glyph: "menu", text: "화면 아래 오른쪽의 메뉴 버튼을 누르세요" },
          { glyph: "add", text: "‘현재 페이지 추가’를 누르세요" },
          { text: "‘홈 화면’을 고르면 끝이에요" },
        ],
        note: "주소창 옆에 설치 아이콘이 보이면 그걸 눌러도 바로 설치돼요.",
      };
    }
    return {
      kind: "guide",
      browserName: env.browser === "chrome" ? "Chrome" : "브라우저",
      pointer: env.browser === "chrome" ? "top-right" : null,
      steps: [
        { glyph: "more-v", text: env.browser === "chrome" ? "오른쪽 위의 ⋮ 메뉴를 누르세요" : "브라우저 메뉴를 누르세요" },
        { glyph: "add", text: "‘앱 설치’ 또는 ‘홈 화면에 추가’를 누르세요" },
        { text: "‘설치’를 누르면 끝이에요" },
      ],
      note: env.browser === "chrome" ? "잠시 사이트를 둘러보면 원터치 설치 버튼이 여기에 켜질 수도 있어요." : undefined,
    };
  }

  return null;
}

/** "앱 설치" 버튼. 원터치 설치가 되면 바로 설치 창, 앱 안 브라우저면 외부 브라우저로, 나머지는 안내 시트 */
export async function startInstall() {
  const plan = getInstallPlan(getInstallEnv(), state.canPrompt);
  if (!plan) return;
  if (plan.kind === "prompt") {
    await promptInstall();
    return;
  }
  emit({ sheetOpen: true });
  if (plan.kind === "escape") window.location.href = plan.href;
}
