import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HANDOVER_KEY, handoverProgress, inlineTokens, parseHandover, plainText, type InlineToken } from "./handover";

/**
 * 인수인계 체크리스트 화면(`운영 → 인수인계`)은 docs/HANDOVER.md 를 그대로 그린다 (2026-10-04).
 * 문서를 고치다 화면이 못 읽는 꼴을 쓰면 그 줄이 화면에서 조용히 빠지거나 마크다운 기호째 보인다 — 여기서 실제 파일로 깨진다.
 * 체크는 항목 번호(`0-1` · `3-B`)로 저장하므로 번호 규칙도 본다.
 */
const SOURCE = readFileSync("docs/HANDOVER.md", "utf8");
const doc = parseHandover(SOURCE);

const flatText = (ts: InlineToken[]): string[] => ts.flatMap((t) => (t.t === "text" ? [t.v] : t.t === "strong" ? flatText(t.v) : []));

describe("docs/HANDOVER.md — 화면이 그대로 읽는다", () => {
  it("못 읽은 줄이 없다", () => {
    expect(doc.problems, doc.problems.join("\n")).toEqual([]);
  });

  it("제목이 있고 단계가 0단계부터 10단계까지 차례로 있다", () => {
    expect(doc.title).toContain("인수인계");
    expect(doc.stages.map((s) => s.stage)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const s of doc.stages) expect(s.keys.length, `${s.stage}단계`).toBeGreaterThan(0);
  });

  it("파일의 체크 줄(- [ ])과 단계 줄(두 칸 들여 쓴 1.)이 하나도 빠짐없이 항목이 됐다", () => {
    const lines = SOURCE.split("\n");
    expect(doc.tasks.length).toBe(lines.filter((l) => /^- \[[ xX]\] /.test(l)).length);
    expect(doc.tasks.reduce((n, t) => n + t.steps.length, 0)).toBe(lines.filter((l) => /^ {2,}\d+\. /.test(l)).length);
  });

  it("항목 번호는 겹치지 않고 DB check 꼴이며, 번호의 단계가 그 항목이 놓인 단계다", () => {
    const keys = doc.tasks.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of doc.tasks) expect(t.key, t.key).toMatch(HANDOVER_KEY);
    for (const s of doc.stages) for (const k of s.keys) expect(Number(k.split("-")[0]), k).toBe(s.stage);
  });

  it("모든 항목에 하는 방법(단계)이 적혀 있다 (2026-10-04 Alan — 완성할 때 해야 하는 방법도 같이)", () => {
    for (const t of doc.tasks) expect(t.steps.length, t.key).toBeGreaterThan(0);
  });

  it("글 안에 마크다운 기호가 남지 않는다 (짝이 안 맞는 ** · ` · 남은 이스케이프)", () => {
    const texts = doc.blocks.flatMap((b) => {
      switch (b.kind) {
        case "heading":
        case "paragraph":
          return [b.text];
        case "list":
          return b.items;
        case "table":
          return [...b.header, ...b.rows.flat()];
        case "tasks":
          return b.items.flatMap((t) => [t.title, t.note, ...t.steps]);
      }
    });
    const leftovers = texts.flatMap((s) => flatText(inlineTokens(s))).filter((v) => /\*\*|`|\\|\]\(/.test(v));
    expect(leftovers).toEqual([]);
  });

  it("표는 칸 수가 머리글과 같다", () => {
    for (const b of doc.blocks) if (b.kind === "table") for (const r of b.rows) expect(r.length).toBe(b.header.length);
  });

  it("Vercel 함수에 이 파일이 실린다 (next.config.ts — 안 실리면 운영에서 화면이 읽지 못한다)", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toMatch(/"\/admin\/handover":\s*\["\.\/docs\/HANDOVER\.md"\]/);
  });
});

describe("parseHandover — 꼴마다", () => {
  const md = [
    "# 제목",
    "",
    "첫 문단 첫 줄",
    "둘째 줄",
    "",
    "## 0단계 · 준비 (먼저)",
    "",
    "- [ ] **0-1 처음 할 일** (알런)",
    "  1. 하나",
    "  2. 둘",
    "- [ ] **0-B 다음 할 일**",
    "  1. 셋",
    "",
    "| 이름 | 값 |",
    "| --- | --- |",
    "| `a\\|b` | 둘 |",
    "",
    "1. 순서 하나",
    "2. 순서 둘",
    "",
    "- 점 하나",
    "* 점 둘",
  ].join("\n");
  const d = parseHandover(md);

  it("제목 · 문단(줄을 잇는다) · 단계 · 항목 · 표 · 목록", () => {
    expect(d.problems).toEqual([]);
    expect(d.title).toBe("제목");
    expect(d.blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "heading", "tasks", "table", "list", "list"]);
    expect(d.blocks[1]).toEqual({ kind: "paragraph", text: "첫 문단 첫 줄 둘째 줄" });
    expect(d.stages).toEqual([{ stage: 0, label: "준비", id: "stage-0", keys: ["0-1", "0-B"] }]);
    expect(d.tasks[0]).toEqual({ key: "0-1", stage: 0, title: "처음 할 일", note: "(알런)", steps: ["하나", "둘"] });
    expect(d.tasks[1].note).toBe("");
    const table = d.blocks[4];
    expect(table.kind === "table" && table.rows).toEqual([["`a\\|b`", "둘"]]);
    expect(d.blocks[5]).toEqual({ kind: "list", ordered: true, items: ["순서 하나", "순서 둘"] });
    expect(d.blocks[6]).toEqual({ kind: "list", ordered: false, items: ["점 하나", "점 둘"] });
  });

  it("번호 없는 항목 · 단계 밖 항목 · 겹친 번호 · 이상한 들여쓰기는 problems 에 적는다", () => {
    const bad = parseHandover(["## 1단계 · 개인정보", "- [ ] 번호 없음", "- [ ] **2-1 다른 단계**", "- [ ] **1-1 하나**", "  - 점", "- [ ] **1-1 또 하나**"].join("\n"));
    expect(bad.problems).toHaveLength(4);
    expect(bad.problems.join("\n")).toMatch(/번호 없음[\s\S]*2-1[\s\S]*  - 점[\s\S]*겹친다: 1-1/);
  });

  it("표의 둘째 줄이 구분선이 아니면 적는다", () => {
    expect(parseHandover("| a | b |\n| c | d |").problems).toHaveLength(1);
  });
});

describe("inlineTokens — 굵게 · 코드 · 링크 · 주소 · 이스케이프", () => {
  it("이스케이프를 푼다 — 1\\~2주 · turn\\_toeic", () => {
    expect(plainText("최소 1\\~2주 · github.com/a/turn\\_toeic")).toBe("최소 1~2주 · github.com/a/turn_toeic");
  });

  it("굵게 안의 코드 · 이스케이프", () => {
    expect(inlineTokens("**Deploy 켬 `main` 1\\~2**")).toEqual([
      { t: "strong", v: [{ t: "text", v: "Deploy 켬 " }, { t: "code", v: "main" }, { t: "text", v: " 1~2" }] },
    ]);
  });

  it("코드 안의 백슬래시는 그대로 둔다", () => {
    expect(inlineTokens("`a\\_b`")).toEqual([{ t: "code", v: "a\\_b" }]);
  });

  it("이스케이프한 ** 는 굵게가 아니다", () => {
    expect(inlineTokens("\\*\\*굵게 아님\\*\\*")).toEqual([{ t: "text", v: "**굵게 아님**" }]);
  });

  it("[글](주소) 링크 — http(s) 만", () => {
    expect(inlineTokens("[Supabase](https://supabase.com/docs) (원문)")).toEqual([
      { t: "link", v: "Supabase", href: "https://supabase.com/docs" },
      { t: "text", v: " (원문)" },
    ]);
    expect(inlineTokens("[누름](javascript:alert(1))").some((t) => t.t === "link")).toBe(false);
  });

  it("맨 주소는 링크로 — 끝의 문장부호는 뺀다", () => {
    expect(inlineTokens("https://winnertoeic.com/signup 에서 · https://winnertoeic.com.")).toEqual([
      { t: "link", v: "https://winnertoeic.com/signup", href: "https://winnertoeic.com/signup" },
      { t: "text", v: " 에서 · " },
      { t: "link", v: "https://winnertoeic.com", href: "https://winnertoeic.com" },
      { t: "text", v: "." },
    ]);
  });

  it("코드 안의 주소는 링크로 만들지 않는다", () => {
    expect(inlineTokens("`https://winnertoeic.com/**`")).toEqual([{ t: "code", v: "https://winnertoeic.com/**" }]);
  });
});

describe("handoverProgress", () => {
  it("문서에 있는 번호만 센다 — 문서에서 사라진 옛 번호의 체크는 세지 않는다", () => {
    const d = parseHandover(["## 0단계 · 준비", "- [ ] **0-1 가**", "  1. 하나", "- [ ] **0-2 나**", "  1. 하나"].join("\n"));
    const p = handoverProgress(d, new Set(["0-1", "9-9"]));
    expect(p.done).toBe(1);
    expect(p.total).toBe(2);
    expect(p.stages.map((s) => s.done)).toEqual([1]);
  });
});
