import type { Track } from "./receipt";
import { parseTimeBlock } from "./time-blocks";

/**
 * 수강증 한 장이 차지하는 **수업 자리 — 달 · 트랙 · 시간** (2026-10-06 Alan — 한 학생이 RC단과를 두 개 등록했다. "확인해줘").
 *
 * 한 학생이 한 달에 수강증을 **두 장** 낼 수 있다 — 단과를 둘 산 학생(10월 650: 월수금 10:00 RC + 화목금 11:10 RC)은
 * YBM 수강증이 두 장이고 등업신청도 두 번 한다. 그런데 두 규칙이 **그 학생의 다른 수강증을 모두** 같은 것으로 봤다:
 * - 다시 올리면 확인 중인 옛 수강증을 지우고 바꿔 넣는다 (2026-09-18 Alan "잘못 올린 경우 … 새 정보로 자동 교체")
 *   → 둘째 수강증을 올리는 순간 **확인 중이던 첫째가 지워졌다** (수동 등업신청을 두 번 내도 같다)
 * - 하나가 승인되면 같은 학생의 남은 확인 중 수강증을 닫는다 (2026-10-02 Alan "다시 제대로 올려서 승인이 되고 나면 … 빼주면")
 *   → 둘째가 확인 중일 때 첫째를 승인하면 **둘째가 닫혔다**
 *
 * 그래서 두 수강증이 **같은 자리**일 때만 같은 등록을 다시 낸 것(잘못 올림 · 반을 바꿈)으로 본다 —
 * 같은 반이 하나라도 겹치거나, 같은 달 · 같은 트랙에 **시간이 겹친다**(한 사람이 동시에 들을 수 없다).
 * 함께 들을 수 있으면 다른 강좌라 **둘 다 남긴다.** 무엇인지 모르는 수강증(못 읽음)은 예전 규칙 그대로 바꿔 넣고,
 * 새 것을 못 읽었을 때는 아는 옛 수강증을 지우지 않는다 — 모르면 지우지 않는 쪽이 안전하다.
 * 화면 · DB 가 없는 순수 함수라 테스트로 굳힌다 (`receipt-seat.test.ts`).
 */

/**
 * 한 트랙의 한 시간. 달 · 트랙을 못 읽었으면 null 이다 — 바꿔 넣기(`replacedByUpload`)는 그 칸을 어느 달 · 트랙과도 겹친다고 보고(예전처럼 바꿔 넣는 쪽),
 * 승인으로 닫기(`closedByApproval`)는 모르는 칸으로는 겹친다고 보지 않는다(확실할 때만 닫는다)
 */
export type ReceiptSlot = { month: number | null; track: Track | null; start: number; end: number };

/**
 * 수강증 한 장의 자리 — 반(학생이 고른 반 · 대조가 찾은 반)과 시간. 시간을 못 정하면 slots 가 null.
 * month = 수강월 — 시간을 못 읽어도 달은 알 때가 있다 (받아 둔 다음 달 수강증의 `candidates.hold` · 배지 `NN월 과정`).
 * capture = 그 수강증 그림 자체(파일 경로 · 파일 해시 · 캡처 시각 초) — 같은 그림이면 무엇을 골랐든 같은 등록이다
 */
export type ReceiptSeat = {
  sectionIds: number[];
  slots: ReceiptSlot[] | null;
  month?: number | null;
  capture?: { path?: string | null; hash?: string | null; capturedAt?: string | null };
};

/** 자리를 계산하는 데 쓰는 반 — `class_sections` 의 트랙 · 시간대 · 기수 달 */
export type SeatSection = { track: string; time_block: string | null; term: { month: number } | null };

/** 등업신청 한 건 — `enrollment_verifications` 의 칸들 */
export type SeatRow = {
  requested_section_ids?: readonly number[] | null;
  candidates?: unknown;
  parsed?: unknown;
  file_path?: string | null;
  file_hash?: string | null;
};

const isId = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;
const isMonth = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 12;
const isTrack = (t: unknown): t is Track => t === "mwf" || t === "ttf";

/** 반들의 자리. 시간을 못 읽는 반이 하나라도 있으면 null (시간으로는 견줄 수 없다 — 반 id 로만 견준다) */
export function slotsOfSections(sections: readonly SeatSection[]): ReceiptSlot[] | null {
  if (sections.length === 0) return null;
  const out: ReceiptSlot[] = [];
  for (const s of sections) {
    const span = parseTimeBlock(s.time_block);
    if (!span) return null;
    const month = s.term?.month;
    out.push({ month: isMonth(month) ? month : null, track: isTrack(s.track) ? s.track : null, ...span });
  }
  return out;
}

/**
 * 수강증에서 읽은 자리 (`enrollment_verifications.parsed` — 수강시간 · 트랙 · 수강월).
 * 수강시간을 못 읽었으면 null. 트랙 · 달을 못 읽었으면 그 칸은 null 이라 어느 트랙 · 달과도 겹친다고 본다 (같은 등록일 수 있다).
 */
export function slotsOfParsed(parsed: unknown): ReceiptSlot[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as { time?: { timeBlock?: unknown } | null; tracks?: unknown; courseMonth?: unknown; startMonth?: unknown };
  const span = parseTimeBlock(typeof p.time?.timeBlock === "string" ? p.time.timeBlock : null);
  if (!span) return null;
  const month = parsedMonth(parsed);
  const tracks = Array.isArray(p.tracks) ? [...new Set(p.tracks.filter(isTrack))] : [];
  return (tracks.length > 0 ? tracks : [null]).map((track) => ({ month, track, ...span }));
}

/** 수강증에서 읽은 수강월 — 배지 `NN월 과정` → 수강요일 줄의 개강일 달 (`receiptCourseMonth` 와 같은 순서) */
function parsedMonth(parsed: unknown): number | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as { courseMonth?: unknown; startMonth?: unknown };
  return isMonth(p.courseMonth) ? p.courseMonth : isMonth(p.startMonth) ? p.startMonth : null;
}

/** 반들이 모두 한 달이면 그 달 */
function sectionsMonth(sections: readonly SeatSection[]): number | null {
  const months = [...new Set(sections.map((s) => s.term?.month))];
  return months.length === 1 && isMonth(months[0]) ? months[0] : null;
}

/** 받아 둔 다음 달 수강증의 달 (`candidates.hold`) */
function heldMonth(candidates: unknown): number | null {
  if (!candidates || typeof candidates !== "object") return null;
  const hold = (candidates as { hold?: unknown }).hold;
  return isMonth(hold) ? hold : null;
}

/** 반 대조가 찾은 반 (`candidates.result` 가 match 일 때) */
function matchedSectionIds(candidates: unknown): number[] {
  if (!candidates || typeof candidates !== "object") return [];
  const result = (candidates as { result?: unknown }).result;
  if (!result || typeof result !== "object" || (result as { kind?: unknown }).kind !== "match") return [];
  const ids = (result as { sectionIds?: unknown }).sectionIds;
  return Array.isArray(ids) ? ids.filter(isId) : [];
}

/** 등업신청 한 건이 가리키는 반 — 학생이 직접 고른 반(수동 등업신청)이 먼저, 없으면 대조가 찾은 반 */
export function seatSectionIds(row: SeatRow): number[] {
  const requested = (row.requested_section_ids ?? []).filter(isId);
  return [...new Set(requested.length > 0 ? requested : matchedSectionIds(row.candidates))];
}

/** 아는 자리를 모두 모은다 — 하나도 모르면 null */
function unionSlots(...lists: (ReceiptSlot[] | null)[]): ReceiptSlot[] | null {
  const known = lists.filter((l): l is ReceiptSlot[] => l != null);
  return known.length > 0 ? known.flat() : null;
}

/**
 * 등업신청 한 건의 자리 = **그 반들의 시간 + 수강증 그림에서 읽은 시간**을 함께 본다.
 * 그림에서 읽은 시간도 넣는 까닭: 같은 수강증을 다시 캡처해 수동 등업신청에서 **반을 고쳐 고르면**(10:00 → 11:10) 고른 반끼리는 안 겹쳐도
 * 그림은 같은 강좌다 — 고친 신청이 옛 신청을 바꿔 넣어야 한다. 반 정보가 없으면(지워진 반) 그림에서 읽은 시간과 반 id 로만 견준다.
 */
export function seatOfRow(row: SeatRow, sections: ReadonlyMap<number, SeatSection>): ReceiptSeat {
  const sectionIds = seatSectionIds(row);
  const found = sectionIds.map((id) => sections.get(id)).filter((s): s is SeatSection => !!s);
  const fromSections = found.length > 0 && found.length === sectionIds.length ? slotsOfSections(found) : null;
  return {
    sectionIds,
    slots: unionSlots(fromSections, slotsOfParsed(row.parsed)),
    month: heldMonth(row.candidates) ?? (found.length > 0 ? sectionsMonth(found) : null) ?? parsedMonth(row.parsed),
    capture: { path: row.file_path ?? null, hash: row.file_hash ?? null, capturedAt: capturedAtOf(row.parsed) },
  };
}

/** 수강증 맨 위 `현재시간` (초까지) — `parsed.capturedAt` */
export function capturedAtOf(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const at = (parsed as { capturedAt?: unknown }).capturedAt;
  return typeof at === "string" && at.length > 0 ? at : null;
}

/**
 * 새로 낸 반들의 자리 (자동 승인 · 수동 등업신청 · 스태프 승인에서 고른 반). capture = 그 수강증 그림,
 * parsed = 그 그림에서 읽은 값 — 읽은 시간도 자리에 더한다 (`seatOfRow` 와 같은 규칙)
 */
export function seatOfSections(sections: readonly (SeatSection & { id: number })[], capture?: ReceiptSeat["capture"], parsed?: unknown): ReceiptSeat {
  return {
    sectionIds: sections.map((s) => s.id),
    slots: unionSlots(slotsOfSections(sections), slotsOfParsed(parsed)),
    month: (sections.length > 0 ? sectionsMonth(sections) : null) ?? parsedMonth(parsed),
    ...(capture ? { capture } : {}),
  };
}

/** 견주는 방식 — strict 면 달 · 트랙을 모르는 칸은 겹친다고 보지 않는다 (승인으로 닫을 때) */
type Compare = { strict?: boolean };

function clash(a: ReceiptSlot, b: ReceiptSlot, { strict = false }: Compare = {}): boolean {
  const sameMonth = strict ? a.month != null && a.month === b.month : a.month == null || b.month == null || a.month === b.month;
  const sameTrack = strict ? a.track != null && a.track === b.track : a.track == null || b.track == null || a.track === b.track;
  return sameMonth && sameTrack && a.start < b.end && b.start < a.end;
}

/** 두 자리 목록이 한 칸이라도 부딪히는가 — 같은 달 · 같은 트랙에 시간이 겹친다 */
export function slotsClash(a: readonly ReceiptSlot[], b: readonly ReceiptSlot[], compare: Compare = {}): boolean {
  return a.some((x) => b.some((y) => clash(x, y, compare)));
}

/** 같은 그림인가 — 같은 파일(경로 · 해시)이거나 같은 초에 캡처했다 (수강증 맨 위 `현재시간` 은 초까지 찍힌다) */
export function sameCapture(a: ReceiptSeat, b: ReceiptSeat): boolean {
  const x = a.capture;
  const y = b.capture;
  if (!x || !y) return false;
  return (!!x.path && x.path === y.path) || (!!x.hash && x.hash === y.hash) || (!!x.capturedAt && x.capturedAt === y.capturedAt);
}

/**
 * 같은 자리인가 — true(같은 등록을 다시 냈다) · false(함께 들을 수 있는 다른 강좌) · null(견줄 수 없다).
 * 같은 그림이거나 같은 반이 하나라도 있으면 같은 자리다. 아니면 시간으로 견준다.
 */
export function sameSeat(a: ReceiptSeat, b: ReceiptSeat, compare: Compare = {}): boolean | null {
  if (sameCapture(a, b)) return true;
  if (a.sectionIds.some((id) => b.sectionIds.includes(id))) return true;
  if (a.slots && b.slots) return slotsClash(a.slots, b.slots, compare);
  return null;
}

/** 무엇을 낸 것인지 아는가 — 반이나 시간 중 하나라도 (그림이 같은지는 따로 본다 — `sameCapture`) */
export function seatKnown(s: ReceiptSeat): boolean {
  return s.sectionIds.length > 0 || s.slots != null;
}

/** 자리의 수강월 — 적힌 달, 없으면 시간 칸들이 모두 한 달일 때 그 달 */
function seatMonth(s: ReceiptSeat): number | null {
  if (s.month != null) return s.month;
  const months = [...new Set((s.slots ?? []).map((x) => x.month))];
  return months.length === 1 ? months[0] : null;
}

/**
 * 새 수강증을 올렸을 때 **확인 중인 옛 수강증을 지우고 바꿔 넣을까.**
 * - 같은 그림 → 바꿔 넣는다
 * - 옛 것이 무엇인지 모른다(시간 · 반을 못 읽음) → 바꿔 넣는다 — 잘못 올린 것을 다시 올린 경우다 (2026-09-18 규칙 그대로).
 *   단 **다른 달 수강증이 확실하면 남긴다** — 받아 둔 다음 달 수강증을 이번 달 수강증이 지우면 안 된다
 * - 같은 자리 → 바꿔 넣는다 (같은 수강증 다시 · 반을 바꿈. 달 · 트랙을 못 읽은 칸은 어느 것과도 겹친다고 본다)
 * - 함께 들을 수 있는 다른 강좌 → **둘 다 둔다** (단과 두 개)
 * - 견줄 수 없다(새 것을 못 읽음 등) → 둔다 — 아는 수강증을 짐작으로 지우지 않는다. 남은 것은 스태프가 본다
 */
export function replacedByUpload(old: ReceiptSeat, next: ReceiptSeat): boolean {
  if (sameCapture(old, next)) return true;
  if (!seatKnown(old)) {
    const a = seatMonth(old);
    const b = seatMonth(next);
    return !(a != null && b != null && a !== b);
  }
  return sameSeat(old, next) === true;
}

/**
 * 수강증을 승인했을 때 **같은 학생의 확인 중인 다른 수강증을 닫을까** — 같은 등록이 **확실할 때만** 닫는다:
 * 같은 그림 · 같은 반 · 달과 트랙까지 읽힌 시간이 겹침. 다른 강좌의 수강증 · 무엇인지 모르는 수강증은 그대로 둔다 (스태프가 따로 승인하거나 반려한다).
 */
export function closedByApproval(row: ReceiptSeat, approved: ReceiptSeat): boolean {
  return sameSeat(row, approved, { strict: true }) === true;
}
