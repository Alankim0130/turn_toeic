/**
 * 홈 화면 앱 설치 상태 (브라우저 전용).
 * - 안드로이드 크롬 계열은 설치할 수 있게 되면 beforeinstallprompt 를 한 번 보낸다. 이 모듈이 로드될 때 바로 받아 둔다.
 *   preventDefault 는 하지 않는다 — 브라우저가 스스로 띄우는 설치 안내도 그대로 둔다.
 * - iOS 는 설치 API 가 없어 "공유 → 홈 화면에 추가" 안내만 할 수 있다.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallEnv = {
  /** 이미 홈 화면 앱으로 열려 있음 */
  standalone: boolean;
  ios: boolean;
  android: boolean;
  /** 카카오톡·인스타그램 등 앱 안 브라우저 (설치 불가) */
  inApp: boolean;
};

let deferred: InstallPromptEvent | null = null;
let state = { canPrompt: false, installed: false };
const listeners = new Set<() => void>();

function emit(next: Partial<typeof state>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    deferred = e as InstallPromptEvent;
    emit({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit({ canPrompt: false, installed: true });
  });
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getInstallState = () => state;
export const getServerInstallState = () => state;

/** 설치 창을 띄운다. 설치했으면 true */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  emit({ canPrompt: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") emit({ installed: true });
  return outcome === "accepted";
}

let env: InstallEnv | null = null;
/** 기기·브라우저 판별. 서버 렌더와 어긋나지 않도록 마운트 뒤에만 읽는다 (useSyncExternalStore 의 클라이언트 스냅샷) */
export function getInstallEnv(): InstallEnv {
  if (env) return env;
  const ua = navigator.userAgent;
  env = {
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    ios: /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1),
    android: /Android/i.test(ua),
    inApp: /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps/i.test(ua),
  };
  return env;
}
