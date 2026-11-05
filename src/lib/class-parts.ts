import { isSubject, SUBJECT_LABEL, type Subject } from "./instructor-subject";
import { parseTimeBlock } from "./time-blocks";

/**
 * **방학달 통짜 반의 두 교시** (2026-11-05 Alan — 방학 통짜 120분 반은 LC · RC 두 분이 "각자 방송을 진행해").
 *
 * 방학달 통짜 반(점수보장반 · 시간 단위가 없는 긴 한 구간)은 두 과목을 이어 듣는 반이라 과목 칸(`subject`)이 비고 담당 강사가 없다.
 * 그 반에 **교시(part 1 · 2)** 를 둔다 — 앞 교시 과목(`first_subject`, 시간표 통짜 줄의 `first_mwf` · `first_ttf`)과 뒤 교시 시작(`second_start`)으로:
 *  - 유튜브 송출 감지는 교시마다 그 과목 선생님의 채널에서 그 교시 시작 ±10분에 켜진 방송을 찾는다
 *  - 불라방 링크 · 송출 · 다시보기 · 시작 알림은 (회차, 교시) 마다 하나다. 시간 단위 반은 교시가 하나뿐(늘 1)이라 달라지지 않는다
 * DB 의 `private.section_parts` · `part_subject` · `part_start` · `part_end`(마이그레이션 20261105100000)와 **같은 규칙** — 바꾸면 둘 다.
 */

export type Part = 1 | 2;
export const PARTS: readonly Part[] = [1, 2];

/** 교시 판정에 쓰는 반의 칸 */
export type PartSection = {
  subject?: string | null;
  first_subject?: string | null;
  second_start?: string | null;
  time_block?: string | null;
  course?: { program?: string | null } | null;
};

/**
 * 이 반의 교시 수 — 두 교시 = 점수보장반 · 과목 칸이 비고(두 과목을 이어 듣는 통짜) · 앞 교시 과목과 뒤 교시 시작이 있다.
 * **묶음 반은 부르는 쪽이 뺀다** (DB 는 `is_package_section` 으로 — 앱은 `sectionPackages` 로 안다). 그 밖은 교시 하나
 */
export function sectionParts(s: PartSection, opts: { isPackage?: boolean } = {}): 1 | 2 {
  if (opts.isPackage) return 1;
  const program = s.course?.program ?? "score";
  return program === "score" && s.subject == null && isSubject(s.first_subject) && !!s.second_start ? 2 : 1;
}

/** 교시의 과목 — 앞 교시는 `first_subject`, 뒤 교시는 다른 과목. 교시가 하나인 반은 반의 과목 */
export function partSubject(s: PartSection, part: Part, opts: { isPackage?: boolean } = {}): Subject | null {
  if (sectionParts(s, opts) === 2) {
    const first = s.first_subject as Subject;
    return part === 2 ? (first === "lc" ? "rc" : "lc") : first;
  }
  return isSubject(s.subject) ? s.subject : null;
}

/** "HH:MM:SS" · "HH:MM" → 자정부터 분. 모르면 null */
const minutesOf = (t: string | null | undefined): number | null => {
  const m = String(t ?? "").match(/^(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * 교시의 시작 · 끝(자정부터 분) — 앞 교시 = 반 시작 ~ 뒤 교시 시작, 뒤 교시 = 뒤 교시 시작 ~ 반 끝. 교시가 하나면 반의 시간대 그대로.
 * 시간대를 모르면 null (지난 것으로 치우지 않는다 — `sessionState` 와 같은 태도)
 */
export function partSpan(s: PartSection, part: Part, opts: { isPackage?: boolean } = {}): { start: number; end: number } | null {
  const block = parseTimeBlock(s.time_block);
  if (!block) return null;
  if (sectionParts(s, opts) !== 2) return block;
  const second = minutesOf(s.second_start);
  if (second == null) return block;
  return part === 1 ? { start: block.start, end: second } : { start: second, end: block.end };
}

/** 교시의 시간대 글자 `10:00~11:10` — 교시가 하나면 반의 시간대 라벨 */
export function partTimeBlock(s: PartSection, part: Part, opts: { isPackage?: boolean } = {}): string | null {
  if (sectionParts(s, opts) !== 2) return s.time_block ?? null;
  const span = partSpan(s, part, opts);
  return span ? `${hhmm(span.start)}~${hhmm(span.end)}` : (s.time_block ?? null);
}

/** 교시 이름 — `앞 교시 LC` · `뒤 교시 RC`. 교시가 하나인 반은 null (이름을 붙일 까닭이 없다) */
export function partLabel(s: PartSection, part: Part, opts: { isPackage?: boolean } = {}): string | null {
  if (sectionParts(s, opts) !== 2) return null;
  const subject = partSubject(s, part, opts);
  return `${part === 1 ? "앞 교시" : "뒤 교시"}${subject ? ` ${SUBJECT_LABEL[subject]}` : ""}`;
}

/** 이 반의 교시 목록 — [1] 또는 [1, 2] */
export const partsOf = (s: PartSection, opts: { isPackage?: boolean } = {}): Part[] => (sectionParts(s, opts) === 2 ? [1, 2] : [1]);

/** 회차의 링크 · 송출 · 다시보기 줄에서 이 교시 것 — 예전 줄(part 없음)은 1교시로 본다 */
export function ofPart<T extends { part?: number | null }>(rows: readonly T[] | T | null | undefined, part: Part): T | null {
  const list = rows == null ? [] : Array.isArray(rows) ? rows : [rows];
  return list.find((r) => (r.part ?? 1) === part) ?? null;
}

/** 폼 · 주소로 온 교시 값 → 1 | 2 (엉뚱하면 1) */
export const toPart = (v: unknown): Part => (Number(v) === 2 ? 2 : 1);
