/**
 * YBM 공식 페이지(`https://www.ybmedu.com/seomyon/winnertoeic`)의 수강후기 통계 읽기 (2026-10-01 Alan —
 * "누적 수강후기 이런 것들, YBM 홈페이지에서 실제 데이터를 매일 한 번씩 가지고 와서. 8개 항목의 숫자를 다 가지고 와서 반영").
 *
 * 페이지의 후기 탭(#tab_area06)에 이렇게 찍혀 있다 (2026-10-01 실측 — `src/lib/__fixtures__/ybm-review-stats.html`):
 *
 *   <span class="count" id="classCount">수강후기 7,359건</span>            ← 총 후기 수
 *   <em class="title">실시간 수강후기 (7,359건)</em>                       ← 페이지 위쪽에 같은 수가 한 번 더
 *   <div class="icon_wordfix">
 *     <div class="text w01"><span>커리큘럼이 탄탄해요</span><em class="num">1,041</em></div>   ← 태그 8개 (w01~w08)
 *     …
 *
 * **엄격하게 읽는다** — 총수를 못 찾거나 태그가 8개가 아니면 던진다. 페이지가 바뀐 날 엉뚱한 숫자나 0 을 저장하면
 * 랜딩이 거짓말을 하므로, 크론은 던져진 날 숫자를 그대로 두고 `last_error` 만 적는다 (네이버 예약과 같은 규칙 — "응답을 기본값으로 메우지 않는다").
 * `.text w01` 같은 칸은 후기 카드마다 `<em class="num">` 없이도 반복돼 있어서 **숫자가 붙은 것만** 통계로 본다.
 */

export type YbmTag = { key: string; label: string; count: number };
export type YbmReviewStats = { total: number; tags: YbmTag[] };

/** 페이지의 태그 수 — 늘거나 줄면 YBM 이 화면을 바꾼 것이라 사람이 본다 */
export const YBM_TAG_COUNT = 8;

export class YbmParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YbmParseError";
  }
}

const toInt = (s: string) => Number(s.replace(/,/g, ""));

/** 글자 안의 몇 가지 HTML 엔티티만 되돌린다 (라벨은 한글 한 줄이라 이 정도면 된다) */
const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();

/** 총 후기 수 — `#classCount` 를 먼저, 없으면 위쪽 제목 `실시간 수강후기 (N건)` */
export function parseYbmReviewTotal(html: string): number | null {
  const byId = /id="classCount"[^>]*>\s*수강후기\s*([\d,]+)\s*건/.exec(html);
  if (byId) return toInt(byId[1]);
  const byTitle = /실시간\s*수강후기\s*\(\s*([\d,]+)\s*건\s*\)/.exec(html);
  if (byTitle) return toInt(byTitle[1]);
  return null;
}

/** 태그 8개 — `.icon_wordfix` 안에서 숫자(`<em class="num">`)가 붙은 줄만 */
export function parseYbmReviewTags(html: string): YbmTag[] {
  const start = html.indexOf('class="icon_wordfix"');
  if (start < 0) return [];
  // 블록 끝은 다음 layerwrap 또는 넉넉한 길이 — 통계 블록은 1KB 남짓이다
  const endIdx = html.indexOf('class="layerwrap"', start);
  const block = html.slice(start, endIdx > 0 ? endIdx : start + 6000);
  const re = /class="text\s+(w\d{2})(?:\s[^"]*)?"\s*>\s*<span>([^<]*)<\/span>\s*<em class="num">\s*([\d,]+)\s*<\/em>/g;
  const tags: YbmTag[] = [];
  const seen = new Set<string>();
  for (const m of block.matchAll(re)) {
    const key = m[1];
    if (seen.has(key)) continue;
    seen.add(key);
    const label = decode(m[2]);
    if (!label) continue;
    tags.push({ key, label, count: toInt(m[3]) });
  }
  return tags;
}

/** 둘 다 읽혀야 통계다. 하나라도 비면 던진다 — 크론이 숫자를 덮어쓰지 않도록 */
export function parseYbmReviewStats(html: string): YbmReviewStats {
  const total = parseYbmReviewTotal(html);
  if (total === null) throw new YbmParseError("총 후기 수(#classCount)를 못 찾았어요");
  const tags = parseYbmReviewTags(html);
  if (tags.length !== YBM_TAG_COUNT) throw new YbmParseError(`후기 태그가 ${tags.length}개예요 (${YBM_TAG_COUNT}개여야 해요)`);
  if (tags.some((t) => !Number.isFinite(t.count) || t.count < 0)) throw new YbmParseError("태그 숫자를 못 읽었어요");
  return { total, tags };
}

/**
 * 새 숫자가 지난번보다 **반 넘게 줄었으면** 페이지가 바뀐 것으로 보고 받지 않는다 — 누적 후기는 줄지 않는다.
 * (YBM 이 후기를 지우는 일은 있어도 수천 건이 하루에 사라지지는 않는다)
 */
export function looksLikeRegression(prevTotal: number | null, nextTotal: number): boolean {
  return prevTotal !== null && prevTotal > 0 && nextTotal < prevTotal * 0.5;
}

/** 저장된 jsonb 를 안전하게 태그 목록으로 — 모양이 어긋나면 빈 목록 (랜딩이 깨지지 않게) */
export function tagsFromJson(value: unknown): YbmTag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const { key, label, count } = v as Record<string, unknown>;
    if (typeof key !== "string" || typeof label !== "string" || typeof count !== "number") return [];
    return [{ key, label, count }];
  });
}
