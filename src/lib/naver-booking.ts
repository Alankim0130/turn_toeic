/**
 * 네이버 예약 자동 확인 (2026-09-21 Alan — "네이버는 첫토익 설정과 똑같이.
 * 예약이 잡히면 강사에게 알림이 오고 동시에 대시보드에서 바로 보이도록").
 *
 * 네이버 예약 **공개 페이지가 쓰는 조회(`hourlySchedule`)** 를 10분마다 한 번 불러 칸마다 예약 건수를 받고,
 * 직전 기록과 비교해 늘면 접수 · 줄면 취소로 본다. 비교와 저장은 DB 함수 `public.naver_apply_snapshot` 한곳이 한다.
 * 이 파일은 **네이버가 준 응답이 믿을 만한지** 확인하고, 알림 문구를 만드는 일만 한다 (순수 함수 — 테스트한다).
 *
 * 이 조회는 **예약자가 누구인지 알려 주지 않는다** — 칸마다 건수와 정원뿐이다. 그 성질을 지킬 것:
 * 예약 상세·방문자 조회를 로그인 세션으로 부르지 않는다 (첫토익 문서 6.5).
 */

/** 공개 예약 페이지 주소에서 업종·업체·상품 번호를 읽는다 — 번호를 두 곳에 적지 않는다 (site.academy.naverBookingUrl) */
export function naverBookingIds(url: string): { businessTypeId: number; businessId: string; bizItemId: string } | null {
  const m = url.match(/\/booking\/(\d+)\/bizes\/(\d+)\/items\/(\d+)/);
  return m ? { businessTypeId: Number(m[1]), businessId: m[2], bizItemId: m[3] } : null;
}

/** 며칠 앞까지 보나. 예약을 여는 기간보다 **길어야** 한다 — 짧으면 먼 날짜의 예약이 범위에 들어올 때 기준선으로 묻혀 알림이 안 간다.
 *  (2026-09-21 실측: 역전토익 강사상담은 그 달 말까지만 열려 있었다) */
export const NAVER_DAYS_AHEAD = 60;

/** 네이버 조회는 **시간대 표시 없이** 보내야 한다. `+09:00` 을 붙이면 HTTP 200 에 본문 오류(422 Wrong type)가 온다 */
export function naverRange(now: Date, daysAhead = NAVER_DAYS_AHEAD) {
  const kstDay = (offset: number) => new Date(now.getTime() + 9 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
  const from = kstDay(0);
  const to = kstDay(daysAhead);
  return {
    startDateTime: `${from}T00:00:00`,
    endDateTime: `${to}T23:59:59`,
    /** DB 비교 범위 (한국 시간 그 날 0시 ~ 마지막 날 끝) */
    fromIso: `${from}T00:00:00+09:00`,
    toIso: `${to}T23:59:59+09:00`,
  };
}

export const HOURLY_QUERY =
  "query hourlySchedule($scheduleParams: ScheduleParams) { schedule(input: $scheduleParams) { bizItemSchedule { hourly { unitStartTime unitStartDateTime bookingCount stock isUnitSaleDay } } } }";

export type NaverSlot = { slot_at: string; booking_count: number; stock: number; is_sale_day: boolean };

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 10_000;

/** "2026-09-21 15:20:00" (한국 벽시계) → "2026-09-21T15:20:00+09:00" */
function kstWallClock(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/);
  return m ? `${m[1]}T${m[2]}:${m[3] ?? "00"}+09:00` : null;
}

/**
 * 네이버 응답 → 칸 목록. **하나라도 모양이 이상하면 통째로 거절한다** (Error).
 *
 * 필드 이름만 바뀌어도 `Number(undefined ?? 0) = 0` 이 되어 **예약된 칸이 전부 취소로 보이고 강사 전원에게 거짓 알림이 간다**
 * (첫토익 문서 5-8). 그래서 기본값으로 메우지 않는다 — 없는 값은 없는 대로 멈춘다.
 * 오류는 HTTP 상태가 아니라 본문의 `errors` 로 온다 (5-4).
 */
export function parseHourly(json: unknown): NaverSlot[] {
  const body = json as { errors?: unknown; data?: { schedule?: { bizItemSchedule?: { hourly?: unknown } } } } | null;
  if (!body || typeof body !== "object") throw new Error("응답이 JSON 객체가 아니에요");
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const msg = (body.errors[0] as { message?: unknown })?.message;
    throw new Error(`네이버 오류: ${String(msg ?? "알 수 없음").slice(0, 160)}`);
  }
  const hourly = body.data?.schedule?.bizItemSchedule?.hourly;
  if (!Array.isArray(hourly)) throw new Error("hourly 목록이 없어요 (응답 모양이 바뀌었을 수 있어요)");

  const seen = new Set<string>();
  const out: NaverSlot[] = [];
  for (const [i, raw] of hourly.entries()) {
    const h = raw as Record<string, unknown>;
    if (!h || typeof h !== "object") throw new Error(`${i}번째 칸이 객체가 아니에요`);
    // UTC 값이 있으면 그걸 쓰고(오프셋을 붙일 필요가 없다), 없으면 한국 벽시계에 +09:00 을 붙인다
    const iso =
      typeof h.unitStartDateTime === "string" && !Number.isNaN(Date.parse(h.unitStartDateTime))
        ? new Date(h.unitStartDateTime).toISOString()
        : kstWallClock(h.unitStartTime);
    if (!iso) throw new Error(`${i}번째 칸의 시각을 못 읽었어요`);
    if (!isCount(h.bookingCount)) throw new Error(`${i}번째 칸의 bookingCount 가 숫자가 아니에요`);
    if (!isCount(h.stock)) throw new Error(`${i}번째 칸의 stock 이 숫자가 아니에요`);
    const at = new Date(iso).toISOString();
    if (seen.has(at)) continue; // 같은 칸이 두 번 오면 한 번만 (먼저 온 것을 믿는다)
    seen.add(at);
    out.push({ slot_at: at, booking_count: h.bookingCount, stock: h.stock, is_sale_day: h.isUnitSaleDay !== false });
  }
  return out;
}

export type BookingEvent = { slot_at: string; kind: "booked" | "cancelled" | "vanished"; prev: number; new: number; stock: number | null };

/** 알림에 쓰는 한국 시각: "9월 23일(수) 오후 3:20" */
export function slotLabel(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
  const weekday = d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" });
  const [h, m] = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${date}(${weekday}) ${ampm} ${h12}:${String(m).padStart(2, "0")}`;
}

/** 강사에게 가는 푸시 문구. 예약자 정보는 없다 — 날짜·시각과 그 칸의 인원만 */
export function bookingEventMessage(e: BookingEvent): { title: string; body: string } {
  const when = slotLabel(e.slot_at);
  const seats = e.stock ? ` (${e.new}/${e.stock}명)` : "";
  if (e.kind === "booked") {
    const n = e.new - e.prev;
    return { title: `네이버 상담예약 접수 · ${when}`, body: `상담 예약이 ${n > 1 ? `${n}건 ` : ""}새로 잡혔어요${seats}.` };
  }
  if (e.kind === "cancelled") {
    const n = e.prev - e.new;
    return { title: `네이버 상담예약 취소 · ${when}`, body: `상담 예약이 ${n > 1 ? `${n}건 ` : ""}취소됐어요${seats}.` };
  }
  return {
    title: `네이버 예약 확인 필요 · ${when}`,
    body: `예약이 ${e.prev}명 있던 칸이 네이버 예약 페이지에서 사라졌어요. 취소됐는지 확인해 주세요.`,
  };
}

/** 한 번에 알림을 몇 개까지 따로 보내나. 넘으면 한 통으로 묶는다 (강사 휴대폰이 줄줄이 울리지 않게) */
export const MAX_SEPARATE_PUSHES = 4;
