import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { formatDate, cn } from "@/lib/utils";
import { getMyVerifications, getOpenEnrollSections, VERIFICATION_STATUS_LABEL } from "../_lib/queries";
import { VerifyForm } from "./VerifyForm";
import { NoReceiptCard } from "./NoReceiptCard";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IdentityConfirmForm } from "@/components/my/IdentityConfirmForm";
import { MergePanel, type MergeCandidate, type MergeRequest } from "../account/MergePanel";
import { getMyMergeRequests } from "../_lib/queries";

/**
 * 이 페이지 함수 안에서 수강증 OCR 서버 액션이 돈다. Vercel 기본 제한(요금제에 따라 10초)에 걸리지 않게 늘린다 —
 * OCR 은 로컬 실측 3초지만 첫 호출은 언어 데이터 내려받기(2.2MB)·wasm 준비가 더 걸린다 (`src/lib/ocr.ts` 의 30초 타임아웃보다 길게)
 */
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "등업신청",
  robots: { index: false },
};

const STEPS: { icon: IconName; title: string; desc: string }[] = [
  { icon: "upload", title: "수강증 업로드", desc: "YBM 홈페이지·앱에서 보이는 수강증 화면을 캡처해 올립니다. 결제 영수증은 받지 않아요." },
  { icon: "target", title: "확인", desc: "역전토익 수강증이 맞는지, 이번 달 수강증이 맞는지 확인합니다. 아니면 이유를 적어 바로 알려드려요." },
  // 흐름은 업로드 → 이름·전화번호 → (같은 사람 계정이 있으면) 합치기 다 (2026-09-19 Alan)
  { icon: "profile", title: "이름·전화번호 확인", desc: "같은 이름을 쓰는 수강생이 있어서 한 번 더 확인합니다. 같은 사람의 계정이 여러 개면 여기서 하나로 합쳐요." },
  { icon: "success", title: "등업", desc: "확인이 끝나면 수강생으로 전환되고 불라방·다시보기가 열립니다." },
];

export default async function VerifyPage() {
  const [verifications, sections, { profile }] = await Promise.all([getMyVerifications(), getOpenEnrollSections(), getSessionProfile()]);

  // 수강증을 낸 뒤 이름·전화번호를 한 번 확인받는다 (2026-09-18 Alan — 동명이인 방지)
  const confirmed = Boolean(profile?.identity_confirmed_at);
  const needsIdentity = verifications.length > 0 && !confirmed;

  // 확인이 끝나면 **같은 이름·전화번호 계정을 바로 여기서** 보여 준다 (2026-09-19 Alan —
  // "수강증 업로드 → 개인정보 기입 → 이름·전화번호 일치시 계정합치기 안내 및 하나의 계정 선택").
  // 합칠 것이 없으면 아무것도 그리지 않는다 — 계정이 하나뿐인 학생에게는 없는 이야기다.
  let candidates: MergeCandidate[] = [];
  let requests: MergeRequest[] = [];
  if (confirmed) {
    const supabase = await createClient();
    const [{ data }, pending] = await Promise.all([supabase.rpc("merge_candidates"), getMyMergeRequests()]);
    candidates = (data ?? []) as MergeCandidate[];
    requests = pending as MergeRequest[];
  }
  const showMerge = confirmed && profile != null && (candidates.length > 0 || requests.length > 0);

  return (
    <div className="space-y-8">
      <PageHeader icon="verify" title="등업신청" description="수강증을 올리면 강사가 확인해 반을 배정합니다. 확인이 잘못됐다면 반을 직접 골라 다시 낼 수 있어요." />

      {needsIdentity && (
        <Reveal>
          <section className="card border-brand-200 p-5 sm:p-6">
            <h2 className="text-base font-black text-ink">이름·전화번호 확인</h2>
            <p className="mt-1 text-sm text-slate">
              수강증을 받았어요. 같은 이름을 쓰는 수강생이 있어서, <b>가입할 때 적은 이름과 전화번호</b>를 한 번 더 확인합니다.
            </p>
            <div className="mt-4">
              <IdentityConfirmForm phone={profile?.phone ?? null} />
            </div>
          </section>
        </Reveal>
      )}

      {showMerge && (
        <Reveal>
          <section className="card border-brand-200 p-5 sm:p-6">
            <h2 className="text-base font-black text-ink">계정이 하나 더 있어요</h2>
            <p className="mt-1 text-sm text-slate">
              <b>이름과 전화번호가 같은 계정</b>을 찾았어요. 하나로 합치면 숙제 제출 · 스터디 · 특강 신청 · 교재주문 · 수강 등록과 반 배정이
              <b> 남길 계정으로 모두 옮겨집니다.</b> 남지 않는 계정은 기록을 그대로 둔 채 로그인만 막혀요.
            </p>
            <div className="mt-4">
              <MergePanel me={profile.id} candidates={candidates} requests={requests} />
            </div>
          </section>
        </Reveal>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          <Reveal>
            <section className="card p-5">
              <h2 className="text-base font-black text-ink">이렇게 진행돼요</h2>
              <ol className="mt-3 space-y-3">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                      <Icon name={s.icon} size={24} />
                    </span>
                    <div className="text-sm">
                      <p className="font-black text-ink">
                        {i + 1}. {s.title}
                      </p>
                      <p className="text-slate">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </Reveal>

          {/* 수강증이 아예 없는 학생 (YBM 미가입) — 회원가입 → 데스크 계정 연동 안내 */}
          <Reveal delay={60}>
            <NoReceiptCard />
          </Reveal>

          <Reveal delay={120}>
            <section className="card border-brand-200 p-5">
              <h2 className="text-base font-black text-ink">개인정보 안내</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 font-bold text-slate">수집 항목</dt>
                  <dd className="text-ink">수강증 이미지, 이름</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 font-bold text-slate">이용 목적</dt>
                  <dd className="text-ink">수강 여부 확인 및 반 배정</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 font-bold text-slate">보관</dt>
                  <dd className="text-ink">인증이 끝나면 원본 파일은 삭제됩니다</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-mist">가입한 실명과 수강증의 이름이 다르면 등업이 반려됩니다. 수강증 1건은 1개 계정에만 사용할 수 있어요.</p>
            </section>
          </Reveal>
        </div>

        <Reveal delay={120} className="card p-5 sm:p-7">
          <h2 className="mb-4 text-base font-black text-ink">수강증 올리기</h2>
          <VerifyForm sections={sections} />
        </Reveal>
      </div>

      <Reveal delay={160}>
        <section aria-labelledby="history-title" className="card p-5 sm:p-6">
          <h2 id="history-title" className="text-base font-black text-ink">내 신청 내역</h2>
          {verifications.length === 0 ? (
            <p className="mt-3 text-sm text-slate">아직 올린 수강증이 없어요.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {verifications.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                  <span className="text-slate">{formatDate(v.created_at, { year: "numeric", month: "long", day: "numeric" })}</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-black",
                      v.result === "approved" ? "bg-brand-500 text-white" : v.result === "rejected" ? "bg-amber-100 text-amber-800" : "bg-line text-slate",
                    )}
                  >
                    {VERIFICATION_STATUS_LABEL(v.result)}
                  </span>
                  {v.result === "rejected" && v.reject_reason && <span className="text-amber-800">사유: {v.reject_reason}</span>}
                  {v.result === null && <span className="text-mist">보통 1일 이내 처리</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Reveal>
    </div>
  );
}
