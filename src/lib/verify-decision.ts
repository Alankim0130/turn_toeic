import type { ParsedReceipt } from "./receipt";

/**
 * 등업신청 자동 판정 — **바로 거절할지, 스태프 검토로 넘길지만 정한다** (2026-09-17 Alan 요청:
 * "수강월이 맞지 않다거나, 역전토익이 아닌경우에는 검토대기를 하지말고, 이유를 설명해주면서 거절").
 *
 * **자동 승인은 하지 않는다** — 자동 확정 기준선은 아직 미확정이다 (CLAUDE.md 미확정 3).
 * 여기서 거절하지 않은 것은 전부 스태프가 본다.
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
  | { kind: "review"; note?: string };

export type VerifyTerm = { year: number; month: number };

/**
 * 글자를 이만큼도 못 읽었으면 판정하지 않는다. 수강증 한 장에는 학원명·강좌명·금액·날짜가 들어가
 * 공백을 뺀 길이가 수백 자다 — 이보다 짧으면 사진이 흐리거나 OCR 이 실패한 것이라 게이트의 `false` 를 믿을 수 없다.
 */
export const MIN_RECEIPT_TEXT = 40;

const termKey = (t: VerifyTerm) => `${t.year}-${t.month}`;

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
 * @param openTerms 지금 등업신청을 받는 기수 (개강일이 지났거나 곧 오는 달). 비어 있으면 달 판정을 하지 않는다.
 */
export function decideVerification(parsed: ParsedReceipt | null, openTerms: readonly VerifyTerm[]): VerifyDecision {
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
  // 배지를 읽었으면 그 달이 열린 기수에 있는지만 본다. 연도는 배지에 없으니 달만 맞춘다 (열린 기수는 이번 달·다음 달뿐이다).
  if (openTerms.length > 0 && parsed.courseMonth != null) {
    if (!openTerms.some((t) => t.month === parsed.courseMonth)) {
      // 지난달인지 다음 달인지 가른다 (2026-09-18 Alan: "지난달 등록은 바로 배제, 다음 달 등록은 미리 받아 예비등록생으로").
      // 다음 달 반은 강사가 '모집 중' 으로 개설하는 순간부터 열린 기수에 들어오므로, 여기 왔다면 아직 개설 전이다 — 학생에게 그렇게 말한다.
      const latest = openTerms.reduce((a, b) => (a.year * 12 + a.month >= b.year * 12 + b.month ? a : b));
      const ahead = (parsed.courseMonth - latest.month + 12) % 12; // 1~3 이면 다음 달(들), 그 밖은 지난달
      const isUpcoming = ahead >= 1 && ahead <= 3;
      return {
        kind: "reject",
        code: "month",
        reason: isUpcoming
          ? `이 수강증은 ${parsed.courseMonth}월 과정이에요. ${parsed.courseMonth}월 등업신청은 아직 열리지 않았어요 — 강사가 ${parsed.courseMonth}월 반을 열면 올릴 수 있어요 (보통 셋째 주부터, 동시등록 기간에는 더 일찍). 그때 다시 올려 주세요.`
          : `이 수강증은 ${parsed.courseMonth}월 과정(지난 달)이에요. 지금은 ${termsLabel(openTerms)} 등업신청만 받고 있어요. 이번 달 수강증을 올려 주세요.`,
      };
    }
    return { kind: "review" };
  }

  // 배지를 못 읽었으면 수강증의 날짜들로 본다. 날짜를 하나도 못 읽었으면 판정하지 않는다.
  // 읽은 달에는 결제일·발행일도 섞여 있으므로 **하나라도 열린 기수에 걸리면 통과**시킨다 (8월에 결제한 9월 강좌를 거절하지 않게).
  if (openTerms.length > 0 && parsed.months.length > 0) {
    const open = new Set(openTerms.map(termKey));
    if (!parsed.months.some((m) => open.has(termKey(m)))) {
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
