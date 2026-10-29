import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { orderPhase } from "@/lib/enrollment-window";
import type { Database } from "@/lib/supabase/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type UserRole = Database["public"]["Enums"]["user_role"];

/** 강사·관리자. 관리자 화면 전체 */
export const isStaff = (role?: UserRole | null) => role === "instructor" || role === "admin";
/**
 * 관리자 권한. **강사도 포함한다** (2026-09-16 Alan: "강사 권한은 관리자랑 똑같이").
 * DB 의 private.is_admin() 과 같은 집합이어야 한다.
 */
export const isAdmin = (role?: UserRole | null) => isStaff(role);
/**
 * 조교. 학생 모드는 반 배정으로(학생과 같다), 관리자 모드는 메뉴의 crew 화면만 —
 * 출석 · 등업 로그 · 교재주문 · 불라방 링크 · 스터디 신청자 · 숙제점검 (2026-10-03 Alan)
 */
export const isAssistant = (role?: UserRole | null) => role === "assistant";
/** 스태프 + 조교. 조교에게 열어 준 곳에만 쓴다 (DB 의 private.is_crew()) */
export const isCrew = (role?: UserRole | null) => isStaff(role) || isAssistant(role);
/** student 이상 = student · 조교 · instructor · admin (alumni 는 아님) */
export const isStudentPlus = (role?: UserRole | null) => role === "student" || isCrew(role);

/** 학생 등급 — 관리자 화면을 하나도 쓰지 못하는 등급들 (DB 의 private.is_student_grade()) */
export const STUDENT_GRADES = ["guest", "member", "student", "alumni"] as const satisfies readonly UserRole[];
export const isStudentGrade = (role?: UserRole | null) =>
  (STUDENT_GRADES as readonly (UserRole | null | undefined)[]).includes(role);

/**
 * 등급을 바꿀 수 있나 — **한곳 판정**. **강사·관리자만** 바꾼다.
 *
 * 2026-09-19 ~ 10-02 에는 조교도 학생 등급끼리(회원 · 수강생 · 졸업생) 바꿨는데, 2026-10-03 Alan 이 조교에게서
 * 학생명단 · 반 배정을 뺐다 ("학생명단 (개인정보가 있기때문에)" · "반배정 (강사가 직접 배정를 해준다)") — 등급은 학생 관리 화면에서
 * 바꾸므로 함께 빠졌다. 조교의 등업 수락으로 수강생이 되는 것은 서버(서비스 롤)가 하므로 이 판정과 상관없다.
 *
 * DB 정책 "profiles: 본인·스태프 수정" 과 같은 집합이어야 한다 — 한쪽만 고치면
 * 화면은 열리는데 RLS 가 막거나, 그 반대가 된다 (마이그레이션 20261003100000).
 */
export function canAssignRole(actor: UserRole | null | undefined) {
  return isAdmin(actor);
}

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

/**
 * 로그인한 사람 — **접속 토큰(JWT)의 서명을 확인해** 꺼낸 값 (2026-10-09 Alan "화면 전환이 좀 느린데").
 *
 * 예전에는 `auth.getUser()` 로 화면을 열 때마다 Supabase 로그인 서버에 한 번 더 물었다 (proxy 에서 한 번 + 화면에서 한 번).
 * `getClaims()` 는 Supabase 가 **비대칭 키**(JWT Signing Keys)로 서명했으면 공개 키(10분 캐시)로 **여기서** 확인해 서버를 다녀오지 않고,
 * 옛 공유 비밀(HS256)이면 예전처럼 로그인 서버에 묻는다 — 어느 쪽이든 위조한 토큰은 통과하지 못하고,
 * 데이터베이스(RLS)도 같은 토큰을 같은 서명으로 믿는다. 요청 하나에 한 번만 확인한다 (cache).
 *
 * **토큰에 없는 값은 없다** — 마지막 로그인 시각은 `getLastSignInAt()` 이 따로 묻는다 (계정 합치기 화면만).
 *
 * **서버 액션(쓰기) 요청이면 `auth.getUser()` 로 로그인 서버에 묻는다** (2026-10-29 점검 — `isActionRequest`). 관리자 서버 액션 대부분이
 * 맨 위 `requireStaff()` · `requireCrew()` 만으로 권한을 보고 그 뒤 서비스 롤로 쓰는데, 그 둘이 이 함수를 거쳐 토큰 서명(`getClaims`)만 봤다 —
 * 로그아웃한 기기에 남은 접속 토큰으로도 만료(1시간 안)까지 서비스 롤 쓰기가 됐다 ("쓰기는 로그인 서버에 묻는다" 는 문서와 달랐다).
 * 로그인 서버는 로그아웃으로 지운 세션을 거절한다. 화면 이동(GET)은 그대로 `getClaims` 다 — 서버 액션 뒤 같은 요청에서 그리는 화면만 한 번 더 묻는다.
 */
export type SessionUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
};

/**
 * 이 요청이 서버 액션인가 — Next 가 서버 액션을 부를 때 붙이는 `Next-Action` 머리, 또는 자바스크립트 없이 낸 폼(본문 형식)으로 가른다
 * (Next 의 `getServerActionRequestMetadata` 와 같은 표시). 화면 · 파일 주소(GET)에는 둘 다 없다. 머리를 못 읽는 자리면 화면으로 본다.
 */
export async function isActionRequest(): Promise<boolean> {
  try {
    const h = await headers();
    if (h.get("next-action")) return true;
    const type = h.get("content-type") ?? "";
    return type.startsWith("multipart/form-data") || type.startsWith("application/x-www-form-urlencoded");
  } catch {
    return false;
  }
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  if (await isActionRequest()) {
    // 쓰기 — 로그인 서버에 묻는다 (위 머리말)
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    return u ? { id: u.id, email: u.email ?? null, user_metadata: u.user_metadata ?? {}, app_metadata: u.app_metadata ?? {} } : null;
  }
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
    email: claims.email || null,
    user_metadata: claims.user_metadata ?? {},
    app_metadata: claims.app_metadata ?? {},
  };
});

/**
 * 로그인한 사람 + 프로필. 요청당 1회만 조회되도록 캐시.
 * `profileError` — 프로필을 **읽지 못했다**(잠깐의 DB 오류). 행이 없는 것(`profile` null · 오류 없음)과 다르다 (2026-10-29 점검 — 아래 requireUser).
 */
export const getSessionProfile = cache(async () => {
  const user = await getSessionUser();
  if (!user) return { user: null, profile: null as Profile | null, profileError: false };

  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { user, profile, profileError: !!error };
});

/** 프로필을 읽지 못했을 때 화면이 던지는 오류 — 오류 화면(다시 시도)이 뜬다. 가입 정보 입력 화면으로 보내지 않는다 */
export const PROFILE_UNREADABLE = "profile_unreadable";

/**
 * 이 계정의 마지막 접속 — 계정 합치기 화면(내 계정 · 등업신청)에서 "어느 계정을 최근에 썼나" 를 보여 줄 때만 쓴다 (2026-10-02 Alan).
 * **마지막 로그인이 아니라 마지막으로 사이트를 쓴 때다** (2026-10-12 Alan "매일 들어오는데 접속시기가 4일전") — 로그인 서버의 `last_sign_in_at` 은
 * 새로 로그인할 때만 바뀌어, 앱에 로그인이 남아 있는 사람은 매일 들어와도 그대로다. DB `public.my_last_active_at()`(세션 · 토큰 갱신까지 본다 —
 * 학생명단의 `student_auth_info` 와 같은 값)를 묻고, 그 함수가 아직 없으면(배포 사이) 예전처럼 로그인 서버에 묻는다.
 */
export const getLastSignInAt = cache(async () => {
  const supabase = await createClient();
  const { data: active, error } = await supabase.rpc("my_last_active_at");
  if (!error) return active ?? null;
  const { data } = await supabase.auth.getUser();
  return data.user?.last_sign_in_at ?? null;
});

/**
 * 가입 정보가 아직 없는 계정 — 구글 로그인으로 처음 들어온 사람 (2026-09-17 Alan 요청).
 * 가입 트리거(private.handle_new_user)가 외부 로그인에는 이름을 비워 두므로, 실명·휴대폰이 없으면
 * /signup/complete 에서 채운다. 실명은 수강증 대조 키(G3)라 이 값 없이는 등업이 안 된다.
 * 프로필 행이 아예 없어도 같은 화면으로 보낸다 (public.complete_profile 이 행을 만든다).
 */
export const COMPLETE_PROFILE_PATH = "/signup/complete";
export const isProfileIncomplete = (profile?: Pick<Profile, "name" | "phone"> | null) =>
  !profile || profile.name.trim() === "" || !profile.phone;

/** 통합되어 비워진 계정. 기록은 남은 계정에 있고 이 계정으로는 더 쓸 수 없다 (2026-09-18 Alan) */
export const MERGED_PATH = "/account-merged";

export async function requireUser(next?: string) {
  const s = await getSessionProfile();
  if (!s.user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  // 프로필을 못 읽었으면(잠깐의 DB 오류) 오류 화면으로 — 예전에는 행이 없는 것과 같이 보아 가입을 마친 사람도 '가입 정보 입력' 으로 보냈다 (2026-10-29 점검)
  if (s.profileError) throw new Error(PROFILE_UNREADABLE);
  // 계정을 합치면 옛 계정은 로그인만 막는다 (기록은 지우지 않는다)
  if (s.profile?.merged_into) redirect(MERGED_PATH);
  // 구글로 들어와 실명·휴대폰이 없으면 먼저 채우게 한다 (가입 정보 입력 화면 자체는 requireUser 를 쓰지 않는다)
  if (isProfileIncomplete(s.profile)) redirect(`${COMPLETE_PROFILE_PATH}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return s as { user: NonNullable<typeof s.user>; profile: Profile | null };
}

export async function requireStaff() {
  const s = await requireUser("/admin");
  if (!isStaff(s.profile?.role)) redirect("/my?denied=admin");
  return s as { user: NonNullable<typeof s.user>; profile: Profile };
}

/**
 * 조교에게도 열린 관리자 화면 전용 — 메뉴의 crew 항목(`NAV_ADMIN_SECTIONS` 의 `crew: true` — 출석 · 등업 로그 · 교재주문 · 알림 설정 …)과
 * 그 화면이 부르는 서버 액션. 나머지 관리자 화면은 그대로 requireStaff() 를 쓴다 — 조교가 주소로 들어와도 막힌다.
 * 진짜 등급으로 본다 (테스트 등급 중에도 관리자 화면에는 들어올 수 있어야 끌 수 있다).
 */
export async function requireCrew() {
  const s = await requireUser("/admin");
  if (!isCrew(s.profile?.role)) redirect("/my?denied=admin");
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
 * **개강일부터 종강일까지** 쓸 수 있다 — 그래서 역할(role)만 보지 않고 등록의 날짜까지 함께 본다.
 * RLS(`private.has_term_access` 등)는 `today between 개강일 and 종강일` 을 그때그때 확인한다 (20260922113000).
 * 등록 상태·등급은 DB 트리거가 날짜로 바로 맞추고 매일 00:00 KST 배치가 날짜가 넘어갈 때 맞추지만,
 * 여기서도 상태 대신 **날짜를 직접** 보아 화면과 RLS 가 같은 기준을 쓰게 한다.
 */
export const getStudentAccess = cache(async (): Promise<StudentAccess> => {
  const user = await getSessionUser();
  if (!user) return { signedIn: false, role: null, active: false, enrollee: false, opensOn: null, until: null };

  // 등록 조회는 프로필을 기다리지 않는다 — 둘 다 내 id 만 있으면 된다 (2026-10-09 화면 전환 속도 — 예전에는 프로필 다음에 차례로 물었다)
  const supabase = await createClient();
  const today = todayKST();
  const [{ profile }, { data }] = await Promise.all([
    getSessionProfile(),
    supabase.from("enrollment_orders").select("status, activates_on, access_until").eq("user_id", user.id).gte("access_until", today),
  ]);

  // 테스트 등급을 켠 스태프는 그 등급의 학생처럼 판정한다 (RLS 도 같은 등급으로 본다)
  /**
   * **스태프·조교도 배정으로 판정한다** (2026-10-02 Alan "수강생전용 페이지를 전부다 개강일에 맞춰서 오픈"). 2026-09-16~10-02 에는
   * 크루면 무조건 열어 줬는데, 10월 반에 배정된 관리자가 개강 전 학생 모드에서 모든 것이 열려 "학생이 뭘 보는지" 를 알 수 없었다.
   * 열어 볼 권한(RLS)은 그대로다 — 학생 모드 **화면**만 학생과 같다. 반에 배정하면(테스터) 그 학생과 똑같이 열린다.
   */

  let live = data ?? [];
  let grade = effectiveRole(profile);
  /**
   * **자정 배치의 안전장치** (2026-10-13 Alan "매달 반복할때 오류가 안나오도록"). 저장된 등록 상태 · 등급은 pg_cron 이 매일 00:00 KST 에 날짜로 다시 맞추는데,
   * RLS(`has_term_access` 등)는 그 저장된 값(`o.status = 'active'` · 등급 student)을 함께 보므로 **개강일에 배치가 못 돌면 예비등록생은 그날 잠긴 채로 남는다**
   * (재생 DB 로 확인 — 종강 다음 날 닫히는 것은 날짜만으로 되지만 개강일에 열리는 것은 배치가 있어야 했다). 그래서 저장된 상태가 날짜와 어긋난 등록이 보이면
   * `public.refresh_my_enrollment_status()` 로 **내 것만** 그 자리에서 배치와 같은 두 걸음(상태 다시 계산 · 등급 다시 정함)을 밟고 다시 읽는다 — 평소(배치가 돈 뒤)에는 부르지 않는다.
   */
  if (live.some((o) => o.status !== orderPhase(o, today))) {
    const { error } = await supabase.rpc("refresh_my_enrollment_status");
    if (!error) {
      const [{ data: p }, { data: again }] = await Promise.all([
        supabase.from("profiles").select("role, test_role").eq("id", user.id).maybeSingle(),
        supabase.from("enrollment_orders").select("status, activates_on, access_until").eq("user_id", user.id).gte("access_until", today),
      ]);
      if (p) grade = effectiveRole(p);
      if (again) live = again;
    }
  }
  const role = grade;
  // 지금 수강 중 = 개강일 ≤ 오늘 ≤ 종강일 · 예비등록 = 오늘 < 개강일
  const current = live.filter((o) => o.activates_on <= today);
  const upcoming = live.filter((o) => today < o.activates_on);
  // RLS(private.has_term_access) 와 같은 조건: role 이 student(또는 크루)이고 지금 기간 안의 등록이 있을 것
  const active = (role === "student" || isCrew(role)) && current.length > 0;
  const opensOn = upcoming.map((o) => o.activates_on).sort()[0] ?? null;
  // 종강일은 지금 수강 중인 등록의 것 — 다음 달 예비등록의 종강일을 앞당겨 보여 주지 않는다
  const until = (current.length ? current : upcoming).map((o) => o.access_until).sort().at(-1) ?? null;

  return { signedIn: true, role, active, enrollee: active || opensOn !== null, opensOn, until };
});

export const ROLE_LABEL: Record<UserRole, string> = {
  guest: "비회원",
  member: "회원",
  student: "수강생",
  alumni: "졸업생",
  instructor: "강사",
  assistant: "조교",
  admin: "관리자",
};
