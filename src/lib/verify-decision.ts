import { receiptCourseMonth, type ParsedReceipt } from "./receipt";

/**
 * 등업신청 자동 판정 — **바로 거절할지, 스태프 검토로 넘길지, 다음 달 반이 열릴 때까지 받아 둘지만 정한다** (2026-09-17 Alan 요청:
 * "수강월이 맞지 않다거나, 역전토익이 아닌경우에는 검토대기를 하지말고, 이유를 설명해주면서 거절").
 * 긴급 스위치(`feature_flags.verification_auto`)가 꺼져 있으면 거절도 하지 않는다 — 그건 부르는 쪽(`submitVerification`)이 본다.
 *
 * **자동 승인은 여기서 정하지 않는다** — 거절하지 않은 것 중 반 대조(`matchSections`)가 딱 맞고 이름·위조 신호까지 맞으면
 * `submitVerification` 이 승인한다 (2026-09-18, CLAUDE.md 미확정 3). 나머지는 스태프가 본다.
 *
 * ## 근거가 있을 때만 거절한다
 * OCR 이 글자를 못 읽었거나 날짜를 하나도 못 찾았으면 **거절하지 않는다.** 없는 정보로 거절하면
 * 멀쩡한 수강증이 튕기고, 학생은 왜 떨어졌는지 알 수 없다. 잘못 거절당한 학생의 길은
 * **수동 등업신청**(반을 직접 골라 제출)이지만, 그 길이 있다고 해서 함부로 거절해도 되는 것은 아니다.
 */

/** 거절 사유 코드. 화면 문구는 `reason` 을 그대로 학생에게 보여 준다 */
export type VerifyRejectCode = "academy" | "brand" | "month";

export type VerifyDecision =
  | { kind: "reject"; code: VerifyRejectCode; reason: string }
  /** 스태프가 본다 (`result = null` = 검토 대기) */
  | { kind: "review"; note?: string }
  /**
   * 다음 달(동시등록 기간이면 그다음 달까지) 수강증인데 **그 달 반이 아직 안 열렸다** — 거절하지 않고 받아 둔다
   * (2026-09-22 Alan "다음달 수강증을 올리는경우는 미리 등록한 경우이니 예비등록생으로 받아준다. 그리고 다음달 개강일에 맞춰서
   * 권한부여가 자동으로"). 검토 대기로 남기고, 강사가 그 달 반을 열면 `rematchHeldVerifications` 가 다시 맞춰 자동 배정한다
   * → 개강 전이라 예비등록생 → 개강일에 수강생 (DB 트리거·배치, 규칙 5). `note` 는 학생에게 그대로 보인다.
   */
  | { kind: "upcoming"; month: number; note: string };

export type VerifyTerm = { year: number; month: number };

/**
 * 글자를 이만큼도 못 읽었으면 판정하지 않는다. 수강증 한 장에는 학원명·강좌명·금액·날짜가 들어가
 * 공백을 뺀 길이가 수백 자다 — 이보다 짧으면 사진이 흐리거나 OCR 이 실패한 것이라 게이트의 `false` 를 믿을 수 없다.
 */
export const MIN_RECEIPT_TEXT = 40;

const termKey = (t: VerifyTerm) => `${t.year}-${t.month}`;

/**
 * 받아 두는 달 — 오늘(KST)부터 **이만큼 뒤까지** (0 = 이번 달인데 반이 아직 없음 · 1 = 다음 달 · 2 = 동시등록 기간의 그다음 달).
 * 그보다 먼 달은 지난 수강증으로 본다 — 배지에 연도가 없어 `11월` 은 두 달 뒤일 수도 열 달 전일 수도 있는데, 더 가까운 쪽으로 읽는다.
 */
export const HOLD_MONTHS_AHEAD = 2;

/** 오늘(KST, `YYYY-MM-DD`)부터 몇 달 뒤인가 (0~11). 배지에는 연도가 없어 달만 본다 */
export function monthsAhead(month: number, today: string): number {
  return (((month - Number(today.slice(5, 7))) % 12) + 12) % 12;
}

function upcoming(month: number): VerifyDecision {
  return {
    kind: "upcoming",
    month,
    note: `${month}월 수강증으로 받아 뒀어요. 강사가 ${month}월 반을 열면 수강증에 맞는 반으로 배정해 드려요 — 개강 전이면 ${month}월 예비등록생으로 표시되고, 개강일에 수강생으로 자동 전환돼요. 다시 올리지 않으셔도 돼요.`,
  };
}

/**
 * 캡처가 너무 오래됐나 (2026-09-18 Alan "가상의 수강증을 만들어 올리면?" 대응 1단계).
 * 위조를 가려내는 것은 아니다 — 지난달 수강증을 다시 올리거나 남의 옛 캡처를 쓰는 **게으른 재사용**을 자동 승인에서 뺀다.
 * 개강 전에도 올릴 수 있어(규칙 5) 45일까지는 정상으로 본다. 날짜를 못 읽었으면 판단하지 않는다(true).
 */
export const MAX_CAPTURE_AGE_DAYS = 45;
export function isCaptureFresh(capturedOn: string | null | undefined, today: string, maxDays = MAX_CAPTURE_AGE_DAYS): boolean {
  if (!capturedOn) return true;
  const a = Date.parse(`${capturedOn}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  const days = Math.round((b - a) / 86_400_000);
  // 미래 날짜(기기 시각이 틀린 캡처)도 며칠까지는 봐준다
  return days <= maxDays && days >= -7;
}
export const termsLabel = (terms: readonly VerifyTerm[]) => terms.map((t) => `${t.year}년 ${t.month}월`).join(" · ");

/**
 * @param parsed OCR 원문을 판독한 결과. **OCR 이 아직 없으면 `null`** — 그때는 늘 검토 대기다.
 * @param openTerms 지금 등업신청을 받는 기수 (개강일이 지났거나 곧 오는 달). 비어 있으면 지난달로 거절하지 않는다.
 * @param today 오늘(KST, `YYYY-MM-DD`) — 다음 달인지 지난달인지를 이것으로 가른다
 */
export function decideVerification(parsed: ParsedReceipt | null, openTerms: readonly VerifyTerm[], today: string): VerifyDecision {
  // OCR 엔진이 아직 없다 (CLAUDE.md 미확정 5) — 읽은 것이 없으니 거절할 근거도 없다
  if (!parsed) return { kind: "review", note: "OCR 미연결 — 스태프가 확인합니다" };

  if (parsed.compact.length < MIN_RECEIPT_TEXT) {
    return { kind: "review", note: "수강증에서 글자를 거의 읽지 못했어요" };
  }

  // ① 우리 수강증인가 (게이트 G1 · G2)
  if (!parsed.gates.academy) {
    return {
      kind: "reject",
      code: "academy",
      reason: "부산 서면센터 수강증이 아닌 것 같아요. 수강센터 줄이 보이도록 화면 전체를 캡처해 올려 주세요.",
    };
  }
  if (!parsed.gates.brand) {
    return {
      kind: "reject",
      code: "brand",
      reason: "역전토익 강좌 수강증이 아닌 것 같아요. 강좌명과 담당 강사(이혜영·이영수)가 보이도록 다시 올려 주세요.",
    };
  }

  // ② 수강월이 지금 받는 달인가.
  // **배지 `NN월 과정` 이 1순위다** (2026-09-18 실물 수강증 확인). 화면 맨 위 `현재시간` 은 캡처한 시각이라
  // 8월 말에 9월 강좌를 등록하고 바로 캡처하면 날짜는 8월인데 과정은 9월이다 — 날짜만 보면 멀쩡한 수강증을 거절한다.
  // 배지를 못 읽었으면 수강요일 줄의 개강일 달(`[4주-09/04]`)로 본다 (2026-09-22, `receiptCourseMonth`).
  // 달을 읽었으면 그 달이 열린 기수에 있는지 본다. 연도는 배지에 없으니 달만 맞춘다.
  //
  // 열린 기수에 없으면 **지난달이면 거절, 다음 달이면 받아 둔다** (2026-09-22 Alan — 위 `upcoming`).
  // 예전(2026-09-18~22)에는 다음 달도 "아직 열리지 않았어요 — 반이 열리면 다시 올려 주세요" 로 거절해 학생이 다시 와야 했다.
  const courseMonth = receiptCourseMonth(parsed);
  if (courseMonth != null) {
    if (openTerms.some((t) => t.month === courseMonth)) return { kind: "review" };
    if (monthsAhead(courseMonth, today) <= HOLD_MONTHS_AHEAD) return upcoming(courseMonth);
    // 무엇을 받는지 모르면(열린 반이 하나도 없음) 지난달이라고 말하지 않는다
    if (openTerms.length === 0) return { kind: "review" };
    return {
      kind: "reject",
      code: "month",
      reason: `이 수강증은 ${courseMonth}월 과정이에요 — 지난 과정이라 받을 수 없어요. 지금은 ${termsLabel(openTerms)} 등업신청을 받고 있어요. 이번 달 수강증을 올려 주세요.`,
    };
  }

  // 배지도 개강일도 못 읽었으면 수강증의 날짜들로 본다. 날짜를 하나도 못 읽었으면 판정하지 않는다.
  // 읽은 달에는 결제일·발행일도 섞여 있으므로 **하나라도 열린 기수에 걸리면 통과**시킨다 (8월에 결제한 9월 강좌를 거절하지 않게).
  // **캡처 시각은 여기 들어오지 않는다** (`parsed.months` 가 뺀다, 2026-09-22) — 캡처한 날만으로 거절하면 8월 말에 캡처한
  // 9월 수강증을 9월에 올렸을 때 "날짜가 달라요" 로 튕긴다. 실물 수강증에는 다른 날짜가 없어 보통 여기까지 오지 않는다.
  if (parsed.months.length > 0) {
    const open = new Set(openTerms.map(termKey));
    if (parsed.months.some((m) => open.has(termKey(m)))) return { kind: "review" };
    // 날짜에는 연도가 있어 몇 달 뒤인지 정확히 잰다
    const now = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));
    const ahead = parsed.months.find((m) => {
      const d = m.year * 12 + m.month - now;
      return d >= 0 && d <= HOLD_MONTHS_AHEAD;
    });
    if (ahead) return upcoming(ahead.month);
    if (openTerms.length > 0) {
      const found = termsLabel(parsed.months);
      return {
        kind: "reject",
        code: "month",
        reason: `수강증에서 읽은 날짜(${found})가 지금 등업신청을 받는 달(${termsLabel(openTerms)})과 달라요. 이번 달 수강증이 맞는지 확인해 주세요.`,
      };
    }
  }

  return { kind: "review" };
}

/**
 * 받아 둔 예비 접수의 달 — `enrollment_verifications.candidates.hold` (1~12). 아니면 null.
 * 그 달 반이 열려 다시 맞추면(`rematchHeldVerifications`) 지워지고 `heldFor` 로 남는다.
 */
export function heldMonth(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}
