import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";

/** 수강생 영역에서 쓰는 조회 함수. 전부 사용자 세션 클라이언트라 RLS 가 접근 범위를 정한다. */

const SECTION_COLS = `
  id, track, start_time, end_time, time_block, enrollment_opens_at, closes_at, status,
  course:courses(name, course_type, target_score),
  term:terms(year, month)
` as const;

export async function getMyOrders() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollment_orders")
    .select(
      `id, months, status, activates_on, access_until, created_at,
       enrollments:enrollments!enrollments_order_id_fkey(
         id, status, mode,
         section:class_sections!enrollments_section_id_fkey(${SECTION_COLS})
       )`,
    )
    .order("created_at", { ascending: false });
  return data ?? [];
}
export type MyOrder = Awaited<ReturnType<typeof getMyOrders>>[number];

export async function getMyVerifications() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollment_verifications")
    .select("id, created_at, result, reject_reason, parsed, matched_section")
    .order("created_at", { ascending: false })
    .limit(10);
  return data ?? [];
}
export type MyVerification = Awaited<ReturnType<typeof getMyVerifications>>[number];

export async function getMySessions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("session_dates")
    .select(`id, seq, date, start_time, end_time, section:class_sections(${SECTION_COLS})`)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  return data ?? [];
}
export type MySession = Awaited<ReturnType<typeof getMySessions>>[number];

export async function getMyLiveLinks() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("section_live_links")
    .select(`section_id, live_url, updated_at, section:class_sections(${SECTION_COLS})`)
    .order("section_id", { ascending: true });
  return data ?? [];
}
export type MyLiveLink = Awaited<ReturnType<typeof getMyLiveLinks>>[number];

/** 오늘 이후 첫 수업일을 section_id 별로 */
export async function getNextSessionBySection(sectionIds: number[]) {
  if (sectionIds.length === 0) return new Map<number, { date: string; start_time: string; end_time: string; seq: number }>();
  const supabase = await createClient();
  const { data } = await supabase
    .from("session_dates")
    .select("section_id, seq, date, start_time, end_time")
    .in("section_id", sectionIds)
    .gte("date", todayKST())
    .order("date", { ascending: true });
  const map = new Map<number, { date: string; start_time: string; end_time: string; seq: number }>();
  for (const s of data ?? []) if (!map.has(s.section_id)) map.set(s.section_id, s);
  return map;
}

export async function getMyReplays() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("replays")
    .select(
      `id, video_url, published_at,
       session:session_dates(id, seq, date, start_time, end_time, section:class_sections(${SECTION_COLS}))`,
    )
    .order("published_at", { ascending: false });
  return data ?? [];
}
export type MyReplay = Awaited<ReturnType<typeof getMyReplays>>[number];

/** 불라방(live) 활성 등록 — 교재신청 대상 */
export async function getMyLiveEnrollments() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select(`id, mode, status, section:class_sections!enrollments_section_id_fkey(${SECTION_COLS})`)
    .eq("mode", "live")
    .eq("status", "active");
  return (data ?? []).filter((e) => e.section);
}
export type MyLiveEnrollment = Awaited<ReturnType<typeof getMyLiveEnrollments>>[number];

export async function getMyTextbookOrders() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("textbook_orders")
    .select(
      `id, recipient_name, phone, postal_code, address, address_detail, quantity, memo, status, tracking_no, created_at,
       section:class_sections(id, track, course:courses(name), term:terms(year, month))`,
    )
    .order("created_at", { ascending: false });
  return data ?? [];
}
export type MyTextbookOrder = Awaited<ReturnType<typeof getMyTextbookOrders>>[number];

/** 라벨 */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  preliminary: "예비등록",
  active: "수강 중",
  expired: "만료",
};
export const VERIFICATION_STATUS_LABEL = (result: string | null) =>
  result === "approved" ? "승인" : result === "rejected" ? "반려" : "확인 중";
export const TEXTBOOK_STATUS_LABEL: Record<string, string> = {
  requested: "신청됨",
  confirmed: "확인됨",
  shipped: "발송됨",
  cancelled: "취소됨",
};

export function termLabel(term: { year: number; month: number } | null | undefined) {
  return term ? `${term.year}년 ${term.month}월` : "기수 미정";
}

/** "YYYY-MM-DD" 의 월 */
export function monthOf(date: string) {
  return Number(date.slice(5, 7));
}
