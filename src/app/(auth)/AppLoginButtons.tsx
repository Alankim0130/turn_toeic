"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { appCallbackPath } from "@/lib/app-login";
import { APP_CALLBACK_SCHEME, appErrorCode, appPlugin, type WinnerToeicPlugin } from "@/lib/native-app";
import { cn } from "@/lib/utils";
import { signInWithAppleApp, startAppSocialLogin } from "./actions";
import { LOGIN_BUTTONS, type LoginButtonKind } from "./login-buttons";

const OLD_APP = "앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.";
const APPLE_FAILED = "Apple 로그인을 마치지 못했어요. 다시 시도하거나 다른 방법으로 로그인해 주세요.";
const SOCIAL_FAILED = "로그인을 마치지 못했어요. 다시 시도하거나 이메일로 로그인해 주세요.";

/** nonce 원래 값 — 서버에 주고, 애플에는 그 SHA-256 을 준다 (Supabase 가 대조한다 · `src/lib/apple-auth.ts`) */
function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 아이폰 앱의 간편 로그인 버튼 (2026-10-30) — 앱 안에서만 그린다 (`SocialLogin` 이 `isAppRequest` 로 가른다). 웹 버튼은 그대로다.
 * - Apple: 아이폰의 Apple 로그인 창(`WinnerToeicPlugin.signInWithApple`) → 서버 액션 `signInWithAppleApp`
 * - 카카오 · 구글: 앱 안 브라우저 창(`openAuthSession`) → 앱 주소로 돌아온 code 를 `/auth/callback` 으로 (`src/lib/app-login.ts`)
 * 끝나면 그 주소를 새로 연다 — 루트 레이아웃이 로그인한 사람으로 다시 그린다.
 */
export function AppLoginButtons({ kinds, next, mode }: { kinds: LoginButtonKind[]; next?: string; mode: "login" | "signup" }) {
  const [busy, setBusy] = useState<LoginButtonKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: LoginButtonKind) {
    if (busy) return;
    const plugin = appPlugin<WinnerToeicPlugin>("WinnerToeic");
    if (!plugin) {
      setError(OLD_APP);
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      if (kind === "apple") {
        const nonce = randomNonce();
        const apple = await plugin.signInWithApple({ nonce: await sha256Hex(nonce) });
        const result = await signInWithAppleApp({
          identityToken: apple.identityToken,
          authorizationCode: apple.authorizationCode ?? null,
          nonce,
          givenName: apple.givenName ?? null,
          familyName: apple.familyName ?? null,
          next: next ?? null,
        });
        if (!result.ok) throw new Error(result.error);
        window.location.assign(result.to);
        return;
      }
      const start = await startAppSocialLogin(kind, next ?? null);
      if (!start.ok) throw new Error(start.error);
      const { url } = await plugin.openAuthSession({ url: start.url, scheme: APP_CALLBACK_SCHEME });
      const path = appCallbackPath(url);
      if (!path) throw new Error(SOCIAL_FAILED);
      window.location.assign(path);
    } catch (e) {
      setBusy(null);
      if (appErrorCode(e) === "canceled") return; // 사용자가 닫았다 — 말없이 그대로
      const message = e instanceof Error && /[가-힣]/.test(e.message) ? e.message : kind === "apple" ? APPLE_FAILED : SOCIAL_FAILED;
      setError(message);
    }
  }

  return (
    <div className="space-y-2">
      {error && <Alert kind="warning">{error}</Alert>}
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => void run(kind)}
          disabled={busy !== null}
          aria-busy={busy === kind}
          className={cn("btn-secondary w-full", LOGIN_BUTTONS[kind].className, busy !== null && busy !== kind && "opacity-60")}
        >
          {LOGIN_BUTTONS[kind].mark}
          {busy === kind ? (kind === "apple" ? "Apple 로그인 중…" : LOGIN_BUTTONS[kind].pending) : LOGIN_BUTTONS[kind][mode]}
        </button>
      ))}
    </div>
  );
}
