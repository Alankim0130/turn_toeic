import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { formatDate, cn } from "@/lib/utils";
import { getMyVerifications, VERIFICATION_STATUS_LABEL } from "../_lib/queries";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = {
  title: "등업신청",
  robots: { index: false },
};

const STEPS: { icon: IconName; title: string; desc: string }[] = [
  { icon: "upload", title: "수강증 업로드", desc: "YBM에서 받은 수강증(영수증) 사진이나 PDF를 올립니다." },
  { icon: "target", title: "자동 대조", desc: "가입한 실명·강좌·시간대·수강료를 이번 달 개설 반과 대조합니다." },
  { icon: "success", title: "자동 등업", desc: "확인이 끝나면 수강생으로 전환되고 불라방·다시보기가 열립니다." },
];

export default async function VerifyPage() {
  const verifications = await getMyVerifications();

  return (
    <div className="space-y-8">
      <PageHeader icon="verify" title="등업신청" description="수강증을 올리면 배정된 반이 자동으로 확인됩니다." />

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

          <Reveal delay={80}>
            <section className="card border-brand-200 p-5">
              <h2 className="text-base font-black text-ink">개인정보 안내</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 font-bold text-slate">수집 항목</dt>
                  <dd className="text-ink">수강증 이미지, 이름, 영수증번호</dd>
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
              <p className="mt-3 text-xs text-mist">가입한 실명과 수강증의 이름이 다르면 등업이 반려됩니다. 영수증 1건은 1개 계정에만 사용할 수 있어요.</p>
            </section>
          </Reveal>
        </div>

        <Reveal delay={120} className="card p-5 sm:p-7">
          <h2 className="mb-4 text-base font-black text-ink">수강증 올리기</h2>
          <VerifyForm />
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
