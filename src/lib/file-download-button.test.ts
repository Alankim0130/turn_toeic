// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FileDownloadButton } from "@/components/admin/FileDownloadButton";
import { downloadText, FILE_MESSAGE_HEADER, type FileKind } from "./file-download";

/**
 * 파일 받기 버튼을 실제로 그려서 누른다 (2026-10-16 점검 — 소스 모양만 보던 `file-download.test.ts` 로는 못 잡은 것).
 * - 달 칩 · 보기처럼 물음표 뒤만 바뀌는 이동은 Next 가 버튼을 다시 만들지 않는다 → 주소가 바뀌면 들고 있던 파일 · 안내를 버려야 한다
 *   (예전에는 10월 PDF 를 든 '저장 · 인쇄 창 열기' 가 11월 화면에 남아 누르면 10월 파일이 저장됐다)
 * - 플랫폼 오류(시간 초과 504 등)의 text/plain 원문은 버튼 아래에 띄우지 않는다 — 우리 라우트의 글(`FILE_MESSAGE_HEADER`)만
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

/** 아이폰 사파리처럼 — 첫 저장 창은 '누른 순간' 이 지나 막히고(NotAllowedError) 그 뒤에는 받은 파일 이름을 적는다 */
function fakeIphone(opts: { blockFirst: boolean }) {
  const shared: string[] = [];
  let calls = 0;
  const define = (key: string, value: unknown) => Object.defineProperty(navigator, key, { value, configurable: true });
  define("userAgent", IPHONE);
  define("platform", "iPhone");
  define("maxTouchPoints", 5);
  define("canShare", () => true);
  define("share", async ({ files }: { files: File[] }) => {
    calls += 1;
    if (opts.blockFirst && calls === 1) throw new DOMException("not allowed", "NotAllowedError");
    shared.push(files[0].name);
  });
  return { shared, calls: () => calls };
}

const termOf = (url: string) => new URL(url, "https://winnertoeic.com").searchParams.get("term") ?? "";
const pdfResponse = (term: string) =>
  new Response(`PDF ${term}`, {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`명단_${term}.pdf`)}` },
  });

let root: Root | null = null;
let host: HTMLElement | null = null;
const realFetch = globalThis.fetch;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  globalThis.fetch = realFetch;
});

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
}

const render = (term: string, kind: FileKind = "pdf") =>
  act(() =>
    root!.render(
      createElement(
        FileDownloadButton,
        { href: `/admin/students/roster-${kind}?term=${term}`, fileName: `fallback_${term}.${kind}`, kind, className: "btn" } as ComponentProps<typeof FileDownloadButton>,
        "받기",
      ),
    ),
  );

/** 기다리는 약속들을 다 풀어 준다 (fetch → blob → 저장 창) */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });

const link = () => host!.querySelector("a");
const button = () => host!.querySelector("button");
const note = () => host!.querySelector('[role="status"]')?.textContent ?? "";

describe("FileDownloadButton — 주소가 바뀌면 처음부터", () => {
  it("10월 파일을 들고 있다가 11월로 옮기면 그 파일을 버리고, 다시 누르면 11월 파일을 받는다", async () => {
    const phone = fakeIphone({ blockFirst: true });
    const fetched: string[] = [];
    globalThis.fetch = (async (url: string) => {
      fetched.push(termOf(url));
      return pdfResponse(termOf(url));
    }) as typeof fetch;
    mount();
    await render("2026-10");

    await act(async () => link()!.click());
    await settle();
    // 첫 저장 창은 막혔다 → 만든 10월 파일을 들고 '한 번 더 누르기'
    expect(button()?.textContent).toBe(downloadText("pdf").again);
    expect(note()).toBe(downloadText("pdf").ready);

    // 달 칩을 눌러 11월로 — 같은 조각이 새 주소를 받는다
    await render("2026-11");
    expect(button()).toBeNull();
    expect(link()?.getAttribute("href")).toBe("/admin/students/roster-pdf?term=2026-11");
    expect(link()?.textContent).toBe("받기");
    expect(note()).toBe("");

    await act(async () => link()!.click());
    await settle();
    expect(fetched).toEqual(["2026-10", "2026-11"]);
    expect(phone.shared).toEqual(["명단_2026-11.pdf"]);
  });

  it("만드는 동안 주소가 바뀌면 만들던 파일로 저장 창을 열지 않는다", async () => {
    const phone = fakeIphone({ blockFirst: false });
    let release: (r: Response) => void = () => {};
    globalThis.fetch = (() => new Promise<Response>((resolve) => (release = resolve))) as typeof fetch;
    mount();
    await render("2026-10");

    await act(async () => link()!.click());
    expect(link()?.textContent).toBe(downloadText("pdf").loading);

    await render("2026-11");
    expect(link()?.textContent).toBe("받기");
    // 10월 파일이 이제야 다 만들어졌다
    await act(async () => release(pdfResponse("2026-10")));
    await settle();
    expect(phone.calls()).toBe(0);
    expect(link()?.getAttribute("href")).toBe("/admin/students/roster-pdf?term=2026-11");
  });

  it("오류 안내도 주소가 바뀌면 지운다", async () => {
    fakeIphone({ blockFirst: false });
    globalThis.fetch = (async () =>
      new Response("명단을 다 불러오지 못했어요. 잠시 뒤 다시 받아 주세요.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", [FILE_MESSAGE_HEADER]: "1" },
      })) as typeof fetch;
    mount();
    await render("2026-10");
    await act(async () => link()!.click());
    await settle();
    expect(note()).toBe("명단을 다 불러오지 못했어요. 잠시 뒤 다시 받아 주세요.");

    await render("2026-11");
    expect(note()).toBe("");
  });
});

describe("FileDownloadButton — 버튼 아래에 띄우는 오류 글", () => {
  it("플랫폼 오류(머리 없는 text/plain)의 원문은 띄우지 않고 그 종류의 일반 안내를 띄운다", async () => {
    fakeIphone({ blockFirst: false });
    globalThis.fetch = (async () =>
      new Response("An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT\n\nicn1::abcde", {
        status: 504,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })) as typeof fetch;
    mount();
    await render("2026-10", "docx");
    await act(async () => link()!.click());
    await settle();
    expect(note()).toBe(downloadText("docx").failed);
  });

  it("우리 라우트의 글은 그대로, 글이 비었으면 그 종류(Word)의 안내", async () => {
    fakeIphone({ blockFirst: false });
    let body = "어느 달 명단인지 알 수 없어요. 학생명단 화면에서 다시 받아 주세요.";
    globalThis.fetch = (async () =>
      new Response(body, { status: 400, headers: { "content-type": "text/plain; charset=utf-8", [FILE_MESSAGE_HEADER]: "1" } })) as typeof fetch;
    mount();
    await render("2026-1", "docx");
    await act(async () => link()!.click());
    await settle();
    expect(note()).toBe(body);

    body = "";
    await render("2026-2", "docx");
    await act(async () => link()!.click());
    await settle();
    expect(note()).toBe(downloadText("docx").failed);
  });
});
