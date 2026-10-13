import type { Metadata } from "next";
import Link from "next/link";
import { HeartGlyph, NaverBookingCalendar } from "@/components/admin/naver/NaverBookingCalendar";
import { requireStaff } from "@/lib/auth";
import { calendarMonths, checkedAgo, NAVER_DAYS_AHEAD, slotLabel } from "@/lib/naver-booking";
import { site } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { shiftDate } from "@/lib/term-window";
import { cn, todayKST } from "@/lib/utils";

export const metadata: Metadata = { title: "네이버 예약 현황", robots: { index: false } };

const KIND: Record<string, { label: string; className: string }> = {
  booked: { label: "접수", className: "bg-brand-500 text-white" },
  cancelled: { label: "취소", className: "bg-line text-slate line-through" },
  vanished: { label: "확인 필요", className: "bg-amber-100 text-amber-800" },
};

/** 바깥으로 나가는 화살표 — 네이버 예약 페이지로 가는 버튼 (도형) */
function ExternalGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-none stroke-current" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

/**
 * 네이버 예약 현황 (2026-09-23 Alan — 대시보드 카드를 누르면 아래로 내려가던 것을 따로 뗀 화면 → **2026-10-13 Alan — 첫토익 화면을 보여 주며
 * "네이버 예약을 클릭하면 이렇게 보이도록"**: 달력 + 고른 날의 예약). 그전에는 오늘 0시부터 잡힌 예약을 날짜별 목록으로 쌓았다.
 * 10분마다 네이버 예약 페이지를 확인한 결과(`naver_booking_slots` · `naver_booking_events`)를 그대로 보여 준다 (도메인 규칙 8).
 * **예약자 이름은 네이버가 주지 않는다** — 날짜 · 시각 · 인원만 있다. 강사에게 가는 푸시도 이 화면으로 온다 (`NAVER_PAGE`).
 */
export default async function NaverReservationsPage() {
  // 대시보드와 같이 강사·관리자만 — 네이버 예약 표는 스태프만 읽는다
  await requireStaff();
  const supabase = await createClient();
  const today = todayKST();
  const months = calendarMonths(today);

  const [{ data: slots, error: slotsError }, { data: recent }, { data: status }] = await Promise.all([
    // 달력이 보여 줄 칸 전부 — 예약이 0 인 칸도 받는다 ("예약 가능 시간" 이 거기서 나온다). 오늘 0시(한국)부터 조회 범위 끝까지
    supabase
      .from("naver_booking_slots")
      .select("slot_at, booking_count, stock, is_sale_day")
      .gte("slot_at", new Date(`${today}T00:00:00+09:00`).toISOString())
      .lt("slot_at", new Date(`${shiftDate(today, NAVER_DAYS_AHEAD + 1)}T00:00:00+09:00`).toISOString())
      .order("slot_at", { ascending: true })
      .limit(5000),
    supabase.from("naver_booking_events").select("id, slot_at, kind, prev_count, new_count, stock, created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("naver_sync_status").select("last_success_at, last_error, consecutive_failures").maybeSingle(),
  ]);

  const failing = (status?.consecutive_failures ?? 0) > 0;
  const neverRan = !status?.last_success_at;
  const events = recent ?? [];

  return (
    <>
      <header className="mb-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">네이버 예약 현황</h1>
          {/* 첫토익의 '네이버' 버튼 — 역전토익 강사상담 예약 페이지(새 창) */}
          <a
            href={site.academy.naverBookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line bg-paper px-3 py-1.5 text-xs font-black text-ink transition hover:border-brand-300 hover:text-brand-600"
          >
            네이버
            <ExternalGlyph />
          </a>
        </div>
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-slate">
          상담 예약 · 10분마다 자동 확인 ·
          <span className="inline-flex items-center gap-0.5">
            <HeartGlyph className="size-3.5 text-brand-500" />
            있는 날은 예약이 있어요
          </span>
        </p>
      </header>
      <div className="mb-4">
        <Link href="/admin" className="text-sm font-bold text-brand-600 hover:underline">
          ← 대시보드
        </Link>
      </div>

      {slotsError ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">예약을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>
      ) : (
        <NaverBookingCalendar today={today} months={months} slots={slots ?? []} />
      )}

      {/* 마지막 확인 — 확인이 멈추면 "예약 없음" 이 거짓말이 된다 (크론 '성공' 기록은 믿을 수 없다 — 도메인 규칙 8) */}
      <p className={cn("mt-4 flex flex-wrap items-center gap-x-2 rounded-lg px-3 py-2 text-xs", failing ? "bg-amber-50 text-amber-800" : "bg-surface text-slate")} role={failing ? "status" : undefined}>
        <span>
          {neverRan
            ? "10분마다 네이버 예약 페이지를 확인해요 · 첫 확인을 기다리는 중이에요."
            : failing
              ? `확인이 ${status?.consecutive_failures}번 연속 실패했어요 · ${status?.last_error ?? "알 수 없는 오류"} · 마지막 성공 ${checkedAgo(status!.last_success_at!)}`
              : `마지막 확인 ${checkedAgo(status!.last_success_at!)} · 예약한 사람이 누구인지는 네이버가 알려 주지 않아요.`}
        </span>
        <Link href="/admin/notifications#naver" className="font-bold text-brand-600 hover:underline">
          알림 설정
        </Link>
      </p>

      {/* 최근 변동 — 접어 둔다. 푸시가 가리키는 '확인 필요' 가 여기 남는다 */}
      <details className="card mt-4 px-4 py-3 sm:px-5">
        <summary className="cursor-pointer text-sm font-black text-ink">
          최근 변동 {events.length > 0 && <span className="ml-1 text-xs font-bold text-slate">{events.length}건</span>}
        </summary>
        {events.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-slate">새로 잡히거나 취소된 예약이 생기면 여기에 쌓이고 알림이 가요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {events.map((e) => {
              const k = KIND[e.kind] ?? KIND.vanished;
              return (
                <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold text-ink">{slotLabel(e.slot_at)}</p>
                    <p className="truncate text-xs text-slate">
                      {e.kind === "vanished" ? `예약 ${e.prev_count}명이 있던 칸이 사라졌어요` : `${e.prev_count}명 → ${e.new_count}명${e.stock ? ` (정원 ${e.stock}명)` : ""}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", k.className)}>{k.label}</span>
                    <span className="text-[11px] text-mist">{checkedAgo(e.created_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </>
  );
}
