import "server-only";
import type { createAdminClient } from "./supabase/admin";

/**
 * 이 반의 과정·과목을 정하는 **그 달 시간표 줄** (2026-09-29 — 시간표는 달마다 한 벌이고 반은 시간표를 따라간다).
 * 같은 달 · 같은 강좌(레벨 × 과정) · 같은 시간대 라벨의 줄이다 — DB 트리거(private.tg_timetable_month_sync)가 반을 맞출 때와 같은 짝이다.
 * 줄이 있으면 반의 과정·과목은 시간표에서 고치고(반 상세는 보여 주기만), 없으면(시간대 없이 하나씩 만든 반) 반에서 고친다.
 */
type Client = Pick<ReturnType<typeof createAdminClient>, "from">;

export type TimetableRow = { id: number; book_set: string | null; subject_mwf: string | null; subject_ttf: string | null };

export async function timetableRowOf(
  supabase: Client,
  section: { time_block: string | null; course: { target_score: number | null; program: string } | null; term: { year: number; month: number } | null },
): Promise<TimetableRow | null> {
  const span = section.time_block?.match(/^(\d{2}:\d{2})~(\d{2}:\d{2})$/);
  if (!span || !section.course?.target_score || !section.term) return null;
  const { data } = await supabase
    .from("timetable_slots")
    .select("id, book_set, subject_mwf, subject_ttf")
    .eq("year", section.term.year)
    .eq("month", section.term.month)
    .eq("level", section.course.target_score)
    .eq("program", section.course.program)
    .eq("start_time", span[1])
    .eq("end_time", span[2])
    .maybeSingle();
  return data ?? null;
}
