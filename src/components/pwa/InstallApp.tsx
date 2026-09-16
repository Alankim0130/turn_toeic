"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { getInstallEnv, getInstallPlan, getInstallState, getServerInstallState, startInstall, subscribeInstall } from "./install-store";

const noopSubscribe = () => () => {};
const DISMISS_KEY = "turn-toeic:install-card-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "앱 설치" 진입점. 누르면 startInstall() 이 기기에 맞는 가장 짧은 길로 데려간다
 * (원터치 설치 창 / 외부 브라우저로 이동 / 버튼 위치를 가리키는 안내 시트).
 * - menu: 모바일 메뉴 바닥의 한 줄. 누르면 메뉴를 닫고 진행한다
 * - card: 마이페이지 카드. 휴대폰에서만, "다음에 할게요"로 닫으면 이 기기에서는 다시 안 보인다
 * 이미 앱으로 열었거나 설치할 수 없는 환경이면 아무것도 그리지 않는다.
 */
export function InstallApp({ variant, className, onStart }: { variant: "menu" | "card"; className?: string; onStart?: () => void }) {
  const env = useSyncExternalStore(noopSubscribe, getInstallEnv, () => null);
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
  const initiallyDismissed = useSyncExternalStore(noopSubscribe, readDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);

  if (!env || installed) return null;
  const plan = getInstallPlan(env, canPrompt);
  if (!plan) return null;

  const onInstall = () => {
    onStart?.();
    void startInstall();
  };
  const hint = plan.kind === "prompt" ? "원터치" : plan.kind === "escape" ? `${plan.browserName}에서` : "쉬운 안내";

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={onInstall}
        className={cn("flex w-full items-center gap-3 rounded-xl2 border border-brand-100 bg-brand-50/50 px-3 py-3 text-left font-bold text-ink", className)}
      >
        <Icon name="download" size={24} />
        <span className="flex-1">앱으로 설치하기</span>
        <span className="text-xs font-bold text-brand-600">{hint}</span>
      </button>
    );
  }

  if (!(env.ios || env.android) || initiallyDismissed || dismissed) return null;

  return (
    <section aria-labelledby="install-title" className={cn("card relative overflow-hidden p-5", className)}>
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-100 blur-2xl" />
      <div className="relative flex items-start gap-4">
        <Image src="/pwa/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-2xl shadow-pink" />
        <div className="min-w-0 flex-1">
          <h2 id="install-title" className="text-base font-black text-ink">역전토익을 앱처럼 쓰세요</h2>
          <p className="mt-0.5 text-sm text-slate">홈 화면에 추가하면 주소창 없이 불라방·다시보기를 바로 열 수 있어요.</p>
        </div>
      </div>

      <div className="relative mt-4">
        <button type="button" onClick={onInstall} className="btn-primary w-full !py-3.5 text-base">
          <Icon name="download" size={20} className="brightness-0 invert" />
          앱 설치하기
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {}
          }}
          className="mt-2 w-full py-2 text-center text-xs font-semibold text-mist hover:text-slate"
        >
          다음에 할게요
        </button>
      </div>
    </section>
  );
}
