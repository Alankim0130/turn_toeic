import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/server";
import { slotLabel } from "@/lib/naver-booking";
import { site } from "@/lib/site";
import { cn, formatDate, todayKST } from "@/lib/utils";

/** 칸 시작 시각 → 한국 날짜 "YYYY-MM-DD" */
const kstDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
/** "오후 3:20" */
const kstTime = (iso: string) => slotLabel(iso).replace(/^.*\) /, "");
/** "2026-09-23" → "9/23" */
const monthDay = (d: string) => {
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day}`;
};

const KIND: Record<string, { label: string; className: string }> = {
  booked: { label: "접수", className: "bg-brand-500 text-white" },
  cancelled: { label: "취소", className: "bg-line text-slate line-through" },
  vanished: { label: "확인 필요", className: "bg-amber-100 text-amber-800" },
};

/** "3분 전" · "2시간 전" · 하루가 넘으면 날짜 */
function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}시간 전`;
  return formatDate(iso, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * 관리자 대시보드: 네이버 예약 위젯 (2026-09-21 — 첫토익과 같은 방식).
 * 10분마다 네이버 예약 페이지를 확인한 결과(`naver_booking_slots` · `naver_booking_events`)를 그대로 보여 준다.
 * 예약자 이름은 네이버가 주지 않는다 — 날짜·시각·인원만 있다.
 */
export async function NaverReservationsWidget() {
  const supabase = await createClient();
  const today = todayKST();
  const [{ data: upcoming }, { data: recent }, { data: status }] = await Promise.all([
    supabase
      .from("naver_booking_slots")
      .select("slot_at, booking_count, stock")
      .gt("booking_count", 0)
      .gte("slot_at", new Date().toISOString())
      .order("slot_at", { ascending: true })
      .limit(8),
    supabase.from("naver_booking_events").select("id, slot_at, kind, prev_count, new_count, stock, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("naver_sync_status").select("last_success_at, last_error, last_error_at, consecutive_failures, retry_after").maybeSingle(),
  ]);

  const booked = (upcoming ?? []).reduce((n, s) => n + s.booking_count, 0);
  const failing = (status?.consecutive_failures ?? 0) > 0;
  const neverRan = !status?.last_success_at;

  return (
    <section id="naver-reservations" aria-labelledby="naver-title" className="card scroll-mt-24 p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="calendar" size={28} />
          <h2 id="naver-title" className="text-lg font-black text-ink">네이버 예약</h2>
          {booked > 0 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black text-white">{booked}</span>}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <a href={site.academy.naverBookingUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-600 hover:underline">
            예약 페이지
          </a>
          <Link href="/admin/notifications#naver" className="font-bold text-brand-600 hover:underline">
            알림 설정
          </Link>
        </div>
      </div>

      <p className={cn("mb-4 rounded-lg px-3 py-2 text-xs", failing ? "bg-amber-50 text-amber-800" : "bg-surface text-slate")} role={failing ? "status" : undefined}>
        {neverRan
          ? "10분마다 네이버 예약 페이지를 확인해요. 첫 확인을 기다리는 중이에요."
          : failing
            ? `확인이 ${status?.consecutive_failures}번 연속 실패했어요 · ${status?.last_error ?? "알 수 없는 오류"} · 마지막 성공 ${ago(status!.last_success_at!)}`
            : `10분마다 네이버 예약 페이지를 확인해요 · 마지막 확인 ${ago(status!.last_success_at!)}`}
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate">다가오는 예약</h3>
          {(upcoming ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-slate">
              {neverRan ? "확인이 끝나면 잡힌 예약이 여기에 떠요." : "지금 잡힌 상담 예약이 없어요."}
            </p>
          ) : (
            <ul className="space-y-2">
              {(upcoming ?? []).map((s) => {
                const day = kstDate(s.slot_at);
                const isToday = day === today;
                return (
                  <li key={s.slot_at} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <div className={cn("flex w-16 shrink-0 flex-col items-center rounded-lg py-1.5", isToday ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-700")}>
                      <span className="text-[11px] font-bold">{isToday ? "오늘" : formatDate(day, { weekday: "short" })}</span>
                      <span className="text-lg font-black leading-none tabular-nums">{monthDay(day)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-ink">{kstTime(s.slot_at)}</p>
                      <p className="truncate text-sm text-slate">강사상담</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                      {s.booking_count}/{s.stock}명
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold text-slate">최근 변동</h3>
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
                      <span className="text-[11px] text-mist">{ago(e.created_at)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
