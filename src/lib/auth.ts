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

export const ROLE_LABEL: Record<UserRole, string> = {
  guest: "비회원",
  member: "회원",
  student: "수강생",
  alumni: "졸업생",
  instructor: "강사",
  admin: "관리자",
};
