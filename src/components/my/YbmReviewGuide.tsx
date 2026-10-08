import Image from "next/image";
import { Fragment, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { YBM_REVIEW_LINK_HINT } from "@/lib/lecture";
import { site } from "@/lib/site";

export const YBM_REVIEW_GUIDE_ID = "ybm-review-guide";

/**
 * 주소를 **경로의 `/` 뒤에서만** 줄바꿈한다 — 칸이 좁으면 `break-all` 은 `lessonV` / `iew` 처럼 낱말 가운데서 끊는다.
 * `https://` 의 두 `/` 사이에서는 끊지 않는다 (경로부터만 끊을 자리를 준다).
 */
export function BreakableUrl({ url }: { url: string }) {
  const parts = url.split("/");
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && "/"}
          {i >= 2 && i < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </>
  );
}

const STEPS: { title: string; body: ReactNode }[] = [
  { title: "YBM 홈페이지 로그인", body: "아래 버튼으로 YBM 홈페이지에 들어가 로그인해요." },
  { title: "마이페이지에서 후기 쓰기", body: "마이페이지의 '후기 작성하기'를 눌러 역전토익 수강후기를 써요." },
  {
    title: "후기 링크 복사",
    body: (
      <>
        다 쓴 내 후기를 열고 그 화면의 주소(링크)를 복사해요 —{" "}
        <span className="font-semibold text-ink">
          <BreakableUrl url={YBM_REVIEW_LINK_HINT} />
        </span>{" "}
        로 시작해요.
      </>
    ),
  },
  { title: "붙여 넣고 신청", body: "이 화면의 특강 카드에 링크를 붙여 넣고 '후기 링크 올리고 신청하기'를 눌러요." },
];

/**
 * YBM 수강후기 쓰는 법 (2026-10-08 Alan — "후기작성방법도 알려주면 좋을 것 같아. Ybm홈페이지 링크를 주고, 거기에서 마이페이지에서 작성하면 돼.
 * 후기작성하기가 안뜬다면 ybm홈페이지 회원가입을 안한거라서 1층 데스크에 내려가서 연동해달라고 얘기를 하면 돼").
 * 특강 신청(`/my/lecture`)에 후기 링크를 올려야 하는 특강(3주차 모의고사 — `needsReviewLink`)이 있을 때만 선다. 특강 카드의 `후기 쓰는 법` 이 여기로 온다.
 * 마이페이지 그림은 등업신청의 수강증 찾는 법(`ReceiptGuide`)과 같은 것이다 (Alan 이 준 YBM 홈페이지 첫 화면 — 아래 메뉴의 마이페이지).
 * YBM 화면 안의 후기 쓰기 · 링크 복사 단계는 이 작업 환경에서 YBM 홈페이지가 막혀 직접 보지 못하고 Alan 의 말대로 적었다 — 실제와 다르면 STEPS 만 고친다.
 * 링크의 꼴(`YBM_REVIEW_LINK_HINT`)은 Alan 이 보내 준 7월 학생들의 링크 화면에서 왔다 (2026-10-08).
 */
export function YbmReviewGuide() {
  return (
    <section id={YBM_REVIEW_GUIDE_ID} aria-labelledby="ybm-review-guide-title" className="card scroll-mt-24 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line bg-brand-50/70 px-5 py-4 sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper shadow-soft">
          <Icon name="tag-feedback" size={26} />
        </span>
        <div className="min-w-0">
          <h2 id="ybm-review-guide-title" className="text-lg font-black text-ink">
            YBM 수강후기 쓰는 법
          </h2>
          <p className="mt-0.5 text-sm text-slate">3주차 모의고사 특강은 YBM 홈페이지에 수강후기를 쓰고, 그 후기 링크를 올려야 신청돼요.</p>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
        <div className="min-w-0">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-black text-white">{i + 1}</span>
                <p className="min-w-0 text-slate">
                  <b className="text-ink">{s.title}</b> — {s.body}
                </p>
              </li>
            ))}
          </ol>

          {/* 후기 링크는 한 번만 (2026-10-08 Alan "후기막기") — DB 가 다른 학생의 링크 · 다른 달에 쓴 내 링크를 막는다 (`reviewLinkKey`) */}
          <p className="mt-4 rounded-xl bg-surface px-3 py-2 text-xs text-slate">
            <b className="text-ink">후기 링크는 한 번만 쓸 수 있어요.</b> 다른 학생의 후기 링크나 예전 달에 쓴 내 링크로는 신청이 안 돼요 — 그 달 후기를 새로 써서 올려 주세요.
          </p>

          <a href={site.academy.ybmHomeUrl} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5 w-full !py-2.5 sm:w-auto">
            YBM 홈페이지 열기
          </a>

          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-black text-amber-900">
              <Icon name="warning" size={18} />
              &apos;후기 작성하기&apos;가 안 보여요?
            </p>
            <p className="mt-1 text-amber-900/90">
              YBM 홈페이지 회원가입(연동)이 안 된 거예요. <b className="text-amber-950">1층 데스크에 내려가서 연동해 달라고</b> 말씀해 주세요.
            </p>
          </div>
        </div>

        <figure>
          <Image
            src="/guides/ybm-mypage.webp"
            alt="YBM 홈페이지 첫 화면 — 아래 메뉴의 마이페이지를 빨간 화살표로 표시"
            width={600}
            height={851}
            unoptimized
            className="mx-auto h-auto w-full max-w-[16rem] rounded-xl border border-line shadow-soft"
          />
          <figcaption className="mt-2 text-center text-xs text-mist">YBM 홈페이지 첫 화면 → 아래 메뉴의 마이페이지</figcaption>
        </figure>
      </div>
    </section>
  );
}
