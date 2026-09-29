/**
 * 시간표 설정 화면(`/admin/timetable`)의 입력 검사 (2026-09-23 Alan — "관리자모드에서 평달과 방학 시간표를 직접 설정할 수 있도록").
 *
 * 시간표는 평달·방학달 **두 벌**이고(①), 방학달은 방학 전에 그 벌을 고쳐 쓴다. 시간대를 더하면 반 일괄 개설 표에 그 줄이 바로 생기고,
 * 60분·120분 묶음 관계 · 묶음 반 권한 · 수강증 매칭은 시간의 포함·일치로 계산하므로 새 시간대도 저절로 따라온다.
 * 레벨은 늘지 않는다 (Alan) — 레벨은 `timetable_levels` 행 그대로이고 시간대만 더한다.
 */

import { isProgram, isSeason, type Program, type Season } from "./timetable";

export type SlotInput = {
  level: number;
  program: Program;
  season: Season;
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
  /** 이 시간대는 화목금이 인강 (저녁 줄) */
  ttfRecorded: boolean;
};

/** "9:00" · "09:00" · "09:00:00" → "09:00". 아니면 null */
export function normalizeTime(v: string | null | undefined): string | null {
  const m = String(v ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/*
 * 시각은 **시 · 분 두 칸을 골라** 적는다 (2026-09-29 Alan — "시간 설정에서 다 보이지가 않아서 설정하는데 어려움이 있어").
 * 브라우저 기본 시간 칸(`type="time"`)은 한국어 화면에서 `오전 10:00` 처럼 12시간제로 그려지고 기기마다 모양이 달라,
 * 좁은 칸에서 `오전 1(` 로 잘렸다. 브로슈어와 반 시간대 라벨은 24시간제(`18:30`)라 고르는 칸도 24시간제로 맞춘다.
 */

/** 시 칸: 00 ~ 23 */
export const HOURS: readonly string[] = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

/** 분 칸 간격. 수업 시간표는 10분 단위라 5분이면 넉넉하다 */
export const MINUTE_STEP = 5;

/** 분 칸: 00 · 05 · … · 55. 이미 저장된 값이 그 사이면(예: 12분) 그 값도 넣어 둔다 — 안 넣으면 고르는 칸이 엉뚱한 값을 보여 준다 */
export function minuteOptions(current?: string | null): string[] {
  const out = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, "0"));
  if (current && /^[0-5]\d$/.test(current) && !out.includes(current)) out.push(current);
  return out.sort();
}

/** "10:00:00" → { h: "10", m: "00" }. 못 읽으면 null (새 줄은 빈칸으로 시작한다) */
export function splitTime(v: string | null | undefined): { h: string; m: string } | null {
  const t = normalizeTime(v);
  return t ? { h: t.slice(0, 2), m: t.slice(3, 5) } : null;
}

/** 고른 시 · 분 → "HH:MM". 하나라도 비었거나 엉뚱하면 null */
export function joinTime(h: string | null | undefined, m: string | null | undefined): string | null {
  const hh = String(h ?? "").trim();
  const mm = String(m ?? "").trim();
  if (!/^\d{1,2}$/.test(hh) || !/^\d{2}$/.test(mm)) return null;
  return normalizeTime(`${hh}:${mm}`);
}

/** 폼 값 → 저장할 행. 틀리면 사람에게 보여 줄 한 줄 */
export function parseSlotInput(raw: {
  level: string | null | undefined;
  program: string | null | undefined;
  season: string | null | undefined;
  start: string | null | undefined;
  end: string | null | undefined;
  ttfRecorded: boolean;
}): { ok: true; slot: SlotInput } | { ok: false; error: string } {
  const level = Number(raw.level);
  if (!Number.isInteger(level) || level < 10 || level > 990) return { ok: false, error: "레벨을 다시 골라 주세요." };
  if (!isProgram(raw.program)) return { ok: false, error: "과정을 다시 골라 주세요." };
  if (!isSeason(raw.season)) return { ok: false, error: "평달·방학달 중 하나여야 해요." };
  const start = normalizeTime(raw.start);
  const end = normalizeTime(raw.end);
  if (!start || !end) return { ok: false, error: "시작·종료 시각을 시·분까지 골라 주세요." };
  if (end <= start) return { ok: false, error: "종료 시각이 시작 시각보다 뒤여야 해요." };
  return { ok: true, slot: { level, program: raw.program, season: raw.season, start, end, ttfRecorded: raw.ttfRecorded } };
}

/** 같은 (레벨 · 과정 · 계절)에 같은 시간이 이미 있나 — DB 의 unique 와 같은 키 */
export function duplicateSlot<T extends { id: number; level: number; program: string; season: string; start_time: string; end_time: string }>(
  slots: T[],
  slot: SlotInput,
  excludeId?: number | null,
): T | null {
  return (
    slots.find(
      (s) =>
        s.id !== excludeId &&
        s.level === slot.level &&
        s.program === slot.program &&
        s.season === slot.season &&
        normalizeTime(s.start_time) === slot.start &&
        normalizeTime(s.end_time) === slot.end,
    ) ?? null
  );
}
