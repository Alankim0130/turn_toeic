import { Icon } from "@/components/ui/Icon";
import { site } from "@/lib/site";

const STEPS = ["YBM 홈페이지에서 회원가입", "학원 데스크에 문의 — 계정을 연동해 드려요"];

/**
 * 수강증이 없는 학생 안내 (2026-09-17 Alan — "간혹 수강증이 없는 친구들이 있어. YBM 홈페이지에 회원가입을 안 한 경우라서
 * 회원가입을 하고 데스크에서 계정 연동을 해야 해. Ybm홈페이지 회원가입 후 학원 데스크에 문의하기!").
 * 등업신청 왼쪽 열, "이렇게 진행돼요" 다음 카드. 회원가입 링크는 `site.academy.ybmHomeUrl`(새 창).
 * **수강증을 어디서 보는지 보여 주는 그림은 Alan 이 따로 준다** — 받으면 이 카드 안에 넣는다. 그때까지 그림 자리를 만들어 두지 않는다.
 */
export function NoReceiptCard() {
  return (
    <section className="card p-5" aria-labelledby="no-receipt-title">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
          <Icon name="warning" size={24} />
        </span>
        <h2 id="no-receipt-title" className="text-base font-black text-ink">
          수강증이 없나요?
        </h2>
      </div>
      <p className="mt-3 text-sm text-slate">
        YBM 홈페이지에 회원가입이 안 되어 있으면 수강증이 나오지 않아요. <span className="font-bold text-ink">회원가입 후 학원 데스크에 문의하기!</span>
      </p>
      <ol className="mt-3 space-y-2 text-sm">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-black text-white">{i + 1}</span>
            <span className="text-ink">{step}</span>
          </li>
        ))}
      </ol>
      <a href={site.academy.ybmHomeUrl} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 w-full !py-2.5">
        YBM 홈페이지 회원가입
      </a>
    </section>
  );
}
