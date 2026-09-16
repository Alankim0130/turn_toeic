"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import {
  closeInstallSheet,
  getInstallEnv,
  getInstallPlan,
  getInstallState,
  getServerInstallState,
  openInstallSheet,
  promptInstall,
  subscribeInstall,
  type Glyph,
} from "./install-store";

const noopSubscribe = () => () => {};

/** 사용자가 찾아 눌러야 할 브라우저 버튼 모양 (이모지가 아니라 브라우저 UI 를 그대로 흉내 낸 선 그림) */
function BrowserGlyph({ glyph }: { glyph: Glyph }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (glyph) {
    case "share":
      return (
        <svg {...common} aria-hidden>
          <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
          <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
        </svg>
      );
    case "more-h":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="9.5" />
          <circle cx="7.8" cy="12" r="0.6" fill="currentColor" />
          <circle cx="12" cy="12" r="0.6" fill="currentColor" />
          <circle cx="16.2" cy="12" r="0.6" fill="currentColor" />
        </svg>
      );
    case "more-v":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="5" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="19" r="1" fill="currentColor" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case "add":
      return (
        <svg {...common} aria-hidden>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
  }
}

/** 화면 가장자리의 브라우저 버튼을 가리키는 튀는 화살표 */
function Pointer({ at }: { at: "bottom-center" | "bottom-right" | "top-right" }) {
  const down = at.startsWith("bottom");
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed z-[71] flex flex-col items-center",
        at === "bottom-center" && "left-1/2 -translate-x-1/2",
        at !== "bottom-center" && "right-3",
        // iOS 26 Safari 는 주소창이 화면 위에 떠 있으므로 그 위로 조금 띄운다
        down ? "bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]" : "top-[calc(env(safe-area-inset-top,0px)+0.25rem)]",
      )}
    >
      <div className={cn("flex animate-bounce flex-col items-center", !down && "flex-col-reverse")}>
        <span className="whitespace-nowrap rounded-full bg-brand-500 px-3 py-1 text-xs font-black text-white shadow-pink">
          {down ? "아래 브라우저 버튼" : "위 브라우저 버튼"}
        </span>
        <svg width="34" height="34" viewBox="0 0 24 24" className={cn("drop-shadow", !down && "rotate-180")}>
          <path d="M12 3v15m-6-6 6 6 6-6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 3v15m-6-6 6 6 6-6" fill="none" stroke="#ff2e88" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

/**
 * 앱 설치 안내 시트 (루트에 하나). startInstall() 이 열고, 외부 브라우저로 넘어와 ?install=1 이 붙어 있으면 스스로 연다.
 * 브라우저 버튼이 아래에 있으면 시트를 위에, 위에 있으면 아래에 두어 화살표가 가리지 않게 한다.
 */
export function InstallSheet() {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const { sheetOpen, canPrompt } = useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 카카오톡 등에서 넘어온 경우 이어서 안내 (설치 창은 사용자가 눌러야 뜨므로 시트로 연다)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("install") !== "1") return;
    url.searchParams.delete("install");
    url.searchParams.delete("openExternalBrowser");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    if (!getInstallEnv().standalone) openInstallSheet();
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeInstallSheet();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  if (!mounted || !sheetOpen) return null;
  const env = getInstallEnv();
  const plan = getInstallPlan(env, canPrompt);
  if (!plan) return null;

  const pointer = plan.kind === "guide" ? plan.pointer : null;
  const atTop = pointer?.startsWith("bottom") ?? false;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div aria-hidden onClick={closeInstallSheet} className="absolute inset-0 bg-ink/45" />
      {/* 화살표 쪽 가장자리는 진하게 덮어 사이트의 하단·상단 메뉴를 브라우저 버튼으로 착각하지 않게 한다 */}
      {pointer && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 h-40 from-ink/90 to-transparent",
            atTop ? "bottom-0 bg-gradient-to-t" : "top-0 bg-gradient-to-b",
          )}
        />
      )}
      {pointer && <Pointer at={pointer} />}

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-sheet-title"
        className={cn(
          "absolute inset-x-3 mx-auto max-w-md rounded-[1.75rem] bg-paper p-5 shadow-2xl",
          atTop ? "top-[calc(env(safe-area-inset-top,0px)+0.75rem)]" : "bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]",
        )}
      >
        <div className="flex items-center gap-3">
          <Image src="/pwa/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-2xl shadow-pink" />
          <div className="min-w-0 flex-1">
            <h2 id="install-sheet-title" className="text-lg font-black text-ink">역전토익 앱 설치</h2>
            <p className="text-sm text-slate">
              {plan.kind === "escape"
                ? `${plan.browserName}에서 설치할 수 있어요. 지금 옮겨 드릴게요.`
                : plan.kind === "guide"
                  ? `${plan.browserName}에서 ${plan.steps.length}번만 누르면 홈 화면에 생겨요.`
                  : "아래 버튼을 누르면 바로 설치돼요."}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="닫기"
            onClick={closeInstallSheet}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-brand-50"
          >
            <span aria-hidden className="absolute h-0.5 w-4 rotate-45 rounded bg-ink" />
            <span aria-hidden className="absolute h-0.5 w-4 -rotate-45 rounded bg-ink" />
          </button>
        </div>

        {/* 크롬이 기다리던 설치 신호를 보내면 그 자리에서 원터치 버튼으로 바뀐다 */}
        {canPrompt && (
          <button type="button" onClick={() => promptInstall()} className="btn-primary mt-4 w-full !py-3.5 text-base">
            <Icon name="download" size={22} className="brightness-0 invert" />
            지금 설치
          </button>
        )}

        {plan.kind !== "prompt" && (
          <>
            {plan.kind === "escape" && (
              <a href={plan.href} className="btn-primary mt-4 w-full !py-3.5 text-base">
                {plan.browserName}에서 열기
              </a>
            )}
            {plan.kind === "escape" && <p className="mt-3 text-xs font-semibold text-mist">자동으로 안 넘어가면 이렇게 해 주세요</p>}
            <ol className={cn("space-y-2", plan.kind === "escape" ? "mt-2" : "mt-4")}>
              {plan.steps.map((s, i) => (
                <li key={s.text} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-black text-white">{i + 1}</span>
                  <span className="flex-1 text-sm font-semibold leading-snug text-ink">{s.text}</span>
                  {s.glyph && (
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper ring-1 ring-line",
                        env.ios ? "text-[#0a84ff]" : "text-ink-soft",
                      )}
                    >
                      <BrowserGlyph glyph={s.glyph} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {plan.kind === "guide" && plan.note && <p className="mt-3 text-xs leading-relaxed text-slate">{plan.note}</p>}
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
