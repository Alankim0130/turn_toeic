import { SubmitButton } from "@/components/ui/SubmitButton";
import { SOCIAL_PROVIDERS, type LoginOptions } from "@/lib/social";
import { cn } from "@/lib/utils";
import { signInWithAppleWeb, signInWithSocial } from "./actions";
import { AppLoginButtons } from "./AppLoginButtons";
import { LOGIN_BUTTONS, type LoginButtonKind } from "./login-buttons";

/**
 * 간편 로그인 버튼들 (2026-09-17 Alan 요청 — 구글 · 카카오 → 2026-10-30 Apple). 로그인·회원가입 화면이 같이 쓴다.
 * Supabase 에 켜져 있는 것만 그린다 (`getSocialLogins`) — 하나도 없으면 아무것도 그리지 않는다.
 * - 웹: 서버 액션 `signInWithSocial` 이 그 회사 로그인 화면으로 보내고 /auth/callback 이 받는다. Apple 은 `signInWithAppleWeb` →
 *   `/auth/apple/callback` 이고, 애플 키 · Services ID 가 있어야 그린다(`appleWeb`). **맨 뒤에** 둔다 (수강생 대부분이 카카오를 쓴다)
 * - 아이폰 앱(`inApp`): `AppLoginButtons` — Apple 을 **맨 앞에** 둔다 (App Store 심사 4.8 — 다른 간편 로그인과 같은 무게의 선택지)
 */
export function SocialLogin({
  enabled,
  appleWeb,
  inApp,
  next,
  mode,
}: {
  enabled: LoginOptions;
  appleWeb: boolean;
  inApp: boolean;
  next?: string;
  mode: "login" | "signup";
}) {
  const social: LoginButtonKind[] = SOCIAL_PROVIDERS.filter((p) => enabled[p]);
  const kinds: LoginButtonKind[] = inApp
    ? [...(enabled.apple ? (["apple"] as const) : []), ...social]
    : [...social, ...(enabled.apple && appleWeb ? (["apple"] as const) : [])];
  if (kinds.length === 0) return null;

  return (
    <>
      {inApp ? (
        <AppLoginButtons kinds={kinds} next={next} mode={mode} />
      ) : (
        <div className="space-y-2">
          {kinds.map((p) => (
            <form key={p} action={p === "apple" ? signInWithAppleWeb : signInWithSocial}>
              {p !== "apple" && <input type="hidden" name="provider" value={p} />}
              {next && <input type="hidden" name="next" value={next} />}
              <SubmitButton variant="secondary" className={cn("w-full sm:w-full", LOGIN_BUTTONS[p].className)} pendingText={LOGIN_BUTTONS[p].pending}>
                {LOGIN_BUTTONS[p].mark}
                {LOGIN_BUTTONS[p][mode]}
              </SubmitButton>
            </form>
          ))}
        </div>
      )}
      {mode === "signup" && <p className="mt-2 text-center text-xs text-mist">간편 가입은 실명과 연락처만 추가로 적어요.</p>}
      <OrDivider>{mode === "signup" ? "또는 이메일로 가입" : "또는 이메일로"}</OrDivider>
    </>
  );
}

/** 간편 로그인 버튼과 이메일 폼 사이의 "또는" 줄 */
export function OrDivider({ children = "또는 이메일로" }: { children?: React.ReactNode }) {
  return (
    <div role="separator" className="my-5 flex items-center gap-3 text-xs font-semibold text-mist">
      <span aria-hidden className="h-px flex-1 bg-line" />
      {children}
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}
