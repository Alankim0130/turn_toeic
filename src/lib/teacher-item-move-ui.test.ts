// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";

/**
 * 강사 자료 게시판 — 고른 자료를 다른 폴더 · 회차로 (2026-11-04 Alan — "R 자료를 A 폴더에 잘못 넣어버렸는데 R 로 옮기려는데 옮길수가 없네용").
 * 진짜 대화창을 jsdom 으로 눌러 본다 — 서버 액션만 가짜다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type MoveInput = { ids: number[]; folderId: number; seq: number | null };
const h = vi.hoisted(() => ({ calls: [] as MoveInput[], answer: { ok: true, moved: 0 } as { ok: boolean; moved?: number; error?: string } }));

vi.mock("@/app/admin/teacher-board/actions", () => ({
  moveTeacherItems: async (input: MoveInput) => {
    h.calls.push(input);
    return h.answer.ok ? { ...h.answer, moved: h.answer.moved || input.ids.length } : h.answer;
  },
}));
vi.mock("@/app/admin/board/move-actions", () => ({ finishBoardMoves: async () => ({ ok: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const { TeacherItemsMove, itemKey } = await import("@/components/admin/teacher-board/TeacherItemsMove");
const { BulkCheck, BulkSelectAll } = await import("@/components/admin/board/BulkSelect");
type MoveProps = Parameters<typeof TeacherItemsMove>[0];

const folders = [
  { id: 1, subject: "rc" as const, name: "문풀반 C(A) 강사용" },
  { id: 2, subject: "lc" as const, name: "스텝게시판 800+A" },
  { id: 5, subject: "lc" as const, name: "스텝게시판 800+R" },
];
const items = [
  { id: 11, folder_id: 2, seq: 1, sort_order: 0, title: "850+R 2강 수업필기본" },
  { id: 12, folder_id: 2, seq: 1, sort_order: 1, title: "850+R 1강 교재 음성파일" },
  { id: 13, folder_id: 2, seq: 2, sort_order: 0, title: "850+R 3강 교재 음성파일" },
];

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  h.calls = [];
  h.answer = { ok: true };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
});

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const click = (el: Element | undefined | null) => act(() => (el as HTMLElement).click());
const choose = (select: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
const folderSelect = () => document.querySelector<HTMLSelectElement>("select:not([aria-label])")!;

/** 폴더 A 를 그리고 전체 선택 → `다른 폴더로 옮기기` */
async function openAll() {
  const props: Omit<MoveProps, "children"> = { folder: folders[1], folders, items };
  act(() =>
    root!.render(
      createElement(
        TeacherItemsMove,
        props as MoveProps,
        createElement(BulkSelectAll, { keys: items.map((i) => itemKey(i.id)) }),
        items.map((i) => createElement(BulkCheck, { key: i.id, itemKey: itemKey(i.id), label: i.title })),
      ),
    ),
  );
  await click(document.querySelector('input[type="checkbox"]'));
  expect(document.body.textContent).toContain("3개 선택");
  await click(button("다른 폴더로 옮기기"));
}

describe("강사 자료 게시판 — 다른 폴더로 옮기기", () => {
  it("전체 선택 → 같은 게시판(LC)의 다른 폴더가 먼저 골라지고, 회차 그대로 R 폴더로 한 번에", async () => {
    await openAll();
    const select = folderSelect();
    expect(select.value).toBe("5");
    expect([...select.options].map((o) => o.textContent)).toEqual(["스텝게시판 800+A (지금 폴더)", "스텝게시판 800+R"]);
    expect(document.body.textContent).toContain("1회차 → 스텝게시판 800+R · 1회차");
    expect(document.body.textContent).toContain("2회차 → 스텝게시판 800+R · 2회차");
    await click(button("3개 옮기기"));
    await flush();
    expect(h.calls).toEqual([{ ids: [11, 12, 13], folderId: 5, seq: null }]);
    expect(document.body.textContent).toContain("3개를 옮겼어요");
    expect(document.querySelector('a[href="/admin/teacher-board?subject=lc&folder=5"]')?.textContent).toBe("그 폴더 보기");
  });

  it("같은 폴더는 회차만 바뀐다 — 회차 그대로면 옮길 것이 없고, 모두 2회차로면 이미 2회차인 것은 뺀다", async () => {
    await openAll();
    choose(folderSelect(), "2");
    expect(button("옮길 자료가 없어요")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("같은 폴더를 고르면 회차만 바뀌어요");
    await click(button("모두 이 회차로"));
    choose(document.querySelector<HTMLSelectElement>('select[aria-label="회차"]')!, "2");
    expect(document.body.textContent).toContain("이미 스텝게시판 800+A · 2회차예요");
    await click(button("2개 옮기기"));
    await flush();
    expect(h.calls).toEqual([{ ids: [11, 12, 13], folderId: 2, seq: 2 }]);
  });

  it("RC 게시판으로도 — 서버가 거절하면 대화창에 까닭을 그대로 보인다", async () => {
    h.answer = { ok: false, error: "고른 자료 중 이미 지워졌거나 옮겨진 것이 있어요. 새로고침한 뒤 다시 골라 주세요." };
    await openAll();
    await click(button("RC 강사게시판"));
    expect(folderSelect().value).toBe("1");
    await click(button("3개 옮기기"));
    await flush();
    expect(h.calls).toEqual([{ ids: [11, 12, 13], folderId: 1, seq: null }]);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("이미 지워졌거나 옮겨진 것이 있어요");
    expect(button("3개 옮기기")).toBeTruthy();
  });

  it("폴더 화면이 고르기 칸 · 전체 선택을 그린다 (테스트 등급이면 묶음 밖이라 칸이 없다)", () => {
    const panel = readFileSync("src/components/admin/teacher-board/TeacherItemsPanel.tsx", "utf8");
    expect(panel).toMatch(/<BulkCheck itemKey=\{itemKey\(item\.id\)\}/);
    expect(panel).toMatch(/<BulkSelectAll keys=\{keys\}/);
    expect(panel).toMatch(/if \(disabled \|\| all\.length === 0\) return panel;/);
  });
});
