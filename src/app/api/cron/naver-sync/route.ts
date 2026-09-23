import { NextResponse, type NextRequest } from "next/server";
import { authorizedAppCall } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaff } from "@/lib/push";
import { site } from "@/lib/site";
import {
  bookingEventMessage,
  HOURLY_QUERY,
  MAX_SEPARATE_PUSHES,
  NAVER_PAGE,
  naverBookingIds,
  naverRange,
  parseHourly,
  type BookingEvent,
} from "@/lib/naver-booking";

/**
 * 네이버 예약 확인 (2026-09-21 Alan — "첫토익 설정과 똑같이"). DB 크론이 10분마다 부른다
 * (pg_cron `naver-booking-sync` → `private.call_app`, 마이그레이션 20260921101500).
 *
 * 1. 네이버 예약 공개 페이지가 쓰는 조회를 **한 번** 부른다 (범위 조회 — 60일치).
 * 2. 응답 모양을 엄격하게 검사한다 (`parseHourly`) — 이상하면 저장하지 않고 멈춘다.
 * 3. `public.naver_apply_snapshot` 이 직전 기록과 비교해 변동을 남기고 저장한다 (한 트랜잭션).
 * 4. 변동이 있으면 강사·관리자에게 웹 푸시. 대시보드는 같은 표를 읽으므로 새로고침하면 바로 보인다.
 *
 * 응답에는 건수만 담는다 — 칸 목록을 돌려주지 않는다 (누가 불러도 새는 것이 없게).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 브라우저처럼 보이게 넣은 값 (첫토익과 같다). 꼭 필요한지는 확인하지 않았다 — 없애면 차단될 수 있어 그대로 둔다
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** 연속 실패가 이만큼 쌓이면(10분 × 6 = 한 시간) 한 번 알린다 */
const ALERT_AFTER_FAILURES = 6;

type Admin = ReturnType<typeof createAdminClient>;

async function recordFailure(admin: Admin, message: string, retryAfterMinutes?: number) {
  const retryAfter = retryAfterMinutes ? new Date(Date.now() + retryAfterMinutes * 60_000).toISOString() : undefined;
  const { data } = await admin.rpc("naver_sync_failed", { p_error: message, p_retry_after: retryAfter });
  return typeof data === "number" ? data : 0;
}

async function pushEvents(events: BookingEvent[]) {
  if (events.length === 0) return;
  const url = NAVER_PAGE;
  if (events.length > MAX_SEPARATE_PUSHES) {
    const count = (k: BookingEvent["kind"]) => events.filter((e) => e.kind === k).length;
    const parts = [
      count("booked") ? `접수 ${count("booked")}` : null,
      count("cancelled") ? `취소 ${count("cancelled")}` : null,
      count("vanished") ? `확인 필요 ${count("vanished")}` : null,
    ].filter(Boolean);
    await notifyStaff("naver_reservation", {
      title: `네이버 상담예약 변동 ${events.length}건`,
      body: `${parts.join(" · ")} — 네이버 예약 화면에서 날짜·시각을 확인해 주세요.`,
      url,
      tag: "naver-booking",
    });
    return;
  }
  for (const e of events) {
    await notifyStaff("naver_reservation", { ...bookingEventMessage(e), url, tag: `naver-${e.slot_at}` });
  }
}

export async function POST(req: NextRequest) {
  if (!(await authorizedAppCall(req))) return NextResponse.json({ ok: false }, { status: 401 });

  const ids = naverBookingIds(site.academy.naverBookingUrl);
  if (!ids) return NextResponse.json({ ok: false, error: "naver booking url" }, { status: 500 });

  const admin = createAdminClient();
  const range = naverRange(new Date());

  let slots;
  try {
    const res = await fetch("https://m.booking.naver.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Referer: `https://m.booking.naver.com/booking/${ids.businessTypeId}/bizes/${ids.businessId}/items/${ids.bizItemId}`,
      },
      body: JSON.stringify({
        operationName: "hourlySchedule",
        query: HOURLY_QUERY,
        variables: {
          scheduleParams: { ...ids, startDateTime: range.startDateTime, endDateTime: range.endDateTime, fixedTime: true },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    // 막혔으면 우회하지 않고 한 시간 쉰다 (첫토익 문서 6.5). 처음 막혔을 때 한 번만 알린다
    if (res.status === 403 || res.status === 429) {
      const n = await recordFailure(admin, `네이버가 조회를 막았어요 (HTTP ${res.status}). 한 시간 뒤 다시 확인해요`, 60);
      if (n === 1) {
        await notifyStaff("naver_reservation", {
          title: "네이버 예약 확인이 막혔어요",
          body: `네이버가 조회를 거절했어요 (HTTP ${res.status}). 한 시간 동안 쉬었다가 다시 확인해요.`,
          url: NAVER_PAGE,
          tag: "naver-sync-error",
        });
      }
      return NextResponse.json({ ok: false, error: "blocked", status: res.status }, { status: 502 });
    }
    if (!res.ok) throw new Error(`네이버 응답 HTTP ${res.status}`);
    slots = parseHourly(await res.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[naver-sync]", message);
    const n = await recordFailure(admin, message);
    if (n === ALERT_AFTER_FAILURES) {
      await notifyStaff("naver_reservation", {
        title: "네이버 예약 확인이 한 시간째 안 돼요",
        body: `마지막 오류: ${message.slice(0, 80)}. 그동안 들어온 예약은 다시 확인되면 알려 드려요.`,
        url: NAVER_PAGE,
        tag: "naver-sync-error",
      });
    }
    return NextResponse.json({ ok: false, error: "fetch" }, { status: 502 });
  }

  const { data, error } = await admin.rpc("naver_apply_snapshot", { p_from: range.fromIso, p_to: range.toIso, p_slots: slots });
  if (error || !data) {
    console.error("[naver-sync] apply", error?.message);
    await recordFailure(admin, `저장 실패: ${error?.message ?? "빈 응답"}`);
    return NextResponse.json({ ok: false, error: "apply" }, { status: 500 });
  }

  const result = data as { first: boolean; held: boolean; slots: number; events: BookingEvent[] };
  if (!result.held) await pushEvents(result.events ?? []);

  return NextResponse.json({ ok: true, first: result.first, held: result.held, slots: result.slots, events: (result.events ?? []).length });
}
