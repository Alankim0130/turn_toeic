import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { todayKST } from "@/lib/utils";
import { week5SectionIds } from "@/lib/week5";
import type { EnrollSection } from "@/lib/enroll-options";
import { fetchOpenEnrollSections } from "@/lib/open-sections";
import { isMaterialSubject, materialAccess, type MaterialSubject } from "@/lib/class-materials";
import { cellKey, cellLevels, isRoundOpen, isRoundSet, roundCells, roundDates, roundKey } from "@/lib/class-rounds";
import { clipToOwnRange } from "@/lib/two-week";

/**
 * 수강생 영역에서 쓰는 조회 함수. 전부 사용자 세션 클라이언트라 RLS 가 접근 범위를 정한다.
 *
 * **단 "내 것" 은 RLS 에만 맡기지 않는다** (2026-09-23 Alan — 숙제제출 달력에 "750, 850반이 전부 다 나와").
 * 학생 화면의 RLS 정책들은 대부분 `… or private.is_staff()` 라 **강사·관리자에게는 모든 반·모든 학생이 열린다** —
 * 관리자 화면에는 맞지만 `/my` 에서 그대로 쓰면 남의 반 수업일과 **남의 등록 현황**이 내 화면에 선다.
 * 그래서 여기서는 **내 반**(`public.my_section_ids()`)과 **내 user_id** 로 한 번 더 좁힌다.
 * 다시보기는 저녁 반이 오전 짝 반의 녹화본을 보므로 짝(`public.term_recorded_pairs`)까지 더해서 좁힌다 — `getMyReplays` 머리말.
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
export const getMyAccessibleSections = cache(async () => {
  const supabase = await createClient();
  const { data: ids } = await supabase.rpc("my_section_ids");
  if (!ids || ids.length === 0) return [];
  const { data } = await supabase.from("class_sections").select(SECTION_COLS).in("id", ids);
  return data ?? [];
});
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
export const getMyOrders = cache(async () => {
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
});
export type MyOrder = Awaited<ReturnType<typeof getMyOrders>>[number];

/** 내가 직접 배정된 반 — 수강 중 · 예비등록 등록의 배정. 묶음 반 · 속성반 · 2주완성이 품는 반은 들지 않는다 */
export function myDirectSectionIds(orders: readonly MyOrder[]): Set<number> {
  return new Set(
    orders.flatMap((o) =>
      o.status === "active" || o.status === "preliminary" ? o.enrollments.filter((e) => e.status === "active" && e.section).map((e) => e.section!.id) : [],
    ),
  );
}

/**
 * 기수마다 내 반(직접 배정)의 가장 늦은 종강일. 2주완성 반은 앞 절반 마지막 수업일에 끝나는데 품은 850 반은 그 달 끝까지라,
 * 그 뒤 날짜의 불라방 링크 · 다음 수업을 내 것으로 보여 주지 않게 쓴다 (2026-10-05). 다른 반은 품은 반과 종강일이 같다.
 */
export function myTermEnds(orders: readonly MyOrder[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const o of orders) {
    if (o.status !== "active" && o.status !== "preliminary") continue;
    for (const e of o.enrollments) {
      const sec = e.section;
      if (e.status !== "active" || !sec?.closes_at) continue;
      const prev = out.get(sec.term_id);
      if (!prev || sec.closes_at > prev) out.set(sec.term_id, sec.closes_at);
    }
  }
  return out;
}

/**
 * 지금 등업신청을 받는 반 — 아직 종강하지 않은 공개 반 (조건은 `fetchOpenEnrollSections` 한곳).
 * 수동 등업신청의 레벨·요일·시간대 선택지가 여기서 나온다 (작업 원칙 4 — 코드에 시간대를 적지 않는다).
 */
export async function getOpenEnrollSections(): Promise<EnrollSection[]> {
  return fetchOpenEnrollSections(await createClient());
}

export async function getMyVerifications() {
  const { user } = await getSessionProfile();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollment_verifications")
    // hold = 받아 둔 다음 달 수강증의 달 (2026-09-22). 위조 신호가 든 candidates 전체는 가져오지 않는다 — 학생에게 보일 일이 없다
    .select("id, created_at, result, reject_reason, parsed, matched_section, hold:candidates->hold")
    .eq("user_id", user.id)
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
export async function getMySessions(opts: { upcoming?: boolean } = {}) {
  const supabase = await createClient();
  // 내 시간표(upcoming)는 개강 전(예비등록) 반도 세운다 — my_schedule_section_ids() (2026-10-02 Alan "10월 일정표가 학생화면에 제대로 안나오고 있어").
  // 숙제 · LC 음원 달력은 그대로 수강 중인 반만 — my_section_ids(). 새 함수가 아직 없으면(배포 틈) 예전 함수로 돌아간다
  let { data: ids, error } = opts.upcoming ? await supabase.rpc("my_schedule_section_ids") : await supabase.rpc("my_section_ids");
  if (opts.upcoming && error) ({ data: ids, error } = await supabase.rpc("my_section_ids"));
  if (!error && (ids ?? []).length === 0) return [];
  let q = supabase
    .from("session_dates")
    .select(`id, seq, date, start_time, end_time, section:class_sections(${SECTION_COLS})`);
  if (!error && ids) q = q.in("section_id", ids);
  const [{ data }, orders] = await Promise.all([q.order("date", { ascending: true }).order("start_time", { ascending: true }), getMyOrders()]);
  // 2주완성(2026-10-05): 품은 850 반의 뒤 절반 수업일은 내 것이 아니다 — 내 반 회차 범위로 자른다 (다른 반은 그대로)
  return clipToOwnRange(data ?? [], myDirectSectionIds(orders));
}
export type MySession = Awaited<ReturnType<typeof getMySessions>>[number];

/**
 * 내가 듣는 기수의 특강. 수업일(session_dates)과 함께 내 시간표에 표시하고, 특강 신청 화면이 쓴다.
 *
 * **RLS 에만 맡기지 않는다** (2026-09-24 전수조사 — 등급 체계 10). 학생에게는 `private.is_term_enrollee` 가
 * 그 달 반에 배정된 기수만 내려 주지만 정책 "special_lectures: 스태프 조회" 가 강사·관리자에게 **모든 기수**를 연다 —
 * 9월 반으로 테스트하는 관리자의 내 시간표·특강 신청에 10월 특강까지 섰다.
 * 그래서 **내 등록에서 뽑은 기수**(`getMyStudyEligibility().signupTerms` — `is_term_enrollee` 와 같은 규칙)로 좁힌다.
 * 예비등록생도 특강을 신청하므로 `my_section_ids()`(수강 중만)로 좁히면 안 된다.
 */
/**
 * 내 기수의 특강. 기본은 **신청 자격이 있는 기수**(개강일~종강일 — signupTerms)만.
 * `{ upcoming: true }` 는 **개강 전 배정의 기수**까지 (내 시간표 — 2026-10-02 Alan "예비등록생 내 시간표에도 특강 날짜는 미리 보여줘").
 * 신청은 그래도 개강일부터다 — RLS `lecture_signup_open` 이 막고, 조회는 정책 "special_lectures: 수강생 조회"(is_term_assignee)가 연다.
 */
export async function getMyLectures(opts: { upcoming?: boolean } = {}) {
  const supabase = await createClient();
  const [{ data }, orders] = await Promise.all([
    supabase
      .from("special_lectures")
      .select("id, term_id, date, content, kinds, signup, capacity, signup_opens_at, applied_count, lecturer:lecturers(name), term:terms(year, month)")
      .order("date", { ascending: true })
      .order("id", { ascending: true }),
    getMyOrders(),
  ]);
  const { signupTerms, opensOn } = await getMyStudyEligibility(orders);
  const terms = opts.upcoming ? new Set([...signupTerms, ...opensOn.keys()]) : signupTerms;
  return (data ?? []).filter((l) => terms.has(l.term_id));
}
export type MyLecture = Awaited<ReturnType<typeof getMyLectures>>[number];

/** 내가 신청한 특강 id 집합 */
export async function getMyLectureSignupIds() {
  const { user } = await getSessionProfile();
  if (!user) return new Set<number>();
  const supabase = await createClient();
  const { data } = await supabase.from("lecture_signups").select("lecture_id").eq("user_id", user.id);
  return new Set((data ?? []).map((r) => r.lecture_id));
}

/** 반의 상시 불라방 링크 — **내 반만** (링크 정책도 스태프에게 전부 열려 있다 — 머리말) */
export async function getMyLiveLinks() {
  const supabase = await createClient();
  const [{ data: ids, error }, { data }] = await Promise.all([
    supabase.rpc("my_section_ids"),
    supabase
      .from("section_live_links")
      .select(`section_id, live_url, updated_at, section:class_sections(${SECTION_COLS})`)
      .order("section_id", { ascending: true }),
  ]);
  // 조회가 실패하면 좁히지 않는다 — RLS 는 그대로 막고 있다
  if (error || !ids) return data ?? [];
  const mine = new Set<number>(ids);
  return (data ?? []).filter((l) => mine.has(l.section_id));
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
  /** 내 반의 종강일 (그 기수에서 가장 늦은 것) — 이 뒤의 다음 수업은 내 것이 아니다 (2주완성은 앞 절반 마지막 날) */
  until?: string;
};

/**
 * 불라방 카드 — 회차 링크가 우선이다 (2026-09-18 Alan: 오전반 라이브 주소가 끝나면 그대로 다시보기가 되므로 링크는 회차마다 다르다).
 * 오늘 회차 링크 → 앞으로 올 가장 가까운 회차 링크 → 반의 상시 링크(Zoom 같은 고정 방) 순으로 하나만 고른다.
 * 어느 반이 보이는지는 RLS(has_section_access)가 정한다.
 */
export async function getMyLiveCards(): Promise<MyLiveCard[]> {
  const supabase = await createClient();
  const today = todayKST();
  const [{ data: ids, error: idsError }, { data: standing }, { data: perSession }, orders] = await Promise.all([
    supabase.rpc("my_section_ids"),
    supabase.from("section_live_links").select(`section_id, live_url, updated_at, section:class_sections(${SECTION_COLS})`),
    supabase.from("session_live_links").select(`session_date_id, live_url, session:session_dates(id, seq, date, section_id, section:class_sections(${SECTION_COLS}))`),
    getMyOrders(),
  ]);
  // **내 반만** — 링크 정책도 스태프에게 전부 열려 있다 (머리말). 조회가 실패하면 예전처럼 둔다
  const mine = idsError || !ids ? null : new Set(ids);
  // 내 반의 종강일 뒤 회차 링크는 내 것이 아니다 — 2주완성은 앞 절반 마지막 날까지 (품은 850 반은 그 달 끝까지 링크가 있다)
  const ends = myTermEnds(orders);
  const untilOf = (termId: number) => ends.get(termId);
  const cards = new Map<number, MyLiveCard>();
  for (const l of standing ?? [])
    if (l.section && (!mine || mine.has(l.section_id)))
      cards.set(l.section_id, { sectionId: l.section_id, section: l.section, url: l.live_url, kind: "standing", until: untilOf(l.section.term_id) });
  const upcoming = (perSession ?? [])
    .filter((l) => {
      const sec = l.session?.section;
      if (!sec || l.session!.date < today || (mine && !mine.has(l.session!.section_id))) return false;
      const until = untilOf(sec.term_id);
      return !until || l.session!.date <= until;
    })
    .sort((a, b) => a.session!.date.localeCompare(b.session!.date) || a.session!.seq - b.session!.seq);
  for (const l of upcoming) {
    const s = l.session!;
    const prev = cards.get(s.section_id);
    if (prev && prev.kind !== "standing") continue; // 더 가까운 회차 링크가 이미 있다
    cards.set(s.section_id, {
      sectionId: s.section_id,
      section: s.section!,
      url: l.live_url,
      kind: s.date === today ? "today" : "next",
      seq: s.seq,
      date: s.date,
      until: untilOf(s.section!.term_id),
    });
  }
  return [...cards.values()].sort((a, b) => a.sectionId - b.sectionId);
}

/** 오늘 이후 첫 수업일을 section_id 별로. `until`(반 → 마지막 날)이 있으면 그 뒤 날짜는 세지 않는다 (2주완성 — 내 반 종강일 뒤는 내 수업이 아니다) */
export async function getNextSessionBySection(sectionIds: number[], until: ReadonlyMap<number, string> = new Map()) {
  if (sectionIds.length === 0) return new Map<number, { date: string; start_time: string | null; end_time: string | null; seq: number }>();
  const supabase = await createClient();
  const { data } = await supabase
    .from("session_dates")
    .select("section_id, seq, date, start_time, end_time")
    .in("section_id", sectionIds)
    .gte("date", todayKST())
    .order("date", { ascending: true });
  const map = new Map<number, { date: string; start_time: string | null; end_time: string | null; seq: number }>();
  for (const s of data ?? []) {
    const end = until.get(s.section_id);
    if (!map.has(s.section_id) && (!end || s.date <= end)) map.set(s.section_id, s);
  }
  return map;
}

/**
 * 저녁 반(화목금 인강 · 월수금 현장) → **녹화본이 올라오는 오전 짝 반** (`public.term_recorded_pairs`).
 * **짝을 화면에서 계산하지 말 것** — 판정은 DB 한곳이다 (도메인 규칙 1 "저녁 반 학생의 다시보기").
 */
async function getMyRecordedPairs(termIds: (number | null)[]) {
  const out = new Map<number, number>();
  const ids = [...new Set(termIds.filter((t): t is number => typeof t === "number"))];
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const rows = await Promise.all(ids.map((t) => supabase.rpc("term_recorded_pairs", { p_term_id: t })));
  for (const { data } of rows) for (const r of data ?? []) out.set(r.recorded_id, r.source_id);
  return out;
}

/**
 * 내 다시보기 — **내 반 + 저녁 반의 오전 짝 반**의 녹화본만.
 *
 * 정책 `replays: 수강생·스태프 조회` 는 `… or private.is_staff()` 라 **강사·관리자에게는 모든 반의 녹화본이 열린다** (머리말).
 * 관리자 화면에는 맞지만 `/my/replay` 에서 그대로 쓰면 **남의 반 녹화본이 내 화면에 선다.**
 *
 * **좁히는 집합은 RLS 가 여는 집합보다 넓게 잡는다** — 좁게 잡으면 진짜 학생이 볼 수 있는 녹화본이 사라진다.
 * `private.has_recorded_replay_access` 와 같은 것을 본다: 내 저녁 반의 오전 짝, 그 짝이 묶음 반이면 안의 시간 단위 반까지.
 */
export async function getMyReplays() {
  const supabase = await createClient();
  const [{ data: rows }, { data: ids, error: idsError }] = await Promise.all([
    supabase
      .from("replays")
      .select(
        `id, video_url, published_at,
         session:session_dates(id, seq, date, start_time, end_time, section:class_sections(${SECTION_COLS}))`,
      )
      .order("published_at", { ascending: false }),
    supabase.rpc("my_section_ids"),
  ]);
  const replays = rows ?? [];
  // 조회가 실패하면 좁히지 않는다 — 근거 없이 지우면 진짜 학생의 녹화본이 사라진다 (RLS 는 그대로 막고 있다)
  if (idsError || !ids) return replays;
  if (ids.length === 0) return [];

  const sections = await getMyAccessibleSections();
  if (sections.length === 0) return replays; // 반을 못 읽었다 — 오전 짝을 알 수 없으니 좁히지 않는다

  const allowed = new Set<number>(ids);
  const pairs = await getMyRecordedPairs(sections.map((s) => s.term_id));
  const sources = sections.map((s) => pairs.get(s.id)).filter((id): id is number => typeof id === "number");
  if (sources.length > 0) {
    const includes = await getMySectionIncludes(sections.map((s) => s.term_id));
    for (const src of sources) {
      allowed.add(src);
      for (const inner of includes.get(src) ?? []) allowed.add(inner);
    }
  }

  return replays.filter((r) => {
    const id = r.session?.section?.id;
    return typeof id === "number" && allowed.has(id);
  });
}
export type MyReplay = Awaited<ReturnType<typeof getMyReplays>>[number];


export async function getMyTextbookOrders() {
  const { user } = await getSessionProfile();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("textbook_orders")
    .select(
      `id, recipient_name, phone, postal_code, address, address_detail, quantity, memo, status, tracking_no, created_at,
       term_id, items, items_total, shipping_fee, total_amount, depositor_name, pay_to, received_at,
       section:class_sections(id, track, course:courses(name), term:terms(year, month))`,
    )
    .eq("user_id", user.id)
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
      // 신청 자격도 개강일부터다 (2026-10-02 Alan — 예비등록생 제외, DB private.is_term_enrollee 와 같다). 개강 전 배정은 opensOn 에만 남긴다
      if (e.section.enrollment_opens_at <= today) {
        signupTerms.add(e.section.term_id);
        accessTerms.add(e.section.term_id);
      } else opensOn.set(e.section.term_id, e.section.enrollment_opens_at);
    }
  }
  return { signupTerms, accessTerms, opensOn };
}

/** 내 스터디 신청 (기수·유형·시간대 포함) */
export const getMyStudySignups = cache(async () => {
  const { user } = await getSessionProfile();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_signups")
    .select(
      `id, study_id, slot_id, created_at,
       study:studies!study_signups_study_id_fkey(id, kind, status, notice, term_id, term:terms(id, year, month, enrollment_opens_at)),
       slot:study_slots!study_signups_slot_id_study_id_fkey(id, start_time, end_time)`,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).filter((s) => s.study);
});
export type MyStudySignup = Awaited<ReturnType<typeof getMyStudySignups>>[number];

/** 내가 받을 수 있는 비대면 자료 (RLS: 신청했고, 수강 중이고, 해당 날짜가 된 것만) */
/**
 * 내 비대면 자료 — **내가 신청한 스터디의, 날짜가 된 회차만.**
 * 정책 `study_materials: 신청자·스태프 조회` 의 스태프 갈래는 **모든 달 · 모든 스터디의 자료를 날짜도 안 보고** 연다 (머리말).
 * 여기서 좁히는 조건은 그 정책의 **학생 갈래와 같다** — 진짜 학생에게는 달라지는 것이 없다.
 */
export async function getMyStudyMaterials() {
  const signups = await getMyStudySignups();
  const studyIds = [...new Set(signups.map((g) => g.study_id))];
  if (studyIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_materials")
    .select("id, study_id, seq, date, title, note, file_name, file_size, content_type, updated_at")
    .in("study_id", studyIds)
    .lte("date", todayKST())
    .order("date", { ascending: false });
  return data ?? [];
}
export type MyStudyMaterial = Awaited<ReturnType<typeof getMyStudyMaterials>>[number];

/** 내 숙제 제출물과 사진 (최근 순). 레벨·과목으로 좁힐 수 있다 */
/**
 * **내가** 낸 숙제. `user_id` 로 좁힌다 — 정책 `homework_submissions: 본인·스태프 조회` 는
 * 스태프에게 **모든 학생의 제출**이 열려 있다 (머리말). 좁히지 않으면 `/my/homework` 의
 * 달력 `제출 N` 과 "지금까지 낸 숙제" 에 **남의 숙제가 레벨 가리지 않고** 선다.
 */
export async function getMyHomework(filter?: { level?: number; subject?: string }) {
  const { user } = await getSessionProfile();
  if (!user) return [];
  const supabase = await createClient();
  let q = supabase
    .from("homework_submissions")
    .select("id, level, subject, class_date, question, feedback, status, created_at, checked_at, homework_files(id, file_name, file_size, content_type, created_at)")
    .eq("user_id", user.id)
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

/**
 * LC 음원듣기: 레벨 목록 + **내 LC 과정 칸의 교재**(레벨 × A/B — 그 교재를 쓰는 내 반이 있다) + **수업일이 지난 강의 음원만**
 * (2026-10-05 Alan — "LC음원듣기와 자료게시판도 수업날짜에 맞춰서 오픈 … 해당 날짜가 안되면 잠금이고, 해당날짜 수업이 진행되면 하나씩 오픈").
 * n강 칸 = 그 교재를 쓰는 내 반의 n회차 수업일(`roundDates`). RC 단과 학생은 LC 칸이 없어 빈 목록이다.
 * 정책은 학생에게 같은 범위만 열지만(`private.my_round_cells` · `my_open_rounds`) **강사·관리자에게는 전부**를 연다 (관리자 LC 음원 화면) —
 * 그래서 여기서 한 번 더 좁힌다 (머리말). `dates` 는 화면이 잠긴 강의 여는 날을 적는 데 쓴다.
 */
export async function getMyLcAudio() {
  const supabase = await createClient();
  const [{ data: levelRows }, sections, sessions] = await Promise.all([
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
    getMyAccessibleSections(),
    getMySessions(),
  ]);
  const levels = (levelRows ?? []).map((l) => l.level);
  const cells = roundCells(sections);
  const dates = roundDates(sessions);
  const mine = cellLevels(cells, "lc");
  if (mine.length === 0) return { levels, cells, dates, books: [], tracks: [] };
  const { data: bookRows } = await supabase
    .from("lc_books")
    .select("id, level, book_set, title, description, cover_name, lesson_offset, updated_at")
    .in("level", mine);
  // 내 과정 칸의 교재만 — 같은 레벨이어도 내 반이 쓰지 않는 과정의 교재는 뺀다
  const books = (bookRows ?? []).filter((b) => cells.has(cellKey(b.level, "lc", b.book_set)));
  if (books.length === 0) return { levels, cells, dates, books, tracks: [] };
  const { data: trackRows } = await supabase
    .from("lc_audio_tracks")
    .select("id, day, kind, label, sort_order, book_id")
    .in("book_id", books.map((b) => b.id));
  const today = todayKST();
  const byId = new Map(books.map((b) => [b.id, b]));
  // 그 강의 내 수업일이 오늘이거나 지난 음원만
  const tracks = (trackRows ?? []).filter((t) => {
    const b = t.book_id == null ? undefined : byId.get(t.book_id);
    return !!b && isRoundOpen(dates.get(roundKey(b.level, "lc", b.book_set, t.day)), today);
  });
  return { levels, cells, dates, books, tracks };
}

/**
 * 수업자료실 (2026-10-05 Alan — "레벨별 구분과 RC, LC가 구분되어야해" → 같은 날 "자료게시판도 일정표 기반으로 오픈 … 해당 날짜가 안되면 잠금" ·
 * "수업자료실에 A/B 과정 전부다 나눠서 올릴 수 있도록 해야해! RC, LC전부다") — **내 과정 칸(레벨 × 과목 × A/B)의, 내 수업일이 지난 회차 자료만**.
 * 칸 · 회차 날짜는 `roundCells` · `roundDates` — DB 정책(`private.my_open_rounds`)과 같은 규칙이다. RC 단과 학생에게는 RC 칸만 있다.
 * 정책은 강사 · 관리자에게 모든 자료를 열어 주므로 학생 화면은 여기서 한 번 더 좁힌다 (CLAUDE.md 등급 체계 10).
 * 레벨 순서는 교재 레벨 목록(lc_levels) 그대로 — 그 목록을 못 읽으면 숫자 순서 (`materialAccess`).
 * `dates`(회차 → 내 수업일)는 화면이 일정표(열린 회차 · 다음 수업일)를 그리는 데 쓴다.
 */
export async function getMyClassMaterials() {
  const supabase = await createClient();
  const [{ data: levelRows }, sections, sessions] = await Promise.all([
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
    getMyAccessibleSections(),
    getMySessions(),
  ]);
  const cells = roundCells(sections);
  const dates = roundDates(sessions);
  const bySubject: Record<MaterialSubject, number[]> = { rc: cellLevels(cells, "rc"), lc: cellLevels(cells, "lc") };
  const access = materialAccess(bySubject, (levelRows ?? []).map((l) => l.level));
  if (access.length === 0) return { access, dates, materials: [] };
  const { data } = await supabase
    .from("class_materials")
    .select("id, level, subject, book_set, seq, title, note, file_name, file_size, content_type, created_at, updated_at")
    .in("level", [...new Set([...bySubject.rc, ...bySubject.lc])])
    .order("created_at", { ascending: false });
  const today = todayKST();
  // 과정 · 회차가 정해지고, 그 회차의 내 수업일이 오늘이거나 지난 자료만 (과정 · 회차가 없는 옛 자료는 학생에게 보이지 않는다)
  const materials = (data ?? []).flatMap((m) =>
    isMaterialSubject(m.subject) && isRoundSet(m.book_set) && m.seq != null && isRoundOpen(dates.get(roundKey(m.level, m.subject, m.book_set, m.seq)), today)
      ? [{ ...m, subject: m.subject, book_set: m.book_set, seq: m.seq }]
      : [],
  );
  return { access, dates, materials };
}

/** 라벨 */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  preliminary: "예비등록",
  active: "수강 중",
  expired: "만료",
};
// closed = 다른 수강증이 승인돼 닫힌 것 (2026-10-02) — 반려가 아니다
export const VERIFICATION_STATUS_LABEL = (result: string | null) =>
  result === "approved" ? "승인" : result === "rejected" ? "반려" : result === "closed" ? "닫힘" : "확인 중";

export function termLabel(term: { year: number; month: number } | null | undefined) {
  return term ? `${term.year}년 ${term.month}월` : "기수 미정";
}

/** "YYYY-MM-DD" 의 월 */
export function monthOf(date: string) {
  return Number(date.slice(5, 7));
}

/**
 * 대기 중인 계정 통합 신청 (2026-09-18 Alan) — **내 계정이 걸린 행만** (남길 쪽이든 비워질 쪽이든).
 * 내가 신청하지 않은 행이면 **이 계정에서 확인해야** 합쳐진다 (본인 확인).
 *
 * **RLS 에만 맡기지 않는다** (2026-09-24 전수조사 — 등급 체계 10). 정책 "merge: 당사자 조회" 는
 * 강사·관리자에게 **모든 학생의 신청**을 연다 — 관리자의 `/my` 에 남의 신청이 "계정 통합을 기다리고 있어요" 로 섰다.
 * `/my/account` · `/my/verify` · `/my` 가 모두 이 함수 하나로 읽는다.
 */
export async function getMyMergeRequests() {
  const { user } = await getSessionProfile();
  if (!user) return [];
  const supabase = await createClient();
  // choice = 스태프가 두 계정을 확인하고 **학생이 남길 계정을 고르게** 한 것 (2026-10-02 Alan) — 어느 계정에서든 고를 수 있다
  const { data } = await supabase
    .from("account_merge_requests")
    .select("id, from_user, to_user, requested_by, status, created_at")
    .in("status", ["pending", "choice"])
    .or(`from_user.eq.${user.id},to_user.eq.${user.id}`)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** 내 비대면 스터디 인증 (자료 id → 인증). 2026-09-18 */
export async function getMyStudyCheckins() {
  const { user } = await getSessionProfile();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_checkins")
    .select("id, material_id, created_at, study_checkin_files(count)")
    .eq("user_id", user.id);
  return (data ?? []).map((c) => ({ id: c.id, material_id: c.material_id, created_at: c.created_at, files: c.study_checkin_files?.[0]?.count ?? 0 }));
}

/** 선생님이 보낸 알림 (최근 100건). RLS 가 본인 것만 돌려준다 */
export async function getMyMessages() {
  const { user } = await getSessionProfile();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_messages")
    .select("id, title, body, kind, related, sender_name, created_at, read_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function getUnreadMessageCount() {
  const { user } = await getSessionProfile();
  if (!user) return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from("student_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  return count ?? 0;
}
