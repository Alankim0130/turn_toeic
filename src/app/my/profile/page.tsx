import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { loginLabel } from "@/lib/account";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = {
  title: "내 정보",
  robots: { index: false },
};

/**
 * 내 정보 (2026-10-02 Alan 요청 — "학생이 '내 정보' 수정을 할 수 있는 공간이 없는 것 같아").
 *
 * 휴대폰 · 대학 · 학과 · 성별은 언제든 고친다. **실명은 등업 전까지만** 본인이 고친다 (`can_rename_self` —
 * 승인된 수강증·등록이 생기면 잠기고 선생님이 고친다). 등업신청의 이름 불일치 안내가 `?name=수강증이름` 으로
 * 보내면 그 이름을 칸에 미리 넣어 준다. 로그인 이메일·방법은 여기서 바꾸지 않는다.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const [{ user, profile }, { name: suggested }] = await Promise.all([requireUser("/my/profile"), searchParams]);
  const supabase = await createClient();
  const { data: canRename } = await supabase.rpc("can_rename_self");
  const providers = (user.app_metadata as { providers?: string[] } | undefined)?.providers;

  return (
    <div className="space-y-8">
      <PageHeader icon="profile" title="내 정보" description="이름 · 연락처 · 학교 정보를 확인하고 고칩니다." />

      <Reveal>
        <section className="card p-5 sm:p-6">
          <h2 className="text-base font-black text-ink">로그인 정보</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-surface px-3 py-2">
              <dt className="text-xs font-bold text-slate">이메일</dt>
              <dd className="break-all font-semibold text-ink">{user.email ?? "없음"}</dd>
            </div>
            <div className="rounded-xl bg-surface px-3 py-2">
              <dt className="text-xs font-bold text-slate">로그인 방법</dt>
              <dd className="font-semibold text-ink">{loginLabel(providers) || "이메일"}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-mist">로그인 이메일과 방법은 여기서 바꿀 수 없어요. 계정이 여러 개라면 등업신청에서 하나로 합칠 수 있어요.</p>
        </section>
      </Reveal>

      <Reveal delay={60}>
        <section className="card p-5 sm:p-6">
          <h2 className="text-base font-black text-ink">기본 정보</h2>
          <div className="mt-4">
            <ProfileForm
              profile={{
                name: profile?.name ?? "",
                phone: profile?.phone ?? "",
                university: profile?.university ?? "",
                department: profile?.department ?? "",
                gender: profile?.gender ?? "",
              }}
              canRename={canRename === true}
              suggestedName={typeof suggested === "string" ? suggested.trim().slice(0, 20) : undefined}
            />
          </div>
        </section>
      </Reveal>
    </div>
  );
}
