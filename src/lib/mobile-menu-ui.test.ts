// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * 햄버거 서랍 (2026-10-29 점검). 주소가 바뀔 때만 닫아서, 지금 보는 화면의 줄(예: /my 에서 '대시보드')을 누르면 서랍이 그대로 남았다.
 * 실제로 그려서 누른다 — 링크를 누르면 닫힌다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({ usePathname: () => "/my", useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
vi.mock("next/link", () => ({
  // 이동은 하지 않는 링크 — 누르는 것만 본다
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest, onClick: (e: { preventDefault(): void }) => e.preventDefault() }, children),
  useLinkStatus: () => ({ pending: false }),
}));
vi.mock("@/app/(auth)/actions", () => ({ signOut: async () => {} }));

const { MobileMenu } = await import("@/components/layout/MobileMenu");

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeEach(() => {
  // 설치 안내 · 새로고침 단추가 보는 것 — jsdom 에는 없다
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
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

const drawer = () => document.getElementById("mobile-menu")!;
const isOpen = () => drawer().className.includes("translate-x-0");

describe("MobileMenu — 링크를 누르면 닫힌다", () => {
  it("지금 보는 화면(/my)으로 가는 줄을 눌러도 닫힌다", async () => {
    const access = { signedIn: true, active: true, enrollee: true, crew: false } as never;
    await act(async () =>
      root!.render(createElement(MobileMenu, { signedIn: true, staff: false, role: "student", name: "김민수", roleLabel: "수강생", access, until: "2026-11-03", opensOn: null })),
    );
    await act(async () => host!.querySelector<HTMLButtonElement>('button[aria-label="메뉴 열기"]')!.click());
    expect(isOpen()).toBe(true);
    const mine = [...drawer().querySelectorAll<HTMLAnchorElement>('a[href="/my"]')][0];
    expect(mine).toBeTruthy();
    await act(async () => mine.click());
    expect(isOpen()).toBe(false);
  });
});
