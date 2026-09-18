import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { IdentityConfirmForm } from "@/components/my/IdentityConfirmForm";
import { MergePanel, type MergeCandidate, type MergeRequest } from "./MergePanel";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "내 계정",
  robots: { index: false },
};

/**
 * 내 계정 — 이름·전화번호 확인과 계정 통합 (2026-09-18 Alan 요청).
 *
 * 같은 사람이 계정을 여러 개 만들면 숙제·수강 기록이 흩어진다. 이름·전화번호가 같은 계정을 찾아
 * **하나로 합치고**, 기록은 남길 계정으로 전부 옮긴다. 남의 기록을 가져가지 못하도록
 * **두 계정 모두에 로그인할 수 있어야** 합쳐진다 (신청한 쪽이 아닌 계정에서 확인).
 */
export default async function AccountPage() {
  const { user, profile } = await requireUser("/my/account");
  const supabase = await createClient();
  const confirmed = Boolean(profile?.identity_confirmed_at);

  const { data: requests } = await supabase
    .from("account_merge_requests")
    .select("id, from_user, to_user, requested_by, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  let candidates: MergeCandidate[] = [];
  if (confirmed) {
    const { data } = await supabase.rpc("merge_candidates");
    candidates = (data ?? []) as MergeCandidate[];
  }

  return (
    <div className="space-y-8">
      <PageHeader icon="verify" title="내 계정" description="이름·전화번호를 확인하고, 계정이 여러 개면 하나로 합칩니다." />

      <Reveal>
        <section className="card p-5 sm:p-6">
          <h2 className="text-base font-black text-ink">이름·전화번호 확인</h2>
          <p className="mt-1 text-sm text-slate">
            같은 이름을 쓰는 수강생이 있어서, 전화번호까지 있어야 누구의 수강증인지 정확히 가릅니다.
          </p>
          {confirmed && (
            <p className="mt-3 rounded-xl bg-surface p-3 text-sm text-ink">
              <b>{profile?.name}</b> · {profile?.phone ?? "전화번호 없음"}
              <span className="ml-2 text-mist">
                {formatDate(profile!.identity_confirmed_at!, { month: "long", day: "numeric" })} 확인함
              </span>
            </p>
          )}
          <div className="mt-4">
            <IdentityConfirmForm phone={profile?.phone ?? null} done={confirmed} />
          </div>
        </section>
      </Reveal>

      <Reveal delay={60}>
        <section className="card p-5 sm:p-6">
          <h2 className="text-base font-black text-ink">계정 합치기</h2>
          {!confirmed ? (
            <p className="mt-2 text-sm text-slate">먼저 위에서 이름·전화번호를 확인해 주세요.</p>
          ) : candidates.length === 0 && (requests ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-slate">같은 이름·전화번호로 만든 다른 계정이 없어요. 합칠 것이 없습니다.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate">
                합치면 <b>숙제 제출, 스터디·특강 신청, 교재주문, 수강 등록과 반 배정</b>이 남길 계정으로 모두 옮겨집니다.
                남지 않는 계정은 기록을 보존한 채 로그인만 막힙니다.
              </p>
              <div className="mt-4">
                <MergePanel me={user.id} candidates={candidates} requests={(requests ?? []) as MergeRequest[]} />
              </div>
            </>
          )}
        </section>
      </Reveal>
    </div>
  );
}
