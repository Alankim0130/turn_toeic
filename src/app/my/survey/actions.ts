"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStudentAccess, isCrew } from "@/lib/auth";
import { todayKST } from "@/lib/utils";
import type { Json } from "@/lib/supabase/database.types";
import { checkSurvey, parseScore, scoreProblem, targetProblem, type SurveyField, type SurveyInput } from "@/lib/student-survey";
import { mySurveyTerm, nextClassSections, nextMonthOf, resolveNextClass } from "./_lib/next-class";

export type SurveyResult = { ok: true } | { ok: false; error: string; field?: SurveyField };

/** 설문을 낸 뒤 다시 그릴 곳 — 마이페이지 전체(문 · 점수 카드) · 숙제(관리 방식 = 알림 스위치) · 강사 · 관리자 화면 */
function revalidateSurvey() {
  revalidatePath("/my", "layout");
  revalidatePath("/admin/students", "layout");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/homework/missing");
}

/**
 * 수강생 설문 내기 (2026-10-28 Alan "등업직후 바로 진행. 다 작성해야지 진행할 수 있도록 해줘. 설문조사는 처음 한번만").
 * 서버가 다시 본다: 로그인 · 강사 · 관리자 · 조교 계정이 아님(미리 보기만) · 등업을 마쳤음(지금 수강 중 · 개강 전 등록) · 설문 한 벌(`checkSurvey` — 화면과 같은 함수) ·
 * 다음 달에 들을 반(그 달 시간표로 다시 푼다 — 화면이 보낸 값을 믿지 않는다). 저장은 DB 함수 하나(설문 + 숙제 미제출 알림 스위치, 한 트랜잭션).
 */
export async function submitStudentSurvey(input: SurveyInput): Promise<SurveyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요. 다시 로그인해 주세요." };

  const { data: profile } = await supabase.from("profiles").select("role, merged_into").eq("id", user.id).maybeSingle();
  if (!profile || profile.merged_into) return { ok: false, error: "이 계정으로는 설문을 낼 수 없어요." };
  if (isCrew(profile.role)) return { ok: false, error: "강사 · 관리자 · 조교 계정은 설문을 미리 보기만 해요." };
  const access = await getStudentAccess();
  if (!access.enrollee) return { ok: false, error: "등업을 마친 뒤에 하는 설문이에요." };

  const check = checkSurvey(input);
  if (!check.ok) return { ok: false, error: check.error, field: check.field };

  const today = todayKST();
  const term = await mySurveyTerm(supabase, user.id, today);
  const next = nextMonthOf(term, today);
  let nextClass: Json | null = null;
  if (check.value.next_plan === "yes") {
    const [sections, { data: courses }] = await Promise.all([
      nextClassSections(supabase, next),
      supabase.from("courses").select("id, name").eq("is_active", true),
    ]);
    const res = resolveNextClass(sections, courses ?? [], next, input.nextClass);
    if (!res.ok) return { ok: false, error: res.error, field: "next" };
    nextClass = res.value;
  }

  const { error } = await supabase.rpc("submit_student_survey", {
    p: { ...check.value, term_id: term?.termId ?? null, next_year: next.y, next_month: next.m, next_class: nextClass },
  });
  if (error) {
    // 다른 기기에서 먼저 냈다 — 이미 끝난 설문이다
    if (error.message.includes("already_done")) {
      revalidateSurvey();
      return { ok: true };
    }
    if (error.message.includes("staff_account")) return { ok: false, error: "강사 · 관리자 · 조교 계정은 설문을 미리 보기만 해요." };
    console.error(`[survey] 설문을 저장하지 못했어요: ${error.message}`);
    return { ok: false, error: "설문을 저장하지 못했어요. 잠시 후 다시 눌러 주세요." };
  }

  revalidateSurvey();
  return { ok: true };
}

export type ScoreResult = { ok: true } | { ok: false; error: string };

/**
 * 지금 점수 · 목표 점수 고치기 — 마이페이지 맨 위 카드 (2026-10-28 Alan "목표점수와 현재점수는 수정이 가능하도록 해줘").
 * 본인 세션으로 내 줄의 now_* 칸만 바꾼다 (칸 단위 grant · 정책 "본인 점수 수정"). 설문 때 점수는 그대로 남는다 — 강사 · 관리자가 함께 본다.
 */
export async function saveMyScores(input: {
  hasScore: boolean;
  total?: number | string | null;
  lc?: number | string | null;
  rc?: number | string | null;
  target?: number | string | null;
}): Promise<ScoreResult> {
  if (typeof input?.hasScore !== "boolean") return { ok: false, error: "잘못된 요청이에요." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요. 다시 로그인해 주세요." };

  const score = input.hasScore
    ? { total: parseScore(input.total), lc: parseScore(input.lc), rc: parseScore(input.rc) }
    : { total: null, lc: null, rc: null };
  if (input.hasScore && score.total == null) return { ok: false, error: "지금 토익 점수(총점)를 적어 주세요." };
  const problem = scoreProblem(score);
  if (problem) return { ok: false, error: problem };
  const target = parseScore(input.target);
  const tp = targetProblem(target);
  if (tp) return { ok: false, error: tp };

  const { data, error } = await supabase
    .from("student_surveys")
    .update({ now_total: score.total, now_lc: score.lc, now_rc: score.rc, now_target: target!, now_updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("user_id");
  if (error) return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!data?.length) return { ok: false, error: "수강생 설문을 먼저 해 주세요." };

  revalidatePath("/my");
  revalidatePath("/admin/students", "layout");
  return { ok: true };
}
