import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { CopyButton } from "@/components/ui/CopyButton";
import { formatWon } from "@/lib/utils";
import type { TextbookNotice } from "@/lib/textbook";

/**
 * 불라방 교재비 안내 (2026-10-02 Alan — "수강증 업로드를 하고 나면 거기에 맞춰서 교재비 안내가 나가면 편할것 같아!").
 * 수강증이 불라방으로 승인된 그 자리(등업신청 팝업 · 그 아래 안내)에 뜬다. 알림함에는 같은 내용이 글로 간다 (`textbookNoticeMessage`).
 * 금액은 안내일 뿐이다 — 주문에 박히는 금액은 주문할 때 DB 함수가 다시 계산한다.
 */
export function TextbookNoticeCard({ notice, cta = "primary" }: { notice: TextbookNotice; cta?: "primary" | "secondary" }) {
  return (
    // 팝업과 그 아래 안내에 같은 카드가 함께 설 수 있어 id 대신 aria-label 로 이름을 단다
    <section aria-label={`${notice.month}월 불라방 교재비 안내`} className="rounded-xl2 border border-brand-200 bg-brand-50/50 p-4 text-left">
      <h3 className="flex items-center gap-2 font-black text-ink">
        <Icon name="textbook" size={22} />
        {notice.month}월 불라방 교재비 안내
      </h3>
      <p className="mt-1 text-xs text-slate">불라방 수강생은 교재를 집으로 받아요. 내 반에 맞춘 교재예요.</p>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate">교재 {notice.books.length}권</dt>
          <dd className="tabular-nums text-ink">{formatWon(notice.itemsTotal)}</dd>
        </div>
        {notice.shipping > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-slate">배송비</dt>
            <dd className="tabular-nums text-ink">{formatWon(notice.shipping)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 border-t border-brand-100 pt-1.5 text-base">
          <dt className="font-black text-ink">합계</dt>
          <dd className="font-black tabular-nums text-brand-700">{formatWon(notice.total)}</dd>
        </div>
      </dl>
      <p className="mt-1.5 text-xs text-slate">{notice.books.join(" · ")}</p>

      <ul className="mt-3 space-y-2">
        {notice.pay.map((p) => (
          <li key={`${p.bank}-${p.accountNo}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5">
            <div className="min-w-0 text-sm">
              <p className="font-bold text-ink">
                {p.bank} <span className="whitespace-nowrap">{p.accountNo}</span>
                {p.label ? <span className="ml-1.5 text-xs font-normal text-slate">{p.label}</span> : null}
              </p>
              <p className="text-xs text-slate">
                예금주 {p.holder} · {formatWon(p.amount)}
              </p>
            </div>
            <CopyButton text={p.accountNo} />
          </li>
        ))}
      </ul>
      {notice.pay.length > 1 && <p className="mt-2 text-xs text-slate">계좌가 둘이라 계좌마다 적힌 금액을 따로 입금해 주세요.</p>}

      <p className="mt-3 text-xs text-slate">
        교재주문에서 배송지와 입금자명을 적어 주문해 주세요. 입금하시면 선생님이 통장과 대조해 확인한 뒤 보내 드려요.
        {notice.owned > 0 ? ` 지난 주문에서 받은 교재 ${notice.owned}권은 뺐어요.` : " 이미 가진 교재가 있으면 주문할 때 빼면 돼요."}
      </p>
      {/* 등업 팝업 안에서는 "맞아요, 확인" 이 먼저라 버튼을 한 단계 낮춘다 */}
      <Link href="/my/textbook" className={`${cta === "primary" ? "btn-primary" : "btn-secondary"} mt-3 w-full !py-2.5 text-sm sm:w-auto`}>
        교재 주문하러 가기
      </Link>
    </section>
  );
}
