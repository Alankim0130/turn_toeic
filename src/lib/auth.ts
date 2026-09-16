import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type UserRole = Database["public"]["Enums"]["user_role"];

export const isStaff = (role?: UserRole | null) => role === "instructor" || role === "admin";
export const isAdmin = (role?: UserRole | null) => role === "admin";
/** student 이상 = student · instructor · admin (alumni 는 아님) */
export const isStudentPlus = (role?: UserRole | null) => role === "student" || isStaff(role);

/**
 * 테스터(2026-09-16 Alan 요청): 강사·관리자 계정은 테스트 등급(profiles.test_role)을 켜서 학생처럼 볼 수 있다.
 * 켜져 있으면 DB 의 private.user_role() 도 그 값을 돌려줘 RLS 가 그 등급으로 판정한다.
 * 학생 화면의 판정은 effectiveRole 을, 관리자 화면에 들어갈 수 있는지(진짜 등급)는 profile.role 을 쓴다.
 */
export const TEST_ROLES = ["member", "student", "alumni"] as const satisfies readonly UserRole[];
export type TestRole = (typeof TEST_ROLES)[number];
export const isTestRole = (v: unknown): v is TestRole => typeof v === "string" && (TEST_ROLES as readonly string[]).includes(v);
export const effectiveRole = (profile?: { role: UserRole; test_role?: UserRole | null } | null): UserRole | null =>
  profile ? (profile.test_role ?? profile.role) : null;

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
  /** 불라방·다시보기·숙제업로드·교재주문·LC음원듣기: 수강 중이고 종강일이 지나지 않았을 때 (강사·관리자 포함) */
  active: boolean;
  /** 스터디 신청: active 이거나 예비등록생 */
  enrollee: boolean;
  /** 예비등록생이면 가장 가까운 개강일 (YYYY-MM-DD) */
  opensOn: string | null;
  /** 수강생전용을 쓸 수 있는 마지막 날 = 종강일 (YYYY-MM-DD). 스태프는 null */
  until: string | null;
};

/**
 * 화면 표시용 접근 판정 (잠금 표시·안내). 실제 데이터 보호는 RLS 가 한다.
 *
 * 종강일까지 쓸 수 있다 — 그래서 역할(role)만 보지 않고 등록의 날짜까지 함께 본다.
 * role 은 하루 1회 배치(private.run_daily_status_transition)로 바뀌지만 RLS 는
 * `today <= closes_at` 을 그때그때 확인하므로, 강사가 종강일을 앞당기면 화면과 RLS 가
 * 어긋난다. 여기서 같은 날짜 조건을 함께 보아 둘을 맞춘다.
 */
export const getStudentAccess = cache(async (): Promise<StudentAccess> => {
  const { user, profile } = await getSessionProfile();
  if (!user) return { signedIn: false, role: null, active: false, enrollee: false, opensOn: null, until: null };

  // 테스트 등급을 켠 스태프는 그 등급의 학생처럼 판정한다 (RLS 도 같은 등급으로 본다)
  const role = effectiveRole(profile);
  if (isStaff(role)) return { signedIn: true, role, active: true, enrollee: true, opensOn: null, until: null };

  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollment_orders")
    .select("status, activates_on, access_until")
    .eq("user_id", user.id)
    .in("status", ["preliminary", "active"]);

  const today = todayKST();
  const live = (data ?? []).filter((o) => o.access_until >= today);
  // RLS(private.has_term_access) 와 같은 조건: role 이 student 이고 수강 중인 등록이 살아 있을 것
  const active = role === "student" && live.some((o) => o.status === "active");
  const opensOn = live
    .filter((o) => o.status === "preliminary")
    .map((o) => o.activates_on)
    .sort()[0] ?? null;
  const until = live.map((o) => o.access_until).sort().at(-1) ?? null;

  return { signedIn: true, role, active, enrollee: active || opensOn !== null, opensOn, until };
});

export const ROLE_LABEL: Record<UserRole, string> = {
  guest: "비회원",
  member: "회원",
  student: "수강생",
  alumni: "졸업생",
  instructor: "강사",
  admin: "관리자",
};
