// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { act, createElement as h, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { submitWithoutReset } from "./form-submit";

/**
 * React 19 의 `<form action>` 은 action 이 끝나면 폼을 초기화한다 — 상태로 쥔 라디오 · 체크 · 고르기 칸은 화면 상태는 그대로인데
 * DOM 이 처음 모양으로 돌아가 다음 보낼 때 처음 값이 실렸다 (2026-10-29 전체 점검 — 스터디 공개 상태 · 등급 · 수강 방식 · 담당 강사).
 * 실제로 그려서 눌러 본다: 고치기 전 꼴은 처음 값이 실리고, `submitWithoutReset` 은 고른 값이 남는다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

/** 공개 상태 라디오(상태로 쥠) + 고르는 칸(처음 값) — 스터디 설정 · 반 수정 폼의 꼴 */
function makeForm(useHelper: boolean, sent: FormData[]) {
  return function Form() {
    const [status, setStatus] = useState("draft");
    const [, action] = useActionState<number, FormData>(async (n, fd) => {
      sent.push(fd);
      await new Promise((r) => setTimeout(r, 5));
      return n + 1;
    }, 0);
    return h(
      "form",
      { action, ...(useHelper ? { onSubmit: submitWithoutReset(action) } : {}) },
      ...["draft", "open"].map((s) => h("input", { key: s, type: "radio", name: "status", value: s, checked: status === s, onChange: () => setStatus(s) })),
      h("select", { name: "level", defaultValue: "1" }, ["1", "2"].map((o) => h("option", { key: o, value: o }, o))),
      h("button", { type: "submit", name: "go", value: "save" }, "저장"),
      h(Pending),
    );
  };
}

function Pending() {
  const { pending } = useFormStatus();
  return h("span", { id: "pending" }, pending ? "저장 중" : "");
}

async function mount(Form: () => ReturnType<typeof h>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(h(Form)));
  const q = <T extends Element>(s: string) => host!.querySelector(s) as T;
  return q;
}

async function chooseAndSave(q: <T extends Element>(s: string) => T) {
  await act(async () => q<HTMLInputElement>('input[value="open"]').click());
  await act(async () => {
    const sel = q<HTMLSelectElement>("select");
    sel.value = "2";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => q<HTMLButtonElement>("button").click());
  await tick();
}

describe("submitWithoutReset — 고른 값이 남는다", () => {
  it("고치기 전 꼴(<form action> 만): 저장한 뒤 칸이 처음 값으로 돌아가 다음 저장에 처음 값이 실린다", async () => {
    const sent: FormData[] = [];
    const q = await mount(makeForm(false, sent));
    await chooseAndSave(q);
    expect(sent[0].get("status")).toBe("open");
    // 화면 상태는 '신청 받기' 인데 DOM 은 '준비 중' 으로 돌아갔다
    expect(q<HTMLInputElement>('input[value="open"]').checked).toBe(false);
    expect(q<HTMLSelectElement>("select").value).toBe("1");
    await act(async () => q<HTMLButtonElement>("button").click());
    await tick();
    expect(sent[1].get("status")).toBe("draft");
  });

  it("고친 꼴: 저장한 뒤에도 고른 값이 그대로고 다음 저장도 같은 값이다 · 누른 버튼 값도 실린다", async () => {
    const sent: FormData[] = [];
    const q = await mount(makeForm(true, sent));
    await chooseAndSave(q);
    expect(sent[0].get("status")).toBe("open");
    expect(sent[0].get("level")).toBe("2");
    expect(sent[0].get("go")).toBe("save");
    expect(q<HTMLInputElement>('input[value="open"]').checked).toBe(true);
    expect(q<HTMLSelectElement>("select").value).toBe("2");
    await act(async () => q<HTMLButtonElement>("button").click());
    await tick();
    expect(sent[1].get("status")).toBe("open");
    expect(sent[1].get("level")).toBe("2");
  });

  it("보내는 동안 버튼의 '…하는 중'(useFormStatus)은 그대로 켜진다", async () => {
    const sent: FormData[] = [];
    const q = await mount(makeForm(true, sent));
    await act(async () => q<HTMLButtonElement>("button").click());
    expect(q("#pending").textContent).toBe("저장 중");
    await tick();
    expect(q("#pending").textContent).toBe("");
  });
});

describe("이 꼴에 걸리던 폼 — 보내기를 직접 한다 (2026-10-29)", () => {
  const root = path.resolve(__dirname, "../..");
  const FORMS = [
    "src/components/admin/studies/StudyKindCard.tsx", // 공개 상태 라디오 · 시간대 레벨
    "src/components/admin/sections/SectionEditForm.tsx", // 담당 강사
    "src/components/admin/sections/CreateSectionForm.tsx",
    "src/components/admin/sections/NewCourseForm.tsx", // 강좌 유형
    "src/components/admin/sections/SessionLiveLinkForm.tsx", // 다시보기 스위치
    "src/components/admin/students/RoleSelect.tsx",
    "src/components/admin/students/TestRoleSelect.tsx",
    "src/components/admin/students/EnrollmentEditor.tsx", // 반 배정의 수강 방식
    "src/components/admin/students/ProfileEditor.tsx",
    "src/app/admin/verifications/[id]/DecisionForms.tsx", // 승인의 수강 방식 · 배정 수정
    "src/app/my/profile/ProfileForm.tsx",
    "src/components/my/IdentityConfirmForm.tsx",
    "src/components/my/study/StudyLevelPanel.tsx",
    "src/app/(public)/study/StudySignupButton.tsx",
  ];
  it.each(FORMS)("%s", (rel) => {
    expect(fs.readFileSync(path.join(root, rel), "utf8")).toMatch(/onSubmit=\{submitWithoutReset\(/);
  });

  it("버튼마다 다른 서버 액션(formAction)을 단 폼이 없다 — 있으면 이 도우미가 폼의 action 으로 보내 버린다", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".tsx") && fs.readFileSync(p, "utf8").includes("formAction=")) hits.push(path.relative(root, p));
      }
    };
    walk(path.join(root, "src"));
    expect(hits).toEqual([]);
  });

  it("테스트 등급 띠 — 등급이 바뀌면 폼을 새로 그린다 (고르는 칸에 옛 등급이 남지 않게)", () => {
    expect(fs.readFileSync(path.join(root, "src/components/layout/TestModeBanner.tsx"), "utf8")).toContain("<form key={profile.test_role} action={switchMyTestRole}");
  });

  it("스터디 레벨 칸 — 요청 상태가 바뀌면 새로 그린다 (취소 · 결정 뒤 '변경을 요청했어요' 가 다시 서지 않게)", () => {
    const page = fs.readFileSync(path.join(root, "src/app/my/study/page.tsx"), "utf8");
    expect(page).toMatch(/key=\{`\$\{s\.id\}-\$\{s\.requested_level \?\? ""\}-\$\{s\.requested_at \?\? ""\}-\$\{s\.request_result \?\? ""\}-\$\{s\.request_decided_at \?\? ""\}`\}/);
  });
});
