import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "회원가입",
  description: "역전토익 회원가입. 가입 후 수강증을 올리면 수강생으로 자동 등업됩니다.",
  robots: { index: false },
};

export default function SignupPage() {
  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Logo height={30} />
        <h1 className="text-xl font-black text-ink">회원가입</h1>
        <p className="text-sm text-slate">가입 후 수강증을 올리면 수강생으로 자동 등업됩니다.</p>
      </div>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-slate">
        이미 회원이신가요?{" "}
        <Link href="/login" className="font-bold text-brand-600 underline-offset-2 hover:underline">
          로그인
        </Link>
      </p>
    </>
  );
}
