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
  if (!start || !end) return { ok: false, error: "시작·종료 시각을 HH:MM 으로 적어 주세요 (예: 10:00)." };
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
