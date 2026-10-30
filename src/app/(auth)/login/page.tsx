import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Logo } from "@/components/ui/Logo";
import { appleWebReady } from "@/lib/apple-auth";
import { getSocialLogins } from "@/lib/auth-providers";
import { isAppRequest } from "@/lib/native-app-server";
import { SocialLogin } from "../SocialLogin";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "로그인",
  description: "역전토익 수강생 페이지 로그인",
  robots: { index: false },
};

/** 콜백·간편 로그인이 실패해 돌아올 때의 안내 (`?error=`) */
const LOGIN_ERRORS: Record<string, string> = {
  auth: "로그인이 취소됐거나 실패했어요. 다시 시도해 주세요.",
  social: "간편 로그인이 아직 준비되지 않았어요. 이메일로 로그인해 주세요.",
  // 카카오에서 이메일 제공에 동의하지 않으면 계정을 만들 수 없다 (이메일로 기존 계정과 이어 붙인다)
  email: "이메일 제공에 동의해야 로그인할 수 있어요. 다시 시도해서 이메일 항목에 동의해 주세요.",
  apple: "Apple 로그인을 마치지 못했어요. 다시 시도하거나 다른 방법으로 로그인해 주세요.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; bye?: string }> }) {
  const [{ next, error, bye }, social, inApp] = await Promise.all([searchParams, getSocialLogins(), isAppRequest()]);
  const notice = error ? LOGIN_ERRORS[error] : undefined;
  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Logo height={30} />
        <h1 className="text-xl font-black text-ink">로그인</h1>
        <p className="text-sm text-slate">등업신청 · 불라방 · 다시보기는 로그인 후 이용할 수 있어요.</p>
      </div>
      {notice && <Alert kind="warning" className="mb-4">{notice}</Alert>}
      {/* 회원 탈퇴 뒤 (`deleteMyAccount`) */}
      {bye === "1" && <Alert kind="success" className="mb-4">탈퇴가 끝났어요. 계정과 기록을 모두 지웠어요. 그동안 이용해 주셔서 고마워요.</Alert>}
      <SocialLogin enabled={social} appleWeb={appleWebReady()} inApp={inApp} next={next} mode="login" />
      <LoginForm next={next} />
      <p className="mt-6 text-center text-sm text-slate">
        아직 회원이 아니신가요?{" "}
        <Link href="/signup" className="font-bold text-brand-600 underline-offset-2 hover:underline">
          회원가입
        </Link>
      </p>
    </>
  );
}
