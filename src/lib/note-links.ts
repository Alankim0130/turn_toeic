import { CLASS_MATERIAL_LINK_URL_MAX } from "./class-materials";
import { isObjStyle, type NoteRun } from "./note-format";

/**
 * 안내 글 속 주소를 누르면 바로 가는 링크로 (2026-10-16 Alan — "특강신청에서 안내글에서 링크가 있다면 클릭했을때 바로가기가 되면 좋겠어").
 *
 * - **글은 그대로다** — 저장된 안내(꺾쇠 태그 글)에 링크 표시를 더하지 않고, 학생 화면에 그릴 때 글자 속 주소를 찾아 `<a>` 로 감싼다.
 *   그래서 강사가 예전에 적어 둔 안내의 주소도 그대로 눌린다. 편집기는 손대지 않았다 (적는 곳에서는 눌리지 않는다).
 * - **`https://` · `http://` 나 `www.` 로 시작하는 주소만** — `naver.me/…` 처럼 앞을 뺀 주소는 `1.5배` · `file.pdf` 같은 글자와 가를 수 없어 링크로 만들지 않는다.
 * - 주소는 **영문 · 숫자 · 주소 기호(RFC 3986)까지**다 — 한글 · 빈칸 · 따옴표 · 꺾쇠에서 끝난다. `https://naver.me/abc에서 신청` 처럼 한글이 바로 붙어도
 *   한글 앞에서 끊긴다 (한글이 든 주소는 브라우저에서 복사하면 `%EA…` 로 바뀌어 온다). 끝에 붙은 `. , : ; ! ? ' * ~` 와 짝 없는 `)` · `]` 는 뗀다 — `(https://a.com)` · `…a.com.`
 * - 낱말 가운데의 `www.`(`abcwww.` · 메일 주소 `a@www.…`)는 주소가 아니다.
 * - `new URL` 로 다시 읽어 http(s) · 점이 든 사이트 이름 · 아이디/비밀번호 없음 · 2,000자 이하(수업자료실 링크와 같은 상한)만 — 화면 href 에는 그 결과(`u.href`)만 세운다.
 * - 쓰는 곳: 학생 특강 신청 카드의 강사님 안내(`MaterialNote linkify`). 수업자료실 안내 · 공지 · 비대면 자료 안내는 켜지 않았다 — 같은 편집기라 켜려면 `linkify` 하나다.
 */

/** 주소에 쓰는 글자 — RFC 3986 의 글자와 `%`. 이 밖의 글자(한글 · 빈칸 · `"<>{}|\^` 등)에서 주소가 끝난다 */
const URL_RE = /(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
/** 바로 앞이 이 글자면 낱말 가운데다 (`abchttps://` · `xwww.` · 메일 주소 · 다른 주소 안) */
const WORD_BEFORE = /[A-Za-z0-9@._\-/]/;
/** 주소 끝에 붙어 온 문장부호 — 주소가 아니라 글의 일부다 */
const TRAILING = /[.,:;!?'*~]$/;
/** 사이트 이름 — 점으로 이은 이름 + 영문 최상위 이름(또는 `xn--` 꼴) · 숫자 IP */
const HOST = /^(?:[a-z0-9-]+\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const count = (s: string, ch: string) => s.split(ch).length - 1;

/** 주소 끝의 문장부호 · 짝 없는 닫는 괄호를 뗀다 — `(https://a.com/x_(y))` 처럼 짝이 맞는 괄호는 주소에 남는다 */
function trimTail(s: string): string {
  for (;;) {
    if (TRAILING.test(s)) s = s.slice(0, -1);
    else if (s.endsWith(")") && count(s, "(") < count(s, ")")) s = s.slice(0, -1);
    else if (s.endsWith("]") && count(s, "[") < count(s, "]")) s = s.slice(0, -1);
    else return s;
  }
}

/** 찾은 글자를 링크 주소로 — 안 되면 null. `www.` 는 `https://` 를 붙인다 */
export function noteLinkHref(text: string): string | null {
  const raw = /^www\./i.test(text) ? `https://${text}` : text;
  if (raw.length > CLASS_MATERIAL_LINK_URL_MAX) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (!HOST.test(u.hostname) && !IPV4.test(u.hostname)) return null;
  return u.href.length <= CLASS_MATERIAL_LINK_URL_MAX ? u.href : null;
}

/** 글 속 주소 자리 — `start` · `end` 는 글의 위치(UTF-16), `href` 는 링크로 세울 주소 */
export type UrlSpan = { start: number; end: number; href: string };

/** 글에서 링크로 만들 주소들 (앞에서부터) */
export function findUrls(text: string): UrlSpan[] {
  const out: UrlSpan[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index;
    if (start > 0 && WORD_BEFORE.test(text[start - 1])) continue;
    const body = trimTail(m[0]);
    const href = noteLinkHref(body);
    if (href) out.push({ start, end: start + body.length, href });
  }
  return out;
}

/** 링크 하나 — 주소 가운데만 서식이 달라(빨간 글자) 조각이 여럿으로 갈려도 같은 `id` 로 한 `<a>` 에 묶는다 */
export type NoteLink = { id: number; href: string };
/** 링크 표시가 붙은 조각 — `link` 는 그 조각이 주소의 일부일 때, `linkCells` 는 표 칸 글자 속 주소도 링크로 그릴 때 */
export type LinkedRun = NoteRun & { link?: NoteLink; linkCells?: boolean };

/**
 * 안내 글 조각 → 주소 자리마다 `link` 를 단 조각. 조각을 이어 붙인 글에서 주소를 찾으므로 주소가 서식 조각 여럿에 걸쳐도 한 링크다.
 * 그림 · 표는 한 글자(`OBJ`)라 주소가 거기서 끊기고, 표에는 `linkCells` 를 달아 칸 글자 속 주소도 링크로 그리게 한다.
 * **접힌 안내는 이것을 먼저 한 뒤 앞부분을 자른다** (`MaterialNote`) — 앞부분 끝에서 주소가 잘려도 링크는 온전한 주소로 간다.
 */
export function linkRuns(runs: readonly NoteRun[]): LinkedRun[] {
  const text = runs.map((r) => r.text).join("");
  const spans = findUrls(text).map((s, id) => ({ ...s, link: { id, href: s.href } }));
  const out: LinkedRun[] = [];
  let pos = 0;
  let k = 0;
  for (const r of runs) {
    const start = pos;
    const end = pos + r.text.length;
    pos = end;
    if (isObjStyle(r.style)) {
      out.push(r.style.table ? { ...r, linkCells: true } : { ...r });
      continue;
    }
    let at = start;
    while (at < end) {
      while (k < spans.length && spans[k].end <= at) k++;
      const s = spans[k];
      if (!s || s.start >= end) {
        out.push({ ...r, text: text.slice(at, end) });
        break;
      }
      if (s.start > at) {
        out.push({ ...r, text: text.slice(at, s.start) });
        at = s.start;
      }
      const stop = Math.min(end, s.end);
      out.push({ ...r, text: text.slice(at, stop), link: s.link });
      at = stop;
    }
  }
  return out;
}

/** 글자 한 덩어리(표 칸) → 글자 · 링크 조각 */
export function linkText(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  let at = 0;
  for (const s of findUrls(text)) {
    if (s.start > at) out.push({ text: text.slice(at, s.start) });
    out.push({ text: text.slice(s.start, s.end), href: s.href });
    at = s.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** 안내 글 속 링크 모양 — 브랜드색 글자 + 밑줄. 긴 주소는 아무 데서나 줄을 바꾼다(표 칸 안에서도) */
export const NOTE_LINK_CLASS =
  "font-semibold text-brand-700 underline decoration-brand-300 decoration-1 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-brand-600";
