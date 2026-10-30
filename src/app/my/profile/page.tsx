import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { loginLabel } from "@/lib/account";
import { pickPhoto, profilePhotoUrl } from "@/lib/avatar";
import { signedAvatarUrl } from "@/lib/avatar-url";
import { NON_DELETABLE_ROLES } from "@/lib/account-deletion";
import { ProfileForm } from "./ProfileForm";
import { AvatarEditor } from "./AvatarEditor";
import { DeleteAccount } from "./DeleteAccount";

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
 * 맨 아래 **회원 탈퇴** (2026-10-30 — 웹 · 앱 같은 자리. App Store 심사 5.1.1(v) 가 앱 안에서 찾기 쉬운 탈퇴를 요구한다). 강사 · 관리자 · 조교 계정은 안내만.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const [{ user, profile }, { name: suggested }] = await Promise.all([requireUser("/my/profile"), searchParams]);
  const supabase = await createClient();
  const { data: canRename } = await supabase.rpc("can_rename_self");
  const providers = (user.app_metadata as { providers?: string[] } | undefined)?.providers;
  // 프로필 사진 — 직접 올린 사진이 먼저, 없으면 카카오·구글 사진 (2026-10-02 Alan)
  const uploadedUrl = await signedAvatarUrl(supabase, profile?.avatar_path);
  const socialUrl = profilePhotoUrl(user.user_metadata);

  return (
    <div className="space-y-8">
      <PageHeader icon="profile" title="내 정보" description="프로필 사진 · 이름 · 연락처 · 학교 정보를 확인하고 고칩니다." />

      <Reveal>
        <section className="card p-5 sm:p-6">
          <h2 className="text-base font-black text-ink">프로필 사진</h2>
          <div className="mt-4">
            <AvatarEditor uid={user.id} photo={pickPhoto(uploadedUrl, socialUrl)} uploaded={!!uploadedUrl} social={!!socialUrl} />
          </div>
        </section>
      </Reveal>

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

      <Reveal delay={90}>
        <section className="card p-5 sm:p-6">
          <h2 className="text-base font-black text-ink">회원 탈퇴</h2>
          {NON_DELETABLE_ROLES.includes(profile?.role ?? "") ? (
            <p className="mt-2 text-sm text-slate">강사 · 관리자 · 조교 계정은 여기서 탈퇴할 수 없어요. 계정을 없애려면 관리자에게 말씀해 주세요.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate">탈퇴하면 계정과 이 사이트의 기록이 바로 모두 지워지고 되돌릴 수 없어요.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate">
                <li>내 정보(이름 · 연락처 · 학교)와 로그인 계정 — 하나로 합친 옛 계정도 함께</li>
                <li>등업신청 기록과 올린 수강증, 숙제 · 비대면 스터디 인증 사진과 음성</li>
                <li>출석 · 스터디 · 특강 신청 · 불라방 교재주문 · 알림 · 문의 · 수강생 설문</li>
              </ul>
              <p className="mt-2 text-xs text-mist">
                YBM 수강 등록은 그대로예요 — 이 사이트의 기록만 지워져요. 다시 쓰려면 새로 가입하고 수강증을 올리면 돼요. 배송 전인 교재주문도 함께 지워지니 받을 교재가
                있으면 받은 뒤에 탈퇴해 주세요.
              </p>
              <div className="mt-4">
                <DeleteAccount />
              </div>
            </>
          )}
        </section>
      </Reveal>
    </div>
  );
}
