"use client";

import { useEffect } from "react";
// 설치 신호(beforeinstallprompt)를 놓치지 않도록 모든 페이지에서 일찍 로드한다
import "./install-store";
import { InstallSheet } from "./InstallSheet";

/** 서비스 워커 등록 (오프라인 안내 + 관리자 푸시) + 앱 설치 안내 시트. 개발 서버에서는 캐시가 헷갈리지 않게 등록하지 않는다 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return <InstallSheet />;
}
