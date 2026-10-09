/**
 * 로그인 · 가입 뒤 돌아갈 주소(`?next=`) 거르기 — **우리 사이트 안의 경로만** (2026-09-18 보안 점검 → 2026-10-09 전체 보안 검토에서 한곳으로 모았다).
 *
 * 예전에는 네 곳이 각자 `startsWith("/") && !startsWith("//")` 만 봤다. 그런데 브라우저는 `/\evil.com` 의 역슬래시를 `/` 로 읽어
 * `https://evil.com/` 으로 간다 (WHATWG URL — http(s) 에서 `\` 는 `/` 다). 서버 액션의 `redirect("/\\evil.com")` 은 브라우저가 그대로 풀어
 * **로그인하자마자 남의 사이트로 보내는** 길이었다 (Node 로 확인: `new URL("/\\evil.com", "https://winnertoeic.com").href === "https://evil.com/"`).
 * 그래서 역슬래시 · 공백 · 제어 문자를 막고, 마지막으로 URL 로 풀어 **우리 origin 그대로인지**까지 본다 (다른 꼴이 또 있어도 여기서 걸린다).
 * 통과한 값은 원문 그대로 돌려준다 (물음표 뒤 · # 까지 — 정규화해서 글자를 바꾸지 않는다).
 */
export function safeNextPath(next: unknown, fallback = "/my"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2000) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  // 역슬래시 · 공백 · 제어 문자 — 브라우저마다 다르게 읽는 글자는 아예 받지 않는다
  if (/[\\\s\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = "http://safe-next.invalid";
    const u = new URL(next, base);
    if (u.origin !== base || !u.pathname.startsWith("/")) return fallback;
  } catch {
    return fallback;
  }
  return next;
}
