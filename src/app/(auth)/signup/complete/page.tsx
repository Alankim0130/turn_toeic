import type { Metadata } from "next";
import { safeNextPath } from "@/lib/safe-next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { COMPLETE_PROFILE_PATH, PROFILE_UNREADABLE, getSessionProfile, isProfileIncomplete } from "@/lib/auth";
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
  const [{ next }, { user, profile, profileError }] = await Promise.all([searchParams, getSessionProfile()]);
  const target = safeNextPath(next);
  if (!user) redirect(`/login?next=${encodeURIComponent(COMPLETE_PROFILE_PATH)}`);
  // 프로필을 못 읽었으면 빈 칸을 내밀지 않는다 — 가입을 마친 사람이 이름 칸이 비어 있는 것을 보게 된다 (2026-10-29 점검)
  if (profileError) throw new Error(PROFILE_UNREADABLE);
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
