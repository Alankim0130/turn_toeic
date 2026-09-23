import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { todayKST } from "@/lib/utils";
import { week5SectionIds } from "@/lib/week5";
import type { EnrollSection } from "@/lib/enroll-options";
import { fetchOpenEnrollSections } from "@/lib/open-sections";

/**
 * 수강생 영역에서 쓰는 조회 함수. 전부 사용자 세션 클라이언트라 RLS 가 접근 범위를 정한다.
 *
 * **단 "내 것" 은 RLS 에만 맡기지 않는다** (2026-09-23 Alan — 숙제제출 달력에 "750, 850반이 전부 다 나와").
 * 학생 화면의 RLS 정책들은 대부분 `… or private.is_staff()` 라 **강사·관리자에게는 모든 반·모든 학생이 열린다** —
 * 관리자 화면에는 맞지만 `/my` 에서 그대로 쓰면 남의 반 수업일과 **남의 등록 현황**이 내 화면에 선다.
 * 그래서 여기서는 **내 반**(`public.my_section_ids()`)과 **내 user_id** 로 한 번 더 좁힌다.
 * 학생에게는 달라지는 것이 없다 — `private.has_section_access` 와 `my_section_ids()` 는 같은 조건이고
 * (본인 배정 · 등록 active · 종강 전), 등록도 본인 것만 보였다.
 */

const SECTION_COLS = `
  id, course_id, term_id, track, start_time, end_time, time_block, enrollment_opens_at, closes_at, status, book_set, subject, recorded, live_to_replay,
  course:courses(name, course_type, target_score, program, includes_levels),
  term:terms(year, month)
` as const;

/**
 * 지금 접근할 수 있는 반 — 직접 배정된 반 + 스파르타반이 함께 여는 점수보장반(예: 650 10:00 + 850 12:30).
 * 어떤 반이 열리는지는 DB 의 my_section_ids() (private.section_includes) 가 정한다. 화면에서 따로 계산하지 말 것.
 */
export async function getMyAccessibleSections() {
  const supabase = await createClient();
  const { data: ids } = await supabase.rpc("my_section_ids");
  if (!ids || ids.length === 0) return [];
  const { data } = await supabase.from("class_sections").select(SECTION_COLS).in("id", ids);
  return data ?? [];
}
export type MyAccessibleSection = Awaited<ReturnType<typeof getMyAccessibleSections>>[number];

/**
 * 부모 반 → **함께 열리는 반** (묶음 반 → 시간 단위 반, 스파르타 반 → 겹치는 레벨의 시간 단위 반).
 * 판정은 DB 한곳(`private.section_includes`)이다 — 화면에서 다시 계산하지 말 것 (도메인 규칙 1 "반 권한").
 */
export async function getMySectionIncludes(termIds: (number | null)[]) {
  const ids = [...new Set(termIds.filter((t): t is number => typeof t === "number"))];
  if (ids.length === 0) return new Map<number, Set<number>>();
  const supabase = await createClient();
  const out = new Map<number, Set<number>>();
  const rows = await Promise.all(ids.map((t) => supabase.rpc("term_section_includes", { p_term_id: t })));
  for (const { data } of rows) {
    for (const r of data ?? []) out.set(r.section_id, (out.get(r.section_id) ?? new Set<number>()).add(r.included_id));
  }
  return out;
}

/**
 * 내 반 중 **주5일인 반의 id** (2026-09-16 Alan: 학생에게는 월수금·화목금 대신 "주5일" 로 보여 준다).
 * 접근 가능한 반 전체로 판정한다 — 다시보기처럼 일부만 나오는 화면에서도 같은 이름이 나와야 한다.
 */
export async function getMyWeek5(sections?: MyAccessibleSection[]) {
  return week5SectionIds(sections ?? (await getMyAccessibleSections()));
}

/** 내 등록. **`user_id` 로 좁힌다** — 정책 `orders: 본인·스태프·조교 조회` 는 스태프에게 전부 열려 있다 (머리말) */
export async function getMyOrders() {
  const { user } = await getSessionProfile();
  if (!user) return [];
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
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return data ?? [];
}
export type MyOrder = Awaited<ReturnType<typeof getMyOrders>>[number];

/**
 * 지금 등업신청을 받는 반 — 아직 종강하지 않은 공개 반 (조건은 `fetchOpenEnrollSections` 한곳).
 * 수동 등업신청의 레벨·요일·시간대 선택지가 여기서 나온다 (작업 원칙 4 — 코드에 시간대를 적지 않는다).
 */
export async function getOpenEnrollSections(): Promise<EnrollSection[]> {
  return fetchOpenEnrollSections(await createClient());
}

export async function getMyVerifications() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollment_verifications")
    // hold = 받아 둔 다음 달 수강증의 달 (2026-09-22). 위조 신호가 든 candidates 전체는 가져오지 않는다 — 학생에게 보일 일이 없다
    .select("id, created_at, result, reject_reason, parsed, matched_section, hold:candidates->hold")
    .order("created_at", { ascending: false })
    .limit(10);
  return data ?? [];
}
export type MyVerification = Awaited<ReturnType<typeof getMyVerifications>>[number];

/**
 * 내 수업일. **`my_section_ids()` 로 내 반만** 남긴다 — 정책 `session_dates: 수강생·스태프 조회` 에
 * `or private.is_staff()` 가 있어 강사·관리자에게는 그 달 모든 반의 회차가 내려온다 (머리말).
 * 인강 학생에게 열리는 **오전 짝 반의 회차도 빠진다** — 그건 다시보기용이지 내 시간표가 아니다.
 *
 * **배정이 없으면 빈 목록이다** (스태프가 반에 배정되지 않은 채 학생 화면을 볼 때) — 화면이
 * "반에 배정되면 여기에 내 수업 달력이 나와요" 로 안내한다. 단 **조회 자체가 실패하면 예전처럼**
 * RLS 가 주는 대로 둔다 — 근거가 없을 때 화면을 비우면 진짜 학생의 시간표가 사라진다.
 */
export async function getMySessions() {
  const supabase = await createClient();
  const { data: ids, error } = await supabase.rpc("my_section_ids");
  if (!error && (ids ?? []).length === 0) return [];
  let q = supabase
    .from("session_dates")
    .select(`id, seq, date, start_time, end_time, section:class_sections(${SECTION_COLS})`);
  if (!error && ids) q = q.in("section_id", ids);
  const { data } = await q.order("date", { ascending: true }).order("start_time", { ascending: true });
  return data ?? [];
}
export type MySession = Awaited<ReturnType<typeof getMySessions>>[number];

/**
 * 내가 듣는 기수의 특강. RLS(private.is_term_enrollee)가 그 달 반에 배정된 수강생에게만 내려 준다.
 * 수업일(session_dates)과 함께 내 시간표에 표시한다.
 */
export async function getMyLectures() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("special_lectures")
    .select("id, term_id, date, content, kinds, signup, capacity, signup_opens_at, applied_count, lecturer:lecturers(name), term:terms(year, month)")
    .order("date", { ascending: true })
    .order("id", { ascending: true });
  return data ?? [];
}
export type MyLecture = Awaited<ReturnType<typeof getMyLectures>>[number];

/** 내가 신청한 특강 id 집합 */
export async function getMyLectureSignupIds() {
  const supabase = await createClient();
  const { data } = await supabase.from("lecture_signups").select("lecture_id");
  return new Set((data ?? []).map((r) => r.lecture_id));
}

export async function getMyLiveLinks() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("section_live_links")
    .select(`section_id, live_url, updated_at, section:class_sections(${SECTION_COLS})`)
    .order("section_id", { ascending: true });
  return data ?? [];
}
export type MyLiveLink = Awaited<ReturnType<typeof getMyLiveLinks>>[number];

export type MyLiveCard = {
  sectionId: number;
  section: NonNullable<MyLiveLink["section"]>;
  url: string;
  /** today = 오늘 회차 링크 · next = 앞으로 올 회차 링크 · standing = 반의 상시 링크 */
  kind: "today" | "next" | "standing";
  seq?: number;
  date?: string;
};

/**
 * 불라방 카드 — 회차 링크가 우선이다 (2026-09-18 Alan: 오전반 라이브 주소가 끝나면 그대로 다시보기가 되므로 링크는 회차마다 다르다).
 * 오늘 회차 링크 → 앞으로 올 가장 가까운 회차 링크 → 반의 상시 링크(Zoom 같은 고정 방) 순으로 하나만 고른다.
 * 어느 반이 보이는지는 RLS(has_section_access)가 정한다.
 */
export async function getMyLiveCards(): Promise<MyLiveCard[]> {
  const supabase = await createClient();
  const today = todayKST();
  const [{ data: ids, error: idsError }, { data: standing }, { data: perSession }] = await Promise.all([
    supabase.rpc("my_section_ids"),
    supabase.from("section_live_links").select(`section_id, live_url, updated_at, section:class_sections(${SECTION_COLS})`),
    supabase.from("session_live_links").select(`session_date_id, live_url, session:session_dates(id, seq, date, section_id, section:class_sections(${SECTION_COLS}))`),
  ]);
  // **내 반만** — 링크 정책도 스태프에게 전부 열려 있다 (머리말). 조회가 실패하면 예전처럼 둔다
  const mine = idsError || !ids ? null : new Set(ids);
  const cards = new Map<number, MyLiveCard>();
  for (const l of standing ?? [])
    if (l.section && (!mine || mine.has(l.section_id))) cards.set(l.section_id, { sectionId: l.section_id, section: l.section, url: l.live_url, kind: "standing" });
  const upcoming = (perSession ?? [])
    .filter((l) => l.session?.section && l.session.date >= today && (!mine || mine.has(l.session.section_id)))
    .sort((a, b) => a.session!.date.localeCompare(b.session!.date) || a.session!.seq - b.session!.seq);
  for (const l of upcoming) {
    const s = l.session!;
    const prev = cards.get(s.section_id);
    if (prev && prev.kind !== "standing") continue; // 더 가까운 회차 링크가 이미 있다
    cards.set(s.section_id, { sectionId: s.section_id, section: s.section!, url: l.live_url, kind: s.date === today ? "today" : "next", seq: s.seq, date: s.date });
  }
  return [...cards.values()].sort((a, b) => a.sectionId - b.sectionId);
}

/** 오늘 이후 첫 수업일을 section_id 별로 */
export async function getNextSessionBySection(sectionIds: number[]) {
  if (sectionIds.length === 0) return new Map<number, { date: string; start_time: string | null; end_time: string | null; seq: number }>();
  const supabase = await createClient();
  const { data } = await supabase
    .from("session_dates")
    .select("section_id, seq, date, start_time, end_time")
    .in("section_id", sectionIds)
    .gte("date", todayKST())
    .order("date", { ascending: true });
  const map = new Map<number, { date: string; start_time: string | null; end_time: string | null; seq: number }>();
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


export async function getMyTextbookOrders() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("textbook_orders")
    .select(
      `id, recipient_name, phone, postal_code, address, address_detail, quantity, memo, status, tracking_no, created_at,
       term_id, items, items_total, shipping_fee, total_amount, depositor_name, pay_to,
       section:class_sections(id, track, course:courses(name), term:terms(year, month))`,
    )
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * 불라방 교재를 주문할 수 있는 달 (2026-09-21) — 그 달 불라방 배정이 있고, 등록이 예비·수강 중이며, 종강 전.
 * **예비등록생도 들어간다** — 개강 전에 등업한 학생이 개강 전에 교재를 받아야 한다.
 * 달마다 한 번 주문한다 (주5일이면 두 반이 한 달에 묶인다). 판정은 DB 함수 create_textbook_order 가 한 번 더 한다.
 */
export async function getMyTextbookTerms(orders?: MyOrder[]) {
  const list = orders ?? (await getMyOrders());
  const today = todayKST();
  type Section = NonNullable<MyOrder["enrollments"][number]["section"]>;
  const byTerm = new Map<number, { termId: number; term: Section["term"]; sections: Section[]; levels: number[] }>();
  for (const o of list) {
    if (o.status !== "preliminary" && o.status !== "active") continue;
    for (const e of o.enrollments) {
      const s = e.section;
      if (e.status !== "active" || e.mode !== "live" || !s || today > s.closes_at) continue;
      const t = byTerm.get(s.term_id) ?? { termId: s.term_id, term: s.term, sections: [], levels: [] };
      if (!t.sections.some((x) => x.id === s.id)) t.sections.push(s);
      for (const lv of [s.course?.target_score, ...(s.course?.includes_levels ?? [])]) {
        if (typeof lv === "number" && !t.levels.includes(lv)) t.levels.push(lv);
      }
      byTerm.set(s.term_id, t);
    }
  }
  return [...byTerm.values()].sort((a, b) => (a.term?.year ?? 0) - (b.term?.year ?? 0) || (a.term?.month ?? 0) - (b.term?.month ?? 0));
}
export type MyTextbookTerm = Awaited<ReturnType<typeof getMyTextbookTerms>>[number];
export type MyTextbookOrder = Awaited<ReturnType<typeof getMyTextbookOrders>>[number];

/**
 * 스터디 자격 (DB 의 private.is_term_enrollee / has_term_access 와 같은 규칙 — **반의 개강일·종강일로** 가른다)
 *  - signupTerms: 그 달 반에 배정 + 종강 전 → 신청 가능 (예비등록생 포함)
 *  - accessTerms: 그중 개강일 ≤ 오늘 ≤ 종강일 → 비대면 자료·LC 음원 열람
 * 실제 권한은 RLS 가 판단하고, 이 값은 화면 안내용이다.
 */
export async function getMyStudyEligibility(orders?: MyOrder[]) {
  const list = orders ?? (await getMyOrders());
  const today = todayKST();
  const signupTerms = new Set<number>();
  const accessTerms = new Set<number>();
  const opensOn = new Map<number, string>(); // 예비등록생: 기수별 개강일
  for (const o of list) {
    for (const e of o.enrollments) {
      if (e.status !== "active" || !e.section || today > e.section.closes_at) continue;
      signupTerms.add(e.section.term_id);
      if (e.section.enrollment_opens_at <= today) accessTerms.add(e.section.term_id);
      else opensOn.set(e.section.term_id, e.section.enrollment_opens_at);
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
    .select("id, study_id, seq, date, title, file_name, file_size, content_type, updated_at")
    .order("date", { ascending: false });
  return data ?? [];
}
export type MyStudyMaterial = Awaited<ReturnType<typeof getMyStudyMaterials>>[number];

/** 내 숙제 제출물과 사진 (최근 순). 레벨·과목으로 좁힐 수 있다 */
export async function getMyHomework(filter?: { level?: number; subject?: string }) {
  const supabase = await createClient();
  let q = supabase
    .from("homework_submissions")
    .select("id, level, subject, class_date, question, feedback, status, created_at, checked_at, homework_files(id, file_name, file_size, content_type, created_at)")
    .order("created_at", { ascending: false })
    .limit(60);
  if (filter?.level) q = q.eq("level", filter.level);
  if (filter?.subject) q = q.eq("subject", filter.subject);
  const { data } = await q;
  return data ?? [];
}
export type MyHomework = Awaited<ReturnType<typeof getMyHomework>>[number];

/** 숙제업로드 1단계 레벨 목록 (lc_levels — 레벨을 더하면 여기서도 늘어난다) */
export async function getHomeworkLevels() {
  const supabase = await createClient();
  const { data } = await supabase.from("lc_levels").select("level").order("sort_order").order("level");
  return (data ?? []).map((l) => l.level);
}

/** LC 음원듣기: 레벨 목록 + 교재(A·B반 권별) + 들을 수 있는 음원 (RLS: 지금 수강 중인 수강생) */
export async function getMyLcAudio() {
  const supabase = await createClient();
  const [{ data: levels }, { data: books }, { data: tracks }] = await Promise.all([
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
    supabase.from("lc_books").select("id, level, book_set, title, description, cover_name, lesson_offset, updated_at"),
    supabase.from("lc_audio_tracks").select("id, day, kind, label, sort_order, book_id"),
  ]);
  return { levels: (levels ?? []).map((l) => l.level), books: books ?? [], tracks: tracks ?? [] };
}

/** 라벨 */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  preliminary: "예비등록",
  active: "수강 중",
  expired: "만료",
};
export const VERIFICATION_STATUS_LABEL = (result: string | null) =>
  result === "approved" ? "승인" : result === "rejected" ? "반려" : "확인 중";

export function termLabel(term: { year: number; month: number } | null | undefined) {
  return term ? `${term.year}년 ${term.month}월` : "기수 미정";
}

/** "YYYY-MM-DD" 의 월 */
export function monthOf(date: string) {
  return Number(date.slice(5, 7));
}

/**
 * 대기 중인 계정 통합 신청 (2026-09-18 Alan). RLS 가 내 계정이 걸린 행만 돌려준다.
 * 내가 신청하지 않은 행이면 **이 계정에서 확인해야** 합쳐진다 (본인 확인).
 */
export async function getMyMergeRequests() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_merge_requests")
    .select("id, from_user, to_user, requested_by, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** 내 비대면 스터디 인증 (자료 id → 인증). 2026-09-18 */
export async function getMyStudyCheckins() {
  const supabase = await createClient();
  const { data } = await supabase.from("study_checkins").select("id, material_id, created_at, study_checkin_files(count)");
  return (data ?? []).map((c) => ({ id: c.id, material_id: c.material_id, created_at: c.created_at, files: c.study_checkin_files?.[0]?.count ?? 0 }));
}

/** 선생님이 보낸 알림 (최근 100건). RLS 가 본인 것만 돌려준다 */
export async function getMyMessages() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_messages")
    .select("id, title, body, kind, related, sender_name, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function getUnreadMessageCount() {
  const supabase = await createClient();
  const { count } = await supabase.from("student_messages").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}
