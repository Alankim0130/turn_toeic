import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { formatDate, cn, todayKST } from "@/lib/utils";
import { getMyVerifications, getOpenEnrollSections, VERIFICATION_STATUS_LABEL } from "../_lib/queries";
import { heldMonth } from "@/lib/verify-decision";
import { VerifyForm } from "./VerifyForm";
import { NoReceiptCard } from "./NoReceiptCard";
import { ForgeryNotice } from "./ForgeryNotice";
import { ReceiptGuide } from "./ReceiptGuide";
import { getLastSignInAt, getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IdentityConfirmForm } from "@/components/my/IdentityConfirmForm";
import { MergePanel, type ChoiceAccount, type MeInfo, type MergeCandidate, type MergeRequest } from "../account/MergePanel";
import { getMyMergeRequests } from "../_lib/queries";
import { RETENTION_LABEL } from "@/lib/receipt-retention";

/**
 * 이 페이지 함수 안에서 수강증 OCR 서버 액션이 돈다. Vercel 기본 제한(요금제에 따라 10초)에 걸리지 않게 늘린다 —
 * OCR 은 로컬 실측 3초지만 첫 호출은 언어 데이터 내려받기(2.2MB)·wasm 준비가 더 걸린다 (`src/lib/ocr.ts` 의 30초 타임아웃보다 길게)
 */
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "등업신청",
  robots: { index: false },
};

export default async function VerifyPage() {
  const [verifications, sections, { user, profile }, canRename] = await Promise.all([
    getMyVerifications(),
    getOpenEnrollSections(),
    getSessionProfile(),
    // 등업 전이면 이름을 본인이 고칠 수 있다 — 이름 불일치 안내가 "내 정보에서 고치기" 로 보낸다 (2026-10-02 Alan)
    createClient().then((s) => s.rpc("can_rename_self")).then((r) => r.data === true),
  ]);

  // 수강증을 낸 뒤 이름·전화번호를 한 번 확인받는다 (2026-09-18 Alan — 동명이인 방지)
  const confirmed = Boolean(profile?.identity_confirmed_at);
  const needsIdentity = verifications.length > 0 && !confirmed;

  // 확인이 끝나면 **같은 이름·전화번호 계정을 바로 여기서** 보여 준다 (2026-09-19 Alan —
  // "수강증 업로드 → 개인정보 기입 → 이름·전화번호 일치시 계정합치기 안내 및 하나의 계정 선택").
  // 합칠 것이 없으면 아무것도 그리지 않는다 — 계정이 하나뿐인 학생에게는 없는 이야기다.
  // 스태프가 보낸 "남길 계정 고르기"(choice)는 확인 전에도 보인다 (2026-10-02 Alan) — 요청은 늘 읽는다
  const supabase = await createClient();
  const [pending, { data: candidateRows }, lastSignIn] = await Promise.all([
    getMyMergeRequests(),
    confirmed ? supabase.rpc("merge_candidates") : Promise.resolve({ data: null }),
    // 마지막 로그인 시각은 접속 토큰에 없다 — 로그인 서버에 따로 묻는다 (getLastSignInAt)
    user ? getLastSignInAt() : null,
  ]);
  const requests = pending as MergeRequest[];
  const candidates: MergeCandidate[] = (candidateRows ?? []) as MergeCandidate[];
  const choiceRequest = requests.find((r) => r.status === "choice") ?? null;
  const { data: choiceRows } = choiceRequest ? await supabase.rpc("merge_choice_info", { p_request: choiceRequest.id }) : { data: null };
  const choice = choiceRequest && choiceRows?.length ? { request: choiceRequest, accounts: choiceRows as ChoiceAccount[] } : null;
  const showMerge = profile != null && (requests.length > 0 || (confirmed && candidates.length > 0));
  const meInfo: MeInfo = { providers: ((user?.app_metadata as { providers?: string[] } | undefined)?.providers ?? []), last_sign_in_at: lastSignIn };

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
              {choice ? <b>선생님이 같은 사람의 계정 두 개를 확인했어요.</b> : <b>이름과 전화번호가 같은 계정을 찾았어요.</b>} 하나로 합치면 숙제 제출 · 스터디 · 특강 신청 · 교재주문 · 수강 등록과 반 배정이
              <b> 남길 계정으로 모두 옮겨집니다.</b> 남지 않는 계정은 기록을 그대로 둔 채 로그인만 막혀요.
            </p>
            <div className="mt-4">
              <MergePanel me={profile.id} meInfo={meInfo} today={todayKST()} candidates={candidates} requests={requests} choice={choice} />
            </div>
          </section>
        </Reveal>
      )}

      {/* 무엇을 올리나 — 파란색 수강증 (2026-09-30 Alan "파란색 수강증을 올리는게 가장 중요해!"). 폼 앞, 한 줄 전체 */}
      <Reveal>
        <ReceiptGuide />
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          {/* 위조 수강증 법적 조치 안내 (2026-10-03 Alan) — 예전 "이렇게 진행돼요" 카드 자리. 모든 학생에게 같은 글이다 */}
          <Reveal>
            <ForgeryNotice />
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
                  <dd className="text-ink">인증이 끝나고 {RETENTION_LABEL} 뒤 원본 파일을 삭제합니다</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-mist">가입한 실명과 수강증의 이름이 다르면 자동으로 등업되지 않고 선생님이 확인해요. 수강증 1건은 1개 계정에만 사용할 수 있어요.</p>
            </section>
          </Reveal>
        </div>

        <Reveal delay={120} className="card p-5 sm:p-7">
          <h2 className="mb-4 text-base font-black text-ink">수강증 올리기</h2>
          <VerifyForm sections={sections} canRename={canRename} />
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
                  {v.result === "closed" && v.reject_reason && <span className="text-mist">{v.reject_reason}</span>}
                  {v.result === null && (
                    <span className="text-mist">
                      {heldMonth(v.hold) != null ? `${heldMonth(v.hold)}월 반이 열리면 배정돼요` : "보통 1일 이내 처리"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Reveal>
    </div>
  );
}
