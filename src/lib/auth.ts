import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type UserRole = Database["public"]["Enums"]["user_role"];

export const isStaff = (role?: UserRole | null) => role === "instructor" || role === "admin";
export const isAdmin = (role?: UserRole | null) => role === "admin";
/** student 이상 = student · instructor · admin (alumni 는 아님) */
export const isStudentPlus = (role?: UserRole | null) => role === "student" || isStaff(role);

/** 요청당 1회만 조회되도록 캐시 */
export const getSessionProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null as Profile | null };

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { user, profile };
});

export async function requireUser(next?: string) {
  const s = await getSessionProfile();
  if (!s.user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return s as { user: NonNullable<typeof s.user>; profile: Profile | null };
}

export async function requireStaff() {
  const s = await requireUser("/admin");
  if (!isStaff(s.profile?.role)) redirect("/my?denied=admin");
  return s as { user: NonNullable<typeof s.user>; profile: Profile };
}

/** 수강생전용 기능을 쓸 수 있는지. 클라이언트 컴포넌트에도 그대로 넘길 수 있는 평범한 객체 */
export type StudentAccess = {
  signedIn: boolean;
  role: UserRole | null;
  /** 불라방·다시보기·숙제업로드·교재주문·LC음원듣기: student 이상 (강사·관리자 포함) */
  active: boolean;
  /** 스터디 신청: active 이거나 예비등록생 */
  enrollee: boolean;
  /** 예비등록생이면 가장 가까운 개강일 (YYYY-MM-DD) */
  opensOn: string | null;
};

/**
 * 화면 표시용 접근 판정 (잠금 표시·안내). 실제 데이터 보호는 RLS 가 한다.
 * 역할이 student 가 아닌 로그인 회원만 예비등록 여부를 한 번 더 조회한다.
 */
export const getStudentAccess = cache(async (): Promise<StudentAccess> => {
  const { user, profile } = await getSessionProfile();
  if (!user) return { signedIn: false, role: null, active: false, enrollee: false, opensOn: null };

  const role = profile?.role ?? null;
  const active = isStudentPlus(role);
  let opensOn: string | null = null;
  if (!active) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("enrollment_orders")
      .select("activates_on")
      .eq("user_id", user.id)
      .eq("status", "preliminary")
      .order("activates_on", { ascending: true })
      .limit(1);
    opensOn = data?.[0]?.activates_on ?? null;
  }
  return { signedIn: true, role, active, enrollee: active || opensOn !== null, opensOn };
});

export const ROLE_LABEL: Record<UserRole, string> = {
  guest: "비회원",
  member: "회원",
  student: "수강생",
  alumni: "졸업생",
  instructor: "강사",
  admin: "관리자",
};
