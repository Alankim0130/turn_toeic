/**
 * 시간표는 **달마다 한 벌**이다 (2026-09-29 Alan — "월별로 디테일하게 확인하기 위해서 최상단에 월별 설정을 할 수 있으면 좋겠어.
 * 1월방학 시간표를 11월이나 12월달에 미리 세팅을 할예정인데, 그때 1월 시간표를 정확하게 세팅하고, 2월 시간표까지 미리 정확하게").
 *
 * 한 줄 = 그 달 · 레벨 · 과정(점수보장반/스파르타반)의 시간대 하나. 시간 단위 줄에는 편성표처럼 **과정 A/B 와 트랙별 과목 LC/RC** 가 붙는다
 * ("시간대마다 A과정과 B과정이 LC, RC가 구분되어있잖아? 이것도 확인할 수 있고, 또 변경이 가능하면 좋겠어").
 * 달 줄이 **그 달 반의 진실**이다 — 고치면 DB 트리거가 그 달 반의 시간·과정·과목·인강을 맞추고, 반을 읽는 모든 것(담당 강사 · LC 교재 ·
 * 다시보기 짝 · 불라방 · 출석 · 권한)이 따라온다 (마이그레이션 20260929160000).
 *
 * **새 달은 앞선 달에서 가져온다** — "기존의 매달 변경규칙은 그대로 가져가서 미리 세팅이 되어있으면 편할 것 같아":
 *   * 같은 계절이 끊기지 않고 이어지면(9월 → 10월, 1월 → 2월) **시간 · 과목은 그대로, 과정 A/B 는 달 수만큼 뒤집어서**.
 *   * 계절이 한 번 끊겼으면(평달 ↔ 방학달 1·2·7·8월) **시간만** — 방학달은 시간표가 달라 과정·과목을 짐작하지 않는다 (2026-09-23 Alan).
 *     같은 계절의 가장 가까운 달에서 가져오고, 그런 달이 없으면(처음 여는 방학) 예전 두 벌(기본 줄)에서 가져온다.
 *
 * 화면(`/admin/timetable`)과 서버(`actions.ts`)가 이 파일 하나를 쓴다. DB 가 따로 지키는 것: 같은 달 같은 시간 한 줄 · 반이 쓰는 줄은 못 지움.
 */

import { flipSet } from "./course-set";
import { isSubject } from "./instructor-subject";
import { SEASON_LABEL, seasonOfMonth, type Season } from "./timetable";
import { blockContains } from "./time-blocks";

/* ─── 달 ─────────────────────────────────────────────────────────────────── */

export type YM = { y: number; m: number };

export const ymKey = ({ y, m }: YM) => `${y}-${String(m).padStart(2, "0")}`;
export const ymLabel = ({ y, m }: YM) => `${y}년 ${m}월`;
/** 달의 순번 — 두 달 사이가 몇 달인지 셀 때 */
export const ymIndex = ({ y, m }: YM) => y * 12 + (m - 1);
export const ymOfIndex = (i: number): YM => ({ y: Math.floor(i / 12), m: (i % 12) + 1 });
export const shiftYm = (ym: YM, n: number): YM => ymOfIndex(ymIndex(ym) + n);
export const sameYm = (a: YM, b: YM) => a.y === b.y && a.m === b.m;

/** `?month=2027-01` → 달. 엉뚱하면 fallback */
export function parseYm(v: string | null | undefined, fallback: YM): YM {
  const match = String(v ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return fallback;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return y >= 2020 && y <= 2100 && m >= 1 && m <= 12 ? { y, m } : fallback;
}

/** 달 줄들에서 시간표가 있는 달만 (중복 없이, 앞선 달부터) */
export function madeMonths(rows: { year: number | null; month: number | null }[]): YM[] {
  const seen = new Map<number, YM>();
  for (const r of rows) {
    if (r.year == null || r.month == null) continue;
    const ym = { y: r.year, m: r.month };
    seen.set(ymIndex(ym), ym);
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, ym]) => ym);
}

/* ─── 새 달을 무엇으로 시작하나 ───────────────────────────────────────────── */

export type MonthSource =
  /** 앞선 같은 계절 달. carry = 계절이 끊기지 않고 이어졌나 (이어졌으면 과정·과목까지, 끊겼으면 시간만) */
  | { kind: "month"; from: YM; carry: boolean; flips: number }
  /** 앞선 같은 계절 달이 없다 — 예전 두 벌(기본 줄)에서 시간만 */
  | { kind: "template"; season: Season }
  /** 가져올 것이 없다 — 줄을 하나씩 더한다 */
  | { kind: "none"; season: Season };

/**
 * 새 달(target)의 출발점. made 는 시간표가 있는 달들, hasTemplate 은 그 계절 기본 줄이 있는가.
 * target 보다 앞선 같은 계절 달 중 가장 가까운 것을 고르고, 그 사이에 다른 계절 달이 끼어 있으면 시간만 가져온다.
 */
export function chooseMonthSource(target: YM, made: YM[], hasTemplate: (season: Season) => boolean): MonthSource {
  const season = seasonOfMonth(target.m);
  const t = ymIndex(target);
  const from = made
    .filter((ym) => ymIndex(ym) < t && seasonOfMonth(ym.m) === season)
    .sort((a, b) => ymIndex(b) - ymIndex(a))[0];
  if (from) {
    const f = ymIndex(from);
    let carry = true;
    for (let i = f + 1; i < t; i++) if (seasonOfMonth(ymOfIndex(i).m) !== season) carry = false;
    return { kind: "month", from, carry, flips: t - f };
  }
  return hasTemplate(season) ? { kind: "template", season } : { kind: "none", season };
}

/** 시간표 한 줄의 값 (DB timetable_slots 의 칸 이름 그대로) */
export type SlotValues = {
  level: number;
  program: string;
  start_time: string;
  end_time: string;
  ttf_recorded: boolean;
  book_set: string | null;
  subject_mwf: string | null;
  subject_ttf: string | null;
};

/** 출발점의 줄들로 새 달 줄을 만든다 — 이어지면 과목 그대로 · 과정은 달 수만큼 뒤집기, 끊겼으면 시간만 */
export function draftMonth(source: MonthSource, rows: SlotValues[]): SlotValues[] {
  const carry = source.kind === "month" && source.carry;
  const flip = source.kind === "month" && source.flips % 2 === 1;
  return rows.map((r) => ({
    level: r.level,
    program: r.program,
    start_time: r.start_time,
    end_time: r.end_time,
    ttf_recorded: r.ttf_recorded,
    book_set: carry ? (flip ? flipSet(r.book_set) : r.book_set === "A" || r.book_set === "B" ? r.book_set : null) : null,
    subject_mwf: carry && isSubject(r.subject_mwf) ? r.subject_mwf : null,
    subject_ttf: carry && isSubject(r.subject_ttf) ? r.subject_ttf : null,
  }));
}

/** 만들기 버튼 위에 적는 한 줄 — 어디서 무엇을 가져오는지 */
export function sourceNote(target: YM, source: MonthSource): string {
  if (source.kind === "month") {
    const from = ymLabel(source.from);
    if (!source.carry) {
      return `${from} 시간표에서 시간만 가져와요. ${target.m}월은 ${SEASON_LABEL[seasonOfMonth(target.m)]}로 넘어오는 달이라 과정·과목은 직접 골라 주세요.`;
    }
    return source.flips % 2 === 1
      ? `${from} 시간표를 가져와 과정 A/B 는 뒤집고 과목(LC/RC)은 그대로 채워요. 확인만 하고 다르면 고치세요.`
      : `${from} 시간표를 가져와요. ${source.flips}달 뒤라 과정 A/B 도 그대로예요. 확인만 하고 다르면 고치세요.`;
  }
  if (source.kind === "template") {
    return `${SEASON_LABEL[source.season]} 기본 시간표에서 시간만 가져와요. 과정·과목은 직접 골라 주세요.`;
  }
  return "가져올 시간표가 없어요. 아래 카드에서 시간대를 하나씩 더해 주세요.";
}

/* ─── 줄의 종류 — 무엇을 고르게 하나 ─────────────────────────────────────── */

/**
 * - `hour`: 시간 단위(한 교시, 90분 이하) — 과정 A/B + 트랙별 과목
 * - `block`: 방학달 통짜 줄(90분 넘는 한 구간) — 두 과목을 이어 들어 **과정(LC 교재 글자)만**
 * - `package`: 한달완성 — 같은 달·레벨의 다른 줄을 품는 줄. 과정·과목 없음 (안에 든 시간 것을 쓴다)
 * - `sparta`: 스파르타반(중급속성·실전속성) — 과정·과목 없음 (함께 듣는 점수보장반 것을 쓴다)
 */
export type SlotKind = "hour" | "block" | "package" | "sparta";

type TimeRow = { id: number; level: number; program: string; start_time: string; end_time: string };

const hhmm = (t: string) => t.slice(0, 5);
export const slotLabelOf = (r: { start_time: string; end_time: string }) => `${hhmm(r.start_time)}~${hhmm(r.end_time)}`;
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const slotMinutes = (r: { start_time: string; end_time: string }) => minutesOf(r.end_time) - minutesOf(r.start_time);

/** 같은 (레벨 · 과정) 줄들 안에서 이 줄의 종류 */
export function kindOf(row: TimeRow, sameGroup: TimeRow[]): SlotKind {
  if (row.program === "sparta") return "sparta";
  const label = slotLabelOf(row);
  if (sameGroup.some((o) => o.id !== row.id && blockContains(label, slotLabelOf(o)))) return "package";
  return slotMinutes(row) <= 90 ? "hour" : "block";
}

/** 모든 줄의 종류 (같은 레벨 · 과정끼리 본다) */
export function slotKinds<T extends TimeRow>(rows: T[]): Map<number, SlotKind> {
  const out = new Map<number, SlotKind>();
  for (const r of rows) out.set(r.id, kindOf(r, rows.filter((o) => o.level === r.level && o.program === r.program)));
  return out;
}

/** 종류가 허락하지 않는 값은 비운다 — 한달완성·스파르타 줄에 과정이 남으면 그 반 학생의 교재가 틀어진다 */
export function fieldsFor(kind: SlotKind, v: { book_set: string | null; subject_mwf: string | null; subject_ttf: string | null }) {
  const set = v.book_set === "A" || v.book_set === "B" ? v.book_set : null;
  return {
    book_set: kind === "hour" || kind === "block" ? set : null,
    subject_mwf: kind === "hour" && isSubject(v.subject_mwf) ? v.subject_mwf : null,
    subject_ttf: kind === "hour" && isSubject(v.subject_ttf) ? v.subject_ttf : null,
  };
}

/** 아직 안 고른 칸 — 비어 있으면 담당 강사 · LC 교재 · 다시보기 짝이 정해지지 않는다 */
export function missingOf(kind: SlotKind, v: { book_set: string | null; subject_mwf: string | null; subject_ttf: string | null }): string[] {
  const out: string[] = [];
  if ((kind === "hour" || kind === "block") && !v.book_set) out.push("과정");
  if (kind === "hour" && !v.subject_mwf) out.push("월수금 과목");
  if (kind === "hour" && !v.subject_ttf) out.push("화목금 과목");
  return out;
}

/* ─── 한달완성 묶기 ────────────────────────────────────────────────────────── */

/**
 * 한달완성으로 묶을 수 있는 두 시간 — 같은 레벨 점수보장반에서 **이어지는 시간 단위 둘**(사이 0~30분)인데 아직 묶음이 없는 것.
 * 두달완성(한 시간씩)은 시간 단위 반 하나에, 한달완성(두 시간)은 묶음 반 하나에 배정한다 — 수강증 수강시간이 `10:00~12:10` 으로 찍히기 때문이다.
 */
export function bundleCandidates<T extends TimeRow>(group: T[]): { first: T; second: T; label: string }[] {
  const kinds = slotKinds(group);
  const hours = group.filter((r) => kinds.get(r.id) === "hour").sort((a, b) => a.start_time.localeCompare(b.start_time));
  const out: { first: T; second: T; label: string }[] = [];
  for (let i = 0; i + 1 < hours.length; i++) {
    const a = hours[i];
    const b = hours[i + 1];
    const gap = minutesOf(b.start_time) - minutesOf(a.end_time);
    if (gap < 0 || gap > 30) continue;
    const label = `${hhmm(a.start_time)}~${hhmm(b.end_time)}`;
    const covered = group.some((p) => kinds.get(p.id) === "package" && blockContains(slotLabelOf(p), slotLabelOf(a)) && blockContains(slotLabelOf(p), slotLabelOf(b)));
    if (!covered) out.push({ first: a, second: b, label });
  }
  return out;
}
