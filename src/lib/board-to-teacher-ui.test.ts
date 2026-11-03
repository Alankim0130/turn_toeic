// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BulkPost } from "@/lib/board-move";

/**
 * 직원 게시판 → 강사 자료 게시판 여러 개 옮기기 (2026-11-03 Alan — "RC/LC 선택하고 그중에서도 어느 폴더로 이동가능한지 선택해서 전체이동").
 * 진짜 대화창을 jsdom 으로 눌러 본다 — 서버 액션만 가짜다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ moves: [] as { id: number; folderId: number; seq: number }[], posts: [] as BulkPost[] }));

vi.mock("@/app/admin/board/move-actions", () => ({
  planStaffPostsMove: async () => ({ ok: true, posts: h.posts }),
  moveStaffPostToClass: async () => ({ ok: true }),
  moveStaffPostToTeacherFolder: async (input: { id: number; folderId: number; seq: number }) => {
    h.moves.push(input);
    return { ok: true };
  },
  finishBoardMoves: async () => ({ ok: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const { BoardBulkMove } = await import("@/components/admin/board/BoardBulkMove");
type BulkProps = Parameters<typeof BoardBulkMove>[0];
/** 대화창을 그린다 — children 은 createElement 셋째 인자로 (react/no-children-prop) */
const bulk = (props: Omit<BulkProps, "children">, ...children: React.ReactNode[]) => createElement(BoardBulkMove, props as BulkProps, ...children);
const { BulkCheck } = await import("@/components/admin/board/BulkSelect");

const post = (id: number, issue: BulkPost["materialIssue"] = null): BulkPost => ({ id, title: `글 ${id}`, levels: [850], subject: "lc", set: null, movedFrom: null, materialIssue: issue });
const folders = [
  { id: 1, subject: "rc" as const, name: "문풀반 C(A) 강사용" },
  { id: 2, subject: "lc" as const, name: "스텝게시판 800+A" },
  { id: 3, subject: "lc" as const, name: "강사게시판 850+ 가" },
];

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  h.moves = [];
  h.posts = [post(10), post(11, "photo"), post(12)];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
});

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const click = (el: Element | undefined | null) => act(() => (el as HTMLElement).click());

async function openTeacher() {
  const items = h.posts.map((p) => ({ key: `post:${p.id}`, id: p.id, title: p.title }));
  act(() =>
    root!.render(
      bulk(
        { items, levels: [650, 750, 850], tab: { level: 850, cell: { subject: "rc", set: "A" } }, folders },
        items.map((i) => createElement(BulkCheck, { key: i.key, itemKey: i.key, label: i.title })),
      ),
    ),
  );
  for (const box of document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) await click(box);
  await click(button("강사 자료 게시판으로"));
  await flush();
}

describe("직원 게시판 → 강사 자료 게시판", () => {
  it("글의 과목(LC)이 먼저 골라지고 그 게시판의 첫 폴더 · 1회차 — 사진 글은 건너뛴다", async () => {
    await openTeacher();
    const select = document.querySelector<HTMLSelectElement>("select:not([aria-label])");
    expect(select?.value).toBe("2");
    expect([...select!.options].map((o) => o.textContent)).toEqual(["스텝게시판 800+A", "강사게시판 850+ 가"]);
    expect(document.body.textContent).toContain("스텝게시판 800+A · 1회차");
    expect(document.body.textContent).toContain("사진이 있어 강사 자료 게시판으로는 못 가요");
    await click(button("2개 옮기기"));
    await flush();
    expect(h.moves).toEqual([
      { id: 10, folderId: 2, seq: 1 },
      { id: 12, folderId: 2, seq: 1 },
    ]);
  });

  it("RC 로 바꾸면 RC 폴더 · 글마다 다음 회차로 3회차부터", async () => {
    await openTeacher();
    await click(button("RC 강사게시판"));
    const seq = document.querySelector<HTMLSelectElement>('select[aria-label="회차"]')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      set.call(seq, "3");
      seq.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(button("글마다 다음 회차로"));
    expect(document.body.textContent).toContain("문풀반 C(A) 강사용 · 3회차");
    expect(document.body.textContent).toContain("문풀반 C(A) 강사용 · 4회차");
    await click(button("2개 옮기기"));
    await flush();
    expect(h.moves).toEqual([
      { id: 10, folderId: 1, seq: 3 },
      { id: 12, folderId: 1, seq: 4 },
    ]);
  });

  it("폴더가 없으면 버튼을 그리지 않는다", async () => {
    const items = [{ key: "post:1", id: 1, title: "글" }];
    act(() => root!.render(bulk({ items, levels: [850], tab: { level: 850, cell: null }, folders: [] }, createElement(BulkCheck, { itemKey: "post:1", label: "글" }))));
    await click(document.querySelector('input[type="checkbox"]'));
    expect(button("강사 자료 게시판으로")).toBeUndefined();
    expect(button("수업자료실로 옮기기")).toBeTruthy();
  });
});
