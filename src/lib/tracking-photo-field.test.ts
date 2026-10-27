// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LabelRead, UsedTracking } from "@/lib/tracking-label";

/**
 * 교재주문의 송장번호 칸 + **QR 찍기** (2026-10-27 Alan — "해당학생 송장번호 기입하는 곳에 사진촬영 버튼을 하나 만들어주면 좋겠어" →
 * 같은 날 "사진을 찍어서 올리는게 아니라 그냥 카메라를 틀어서 qr이 인식이되면 카메라가 꺼지면서 바로 송장번호가 기입되는걸로").
 * 실제로 그려서 누른다 — 카메라(getUserMedia) · 영상 한 장 읽기(`makeFrameReader`) · 사진 읽기(`readLabelPhoto`)는 가짜로 바꾸고 테스트가 정한다.
 * 카메라 창은 폼 밖에 열리고 · 접수증 QR 이 비치면 카메라를 끄고 번호를 넣고 · 다른 QR 은 알려 주고 계속 비추고 · 카메라를 못 켜면 사진으로 읽고 ·
 * 닫거나 다른 앱으로 가면 카메라를 끈다. 사진 · 영상은 폼에 실리지 않는다 · 다른 주문의 번호면 알린다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type FakeTrack = { stop: ReturnType<typeof vi.fn> };

const h = vi.hoisted(() => ({
  files: [] as Blob[],
  next: null as null | ((r: LabelRead) => void),
  /** 카메라가 읽을 영상 — 한 장에 QR 글자 목록. 다 읽으면 빈 장 */
  frames: [] as string[][],
  reads: 0,
}));

vi.mock("@/components/admin/textbook-orders/read-label-photo", () => ({
  readLabelPhoto: (file: Blob) => {
    h.files.push(file);
    return new Promise<LabelRead>((resolve) => {
      h.next = resolve;
    });
  },
}));

vi.mock("@/components/admin/textbook-orders/label-camera-reader", () => ({
  makeFrameReader: async () => async () => {
    h.reads++;
    return h.frames.shift() ?? [];
  },
}));

const { TrackingNoField } = await import("@/components/admin/textbook-orders/TrackingNoField");

/** 실물과 같은 꼴의 접수증 QR 글자 (번호는 지어낸 것) */
const labelQr = (tracking: string, day = "28") => `POSTBOX;1${tracking}${day}12345;21820033000000000007;30000000000000000097;`;

let root: Root | null = null;
let host: HTMLElement | null = null;
let form: HTMLFormElement | null = null;
let tracks: FakeTrack[] = [];
let getUserMedia: ReturnType<typeof vi.fn>;

function fakeStream() {
  const track: FakeTrack = { stop: vi.fn() };
  tracks.push(track);
  return { getTracks: () => [track] } as unknown as MediaStream;
}

beforeEach(() => {
  h.files = [];
  h.next = null;
  h.frames = [];
  h.reads = 0;
  tracks = [];
  getUserMedia = vi.fn(async () => fakeStream());
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  // jsdom 은 영상을 틀지 못한다
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
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
  vi.restoreAllMocks();
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
const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
const dialogText = () => dialog()?.textContent ?? "";
const field = () => host!.querySelector<HTMLInputElement>('input[name="tracking_no"]')!;
const fileInput = () => host!.querySelector<HTMLInputElement>('input[type="file"]');
const buttons = (scope: ParentNode) => [...scope.querySelectorAll("button")];
const qrButton = () => buttons(host!).find((b) => b.textContent?.includes("QR 찍기") || b.textContent?.includes("읽는 중"));
const dialogButton = (label: string) => buttons(dialog()!).find((b) => b.textContent?.trim() === label || b.textContent?.includes(label));
const click = (el: HTMLElement | undefined) => act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

/** 조건이 맞을 때까지 기다린다 — 카메라는 150ms 마다 한 장씩 읽는다 */
async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("기다려도 그렇게 되지 않았어요");
    await act(async () => {
      await new Promise((res) => setTimeout(res, 20));
    });
  }
}

async function openCamera() {
  click(qrButton());
  await until(() => h.reads > 0);
}

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

describe("송장번호 칸 · QR 찍기 — 카메라로 바로 읽기 (2026-10-27 Alan)", () => {
  it("버튼은 폼을 보내지 않고, 카메라 창은 폼 밖에 열리며, 사진 · 영상은 폼에 실리지 않는다", async () => {
    render();
    expect(qrButton()?.type).toBe("button");
    expect(dialog()).toBeNull();
    await openCamera();
    expect(dialog()).not.toBeNull();
    expect(form!.contains(dialog())).toBe(false);
    expect(dialogText()).toContain("접수증 QR 찍기");
    expect(dialogText()).toContain("가나다 님 접수증의 오른쪽 위 QR");
    for (const b of buttons(dialog()!)) expect(b.type, b.textContent ?? "").toBe("button");
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    const input = fileInput()!;
    expect(input.getAttribute("capture")).toBe("environment");
    expect(input.hasAttribute("name")).toBe(false);
    expect([...new FormData(form!).keys()]).toEqual(["tracking_no"]);
  });

  it("접수증 QR 이 비치면 카메라를 끄고 창을 닫고 번호를 넣는다 — 다른 QR 은 알려 주고 계속 비춘다", async () => {
    render();
    await openCamera();
    h.frames.push(["https://winnertoeic.com/attend?t=abcdefghijklmnopqrst"]);
    await until(() => dialogText().includes("GS 편의점 택배 접수증의 QR 이 아니에요"));
    expect(tracks[0].stop).not.toHaveBeenCalled();
    expect(field().value).toBe("");
    h.frames.push([], [labelQr("987654321098")]);
    await until(() => dialog() === null);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(field().value).toBe("987654321098");
    expect(new FormData(form!).get("tracking_no")).toBe("987654321098");
    expect(text()).toContain("운송장번호를 넣었어요. 접수증의 받는사람이 가나다 님인지 확인해 주세요.");
    // 저절로 저장하지 않는다 — 폼은 그대로다 (배송완료는 조교가 누른다)
    const reads = h.reads;
    await act(async () => {
      await new Promise((res) => setTimeout(res, 400));
    });
    expect(h.reads).toBe(reads);
  });

  it("접수증 QR 이 둘 보이면(번호가 다르면) 넣지 않고 한 장만 비추라고 한다", async () => {
    render({ defaultValue: "555" });
    await openCamera();
    h.frames.push([labelQr("111122223333"), labelQr("444455556666")]);
    await until(() => dialogText().includes("접수증 QR 이 두 개 보여요"));
    expect(field().value).toBe("555");
    expect(tracks[0].stop).not.toHaveBeenCalled();
    h.frames.push([labelQr("111122223333")]);
    await until(() => dialog() === null);
    expect(field().value).toBe("111122223333");
  });

  it("다른 주문에 이미 들어간 번호면 알린다 — 카메라로 읽은 번호도, 직접 고친 번호도", async () => {
    render();
    await openCamera();
    h.frames.push([labelQr("123456789012")]);
    await until(() => dialog() === null);
    expect(text()).toContain("이 번호는 주문 #11 (라마바) 에도 들어가 있어요");
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

  it("닫기 · ESC 로 닫으면 카메라를 끈다 — 켜지는 중에 닫아도 늦게 켜진 카메라를 끈다", async () => {
    render();
    await openCamera();
    click(dialogButton("닫기"));
    expect(dialog()).toBeNull();
    expect(tracks[0].stop).toHaveBeenCalled();

    await openCamera();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(dialog()).toBeNull();
    expect(tracks[1].stop).toHaveBeenCalled();

    // 허락을 기다리는 동안 닫는다
    let resolve: (s: MediaStream) => void = () => {};
    getUserMedia.mockImplementationOnce(() => new Promise<MediaStream>((r) => (resolve = r)));
    click(qrButton());
    expect(dialog()).not.toBeNull();
    click(dialogButton("닫기"));
    await act(async () => {
      resolve(fakeStream());
      await new Promise((res) => setTimeout(res, 0));
    });
    expect(tracks[2].stop).toHaveBeenCalled();
  });

  it("다른 앱으로 가면 카메라를 끄고, '카메라 다시 켜기' 로 다시 켠다", async () => {
    render();
    await openCamera();
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(dialogText()).toContain("카메라를 껐어요");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const before = h.reads;
    click(dialogButton("카메라 다시 켜기"));
    await until(() => h.reads > before);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("카메라 권한을 거절하면 까닭을 적고 — 사진으로 읽기를 누르면 창을 닫고 사진 고르기를 연다", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("거절", "NotAllowedError"));
    render();
    click(qrButton());
    await until(() => dialogText().includes("카메라 권한이 꺼져 있어요"));
    let opened = 0;
    fileInput()!.addEventListener("click", () => opened++);
    click(dialogButton("사진으로 읽기"));
    expect(dialog()).toBeNull();
    expect(opened).toBe(1);
    const file = pick();
    expect(h.files).toEqual([file]);
    expect(text()).toContain("접수증을 읽는 중…");
    expect(qrButton()?.disabled).toBe(true);
    await finish({ kind: "ok", tracking: "987654321098" });
    expect(field().value).toBe("987654321098");
    expect(text()).toContain("운송장번호를 넣었어요. 접수증의 받는사람이 가나다 님인지 확인해 주세요.");
    expect(qrButton()?.disabled).toBe(false);
  });

  it("카메라가 없는 브라우저는 사진으로만 — 다시 켜기 버튼이 없다 · 비추는 중에도 '잘 안 되면 사진으로 읽기'", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    render();
    click(qrButton());
    await until(() => dialogText().includes("이 기기에서는 카메라를 켤 수 없어요"));
    expect(dialogButton("카메라 다시 켜기")).toBeUndefined();
    expect(dialogButton("사진으로 읽기")).toBeDefined();
    click(dialogButton("닫기"));

    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    await openCamera();
    let opened = 0;
    fileInput()!.addEventListener("click", () => opened++);
    click(dialogButton("잘 안 되면 사진으로 읽기"));
    expect(dialog()).toBeNull();
    expect(opened).toBe(1);
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it("사진으로 읽다가 못 읽으면 칸은 그대로 두고 까닭을 적는다", async () => {
    render({ defaultValue: "555" });
    pick();
    await finish({ kind: "none" });
    expect(field().value).toBe("555");
    expect(text()).toContain("QR 을 찾지 못했어요");
    pick();
    await finish({ kind: "other" });
    expect(text()).toContain("GS 편의점 택배 접수증의 QR 이 아니에요");
  });

  it("그 주문 자기 번호는 알리지 않는다 · 현장수령(photo=false)은 버튼이 없다", () => {
    render({ orderId: 11, defaultValue: "123456789012" });
    expect(text()).not.toContain("에도 들어가 있어요");
    act(() => root!.unmount());
    host!.innerHTML = "";
    root = createRoot(host!);
    render({ photo: false });
    expect(qrButton()).toBeUndefined();
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
