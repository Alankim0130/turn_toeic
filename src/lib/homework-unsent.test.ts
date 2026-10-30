// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { HomeworkDay, HomeworkMonth } from "@/components/my/homework/HomeworkCalendar";

/**
 * 숙제업로드 — **고른 사진은 아직 제출이 아니다** (2026-10-30 문라경 학생 "분명 제출하고 확인했는데 그 이후에 들어갔을 때 제출란에 아무것도 없었습니다").
 * 사진을 고르면 번호 붙은 칸이 서서 올라간 것처럼 보이는데 제출 버튼은 한 화면 아래였고, 그대로 다른 과목 · 날짜를 누르면 고른 사진이 아무 말 없이 사라졌다.
 * 진짜 올리기 폼과 달력을 그려 눌러 본다 (서버 액션 · 저장소만 가짜):
 *  - 고르면 제출 버튼이 바닥에 붙는 막대가 되고 "아직 제출 전이에요" · 창을 닫으면 묻는다
 *  - 고른 채 다른 과목 · 날짜 · 달을 누르면 묻고, 아니요면 그대로 남는다
 *  - 올리는 중에는 날짜 · 과목을 바꾸지 않는다
 *  - 내면 그 날짜 · 과목으로 "냈어요" 가 선다
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  submit: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/app/my/homework/actions", () => ({
  submitHomework: hoisted.submit,
  deleteHomeworkSubmission: async () => ({ ok: true }),
}));
vi.mock("@/lib/upload-client", () => ({ uploadFile: hoisted.upload, removeUploaded: hoisted.remove }));
// 녹음 칸은 이 테스트의 대상이 아니다
vi.mock("@/components/my/homework/HomeworkRecorder", () => ({ HomeworkRecorder: () => null }));

const { HomeworkCalendar } = await import("@/components/my/homework/HomeworkCalendar");
const { HomeworkUploadForm } = await import("@/components/my/homework/HomeworkUploadForm");

let root: Root | null = null;
let host: HTMLElement | null = null;
let confirmSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => undefined;
  confirmSpy = vi.fn(() => false);
  window.confirm = confirmSpy as unknown as typeof window.confirm;
  hoisted.submit.mockReset();
  hoisted.upload.mockReset();
  hoisted.remove.mockReset();
  hoisted.upload.mockImplementation(async (_b: string, path: string, file: File, type: string) => ({ path, name: file.name, size: file.size, type }));
  hoisted.submit.mockImplementation(async () => ({ ok: true, id: 77 }));
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const days: HomeworkDay[] = [
  { date: "2026-10-27", course: "750+ 유형마스터", levels: [750], due: "2026-10-29", overdue: true },
  { date: "2026-10-28", course: "750+ 유형마스터", levels: [750], due: "2026-10-30", overdue: false },
];
const months: HomeworkMonth[] = [
  { year: 2026, month: 10, marks: days.map((d) => ({ date: d.date, track: "ttf", label: "750" })), initial: "2026-10-27" },
  { year: 2026, month: 11, marks: [], initial: null },
];

function renderCalendar() {
  act(() => root!.render(h(HomeworkCalendar, { userId: "u1", today: "2026-10-28", months, days, submissions: [], startIndex: 0 })));
}
const text = () => host!.textContent ?? "";
const buttons = () => [...host!.querySelectorAll("button")];
const button = (label: string) => buttons().find((b) => (b.textContent ?? "").includes(label) || b.getAttribute("aria-label") === label);
const click = (el: Element | undefined) => act(() => (el as HTMLElement).click());
const photoInput = () => host!.querySelector<HTMLInputElement>('input[type=file][accept="image/*"]')!;
function pickPhotos(n: number) {
  const input = photoInput();
  const files = Array.from({ length: n }, (_, i) => new File([new Uint8Array(10)], `p${i + 1}.jpg`, { type: "image/jpeg" }));
  Object.defineProperty(input, "files", { configurable: true, value: files });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const bar = () => host!.querySelector("[data-submit-bar]");
const uploadTarget = () => (text().match(/(RC|LC) 숙제 올리기/) ?? [])[1] ?? null;
/** 창을 닫을 때 브라우저가 묻는가 — beforeunload 를 막으면 묻는다 */
function unloadBlocked() {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

describe("올리기 폼 — 고른 파일은 아직 제출 전이다", () => {
  it("고르기 전에는 막대가 아니고, 고르면 바닥에 붙는 막대 + '아직 제출 전이에요' · 창을 닫으면 묻는다", () => {
    const states: string[] = [];
    act(() =>
      root!.render(h(HomeworkUploadForm, { userId: "u1", level: 750, subject: "lc", classDate: "2026-10-27", onStateChange: (s: string) => void states.push(s) })),
    );
    expect(bar()).toBeNull();
    expect(text()).not.toContain("아직 제출 전이에요");
    expect(unloadBlocked()).toBe(false);

    pickPhotos(2);
    expect(bar()?.className).toContain("bar-above-nav");
    expect(text()).toContain("아직 제출 전이에요");
    expect(button("숙제 제출하기")?.textContent).toContain("10/27(화) 750 · LC");
    expect(unloadBlocked()).toBe(true);
    expect(states.at(-1)).toBe("picked");

    // 다 빼면 처음으로
    click(buttons().find((b) => b.getAttribute("aria-label") === "사진 1 빼기"));
    click(buttons().find((b) => b.getAttribute("aria-label") === "사진 1 빼기"));
    expect(bar()).toBeNull();
    expect(unloadBlocked()).toBe(false);
    expect(states.at(-1)).toBe("idle");
  });

  it("질문 칸은 없고 '개인톡으로' 안내만 선다 (2026-10-30)", () => {
    act(() => root!.render(h(HomeworkUploadForm, { userId: "u1", level: 750, subject: "lc", classDate: "2026-10-27" })));
    expect(document.querySelector("textarea")).toBeNull();
    expect(text()).toContain("질문이나 문의사항은 개인톡으로 보내주세요~");
  });

  it("오류 글도 막대 안에 선다 (위로 올려 둔 학생도 본다)", async () => {
    hoisted.submit.mockImplementation(async () => ({ ok: false, error: "올린 파일을 찾을 수 없어요. 다시 시도해 주세요." }));
    act(() => root!.render(h(HomeworkUploadForm, { userId: "u1", level: 750, subject: "lc", classDate: "2026-10-27" })));
    pickPhotos(1);
    await act(async () => {
      button("숙제 제출하기")!.click();
    });
    expect(bar()?.querySelector("[role=alert]")?.textContent).toContain("올린 파일을 찾을 수 없어요");
  });
});

describe("숙제 달력 — 고른 것을 안 냈으면 바꾸기 전에 묻는다", () => {
  it("LC 사진을 고른 채 RC 제출을 누르면 묻고, 아니요면 LC 와 고른 사진이 그대로다", () => {
    renderCalendar();
    click(button("LC 제출"));
    pickPhotos(3);
    click(button("RC 제출"));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(String(confirmSpy.mock.calls[0][0])).toContain("아직 내지 않은 숙제가 있어요");
    expect(uploadTarget()).toBe("LC");
    expect(text()).toContain("3 / 30");

    // 네 → RC 로 바뀌고 고른 사진은 없다
    confirmSpy.mockReturnValue(true);
    click(button("RC 제출"));
    expect(uploadTarget()).toBe("RC");
    expect(text()).toContain("0 / 30");
  });

  it("고른 채 다른 날짜 · 다음 달을 눌러도 묻는다 — 아니요면 그대로", () => {
    renderCalendar();
    click(button("LC 제출"));
    pickPhotos(1);
    // 달력의 28일 칸
    click(buttons().find((b) => (b.textContent ?? "").trim().startsWith("28")));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(text()).toContain("10월 27일");
    expect(uploadTarget()).toBe("LC");
    click(button("다음달"));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(text()).toContain("2026년 10월");
  });

  it("고른 것이 없으면 묻지 않고 바꾼다", () => {
    renderCalendar();
    click(button("LC 제출"));
    click(button("RC 제출"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(uploadTarget()).toBe("RC");
  });

  it("올리는 중에는 날짜 · 과목 · 달을 바꾸지 않는다 (묻지도 않는다)", async () => {
    let release: (v: unknown) => void = () => undefined;
    hoisted.upload.mockImplementation(() => new Promise((r) => (release = r)));
    renderCalendar();
    click(button("LC 제출"));
    pickPhotos(1);
    await act(async () => {
      button("숙제 제출하기")!.click();
    });
    expect(text()).toContain("올리는 중");
    expect(button("RC 제출")?.hasAttribute("disabled")).toBe(true);
    expect(button("다음달")?.hasAttribute("disabled")).toBe(true);
    click(buttons().find((b) => (b.textContent ?? "").trim().startsWith("28")));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(uploadTarget()).toBe("LC");
    await act(async () => {
      release({ path: "u1/750-lc/a.jpg", name: "p1.jpg", size: 10, type: "image/jpeg" });
    });
  });

  it("내면 그 날짜 · 과목으로 '냈어요' 가 서고, 다른 날짜를 누르면 사라진다", async () => {
    renderCalendar();
    click(button("LC 제출"));
    pickPhotos(2);
    await act(async () => {
      button("숙제 제출하기")!.click();
    });
    expect(hoisted.submit).toHaveBeenCalledWith(expect.objectContaining({ classDate: "2026-10-27", level: 750, subject: "lc" }));
    expect(host!.querySelector("[role=status]")?.textContent).toContain("10월 27일 수업 · 750 · LC 숙제를 냈어요");
    expect(uploadTarget()).toBeNull();
    expect(unloadBlocked()).toBe(false);
    // 낸 뒤에는 묻지 않고 바꾼다
    click(buttons().find((b) => (b.textContent ?? "").trim().startsWith("28")));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(host!.querySelector("[role=status]")).toBeNull();
  });
});
