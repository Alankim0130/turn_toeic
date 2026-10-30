import { AppleMark, GoogleMark, KakaoMark } from "@/components/ui/BrandMarks";

export type LoginButtonKind = "apple" | "kakao" | "google";

/**
 * 간편 로그인 버튼 모양 — 웹(`SocialLogin`)과 아이폰 앱(`AppLoginButtons`)이 함께 쓴다. 각 회사 디자인 가이드를 따른다.
 *  - 카카오: 노랑(#FEE500) 바탕 · 검정 심벌 · 검정 85% 글자 · 문구는 "카카오 로그인" / "카카오로 시작하기"
 *  - 구글: 흰 바탕 + 테두리 · 4색 G
 *  - Apple: 검정 바탕 · 흰 애플 로고 · 흰 글자 · 문구는 애플이 정한 한국어 "Apple로 로그인" / "Apple로 계속하기" (2026-10-30)
 * 모서리만 사이트의 둥근 버튼에 맞춘다 (세 가이드 모두 radius 조정은 허용한다).
 */
export const LOGIN_BUTTONS: Record<LoginButtonKind, { mark: React.ReactNode; login: string; signup: string; pending: string; className: string }> = {
  apple: {
    mark: <AppleMark size={18} />,
    login: "Apple로 로그인",
    signup: "Apple로 계속하기",
    pending: "Apple로 이동 중…",
    className: "!border-transparent !bg-black !text-white hover:!bg-black/85",
  },
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
