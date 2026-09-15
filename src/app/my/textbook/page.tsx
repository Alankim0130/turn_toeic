import { studentGate } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { requireUser } from "@/lib/auth";
import { cn, formatDate, formatTime, TRACK_LABEL } from "@/lib/utils";
import { getMyLiveEnrollments, getMyTextbookOrders, termLabel, TEXTBOOK_STATUS_LABEL } from "../_lib/queries";
import { TextbookForm, type EligibleSection } from "./TextbookForm";
import { cancelTextbookOrder } from "./actions";

export const metadata: Metadata = {
  title: "불라방 교재주문",
  robots: { index: false },
};

export default async function TextbookPage() {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다
  const locked = await studentGate("textbook");
  if (locked) return locked;

  const [{ profile }, enrollments, orders] = await Promise.all([requireUser("/my/textbook"), getMyLiveEnrollments(), getMyTextbookOrders()]);

  const sections: EligibleSection[] = enrollments.map((e) => {
    const s = e.section!;
    return {
      id: s.id,
      label: `${termLabel(s.term)} · ${s.course?.name ?? "강좌"} · ${TRACK_LABEL[s.track] ?? s.track} ${formatTime(s.start_time)}`,
    };
  });

  return (
    <div className="space-y-8">
      <PageHeader icon="textbook" title="불라방 교재주문" description="불라방 수강생은 교재를 집으로 받아볼 수 있어요." />

      {sections.length === 0 ? (
        <EmptyState
          icon="textbook"
          title="불라방 수강생만 신청할 수 있어요"
          description="현장 수강생은 개강일에 강의실에서 교재를 받습니다. 불라방으로 등업되면 이 메뉴가 열려요."
          action={{ href: "/my", label: "내 등록 현황 보기" }}
        />
      ) : (
        <Reveal className="card p-5 sm:p-7">
          <h2 className="mb-4 text-base font-black text-ink">배송 정보 입력</h2>
          <TextbookForm sections={sections} defaults={{ recipient_name: profile?.name ?? "", phone: profile?.phone ?? "" }} />
        </Reveal>
      )}

      <Reveal delay={100}>
        <section aria-labelledby="orders-title" className="card p-5 sm:p-6">
          <h2 id="orders-title" className="text-base font-black text-ink">내 교재주문 내역</h2>
          {orders.length === 0 ? (
            <p className="mt-3 text-sm text-slate">아직 신청한 교재가 없어요.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-black",
                          o.status === "shipped"
                            ? "bg-brand-500 text-white"
                            : o.status === "cancelled"
                              ? "bg-line text-slate"
                              : o.status === "confirmed"
                                ? "bg-ink text-white"
                                : "bg-brand-100 text-brand-700",
                        )}
                      >
                        {TEXTBOOK_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                      <span className="font-bold text-ink">
                        {o.section ? `${termLabel(o.section.term)} · ${o.section.course?.name ?? "강좌"}` : "반 정보 없음"}
                      </span>
                      <span className="text-slate">{o.quantity}권</span>
                    </div>
                    <p className="mt-1 text-slate">
                      {o.recipient_name} · {o.address}
                      {o.address_detail ? ` ${o.address_detail}` : ""}
                    </p>
                    <p className="text-xs text-mist">
                      {formatDate(o.created_at, { year: "numeric", month: "long", day: "numeric" })} 신청
                      {o.tracking_no ? ` · 송장번호 ${o.tracking_no}` : ""}
                    </p>
                  </div>
                  {o.status === "requested" && (
                    <form action={cancelTextbookOrder}>
                      <input type="hidden" name="id" value={o.id} />
                      <button type="submit" className="btn-ghost !px-3 !py-2 text-xs">
                        <Icon name="warning" size={16} />
                        신청 취소
                      </button>
                    </form>
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
