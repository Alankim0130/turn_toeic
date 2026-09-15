import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/server";
import { koreanTime, RESERVATION_STATUS_LABEL, type ReservationStatus } from "@/lib/naver-reservation";
import { cn, formatDate, todayKST } from "@/lib/utils";

const STATUS_CLASS: Record<ReservationStatus, string> = {
  requested: "bg-brand-500 text-white",
  confirmed: "bg-ink text-white",
  changed: "bg-amber-100 text-amber-800",
  cancelled: "bg-line text-slate line-through",
  unknown: "bg-surface text-slate",
};

function StatusChip({ status }: { status: string }) {
  const s = (status in STATUS_CLASS ? status : "unknown") as ReservationStatus;
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", STATUS_CLASS[s])}>{RESERVATION_STATUS_LABEL[s].replace("예약 ", "")}</span>;
}

const monthDay = (d: string) => {
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day}`;
};

/** 관리자 대시보드: 네이버 예약 위젯 (다가오는 예약 + 최근 받은 알림) */
export async function NaverReservationsWidget() {
  const supabase = await createClient();
  const today = todayKST();
  const [{ data: upcoming }, { data: recent }] = await Promise.all([
    supabase
      .from("naver_reservations")
      .select("id, status, item_name, customer_name, reserved_date, reserved_time")
      .gte("reserved_date", today)
      .neq("status", "cancelled")
      .order("reserved_date", { ascending: true })
      .order("reserved_time", { ascending: true, nullsFirst: false })
      .limit(6),
    supabase
      .from("naver_reservations")
      .select("id, status, item_name, customer_name, reserved_date, reserved_time, parsed, raw_text, received_at")
      .order("received_at", { ascending: false })
      .limit(5),
  ]);

  const hasAny = (recent ?? []).length > 0;

  return (
    <section id="naver-reservations" aria-labelledby="naver-title" className="card scroll-mt-24 p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="calendar" size={28} />
          <h2 id="naver-title" className="text-lg font-black text-ink">네이버 예약</h2>
          {(upcoming ?? []).length > 0 && (
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black text-white">{(upcoming ?? []).length}</span>
          )}
        </div>
        <Link href="/admin/notifications#naver" className="text-sm font-bold text-brand-600 hover:underline">
          연결·알림 설정
        </Link>
      </div>

      {!hasAny ? (
        <div className="rounded-xl bg-brand-50/60 px-4 py-8 text-center text-sm text-slate">
          <p className="font-bold text-ink">아직 받은 네이버 예약이 없어요</p>
          <p className="mt-1">네이버 예약 알림을 이 사이트로 전달하도록 연결하면 예약 날짜와 시각이 여기에 바로 표시돼요.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-bold text-slate">다가오는 예약</h3>
            {(upcoming ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-slate">오늘 이후 잡힌 예약이 없어요.</p>
            ) : (
              <ul className="space-y-2">
                {(upcoming ?? []).map((r) => {
                  const isToday = r.reserved_date === today;
                  return (
                    <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                      <div className={cn("flex w-16 shrink-0 flex-col items-center rounded-lg py-1.5", isToday ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-700")}>
                        <span className="text-[11px] font-bold">{isToday ? "오늘" : formatDate(r.reserved_date!, { weekday: "short" })}</span>
                        <span className="text-lg font-black leading-none tabular-nums">{monthDay(r.reserved_date!)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-ink">{r.reserved_time ? koreanTime(r.reserved_time) : "시간 확인 필요"}</p>
                        <p className="truncate text-sm text-slate">
                          {[r.item_name, r.customer_name ? `${r.customer_name}님` : null].filter(Boolean).join(" · ") || "네이버 예약"}
                        </p>
                      </div>
                      <StatusChip status={r.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-slate">최근 받은 알림</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {(recent ?? []).map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    {r.parsed && r.reserved_date ? (
                      <p className="font-bold text-ink">
                        {formatDate(r.reserved_date, { month: "long", day: "numeric", weekday: "short" })} {koreanTime(r.reserved_time)}
                      </p>
                    ) : (
                      <p className="font-bold text-amber-800">날짜를 읽지 못한 알림</p>
                    )}
                    <p className="truncate text-xs text-slate">
                      {r.parsed ? [r.item_name, r.customer_name ? `${r.customer_name}님` : null].filter(Boolean).join(" · ") || "네이버 예약" : (r.raw_text ?? "").replace(/\s+/g, " ").slice(0, 70)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip status={r.status} />
                    <span className="text-[11px] text-mist">{formatDate(r.received_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
