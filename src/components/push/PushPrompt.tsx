"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { installCardDismissed } from "@/components/pwa/InstallApp";
import { getInstallEnv, getInstallPlan, getInstallState, getServerInstallState, subscribeInstall } from "@/components/pwa/install-store";
import { ownsStudentPushDevice, saveStudentPushSubscription } from "@/app/my/notifications/push-actions";
import { cn } from "@/lib/utils";
import { detectPush, enablePush, type PushState } from "./push-client";

const noopSubscribe = () => () => {};
const DISMISS_KEY = "turn-toeic:push-card-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 마이페이지의 "휴대폰 알림 켜기" 카드 (2026-10-15 — 숙제 미제출 · 불라방 시작 푸시).
 * 알림함 화면(`/my/notifications`)까지 찾아가지 않아도 한 번 눌러 켜게 한다.
 *
 * 보이는 때: 휴대폰 · 이 기기에서 푸시를 켤 수 있음 · 아직 안 켬 · 차단 안 됨 · "다음에 할게요" 안 누름.
 * **앱 설치 카드(`InstallApp`)가 떠 있는 동안은 숨는다** — 카드 둘이 겹쳐 쌓이지 않게. 아이폰은 홈 화면 앱이어야 푸시가 되므로
 * 설치 카드가 먼저고, 안드로이드는 설치하거나 설치 카드를 닫으면 이 카드가 선다 (안드로이드 크롬은 브라우저에서도 받는다).
 */
export function PushPrompt({ publicKey, className }: { publicKey: string | null; className?: string }) {
  const env = useSyncExternalStore(noopSubscribe, getInstallEnv, () => null);
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
  const initiallyDismissed = useSyncExternalStore(noopSubscribe, readDismissed, () => true);
  const installCardGone = useSyncExternalStore(noopSubscribe, installCardDismissed, () => false);
  const [state, setState] = useState<PushState>("loading");
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectPush(ownsStudentPushDevice)
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!publicKey || !env || !(env.ios || env.android)) return null;
  if (initiallyDismissed || dismissed) return null;
  // 앱 설치 카드가 떠 있으면 그쪽이 먼저다 (InstallApp 의 card 와 같은 조건)
  const installCardShown = !env.standalone && !installed && !installCardGone && getInstallPlan(env, canPrompt) !== null;
  if (installCardShown) return null;
  if (!done && state !== "off") return null;

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      // 아이폰은 버튼을 누른 바로 그 순간에 권한을 물어야 한다
      const next = await enablePush(publicKey, saveStudentPushSubscription);
      if (next === "on") setDone(true);
      else if (next === "denied") setError("알림이 차단됐어요. 휴대폰 설정의 알림 메뉴에서 허용하면 켤 수 있어요.");
    } catch (e) {
      setError(e instanceof Error && e.message ? `알림을 켜지 못했어요. ${e.message}` : "알림을 켜지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  return (
    <section aria-labelledby="push-prompt-title" className={cn("card relative overflow-hidden p-5", className)}>
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-100 blur-2xl" />
      <div className="relative flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
          <Icon name={done ? "success" : "bell"} size={32} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="push-prompt-title" className="text-base font-black text-ink">
            {done ? "이 휴대폰으로 알림이 와요" : "휴대폰으로 알림 받기"}
          </h2>
          <p className="mt-0.5 text-sm text-slate">
            {done ? (
              <>
                불라방이 시작될 때 · 숙제를 안 냈을 때 바로 알려 드려요. 끄거나 테스트는{" "}
                <Link href="/my/notifications" className="font-bold text-brand-600 underline decoration-brand-200 underline-offset-2">
                  알림
                </Link>
                에서 해요.
              </>
            ) : (
              "불라방이 시작될 때 · 숙제를 안 냈을 때 휴대폰으로 바로 알려 드려요."
            )}
          </p>
        </div>
      </div>

      {!done && (
        <div className="relative mt-4">
          <button type="button" onClick={enable} disabled={busy} className="btn-primary w-full !py-3.5 text-base">
            <Icon name="bell" size={20} className="brightness-0 invert" />
            {busy ? "켜는 중…" : "알림 켜기"}
          </button>
          {error && <p className="mt-2 text-sm font-semibold text-amber-800">{error}</p>}
          <button type="button" onClick={dismiss} className="mt-2 w-full py-2 text-center text-xs font-semibold text-mist hover:text-slate">
            다음에 할게요
          </button>
        </div>
      )}
    </section>
  );
}
