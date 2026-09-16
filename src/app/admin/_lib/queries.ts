import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { formatTime, TRACK_LABEL, MODE_LABEL } from "@/lib/utils";

export type DB = SupabaseClient<Database>;

export type TermLite = { id: number; year: number; month: number };

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

/** 이번 달 기수. 없으면 가장 가까운 다음 기수 */
export async function getCurrentOrUpcomingTerm(supabase: DB, today: string): Promise<TermLite | null> {
  const [y, m] = today.split("-").map(Number);
  const { data: cur } = await supabase.from("terms").select("id, year, month").eq("year", y).eq("month", m).maybeSingle();
  if (cur) return cur;
  const { data: all } = await supabase.from("terms").select("id, year, month").order("year").order("month");
  const upcoming = (all ?? []).find((t) => t.year > y || (t.year === y && t.month > m));
  return upcoming ?? null;
}

/**
 * 목록 화면의 기수 선택: ?term=YYYY-MM 이 있으면 그 기수, 없으면 이번 달 → 가장 가까운 다음 달 → 가장 최근 순.
 * terms 는 후보 기수 목록 (예: 스터디가 있는 기수)
 */
export function pickTerm<T extends TermLite>(terms: T[], param: string | undefined, today: string): T | null {
  const match = param?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const hit = terms.find((t) => t.year === Number(match[1]) && t.month === Number(match[2]));
    if (hit) return hit;
  }
  const [y, m] = today.split("-").map(Number);
  const now = y * 12 + m;
  const idx = (t: TermLite) => t.year * 12 + t.month;
  const sorted = [...terms].sort((a, b) => idx(a) - idx(b));
  return sorted.find((t) => idx(t) === now) ?? sorted.find((t) => idx(t) > now) ?? sorted.at(-1) ?? null;
}

export type RosterSets = {
  activeIds: string[];
  preliminaryIds: string[];
  /** user_id → 주문들 */
  ordersByUser: Map<string, { status: string; activates_on: string; access_until: string }[]>;
};

/** 등록생 / 예비등록생 집합 (오늘 기준) */
export async function getRosterSets(supabase: DB, today: string): Promise<RosterSets> {
  const { data } = await supabase
    .from("enrollment_orders")
    .select("user_id, status, activates_on, access_until, profile:profiles!enrollment_orders_user_id_fkey(role)")
    .in("status", ["active", "preliminary"]);
  const active = new Set<string>();
  const prelim = new Set<string>();
  const ordersByUser = new Map<string, { status: string; activates_on: string; access_until: string }[]>();
  for (const o of data ?? []) {
    // 테스터(강사·관리자 계정)의 테스트용 반 배정은 등록생 · 예비등록생 수에 세지 않는다
    if (o.profile?.role === "instructor" || o.profile?.role === "admin") continue;
    ordersByUser.set(o.user_id, [...(ordersByUser.get(o.user_id) ?? []), o]);
    if (o.status === "active" && o.activates_on <= today && today <= o.access_until) active.add(o.user_id);
    if (o.status === "preliminary") prelim.add(o.user_id);
  }
  return { activeIds: [...active], preliminaryIds: [...prelim], ordersByUser };
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
