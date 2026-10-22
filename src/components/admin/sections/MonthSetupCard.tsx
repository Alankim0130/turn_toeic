import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MonthSetup } from "@/lib/month-setup";
import { openMonthClasses } from "@/app/admin/sections/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * 반 편성 달력 맨 위 '다음 할 일' (2026-10-22 Alan — 11월 달력을 저장해 두고 "11월 시간표 다 넣어놨는데 왜 안잡히는거야?").
 * 띄울지는 `monthSetup`(`src/lib/month-setup.ts`)이 정한다 — 반이 하나라도 생기면 사라진다.
 *
 * - **평달**: 달력을 저장하면 시간표 · 반이 저절로 생긴다 (같은 날 Alan "방학달 1,2,7,8월만 강사가 직접 반을 열어야하고 나머지는 자동으로").
 *   그래도 이 카드가 서는 평달(그 전에 저장해 둔 달 · 그때 못 연 달)은 **버튼 하나** — 같은 일을 한 번에 한다 (`openMonthClasses` → `autoOpenMonth`).
 * - **방학달(1 · 2 · 7 · 8월)**: 시간표가 해마다 달라 강사가 직접 — ① 시간표 만들기(과정 · 과목 고르기) ② 새 반 개설.
 */
export function MonthSetupCard({ month, termKey, setup, source }: { month: number; termKey: string; setup: MonthSetup; source: string | null }) {
  const timetableHref = `/admin/timetable?month=${termKey}`;
  const newHref = `/admin/sections/new?term=${termKey}`;
  const waiting =
    setup.held > 0 ? (
      <>
        받아 둔{" "}
        <b className="text-ink">
          {month}월 수강증 {setup.held}장
        </b>
        이 반을 기다리고 있어요.
      </>
    ) : (
      <>반이 없으면 {month}월 수강증을 올린 학생이 반에 배정되지 않아요.</>
    );

  if (setup.auto) {
    return (
      <section aria-labelledby="month-setup-title" className="rounded-xl2 border border-amber-200 bg-amber-50 p-4 sm:p-5">
        <h2 id="month-setup-title" className="text-base font-black text-ink">
          {month}월 반이 아직 없어요
        </h2>
        <p className="mt-1 text-sm text-slate">
          평달은 달력을 저장하면 시간표와 반이 저절로 만들어져요. 이 달은 그 전에 저장했거나 그때 만들지 못해서 아직이에요 — 아래 버튼을 한 번만 누르세요.{" "}
          {waiting}
        </p>
        <form action={openMonthClasses} className="mt-3">
          <input type="hidden" name="term" value={termKey} />
          <SubmitButton pendingText="만드는 중…">{month}월 시간표 · 반 한 번에 만들기</SubmitButton>
        </form>
        {!setup.timetableReady && source && <p className="mt-2 text-xs text-slate">시간표 — {source}</p>}
        <p className="mt-2 text-xs text-slate">
          {setup.timetableReady ? `만들어 둔 ${month}월 시간표대로 ` : ""}강좌마다 모든 시간대의 반(월수금 · 화목금, 850 2주완성 포함)을 &lsquo;모집 중&rsquo; 으로
          열어요. 받아 둔 수강증은 저절로 그 반에 배정되고, 과정 · 과목은 시간표 설정에서 고치면 반도 따라 바뀌어요.
        </p>
        <p className="mt-1.5 text-xs text-mist">
          직접 하려면{" "}
          <Link href={timetableHref} className="font-bold text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
            시간표 설정
          </Link>
          {" · "}
          <Link href={newHref} className="font-bold text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
            새 반 개설
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="month-setup-title" className="rounded-xl2 border border-amber-200 bg-amber-50 p-4 sm:p-5">
      <h2 id="month-setup-title" className="text-base font-black text-ink">
        {month}월 반이 아직 없어요
      </h2>
      <p className="mt-1 text-sm text-slate">
        달력은 저장됐어요. {month}월은 <b className="text-ink">방학달</b>이라 시간표가 달라 반을 직접 열어요 (평달은 달력을 저장하면 저절로 열려요) — {waiting}
      </p>
      <ol className="mt-3 space-y-3">
        <Step
          n={1}
          done={setup.timetableReady}
          title={`${month}월 시간표 만들기`}
          href={timetableHref}
          cta={setup.timetableReady ? "시간표 확인" : "시간표 설정으로"}
          primary={!setup.timetableReady}
        >
          {setup.timetableReady
            ? "만들어 뒀어요. 시간 · 과정 A/B · 과목이 맞는지만 확인하세요."
            : `시간표 설정에서 '${month}월 시간표 만들기' 를 한 번 누르고 과정 A/B · 과목을 골라 주세요.${source ? ` ${source}` : ""}`}
        </Step>
        <Step n={2} title="새 반 개설" href={newHref} cta="새 반 개설로" primary={setup.timetableReady}>
          강좌마다 &lsquo;전체 선택&rsquo; 을 누르고 반을 여세요 (850 2주완성 포함). 반을 열면 받아 둔 수강증이 저절로 그 반에 배정되고, 학생 시간표 · 숙제 · 출석이 이
          달력대로 따라와요.
        </Step>
      </ol>
    </section>
  );
}

/** 한 단계 — 번호(끝냈으면 체크) · 제목 · 설명 · 가는 버튼. 체크는 12px 라 도형(인라인 SVG)이다 */
function Step({
  n,
  title,
  done = false,
  href,
  cta,
  primary,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  href: string;
  cta: string;
  primary: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black text-white",
          done ? "bg-emerald-500" : "bg-amber-500",
        )}
      >
        {done ? (
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          n
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">
          {title}
          {done && <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-800">완료</span>}
        </p>
        <p className="mt-0.5 text-sm text-slate">{children}</p>
        <Link href={href} className={cn("mt-2 inline-flex !px-3.5 !py-2 text-xs", primary ? "btn-primary" : "btn-secondary")}>
          {cta}
        </Link>
      </div>
    </li>
  );
}
