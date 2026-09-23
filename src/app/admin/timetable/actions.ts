"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSeason } from "@/lib/timetable";
import { duplicateSlot, parseSlotInput } from "@/lib/timetable-admin";

/**
 * 시간표 설정 (2026-09-23 Alan — "관리자모드에서 평달과 방학 시간표를 직접 설정할수 있도록").
 * **강사·관리자만** — 쓰기는 로그인한 사람의 세션으로 해서 DB 정책(is_staff)이 한 번 더 막는다 (마이그레이션 20260923170000).
 * 시간표를 읽는 곳(랜딩 · 반 일괄 개설 · 다시보기 등록의 저녁 줄)을 저장 뒤 다시 그린다.
 */

const BACK = "/admin/timetable";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function done(season: string, ok: boolean, error?: string): never {
  revalidatePath(BACK);
  revalidatePath("/admin/sections");
  revalidatePath("/admin/replays");
  revalidatePath("/");
  const q = new URLSearchParams();
  if (isSeason(season)) q.set("season", season);
  if (ok) q.set("ok", "1");
  else q.set("error", error ?? "save");
  redirect(`${BACK}?${q.toString()}`);
}

/** 시간대 더하기 · 고치기 (id 가 있으면 고치기) */
export async function saveTimetableSlot(formData: FormData) {
  await requireStaff();
  const season = str(formData, "season");
  const idRaw = str(formData, "id");
  const id = idRaw ? Number(idRaw) : null;
  if (id !== null && !Number.isInteger(id)) done(season, false, "잘못된 요청입니다.");

  const parsed = parseSlotInput({
    level: str(formData, "level"),
    program: str(formData, "program"),
    season,
    start: str(formData, "start_time"),
    end: str(formData, "end_time"),
    ttfRecorded: str(formData, "ttf_recorded") === "on",
  });
  if (!parsed.ok) done(season, false, parsed.error);
  const slot = parsed.slot;

  const supabase = await createClient();
  const { data: existing } = await supabase.from("timetable_slots").select("id, level, program, season, start_time, end_time").eq("level", slot.level).eq("program", slot.program).eq("season", slot.season);
  const dup = duplicateSlot(existing ?? [], slot, id);
  if (dup) done(season, false, `${slot.start}~${slot.end} 은 이미 있어요.`);

  const row = { level: slot.level, program: slot.program, season: slot.season, start_time: slot.start, end_time: slot.end, ttf_recorded: slot.ttfRecorded };
  const { error } = id ? await supabase.from("timetable_slots").update(row).eq("id", id) : await supabase.from("timetable_slots").insert(row);
  done(season, !error, error?.code === "42501" ? "권한이 없어요. 강사·관리자만 시간표를 고칠 수 있어요." : error?.message);
}

/** 시간대 지우기 — 그 시간대로 이미 만든 반은 그대로 남는다 (반에는 시간이 글자로 박혀 있다) */
export async function deleteTimetableSlot(formData: FormData) {
  await requireStaff();
  const season = str(formData, "season");
  const id = Number(str(formData, "id"));
  if (!Number.isInteger(id) || id <= 0) done(season, false, "잘못된 요청입니다.");
  const supabase = await createClient();
  const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
  done(season, !error, error?.code === "42501" ? "권한이 없어요. 강사·관리자만 시간표를 고칠 수 있어요." : error?.message);
}

/** 레벨 카드 바닥의 한 줄 메모 (랜딩 카드에 그대로 나간다). 인강 여부는 여기 적지 않는다 — 시간대마다 체크한다 */
export async function saveTimetableLevelNote(formData: FormData) {
  await requireStaff();
  const season = str(formData, "season");
  const level = Number(str(formData, "level"));
  const note = str(formData, "note");
  if (!Number.isInteger(level)) done(season, false, "잘못된 요청입니다.");
  if (note.length > 80) done(season, false, "메모는 80자까지예요.");
  const supabase = await createClient();
  const { error } = await supabase.from("timetable_levels").update({ note: note || null }).eq("level", level);
  done(season, !error, error?.code === "42501" ? "권한이 없어요. 강사·관리자만 시간표를 고칠 수 있어요." : error?.message);
}
