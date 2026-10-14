import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 휴대폰에서 조용히 깨지던 공용 조각 둘 (2026-10-14 Alan — 학생명단 · 교재주문 캡처를 보내며 "전체 이부분 ui가 이상해" ·
 * "교재주문 앞에 이모티콘도 망가져있어"). 되돌려도 PC 화면은 멀쩡하고 휴대폰에서만 틀어져 늦게 발견된다 — 소스를 읽어 못박는다.
 * - 탭 줄(FilterTabs): 칸마다 80px 를 못박고(`min-w-20`) 띠는 화면 폭에 묶어 두어, 다섯 칸 줄이 430px 아이폰에서도 넘쳤고
 *   마지막 `전체` 칸이 흰 띠 밖으로 삐져나와 잘렸다. 숫자가 없는 칸(`전체` · `졸업생`)은 이름이 세로 가운데로 내려가 줄이 들쭉날쭉했다
 * - 화면 제목(PageHeader): 설명이 길면 아이콘 타일이 48px → 14px 로 눌렸고, img 의 `max-width: 100%`(Tailwind preflight)가
 *   아이콘 가로만 줄여 홀쭉하게 찌그러졌다
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/** 주석을 뺀 코드 — 주석에는 예전 값(`min-w-20`)을 까닭과 함께 적어 두었다 */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("탭 줄 (src/components/admin/FilterTabs.tsx)", () => {
  const src = code("src/components/admin/FilterTabs.tsx");

  it("칸에 고정 최소 폭이 없고 이름은 한 줄 — 칸은 제 글자보다 좁아지지 않는다", () => {
    expect(src).not.toMatch(/\bmin-w-20\b/);
    expect(src).toMatch(/flex flex-1 basis-0 [^"]*whitespace-nowrap/);
  });

  it("띠가 칸과 함께 넓어진다 (min-w-min) — 칸이 흰 띠 밖으로 삐져나오지 않는다", () => {
    expect(src).toMatch(/role="tablist" className=\{cn\("flex min-w-min /);
    expect(src).not.toMatch(/min-w-full/);
  });

  it("숫자가 있는 칸과 없는 칸이 섞이면 없는 칸에 보이지 않는 숫자 자리를 둔다 (휴대폰에서 이름 줄을 맞춘다)", () => {
    expect(src).toMatch(/const anyCount = tabs\.some\(/);
    expect(src).toMatch(/aria-hidden className=\{cn\(badge, "invisible sm:hidden"\)\}/);
  });
});

describe("화면 제목 (src/components/ui/PageHeader.tsx) · 아이콘 (src/components/ui/Icon.tsx)", () => {
  it("아이콘 타일은 줄지 않고(shrink-0) 글은 줄어든다(min-w-0)", () => {
    const src = read("src/components/ui/PageHeader.tsx");
    expect(src).toMatch(/<span className="flex h-12 w-12 shrink-0 /);
    expect(src).toMatch(/<div className="min-w-0">/);
  });

  it("아이콘은 감싼 칸이 좁아도 찌그러지지 않는다 (max-w-none — preflight 의 max-width: 100% 를 끈다)", () => {
    const src = read("src/components/ui/Icon.tsx");
    expect(src).toMatch(/className=\{cn\("inline-block max-w-none shrink-0 select-none", className\)\}/);
    expect(src).toMatch(/style=\{\{ width: size, height: size \}\}/);
  });
});
