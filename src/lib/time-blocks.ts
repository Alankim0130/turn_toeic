/**
 * 시간대 라벨("10:00~12:10")의 포함 관계 — 60분 반과 120분 반 (2026-09-16 Alan 요청).
 *
 * 브로슈어의 등록 단위는 120분(650·750)·140분(850)이지만 실제 수업은 60분·70분 **시간 단위**로 돌아가고
 * (10:00–11:00 RC 다음 11:10–12:10 LC 로 강사가 바뀐다), 한 시간만 듣는 학생(주5일 60분 · 주3일 단과)도 있다.
 * 그래서 **시간 단위 반**이 진짜 수업이고, 그 시간들을 안에 품는 **묶음 반**(120분·140분)은 등록 단위다.
 * 묶음 반 학생은 안에 든 시간 단위 반의 수업일·다시보기·불라방·LC 교재를 그대로 받는다 — DB 의 private.section_includes.
 *
 * 판정은 라벨의 시간만으로 한다: 같은 강좌·트랙에서 시간이 **안에** 들어오면 묶음이다.
 * 여기 규칙과 DB 함수 private.time_block_contains 는 같아야 한다.
 */

export const TIME_BLOCK_RE = /^(\d{2}):(\d{2})~(\d{2}):(\d{2})$/;

export type TimeSpan = { start: number; end: number };

/** "10:00~12:10" → 분 단위 구간. 형식이 다르면 null */
export function parseTimeBlock(label: string | null | undefined): TimeSpan | null {
  const m = label?.match(TIME_BLOCK_RE);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return end > start ? { start, end } : null;
}

/** inner 가 outer 안에 들어오되 같은 구간은 아닌가 (DB 의 private.time_block_contains 와 같은 규칙) */
export function blockContains(outer: string | null | undefined, inner: string | null | undefined): boolean {
  const o = parseTimeBlock(outer);
  const i = parseTimeBlock(inner);
  if (!o || !i) return false;
  return i.start >= o.start && i.end <= o.end && (i.start > o.start || i.end < o.end);
}

export type BlockNode = { label: string; span: TimeSpan; parts: BlockNode[] };

/**
 * 시간대 라벨들을 묶음 → 시간 단위 트리로 만든다. 부모는 자기를 품는 것 중 가장 짧은 구간.
 * 같은 시작 시각이면 긴 구간(묶음)이 먼저 온다.
 * 묶음은 점수보장반에만 있다 — 스파르타반(190분 · 260분)은 서로 다른 상품이라 `nest: false` 로 평평하게 둔다.
 */
export function buildBlockTree(labels: Iterable<string | null | undefined>, opts: { nest?: boolean } = {}): BlockNode[] {
  const nest = opts.nest ?? true;
  const uniq = [...new Set([...labels].filter((l): l is string => !!l && TIME_BLOCK_RE.test(l)))];
  const nodes = uniq.map((label) => ({ label, span: parseTimeBlock(label)!, parts: [] as BlockNode[] })).filter((n) => n.span);
  nodes.sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
  const roots: BlockNode[] = [];
  for (const n of nodes) {
    let parent: BlockNode | null = null;
    if (nest) {
      for (const m of nodes) {
        if (m === n || !blockContains(m.label, n.label)) continue;
        if (!parent || m.span.end - m.span.start < parent.span.end - parent.span.start) parent = m;
      }
    }
    (parent ? parent.parts : roots).push(n);
  }
  return roots;
}

/** 트리를 깊이와 함께 펼친다 (표 행 순서) */
export function flattenBlockTree(roots: BlockNode[]): { node: BlockNode; depth: number }[] {
  const out: { node: BlockNode; depth: number }[] = [];
  const walk = (n: BlockNode, depth: number) => {
    out.push({ node: n, depth });
    for (const p of n.parts) walk(p, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return out;
}

/**
 * 수업 분량. 시간 단위(한 교시, 90분 이하)는 벽시계 길이, 묶음은 안에 든 시간 단위의 합 —
 * 10:00~12:10 은 벽시계로 130분이지만 60분 + 60분 = "120분" 이 브로슈어의 이름이다.
 * 쉬는 시간이 어디 있는지 모르는 긴 단일 구간(방학달 120분 반, 스파르타반)은 null.
 */
export function blockMinutes(node: BlockNode): number | null {
  if (node.parts.length === 0) {
    const len = node.span.end - node.span.start;
    return len <= 90 ? len : null;
  }
  let sum = 0;
  for (const p of node.parts) {
    const m = blockMinutes(p);
    if (m == null) return null;
    sum += m;
  }
  return sum;
}

export const minutesLabel = (m: number | null | undefined) => (m == null ? null : `${m}분`);

/** "10:00~11:00" → "10:00–11:00" (시간 단위 나열용) */
export const dashLabel = (label: string) => label.replace("~", "–");

export const TRACKS = ["mwf", "ttf"] as const;
export type Track = (typeof TRACKS)[number];
export const isTrack = (v: unknown): v is Track => v === "mwf" || v === "ttf";

/** 고른 트랙 묶음의 이름 — 두 트랙 다면 주5일 */
export function tracksLabel(tracks: Iterable<string>): string {
  const set = new Set(tracks);
  if (set.has("mwf") && set.has("ttf")) return "주5일";
  if (set.has("mwf")) return "월수금";
  if (set.has("ttf")) return "화목금";
  return "";
}

type SectionLike = {
  id: number;
  track: string;
  time_block: string | null;
  course_id?: number | null;
  term_id?: number | null;
  course?: { program?: string | null } | null;
};

/**
 * 반 목록 안에서 묶음 관계를 찾는다 (점수보장반에서 같은 기수 · 트랙 · 강좌, 시간이 안에 들어오는 반).
 * DB 의 private.section_includes 중 묶음 규칙과 같다. 스파르타 포함 관계는 DB(term_section_includes)에서 받는다.
 */
export function sectionPackages<T extends SectionLike>(list: T[]): Map<number, { parts: T[]; parents: T[] }> {
  const out = new Map<number, { parts: T[]; parents: T[] }>();
  const entry = (id: number) => {
    const e = out.get(id) ?? { parts: [], parents: [] };
    out.set(id, e);
    return e;
  };
  for (const p of list) {
    if (!p.time_block || p.course?.program !== "score") continue;
    for (const c of list) {
      if (c.id === p.id || !c.time_block) continue;
      if (c.track !== p.track || c.course_id !== p.course_id || (c.term_id ?? null) !== (p.term_id ?? null)) continue;
      if (!blockContains(p.time_block, c.time_block)) continue;
      entry(p.id).parts.push(c);
      entry(c.id).parents.push(p);
    }
  }
  return out;
}
