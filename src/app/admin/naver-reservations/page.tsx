import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireStaff } from "@/lib/auth";
import { bookingsByDay, checkedAgo, slotLabel, slotPassed, slotTime } from "@/lib/naver-booking";
import { site } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { shiftDate } from "@/lib/term-window";
import { cn, formatDate, todayKST } from "@/lib/utils";

export const metadata: Metadata = { title: "네이버 예약", robots: { index: false } };

const KIND: Record<string, { label: string; className: string }> = {
  booked: { label: "접수", className: "bg-brand-500 text-white" },
  cancelled: { label: "취소", className: "bg-line text-slate line-through" },
  vanished: { label: "확인 필요", className: "bg-amber-100 text-amber-800" },
};

/**
 * 네이버 예약 (2026-09-23 Alan — "네이버예약 카드를 클릭하면 지금은 아래로 화면이 내려가는데, 아래에 있는 부분을 없애고
 * 별도의 페이지를 만들어서 해당페이지로 넘어가도록"). 그전에는 대시보드 아래의 위젯이었다 — 대시보드에는 오늘 · 내일 위젯만 남는다.
 * 10분마다 네이버 예약 페이지를 확인한 결과(`naver_booking_slots` · `naver_booking_events`)를 그대로 보여 준다 (도메인 규칙 8).
 * **예약자 이름은 네이버가 주지 않는다** — 날짜 · 시각 · 인원만 있다. 강사에게 가는 푸시도 이 화면으로 온다 (`NAVER_PAGE`).
 */
export default async function NaverReservationsPage() {
  // 대시보드와 같이 강사·관리자만 — 네이버 예약 표는 스태프만 읽는다
  await requireStaff();
  const supabase = await createClient();
  const today = todayKST();
  const tomorrow = shiftDate(today, 1);

  const [{ data: slots, error: slotsError }, { data: recent }, { data: status }] = await Promise.all([
    // 오늘 0시(한국)부터 — 오늘 이미 지난 시각도 함께 보여 준다 (대시보드 '오늘 예약' 과 같은 수가 되게)
    supabase
      .from("naver_booking_slots")
      .select("slot_at, booking_count, stock")
      .gt("booking_count", 0)
      .gte("slot_at", new Date(`${today}T00:00:00+09:00`).toISOString())
      .order("slot_at", { ascending: true })
      .limit(500),
    supabase.from("naver_booking_events").select("id, slot_at, kind, prev_count, new_count, stock, created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("naver_sync_status").select("last_success_at, last_error, consecutive_failures").maybeSingle(),
  ]);

  const days = bookingsByDay(slots ?? []);
  const total = days.reduce((n, d) => n + d.total, 0);
  const failing = (status?.consecutive_failures ?? 0) > 0;
  const neverRan = !status?.last_success_at;

  return (
    <>
      <PageHeader
        icon="calendar"
        title="네이버 예약"
        description="네이버 예약 '역전토익 강사상담' 을 10분마다 확인해요. 네이버는 예약한 사람이 누구인지 알려 주지 않아 날짜 · 시각 · 인원만 보여요."
      >
        <a href={site.academy.naverBookingUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
          예약 페이지
        </a>
        <Link href="/admin/notifications#naver" className="btn-ghost">
          알림 설정
        </Link>
      </PageHeader>
      <div className="mb-4">
        <Link href="/admin" className="text-sm font-bold text-brand-600 hover:underline">
          ← 대시보드
        </Link>
      </div>

      <p className={cn("mb-6 rounded-lg px-3 py-2 text-xs", failing ? "bg-amber-50 text-amber-800" : "bg-surface text-slate")} role={failing ? "status" : undefined}>
        {neverRan
          ? "10분마다 네이버 예약 페이지를 확인해요. 첫 확인을 기다리는 중이에요."
          : failing
            ? `확인이 ${status?.consecutive_failures}번 연속 실패했어요 · ${status?.last_error ?? "알 수 없는 오류"} · 마지막 성공 ${checkedAgo(status!.last_success_at!)}`
            : `10분마다 네이버 예약 페이지를 확인해요 · 마지막 확인 ${checkedAgo(status!.last_success_at!)}`}
      </p>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="upcoming-title" className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <h2 id="upcoming-title" className="text-lg font-black text-ink">잡힌 예약</h2>
            {total > 0 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black text-white">{total}명</span>}
          </div>
          {slotsError ? (
            <p className="rounded-xl bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">예약을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>
          ) : days.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-slate">
              {neverRan ? "확인이 끝나면 잡힌 예약이 여기에 떠요." : "지금 잡힌 상담 예약이 없어요."}
            </p>
          ) : (
            <ol className="space-y-5">
              {days.map((d) => (
                <li key={d.day}>
                  <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black text-ink">
                    {formatDate(d.day)}
                    {d.day === today && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] text-white">오늘</span>}
                    {d.day === tomorrow && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">내일</span>}
                    <span className="text-xs font-bold text-slate">· {d.total}명</span>
                  </h3>
                  <ul className="space-y-2">
                    {d.slots.map((s) => {
                      const past = slotPassed(s.slot_at);
                      return (
                        <li key={s.slot_at} className={cn("flex items-center gap-3 rounded-xl border border-line p-3", past && "opacity-60")}>
                          <Icon name="timeslot" size={20} />
                          <div className="min-w-0 flex-1">
                            <p className="font-black text-ink tabular-nums">
                              {slotTime(s.slot_at)}
                              {past && <span className="ml-1.5 text-xs font-bold text-mist">지남</span>}
                            </p>
                            <p className="truncate text-sm text-slate">강사상담</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                            {s.booking_count}/{s.stock}명
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="recent-title" className="card p-5">
          <h2 id="recent-title" className="mb-4 text-lg font-black text-ink">최근 변동</h2>
          {(recent ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-slate">
              새로 잡히거나 취소된 예약이 생기면 여기에 쌓이고 알림이 가요.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {(recent ?? []).map((e) => {
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
        </section>
      </div>
    </>
  );
}
