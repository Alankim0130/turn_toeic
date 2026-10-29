// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { HomeworkDay, HomeworkMonth } from "@/components/my/homework/HomeworkCalendar";

/**
 * 숙제업로드 달력 (2026-10-30 문라경 학생 — 지난 수업 숙제가 다음 수업일 날짜로 저장돼 미제출 알림이 갔다). 실제로 그려 눌러 본다:
 *  - 아직 오지 않은 수업 날짜에는 RC · LC 제출 칸이 없고 "아직 수업 전이에요" 가 선다
 *  - 지난 수업 날짜는 그대로 낸다 (올리기 폼에 그 날짜가 간다)
 *  - 오늘 첫 수업이 시작 전이면 "지난 수업 숙제라면 그 수업 날짜를" 이 선다
 *  - 예전에 아직 오지 않은 날짜로 낸 숙제가 있으면 다시 내라는 안내가 선다
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/app/my/homework/actions", () => ({ deleteHomeworkSubmission: async () => ({ ok: true }) }));
// 올리기 폼은 이 테스트의 대상이 아니다 — 어느 날짜 · 칸으로 열렸는지만 본다
vi.mock("@/components/my/homework/HomeworkUploadForm", () => ({
  HomeworkUploadForm: (p: { classDate: string; level: number; subject: string }) =>
    h("div", { "data-upload": `${p.classDate}|${p.level}|${p.subject}` }),
}));

const { HomeworkCalendar } = await import("@/components/my/homework/HomeworkCalendar");

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeEach(() => {
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

const days: HomeworkDay[] = [
  { date: "2026-10-28", course: "650+ 왕기초반", levels: [650], due: "2026-10-30", overdue: true },
  { date: "2026-10-30", course: "650+ 왕기초반", levels: [650], due: "2026-11-02", overdue: false },
  { date: "2026-11-02", course: "650+ 왕기초반", levels: [650], due: "2026-11-04", overdue: false },
];
const months: HomeworkMonth[] = [
  { year: 2026, month: 10, marks: days.slice(0, 2).map((d) => ({ date: d.date, track: "mwf", label: "650" })), initial: "2026-10-30" },
  { year: 2026, month: 11, marks: [{ date: "2026-11-02", track: "mwf", label: "650" }], initial: "2026-11-02" },
];

function render(props: Partial<Parameters<typeof HomeworkCalendar>[0]> = {}) {
  act(() =>
    root!.render(h(HomeworkCalendar, { userId: "u1", today: "2026-10-31", months, days, submissions: [], startIndex: 0, ...props })),
  );
}
const text = () => host!.textContent ?? "";
const button = (label: string) => [...host!.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label) || b.getAttribute("aria-label") === label);
const click = (el: Element | undefined) => act(() => (el as HTMLElement).click());

describe("숙제업로드 달력 — 어느 수업의 숙제로 내는가", () => {
  it("지난 수업(금요일)은 RC · LC 제출 칸이 있고, 누르면 그 날짜로 올리기 폼이 열린다", () => {
    render();
    expect(text()).not.toContain("아직 수업 전이에요");
    click(button("RC 제출"));
    expect(host!.querySelector("[data-upload]")?.getAttribute("data-upload")).toBe("2026-10-30|650|rc");
  });

  it("아직 오지 않은 수업(다음 주 월요일)에는 제출 칸이 없다", () => {
    render();
    click(button("다음달"));
    expect(text()).toContain("아직 수업 전이에요");
    expect(button("RC 제출")).toBeUndefined();
    expect(button("LC 제출")).toBeUndefined();
    expect(host!.querySelector("[data-upload]")).toBeNull();
  });

  it("오늘 수업이 시작 전이면 지난 수업 날짜를 고르라고 말한다 (제출 칸은 그대로)", () => {
    const today = { date: "2026-11-02", course: "650+ 왕기초반", levels: [650], due: "2026-11-04", overdue: false, startsAt: "10:00" };
    render({ today: "2026-11-02", days: [...days.slice(0, 2), today], startIndex: 1 });
    expect(text()).toContain("오늘 수업은 10:00에 시작해요");
    expect(button("RC 제출")).toBeDefined();
  });

  it("예전에 아직 오지 않은 날짜로 낸 숙제가 있으면 취소하고 그 수업 날짜로 다시 내라고 한다", () => {
    const sub = { id: 9, level: 650, subject: "rc", class_date: "2026-11-02", question: null, status: "submitted", created_at: "2026-10-31T03:00:00Z", checked_at: null, homework_files: [] };
    render({ submissions: [sub], startIndex: 1 });
    expect(text()).toContain("아직 수업 전인 날짜로 낸 숙제예요");
  });
});
