"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { noteHasText, noteTooLong } from "@/lib/class-materials";
import { isLectureCondition } from "@/lib/lecture";
import { isLectureWay, todayKST } from "@/lib/utils";

export type LectureSettingsState = { ok?: boolean; error?: string; message?: string };

function revalidateLectures() {
  revalidatePath("/admin/lectures");
  revalidatePath("/admin/lectures/settings");
  revalidatePath("/admin/sections");
  revalidatePath("/my/lecture");
  revalidatePath("/my/class");
  revalidatePath("/my");
}

/**
 * **신청 받기 · 신청 마감** — 누르는 순간 학생 특강 신청 화면에 서거나 빠진다 (2026-10-16 Alan — "강사가 직접 '신청받기' 버튼을 누르면
 * 바로 오픈되면서 신청을 받을 수 있도록"). 7일 전 자동 열림은 없앴다. 지난 특강은 열지 않고, 받는 방식이 하나도 없으면 열지 않는다
 * (학생 화면에 고를 것이 없는 특강이 선다). 로그인한 세션으로 고친다 (정책 "special_lectures: 스태프 수정").
 */
export async function setLectureOpen(lectureId: number, open: boolean): Promise<LectureSettingsState> {
  await requireStaff();
  if (!Number.isInteger(lectureId)) return { error: "잘못된 요청이에요." };
  const supabase = await createClient();
  const { data: lecture } = await supabase
    .from("special_lectures")
    .select("id, date, ways:special_lecture_ways(way, enabled)")
    .eq("id", lectureId)
    .maybeSingle();
  if (!lecture) return { error: "특강을 찾을 수 없어요. 새로고침해 주세요." };
  if (open) {
    if (lecture.date < todayKST()) return { error: "지난 특강은 신청을 열 수 없어요." };
    if (!(lecture.ways ?? []).some((w) => w.enabled)) return { error: "받는 신청 방식이 없어요. 특강 설정에서 방식을 하나 이상 켜 주세요." };
  }
  const { data, error } = await supabase.from("special_lectures").update({ signup: open }).eq("id", lectureId).select("id");
  if (error) return { error: "바꾸지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!data?.length) return { error: "수정 권한이 없거나 특강을 찾을 수 없어요." };
  revalidateLectures();
  return { ok: true, message: open ? "신청을 열었어요. 학생 특강 신청 화면에 바로 보여요." : "신청을 마감했어요. 학생 화면에서 빠졌어요." };
}

/** 특강 설정의 저장 — 화면이 보낸 값 (폼은 직접 보낸다 — `LectureSettingsForm` 머리말) */
export type LectureSettingsInput = {
  lectureId: number;
  ways: { way: string; enabled: boolean; capacity: string; condition: string }[];
  notice: string;
};

/**
 * **특강 설정** — 신청 방식마다 받기 · 신청 조건 · 정원, 그리고 안내 (2026-10-16 Alan — "특강설정은 특강신청에서 다 할 수 있도록 …
 * 특강설정 버튼을 특강신청에 하나 넣어놓고 해당 버튼을 누르면 종류별로 설정할 수 있도록").
 * 무슨 특강 · 날짜 · 강사 · 메모는 반 편성 달력에서 정한다. 신청 받기는 따로 누르는 버튼이다 (`setLectureOpen`).
 * - 방식 줄은 DB 트리거가 만든다 — 여기서는 받기 · 조건 · 정원만 고친다 (칸 단위 grant).
 * - 정원은 비우면 제한 없음, 이미 신청한 수보다 적게 줄일 수 없다 (DB check 도 같다).
 * - 신청 받는 중인 특강에서 방식을 모두 끄면 학생 화면에 고를 것이 없어진다 — 막는다 (먼저 신청을 마감한다).
 * - 안내는 수업자료실 안내와 같은 꺾쇠 태그 글이고 상한도 같다(5만 자 — `noteTooLong`). 보이는 글자가 없으면 비운다.
 * - 조건을 바꿔도 **이미 들어온 신청은 다시 묻지 않는다** (트리거는 넣을 때만 본다) — 화면이 그렇게 적는다.
 */
export async function updateLectureSettings(input: LectureSettingsInput): Promise<LectureSettingsState> {
  await requireStaff();
  const id = Number(input?.lectureId);
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };
  const notice = String(input.notice ?? "");
  const tooLong = noteTooLong(notice);
  if (tooLong) return { error: tooLong };

  const supabase = await createClient();
  const { data: lecture } = await supabase
    .from("special_lectures")
    .select("id, signup, ways:special_lecture_ways(way, applied_count)")
    .eq("id", id)
    .maybeSingle();
  if (!lecture) return { error: "특강을 찾을 수 없어요. 새로고침해 주세요." };
  const applied = new Map((lecture.ways ?? []).map((w) => [w.way, w.applied_count]));

  const patches: { way: string; enabled: boolean; capacity: number | null; signup_condition: string }[] = [];
  for (const w of Array.isArray(input.ways) ? input.ways : []) {
    if (!isLectureWay(w?.way) || !applied.has(w.way)) return { error: "신청 방식을 다시 확인해 주세요. 새로고침해 주세요." };
    if (!isLectureCondition(w.condition)) return { error: "신청 조건을 다시 골라 주세요." };
    const raw = String(w.capacity ?? "").trim();
    let capacity: number | null = null;
    if (raw !== "") {
      capacity = Number(raw.replace(/[^\d]/g, ""));
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000) return { error: "정원은 1~1000명 사이로 적거나 비워 두세요." };
      const n = applied.get(w.way) ?? 0;
      if (capacity < n) return { error: `이미 ${n}명이 신청한 방식은 정원을 ${n}명보다 적게 줄일 수 없어요.` };
    }
    patches.push({ way: w.way, enabled: w.enabled === true, capacity, signup_condition: w.condition });
  }
  if (lecture.signup && !patches.some((p) => p.enabled)) {
    return { error: "신청 받는 중인 특강이에요. 방식을 모두 끄려면 먼저 '신청 마감' 을 눌러 주세요." };
  }

  for (const p of patches) {
    const { data, error } = await supabase
      .from("special_lecture_ways")
      .update({ enabled: p.enabled, capacity: p.capacity, signup_condition: p.signup_condition })
      .eq("lecture_id", id)
      .eq("way", p.way)
      .select("way");
    if (error) {
      if (error.code === "23514") return { error: "정원은 1~1000명이어야 하고, 이미 신청한 수보다 적을 수 없어요." };
      return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
    if (!data?.length) return { error: "수정 권한이 없거나 신청 방식을 찾을 수 없어요." };
  }
  const { data, error } = await supabase
    .from("special_lectures")
    .update({ notice: noteHasText(notice) ? notice : null })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: "안내를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };

  revalidateLectures();
  return { ok: true, message: "특강 설정을 저장했어요." };
}

/** 스태프가 학생 대신 신청을 취소한다 (신청 마감 뒤에도 가능) */
export async function cancelLectureSignupByStaff(signupId: number): Promise<{ ok?: boolean; error?: string }> {
  await requireStaff();
  if (!Number.isInteger(signupId)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("lecture_signups").delete().eq("id", signupId).select("id");
  if (error) return { error: "취소하지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!data?.length) return { error: "이미 취소된 신청이에요." };

  revalidateLectures();
  return { ok: true };
}
