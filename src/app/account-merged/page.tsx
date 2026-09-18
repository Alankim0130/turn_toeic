import type { Metadata } from "next";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubmitButton } from "@/components/ui/SubmitButton";

export const metadata: Metadata = {
  title: "계정이 합쳐졌어요",
  robots: { index: false },
};

/**
 * 통합되어 비워진 계정으로 들어왔을 때 (2026-09-18 Alan: 옛 계정은 "로그인만 막고 보존").
 * 기록은 지우지 않았고 남은 계정에 있다. 여기서는 로그아웃만 안내한다.
 * **requireUser 를 쓰지 않는다** — 이 화면이 바로 그 리다이렉트의 도착지다.
 */
export default async function AccountMergedPage() {
  const { profile } = await getSessionProfile();

  return (
    <div className="container-x py-10">
      <PageHeader icon="verify" title="계정이 합쳐졌어요" description="이 계정의 기록은 합친 계정으로 모두 옮겨졌습니다." />

      <section className="card mt-6 max-w-xl p-5 sm:p-6">
        <p className="text-sm text-ink">
          {profile?.name ? <b>{profile.name}</b> : "이 계정"}님의 숙제·스터디·특강 신청, 교재주문, 수강 기록은 <b>합친 계정</b>에 있습니다.
          이 계정으로는 더 이상 이용할 수 없어요.
        </p>
        <p className="mt-2 text-sm text-slate">로그아웃한 뒤 합친 계정으로 로그인해 주세요. 어느 계정인지 모르겠다면 강사에게 문의해 주세요.</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <form action={signOut}>
            <SubmitButton pendingText="로그아웃 중…">로그아웃하고 다시 로그인</SubmitButton>
          </form>
          <Link href="/contact" className="btn-secondary">문의하기</Link>
        </div>
      </section>
    </div>
  );
}
