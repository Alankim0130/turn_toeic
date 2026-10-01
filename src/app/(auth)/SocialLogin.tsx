import { SubmitButton } from "@/components/ui/SubmitButton";
import { SOCIAL_PROVIDERS, type SocialLogins, type SocialProvider } from "@/lib/social";
import { cn } from "@/lib/utils";
import { signInWithSocial } from "./actions";

// 구글 G · 카카오 심벌은 BrandMarks 한곳 — 카카오톡 상담 버튼(`KakaoChatButton`)과 함께 쓴다 (2026-10-01)
import { GoogleMark, KakaoMark } from "@/components/ui/BrandMarks";

/**
 * 버튼 모양은 각 회사 디자인 가이드를 따른다.
 *  - 카카오: 노랑(#FEE500) 바탕 · 검정 심벌 · 검정 85% 글자 · 문구는 "카카오 로그인" / "카카오로 시작하기"
 *  - 구글: 흰 바탕 + 테두리 · 4색 G
 * 모서리만 사이트의 둥근 버튼에 맞춘다 (두 가이드 모두 radius 조정은 허용한다).
 */
const BUTTONS: Record<SocialProvider, { mark: React.ReactNode; login: string; signup: string; pending: string; className: string }> = {
  kakao: {
    mark: <KakaoMark />,
    login: "카카오 로그인",
    signup: "카카오로 시작하기",
    pending: "카카오로 이동 중…",
    className: "!border-transparent !bg-[#FEE500] !text-black/85 hover:!bg-[#F2DA00]",
  },
  google: {
    mark: <GoogleMark />,
    login: "Google 계정으로 계속하기",
    signup: "Google 계정으로 가입하기",
    pending: "Google 로 이동 중…",
    className: "!bg-white",
  },
};

/**
 * 간편 로그인 버튼들 (2026-09-17 Alan 요청 — 구글 · 카카오). 로그인·회원가입 화면이 같이 쓴다.
 * Supabase 에 켜져 있는 것만 그린다 (`getSocialLogins`) — 하나도 없으면 아무것도 그리지 않는다.
 * 서버 액션 `signInWithSocial` 이 그 회사 로그인 화면으로 보내고, 돌아오면 /auth/callback 이 받는다.
 */
export function SocialLogin({ enabled, next, mode }: { enabled: SocialLogins; next?: string; mode: "login" | "signup" }) {
  const shown = SOCIAL_PROVIDERS.filter((p) => enabled[p]);
  if (shown.length === 0) return null;

  return (
    <>
      <div className="space-y-2">
        {shown.map((p) => (
          <form key={p} action={signInWithSocial}>
            <input type="hidden" name="provider" value={p} />
            {next && <input type="hidden" name="next" value={next} />}
            <SubmitButton variant="secondary" className={cn("w-full sm:w-full", BUTTONS[p].className)} pendingText={BUTTONS[p].pending}>
              {BUTTONS[p].mark}
              {BUTTONS[p][mode]}
            </SubmitButton>
          </form>
        ))}
      </div>
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
