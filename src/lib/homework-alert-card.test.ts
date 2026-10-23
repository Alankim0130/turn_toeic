// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * 숙제제출 화면의 **숙제 미제출 알림 스위치** (2026-10-23 Alan — "숙제 미제출 알림이 잘 안보이는데 쫌 더 직관적으로 보이도록 부탁해").
 * 끈 화면이 바탕과 같은 회색 줄에 '다시 받기' 글자 버튼이라 안 보였다 → 켜고 끄는 스위치 하나 + `켜져 있어요` · `꺼져 있어요`.
 * 실제로 그려서 누른다 — 누르면 그 자리에서 바뀌고, 저장에 실패하면 원래대로 돌아가며 까닭을 적는다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Result = { ok: boolean; error?: string };
const h = vi.hoisted(() => ({
  calls: [] as boolean[],
  next: null as null | ((r: Result) => void),
  refresh: 0,
}));

vi.mock("@/app/my/homework/actions", () => ({
  // 끝나는 때를 테스트가 정한다 — 저장하는 동안의 모양을 보려고
  setHomeworkMissingAlert: (on: boolean) => {
    h.calls.push(on);
    return new Promise<Result>((resolve) => {
      h.next = resolve;
    });
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => void (h.refresh += 1) }) }));

const { HomeworkAlertCard } = await import("@/components/my/homework/HomeworkAlertCard");

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  h.calls = [];
  h.next = null;
  h.refresh = 0;
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

const render = (on: boolean) => act(() => root!.render(createElement(HomeworkAlertCard, { on })));
const toggle = () => host!.querySelector<HTMLButtonElement>('[role="switch"]')!;
const checked = () => toggle().getAttribute("aria-checked");
const text = () => host!.textContent ?? "";
const click = () => act(() => toggle().click());
const finish = (r: Result) =>
  act(async () => {
    h.next!(r);
    for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0));
  });

describe("숙제 미제출 알림 — 켜고 끄는 스위치 (2026-10-23 Alan)", () => {
  it("켜져 있으면 — 켜진 스위치 · '켜져 있어요' · 무엇을 받는지. 이름은 카드 제목, 설명은 아래 글", () => {
    render(true);
    expect(checked()).toBe("true");
    expect(text()).toContain("숙제 미제출 알림");
    expect(text()).toContain("켜져 있어요");
    expect(text()).toContain("다음 수업일 오후 5시까지 안 낸 숙제가 있으면 선생님이 알려 드려요");
    const title = document.getElementById(toggle().getAttribute("aria-labelledby")!);
    expect(title?.textContent).toBe("숙제 미제출 알림");
    expect(document.getElementById(toggle().getAttribute("aria-describedby")!)?.textContent).toContain("알려 드려요");
  });

  it("꺼져 있으면 — 꺼진 스위치 · '꺼져 있어요' · 다시 켜는 법. 예전 글자 버튼('다시 받기' · '알림 안 받기')은 없다", () => {
    render(false);
    expect(checked()).toBe("false");
    expect(text()).toContain("꺼져 있어요");
    expect(text()).toContain("알림이 오지 않아요");
    expect(text()).toContain("다시 받으려면 스위치를 켜 주세요");
    expect(text()).not.toContain("다시 받기");
    expect(text()).not.toContain("알림 안 받기");
    expect(host!.querySelectorAll("button")).toHaveLength(1);
  });

  it("누르면 저장이 끝나기 전에 바로 바뀌어 보이고, 그동안 또 눌러도 한 번만 저장한다", async () => {
    render(true);
    click();
    expect(h.calls).toEqual([false]);
    expect(checked()).toBe("false");
    expect(text()).toContain("꺼져 있어요");
    expect(toggle().getAttribute("aria-busy")).toBe("true");
    // 저장하는 동안 다시 눌러도 받지 않는다 — disabled 가 아니라서 포커스는 스위치에 남는다
    click();
    expect(h.calls).toEqual([false]);
    expect(toggle().disabled).toBe(false);
    await finish({ ok: true });
    expect(h.refresh).toBe(1);
    // 서버의 새 값이 내려온다 (router.refresh)
    render(false);
    expect(checked()).toBe("false");
    expect(toggle().hasAttribute("aria-busy")).toBe(false);
  });

  it("꺼진 것을 누르면 켠다", async () => {
    render(false);
    click();
    expect(h.calls).toEqual([true]);
    expect(checked()).toBe("true");
    expect(text()).toContain("켜져 있어요");
    await finish({ ok: true });
    render(true);
    expect(checked()).toBe("true");
  });

  it("저장에 실패하면 원래대로 돌아가고 까닭을 적는다 — 다시 누르면 까닭은 지운다", async () => {
    render(true);
    click();
    expect(checked()).toBe("false");
    await finish({ ok: false, error: "바꾸지 못했어요. 잠시 후 다시 시도해 주세요." });
    expect(checked()).toBe("true");
    expect(text()).toContain("켜져 있어요");
    expect(host!.querySelector('[role="alert"]')?.textContent).toBe("바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
    expect(h.refresh).toBe(0);
    click();
    expect(host!.querySelector('[role="alert"]')).toBeNull();
    expect(h.calls).toEqual([false, false]);
  });
});
