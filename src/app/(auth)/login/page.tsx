import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Logo } from "@/components/ui/Logo";
import { isGoogleLoginEnabled } from "@/lib/auth-providers";
import { GoogleButton, OrDivider } from "../GoogleButton";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "로그인",
  description: "역전토익 수강생 페이지 로그인",
  robots: { index: false },
};

/** 콜백·구글 로그인이 실패해 돌아올 때의 안내 (`?error=`) */
const LOGIN_ERRORS: Record<string, string> = {
  auth: "로그인이 취소됐거나 실패했어요. 다시 시도해 주세요.",
  google: "Google 로그인이 아직 준비되지 않았어요. 이메일로 로그인해 주세요.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const [{ next, error }, google] = await Promise.all([searchParams, isGoogleLoginEnabled()]);
  const notice = error ? LOGIN_ERRORS[error] : undefined;
  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Logo height={30} />
        <h1 className="text-xl font-black text-ink">로그인</h1>
        <p className="text-sm text-slate">등업신청 · 불라방 · 다시보기는 로그인 후 이용할 수 있어요.</p>
      </div>
      {notice && <Alert kind="warning" className="mb-4">{notice}</Alert>}
      {google && (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      )}
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
