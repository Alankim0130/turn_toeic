// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * 내 정보의 프로필 사진 칸 (2026-10-29 점검). 실제로 그려서 누른다:
 *  - 알림 줄은 마지막으로 한 일의 결과다 — 올린 뒤 지우면 "지웠어요" (예전에는 "바꿨어요" 가 남았다)
 *  - 저장이 실패하면 미리 보기를 거둔다 (예전에는 저장되지 않은 사진이 내 사진처럼 서 있었다)
 *  - 사진 주소가 바뀌면 다시 그린다 (예전에는 한 번 못 받은 뒤로는 새 사진도 빈 이미지였다)
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type State = { error?: string; message?: string };
const h = vi.hoisted(() => ({ save: { message: "프로필 사진을 바꿨어요." } as State, remove: { message: "프로필 사진을 지웠어요." } as State }));

vi.mock("@/app/my/profile/actions", () => ({
  setMyAvatar: async () => h.save,
  removeMyAvatar: async () => h.remove,
}));
vi.mock("@/lib/upload-client", () => ({ uploadFile: async (_b: string, path: string) => ({ path }) }));

const { AvatarEditor } = await import("@/app/my/profile/AvatarEditor");
const { ProfilePhoto } = await import("@/components/layout/ProfilePhoto");

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeEach(() => {
  h.save = { message: "프로필 사진을 바꿨어요." };
  h.remove = { message: "프로필 사진을 지웠어요." };
  URL.createObjectURL = () => "blob:preview";
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

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
const text = () => host!.textContent ?? "";
const img = () => host!.querySelector("img");

async function pick() {
  const input = host!.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(["x"], "me.png", { type: "image/png" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await flush();
}

const button = (label: string) => [...host!.querySelectorAll("button")].find((b) => b.textContent?.includes(label))!;

describe("AvatarEditor — 마지막 결과 하나", () => {
  it("올린 뒤 지우면 '지웠어요' 가 선다 (바꿨어요가 남지 않는다)", async () => {
    await act(async () => root!.render(createElement(AvatarEditor, { uid: "u1", photo: "https://x/old.jpg", uploaded: true, social: false })));
    await pick();
    expect(text()).toContain("프로필 사진을 바꿨어요.");
    expect(img()?.getAttribute("src")).toBe("blob:preview");
    await act(async () => button("사진 지우기").click());
    await flush();
    expect(text()).toContain("프로필 사진을 지웠어요.");
    expect(text()).not.toContain("프로필 사진을 바꿨어요.");
  });

  it("지우기가 실패하면 그 오류가 보인다", async () => {
    h.remove = { error: "사진을 지우지 못했어요. 잠시 후 다시 시도해 주세요." };
    await act(async () => root!.render(createElement(AvatarEditor, { uid: "u1", photo: "https://x/old.jpg", uploaded: true, social: false })));
    await pick();
    await act(async () => button("사진 지우기").click());
    await flush();
    expect(text()).toContain("사진을 지우지 못했어요");
  });

  it("저장이 실패하면 미리 보기를 거두고 원래 사진으로 돌아간다", async () => {
    h.save = { error: "사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
    await act(async () => root!.render(createElement(AvatarEditor, { uid: "u1", photo: "https://x/old.jpg", uploaded: true, social: false })));
    await pick();
    expect(text()).toContain("사진을 저장하지 못했어요");
    expect(img()?.getAttribute("src")).toBe("https://x/old.jpg");
  });
});

describe("ProfilePhoto — 못 받은 것은 그 주소 하나", () => {
  it("한 주소가 깨져도 새 주소는 다시 그린다", async () => {
    await act(async () => root!.render(createElement(ProfilePhoto, { src: "https://x/broken.jpg" })));
    await act(async () => img()!.dispatchEvent(new Event("error")));
    expect(img()).toBeNull(); // 빈 프로필 이미지
    await act(async () => root!.render(createElement(ProfilePhoto, { src: "blob:new" })));
    expect(img()?.getAttribute("src")).toBe("blob:new");
  });
});
