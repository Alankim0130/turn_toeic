// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * 파일을 저장소에 올린 뒤 서버에 등록하는 화면 (2026-10-29 점검).
 * 등록 요청을 **보낸 뒤** 끊기면(응답을 못 받음) 서버는 이미 저장했을 수 있다 — 예전에는 그때도 올린 파일을 지워서
 * 저장된 숙제 · 인증 · 음원 · 표지가 깨졌다 (학생은 '제출하지 못했어요' 를 보고 다시 냈다). 보내기 전에 끊긴 것만 지운다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ removed: [] as string[][], refresh: 0, mode: "throw" as "throw" | "error" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => void (h.refresh += 1), push() {} }) }));
vi.mock("@/lib/upload-client", () => ({
  uploadFile: async (_b: string, p: string, f: File) => ({ path: p, name: f.name, size: f.size, type: f.type }),
  removeUploaded: async (_b: string, paths: string[]) => void h.removed.push(paths),
}));
vi.mock("@/app/my/homework/actions", () => ({
  submitHomework: async () => {
    if (h.mode === "throw") throw new TypeError("Failed to fetch");
    return { ok: false, error: "제출하지 못했어요. 잠시 후 다시 시도해 주세요." };
  },
}));

const { HomeworkUploadForm } = await import("@/components/my/homework/HomeworkUploadForm");

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeEach(() => {
  h.removed = [];
  h.refresh = 0;
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
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

async function submitOnePhoto() {
  await act(async () => root!.render(createElement(HomeworkUploadForm, { userId: "u1", level: 650, subject: "rc", classDate: "2026-10-28" })));
  const input = host!.querySelector<HTMLInputElement>('input[type="file"][accept*="image"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "p.jpg", { type: "image/jpeg" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await act(async () => host!.querySelector("form")!.requestSubmit());
  await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
}

describe("숙제 제출 — 보낸 뒤 끊기면 올린 사진을 지우지 않는다", () => {
  it("응답을 못 받으면 지우지 않고, 목록을 새로 받아 확인하게 한다", async () => {
    h.mode = "throw";
    await submitOnePhoto();
    expect(h.removed).toEqual([]);
    expect(h.refresh).toBe(1);
    expect(host!.textContent).toContain("제출됐는지 확인하지 못했어요");
  });

  it("서버가 거절했으면(저장 안 됨) 예전처럼 지운다", async () => {
    h.mode = "error";
    await submitOnePhoto();
    expect(h.removed).toHaveLength(1);
  });
});

describe("같은 꼴의 다른 화면 — 등록을 보낸 뒤면 지우지 않는다", () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  it.each([
    ["components/my/study/CheckinPanel.tsx", "submitStudyCheckin("],
    ["components/admin/lc-audio/AudioDays.tsx", "setAudioTracks("],
    ["components/admin/lc-audio/BookEditorCard.tsx", "setBookCover("],
    ["components/admin/class-materials/ClassMaterialUpload.tsx", "saveClassMaterial("],
    ["components/admin/class-materials/ClassMaterialRow.tsx", "saveClassMaterial("],
    ["components/admin/class-notices/NoticeForm.tsx", "saveClassNotice("],
    ["components/admin/board/StaffPostForm.tsx", "saveStaffPost("],
  ])("%s", (rel, call) => {
    const src = read(rel);
    // 보내기 바로 전에 sent 를 켠다 · catch 는 sent 면 지우지 않는다
    expect(src).toMatch(new RegExp(`sent = true;[\\s\\S]{0,120}${call.replace("(", "\\(")}`));
    expect(src).toMatch(/catch \([a-z]+\) \{[\s\S]{0,400}(if \(sent\)|!sent\))/);
  });
});
