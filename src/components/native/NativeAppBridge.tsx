"use client";

import { useEffect } from "react";
import { appPlugin, isNativeApp, type PluginListener, type PushNotificationsPlugin } from "@/lib/native-app";

type SplashScreenPlugin = { hide(options?: { fadeOutDuration?: number }): Promise<void> };
type StatusBarPlugin = {
  setBackgroundColor(options: { color: string }): Promise<void>;
  setStyle(options: { style: "DARK" | "LIGHT" | "DEFAULT" }): Promise<void>;
};

/** 밝은 바탕인가 — 상태 표시줄 글자를 검게(LIGHT) 할지 희게(DARK) 할지 (Capacitor 의 이름은 바탕 기준이라 거꾸로 읽힌다) */
export function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 186;
}

/** 알림이 가리키는 주소 중 이 사이트 안의 경로만 (바깥 주소는 열지 않는다 — 서비스 워커의 알림 열기와 같은 규칙) */
export function notificationPath(url: unknown, origin: string): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  try {
    const u = new URL(url, origin);
    if (u.origin !== origin) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

/**
 * 아이폰 앱(`mobile/`) 안에서만 하는 일 — 웹 · 홈 화면 앱에서는 아무것도 하지 않는다 (2026-10-30, `src/lib/native-app.ts`).
 * - 앱 시작 화면(스플래시)을 걷는다 — 사이트가 그려지면 바로 (앱 쪽은 4초가 지나면 저절로 걷는다)
 * - 상태 표시줄 색을 `<meta name="theme-color">` 에 맞춘다 — 학생 모드 핫핑크 · 관리자 모드 회색 (`theme-color.ts`, 화면을 옮기면 Next 가 메타를 바꾼다)
 * - 알림을 누르면 그 알림의 주소로 간다 (꺼져 있던 앱을 알림으로 켰을 때도 — 플러그인이 그 누름을 들고 있다가 여기서 준다)
 */
export function NativeAppBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;

    void appPlugin<SplashScreenPlugin>("SplashScreen")
      ?.hide({ fadeOutDuration: 200 })
      .catch(() => {});

    const statusBar = appPlugin<StatusBarPlugin>("StatusBar");
    let lastColor = "";
    const syncStatusBar = () => {
      const color = document.querySelector('meta[name="theme-color"]')?.getAttribute("content")?.trim() ?? "";
      if (!statusBar || !/^#[0-9a-f]{6}$/i.test(color) || color === lastColor) return;
      lastColor = color;
      void statusBar.setBackgroundColor({ color }).catch(() => {});
      void statusBar.setStyle({ style: isLightColor(color) ? "LIGHT" : "DARK" }).catch(() => {});
    };
    syncStatusBar();
    const observer = new MutationObserver(syncStatusBar);
    observer.observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ["content"] });

    let removed = false;
    let tapListener: PluginListener | null = null;
    void appPlugin<PushNotificationsPlugin>("PushNotifications")
      ?.addListener("pushNotificationActionPerformed", (action) => {
        const path = notificationPath(action?.notification?.data?.url, window.location.origin);
        if (!path) return;
        const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (path === here) window.location.reload();
        else window.location.assign(path);
      })
      .then((listener) => {
        if (removed) void listener.remove();
        else tapListener = listener;
      })
      .catch(() => {});

    return () => {
      removed = true;
      observer.disconnect();
      void tapListener?.remove();
    };
  }, []);

  return null;
}
