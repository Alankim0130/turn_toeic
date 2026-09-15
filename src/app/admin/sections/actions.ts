"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, isAdmin } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { isHm, isYmd } from "@/components/admin/sections/dates";

type SectionInsert = Database["public"]["Tables"]["class_sections"]["Insert"];
type SectionUpdate = Database["public"]["Tables"]["class_sections"]["Update"];

export type ActionState = { ok?: boolean; error?: string; message?: string; values?: Record<string, string> };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const toInt = (s: string) => (s === "" ? null : Number(s.replace(/[^\d-]/g, "")));

function rlsMessage(code?: string, fallback = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.") {
  if (code === "42501") return "권한이 없어요. 본인 반만 수정할 수 있습니다.";
  if (code === "23505") return "이미 같은 값이 있어요. (중복)";
  if (code === "23514") return "입력값이 규칙에 맞지 않아요. 날짜·시간·금액을 확인해 주세요.";
  return fallback;
}

/* ─── 기수(월) 생성 ─────────────────────────────────────────────────────── */
export async function createTerm(formData: FormData) {
  await requireStaff();
  const year = Number(str(formData, "year"));
  const month = Number(str(formData, "month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return;

  const supabase = await createClient();
  await supabase.from("terms").insert({ year, month });
  revalidatePath("/admin/sections");
  redirect(`/admin/sections?term=${year}-${String(month).padStart(2, "0")}`);
}

/* ─── 강좌 마스터 추가 ──────────────────────────────────────────────────── */
export async function createCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const values = {
    code: str(formData, "code").toUpperCase(),
    name: str(formData, "name"),
    course_type: str(formData, "course_type"),
    target_score: str(formData, "target_score"),
  };
  if (!/^[A-Z0-9_-]{2,20}$/.test(values.code)) return { error: "코드는 영문·숫자 2~20자로 입력해 주세요. (예: FULL750)", values };
  if (values.name.length < 2) return { error: "강좌명을 입력해 주세요.", values };
  if (!["full", "lc", "rc"].includes(values.course_type)) return { error: "강좌 유형을 선택해 주세요.", values };
  const target = toInt(values.target_score);
  if (target !== null && (target < 10 || target > 990)) return { error: "목표 점수는 10~990 사이여야 해요.", values };

  const supabase = await createClient();
  const { error } = await supabase.from("courses").insert({
    code: values.code,
    name: values.name,
    course_type: values.course_type,
    target_score: target,
    is_active: true,
  });
  if (error) return { error: rlsMessage(error.code, "강좌를 추가하지 못했어요."), values };

  revalidatePath("/admin/sections");
  return { ok: true, message: `강좌 "${values.name}" 을(를) 추가했어요.` };
}

/* ─── 반 개설 ───────────────────────────────────────────────────────────── */
type SectionFields = {
  start_time: string;
  end_time: string;
  time_block: string | null;
  enrollment_opens_at: string;
  closes_at: string;
  target_sessions: number;
  capacity: number | null;
  tuition: number;
  live_tuition: number | null;
  status: string;
};

function parseSectionFields(formData: FormData, allowedStatus: string[]): { fields?: SectionFields; error?: string; values: Record<string, string> } {
  const values = {
    start_time: str(formData, "start_time"),
    end_time: str(formData, "end_time"),
    time_block: str(formData, "time_block"),
    enrollment_opens_at: str(formData, "enrollment_opens_at"),
    closes_at: str(formData, "closes_at"),
    target_sessions: str(formData, "target_sessions") || "10",
    capacity: str(formData, "capacity"),
    tuition: str(formData, "tuition"),
    live_tuition: str(formData, "live_tuition"),
    status: str(formData, "status") || "draft",
  };
  if (!isHm(values.start_time) || !isHm(values.end_time)) return { error: "수업 시간을 입력해 주세요.", values };
  if (values.end_time <= values.start_time) return { error: "종료 시간은 시작 시간보다 늦어야 해요.", values };
  if (!isYmd(values.enrollment_opens_at) || !isYmd(values.closes_at)) return { error: "개강일과 종강일을 입력해 주세요.", values };
  if (values.closes_at < values.enrollment_opens_at) return { error: "종강일은 개강일과 같거나 이후여야 해요.", values };
  const target = toInt(values.target_sessions);
  if (target === null || target < 1 || target > 60) return { error: "회차 수는 1~60 사이로 입력해 주세요.", values };
  const capacity = toInt(values.capacity);
  if (capacity !== null && capacity < 1) return { error: "정원은 1명 이상이어야 해요.", values };
  const tuition = toInt(values.tuition);
  if (tuition === null || tuition < 0) return { error: "현장 수강료를 입력해 주세요. (숫자만)", values };
  const live = toInt(values.live_tuition);
  if (live !== null && live < 0) return { error: "불라방 수강료는 0 이상이어야 해요.", values };
  if (!allowedStatus.includes(values.status)) return { error: "상태 값이 올바르지 않아요.", values };

  return {
    values,
    fields: {
      start_time: values.start_time,
      end_time: values.end_time,
      time_block: values.time_block || null,
      enrollment_opens_at: values.enrollment_opens_at,
      closes_at: values.closes_at,
      target_sessions: target,
      capacity,
      tuition,
      live_tuition: live,
      status: values.status,
    },
  };
}

export async function createSection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireStaff();
  const parsed = parseSectionFields(formData, ["draft", "open"]);
  const values = { ...parsed.values, course_id: str(formData, "course_id"), track: str(formData, "track"), instructor_id: str(formData, "instructor_id") };
  if (parsed.error || !parsed.fields) return { error: parsed.error, values };

  const termId = toInt(str(formData, "term_id"));
  const courseId = toInt(values.course_id);
  const track = values.track;
  if (!termId) return { error: "기수(월)가 선택되지 않았어요.", values };
  if (!courseId) return { error: "강좌를 선택해 주세요.", values };
  if (!["mwf", "ttf", "both"].includes(track)) return { error: "트랙을 선택해 주세요.", values };

  // 강사는 본인만, admin 은 다른 강사 지정 가능
  const instructorId = isAdmin(profile.role) && values.instructor_id ? values.instructor_id : user.id;

  const supabase = await createClient();
  const base = { ...parsed.fields, term_id: termId, course_id: courseId, instructor_id: instructorId };
  let rows: SectionInsert[];
  if (track === "both") {
    const bundle = crypto.randomUUID();
    rows = [
      { ...base, track: "mwf", bundle_id: bundle },
      { ...base, track: "ttf", bundle_id: bundle },
    ];
  } else {
    rows = [{ ...base, track, bundle_id: null }];
  }

  const { data, error } = await supabase.from("class_sections").insert(rows).select("id");
  if (error) return { error: rlsMessage(error.code, "반을 개설하지 못했어요."), values };

  const { data: term } = await supabase.from("terms").select("year, month").eq("id", termId).single();
  const q = new URLSearchParams();
  if (term) q.set("term", `${term.year}-${String(term.month).padStart(2, "0")}`);
  q.set("created", String(rows.length));

  revalidatePath("/admin/sections");
  revalidatePath("/");
  if (rows.length === 1 && data?.[0]) redirect(`/admin/sections/${data[0].id}?created=1`);
  redirect(`/admin/sections?${q.toString()}`);
}

/* ─── 반 정보 수정 ──────────────────────────────────────────────────────── */
export async function updateSection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireStaff();
  const id = toInt(str(formData, "id"));
  if (!id) return { error: "잘못된 요청이에요." };
  const parsed = parseSectionFields(formData, ["draft", "open", "closed"]);
  const values = { ...parsed.values, instructor_id: str(formData, "instructor_id") };
  if (parsed.error || !parsed.fields) return { error: parsed.error, values };

  const supabase = await createClient();
  const patch: SectionUpdate = { ...parsed.fields };
  if (isAdmin(profile.role) && values.instructor_id) patch.instructor_id = values.instructor_id;

  const { data, error } = await supabase.from("class_sections").update(patch).eq("id", id).select("id");
  if (error) return { error: rlsMessage(error.code), values };
  if (!data || data.length === 0) return { error: "수정 권한이 없거나 반을 찾을 수 없어요.", values };

  revalidatePath(`/admin/sections/${id}`);
  revalidatePath("/admin/sections");
  revalidatePath("/");
  return { ok: true, message: "반 정보를 저장했어요.", values };
}

/* ─── 반 삭제 ───────────────────────────────────────────────────────────── */
export async function deleteSection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const id = toInt(str(formData, "id"));
  if (!id) return { error: "잘못된 요청이에요." };
  if (str(formData, "confirm") !== "DELETE") return { error: "확인 문구가 일치하지 않아요." };

  const supabase = await createClient();
  const { count } = await supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("section_id", id);
  if ((count ?? 0) > 0) return { error: `이 반에 배정된 수강생이 ${count}명 있어 삭제할 수 없어요. 상태를 '종료'로 바꿔 주세요.` };

  const { data: sec } = await supabase.from("class_sections").select("term:terms(year, month)").eq("id", id).maybeSingle();
  const { data, error } = await supabase.from("class_sections").delete().eq("id", id).select("id");
  if (error) return { error: rlsMessage(error.code, "삭제하지 못했어요.") };
  if (!data || data.length === 0) return { error: "삭제 권한이 없거나 반을 찾을 수 없어요." };

  revalidatePath("/admin/sections");
  revalidatePath("/admin/replays");
  revalidatePath("/");
  const t = sec?.term;
  redirect(t ? `/admin/sections?term=${t.year}-${String(t.month).padStart(2, "0")}&deleted=1` : "/admin/sections?deleted=1");
}

/* ─── 불라방 링크 ───────────────────────────────────────────────────────── */
export async function upsertLiveLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const sectionId = toInt(str(formData, "section_id"));
  const url = str(formData, "live_url");
  if (!sectionId) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  if (url === "") {
    const { error } = await supabase.from("section_live_links").delete().eq("section_id", sectionId);
    if (error) return { error: rlsMessage(error.code) };
    revalidatePath(`/admin/sections/${sectionId}`);
    return { ok: true, message: "불라방 링크를 삭제했어요." };
  }
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    return { error: "http(s):// 로 시작하는 주소를 입력해 주세요.", values: { live_url: url } };
  }

  const { data, error } = await supabase
    .from("section_live_links")
    .upsert({ section_id: sectionId, live_url: url, updated_at: new Date().toISOString() }, { onConflict: "section_id" })
    .select("section_id");
  if (error) return { error: rlsMessage(error.code), values: { live_url: url } };
  if (!data || data.length === 0) return { error: "권한이 없어요. 본인 반만 수정할 수 있습니다.", values: { live_url: url } };

  revalidatePath(`/admin/sections/${sectionId}`);
  revalidatePath("/admin/sections");
  return { ok: true, message: "불라방 링크를 저장했어요.", values: { live_url: url } };
}

/* ─── 편성(수업일) 저장 ─────────────────────────────────────────────────── */
export type SessionInput = { date: string; start_time: string; end_time: string };
export type SaveResult = { ok: boolean; error?: string; inserted?: number; deleted?: number; updated?: number; blocked?: string[] };

export async function saveSessionDates(sectionId: number, dates: SessionInput[]): Promise<SaveResult> {
  await requireStaff();
  if (!Number.isInteger(sectionId)) return { ok: false, error: "잘못된 요청이에요." };

  // 입력 검증 + 중복 제거
  const next = new Map<string, SessionInput>();
  for (const d of dates) {
    if (!isYmd(d.date) || !isHm(d.start_time) || !isHm(d.end_time)) return { ok: false, error: `날짜/시간 형식이 잘못됐어요: ${d.date}` };
    if (d.end_time.slice(0, 5) <= d.start_time.slice(0, 5)) return { ok: false, error: `${d.date} 의 종료 시간이 시작 시간보다 빨라요.` };
    next.set(d.date, { date: d.date, start_time: d.start_time.slice(0, 5), end_time: d.end_time.slice(0, 5) });
  }

  const supabase = await createClient();
  const { data: existing, error: loadErr } = await supabase
    .from("session_dates")
    .select("id, date, start_time, end_time, seq")
    .eq("section_id", sectionId);
  if (loadErr) return { ok: false, error: "기존 편성을 불러오지 못했어요." };

  const ids = (existing ?? []).map((r) => r.id);
  const withReplay = new Set<number>();
  if (ids.length) {
    const { data: reps } = await supabase.from("replays").select("session_date_id").in("session_date_id", ids);
    for (const r of reps ?? []) withReplay.add(r.session_date_id);
  }

  const existingByDate = new Map((existing ?? []).map((r) => [r.date, r]));
  const toDelete = (existing ?? []).filter((r) => !next.has(r.date));
  const blocked = toDelete.filter((r) => withReplay.has(r.id)).map((r) => r.date);
  if (blocked.length) {
    return {
      ok: false,
      blocked,
      error: `다시보기가 등록된 회차는 뺄 수 없어요: ${blocked.join(", ")}. 먼저 다시보기를 삭제하거나 관리자와 상의해 주세요.`,
    };
  }

  const toInsert = [...next.values()].filter((d) => !existingByDate.has(d.date));
  const toUpdate = [...next.values()].filter((d) => {
    const e = existingByDate.get(d.date);
    return e && (e.start_time.slice(0, 5) !== d.start_time || e.end_time.slice(0, 5) !== d.end_time);
  });

  // 1) 삭제
  if (toDelete.length) {
    const { error } = await supabase.from("session_dates").delete().in("id", toDelete.map((r) => r.id));
    if (error) return { ok: false, error: rlsMessage(error.code, "회차를 삭제하지 못했어요.") };
  }
  // 2) 시간 변경
  for (const d of toUpdate) {
    const e = existingByDate.get(d.date)!;
    const { error } = await supabase.from("session_dates").update({ start_time: d.start_time, end_time: d.end_time }).eq("id", e.id);
    if (error) return { ok: false, error: rlsMessage(error.code, "회차 시간을 수정하지 못했어요.") };
  }
  // 3) 추가 (임시 seq 로 넣고 뒤에서 재번호)
  if (toInsert.length) {
    const { error } = await supabase.from("session_dates").insert(
      toInsert.map((d, i) => ({ section_id: sectionId, seq: 2000 + i, date: d.date, start_time: d.start_time, end_time: d.end_time })),
    );
    if (error) return { ok: false, error: rlsMessage(error.code, "회차를 추가하지 못했어요.") };
  }

  // 4) seq 재번호 (두 단계: 먼저 +1000 으로 비켜 두고, 날짜순으로 1..n)
  const { data: all, error: allErr } = await supabase.from("session_dates").select("id, seq").eq("section_id", sectionId).order("date");
  if (allErr || !all) return { ok: false, error: "회차 번호를 다시 매기지 못했어요." };
  for (const r of all) {
    if (r.seq < 1000) {
      const { error } = await supabase.from("session_dates").update({ seq: r.seq + 1000 }).eq("id", r.id);
      if (error) return { ok: false, error: rlsMessage(error.code, "회차 번호를 다시 매기지 못했어요.") };
    }
  }
  for (let i = 0; i < all.length; i++) {
    const { error } = await supabase.from("session_dates").update({ seq: i + 1 }).eq("id", all[i].id);
    if (error) return { ok: false, error: rlsMessage(error.code, "회차 번호를 다시 매기지 못했어요.") };
  }

  revalidatePath(`/admin/sections/${sectionId}`);
  revalidatePath("/admin/sections");
  revalidatePath("/admin/replays");
  revalidatePath("/my/class");
  return { ok: true, inserted: toInsert.length, deleted: toDelete.length, updated: toUpdate.length };
}
