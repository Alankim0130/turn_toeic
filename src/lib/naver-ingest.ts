import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaff } from "@/lib/push";
import { koreanTime, parseNaverReservation, RESERVATION_STATUS_LABEL, type ParsedReservation, type ReservationStatus } from "@/lib/naver-reservation";
import { formatDate, todayKST } from "@/lib/utils";

type Summary = {
  status: ReservationStatus;
  date: string | null;
  time: string | null;
  itemName: string | null;
  customerName: string | null;
  bookingNumber: string | null;
  parsed: boolean;
};

export type IngestResult = { id: number; duplicate: boolean; notify: boolean; reservation: Summary };

/** 알림 제목·본문. 날짜를 모르면 원문 앞부분을 그대로 보여준다 */
export function reservationMessage(r: Pick<Summary, "status" | "date" | "time" | "itemName" | "customerName">, rawText: string) {
  const label = RESERVATION_STATUS_LABEL[r.status];
  const when = r.date ? `${formatDate(r.date, { month: "long", day: "numeric", weekday: "short" })}${r.time ? ` ${koreanTime(r.time)}` : ""}` : null;
  const detail = [r.itemName, r.customerName ? `${r.customerName}님` : null].filter(Boolean).join(" · ");
  return {
    title: when ? `네이버 ${label} · ${when}` : `네이버 ${label}`,
    body: detail || rawText.replace(/\s+/g, " ").slice(0, 90),
  };
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

/**
 * 네이버 예약 알림 원문 하나를 저장하고 필요하면 스태프에게 푸시한다.
 * 같은 예약번호가 다시 오면 기존 기록에 합친다. 나중 알림에 없는 정보(상품명·이름 등)는 지우지 않고,
 * 상태·일시가 실제로 바뀐 경우에만 알림을 보낸다 (같은 알림의 중복 전달은 무시).
 */
export async function ingestNaverText(rawText: string, source: string): Promise<IngestResult> {
  const r: ParsedReservation = parseNaverReservation(rawText, todayKST());
  const dedupeKey = r.bookingNumber
    ? `bn:${r.bookingNumber}`
    : `tx:${createHash("sha256").update(r.text.replace(/\s+/g, "")).digest("hex").slice(0, 40)}`;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("naver_reservations")
    .select("id, status, item_name, customer_name, reserved_date, reserved_time, booking_number, parsed")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  const merged: Summary = existing
    ? {
        status: r.status !== "unknown" ? r.status : (existing.status as ReservationStatus),
        date: r.date ?? existing.reserved_date,
        time: r.time ?? hhmm(existing.reserved_time),
        itemName: r.itemName ?? existing.item_name,
        customerName: r.customerName ?? existing.customer_name,
        bookingNumber: r.bookingNumber ?? existing.booking_number,
        parsed: r.parsed || existing.parsed,
      }
    : { status: r.status, date: r.date, time: r.time, itemName: r.itemName, customerName: r.customerName, bookingNumber: r.bookingNumber, parsed: r.parsed };

  const row = {
    dedupe_key: dedupeKey,
    status: merged.status,
    item_name: merged.itemName,
    customer_name: merged.customerName,
    reserved_date: merged.date,
    reserved_time: merged.time,
    booking_number: merged.bookingNumber,
    source: source.slice(0, 30),
    raw_text: r.text.slice(0, 4000),
    parsed: merged.parsed,
  };

  let id: number;
  let notify = true;

  if (existing) {
    id = existing.id;
    notify =
      merged.status !== existing.status || merged.date !== existing.reserved_date || (merged.time ?? "") !== (hhmm(existing.reserved_time) ?? "");
    if (notify) {
      const { error } = await admin
        .from("naver_reservations")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
  } else {
    const { data, error } = await admin.from("naver_reservations").insert(row).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "insert failed");
    id = data.id;
  }

  if (notify) {
    const msg = reservationMessage(merged, r.text);
    await notifyStaff("naver_reservation", { ...msg, url: "/admin#naver-reservations", tag: `naver-${id}` });
  }

  return { id, duplicate: !notify, notify, reservation: merged };
}
