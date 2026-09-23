import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { pickCurrentTerm } from "@/lib/term-window";
import { formatTime, TRACK_LABEL, MODE_LABEL } from "@/lib/utils";
import { WEEK5_LABEL } from "@/lib/week5";

export type DB = SupabaseClient<Database>;

/** 기수. 개강일·종강일을 함께 읽어야 "지금 기수" 를 날짜로 고른다 (없으면 달력의 월로 대신한다 — `term-window.ts`) */
export type TermLite = { id: number; year: number; month: number; enrollment_opens_at?: string | null; closes_at?: string | null };

/** 기수를 읽을 때 쓰는 열 — 기본 기수 고르기에 개강일·종강일이 필요하다 */
export const TERM_COLUMNS = "id, year, month, enrollment_opens_at, closes_at";

export function termLabel(t?: { year: number; month: number } | null, short = false) {
  if (!t) return "미정";
  return short ? `${t.month}월` : `${t.year}년 ${t.month}월`;
}

/** "9월 · 강좌명 · 월수금 · 10:00 · 현장". 시간 컬럼이 없는 반(일괄 개설)은 시간대 라벨 "10:00~12:10" 을 쓴다 */
export function sectionSummary(
  s: {
    track?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    time_block?: string | null;
    term?: { year: number; month: number } | null;
    course?: { name: string } | null;
  } | null | undefined,
  mode?: string | null,
  opts: { withEnd?: boolean } = {},
) {
  if (!s) return "반 미배정";
  const parts = [
    termLabel(s.term, true),
    s.course?.name ?? "강좌",
    s.track ? (TRACK_LABEL[s.track] ?? s.track) : null,
    // 같은 강좌·트랙의 오전반·저녁반을 반 배정에서 구분할 수 있어야 한다
    s.start_time ? (opts.withEnd && s.end_time ? `${formatTime(s.start_time)}–${formatTime(s.end_time)}` : formatTime(s.start_time)) : (s.time_block ?? null),
    mode ? (MODE_LABEL[mode] ?? mode) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * 명단 카드용 짧은 반 이름 — "9월 · 650+ · 월수금 · 10:00~12:10".
 * `sectionSummary` 의 강좌 전체 이름("650+ 왕기초반")은 카드 배지에 넣기엔 길어서 **레벨 숫자로 줄인다.**
 * 레벨을 못 읽으면(강좌에 target_score 가 없으면) 강좌 이름을 그대로 쓴다 — 짐작해서 적지 않는다.
 *
 * `withTerm: false` 는 **화면 전체가 이미 한 기수인 곳**에서 쓴다 (스터디 신청자처럼) — 줄마다 `9월` 이
 * 되풀이되면 정작 봐야 할 레벨·시간이 뒤로 밀린다. 그 밖에는 달을 적는다 (학생명단은 여러 달이 섞인다).
 */
export function sectionChip(
  s: {
    id?: number;
    track?: string | null;
    start_time?: string | null;
    time_block?: string | null;
    term?: { year: number; month: number } | null;
    course?: { name: string; target_score?: number | null; program?: string | null } | null;
  } | null | undefined,
  /** 그 학생의 주5일 반 id 들 (`week5SectionIds`) — 있으면 트랙 대신 `주5일` 로 적는다 */
  week5?: Set<number>,
  opts: { withTerm?: boolean } = {},
) {
  if (!s) return "반 미배정";
  const level = s.course?.target_score
    ? `${s.course.program === "sparta" ? "스파르타 " : ""}${s.course.target_score}+`
    : (s.course?.name ?? "강좌");
  const track = s.id != null && week5?.has(s.id) ? WEEK5_LABEL : s.track ? (TRACK_LABEL[s.track] ?? s.track) : null;
  // 트랙과 시간은 한 덩어리로 붙여 쓴다 — 가운뎃점을 넷 찍으면 배지가 휴대폰에서 두 줄로 접힌다
  const when = [track, s.start_time ? formatTime(s.start_time) : (s.time_block ?? null)].filter(Boolean).join(" ");
  const term = opts.withTerm === false ? null : termLabel(s.term, true);
  return [term, level, when || null].filter(Boolean).join(" · ");
}

/**
 * 지금 기수 — **개강일~종강일로** 고른다 (2026-09-22 — 그전에는 달력의 월로 골라서 9월 기수가 10/3 까지 이어지는데도
 * 10/1 부터 10월 기수를 보여 줬다). 오늘이 든 기수 → 가장 가까운 다음 기수 → 가장 최근 기수 (`pickCurrentTerm`)
 */
export async function getCurrentOrUpcomingTerm(supabase: DB, today: string): Promise<TermLite | null> {
  const { data: all } = await supabase.from("terms").select(TERM_COLUMNS);
  return pickCurrentTerm(all ?? [], today);
}

/**
 * 목록 화면의 기수 선택: ?term=YYYY-MM 이 있으면 그 기수, 없으면 지금 기수(개강일~종강일) → 가장 가까운 다음 기수 → 가장 최근 순.
 * terms 는 후보 기수 목록 (예: 스터디가 있는 기수) — 개강일·종강일(`TERM_COLUMNS`)을 함께 읽어 와야 날짜로 고른다
 */
export function pickTerm<T extends TermLite>(terms: T[], param: string | undefined, today: string): T | null {
  const match = param?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const hit = terms.find((t) => t.year === Number(match[1]) && t.month === Number(match[2]));
    if (hit) return hit;
  }
  return pickCurrentTerm(terms, today);
}

export type RosterSets = {
  activeIds: string[];
  preliminaryIds: string[];
  /** user_id → 주문들 */
  ordersByUser: Map<string, { status: string; activates_on: string; access_until: string }[]>;
};

/**
 * 등록생 / 예비등록생 집합 (오늘 기준). **날짜로 가른다** — 등록생 = 개강일 ≤ 오늘 ≤ 종강일, 예비등록생 = 오늘 < 개강일.
 * (상태 열은 DB 트리거가 날짜로 맞추지만, 여기서도 날짜를 직접 보아 DB 권한 판정과 같은 기준을 쓴다)
 */
export async function getRosterSets(supabase: DB, today: string): Promise<RosterSets> {
  const { data } = await supabase
    .from("enrollment_orders")
    .select("user_id, status, activates_on, access_until, profile:profiles!enrollment_orders_user_id_fkey(role)")
    .gte("access_until", today);
  const active = new Set<string>();
  const prelim = new Set<string>();
  const ordersByUser = new Map<string, { status: string; activates_on: string; access_until: string }[]>();
  for (const o of data ?? []) {
    // 테스터(강사·관리자 계정)의 테스트용 반 배정은 등록생 · 예비등록생 수에 세지 않는다
    if (o.profile?.role === "instructor" || o.profile?.role === "admin") continue;
    ordersByUser.set(o.user_id, [...(ordersByUser.get(o.user_id) ?? []), o]);
    if (o.activates_on <= today && today <= o.access_until) active.add(o.user_id);
    if (today < o.activates_on) prelim.add(o.user_id);
  }
  return { activeIds: [...active], preliminaryIds: [...prelim], ordersByUser };
}

/**
 * 지금 수강 중인(개강일~종강일) 등록의 반 배정 — 대시보드 등록생 위젯이 강좌마다 사람 수를 센다 (`courseHeadcounts`).
 * 등록 기간은 `getRosterSets` 의 등록생과 같은 판정이다. 방학에는 600명 × 주5일 두 반이라 한 번에 1,000줄(PostgREST 상한)을 넘는다 —
 * **나눠 읽지 않으면 넘친 줄이 조용히 빠져 숫자가 적게 나온다.** 읽지 못하면 null (위젯이 "불러오지 못했어요" 를 띄운다)
 */
export async function getActiveCourseRows(supabase: DB, today: string): Promise<{ student_id: string; role: string | null; course_id: number | null }[] | null> {
  const PAGE = 1000;
  const out: { student_id: string; role: string | null; course_id: number | null }[] = [];
  for (let from = 0; from < PAGE * 50; from += PAGE) {
    const { data, error } = await supabase
      .from("enrollments")
      .select(
        "id, student_id, order:enrollment_orders!inner(activates_on, access_until), student:profiles!enrollments_student_id_fkey(role), section:class_sections!enrollments_section_id_fkey(course_id)",
      )
      .eq("status", "active")
      .lte("order.activates_on", today)
      .gte("order.access_until", today)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return null;
    for (const r of data ?? []) out.push({ student_id: r.student_id, role: r.student?.role ?? null, course_id: r.section?.course_id ?? null });
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

export const GENDER_LABEL: Record<string, string> = {
  male: "남성",
  female: "여성",
  other: "기타",
  undisclosed: "미응답",
};

export function countBy<T>(rows: T[], key: (r: T) => string | null | undefined, nullLabel = "미입력") {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = (key(r) ?? "").trim() || nullLabel;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
