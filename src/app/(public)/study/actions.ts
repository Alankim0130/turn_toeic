"use server";

import { createClient } from "@/lib/supabase/server";

export type FormState = { ok?: boolean; error?: string; values?: Record<string, string> };

export async function submitStudyApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = (k: string) => String(formData.get(k) ?? "").trim();
  const values = {
    name: v("name"),
    phone: v("phone").replace(/[^\d]/g, ""),
    target_score: v("target_score"),
    preferred_time: v("preferred_time"),
    message: v("message"),
  };

  if (values.name.length < 2) return { error: "이름을 입력해 주세요.", values };
  if (!/^01\d{8,9}$/.test(values.phone)) return { error: "휴대폰 번호를 확인해 주세요.", values };
  if (formData.get("agree") !== "on") return { error: "개인정보 수집·이용에 동의해 주세요.", values };
  const target = values.target_score ? Number(values.target_score) : null;
  if (target !== null && (Number.isNaN(target) || target < 10 || target > 990)) return { error: "목표 점수는 10~990 사이로 입력해 주세요.", values };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("study_applications").insert({
    user_id: user?.id ?? null,
    name: values.name,
    phone: values.phone,
    target_score: target,
    preferred_time: values.preferred_time || null,
    message: values.message || null,
    status: "pending",
  });

  if (error) return { error: "접수 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", values };
  return { ok: true };
}
