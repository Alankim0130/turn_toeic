"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyStaff } from "@/lib/push";

export type FormState = { ok?: boolean; error?: string; values?: Record<string, string> };

export async function submitContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = (k: string) => String(formData.get(k) ?? "").trim();
  const values = {
    name: v("name"),
    phone: v("phone").replace(/[^\d]/g, ""),
    email: v("email").toLowerCase(),
    message: v("message"),
  };

  // 비회원도 낼 수 있는 유일한 쓰기 경로라 스팸 봇이 노린다 (2026-09-18 보안 점검).
  // ① 사람 눈에 안 보이는 `website` 칸이 채워져 있으면 봇이다 — 성공한 척 답하고 저장하지 않는다 (봇에게 걸렸다고 알려 주지 않는다)
  if (v("website")) return { ok: true };
  // ② 길이 상한. 화면의 maxLength 는 봇이 무시한다 — 서버가 다시 본다
  if (values.name.length > 40 || values.email.length > 120 || values.message.length > 2000) {
    return { error: "내용이 너무 길어요. 문의는 2,000자 안으로 적어 주세요.", values };
  }

  if (values.name.length < 2) return { error: "이름을 입력해 주세요.", values };
  if (!values.phone && !values.email) return { error: "휴대폰 번호와 이메일 중 하나는 꼭 남겨 주세요.", values };
  if (values.phone && !/^01\d{8,9}$/.test(values.phone)) return { error: "휴대폰 번호를 확인해 주세요.", values };
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return { error: "이메일 형식을 확인해 주세요.", values };
  if (values.message.length < 5) return { error: "문의 내용을 조금 더 자세히 적어 주세요.", values };
  if (formData.get("agree") !== "on") return { error: "개인정보 수집·이용에 동의해 주세요.", values };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("contact_messages").insert({
    user_id: user?.id ?? null,
    name: values.name,
    phone: values.phone || null,
    email: values.email || null,
    message: values.message,
    status: "new",
  });

  if (error) return { error: "접수 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", values };

  after(() =>
    notifyStaff("contact", {
      title: "새 문의",
      body: `${values.name}: ${values.message.replace(/\s+/g, " ").slice(0, 60)}`,
      url: "/admin/contacts?status=new",
    }),
  );
  return { ok: true };
}
