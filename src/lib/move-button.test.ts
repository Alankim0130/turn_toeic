// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * 수업자료실 ↔ 직원 게시판 옮기기 단추 (2026-10-29 점검). 서버 액션이 답 없이 끝나면(연결 끊김 · 시간 초과)
 * 예전에는 '옮기는 중…' 에 멈춰 창을 닫을 수도 없었다 — 실제로 그려서 눌러 본다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ refresh: 0, push: [] as string[], throwIt: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => void (h.refresh += 1), push: (u: string) => void h.push.push(u) }) }));
vi.mock("@/app/admin/board/move-actions", () => {
  const run = async () => {
    if (h.throwIt) throw new TypeError("Failed to fetch");
    return { ok: true, href: "/admin/board/9" };
  };
  return { moveClassNoticeToBoard: run, moveClassMaterialToBoard: run, moveStaffPostToClass: run };
});
vi.mock("@/app/admin/board/actions", () => ({
  deleteStaffPost: async () => {
    if (h.throwIt) throw new TypeError("Failed to fetch");
    return { ok: true };
  },
}));

const { MoveToBoardButton } = await import("@/components/admin/board/MoveToBoardButton");
const { MoveToClassButton } = await import("@/components/admin/board/MoveToClassButton");
const { MOVE_THROWN } = await import("@/lib/board-move");
const { StaffPostDeleteButton } = await import("@/components/admin/board/StaffPostDeleteButton");

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeEach(() => {
  h.refresh = 0;
  h.push = [];
  h.throwIt = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label))!;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));

describe("옮기기 단추 — 답 없이 끝나도 멈추지 않는다", () => {
  it("직원 게시판으로: 오류를 적고 다시 누를 수 있다 · 화면을 새로 받는다", async () => {
    await act(async () => root!.render(createElement(MoveToBoardButton, { kind: "material", id: 3, title: "5회차 해설", place: "650 · RC A과정" })));
    await act(async () => button("직원 게시판으로").click());
    await act(async () => button("이 자료 옮기기").click());
    await flush();
    expect(document.body.textContent).toContain(MOVE_THROWN);
    expect(button("이 자료 옮기기").disabled).toBe(false);
    expect(button("취소").disabled).toBe(false);
    expect(h.refresh).toBe(1);
    expect(h.push).toEqual([]);
  });

  it("직원 게시판으로: 성공하면 옮겨 간 글로 간다", async () => {
    h.throwIt = false;
    await act(async () => root!.render(createElement(MoveToBoardButton, { kind: "notice", id: 3, title: "10월 공지", place: "모든 레벨" })));
    await act(async () => button("직원 게시판으로").click());
    await act(async () => button("이 공지 옮기기").click());
    await flush();
    expect(h.push).toEqual(["/admin/board/9"]);
  });

  it("수업자료실로: 오류를 적고 다시 누를 수 있다", async () => {
    const draft = { kind: "notice" as const, notice: { levels: [650], subjects: [] }, material: { level: 650, subject: null, set: null, seq: null } };
    await act(async () => root!.render(createElement(MoveToClassButton, { id: 7, levels: [650, 750, 850], draft, materialBlock: null })));
    await act(async () => button("수업자료실로 옮기기").click());
    const go = [...document.querySelectorAll("button")].filter((b) => b.textContent?.includes("옮기기")).at(-1)!;
    await act(async () => go.click());
    await flush();
    expect(document.body.textContent).toContain(MOVE_THROWN);
    expect(go.disabled).toBe(false);
    expect(h.refresh).toBe(1);
  });
});

describe("직원 글 지우기 — 답 없이 끝나도 '지우는 중…' 에 멈추지 않는다", () => {
  it("오류를 적고 다시 누를 수 있다", async () => {
    window.confirm = () => true;
    await act(async () => root!.render(createElement(StaffPostDeleteButton, { id: 5, others: false })));
    await act(async () => button("글 지우기").click());
    await flush();
    expect(document.body.textContent).toContain("인터넷 연결을 확인하고");
    expect(button("글 지우기").disabled).toBe(false);
    expect(h.push).toEqual([]);
  });
});

describe("같은 꼴의 다른 단추 — 답 없이 끝나면 알린다", () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  it("비대면 인증 독촉 보내기", () => {
    expect(read("components/admin/studies/CheckinRoster.tsx")).toMatch(/sendStudentMessages\([\s\S]{0,200}\)\.catch\(/);
  });
  it("알림 끄기 · 테스트 알림", () => {
    const src = read("components/push/PushSetup.tsx");
    expect(src).toContain("알림을 끄지 못했어요");
    expect(src).toContain("테스트 알림을 보내지 못했어요");
  });
});
