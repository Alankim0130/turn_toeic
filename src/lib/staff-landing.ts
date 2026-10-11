/**
 * 강사 · 관리자의 첫 화면은 관리자 모드 (2026-10-11 Alan — "관리자와 강사가 홈페이지에 들어오면 첫화면은 관리자모드가 보이면 좋겠어").
 *
 * 홈 화면 앱(`manifest.start_url`) · 로그인 뒤 · 헤더의 로그인 표시가 전부 `/my` 로 오므로, **요청 가로채기(`src/lib/supabase/proxy.ts`)가
 * 강사 · 관리자의 `/my` 문서 요청을 `/admin` 으로 돌린다.** 모드를 저장하는 것이 아니다 — "모드는 주소로 정한다"(StaffModeSwitch)는 그대로이고,
 * 들어오는 첫 걸음만 관리자 쪽으로 보낸다.
 *
 * 돌리는 것은 셋이 다 맞을 때뿐이다:
 * 1. **문서 요청**(주소를 직접 열기 · 앱 켜기 · 새로고침)이다 — 화면 안에서 옮기는 요청(RSC fetch)은 아니다. 하단 바의 `홈`(`/my`)을 눌렀는데
 *    관리자 화면이 뜨면 안 된다. **Next 는 `rsc` · `next-router-prefetch` 헤더를 proxy 에 오기 전에 떼어 낸다**(web/adapter 의 FLIGHT_HEADERS — 2026-10-11 실측:
 *    proxy 안에서 그 헤더가 늘 비어 있었다) 그래서 브라우저가 붙이는 `sec-fetch-dest`(문서 = `document`, fetch = `empty`)로 가르고, 그 헤더가 없는 옛 브라우저는
 *    `accept` 에 `text/html` 이 있으면 문서로 본다 (RSC fetch 는 `accept: *​/*`).
 * 2. **꼭 `/my` 다** — `/my/homework` 같은 깊은 주소 · `?welcome=1` · `?denied=admin` 처럼 물음표가 붙은 주소는 그 화면을 보러 온 것이다.
 * 3. **학생 모드를 쓰던 중이 아니다** — 강사 · 관리자가 학생 화면(`/my*`)을 보는 동안 브라우저가 쿠키(`wt-mode=student`, 한 시간)를 두고(`StudentModeKeeper`),
 *    관리자 화면에 들어오면 지운다(`AdminModeMark`, `src/components/layout/ModeMemory.tsx`). 그래서 학생 모드로 바꿔 놓고 당겨서 새로고침하거나 앱을 잠깐 닫았다 켜도
 *    학생 모드 그대로이고, 관리자 화면을 쓰다 켠 다음 날은 관리자 모드다. 테스트 등급(`test_role`)을 켠 스태프도 돌리지 않는다 — 일부러 학생으로 보는 중이다.
 *
 * 조교는 돌리지 않는다 (Alan 이 "관리자와 강사" 라고 했다 — 조교까지 넓히려면 묻고 `staffLandsOnAdmin` 을 넓힌다).
 * 판정은 여기 한곳이고 `staff-landing.test.ts` 가 못박는다.
 */
import { canEnterAdminPath } from "@/lib/site";

export const STUDENT_MODE_COOKIE = "wt-mode";
export const STUDENT_MODE_VALUE = "student";
/** 학생 모드 쿠키의 수명(초) — 학생 화면을 옮겨 다니는 동안 매번 밀려난다 */
export const STUDENT_MODE_MAX_AGE = 60 * 60;

export type NavKind = "document" | "fetch";

/** 이 요청이 문서 요청(주소 열기 · 앱 켜기 · 새로고침)인지 화면 안 fetch(RSC · 미리 받기)인지 — 브라우저 헤더로 가른다 (Next 가 자기 헤더는 떼어 낸다) */
export function navKindOf(headers: { get(name: string): string | null }): NavKind {
  const dest = headers.get("sec-fetch-dest");
  if (dest) return dest === "document" ? "document" : "fetch";
  return (headers.get("accept") ?? "").includes("text/html") ? "document" : "fetch";
}

export type LandingRequest = { method: string; pathname: string; search: string; nav: NavKind; studentCookie: boolean };

/** 이 요청이 "강사 · 관리자면 관리자 모드로 돌릴" 요청인가 — 참일 때만 proxy 가 등급을 조회한다 (학생의 앱 켜기마다 한 번) */
export function wantsStaffLanding(req: LandingRequest): boolean {
  return req.method === "GET" && req.nav === "document" && req.pathname === "/my" && req.search === "" && !req.studentCookie;
}

/**
 * 등급을 보고 정말 돌릴지 — **`/admin` 대시보드에 들어갈 수 있는 등급**(= 강사 · 관리자, 입구 `canEnterAdminPath` 와 같은 집합)이고
 * 테스트 등급을 켜지 않은 사람. 등급 목록을 여기 또 적지 않는다 — `auth.ts` 를 클라이언트 · proxy 가 못 읽어 입구 함수를 그대로 쓴다
 */
export function staffLandsOnAdmin(profile: { role?: string | null; test_role?: string | null } | null | undefined): boolean {
  return !!profile && canEnterAdminPath(profile.role, "/admin") && !profile.test_role;
}

// ─── 브라우저 쪽 — 학생 모드 쿠키 (ModeMemory.tsx 가 부른다) ───
type Doc = { cookie: string };

/** 두기(remember) · 지우기(forget) 의 쿠키 문장 — 서버가 읽으므로 path 는 `/`, 보안 뜻은 없는 값이라 httpOnly 가 아니다 */
export function studentModeCookie(remember: boolean, secure: boolean): string {
  const body = remember ? `${STUDENT_MODE_COOKIE}=${STUDENT_MODE_VALUE}; path=/; max-age=${STUDENT_MODE_MAX_AGE}` : `${STUDENT_MODE_COOKIE}=; path=/; max-age=0`;
  return `${body}; samesite=lax${secure ? "; secure" : ""}`;
}

export const hasStudentModeCookie = (doc: Doc) => doc.cookie.split(";").some((c) => c.trim() === `${STUDENT_MODE_COOKIE}=${STUDENT_MODE_VALUE}`);

/** 강사 · 관리자가 학생 화면을 보는 동안 — 쿠키를 두고(없으면 새로) 한 시간을 다시 센다 */
export function rememberStudentMode(doc: Doc = document, secure = location.protocol === "https:") {
  try {
    doc.cookie = studentModeCookie(true, secure);
  } catch {}
}

/** 관리자 화면에 들어오면 — 학생 모드 기억을 지운다 (쿠키가 있을 때만 쓴다) */
export function forgetStudentMode(doc: Doc = document, secure = location.protocol === "https:") {
  try {
    if (hasStudentModeCookie(doc)) doc.cookie = studentModeCookie(false, secure);
  } catch {}
}
