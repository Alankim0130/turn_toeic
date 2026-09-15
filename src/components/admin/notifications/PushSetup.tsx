"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { deletePushSubscription, savePushSubscription, sendTestPush } from "@/app/admin/notifications/actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function detect(): Promise<State> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** 이 기기에서 관리자 푸시 알림 켜기·끄기·테스트 */
export function PushSetup({ publicKey }: { publicKey: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    detect()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey) {
      setNotice({ kind: "warning", text: "서버에 알림 키가 설정되지 않았어요. 관리자에게 알려 주세요." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      // 아이폰은 버튼을 누른 바로 그 순간에 권한을 물어야 한다
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(publicKey) }));
      const json = sub.toJSON();
      const res = await savePushSubscription({
        endpoint: json.endpoint ?? sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      if (!res.ok) throw new Error(res.error);
      setState("on");
      setNotice({ kind: "success", text: "이 기기에서 알림을 받아요. 테스트 알림으로 확인해 보세요." });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "warning", text: error instanceof Error && error.message ? `알림을 켜지 못했어요. ${error.message}` : "알림을 켜지 못했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setNotice(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await sendTestPush();
      setNotice(res.ok ? { kind: "success", text: res.message ?? "보냈어요." } : { kind: "warning", text: res.error });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {state === "loading" && <p className="text-sm text-slate">이 기기의 알림 상태를 확인하고 있어요…</p>}

      {state === "ios-install" && (
        <Alert kind="info" title="아이폰은 홈 화면에 추가한 뒤에 알림을 받을 수 있어요">
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>사파리 아래쪽의 공유 버튼을 누르고 &ldquo;홈 화면에 추가&rdquo;를 고르세요.</li>
            <li>홈 화면에 생긴 역전토익 아이콘으로 사이트를 여세요.</li>
            <li>관리자 &gt; 알림 설정으로 와서 &ldquo;이 기기에서 알림 받기&rdquo;를 누르세요.</li>
          </ol>
          <p className="mt-2 text-xs">iOS 16.4 이상에서 동작해요.</p>
        </Alert>
      )}

      {state === "unsupported" && (
        <Alert kind="warning" title="이 브라우저는 푸시 알림을 지원하지 않아요">
          안드로이드는 크롬, 아이폰은 홈 화면에 추가한 역전토익 아이콘으로 열어 주세요.
        </Alert>
      )}

      {state === "denied" && (
        <Alert kind="warning" title="알림이 차단돼 있어요">
          휴대폰 설정의 알림 메뉴에서 역전토익(또는 사용 중인 브라우저)의 알림을 허용한 뒤 이 페이지를 새로고침해 주세요.
        </Alert>
      )}

      {state === "off" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate">이 기기는 아직 알림을 받지 않아요.</p>
          <button type="button" onClick={enable} disabled={busy} className="btn-primary">
            <Icon name="bell" size={20} className="brightness-0 invert" />
            {busy ? "켜는 중…" : "이 기기에서 알림 받기"}
          </button>
        </div>
      )}

      {state === "on" && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Icon name="success" size={22} />이 기기에서 알림을 받고 있어요
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={test} disabled={busy} className="btn-primary">
              {busy ? "보내는 중…" : "테스트 알림 보내기"}
            </button>
            <button type="button" onClick={disable} disabled={busy} className="btn-secondary">
              이 기기 알림 끄기
            </button>
          </div>
        </div>
      )}

      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
    </div>
  );
}
