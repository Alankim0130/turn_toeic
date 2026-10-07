import { cn } from "@/lib/utils";
import { ORDER_STEPS, orderStepIndex, textbookStatus } from "@/lib/textbook";

/**
 * 교재주문 단계 — 주문완료 → 배송확인 → 배송시작 (2026-10-02 Alan — "학생들 화면에는 배송확인 - 배송시작 이렇게 나오면 좋겠어").
 * 강사가 금액확인을 누르면 배송확인, 조교가 배송완료를 누르면 배송시작에 불이 들어온다.
 * 현장수령(2026-10-07)은 보내지 않으니 이름만 다르다 — 주문완료 → 입금확인 → 수령완료 (`TEXTBOOK_PICKUP_STATUS`).
 * 세 칸을 똑같이 나눈 격자라 320px 에서도 한 줄이다 (알약을 옆으로 늘어놓으면 좁은 화면에서 넘친다).
 * 체크 표시는 작은 크기라 도형(인라인 SVG)이다 — 이모지를 쓰지 않는다.
 */
export function OrderSteps({ status, pickup = false }: { status: string; pickup?: boolean }) {
  const at = orderStepIndex(status);
  if (at < 0) return null;
  return (
    <ol className="mt-3 grid max-w-sm grid-cols-3" aria-label={pickup ? "수령 단계" : "배송 단계"}>
      {ORDER_STEPS.map((step, i) => {
        const done = i <= at;
        return (
          <li key={step} className="relative flex flex-col items-center text-center" aria-current={i === at ? "step" : undefined}>
            {/* 앞 단계와 잇는 줄 — 이 칸의 가운데에서 앞 칸의 가운데까지 */}
            {i > 0 && <span aria-hidden className={cn("absolute right-1/2 top-2.5 h-0.5 w-full -translate-y-1/2", done ? "bg-brand-400" : "bg-line")} />}
            <span
              aria-hidden
              className={cn(
                "relative flex h-5 w-5 items-center justify-center rounded-full border-2",
                done ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white",
              )}
            >
              {done && (
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.5l2.2 2.2 4.8-5" />
                </svg>
              )}
            </span>
            <span className={cn("mt-1 whitespace-nowrap text-xs font-black", i === at ? "text-brand-700" : done ? "text-ink" : "text-mist")}>
              {textbookStatus(step, pickup).label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
