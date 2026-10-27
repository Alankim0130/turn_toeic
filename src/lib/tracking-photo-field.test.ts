// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LabelRead, UsedTracking } from "@/lib/tracking-label";

/**
 * 교재주문의 송장번호 칸 + **사진촬영** 버튼 (2026-10-27 Alan — "해당학생 송장번호 기입하는 곳에 사진촬영 버튼을 하나 만들어주면 좋겠어").
 * 실제로 그려서 사진을 고른다 — 읽는 일(`readLabelPhoto`)은 가짜로 바꾸고 끝나는 때를 테스트가 정한다.
 * 읽으면 칸에 번호가 들어가고 받는 분을 견주라고 적는다 · 못 읽으면 칸은 그대로 · 사진은 폼에 실리지 않는다 · 다른 주문의 번호면 알린다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  files: [] as Blob[],
  next: null as null | ((r: LabelRead) => void),
}));

vi.mock("@/components/admin/textbook-orders/read-label-photo", () => ({
  readLabelPhoto: (file: Blob) => {
    h.files.push(file);
    return new Promise<LabelRead>((resolve) => {
      h.next = resolve;
    });
  },
}));

const { TrackingNoField } = await import("@/components/admin/textbook-orders/TrackingNoField");

let root: Root | null = null;
let host: HTMLElement | null = null;
let form: HTMLFormElement | null = null;

beforeEach(() => {
  h.files = [];
  h.next = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  form = null;
});

const used: UsedTracking[] = [{ id: 11, key: "123456789012", name: "라마바" }];

function render(props: Partial<{ defaultValue: string; photo: boolean; orderId: number }> = {}) {
  act(() =>
    root!.render(
      createElement(
        "form",
        { ref: (el: HTMLFormElement | null) => void (form = el) },
        createElement(TrackingNoField, { orderId: 7, defaultValue: "", placeholder: "송장번호 (선택)", recipient: "가나다", used, ...props }),
      ),
    ),
  );
}
const text = () => host!.textContent ?? "";
const field = () => host!.querySelector<HTMLInputElement>('input[name="tracking_no"]')!;
const fileInput = () => host!.querySelector<HTMLInputElement>('input[type="file"]');
const photoButton = () => [...host!.querySelectorAll("button")].find((b) => b.textContent?.includes("사진촬영") || b.textContent?.includes("읽는 중"));

function pick(name = "label.jpg") {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
  const input = fileInput()!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return file;
}
const finish = (r: LabelRead) =>
  act(async () => {
    h.next!(r);
    for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0));
  });

describe("송장번호 칸 · 사진촬영 (2026-10-27 Alan)", () => {
  it("버튼은 폼을 보내지 않고, 휴대폰은 카메라가 바로 켜지고, 사진은 폼에 실리지 않는다", () => {
    render();
    expect(photoButton()?.type).toBe("button");
    const input = fileInput()!;
    expect(input.getAttribute("accept")).toBe("image/*");
    expect(input.getAttribute("capture")).toBe("environment");
    expect(input.hasAttribute("name")).toBe(false);
    const fd = new FormData(form!);
    expect([...fd.keys()]).toEqual(["tracking_no"]);
  });

  it("사진을 읽으면 칸에 운송장번호가 들어가고, 받는 분과 견주라고 적는다 — 저절로 저장하지 않는다", async () => {
    render();
    const file = pick();
    expect(h.files).toEqual([file]);
    expect(text()).toContain("접수증을 읽는 중…");
    expect(photoButton()?.disabled).toBe(true);
    await finish({ kind: "ok", tracking: "987654321098" });
    expect(field().value).toBe("987654321098");
    expect(new FormData(form!).get("tracking_no")).toBe("987654321098");
    expect(text()).toContain("운송장번호를 넣었어요. 접수증의 받는사람이 가나다 님인지 확인해 주세요.");
    expect(photoButton()?.disabled).toBe(false);
  });

  it("못 읽으면 칸은 그대로 두고 까닭을 적는다", async () => {
    render({ defaultValue: "555" });
    pick();
    await finish({ kind: "none" });
    expect(field().value).toBe("555");
    expect(text()).toContain("QR 을 찾지 못했어요");
    pick();
    await finish({ kind: "other" });
    expect(text()).toContain("GS 편의점 택배 접수증의 QR 이 아니에요");
  });

  it("다른 주문에 이미 들어간 번호면 알린다 — 읽은 번호도, 직접 적은 번호도", async () => {
    render();
    pick();
    await finish({ kind: "ok", tracking: "123456789012" });
    expect(text()).toContain("이 번호는 주문 #11 (라마바) 에도 들어가 있어요");
    // 직접 고치면 읽은 결과 글은 지우고, 다른 번호면 알림도 사라진다
    act(() => {
      const el = field();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(el, "999999999999");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(field().value).toBe("999999999999");
    expect(text()).not.toContain("운송장번호를 넣었어요");
    expect(text()).not.toContain("에도 들어가 있어요");
  });

  it("그 주문 자기 번호는 알리지 않는다 · 현장수령(photo=false)은 버튼이 없다", () => {
    render({ orderId: 11, defaultValue: "123456789012" });
    expect(text()).not.toContain("에도 들어가 있어요");
    act(() => root!.unmount());
    host!.innerHTML = "";
    root = createRoot(host!);
    render({ photo: false });
    expect(photoButton()).toBeUndefined();
    expect(fileInput()).toBeNull();
  });

  it("읽는 중에 다른 사진을 고르면 앞 사진의 결과는 버린다", async () => {
    render();
    pick("a.jpg");
    const first = h.next!;
    // 버튼은 잠겨 있어도 파일 칸으로 다시 고를 수 있다(PC 끌어 놓기 등) — 늦게 끝난 앞 결과가 뒤 결과를 덮지 않게
    pick("b.jpg");
    await finish({ kind: "ok", tracking: "222233334444" });
    await act(async () => {
      first({ kind: "ok", tracking: "111100001111" });
      for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0));
    });
    expect(field().value).toBe("222233334444");
  });
});
