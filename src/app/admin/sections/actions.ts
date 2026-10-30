"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rematchHeldVerifications } from "@/lib/rematch-held";
import { requireCrew, requireStaff, isAdmin } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { isYmd, labelKo } from "@/components/admin/sections/dates";
import { isLectureKind, sortLectureKinds, todayKST } from "@/lib/utils";
import { restoreLectureIds } from "@/lib/lecture";
import { LECTURE_MATERIAL_BUCKET } from "@/lib/lecture-materials";
import { SUBJECT_LABEL } from "@/lib/instructor-subject";
import { timetableRowOf } from "@/lib/timetable-row";
import type { AutoOpenSummary } from "@/lib/month-open";
import { autoOpenMonth } from "./_lib/open-month";

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
  /** auto = 평달 자동 세팅의 결과 (그 달 반이 없을 때만 — `autoOpenMonth`). 할 일이 없었으면 null */
  | { ok: true; mwf: number; ttf: number; lectures: number; sections: number; parts: TermPart[]; auto: AutoOpenSummary | null }
  | { ok: false; error: string };

const RPC_ERROR: Record<string, string> = {
  forbidden: "권한이 없어요. 강사·관리자만 일정을 만들 수 있습니다.",
  invalid_term: "기수(연·월)가 올바르지 않아요.",
  invalid_parts: "저장할 항목이 올바르지 않아요. 새로고침한 뒤 다시 시도해 주세요.",
  dates_required: "개강일과 종강일을 달력에서 찍어 주세요.",
  closes_before_opens: "종강일은 개강일과 같거나 그 뒤여야 해요.",
  class_date_out_of_range: "수업일·특강은 그 달과 앞뒤 한 달 안에서만 고를 수 있어요.",
  class_date_out_of_month: "수업일·특강은 그 달과 앞뒤 한 달 안에서만 고를 수 있어요.",
  invalid_lectures: "특강마다 종류를 고르거나 내용(1~100자)을 적어 주세요.",
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

/**
 * 달력 저장으로 빠질 특강(그 달 특강 중 이번에 보내지 않는 id)의 특강 자료실 파일 경로 — 저장이 끝난 뒤 저장소에서 지운다.
 * 특강이 지워지면 자료 · 파일 행은 cascade 로 사라지지만 저장소 파일은 남기 때문이다. 못 읽으면 빈 목록(지우지 않는다)
 */
async function lectureMaterialPathsToDrop(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
  month: number,
  toSave: readonly { id: number | null }[],
): Promise<string[]> {
  const { data: term } = await supabase.from("terms").select("id").eq("year", year).eq("month", month).maybeSingle();
  if (!term) return [];
  const { data: existing, error } = await supabase.from("special_lectures").select("id").eq("term_id", term.id);
  if (error || !existing?.length) return [];
  const keep = new Set(toSave.map((l) => l.id).filter((id): id is number => id !== null));
  const dropping = existing.map((l) => l.id).filter((id) => !keep.has(id));
  if (dropping.length === 0) return [];
  const { data: files } = await supabase
    .from("special_lecture_material_files")
    .select("file_path, material:special_lecture_materials!inner(lecture_id)")
    .in("material.lecture_id", dropping);
  return (files ?? []).map((f) => f.file_path);
}

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
    // 무슨 특강(넷 — RC특강 · LC특강 · 1차 · 2차 모의고사)만, 정해진 순서로, 중복 없이 (2026-10-16 — 현장 · 수업영상 · 시험지 · PDF 는 신청 방식이라 특강 설정에서)
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
  // 특강 하나 = 무슨 특강 하나 (2026-10-16) — 달력 팝업이 고른 종류마다 특강을 따로 만든다. DB 도 막는다
  const multi = lectures.find((l) => l.kinds.length > 1);
  if (multi) {
    return { ok: false, error: `${isYmd(multi.date) ? labelKo(multi.date) : "한"} 특강에 종류가 여러 개예요. 특강 하나에는 종류를 하나만 — 종류마다 특강을 따로 더해 주세요.` };
  }
  if (badLecture) {
    if (isYmd(badLecture.date) && !inWindow(badLecture.date)) return { ok: false, error: RPC_ERROR.class_date_out_of_range };
    return {
      ok: false,
      error: isYmd(badLecture.date)
        ? `${labelKo(badLecture.date)} 특강은 종류를 고르거나 내용(1~100자)을 적어 주세요.`
        : RPC_ERROR.invalid_lectures,
    };
  }

  const supabase = await createClient();
  // 같은 특강이 id 없이 오면(달력에서 뺐다가 다시 누름 · 막 만든 특강을 다시 저장) 저장된 그 특강의 id 를 되살린다 — 그대로 보내면 DB 가
  // 원래 특강을 지우고 새로 만들어 신청 받기 · 신청 방식 · 정원 · 신청 조건 · 안내가 처음으로 돌아간다 (2026-10-16 점검, `restoreLectureIds`).
  // 못 읽으면 예전처럼 그대로 보낸다
  let toSave = lectures;
  if (parts.includes("lectures") && lectures.some((l) => l.id === null)) {
    const { data: term } = await supabase.from("terms").select("id").eq("year", year).eq("month", month).maybeSingle();
    const { data: existing } = term
      ? await supabase.from("special_lectures").select("id, date, lecturer_id, content, kinds").eq("term_id", term.id)
      : { data: null };
    if (existing?.length) {
      toSave = restoreLectureIds(
        lectures.map((l) => ({ ...l, lecturerId: l.lecturer_id })),
        existing.map((e) => ({ id: e.id, date: e.date, lecturerId: e.lecturer_id, content: e.content ?? "", kinds: e.kinds })),
      ).map(({ id, date, lecturer_id, content, kinds }) => ({ id, date, lecturer_id, content, kinds }));
    }
  }
  // 달력에서 빠지는 특강의 **특강 자료실 파일**(2026-10-30) — 자료 · 파일 행은 특강과 함께 지워지지만(on delete cascade) 저장소 파일은 남는다.
  // 저장이 성공한 뒤에 지우려고 경로를 먼저 읽어 둔다. 못 읽으면 지우지 않는다 (가리키는 행이 없어 아무에게도 안 보인다)
  const orphanPaths = parts.includes("lectures") ? await lectureMaterialPathsToDrop(supabase, year, month, toSave) : [];

  const { data, error } = await supabase.rpc("save_term_schedule", {
    p_year: year,
    p_month: month,
    p_opens: opens,
    p_closes: closes,
    p_mwf: mwf,
    p_ttf: ttf,
    p_lectures: toSave,
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
    // 신청자가 있는 특강의 무슨 특강(종류)을 바꾸면 학생이 신청한 것이 달라진다 (2026-10-16, private.sync_lecture_ways)
    if (error.message === "lecture_kind_signup_block") {
      return { ok: false, error: `신청자가 있는 특강은 종류를 바꿀 수 없어요: ${listDates(error.details)}. 다른 종류가 필요하면 특강을 새로 더해 주세요.` };
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

  if (orphanPaths.length) await supabase.storage.from(LECTURE_MATERIAL_BUCKET).remove(orphanPaths);
  revalidateSchedule();
  const res = (data ?? {}) as { mwf?: number; ttf?: number; lectures?: number; sections?: number };
  // 평달은 반이 저절로 열린다 (2026-10-22 Alan "방학달 1,2,7,8월만 강사가 직접 반을 열어야하고 나머지는 자동으로") — 그 달 반이 하나도 없을 때만.
  // 시간표가 없으면 시간표 설정과 같은 규칙으로 만들고, 새 반 개설의 강좌마다 '전체 선택' 과 같은 반을 연다. 못 열어도 달력 저장은 그대로 성공이다
  const auto = await autoOpenMonth(supabase, { y: year, m: month }, todayKST());
  return { ok: true, mwf: res.mwf ?? 0, ttf: res.ttf ?? 0, lectures: res.lectures ?? 0, sections: res.sections ?? 0, parts, auto };
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

/* ─── 반 개설 · 수정 공통 필드 (정원 · 과목 · 과정 · 상태) ────────────────────
   수강료는 받지 않는다 (2026-09-18 Alan "수강료 부분은 다 삭제"). 컬럼(tuition · live_tuition)은 남아 있지만 화면 어디서도 채우지 않는다.
   과목(subject)·과정(book_set)은 시간 단위 반의 것이다 (2026-09-23) — 둘 다 비워 둘 수 있고, 비어 있으면 담당 강사·교재를 짐작하지 않는다 */
type SectionFields = { capacity: number | null; status: string; book_set: string | null; subject: string | null };

function parseSectionFields(formData: FormData, allowedStatus: string[]): { fields?: SectionFields; error?: string; values: Record<string, string> } {
  const values = {
    capacity: str(formData, "capacity"),
    status: str(formData, "status") || "draft",
    book_set: str(formData, "book_set"),
    subject: str(formData, "subject"),
  };
  const capacity = toInt(values.capacity);
  if (capacity !== null && capacity < 1) return { error: "정원은 1명 이상이어야 해요.", values };
  if (!allowedStatus.includes(values.status)) return { error: "상태 값이 올바르지 않아요.", values };

  const bookSet = values.book_set === "A" || values.book_set === "B" ? values.book_set : null;
  if (values.book_set && !bookSet) return { error: "과정은 A 또는 B 만 고를 수 있어요.", values };
  const subject = values.subject === "lc" || values.subject === "rc" ? values.subject : null;
  if (values.subject && !subject) return { error: "과목은 LC 또는 RC 만 고를 수 있어요.", values };

  return { values, fields: { capacity, status: values.status, book_set: bookSet, subject } };
}

/**
 * 담당으로 둘 수 있는 계정인가 — 강사·관리자이고 **합쳐진 옛 계정이 아니다** (2026-10-19 — 이혜영 강사의 옛 이메일 계정이
 * 강사 등급 그대로 남아 담당 강사 목록에 한 번 더 섰다). 반 상세 · 하나씩 만들기 · 일괄 지정이 같이 쓴다 — 화면이 보낸 id 를 그대로 믿지 않는다
 */
async function isAssignableInstructor(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("role, merged_into").eq("id", id).maybeSingle();
  return !!data && (data.role === "instructor" || data.role === "admin") && !data.merged_into;
}

const NOT_ASSIGNABLE = "강사·관리자 계정만 담당으로 둘 수 있어요.";

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
  if (instructorId && !(await isAssignableInstructor(supabase, instructorId))) return { error: NOT_ASSIGNABLE, values };
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
  // 만든 반은 개설 반 목록에서 본다 (2026-10-02 — 달력 화면에서 목록을 떼어 냈다)
  redirect(`/admin/sections/classes?term=${term.year}-${String(term.month).padStart(2, "0")}&created=${rows.length}`);
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
  if (isAdmin(profile.role) && values.instructor_id) {
    if (!(await isAssignableInstructor(supabase, values.instructor_id))) return { error: NOT_ASSIGNABLE, values };
    patch.instructor_id = values.instructor_id;
  }
  // 과정·과목은 그 달 시간표가 정한다 (2026-09-29) — 시간표 줄이 있는 반은 여기서 바꾸지 않는다.
  // 화면에도 칸이 없지만, 옛 화면이 보낸 빈 값이 시간표와 어긋나게 덮어쓰지 않도록 서버가 한 번 더 뺀다
  const { data: current } = await supabase
    .from("class_sections")
    .select("time_block, course:courses(target_score, program), term:terms(year, month)")
    .eq("id", id)
    .maybeSingle();
  if (current && (await timetableRowOf(supabase, current))) {
    delete patch.book_set;
    delete patch.subject;
  }

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
  redirect(t ? `/admin/sections/classes?term=${t.year}-${String(t.month).padStart(2, "0")}&deleted=1` : "/admin/sections/classes?deleted=1");
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
  // 대시보드 불라방 위젯 · 불라방 링크 화면 (2026-09-30) 도 같은 저장을 쓴다
  revalidatePath("/admin");
  revalidatePath("/admin/live");
  revalidatePath("/admin/replays");
  revalidatePath("/my/live");
  revalidatePath("/my/replay");
}

export async function upsertSessionLiveLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // 조교도 올린다 (2026-10-03 Alan "불라방 링크 올리기" — /admin/live). DB 정책 "session_live_links: 조교 등록·수정·삭제" 가 같은 집합이다.
  // 이 파일의 나머지 액션(반 편성 · 상시 링크 · 다시보기 스위치 · 담당 강사)은 강사 · 관리자만이다
  await requireCrew();
  const sessionDateId = toInt(str(formData, "session_date_id"));
  const sectionId = toInt(str(formData, "section_id"));
  const url = str(formData, "live_url");
  if (!sessionDateId || !sectionId) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  if (url === "") {
    const { data: gone, error } = await supabase.from("session_live_links").delete().eq("session_date_id", sessionDateId).select("session_date_id");
    if (error) return { error: rlsMessage(error.code) };
    if (!gone?.length) {
      // 지운 줄이 없다 (2026-10-29) — 원래 없었으면 그대로 성공이지만, 아직 있으면 RLS 가 막은 것이다(본인 반이 아님 · 테스트 등급).
      // 예전에는 그때도 "지웠어요" 가 떠서 학생 화면에 링크가 그대로 남은 줄 몰랐다. 남았는지는 서버 권한으로 본다(읽기만 — 세션은 그 줄을 못 볼 수 있다)
      const { data: still } = await createAdminClient().from("session_live_links").select("session_date_id").eq("session_date_id", sessionDateId).maybeSingle();
      if (still) return { error: "권한이 없어요. 본인 반만 수정할 수 있습니다." };
    }
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
  if (!(await isAssignableInstructor(supabase, instructorId))) return { ok: false, error: NOT_ASSIGNABLE };

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
