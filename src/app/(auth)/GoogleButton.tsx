import { SubmitButton } from "@/components/ui/SubmitButton";
import { signInWithGoogle } from "./actions";

/**
 * 구글 "G" 마크. 구글 브랜드 가이드의 4색 마크를 그대로 쓴다 —
 * 외부 브랜드 표식이라 힉스필드 아이콘 규칙의 예외다 (강사 실사 사진과 같은 취급). 다른 곳에 쓰지 않는다.
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

/**
 * "Google 계정으로 계속하기" (2026-09-17 Alan 요청). 로그인·회원가입 화면이 같이 쓴다.
 * 구글 가이드대로 흰 바탕 + 테두리. 서버 액션이 구글로 보내고, 돌아오면 /auth/callback 이 받는다.
 * Supabase 에 구글이 켜져 있을 때만 그린다 (`isGoogleLoginEnabled`) — 화면이 판단한다.
 */
export function GoogleButton({ next, label = "Google 계정으로 계속하기" }: { next?: string; label?: string }) {
  return (
    <form action={signInWithGoogle}>
      {next && <input type="hidden" name="next" value={next} />}
      <SubmitButton variant="secondary" className="w-full sm:w-full !bg-white" pendingText="Google 로 이동 중…">
        <GoogleMark />
        {label}
      </SubmitButton>
    </form>
  );
}

/** 구글 버튼과 이메일 폼 사이의 "또는" 줄 */
export function OrDivider({ children = "또는 이메일로" }: { children?: React.ReactNode }) {
  return (
    <div role="separator" className="my-5 flex items-center gap-3 text-xs font-semibold text-mist">
      <span aria-hidden className="h-px flex-1 bg-line" />
      {children}
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}
