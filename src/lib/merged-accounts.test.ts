import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { SectionEditForm } from "@/components/admin/sections/SectionEditForm";

// 2026-10-19 Alan — 유튜브 자동 연결의 '강사님 연결 상태' 에 "이혜영 쌤이 두번 노출되어있는데 확인해줘".
// 이혜영 강사의 옛 이메일 계정은 2026-10-02 카카오 계정으로 합쳐졌다(profiles.merged_into). 강사 계정끼리 합치려면 등급이 같아야 해서
// 옛 계정도 강사 등급으로 남고(과목 · 유튜브 채널은 남길 계정으로 옮겨진다), 등급으로만 고르던 목록에 '과목 없음 · 미연결' 로 한 번 더 섰다.
// 규칙: 등급으로 사람을 고르는 profiles 조회(목록 · 수 세기)는 합쳐진 옛 계정을 뺀다 — DB 함수(section_instructor_plan · subject_instructors …)는 이미 그렇다.

type Call = { name: string; args: readonly ts.Expression[] };
type Chain = { at: string; calls: Call[] };

const parse = (file: string, source: string) =>
  ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

function walkNodes(node: ts.Node, fn: (n: ts.Node) => void) {
  fn(node);
  ts.forEachChild(node, (child) => walkNodes(child, fn));
}

/** `.from("profiles")` 에서 시작하는 메서드 사슬 — `.select(…)` · `.in("role", …)` · `.is(…)` 를 차례로 모은다 */
function profileChains(file: string, source: string): Chain[] {
  const sf = parse(file, source);
  const out: Chain[] = [];
  walkNodes(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression) || n.expression.name.text !== "from") return;
    const [table] = n.arguments;
    if (!table || !ts.isStringLiteralLike(table) || table.text !== "profiles") return;
    const calls: Call[] = [];
    let cur: ts.Expression = n;
    while (ts.isPropertyAccessExpression(cur.parent) && cur.parent.expression === cur && ts.isCallExpression(cur.parent.parent) && cur.parent.parent.expression === cur.parent) {
      calls.push({ name: cur.parent.name.text, args: cur.parent.parent.arguments });
      cur = cur.parent.parent;
    }
    out.push({ at: `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`, calls });
  });
  return out;
}

const literal = (e: ts.Expression | undefined) => (e && ts.isStringLiteralLike(e) ? e.text : null);
const byRole = (c: Chain) => c.calls.some((x) => x.name === "select") && c.calls.some((x) => ["eq", "in", "neq"].includes(x.name) && literal(x.args[0]) === "role");
const skipsMerged = (c: Chain) => c.calls.some((x) => x.name === "is" && literal(x.args[0]) === "merged_into" && x.args[1]?.kind === ts.SyntaxKind.NullKeyword);

/** 등급으로 사람을 골라 읽는데 합쳐진 옛 계정을 빼지 않은 곳 */
const unguarded = (sources: { file: string; source: string }[]) =>
  sources.flatMap(({ file, source }) => profileChains(file, source)).filter((c) => byRole(c) && !skipsMerged(c)).map((c) => c.at);

function appSources(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push({ file: path.relative(process.cwd(), p), source: fs.readFileSync(p, "utf8") });
    }
  };
  walk(path.join(process.cwd(), "src"));
  return out;
}

describe("합쳐진 옛 계정 — 등급으로 사람을 고르는 목록에 세우지 않는다", () => {
  const sources = appSources();

  it("등급으로 고르는 profiles 조회(목록 · 수 세기)는 모두 .is(\"merged_into\", null) 을 건다", () => {
    expect(unguarded(sources)).toEqual([]);
  });

  it("그 검사가 실제로 잡는다 — 여러 줄로 이어 쓴 사슬 · 수 세기도, 고치는 사슬 · 한 사람 조회는 빼고", () => {
    const one = (source: string) => unguarded([{ file: "x.ts", source }]);
    expect(one('supabase.from("profiles").select("id, name").in("role", ["instructor", "admin"]).order("name");')).toHaveLength(1);
    expect(one('admin\n  .from("profiles")\n  .select("id", { count: "exact", head: true })\n  .eq("role", "admin")\n  .neq("id", id);')).toHaveLength(1);
    expect(one('supabase.from("profiles").select("id").in("role", ["instructor"]).is("merged_into", null);')).toEqual([]);
    expect(one('admin.from("profiles").update({ role: "student" }).eq("id", userId).in("role", ["member", "alumni"]);')).toEqual([]);
    expect(one('supabase.from("profiles").select("role, merged_into").eq("id", id).maybeSingle();')).toEqual([]);
  });

  it("유튜브 자동 연결 · 반 상세 · 반 편성의 강사 목록과 스태프 알림이 이 검사 안에 있다 (변수로 옮겨 검사를 비껴가지 않게)", () => {
    const guarded = (file: string) => {
      const found = sources.find((s) => s.file === file);
      expect(found, file).toBeTruthy();
      return profileChains(file, found!.source).some((c) => byRole(c) && skipsMerged(c));
    };
    expect(guarded("src/app/admin/live-channels/page.tsx")).toBe(true);
    expect(guarded("src/app/admin/sections/[id]/page.tsx")).toBe(true);
    expect(guarded("src/app/admin/sections/_lib/term-data.ts")).toBe(true);
    expect(guarded("src/lib/push.ts")).toBe(true);
    expect(guarded("src/app/admin/students/actions.ts")).toBe(true); // 마지막 관리자 세기
  });

  it("담당을 넣는 서버 액션 셋(반 상세 · 하나씩 만들기 · 일괄 지정)은 합쳐진 계정 · 강사가 아닌 계정을 받지 않는다", () => {
    const file = "src/app/admin/sections/actions.ts";
    const sf = parse(file, fs.readFileSync(file, "utf8"));
    const bodies = new Map<string, string>();
    walkNodes(sf, (n) => {
      if (ts.isFunctionDeclaration(n) && n.name && n.body) bodies.set(n.name.text, n.body.getText(sf));
    });
    const check = bodies.get("isAssignableInstructor") ?? "";
    expect(check).toContain('select("role, merged_into")');
    expect(check).toContain("!data.merged_into");
    expect(check).toContain('data.role === "instructor" || data.role === "admin"');
    for (const action of ["createSection", "updateSection", "assignInstructor"]) expect(bodies.get(action), action).toContain("isAssignableInstructor(supabase,");
  });
});

describe("반 상세 담당 강사 고르기 — 지금 담당이 목록에 없으면 빈 칸을 골라 둔다", () => {
  // 빈 칸이 없으면 브라우저가 첫 사람을 골라 두어, 담당이 없는 120분 묶음 반 · 속성반에서 '기본 정보 저장' 만 눌러도
  // 이름순 첫 사람(관리자)이 담당이 됐다 — 담당만 바뀌는 저장은 DB 의 담당 자동 맞추기가 돌지 않아 그대로 남는다
  const instructors = [
    { id: "a", name: "관리자갑", role: "admin" },
    { id: "b", name: "이영수", role: "instructor" },
  ];
  const select = (instructorId: string) => {
    const html = renderToStaticMarkup(
      createElement(SectionEditForm, {
        id: 1,
        values: { capacity: "", status: "open", book_set: "", subject: "", instructor_id: instructorId },
        instructors,
        readOnly: false,
      }),
    );
    return html.match(/<select id="instructor_id"[\s\S]*?<\/select>/)?.[0] ?? "";
  };

  it("담당이 없으면 '자동 — 편성표대로' 빈 칸이 맨 앞에 서고 골라져 있다", () => {
    const html = select("");
    expect(html).toContain('<option value="" selected="">자동 — 편성표대로</option>');
    expect(html.match(/selected=""/g)).toHaveLength(1);
  });

  it("담당이 목록에 있으면 그 사람이 골라져 있고 빈 칸은 없다", () => {
    const html = select("b");
    expect(html).toContain('<option value="b" selected="">이영수 (강사)</option>');
    expect(html).not.toContain('<option value=""');
  });

  it("담당이 목록에서 빠진 계정이면(합쳐진 계정 · 등급이 바뀐 계정) '지금 담당 그대로' — 저장해도 담당을 바꾸지 않는다", () => {
    const html = select("gone");
    expect(html).toContain('<option value="" selected="">지금 담당 그대로</option>');
    expect(html.match(/selected=""/g)).toHaveLength(1);
  });
});
