import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "로그인",
  description: "역전토익 수강생 페이지 로그인",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Logo height={30} />
        <h1 className="text-xl font-black text-ink">로그인</h1>
        <p className="text-sm text-slate">등업신청 · 불라방 · 다시보기는 로그인 후 이용할 수 있어요.</p>
      </div>
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
