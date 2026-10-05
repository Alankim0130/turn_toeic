"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { duplicateSlot, joinTime, parseSlotInput } from "@/lib/timetable-admin";
import {
  bundleCandidates,
  chooseMonthSource,
  draftMonth,
  fieldsFor,
  kindOf,
  madeMonths,
  orphanTwoWeekRows,
  parseYm,
  slotKinds,
  slotLabelOf,
  sourceNote,
} from "@/lib/timetable-month";
import { blockContains } from "@/lib/time-blocks";

/**
 * 시간표 설정 — **달마다 한 벌** (2026-09-29 Alan "월별로 디테일하게 … 1월 시간표를 정확하게 세팅하고, 2월 시간표까지 미리").
 * **강사·관리자만** — 쓰기는 로그인한 사람의 세션으로 해서 DB 정책(is_staff)이 한 번 더 막는다 (마이그레이션 20260923170000).
 *
 * 달 줄을 고치면 **DB 트리거가 그 달 반을 맞춘다** (마이그레이션 20260929160000) — 시간대 라벨 · 과정 · 트랙별 과목 · 인강.
 * 그 반을 읽는 담당 강사 자동 매칭 · 학생 LC 교재 · 저녁 반 다시보기 짝 · 불라방 · 출석 · 권한이 함께 따라온다
 * ("이 모든 변경과 세팅은 가입되어있는 모든 학생들에게 (기존의 학생, 신규학생들)에게 적용이 되어야해").
 * 여기서는 줄의 종류(시간 단위 · 방학달 통짜 · 한달완성 · 스파르타)에 맞지 않는 칸을 비우고, 한달완성 줄의 인강을 두 시간에 맞춘다.
 */

const BACK = "/admin/timetable";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const SLOT_COLUMNS = "id, year, month, level, program, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf";

type Supa = Awaited<ReturnType<typeof createClient>>;
type SlotUpdate = Database["public"]["Tables"]["timetable_slots"]["Update"];
type DbError = { code?: string; message?: string; details?: string } | null;

function done(month: string, result: { ok?: string; error?: string }): never {
  revalidatePath(BACK);
  revalidatePath("/admin/sections");
  revalidatePath("/admin/replays");
  revalidatePath("/");
  const q = new URLSearchParams();
  if (/^\d{4}-\d{2}$/.test(month)) q.set("month", month);
  if (result.error) q.set("error", result.error);
  else q.set("ok", result.ok ?? "저장했어요.");
  redirect(`${BACK}?${q.toString()}`);
}

/** DB 가 막은 까닭을 사람 말로 */
function slotError(error: DbError, fallback = "저장하지 못했어요. 다시 시도해 주세요."): string {
  if (!error) return fallback;
  if (error.code === "42501") return "권한이 없어요. 강사·관리자만 시간표를 고칠 수 있어요.";
  if (error.code === "23505") return "같은 달에 같은 시간대가 이미 있어요.";
  if (error.code === "23514") return "시간이 맞지 않아요. 종료가 시작보다 뒤여야 하고, 한달완성 줄이 품는 두 시간과도 어긋나면 안 돼요.";
  if (error.message?.includes("timetable_slot_in_use")) {
    const n = Number(error.details);
    return `이 달 반${Number.isFinite(n) && n > 0 ? ` ${n}개` : ""}가 이 시간대를 쓰고 있어 지울 수 없어요. 반 편성에서 반을 먼저 정리해 주세요.`;
  }
  return fallback;
}

/** 그 달 · 레벨 · 과정 줄들 */
async function loadGroup(supabase: Supa, y: number, m: number, level: number, program: string) {
  const { data } = await supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("year", y).eq("month", m).eq("level", level).eq("program", program);
  return data ?? [];
}

/**
 * 줄을 바꾼 뒤 같은 무리를 다시 맞춘다 — ① 종류가 허락하지 않는 칸 비우기(시간이 바뀌어 한달완성이 되거나 풀린 줄)
 * ② 한달완성 줄의 인강 = 품은 두 시간이 모두 인강일 때 (저녁 한달완성 반 학생의 출석·다시보기 짝이 이 값을 읽는다).
 * 고친 줄마다 트리거가 그 달 반을 함께 맞춘다.
 */
async function normalizeGroup(supabase: Supa, y: number, m: number, level: number, program: string) {
  const rows = await loadGroup(supabase, y, m, level, program);
  const kinds = slotKinds(rows);
  for (const r of rows) {
    const kind = kinds.get(r.id)!;
    const patch: SlotUpdate = {};
    const f = fieldsFor(kind, r);
    if (f.book_set !== r.book_set) patch.book_set = f.book_set;
    if (f.subject_mwf !== r.subject_mwf) patch.subject_mwf = f.subject_mwf;
    if (f.subject_ttf !== r.subject_ttf) patch.subject_ttf = f.subject_ttf;
    if (kind === "package") {
      const parts = rows.filter((o) => o.id !== r.id && blockContains(slotLabelOf(r), slotLabelOf(o)));
      const evening = parts.length > 0 && parts.every((p) => p.ttf_recorded);
      if (evening !== r.ttf_recorded) patch.ttf_recorded = evening;
    }
    if (Object.keys(patch).length > 0) await supabase.from("timetable_slots").update(patch).eq("id", r.id);
  }
}

/** 이 달 · 이 강좌 · 이 시간대로 만든 반 수 — "이 달 반 N개에 적용했어요" */
async function sectionCount(supabase: Supa, y: number, m: number, level: number, program: string, label: string) {
  const { data: term } = await supabase.from("terms").select("id").eq("year", y).eq("month", m).maybeSingle();
  if (!term) return 0;
  const { data: courses } = await supabase.from("courses").select("id").eq("target_score", level).eq("program", program);
  const ids = (courses ?? []).map((c) => c.id);
  if (ids.length === 0) return 0;
  const { count } = await supabase.from("class_sections").select("id", { count: "exact", head: true }).eq("term_id", term.id).eq("time_block", label).in("course_id", ids);
  return count ?? 0;
}

/** 시간대 더하기 · 고치기 (id 가 있으면 고치기) — 시각 · 화목금 인강 · 과정 · 트랙별 과목 */
export async function saveTimetableSlot(formData: FormData) {
  await requireStaff();
  const month = str(formData, "month");
  const idRaw = str(formData, "id");
  const id = idRaw ? Number(idRaw) : null;
  if (id !== null && !Number.isInteger(id)) done(month, { error: "잘못된 요청입니다." });

  // 시각은 시 · 분 두 칸으로 온다 (24시간제 — timetable-admin.ts)
  const parsed = parseSlotInput({
    month,
    level: str(formData, "level"),
    program: str(formData, "program"),
    start: joinTime(str(formData, "start_h"), str(formData, "start_m")),
    end: joinTime(str(formData, "end_h"), str(formData, "end_m")),
    ttfRecorded: str(formData, "ttf_recorded") === "on",
    bookSet: str(formData, "book_set"),
    subjectMwf: str(formData, "subject_mwf"),
    subjectTtf: str(formData, "subject_ttf"),
  });
  if (!parsed.ok) done(month, { error: parsed.error });
  const slot = parsed.slot;

  const supabase = await createClient();
  const group = await loadGroup(supabase, slot.year, slot.month, slot.level, slot.program);
  const before = id ? group.find((r) => r.id === id) : null;
  if (id && !before) done(month, { error: "시간대를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요." });
  if (duplicateSlot(group, slot, id)) done(month, { error: `${slot.start}~${slot.end} 은 이 달에 이미 있어요.` });

  // 종류는 바꾼 뒤의 시간으로 본다 — 허락하지 않는 칸은 비운다 (한달완성·스파르타 줄에 과정이 남으면 그 반 학생의 교재가 틀어진다)
  const after = { id: id ?? -1, level: slot.level, program: slot.program, start_time: `${slot.start}:00`, end_time: `${slot.end}:00` };
  const kind = kindOf(after, [...group.filter((r) => r.id !== id), after]);
  const fields = fieldsFor(kind, { book_set: slot.bookSet, subject_mwf: slot.subjectMwf, subject_ttf: slot.subjectTtf });

  const applied = before ? await sectionCount(supabase, slot.year, slot.month, slot.level, slot.program, slotLabelOf(before)) : 0;
  const row = {
    year: slot.year,
    month: slot.month,
    level: slot.level,
    program: slot.program,
    start_time: slot.start,
    end_time: slot.end,
    ttf_recorded: slot.ttfRecorded,
    ...fields,
  };
  const { error } = id ? await supabase.from("timetable_slots").update(row).eq("id", id) : await supabase.from("timetable_slots").insert(row);
  if (error) done(month, { error: slotError(error) });

  await normalizeGroup(supabase, slot.year, slot.month, slot.level, slot.program);
  done(month, {
    ok:
      applied > 0
        ? `저장했어요. ${slot.month}월 반 ${applied}개에 바로 적용했어요 — 담당 강사 · LC 교재 · 다시보기 짝도 함께 맞춰져요.`
        : "저장했어요.",
  });
}

/** 시간대 지우기 — 그 달 반이 쓰고 있으면 DB 가 막는다. 한 시간만 남게 된 한달완성 줄 · 품을 시간이 없어진 2주완성 줄은 함께 지운다 */
export async function deleteTimetableSlot(formData: FormData) {
  await requireStaff();
  const month = str(formData, "month");
  const id = Number(str(formData, "id"));
  if (!Number.isInteger(id) || id <= 0) done(month, { error: "잘못된 요청입니다." });
  const supabase = await createClient();
  const { data: target } = await supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("id", id).maybeSingle();
  if (!target || target.year == null || target.month == null) done(month, { error: "시간대를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요." });

  const group = await loadGroup(supabase, target.year, target.month, target.level, target.program);
  const holders = group.filter((p) => p.id !== id && blockContains(slotLabelOf(p), slotLabelOf(target)));
  const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
  if (error) done(month, { error: slotError(error, "지우지 못했어요. 다시 시도해 주세요.") });

  // 이 시간을 품던 한달완성 줄이 한 시간만 품게 되면 뜻이 없다 — 지운다 (반이 쓰고 있으면 DB 가 막으니 그대로 둔다)
  const rest = group.filter((r) => r.id !== id);
  for (const p of holders) {
    const parts = rest.filter((o) => o.id !== p.id && blockContains(slotLabelOf(p), slotLabelOf(o)));
    if (parts.length < 2) await supabase.from("timetable_slots").delete().eq("id", p.id);
  }
  // 품을 시간이 없어진 2주완성 줄도 지운다 — 방학달에 쓰지 않는 850 시간(기본 줄에는 7월 · 8월이 함께 있다)을 지울 때 (2026-10-05).
  // 반이 쓰고 있으면 DB 가 막으니 그대로 둔다
  if (target.program === "score") {
    const [score, twoWeek] = await Promise.all([
      loadGroup(supabase, target.year, target.month, target.level, "score"),
      loadGroup(supabase, target.year, target.month, target.level, "twoweek"),
    ]);
    for (const w of orphanTwoWeekRows(twoWeek, score)) await supabase.from("timetable_slots").delete().eq("id", w.id);
  }
  await normalizeGroup(supabase, target.year, target.month, target.level, target.program);
  done(month, { ok: "지웠어요." });
}

/** 새 달 시간표 만들기 — 앞선 달에서 가져온다 (이어지면 과정 뒤집기 · 과목 그대로, 계절이 끊겼으면 시간만) */
export async function createMonthTimetable(formData: FormData) {
  await requireStaff();
  const month = str(formData, "month");
  const ym = parseYm(month, { y: 0, m: 0 });
  if (ym.y === 0) done(month, { error: "어느 달인지 다시 골라 주세요." });

  const supabase = await createClient();
  const { data: index } = await supabase.from("timetable_slots").select("year, month, season");
  const all = index ?? [];
  if (all.some((r) => r.year === ym.y && r.month === ym.m)) done(month, { error: `${ym.m}월 시간표는 이미 있어요.` });

  const source = chooseMonthSource(ym, madeMonths(all), (s) => all.some((r) => r.year == null && r.season === s));
  let rows: { level: number; program: string; start_time: string; end_time: string; ttf_recorded: boolean; book_set: string | null; subject_mwf: string | null; subject_ttf: string | null }[] = [];
  if (source.kind === "month") {
    const { data } = await supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("year", source.from.y).eq("month", source.from.m);
    rows = data ?? [];
  } else if (source.kind === "template") {
    const { data } = await supabase.from("timetable_slots").select(SLOT_COLUMNS).is("year", null).eq("season", source.season);
    rows = data ?? [];
  }
  if (rows.length === 0) done(month, { error: "가져올 시간표가 없어요. 카드에서 시간대를 하나씩 더해 주세요." });

  const draft = draftMonth(source, rows).map((r) => ({ ...r, year: ym.y, month: ym.m }));
  const { error } = await supabase.from("timetable_slots").insert(draft);
  if (error) done(month, { error: slotError(error, "시간표를 만들지 못했어요. 다시 시도해 주세요.") });
  done(month, { ok: `${ym.m}월 시간표를 만들었어요. ${sourceNote(ym, source)}` });
}

/** 이어지는 두 시간을 한달완성으로 묶기 — 한달완성 수강증(수강시간 10:00~12:10)이 이 반을 찾는다 */
export async function bundleHours(formData: FormData) {
  await requireStaff();
  const month = str(formData, "month");
  const first = Number(str(formData, "first"));
  const second = Number(str(formData, "second"));
  if (!Number.isInteger(first) || !Number.isInteger(second)) done(month, { error: "잘못된 요청입니다." });

  const supabase = await createClient();
  const { data: a } = await supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("id", first).maybeSingle();
  if (!a || a.year == null || a.month == null || a.program !== "score") done(month, { error: "시간대를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요." });
  const group = await loadGroup(supabase, a.year, a.month, a.level, a.program);
  const pick = bundleCandidates(group).find((c) => c.first.id === first && c.second.id === second);
  if (!pick) done(month, { error: "이어지는 두 시간만 한달완성으로 묶을 수 있어요." });

  const { error } = await supabase.from("timetable_slots").insert({
    year: a.year,
    month: a.month,
    level: a.level,
    program: "score",
    start_time: pick.first.start_time,
    end_time: pick.second.end_time,
    ttf_recorded: pick.first.ttf_recorded && pick.second.ttf_recorded,
  });
  if (error) done(month, { error: slotError(error) });
  done(month, { ok: `한달완성 ${pick.label} 을 만들었어요. 반 편성의 일괄 개설 표에 그 줄이 생겨요.` });
}

/** 레벨 카드 바닥의 한 줄 메모 (랜딩 카드에 그대로 나간다 · 모든 달 공통). 인강 여부는 여기 적지 않는다 — 시간대마다 체크한다 */
export async function saveTimetableLevelNote(formData: FormData) {
  await requireStaff();
  const month = str(formData, "month");
  const level = Number(str(formData, "level"));
  const note = str(formData, "note");
  if (!Number.isInteger(level)) done(month, { error: "잘못된 요청입니다." });
  if (note.length > 80) done(month, { error: "메모는 80자까지예요." });
  const supabase = await createClient();
  const { error } = await supabase.from("timetable_levels").update({ note: note || null }).eq("level", level);
  if (error) done(month, { error: slotError(error) });
  done(month, { ok: "메모를 저장했어요." });
}
