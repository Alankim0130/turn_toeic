/**
 * 휴대폰 번호 표기 — 입력하는 동안 하이픈을 자동으로 넣는다 (2026-09-17 Alan 요청).
 *
 * **저장은 늘 숫자만이다.** 서버 액션(`readProfileValues`)과 `public.complete_profile()` 이
 * 숫자가 아닌 글자를 지우므로, 화면에 하이픈을 보여 줘도 DB 에 들어가는 값은 달라지지 않는다.
 * 그래서 이 파일은 **보여 주는 방법만** 정하고 검사 규칙(`/^01\d{8,9}$/`)은 서버 몫으로 남긴다.
 */

/** 숫자만 남긴다 (길이는 자르지 않는다 — 자르는 것은 `formatPhone` 의 몫) */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** 10자리가 있는 옛 번호 (011 · 016~019). 010 은 언제나 11자리다 */
const OLD_PREFIX = /^01[16789]/;

/**
 * `01012345678` → `010-1234-5678`.
 *
 * 기본은 3-4-4 이고, **옛 번호가 10자리로 끝났을 때만** 3-3-4 로 끊는다 (`011-123-4567`).
 * 010 을 자릿수만 보고 10자리에서 3-3-4 로 옮기면, 다 친 번호에서 한 자를 지우는 순간
 * `010-1234-5678` 이 `010-123-4567` 로 통째로 밀려 고쳐 쓰기가 어지러워진다 — 010 은 10자리가 없으니 옮길 이유도 없다.
 * 검사 규칙이 11자리까지만 받으므로 **12자리째부터는 버린다** (붙여넣기로 나라번호가 딸려 와도 칸이 넘치지 않게).
 */
export function formatPhone(value: string): string {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10 && OLD_PREFIX.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 표기를 다시 그린 뒤 커서가 있어야 할 자리. 앞에 몇 개의 숫자가 있었는지로 센다 (하이픈 개수가 달라지므로) */
export function caretAfterFormat(formatted: string, digitsBefore: number): number {
  if (digitsBefore <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (formatted[i] >= "0" && formatted[i] <= "9") {
      seen += 1;
      if (seen === digitsBefore) return i + 1;
    }
  }
  return formatted.length;
}

/**
 * 한 번의 입력을 표기로 옮기고 커서 자리까지 돌려준다.
 *
 * `deletingBack` 은 백스페이스 여부다. **하이픈만 지운 경우 앞의 숫자를 대신 지운다** —
 * 그러지 않으면 표기가 하이픈을 되살려 놓아 아무리 눌러도 안 지워지는 것처럼 보인다.
 */
export function editPhone(
  raw: string,
  caret: number,
  prev: string,
  deletingBack: boolean,
): { value: string; caret: number } {
  let text = raw;
  let at = Math.max(0, Math.min(caret, raw.length));

  if (deletingBack && at > 0 && digitsOnly(text).length === digitsOnly(prev).length) {
    text = text.slice(0, at - 1) + text.slice(at);
    at -= 1;
  }

  const digitsBefore = digitsOnly(text.slice(0, at)).length;
  const value = formatPhone(text);
  return { value, caret: caretAfterFormat(value, digitsBefore) };
}
