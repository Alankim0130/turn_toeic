"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native-app";
import { nativeEndpoint } from "./push-client";

/**
 * 로그아웃 폼 안에 이 기기의 알림 주소를 숨겨 넣는다 — 서버(`signOut`)가 이 기기를 그 계정의 알림 기기에서 지운다 (2026-10-16 점검).
 * 같은 휴대폰 · 태블릿을 다른 사람이 이어 쓰면 앞사람의 숙제 미제출 · 불라방 알림(이름 · 날짜가 든다)이 계속 떴다.
 * 이 기기의 구독을 못 읽으면(알림을 안 켰음 · 알림을 못 쓰는 브라우저) 아무것도 넣지 않는다 — 로그아웃은 그대로 된다.
 */
export function PushLogoutField() {
  const [endpoint, setEndpoint] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 아이폰 앱이면 애플 푸시로 켠 이 기기의 주소 (push-client.ts — 켤 때 기기에 적어 둔다)
        if (isNativeApp()) {
          const endpoint = nativeEndpoint();
          if (alive && endpoint) setEndpoint(endpoint);
          return;
        }
        if (!("serviceWorker" in navigator)) return;
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager?.getSubscription();
        if (alive && sub?.endpoint) setEndpoint(sub.endpoint);
      } catch {
        // 못 읽으면 넣지 않는다
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return endpoint ? <input type="hidden" name="push_endpoint" value={endpoint} /> : null;
}
