import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { COMPLETE_PROFILE_PATH, getSessionProfile, isProfileIncomplete } from "@/lib/auth";
import { CompleteProfileForm } from "./CompleteProfileForm";

export const metadata: Metadata = {
  title: "가입 정보 입력",
  robots: { index: false },
};

/**
 * 구글 계정으로 처음 들어온 회원의 가입 정보 입력 (2026-09-17 Alan 요청).
 * 가입 트리거가 외부 로그인에는 이름을 비워 두므로 여기서 실명·휴대폰(대학·학과·성별은 선택)을 한 번 받는다.
 * requireUser() 가 미완성 계정을 여기로 보내므로 이 화면은 requireUser 를 쓰지 않는다 (되돌이 방지).
 */
export default async function CompleteProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, { user, profile }] = await Promise.all([searchParams, getSessionProfile()]);
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/my";
  if (!user) redirect(`/login?next=${encodeURIComponent(COMPLETE_PROFILE_PATH)}`);
  if (!isProfileIncomplete(profile)) redirect(target);

  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Logo height={30} />
        <h1 className="text-xl font-black text-ink">가입 정보 입력</h1>
        <p className="text-sm text-slate">
          {user.email ? (
            <>
              <span className="font-semibold text-ink">{user.email}</span> 계정으로 로그인했어요.
              <br />
            </>
          ) : null}
          수강증 대조에 쓰는 실명과 연락처를 적어 주세요.
        </p>
      </div>
      <CompleteProfileForm next={target} lockedName={profile?.name?.trim() ? profile.name : null} />
    </>
  );
}
