"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rematchHeldVerifications } from "@/lib/rematch-held";
import { requireStaff, isAdmin } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { isYmd, labelKo } from "@/components/admin/sections/dates";
import { isLectureKind, sortLectureKinds } from "@/lib/utils";
import { SUBJECT_LABEL } from "@/lib/instructor-subject";

type SectionInsert = Database["public"]["Tables"]["class_sections"]["Insert"];
type SectionUpdate = Database["public"]["Tables"]["class_sections"]["Update"];

export type ActionState = { ok?: boolean; error?: string; message?: string; values?: Record<string, string> };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const toInt = (s: string) => (s === "" ? null : Number(s.replace(/[^\d-]/g, "")));

function rlsMessage(code?: string, fallback = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.") {
  if (code === "42501") return "권한이 없어요. 본인 반만 수정할 수 있습니다.";
  if (code === "23505") return "이미 같은 값이 있어요. (중복)";
  if (code === "23514") return "입력값이 규칙에 맞지 않아요. 날짜·금액을 확인해 주세요.";
  return fallback;
}

/** 달력이 바뀌면 수업일·개강일·종강일을 보여 주는 화면이 모두 따라 바뀐다 */
function revalidateSchedule() {
  revalidatePath("/admin/sections", "layout");
  revalidatePath("/admin/replays");
  revalidatePath("/admin/study-materials");
  revalidatePath("/admin");
  revalidatePath("/my", "layout");
  revalidatePath("/");
}

/* ─── 달력: 저장하기 (항목별로 따로 저장할 수 있다) ─────────────────────── */
/** 저장할 항목 — 개강·종강 / 월수금 / 화목금 / 특강. 넘기지 않으면 전부 저장한다 */
export type TermPart = "dates" | "mwf" | "ttf" | "lectures";
// "use server" 모듈은 async 함수만 내보낼 수 있어 목록은 여기서만 쓴다
const TERM_PARTS: TermPart[] = ["dates", "mwf", "ttf", "lectures"];

export type TermScheduleInput = {
  year: number;
  month: number;
  opens: string | null;
  closes: string | null;
  mwf: string[];
  ttf: string[];
  /** id 가 있으면 그 특강을 수정하고, 없으면 새로 만든다. 신청자가 붙은 특강을 지키려면 id 를 그대로 돌려줘야 한다 */
  lectures: { id: number | null; date: string; lecturerId: number; content: string; kinds: string[] }[];
  /** 저장할 항목. 비우면 전부 */
  parts?: TermPart[];
};
export type TermScheduleResult =
  | { ok: true; mwf: number; ttf: number; lectures: number; sections: number; parts: TermPart[] }
  | { ok: false; error: string };

const RPC_ERROR: Record<string, string> = {
  forbidden: "권한이 없어요. 강사·관리자만 일정을 만들 수 있습니다.",
  invalid_term: "기수(연·월)가 올바르지 않아요.",
  invalid_parts: "저장할 항목이 올바르지 않아요. 새로고침한 뒤 다시 시도해 주세요.",
  dates_required: "개강일과 종강일을 달력에서 찍어 주세요.",
  closes_before_opens: "종강일은 개강일과 같거나 그 뒤여야 해요.",
  class_date_out_of_range: "수업일·특강은 그 달과 앞뒤 한 달 안에서만 고를 수 있어요.",
  class_date_out_of_month: "수업일·특강은 그 달과 앞뒤 한 달 안에서만 고를 수 있어요.",
  invalid_lectures: "특강마다 종류를 하나 이상 고르거나 내용(1~100자)을 적어 주세요.",
  lecture_capacity_below_applied: "이미 신청한 인원보다 정원을 적게 줄일 수 없어요.",
};

/** 수업일·특강을 찍을 수 있는 범위: 그 달 ± 1개월 (강의가 다음 달까지 이어질 수 있다) */
function monthWindow(year: number, month: number) {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    from: iso(new Date(Date.UTC(year, month - 2, 1))),
    to: iso(new Date(Date.UTC(year, month + 1, 0))),
  };
}

/** 'YYYY-MM-DD@YYYY-MM,…' → '10월 1일 (목)은 2026년 9월 기수가 쓰고 있어요.' */
const listOtherTermDates = (csv?: string | null) =>
  (csv ?? "")
    .split(",")
    .map((chunk) => chunk.split("@"))
    .filter(([d, t]) => isYmd(d ?? "") && /^\d{4}-\d{2}$/.test(t ?? ""))
    .map(([d, t]) => `${labelKo(d)}은 ${Number(t.slice(0, 4))}년 ${Number(t.slice(5, 7))}월 기수가 쓰고 있어요.`)
    .join(" ");

const listDates = (csv?: string | null) =>
  (csv ?? "")
    .split(",")
    .filter(isYmd)
    .map((d) => labelKo(d))
    .join(", ");

export async function saveTermSchedule(input: TermScheduleInput): Promise<TermScheduleResult> {
  await requireStaff();

  const year = Number(input?.year);
  const month = Number(input?.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 2020 || year > 2100 || month < 1 || month > 12) {
    return { ok: false, error: RPC_ERROR.invalid_term };
  }

  const asked = Array.isArray(input.parts) ? input.parts : null;
  const parts: TermPart[] = asked ? TERM_PARTS.filter((p) => asked.includes(p)) : [...TERM_PARTS];
  if (parts.length === 0) return { ok: false, error: RPC_ERROR.invalid_parts };

  const opens = input.opens && isYmd(input.opens) ? input.opens : null;
  const closes = input.closes && isYmd(input.closes) ? input.closes : null;
  if (parts.includes("dates")) {
    if (!opens || !closes) return { ok: false, error: RPC_ERROR.dates_required };
    if (closes < opens) return { ok: false, error: RPC_ERROR.closes_before_opens };
  }

  // 수업일·특강은 그 달 ± 1개월까지 (강의가 다음 달까지 이어지는 기수가 있다)
  const range = monthWindow(year, month);
  const inWindow = (d: string) => d >= range.from && d <= range.to;

  const dates = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String))] : []);
  const mwf = parts.includes("mwf") ? dates(input.mwf) : [];
  const ttf = parts.includes("ttf") ? dates(input.ttf) : [];
  if (mwf.length > 62 || ttf.length > 62 || ![...mwf, ...ttf].every(isYmd)) return { ok: false, error: "수업일 형식이 올바르지 않아요." };
  if (![...mwf, ...ttf].every(inWindow)) return { ok: false, error: RPC_ERROR.class_date_out_of_range };

  const rawLectures = parts.includes("lectures") && Array.isArray(input.lectures) ? input.lectures : [];
  if (rawLectures.length > 100) return { ok: false, error: "특강은 한 달에 100개까지 만들 수 있어요." };
  const lectures = rawLectures.map((l) => ({
    id: Number.isInteger(l?.id) && Number(l.id) > 0 ? Number(l.id) : null,
    date: String(l?.date ?? ""),
    lecturer_id: Number(l?.lecturerId),
    content: String(l?.content ?? "").trim(),
    // 정해진 종류(RC특강·LC특강·1차/2차 모의고사)만, 정해진 순서로, 중복 없이
    kinds: sortLectureKinds((Array.isArray(l?.kinds) ? l.kinds : []).map(String).filter(isLectureKind)),
  }));
  const badLecture = lectures.find(
    (l) =>
      !isYmd(l.date) ||
      !inWindow(l.date) ||
      !Number.isInteger(l.lecturer_id) ||
      l.lecturer_id <= 0 ||
      l.content.length > 100 ||
      // 종류를 고르거나 내용을 적거나, 둘 중 하나는 있어야 한다
      (l.kinds.length === 0 && l.content.length === 0),
  );
  if (badLecture) {
    if (isYmd(badLecture.date) && !inWindow(badLecture.date)) return { ok: false, error: RPC_ERROR.class_date_out_of_range };
    return {
      ok: false,
      error: isYmd(badLecture.date)
        ? `${labelKo(badLecture.date)} 특강은 종류를 하나 이상 고르거나 내용(1~100자)을 적어 주세요.`
        : RPC_ERROR.invalid_lectures,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_term_schedule", {
    p_year: year,
    p_month: month,
    p_opens: opens,
    p_closes: closes,
    p_mwf: mwf,
    p_ttf: ttf,
    p_lectures: lectures,
    p_parts: parts,
  });

  if (error) {
    if (error.message === "replay_block") {
      return { ok: false, error: `다시보기가 등록된 회차는 달력에서 뺄 수 없어요: ${listDates(error.details)}. 먼저 다시보기 등록에서 삭제해 주세요.` };
    }
    if (error.message === "track_overlap") {
      return { ok: false, error: `같은 날짜를 월수금과 화목금에 함께 넣을 수 없어요: ${listDates(error.details)}` };
    }
    if (error.message === "lecture_signup_block") {
      return { ok: false, error: `신청자가 있는 특강은 뺄 수 없어요: ${listDates(error.details)}. 먼저 신청자를 정리해 주세요.` };
    }
    if (error.message === "date_in_other_term") {
      return { ok: false, error: `${listOtherTermDates(error.details)} 한 날짜는 한 기수(월)의 수업일로만 쓸 수 있어요. 그 달 달력에서 먼저 빼 주세요.` };
    }
    if (error.code === "23503") return { ok: false, error: "선택한 강사를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요." };
    // 마이그레이션 20260915131500 (p_parts) 이 아직 적용되지 않은 상태
    if (error.code === "PGRST202") {
      return { ok: false, error: "데이터베이스 업데이트가 아직 적용되지 않았어요. 마이그레이션(supabase db push)을 적용한 뒤 다시 시도해 주세요." };
    }
    return { ok: false, error: RPC_ERROR[error.message] ?? rlsMessage(error.code) };
  }

  revalidateSchedule();
  const res = (data ?? {}) as { mwf?: number; ttf?: number; lectures?: number; sections?: number };
  return { ok: true, mwf: res.mwf ?? 0, ttf: res.ttf ?? 0, lectures: res.lectures ?? 0, sections: res.sections ?? 0, parts };
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

/* ─── 반 개설 · 수정 공통 필드 (정원 · 교재 · 상태) ────────────────────────
   수강료는 받지 않는다 (2026-09-18 Alan "수강료 부분은 다 삭제"). 컬럼(tuition · live_tuition)은 남아 있지만 화면 어디서도 채우지 않는다 */
type SectionFields = { capacity: number | null; status: string; book_set: string | null };

function parseSectionFields(formData: FormData, allowedStatus: string[]): { fields?: SectionFields; error?: string; values: Record<string, string> } {
  const values = {
    capacity: str(formData, "capacity"),
    status: str(formData, "status") || "draft",
    book_set: str(formData, "book_set"),
  };
  const capacity = toInt(values.capacity);
  if (capacity !== null && capacity < 1) return { error: "정원은 1명 이상이어야 해요.", values };
  if (!allowedStatus.includes(values.status)) return { error: "상태 값이 올바르지 않아요.", values };

  // LC 교재 세트는 비워 둘 수 있다 (미지정이면 화면이 달 홀짝으로 짐작한다)
  const bookSet = values.book_set === "A" || values.book_set === "B" ? values.book_set : null;
  if (values.book_set && !bookSet) return { error: "교재 세트는 A 또는 B 만 고를 수 있어요.", values };

  return { values, fields: { capacity, status: values.status, book_set: bookSet } };
}

/* ─── 반 개설: 개강일·종강일·수업일은 그 달 달력에서 가져온다 ───────────── */
export async function createSection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireStaff();
  const parsed = parseSectionFields(formData, ["draft", "open"]);
  const values = { ...parsed.values, course_id: str(formData, "course_id"), track: str(formData, "track"), instructor_id: str(formData, "instructor_id") };
  if (parsed.error || !parsed.fields) return { error: parsed.error, values };

  const termId = toInt(str(formData, "term_id"));
  const courseId = toInt(values.course_id);
  const track = values.track;
  if (!termId) return { error: "기수(월)가 선택되지 않았어요.", values };
  if (!courseId) return { error: "강좌를 선택해 주세요.", values };
  if (!["mwf", "ttf", "both"].includes(track)) return { error: "트랙을 선택해 주세요.", values };

  const supabase = await createClient();
  const [{ data: term }, { data: classDates }] = await Promise.all([
    supabase.from("terms").select("year, month, enrollment_opens_at, closes_at").eq("id", termId).maybeSingle(),
    supabase.from("term_class_dates").select("track").eq("term_id", termId),
  ]);
  if (!term) return { error: "기수(월)를 찾을 수 없어요.", values };
  if (!term.enrollment_opens_at || !term.closes_at) {
    return { error: "먼저 위 달력에서 개강일·종강일을 찍고 생성하기를 눌러 주세요.", values };
  }

  // 담당은 DB 트리거가 LC 교재로 저절로 정한다 (마이그레이션 20260918120000). 관리자가 일부러 고른 사람만 넣고,
  // 만든 사람을 기본값으로 넣지 않는다 — 과목을 못 읽는 반에 알런이 남는 길이었다
  const instructorId = isAdmin(profile.role) && values.instructor_id ? values.instructor_id : null;
  const sessionsOf = (t: string) => (classDates ?? []).filter((d) => d.track === t).length || 1;
  const base = {
    ...parsed.fields,
    term_id: termId,
    course_id: courseId,
    instructor_id: instructorId,
    enrollment_opens_at: term.enrollment_opens_at,
    closes_at: term.closes_at,
  };
  let rows: SectionInsert[];
  if (track === "both") {
    const bundle = crypto.randomUUID();
    rows = [
      { ...base, track: "mwf", bundle_id: bundle, target_sessions: sessionsOf("mwf") },
      { ...base, track: "ttf", bundle_id: bundle, target_sessions: sessionsOf("ttf") },
    ];
  } else {
    rows = [{ ...base, track, bundle_id: null, target_sessions: sessionsOf(track) }];
  }

  const { error } = await supabase.from("class_sections").insert(rows);
  if (error) return { error: rlsMessage(error.code, "반을 개설하지 못했어요."), values };
  // 모집 중인 반이 새로 열렸다 — 받아 둔 다음 달 수강증을 다시 맞춘다 (2026-09-22, `rematchHeldVerifications`)
  if (parsed.fields.status === "open") after(() => rematchHeldVerifications(createAdminClient(), { notify: true }));

  revalidatePath("/admin/sections");
  revalidatePath("/admin");
  revalidatePath("/");
  redirect(`/admin/sections?term=${term.year}-${String(term.month).padStart(2, "0")}&created=${rows.length}#sections`);
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
  // '준비 중' 이던 반을 '모집 중' 으로 열었을 수 있다 — 받아 둔 다음 달 수강증을 다시 맞춘다 (기다리는 것이 없으면 조회 한 번으로 끝난다)
  if (patch.status === "open") after(() => rematchHeldVerifications(createAdminClient(), { notify: true }));

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

/* ─── 회차별 불라방 링크 (2026-09-18 Alan: 오전반 라이브가 끝나면 그 주소가 그대로 그 회차 다시보기) ── */
function revalidateLive(sectionId: number) {
  revalidatePath(`/admin/sections/${sectionId}`);
  revalidatePath("/admin/sections");
  revalidatePath("/admin/replays");
  revalidatePath("/my/live");
  revalidatePath("/my/replay");
}

export async function upsertSessionLiveLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const sessionDateId = toInt(str(formData, "session_date_id"));
  const sectionId = toInt(str(formData, "section_id"));
  const url = str(formData, "live_url");
  if (!sessionDateId || !sectionId) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  if (url === "") {
    const { error } = await supabase.from("session_live_links").delete().eq("session_date_id", sessionDateId);
    if (error) return { error: rlsMessage(error.code) };
    revalidateLive(sectionId);
    return { ok: true, message: "회차 불라방 링크를 지웠어요." };
  }
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    return { error: "http(s):// 로 시작하는 주소를 입력해 주세요.", values: { live_url: url } };
  }

  // 링크를 바꾸면 DB 트리거가 이미 만든 다시보기의 주소도 함께 바꾼다 (session_live_links_changed)
  const { data, error } = await supabase
    .from("session_live_links")
    // 손으로 고친 링크는 '수동' 이다 — 자동으로 들어간 링크를 강사가 바로잡으면 출처도 바뀐다 (2026-09-21)
    .upsert({ session_date_id: sessionDateId, live_url: url, source: "manual" }, { onConflict: "session_date_id" })
    .select("session_date_id");
  if (error) return { error: rlsMessage(error.code), values: { live_url: url } };
  if (!data || data.length === 0) return { error: "권한이 없어요. 본인 반만 수정할 수 있습니다.", values: { live_url: url } };

  revalidateLive(sectionId);
  return { ok: true, message: "저장했어요.", values: { live_url: url } };
}

/** 오전반(수업이 끝나면 다시보기로) ↔ 저녁반(라이브만) — class_sections.live_to_replay */
export async function setLiveToReplay(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const sectionId = toInt(str(formData, "section_id"));
  const on = formData.get("live_to_replay") === "on";
  if (!sectionId) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("class_sections").update({ live_to_replay: on }).eq("id", sectionId).select("id");
  if (error) return { error: rlsMessage(error.code) };
  if (!data || data.length === 0) return { error: "권한이 없어요. 본인 반만 수정할 수 있습니다." };

  revalidateLive(sectionId);
  return { ok: true, message: on ? "수업이 끝나면 그 회차 다시보기로 자동 연결해요." : "이 반의 불라방은 라이브만 해요." };
}

/**
 * 강사 일괄 지정 (2026-09-16 Alan 요청 — 반이 한 달에 70개 안팎이라 하나씩 못 바꾼다).
 * 고른 반들의 담당 강사를 한 번에 바꾼다. 강사·관리자만 (isAdmin 은 2026-09-16 부터 강사도 참).
 */
export async function assignInstructor(input: { sectionIds: number[]; instructorId: string }): Promise<{ ok: boolean; error?: string; count?: number }> {
  const { profile } = await requireStaff();
  if (!isAdmin(profile.role)) return { ok: false, error: "강사·관리자만 바꿀 수 있어요." };

  const ids = [...new Set((input.sectionIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const instructorId = String(input.instructorId ?? "");
  if (ids.length === 0) return { ok: false, error: "반을 하나 이상 골라 주세요." };
  if (ids.length > 300) return { ok: false, error: "한 번에 300개까지 바꿀 수 있어요." };
  if (!instructorId) return { ok: false, error: "강사를 골라 주세요." };

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id, name, role").eq("id", instructorId).maybeSingle();
  if (!target || !["instructor", "admin"].includes(target.role)) return { ok: false, error: "강사·관리자 계정만 담당으로 둘 수 있어요." };

  const { data, error } = await supabase.from("class_sections").update({ instructor_id: instructorId }).in("id", ids).select("id");
  if (error) return { ok: false, error: `강사를 바꾸지 못했어요. ${error.message}` };

  revalidatePath("/admin/sections");
  revalidatePath("/admin");
  return { ok: true, count: data?.length ?? 0 };
}

/**
 * 담당 강사 편성표대로 채우기 (2026-09-16 Alan 요청 "자동으로 LC 이혜영, RC 이영수").
 *
 * 2026-09-18 부터 **DB 트리거가 저절로 맞춘다** (Alan "앞으로도 반편성과 달에 따라서 자동으로 매칭") —
 * 반이 생기거나 편성(교재·시간대·강좌·기수)이 바뀌거나 강사가 가입하면 `private.sync_term_instructors` 가 돈다.
 * 이 버튼은 같은 함수를 한 번 더 돌리는 길이다 (화면이 보낸 배정은 믿지 않는다).
 * 규칙: 반의 `book_set`(LC 교재)이 있으면 LC, 없으면 RC → 그 과목의 강사(`profiles.subject`).
 * 묶음 반·스파르타 반은 두 과목을 이어 들어 담당이 한 명이 아니므로 **비운다** — 알런(만든 사람)이
 * 담당으로 남아 있으면 학생에게 틀린 이름이 보인다. 앱의 `planSubjects` 는 화면에 미리 보여 주는 용도다.
 */
export async function autoAssignInstructors(
  input: { termId: number },
): Promise<{ ok: boolean; error?: string; assigned?: number; cleared?: number; unknown?: number; missing?: string[] }> {
  const { profile } = await requireStaff();
  if (!isAdmin(profile.role)) return { ok: false, error: "강사·관리자만 바꿀 수 있어요." };
  const termId = Number(input.termId);
  if (!Number.isInteger(termId) || termId <= 0) return { ok: false, error: "기수(월)가 선택되지 않았어요." };

  // 판정은 DB 한곳 — private.section_instructor_plan / sync_term_instructors (마이그레이션 20260918120000).
  // 반이 생기거나 편성이 바뀌면 트리거가 이미 같은 함수를 돌리므로, 이 버튼은 어긋나 보일 때 다시 맞추는 길이다.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sync_term_instructors", { p_term_id: termId });
  if (error) {
    return { ok: false, error: error.code === "42501" ? "강사·관리자만 바꿀 수 있어요." : `담당을 맞추지 못했어요. ${error.message}` };
  }
  const res = (data ?? {}) as { assigned?: number; cleared?: number; unknown?: number; missing?: string[] };
  const missing = (res.missing ?? []).map((s) => (s === "lc" || s === "rc" ? SUBJECT_LABEL[s] : s));

  revalidatePath("/admin/sections");
  revalidatePath("/admin");
  return { ok: true, assigned: res.assigned ?? 0, cleared: res.cleared ?? 0, unknown: res.unknown ?? 0, missing };
}
