// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * 주소의 물음표 뒤만 바뀌는 이동(?date= · ?term= · ?level=)은 Next 가 같은 화면으로 보아 클라이언트 조각을 다시 만들지 않는다 —
 * 앞 화면에서 고른 것 · 쓰던 글이 남아 **보이지 않는 채 다음 화면의 것으로 보내졌다** (2026-10-29 점검).
 *  - 결석 알림: 10월 14일의 '결석 안내' 글과 고른 학생이 남아 '다음날 ›' 뒤에 15일로 보내졌다
 *  - 담당 강사 지정: 앞 달에서 고른 반이 보이지 않는 채 남아 '적용' 이 앞 달 반의 담당을 바꿨다
 *  - 비대면 인증 독촉 · 새 반 개설: 앞 화면의 고른 학생 · 칸 수가 남았다
 *  - 자동 알림 설정: 처음 받은 값이 칸에 남아, 다른 선생님이 바꾼 시각을 '저장' 이 되돌렸다
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");

describe("물음표 뒤가 바뀌면 새로 그린다 (key)", () => {
  it.each([
    ["app/admin/attendance/page.tsx", "<AbsenceNotice\n        key={date}"],
    ["app/admin/sections/instructors/page.tsx", "<AssignInstructor\n              key={term.id}"],
    ["app/admin/study-checkins/page.tsx", '<CheckinRoster\n        key={`${termKey}-${levelFilter ?? "all"}`}'],
    ["app/admin/sections/new/page.tsx", "<BulkCreateSections\n                  key={term.id}"],
  ])("%s", (rel, snippet) => {
    expect(read(rel)).toContain(snippet);
  });
});

describe("다시보기 등록 — 강사 · 관리자는 모든 반을 고친다 (DB 의 can_manage_section 과 같은 집합)", () => {
  it("열람만은 강사 · 관리자가 아닐 때뿐이다", () => {
    const page = read("app/admin/replays/page.tsx");
    expect(page).toContain("const canManage = selected ? isAdmin(profile.role) || selected.instructor_id === user.id : false;");
    expect(page).not.toContain('profile.role === "admin" || selected.instructor_id');
  });
});

const h = vi.hoisted(() => ({ saved: [] as unknown[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/app/admin/homework/missing/actions", () => ({
  saveHomeworkMissingAuto: async (v: unknown) => (h.saved.push(v), { ok: true, message: "저장했어요." }),
}));

const { MissingAutoCard } = await import("@/components/admin/homework/MissingAutoCard");

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeEach(() => {
  h.saved = [];
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

const ready = (enabled: boolean, hour: string, minute: string) => ({ kind: "ready" as const, enabled, hour, minute, next: null, nextSoon: false, last: null, lastSent: null, changed: null });

describe("자동 알림 설정 — 저장된 값이 바뀌면 칸도 따라간다", () => {
  it("다른 선생님이 바꾼 값이 들어오면 칸이 그 값이 된다 (그대로 저장해도 되돌리지 않는다)", async () => {
    await act(async () => root!.render(createElement(MissingAutoCard, { view: ready(false, "21", "00"), canEdit: true })));
    await act(async () => root!.render(createElement(MissingAutoCard, { view: ready(true, "19", "30"), canEdit: true })));
    const [hour, minute] = host!.querySelectorAll("select");
    expect((host!.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect((hour as HTMLSelectElement).value).toBe("19");
    expect((minute as HTMLSelectElement).value).toBe("30");
  });

  it("읽지 못한 채 열렸다가 읽히면 읽은 값으로", async () => {
    await act(async () => root!.render(createElement(MissingAutoCard, { view: { kind: "unreadable" }, canEdit: true })));
    await act(async () => root!.render(createElement(MissingAutoCard, { view: ready(true, "22", "15"), canEdit: true })));
    expect((host!.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect((host!.querySelectorAll("select")[0] as HTMLSelectElement).value).toBe("22");
  });
});
