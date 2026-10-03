import Link from "next/link";
import { formatDate, cn } from "@/lib/utils";
import { RETENTION_LABEL } from "@/lib/receipt-retention";
import type { ReceiptVerdict } from "@/lib/receipt-history";

/**
 * 학생 관리 — 그 학생이 올린 수강증 (2026-10-02 Alan). 그림 · 결과 · 읽은 값 · 배정된 반을 한 장씩.
 * 그림은 **로그인한 강사·관리자의 세션으로 만든 서명 URL**(10분)이다 — storage `receipts` 정책이 본인 · crew 에게 열려 있다
 * (조교는 학생 관리를 못 열지만 등업 로그에서 같은 그림을 본다).
 * 자세한 판독 · 승인 · 반려는 등업 검토 화면에서 한다 (같은 일을 두 군데서 하지 않는다).
 */
export type StudentReceipt = {
  id: number;
  createdAt: string;
  manual: boolean;
  verdict: ReceiptVerdict;
  facts: string;
  nameMismatch: boolean;
  assigned: string[];
  image: { url: string; isImage: boolean } | null;
  deleted: boolean;
};

// StatusBadge 와 같은 색 — 등업 로그의 승인 · 반려 · 검토 대기와 같아 보이게
const TONE: Record<ReceiptVerdict["tone"], string> = {
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-800",
  gray: "bg-line text-slate",
};

export function StudentReceipts({ receipts }: { receipts: StudentReceipt[] }) {
  if (!receipts.length) {
    return <p className="rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate">아직 올린 수강증이 없어요.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {receipts.map((r) => (
        <li key={r.id} className="flex min-w-0 gap-3 rounded-2xl border border-line bg-paper p-3">
          <div className="w-24 shrink-0 sm:w-28">
            {r.image?.isImage ? (
              <a href={r.image.url} target="_blank" rel="noopener noreferrer" className="block" title="수강증 크게 보기 (새 창)">
                {/* 서명 URL 은 10분 유효. 외부 호스트라 next/image 대신 img — 가로 · 세로를 CSS 로 못박는다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.image.url} alt={`수강증 #${r.id}`} loading="lazy" className="h-44 w-full rounded-xl border border-line bg-surface object-contain sm:h-52" />
                <span className="mt-1 block text-center text-[0.7rem] font-bold text-brand-600">크게 보기</span>
              </a>
            ) : r.image ? (
              <a href={r.image.url} target="_blank" rel="noopener noreferrer" className="btn-secondary !px-2 !py-6 w-full text-xs">
                PDF 열기
              </a>
            ) : (
              <div className="flex h-44 w-full items-center justify-center rounded-xl border border-dashed border-line bg-surface p-2 text-center text-[0.7rem] leading-snug text-mist sm:h-52">
                {r.deleted ? `보관 기간(${RETENTION_LABEL})이 지나 원본 삭제` : "그림을 불러오지 못했어요"}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-black", TONE[r.verdict.tone])}>{r.verdict.label}</span>
              {r.manual && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[0.7rem] font-black text-brand-700">수동 신청</span>}
            </div>
            <p className="text-xs text-slate">{formatDate(r.createdAt, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 올림</p>
            {r.verdict.note && <p className={cn("text-xs", r.verdict.tone === "red" ? "font-bold text-red-700" : "text-slate")}>{r.verdict.note}</p>}
            <p className="text-xs text-ink">
              <span className="text-slate">읽은 값 </span>
              {r.facts || "글자를 읽지 못했어요"}
            </p>
            {r.nameMismatch && <p className="text-xs font-bold text-red-700">수강증 이름이 가입 실명과 달라요</p>}
            {r.assigned.length > 0 && (
              <ul className="text-xs text-ink">
                {r.assigned.map((a) => (
                  <li key={a} className="truncate">
                    <span className="text-slate">배정 </span>
                    {a}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/admin/verifications/${r.id}`} className="inline-block pt-1 text-xs font-black text-brand-600 hover:underline">
              {r.verdict.label === "검토 대기" ? "검토하기 →" : "등업 검토 화면 →"}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
