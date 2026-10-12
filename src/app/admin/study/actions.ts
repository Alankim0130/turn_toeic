"use server";

import { revalidatePath } from "next/cache";
import { requireCrew, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isStudyKind, STUDY_LEVELS, studyErrorMessage } from "@/lib/study";
import { isHm } from "@/components/admin/sections/dates";

export type StudyActionState = { ok?: boolean; error?: string; message?: string; values?: Record<string, string> };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function revalidateStudies() {
  revalidatePath("/admin/sections");
  revalidatePath("/admin/study");
  revalidatePath("/admin/study-materials");
  revalidatePath("/study");
  revalidatePath("/my/study");
}

/* ─── 스터디 열기 (기수 × 유형) ─────────────────────────────────────────── */
export async function createStudy(_prev: StudyActionState, formData: FormData): Promise<StudyActionState> {
  await requireStaff();
  const termId = Number(str(formData, "term_id"));
  const kind = str(formData, "kind");
  if (!Number.isInteger(termId) || !isStudyKind(kind)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { error } = await supabase.from("studies").insert({ term_id: termId, kind, status: "draft" });
  if (error) return { error: error.code === "23505" ? "이 달에는 이미 같은 스터디가 있어요." : studyErrorMessage(error) };

  revalidateStudies();
  return { ok: true, message: "스터디를 만들었어요. 시간대·안내를 채운 뒤 '신청 받기'로 바꿔 주세요." };
}

/* ─── 상태 · 안내 저장 ───────────────────────────────────────────────────── */
export async function updateStudy(_prev: StudyActionState, formData: FormData): Promise<StudyActionState> {
  await requireStaff();
  const id = Number(str(formData, "id"));
  const status = str(formData, "status");
  const notice = str(formData, "notice");
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };
  if (!["draft", "open", "closed"].includes(status)) return { error: "상태를 선택해 주세요." };
  if (notice.length > 1000) return { error: "안내 문구는 1000자 이내로 적어 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("studies").update({ status, notice: notice || null }).eq("id", id).select("id");
  if (error) return { error: studyErrorMessage(error) };
  if (!data?.length) return { error: "스터디를 찾을 수 없어요." };

  revalidateStudies();
  return { ok: true, message: "저장했어요." };
}

/* ─── 스터디 삭제 (신청자·자료가 없을 때만) ─────────────────────────────── */
export async function deleteStudy(_prev: StudyActionState, formData: FormData): Promise<StudyActionState> {
  await requireStaff();
  const id = Number(str(formData, "id"));
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("studies").delete().eq("id", id).select("id");
  if (error) {
    return { error: error.code === "23503" ? "신청자나 올린 자료가 있어서 삭제할 수 없어요. 대신 '신청 마감'으로 바꿔 주세요." : studyErrorMessage(error) };
  }
  if (!data?.length) return { error: "스터디를 찾을 수 없어요." };

  revalidateStudies();
  return { ok: true };
}

/* ─── 시간대 ─────────────────────────────────────────────────────────────── */
/** 시간대 한 줄 — 시작 · 종료 · 정원 · **레벨(1 · 2, 꼭 고른다 — 2026-10-12 Alan "시간대마다 레벨을 고를 수 있도록")** */
function parseSlot(formData: FormData): { fields?: { start_time: string; end_time: string; capacity: number | null; level: number }; error?: string } {
  const start = str(formData, "start_time");
  const end = str(formData, "end_time");
  const capRaw = str(formData, "capacity");
  const level = Number(str(formData, "level"));
  if (!isHm(start) || !isHm(end)) return { error: "시작·종료 시간을 입력해 주세요." };
  if (end.slice(0, 5) <= start.slice(0, 5)) return { error: "종료 시간은 시작 시간보다 늦어야 해요." };
  const capacity = capRaw === "" ? null : Number(capRaw);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)) return { error: "정원은 1~500명 사이로 입력하거나 비워 두세요." };
  if (!STUDY_LEVELS.offline.includes(level)) return { error: "이 시간대의 레벨(1 · 2)을 골라 주세요." };
  return { fields: { start_time: start.slice(0, 5), end_time: end.slice(0, 5), capacity, level } };
}

const slotValues = (formData: FormData) => ({
  start_time: str(formData, "start_time"),
  end_time: str(formData, "end_time"),
  capacity: str(formData, "capacity"),
  level: str(formData, "level"),
});

export async function addSlot(_prev: StudyActionState, formData: FormData): Promise<StudyActionState> {
  await requireStaff();
  const values = slotValues(formData);
  const studyId = Number(str(formData, "study_id"));
  if (!Number.isInteger(studyId)) return { error: "잘못된 요청이에요.", values };
  const parsed = parseSlot(formData);
  if (!parsed.fields) return { error: parsed.error, values };

  const supabase = await createClient();
  const { error } = await supabase.from("study_slots").insert({ study_id: studyId, ...parsed.fields });
  if (error) return { error: error.code === "23505" ? "같은 시작 시간의 시간대가 이미 있어요." : studyErrorMessage(error), values };

  revalidateStudies();
  return { ok: true, message: "시간대를 추가했어요." };
}

export async function updateSlot(_prev: StudyActionState, formData: FormData): Promise<StudyActionState> {
  await requireStaff();
  const values = slotValues(formData);
  const id = Number(str(formData, "id"));
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요.", values };
  const parsed = parseSlot(formData);
  if (!parsed.fields) return { error: parsed.error, values };

  const supabase = await createClient();
  const { data, error } = await supabase.from("study_slots").update(parsed.fields).eq("id", id).select("id");
  if (error) return { error: error.code === "23505" ? "같은 시작 시간의 시간대가 이미 있어요." : studyErrorMessage(error), values };
  if (!data?.length) return { error: "시간대를 찾을 수 없어요.", values };

  revalidateStudies();
  return { ok: true, message: "시간대를 수정했어요." };
}

export async function deleteSlot(id: number): Promise<StudyActionState> {
  await requireStaff();
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("study_slots").delete().eq("id", id).select("id");
  if (error) return { error: error.code === "23503" ? "신청자가 있는 시간대는 지울 수 없어요. 신청자를 먼저 정리해 주세요." : studyErrorMessage(error) };
  if (!data?.length) return { error: "시간대를 찾을 수 없어요." };

  revalidateStudies();
  return { ok: true };
}

/* ─── 스태프가 신청 취소 (학생 요청 대응) ───────────────────────────────── */
export async function cancelSignupByStaff(id: number): Promise<StudyActionState> {
  // 신청자 명단은 조교도 본다 (2026-09-16 Alan) — 취소도 함께 연다
  await requireCrew();
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("study_signups").delete().eq("id", id).select("id");
  if (error) return { error: studyErrorMessage(error, "취소하지 못했어요.") };
  if (!data?.length) return { error: "신청을 찾을 수 없어요." };

  revalidateStudies();
  return { ok: true };
}

/* ─── 레벨 변경 요청 승인 · 거절 (조교도 — 스터디는 조교가 운영한다) ─────────── */
/**
 * 학생이 낸 레벨 변경 요청을 승인하거나 거절한다 (2026-10-12 Alan "조교나 강사승인이 있어야지 변경이 가능하도록").
 * DB 함수 `decide_study_level` 이 is_crew 를 다시 보고, 단어 스터디는 요청한 시간대로 옮긴다 (정원이 찼으면 study_slot_full).
 */
export async function decideStudyLevel(id: number, approve: boolean): Promise<StudyActionState> {
  await requireCrew();
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_study_level", { p_signup_id: id, p_approve: approve });
  if (error) return { error: studyErrorMessage(error, approve ? "승인하지 못했어요." : "거절하지 못했어요.") };

  revalidateStudies();
  return { ok: true, message: approve ? "승인했어요 — 학생의 레벨이 바뀌었어요." : "거절했어요." };
}
