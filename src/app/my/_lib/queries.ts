import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";

/** 수강생 영역에서 쓰는 조회 함수. 전부 사용자 세션 클라이언트라 RLS 가 접근 범위를 정한다. */

const SECTION_COLS = `
  id, term_id, track, start_time, end_time, time_block, enrollment_opens_at, closes_at, status,
  course:courses(name, course_type, target_score),
  term:terms(year, month)
` as const;

export async function getMyOrders() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollment_orders")
    .select(
      `id, status, activates_on, access_until, created_at,
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

/**
 * 스터디 자격 (DB 의 private.is_term_enrollee / has_term_access 와 같은 규칙)
 *  - signupTerms: 그 달 반에 배정 + 주문이 예비등록·수강 중 + 종강 전 → 신청 가능
 *  - accessTerms: 그중 주문이 수강 중(active) → 비대면 자료·LC 음원 열람
 * 실제 권한은 RLS 가 판단하고, 이 값은 화면 안내용이다.
 */
export async function getMyStudyEligibility(orders?: MyOrder[]) {
  const list = orders ?? (await getMyOrders());
  const today = todayKST();
  const signupTerms = new Set<number>();
  const accessTerms = new Set<number>();
  const opensOn = new Map<number, string>(); // 예비등록생: 기수별 개강일
  for (const o of list) {
    if (o.status !== "preliminary" && o.status !== "active") continue;
    for (const e of o.enrollments) {
      if (e.status !== "active" || !e.section || today > e.section.closes_at) continue;
      signupTerms.add(e.section.term_id);
      if (o.status === "active") accessTerms.add(e.section.term_id);
      else opensOn.set(e.section.term_id, o.activates_on);
    }
  }
  return { signupTerms, accessTerms, opensOn };
}

/** 내 스터디 신청 (기수·유형·시간대 포함) */
export async function getMyStudySignups() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_signups")
    .select(
      `id, study_id, slot_id, created_at,
       study:studies!study_signups_study_id_fkey(id, kind, status, notice, term_id, term:terms(id, year, month)),
       slot:study_slots!study_signups_slot_id_study_id_fkey(id, start_time, end_time)`,
    )
    .order("created_at", { ascending: false });
  return (data ?? []).filter((s) => s.study);
}
export type MyStudySignup = Awaited<ReturnType<typeof getMyStudySignups>>[number];

/** 내가 받을 수 있는 비대면 자료 (RLS: 신청했고, 수강 중이고, 해당 날짜가 된 것만) */
export async function getMyStudyMaterials() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_materials")
    .select("id, study_id, date, title, file_name, file_size, content_type, updated_at")
    .order("date", { ascending: false });
  return data ?? [];
}
export type MyStudyMaterial = Awaited<ReturnType<typeof getMyStudyMaterials>>[number];

/** 내 숙제 제출물과 파일 */
export async function getMyHomework() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("homework_submissions")
    .select("id, material_id, status, created_at, checked_at, homework_files(id, file_name, file_size, content_type, created_at)")
    .order("created_at", { ascending: false });
  return data ?? [];
}
export type MyHomework = Awaited<ReturnType<typeof getMyHomework>>[number];

/** LC 음원듣기: 레벨 목록 + 들을 수 있는 음원·교재 이미지 (RLS: 지금 수강 중인 수강생) */
export async function getMyLcAudio() {
  const supabase = await createClient();
  const [{ data: levels }, { data: tracks }, { data: images }] = await Promise.all([
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
    supabase.from("lc_audio_tracks").select("id, title, level"),
    supabase.from("lc_textbook_images").select("id, level, file_name").order("created_at"),
  ]);
  return { levels: (levels ?? []).map((l) => l.level), tracks: tracks ?? [], images: images ?? [] };
}

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
