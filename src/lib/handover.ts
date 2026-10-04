/**
 * 인수인계 체크리스트(docs/HANDOVER.md)를 관리자 화면 `운영 → 인수인계`(/admin/handover)에 그리기 위한 판독 (2026-10-04 Alan —
 * "햄버거 메뉴에서 인수인계 안보여"). 파일이 원본이고 화면은 그 파일을 그대로 그린다 — 문서를 고치면 화면도 따라온다.
 *
 * 문서가 쓰는 마크다운만 읽는다: 제목(`#` `##` `###`) · 문단 · 표 · 목록(`-` `*` `1.`) ·
 * **체크 항목** `- [ ] **N-X 제목** 덧붙임` + 그 아래 두 칸 들여 쓴 `1. 단계`. 글 안에서는 굵게 · 코드 · 링크 · https 주소 · 백슬래시 이스케이프.
 *
 * - 체크는 항목 번호(`0-1` · `3-B`)로 저장한다 (DB `handover_checks.item`). **번호를 바꾸면 그 항목의 체크가 화면에서 사라진다.**
 * - 못 읽는 꼴이 섞이면 `problems` 에 적고, `handover.test.ts` 가 실제 파일로 깨진다 — 화면에서 조용히 빠지지 않게.
 */

export type HandoverTask = {
  /** 항목 번호 — `0-1` · `3-B`. 체크를 저장하는 열쇠 */
  key: string;
  /** 단계 번호 (`3-B` → 3) */
  stage: number;
  title: string;
  /** 굵은 제목 뒤에 붙은 글 — `(인수자) — 제일 조용히 깨지는 곳` */
  note: string;
  steps: string[];
};

export type HandoverBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "tasks"; items: HandoverTask[] };

export type HandoverStage = {
  stage: number;
  /** `0단계 · 준비` 의 짧은 이름 — `준비` */
  label: string;
  /** 제목의 id (`stage-0`) — 진행 칩이 이리로 건너뛴다 */
  id: string;
  keys: string[];
};

export type HandoverDoc = {
  title: string;
  blocks: HandoverBlock[];
  tasks: HandoverTask[];
  stages: HandoverStage[];
  /** 못 읽은 줄 — 비어 있어야 한다 (테스트가 본다) */
  problems: string[];
};

/** 항목 번호 꼴 — DB check(`^[0-9]{1,2}-[0-9A-Z]{1,2}$`)와 같다 */
export const HANDOVER_KEY = /^[0-9]{1,2}-[0-9A-Z]{1,2}$/;

const TASK = /^- \[[ xX]\] /;
const TASK_LINE = /^- \[[ xX]\] \*\*([0-9]{1,2}-[0-9A-Z]{1,2}) (.+?)\*\*(.*)$/;
const STEP = /^ {2,}\d+\. (.+)$/;
const ORDERED = /^\d+\. (.+)$/;
const BULLET = /^[-*] (.+)$/;
const HEADING = /^(#{1,3}) (.+)$/;
const STAGE_HEADING = /^(\d{1,2})단계 · (.+)$/;

/** 표 한 줄을 칸으로 — 이스케이프한 `\|` 에서는 자르지 않는다 */
function splitRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\" && i + 1 < body.length) {
      cur += c + body[i + 1];
      i++;
    } else if (c === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/** `준비` · `개인정보 — 옮기기 전에` → `개인정보` · `Supabase (데이터베이스 …)` → `Supabase` */
const shortStageLabel = (rest: string) => rest.split(/ \(| — | \+ /)[0].trim();

const isBlockStart = (line: string) => HEADING.test(line) || line.startsWith("|") || TASK.test(line) || ORDERED.test(line) || BULLET.test(line);

export function parseHandover(markdown: string): HandoverDoc {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: HandoverBlock[] = [];
  const tasks: HandoverTask[] = [];
  const stages: HandoverStage[] = [];
  const problems: string[] = [];
  let title = "";
  let headingNo = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      const level = h[1].length as 1 | 2 | 3;
      const text = h[2].trim();
      const stage = level === 2 ? STAGE_HEADING.exec(text) : null;
      const id = stage ? `stage-${Number(stage[1])}` : `sec-${++headingNo}`;
      if (level === 1 && !title) title = text;
      if (stage) stages.push({ stage: Number(stage[1]), label: shortStageLabel(stage[2]), id, keys: [] });
      blocks.push({ kind: "heading", level, text, id });
      i++;
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(splitRow(lines[i++]));
      const [header, separator, ...body] = rows;
      if (!separator || !separator.every((c) => /^:?-{3,}:?$/.test(c))) problems.push(`표의 둘째 줄이 구분선(| --- |)이 아니다: ${header.join(" | ")}`);
      for (const r of body) if (r.length !== header.length) problems.push(`표 칸 수가 머리글(${header.length})과 다르다(${r.length}): ${r.join(" | ")}`);
      blocks.push({ kind: "table", header, rows: body });
      continue;
    }

    if (TASK.test(line)) {
      const items: HandoverTask[] = [];
      while (i < lines.length && TASK.test(lines[i])) {
        const m = TASK_LINE.exec(lines[i]);
        if (!m) problems.push(`체크 항목인데 \`**N-X 제목**\` 으로 시작하지 않는다: ${lines[i]}`);
        i++;
        const steps: string[] = [];
        while (i < lines.length && /^\s+\S/.test(lines[i])) {
          const s = STEP.exec(lines[i]);
          if (s) steps.push(s[1]);
          else problems.push(`체크 항목 아래 줄인데 \`  1. 단계\` 꼴이 아니다: ${lines[i]}`);
          i++;
        }
        if (!m) continue;
        const [, key, itemTitle, rest] = m;
        if (tasks.some((t) => t.key === key)) problems.push(`항목 번호가 겹친다: ${key}`);
        const task: HandoverTask = { key, stage: Number(key.split("-")[0]), title: itemTitle.trim(), note: rest.trim(), steps };
        const current = stages.at(-1);
        if (!current || current.stage !== task.stage) problems.push(`항목 ${key} 가 ${current ? `${current.stage}단계` : "단계 제목 없는 곳"} 아래에 있다`);
        else current.keys.push(key);
        items.push(task);
        tasks.push(task);
      }
      if (items.length) blocks.push({ kind: "tasks", items });
      continue;
    }

    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      const re = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i]) && !TASK.test(lines[i])) {
        items.push(re.exec(lines[i])![1]);
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i])) problems.push(`목록 안에 들여 쓴 줄은 읽지 않는다: ${lines[i++]}`);
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (/^\s/.test(line) || /^(```|~~~|>)/.test(line)) problems.push(`읽지 않는 꼴(들여쓰기 · 코드 블록 · 인용)이다: ${line}`);
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !isBlockStart(lines[i]))) para.push(lines[i++].trim());
    blocks.push({ kind: "paragraph", text: para.join(" ") });
  }

  return { title, blocks, tasks, stages, problems };
}

// ─── 글 안 (굵게 · 코드 · 링크 · 주소) ────────────────────────────────────────

export type InlineToken =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; v: InlineToken[] }
  | { t: "link"; v: string; href: string };

// 백슬래시 이스케이프(`\~` `\_` …)는 먼저 사용 영역 글자로 바꿔 둔다 — 그래야 `\*` 가 굵게를 열지 않는다
const ESC = /\\([!-/:-@[-`{-~])/g;
const PUA = /[-]/g;
const hide = (s: string) => s.replace(ESC, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)));
const unhide = (s: string) => s.replace(PUA, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000));
/** 코드 칸 안에서는 이스케이프가 먹지 않는다 — 원래 글자 그대로 */
const unhideRaw = (s: string) => s.replace(PUA, (c) => `\\${String.fromCharCode(c.charCodeAt(0) - 0xe000)}`);

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>`]+)/g;
/** 주소 끝에 붙은 문장부호는 주소가 아니다 — `https://winnertoeic.com.` */
const URL_TAIL = /[.,;:!?)\]'"’”]+$/;

function tokenize(s: string, allowStrong: boolean): InlineToken[] {
  const out: InlineToken[] = [];
  const push = (v: string) => {
    if (!v) return;
    const last = out.at(-1);
    if (last?.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };
  let at = 0;
  for (const m of s.matchAll(INLINE)) {
    const [whole, code, strong, linkText, linkHref, url] = m;
    const start = m.index;
    if (strong !== undefined && !allowStrong) continue;
    push(unhide(s.slice(at, start)));
    if (code !== undefined) out.push({ t: "code", v: unhideRaw(code) });
    else if (strong !== undefined) out.push({ t: "strong", v: tokenize(strong, false) });
    else if (linkText !== undefined) out.push({ t: "link", v: unhide(linkText), href: unhide(linkHref) });
    else {
      const tail = URL_TAIL.exec(url)?.[0] ?? "";
      const href = unhide(url.slice(0, url.length - tail.length));
      out.push({ t: "link", v: href, href });
      push(unhide(tail));
    }
    at = start + whole.length;
  }
  push(unhide(s.slice(at)));
  return out;
}

/** 글 한 덩이를 조각으로 — 화면(`HandoverInline`)이 그대로 그린다. 링크는 http(s) 주소만 */
export function inlineTokens(text: string): InlineToken[] {
  return tokenize(hide(text), true);
}

/** 조각을 꾸밈 없는 글로 (버튼 이름 · 화면 낭독기용) */
export function plainText(text: string): string {
  const flat = (ts: InlineToken[]): string => ts.map((x) => (x.t === "strong" ? flat(x.v) : x.v)).join("");
  return flat(inlineTokens(text));
}

// ─── 진행 ──────────────────────────────────────────────────────────────────

export type HandoverProgress = { done: number; total: number; stages: (HandoverStage & { done: number })[] };

/** 끝낸 항목 수 — 문서에 없는 번호(옛 번호)의 체크는 세지 않는다 */
export function handoverProgress(doc: HandoverDoc, checked: ReadonlySet<string>): HandoverProgress {
  const stages = doc.stages.map((s) => ({ ...s, done: s.keys.filter((k) => checked.has(k)).length }));
  return { done: doc.tasks.filter((t) => checked.has(t.key)).length, total: doc.tasks.length, stages };
}
