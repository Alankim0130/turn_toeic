"use server";

import { redirect } from "next/navigation";
import { isAuthWeakPasswordError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";

export type AuthState = { error?: string; message?: string; values?: Record<string, string> };

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/my";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요.", values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg =
      error.code === "email_not_confirmed"
        ? "이메일 인증이 아직 완료되지 않았어요. 받은 편지함의 인증 메일을 확인해 주세요."
        : "이메일 또는 비밀번호가 올바르지 않습니다.";
    return { error: msg, values: { email } };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

const GENDERS = new Set(["male", "female", "other", "undisclosed"]);

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const v = (k: string) => String(formData.get(k) ?? "").trim();
  const values = {
    name: v("name"),
    email: v("email").toLowerCase(),
    phone: v("phone").replace(/[^\d]/g, ""),
    university: v("university"),
    department: v("department"),
    gender: v("gender") || "undisclosed",
    agree: formData.get("agree") === "on" ? "on" : "", // 오류로 돌아와도 체크가 풀리지 않게
  };
  const password = String(formData.get("password") ?? "");
  const agree = values.agree === "on";

  if (values.name.length < 2) return { error: "실명을 정확히 입력해 주세요. 수강증의 이름과 같아야 등업이 됩니다.", values };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return { error: "이메일 형식을 확인해 주세요.", values };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다.", values };
  if (!/^01\d{8,9}$/.test(values.phone)) return { error: "휴대폰 번호를 확인해 주세요. (예: 01012345678)", values };
  if (!GENDERS.has(values.gender)) return { error: "성별 선택이 올바르지 않습니다.", values };
  if (!agree) return { error: "개인정보 수집·이용에 동의해 주세요.", values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password,
    options: {
      emailRedirectTo: `${site.url}/auth/callback?next=/my`,
      data: {
        name: values.name,
        phone: values.phone,
        university: values.university || null,
        department: values.department || null,
        gender: values.gender,
      },
    },
  });

  if (error) {
    const msg =
      error.code === "user_already_exists" || /already/i.test(error.message)
        ? "이미 가입된 이메일입니다. 로그인해 주세요."
        : isAuthWeakPasswordError(error) && error.reasons.includes("pwned")
          ? "이 비밀번호는 다른 곳에서 유출된 적이 있어 쓸 수 없어요. 다른 비밀번호를 사용해 주세요."
          : error.code === "weak_password"
            ? "더 안전한 비밀번호를 사용해 주세요."
            : "가입 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
    return { error: msg, values };
  }

  // 이메일 인증이 꺼져 있으면 세션이 바로 생긴다
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/my?welcome=1");
  }

  return {
    message: `${values.email} 로 인증 메일을 보냈어요. 메일의 링크를 누르면 가입이 완료됩니다.`,
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
