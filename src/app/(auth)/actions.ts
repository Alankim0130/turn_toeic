"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isAuthWeakPasswordError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { COMPLETE_PROFILE_PATH } from "@/lib/auth";
import { isGoogleLoginEnabled } from "@/lib/auth-providers";
import { site } from "@/lib/site";

export type AuthState = { error?: string; message?: string; values?: Record<string, string> };

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/my";
}

/** 이 요청이 들어온 주소. 로컬·프리뷰·운영이 달라서 구글 로그인 뒤 돌아올 콜백 주소를 요청에서 만든다 */
async function requestOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
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

/**
 * 구글 로그인 (2026-09-17 Alan 요청). 로그인·회원가입 화면의 같은 버튼이 부른다.
 * Supabase 가 PKCE 검증값을 쿠키에 두고 구글로 보내며, 돌아오면 /auth/callback 이 세션으로 바꾼다.
 * 처음 들어온 계정은 실명·휴대폰이 없어 콜백이 /signup/complete 로 보낸다 (requireUser 도 같은 판정).
 */
export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const back = `/login?error=google&next=${encodeURIComponent(next)}`;
  if (!(await isGoogleLoginEnabled())) redirect(back);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await requestOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(back);
  redirect(data.url);
}

const GENDERS = new Set(["male", "female", "other", "undisclosed"]);

/** 가입 폼과 가입 정보 입력 폼이 함께 쓰는 값 (실명·휴대폰·대학·학과·성별·동의) */
function readProfileValues(formData: FormData) {
  const v = (k: string) => String(formData.get(k) ?? "").trim();
  return {
    name: v("name"),
    phone: v("phone").replace(/[^\d]/g, ""),
    university: v("university"),
    department: v("department"),
    gender: v("gender") || "undisclosed",
    agree: formData.get("agree") === "on" ? "on" : "", // 오류로 돌아와도 체크가 풀리지 않게
  };
}

/** 두 폼의 공통 검사. 통과하면 undefined */
function validateProfileValues(values: ReturnType<typeof readProfileValues>) {
  if (values.name.length < 2) return "실명을 정확히 입력해 주세요. 수강증의 이름과 같아야 등업이 됩니다.";
  if (!/^01\d{8,9}$/.test(values.phone)) return "휴대폰 번호를 확인해 주세요. (예: 01012345678)";
  if (!GENDERS.has(values.gender)) return "성별 선택이 올바르지 않습니다.";
  if (values.agree !== "on") return "개인정보 수집·이용에 동의해 주세요.";
  return undefined;
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = { ...readProfileValues(formData), email: String(formData.get("email") ?? "").trim().toLowerCase() };
  const password = String(formData.get("password") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return { error: "이메일 형식을 확인해 주세요.", values };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다.", values };
  const invalid = validateProfileValues(values);
  if (invalid) return { error: invalid, values };

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

/**
 * 가입 정보 입력 (구글로 들어온 회원). 세션으로 public.complete_profile() 을 부른다 —
 * 이름은 비어 있을 때 한 번만 정해지고, 예약된 강사 이름이면 DB 가 가입 트리거와 같이 등급·과목을 준다.
 */
export async function completeProfile(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = readProfileValues(formData);
  const next = safeNext(formData.get("next"));
  const invalid = validateProfileValues(values);
  if (invalid) return { error: invalid, values };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(COMPLETE_PROFILE_PATH)}`);

  const { error } = await supabase.rpc("complete_profile", {
    p_name: values.name,
    p_phone: values.phone,
    p_university: values.university || null,
    p_department: values.department || null,
    p_gender: values.gender,
  });

  if (error?.message.includes("already_completed")) {
    revalidatePath("/", "layout");
    redirect(next);
  }
  if (error) {
    const msg = error.message.includes("invalid_name")
      ? "실명을 정확히 입력해 주세요."
      : error.message.includes("invalid_phone")
        ? "휴대폰 번호를 확인해 주세요. (예: 01012345678)"
        : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
    return { error: msg, values };
  }

  revalidatePath("/", "layout");
  redirect(next === "/my" ? "/my?welcome=1" : next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
