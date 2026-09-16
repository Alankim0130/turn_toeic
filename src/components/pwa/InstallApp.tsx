"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { getInstallEnv, getInstallState, getServerInstallState, promptInstall, subscribeInstall, type InstallEnv } from "./install-store";

const noopSubscribe = () => () => {};
const DISMISS_KEY = "turn-toeic:install-card-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** 설치 방법 안내. 설치 버튼을 띄울 수 없는 브라우저용 */
function Steps({ env }: { env: InstallEnv }) {
  if (env.inApp) {
    return (
      <p className="text-sm leading-relaxed text-slate">
        카카오톡·인스타그램 같은 앱 안에서는 설치할 수 없어요. 화면 오른쪽 위(또는 아래) 메뉴에서{" "}
        <b className="text-ink">{env.ios ? "Safari로 열기" : "다른 브라우저로 열기"}</b>를 누른 뒤 다시 시도해 주세요.
      </p>
    );
  }
  const steps = env.ios
    ? ["Safari 화면 아래(아이패드는 위)의 공유 버튼을 누르세요", "목록을 내려 ‘홈 화면에 추가’를 고르세요", "오른쪽 위 ‘추가’를 누르면 끝이에요"]
    : ["브라우저 오른쪽 위(또는 아래)의 메뉴 버튼을 누르세요", "‘앱 설치’ 또는 ‘홈 화면에 추가’를 고르세요", "‘설치’를 누르면 홈 화면에 아이콘이 생겨요"];
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s} className="flex items-start gap-2.5 text-sm text-ink-soft">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-black text-white">
            {i + 1}
          </span>
          <span className="leading-relaxed">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * 홈 화면 앱 설치 안내.
 * - menu: 모바일 메뉴 바닥의 한 줄 버튼. 설치 창을 띄울 수 없으면 방법을 펼쳐 보여 준다
 * - card: 마이페이지 카드. 휴대폰에서만, 닫으면 이 기기에서는 다시 안 보인다
 * 이미 앱으로 열었거나 설치할 수 없는 환경(데스크톱에서 설치 신호 없음)이면 아무것도 그리지 않는다.
 */
export function InstallApp({ variant, className }: { variant: "menu" | "card"; className?: string }) {
  const env = useSyncExternalStore(noopSubscribe, getInstallEnv, () => null);
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
  const initiallyDismissed = useSyncExternalStore(noopSubscribe, readDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  if (!env || env.standalone || installed) return null;
  const mobile = env.ios || env.android;
  if (!mobile && !canPrompt) return null;

  const onInstall = async () => {
    if (canPrompt) await promptInstall();
    else setOpen((v) => !v);
  };

  if (variant === "menu") {
    return (
      <div className={cn("rounded-xl2 border border-brand-100 bg-brand-50/50", className)}>
        <button
          type="button"
          onClick={onInstall}
          aria-expanded={canPrompt ? undefined : open}
          className="flex w-full items-center gap-3 rounded-xl2 px-3 py-3 text-left font-bold text-ink"
        >
          <Icon name="download" size={24} />
          <span className="flex-1">앱으로 설치하기</span>
          <span className="text-xs font-bold text-brand-600">{canPrompt ? "설치" : open ? "닫기" : "방법 보기"}</span>
        </button>
        {!canPrompt && open && (
          <div className="px-3 pb-3">
            <Steps env={env} />
          </div>
        )}
      </div>
    );
  }

  if (!mobile || initiallyDismissed || dismissed) return null;

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
        {canPrompt ? (
          <button type="button" onClick={onInstall} className="btn-primary w-full">
            <Icon name="download" size={20} className="brightness-0 invert" />
            앱 설치하기
          </button>
        ) : (
          <div className="rounded-xl bg-surface p-4">
            <Steps env={env} />
          </div>
        )}
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
