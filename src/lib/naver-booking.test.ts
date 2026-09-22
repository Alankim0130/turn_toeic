import { describe, expect, it } from "vitest";
import { bookingEventMessage, naverBookingIds, naverRange, parseHourly, slotLabel } from "./naver-booking";
import { site } from "./site";

/** 2026-09-21 실측 응답의 칸 하나 (역전토익 강사상담, 정원 2명) */
const SLOT = {
  unitStartTime: "2026-09-21 15:20:00",
  unitStartDateTime: "2026-09-21T06:20:00Z",
  bookingCount: 2,
  stock: 2,
  isUnitSaleDay: true,
};
const wrap = (hourly: unknown) => ({ data: { schedule: { bizItemSchedule: { hourly } } } });

describe("네이버 예약 번호 — 공개 예약 페이지 주소에서 읽는다", () => {
  it("사이트 설정의 주소에서 업종·업체·상품 번호가 나온다 (번호를 두 곳에 적지 않는다)", () => {
    expect(naverBookingIds(site.academy.naverBookingUrl)).toEqual({ businessTypeId: 12, businessId: "459658", bizItemId: "4139011" });
  });
  it("모양이 다른 주소면 null", () => {
    expect(naverBookingIds("https://naver.me/abc")).toBeNull();
  });
});

describe("조회 범위 — 시간대 표시 없이 보낸다", () => {
  it("한국 날짜 기준 오늘 0시부터 60일 뒤 끝까지", () => {
    // 2026-09-21 23:30 KST = 14:30 UTC — UTC 로는 아직 21일이지만 한국은 21일
    const r = naverRange(new Date("2026-09-21T14:30:00Z"));
    expect(r.startDateTime).toBe("2026-09-21T00:00:00");
    expect(r.endDateTime).toBe("2026-11-20T23:59:59");
    expect(r.startDateTime).not.toMatch(/\+|Z$/);
  });
  it("한국이 다음 날로 넘어가면 다음 날부터 (UTC 15시 = KST 0시)", () => {
    expect(naverRange(new Date("2026-09-21T15:00:00Z")).startDateTime).toBe("2026-09-22T00:00:00");
  });
});

describe("응답 검사 — 모양이 조금이라도 이상하면 멈춘다 (거짓 취소 알림 방지)", () => {
  it("정상 칸은 UTC ISO 로 바꾼다", () => {
    expect(parseHourly(wrap([SLOT]))).toEqual([{ slot_at: "2026-09-21T06:20:00.000Z", booking_count: 2, stock: 2, is_sale_day: true }]);
  });
  it("UTC 칸이 없으면 한국 벽시계에 +09:00 을 붙인다", () => {
    const { unitStartDateTime: _drop, ...noUtc } = SLOT;
    void _drop;
    expect(parseHourly(wrap([noUtc]))[0].slot_at).toBe("2026-09-21T06:20:00.000Z");
  });
  it("bookingCount 가 없으면 0 으로 메우지 않고 거절한다", () => {
    const { bookingCount: _drop, ...broken } = SLOT;
    void _drop;
    expect(() => parseHourly(wrap([broken]))).toThrow(/bookingCount/);
  });
  it("숫자가 아닌 값·음수도 거절한다", () => {
    expect(() => parseHourly(wrap([{ ...SLOT, bookingCount: "2" }]))).toThrow();
    expect(() => parseHourly(wrap([{ ...SLOT, stock: -1 }]))).toThrow(/stock/);
  });
  it("본문의 errors 는 HTTP 200 이어도 오류다", () => {
    expect(() => parseHourly({ errors: [{ message: "status=422 Validation Failed" }], data: null })).toThrow(/422/);
  });
  it("hourly 가 없으면 거절한다 (경로가 바뀐 경우)", () => {
    expect(() => parseHourly({ data: { schedule: null } })).toThrow(/hourly/);
  });
  it("빈 목록은 정상이다 (그 기간에 연 칸이 없다)", () => {
    expect(parseHourly(wrap([]))).toEqual([]);
  });
  it("같은 칸이 두 번 오면 한 번만", () => {
    expect(parseHourly(wrap([SLOT, { ...SLOT, bookingCount: 0 }]))).toHaveLength(1);
  });
});

describe("알림 문구 — 날짜·시각과 인원만 (예약자는 모른다)", () => {
  it("한국 시각으로 적는다", () => {
    expect(slotLabel("2026-09-23T06:20:00.000Z")).toBe("9월 23일(수) 오후 3:20");
    expect(slotLabel("2026-09-23T01:05:00.000Z")).toBe("9월 23일(수) 오전 10:05");
  });
  it("접수", () => {
    const m = bookingEventMessage({ slot_at: "2026-09-23T06:20:00.000Z", kind: "booked", prev: 0, new: 1, stock: 2 });
    expect(m.title).toBe("네이버 상담예약 접수 · 9월 23일(수) 오후 3:20");
    expect(m.body).toBe("상담 예약이 새로 잡혔어요 (1/2명).");
  });
  it("한 번에 두 건이 늘면 건수를 적는다", () => {
    expect(bookingEventMessage({ slot_at: "2026-09-23T06:20:00.000Z", kind: "booked", prev: 0, new: 2, stock: 2 }).body).toContain("2건");
  });
  it("취소", () => {
    const m = bookingEventMessage({ slot_at: "2026-09-23T06:20:00.000Z", kind: "cancelled", prev: 2, new: 1, stock: 2 });
    expect(m.title).toContain("취소");
    expect(m.body).toBe("상담 예약이 취소됐어요 (1/2명).");
  });
  it("예약이 있던 칸이 사라지면 확인을 부탁한다", () => {
    expect(bookingEventMessage({ slot_at: "2026-09-23T06:20:00.000Z", kind: "vanished", prev: 1, new: 0, stock: null }).title).toContain("확인 필요");
  });
});
