/**
 * 학생명단이 보여 주는 계정 정보의 표기 (2026-09-18 Alan 요청 —
 * "접속된 이메일, 로그인방식, 최근접속날짜").
 *
 * 값은 DB 에서 온다 (`public.student_auth_info` → auth.users · auth.identities).
 * 여기서는 **글자로 바꾸는 일만** 한다 — 판정·조회를 여기에 넣지 말 것.
 */

/** Supabase provider → 사람이 읽는 이름. 목록은 src/lib/social.ts 의 SOCIAL_PROVIDERS 와 이메일 가입 */
export const LOGIN_LABEL: Record<string, string> = {
  email: "이메일",
  kakao: "카카오",
  google: "구글",
};

/**
 * "카카오" · "이메일 · 구글" — 한 계정에 로그인이 여러 개 붙을 수 있다
 * (같은 이메일이면 Supabase 가 한 계정에 이어 붙인다 — 도메인 규칙 3 "로그인 방법").
 */
export function loginLabel(providers: readonly string[] | null | undefined): string {
  const list = (providers ?? []).filter((p) => typeof p === "string" && p.length > 0);
  if (list.length === 0) return "";
  return list.map((p) => LOGIN_LABEL[p] ?? p).join(" · ");
}

/** 한국 시간 기준 날짜 (YYYY-MM-DD). 접속 시각은 timestamptz 라 KST 로 옮겨서 센다 */
export function kstDay(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/** "2026-09-18" → "2026.9.18" (명단은 칸이 좁아 짧게 적는다) */
export function shortDay(day: string | null | undefined): string {
  const m = (day ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}` : "";
}

/** 두 날짜(YYYY-MM-DD) 사이의 날 수. 달력 날짜끼리 세므로 시간대는 이미 KST 로 맞춰 둔다 */
export function daysBetween(from: string, to: string): number {
  const num = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day) / 86_400_000;
  };
  return num(to) - num(from);
}

/**
 * 마지막 접속 — "오늘 · 어제 · N일 전", 한 달이 넘으면 날짜.
 * `today` 는 `todayKST()`. 한 번도 접속하지 않았으면 빈 문자열이라 화면에서 칸이 사라진다.
 */
export function lastSeenLabel(at: string | null | undefined, today: string): string {
  if (!at) return "";
  const day = kstDay(at);
  if (!day) return "";
  const diff = daysBetween(day, today);
  // 접속 시각이 오늘보다 뒤면(시계가 어긋난 경우) 오늘로 본다
  if (diff <= 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 30) return `${diff}일 전`;
  return shortDay(day);
}
