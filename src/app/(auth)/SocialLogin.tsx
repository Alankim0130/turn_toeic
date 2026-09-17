import { SubmitButton } from "@/components/ui/SubmitButton";
import { SOCIAL_PROVIDERS, type SocialLogins, type SocialProvider } from "@/lib/social";
import { cn } from "@/lib/utils";
import { signInWithSocial } from "./actions";

/**
 * 구글 "G" 마크 · 카카오 말풍선 심벌. 외부 브랜드 표식이라 각 회사 가이드의 모양·색을 그대로 쓴다 —
 * 힉스필드 아이콘 규칙의 예외다 (강사 실사 사진과 같은 취급). 로그인 버튼 밖에서는 쓰지 않는다.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width={20} height={20} aria-hidden className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function KakaoMark() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden className="shrink-0">
      <path
        fill="#000000"
        d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.87 5.33 4.68 6.74l-.96 3.53c-.09.32.27.57.55.39l4.2-2.78c.5.06 1.01.1 1.53.1 5.52 0 10-3.58 10-7.98S17.52 3 12 3z"
      />
    </svg>
  );
}

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
