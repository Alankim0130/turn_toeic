"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
// 설치 신호(beforeinstallprompt)를 놓치지 않도록 모든 페이지에서 일찍 로드한다
import "./install-store";
import { InstallSheet } from "./InstallSheet";
import { isStandalone } from "@/components/push/push-client";
import { notificationMove, OPEN_MESSAGE, PENDING_MESSAGE } from "@/lib/notification-open";

/**
 * 서비스 워커 등록 (오프라인 안내 + 푸시) + 앱 설치 안내 시트. 개발 서버에서는 캐시가 헷갈리지 않게 등록하지 않는다.
 * 알림을 눌렀을 때 서비스 워커가 이 창에게 "이 화면을 열어" 라고 물으면 여기서 정한다 — 규칙은 `src/lib/notification-open.ts`
 * (2026-10-19 Alan "불라방 알람이 푸시로 왔을때 클릭하면 해당 불라방페이지로 바로 이어지면 좋겠어").
 */
export function PwaRegister() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (!data || data.type !== OPEN_MESSAGE || typeof data.url !== "string") return;
      const move = notificationMove(data.url, window.location.href, isStandalone());
      if (move.action === "refresh") router.refresh();
      else if (move.action === "go") router.push(move.path);
      event.ports[0]?.postMessage({ ok: move.action !== "stay" });
    };
    sw.addEventListener("message", onMessage);
    sw.startMessages();
    // 알림으로 켠 홈 화면 앱이 시작 화면으로 열렸으면 알림의 화면으로 (브라우저 탭은 새 탭이 그 화면으로 열리므로 묻지 않는다).
    // 서비스 워커는 이 물음에 한 번만 답하고 지운다 — 그래서 정리할 때 답 받는 쪽을 닫지 않는다 (개발 화면은 효과를 두 번 돌려서, 닫으면 첫 답을 잃는다)
    const controller = sw.controller;
    if (controller && isStandalone()) {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e: MessageEvent) => {
        channel.port1.close();
        const url = (e.data as { url?: unknown } | null)?.url;
        if (typeof url !== "string") return;
        const move = notificationMove(url, window.location.href, true);
        if (move.action === "go") router.replace(move.path);
      };
      controller.postMessage({ type: PENDING_MESSAGE }, [channel.port2]);
    }
    return () => sw.removeEventListener("message", onMessage);
  }, [router]);

  return <InstallSheet />;
}
