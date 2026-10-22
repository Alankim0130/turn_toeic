import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { notificationMove, OPEN_MESSAGE, PENDING_MESSAGE } from "./notification-open";

// 2026-10-19 Alan — "불라방 알람이 푸시로 왔을때 클릭하면 해당 불라방페이지로 바로 이어지면 좋겠어!"
// 아이폰 홈 화면 앱은 창이 하나뿐이라 앱이 떠 있으면 서비스 워커의 openWindow 가 그 화면으로 옮기지 못했다.

const ORIGIN = "https://winnertoeic.com";
const LIVE = `${ORIGIN}/my/live`;

describe("notificationMove — 알림을 눌렀을 때 열려 있는 창이 할 일", () => {
  it("이미 그 화면이면 새로 받아 온다 (방금 들어온 불라방 링크가 보이게)", () => {
    expect(notificationMove("/my/live", LIVE, true)).toEqual({ action: "refresh" });
    expect(notificationMove(LIVE, `${LIVE}#top`, false)).toEqual({ action: "refresh" }); // 브라우저 탭이어도 같은 화면이면
  });

  it("홈 화면 앱 창이면 그 자리에서 옮긴다", () => {
    expect(notificationMove("/my/live", `${ORIGIN}/admin`, true)).toEqual({ action: "go", path: "/my/live" });
    expect(notificationMove(`${ORIGIN}/my/homework?d=1#x`, `${ORIGIN}/my`, true)).toEqual({ action: "go", path: "/my/homework?d=1#x" });
  });

  it("브라우저 탭은 옮기지 않는다 — 쓰던 화면을 날리지 않게 새 창을 연다", () => {
    expect(notificationMove("/my/live", `${ORIGIN}/admin/class-materials`, false)).toEqual({ action: "stay" });
  });

  it("다른 사이트 주소 · 읽을 수 없는 주소는 그대로", () => {
    expect(notificationMove("https://evil.example/my/live", `${ORIGIN}/my`, true)).toEqual({ action: "stay" });
    expect(notificationMove("/my/live", "not a url", true)).toEqual({ action: "stay" });
  });
});

type Reply = "ok" | "no" | "silent";
type FakeClient = {
  url: string;
  focused: boolean;
  visibilityState: string;
  focusCalls: number;
  received: unknown[];
  port: MessagePort | null;
  focus: () => Promise<FakeClient>;
  postMessage: (msg: unknown, ports: MessagePort[]) => void;
};

function client(url: string, reply: Reply, extra: Partial<Pick<FakeClient, "focused" | "visibilityState">> = {}): FakeClient {
  const c: FakeClient = {
    url,
    focused: false,
    visibilityState: "visible",
    ...extra,
    focusCalls: 0,
    received: [],
    port: null,
    focus: async () => {
      c.focusCalls++;
      return c;
    },
    postMessage: (msg, ports) => {
      c.received.push(msg);
      c.port = ports[0];
      if (reply !== "silent") c.port.postMessage({ ok: reply === "ok" });
    },
  };
  return c;
}

/** 실제 public/sw.js 를 서비스 워커처럼 돌린다 — 이벤트 처리기를 모으고 창 · 새 창 열기를 흉내 낸다 */
function loadServiceWorker(windows: FakeClient[]) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const opened: string[] = [];
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners[type] = fn;
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => {
        opened.push(url);
        return null;
      },
    },
    registration: { showNotification: async () => undefined },
    skipWaiting: () => undefined,
  };
  // 답을 기다리는 시간(1.5초)은 짧게 — 규칙은 그대로다
  const fastTimeout = (fn: () => void, ms: number) => setTimeout(fn, Math.min(ms, 30));
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL, MessageChannel, setTimeout: fastTimeout, clearTimeout, Date, Promise });

  async function click(url: string | undefined) {
    const waits: Promise<unknown>[] = [];
    listeners.notificationclick({ notification: { close: () => undefined, data: url === undefined ? {} : { url } }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }
  async function askPending(): Promise<unknown> {
    const channel = new MessageChannel();
    const answer = new Promise((resolve) => {
      channel.port1.onmessage = (e) => {
        channel.port1.close();
        resolve((e.data as { url: unknown }).url);
      };
    });
    listeners.message({ data: { type: PENDING_MESSAGE }, ports: [channel.port2] });
    return answer;
  }
  return { opened, click, askPending };
}

describe("public/sw.js — 알림 누르기", () => {
  it("앱이 떠 있으면(홈 화면 앱) 그 창을 불라방 화면으로 옮기고 새 창은 열지 않는다", async () => {
    const app = client(`${ORIGIN}/admin`, "ok");
    const sw = loadServiceWorker([app]);
    await sw.click("/my/live");
    expect(app.received).toEqual([{ type: OPEN_MESSAGE, url: LIVE }]);
    expect(app.focusCalls).toBe(1);
    expect(sw.opened).toEqual([]);
    expect(await sw.askPending()).toBeNull(); // 그 자리에서 옮겼으니 기다리는 주소가 없다
  });

  it("브라우저 탭이 '옮기지 않는다' 고 답하면 예전처럼 새 창을 연다", async () => {
    const tab = client(`${ORIGIN}/admin/class-materials`, "no", { focused: true });
    const sw = loadServiceWorker([tab]);
    await sw.click("/my/live");
    expect(sw.opened).toEqual([LIVE]);
    expect(tab.focusCalls).toBe(0);
  });

  it("이미 그 화면인 창이 있으면 그 창에 묻는다 (다른 창보다 먼저)", async () => {
    const other = client(`${ORIGIN}/my`, "ok", { focused: true });
    const exact = client(LIVE, "ok");
    const sw = loadServiceWorker([other, exact]);
    await sw.click("/my/live");
    expect(exact.received).toHaveLength(1);
    expect(other.received).toHaveLength(0);
    expect(sw.opened).toEqual([]);
  });

  it("이미 그 화면인 옛 창이 답하지 않아도 새 창을 또 열지 않고 앞으로만", async () => {
    const exact = client(LIVE, "silent");
    const sw = loadServiceWorker([exact]);
    await sw.click("/my/live");
    expect(exact.focusCalls).toBe(1);
    expect(sw.opened).toEqual([]);
    exact.port?.close();
  });

  it("앱이 꺼져 있으면 새로 열고, 막 열린 앱 화면이 물으면 한 번만 알려 준다", async () => {
    const sw = loadServiceWorker([]);
    await sw.click("/my/live");
    expect(sw.opened).toEqual([LIVE]);
    expect(await sw.askPending()).toBe(LIVE);
    expect(await sw.askPending()).toBeNull();
  });

  it("답이 늦게 와도 그 창이 옮겼으면 기다리는 주소는 지운다 (나중에 새로고침한 화면이 끌려가지 않게)", async () => {
    const app = client(`${ORIGIN}/my`, "silent");
    const sw = loadServiceWorker([app]);
    await sw.click("/my/live");
    expect(sw.opened).toEqual([LIVE]); // 기다리다 새 창
    app.port?.postMessage({ ok: true }); // 늦게 온 답
    await new Promise((r) => setTimeout(r, 20));
    expect(await sw.askPending()).toBeNull();
  });

  it("다른 사이트 주소는 열지 않는다 — /admin 으로", async () => {
    const sw = loadServiceWorker([]);
    await sw.click("https://evil.example/phish");
    expect(sw.opened).toEqual([`${ORIGIN}/admin`]);
  });

  it("다른 사이트 창에는 묻지 않는다", async () => {
    const foreign = client("https://evil.example/", "ok");
    const sw = loadServiceWorker([foreign]);
    await sw.click("/my/live");
    expect(foreign.received).toEqual([]);
    expect(sw.opened).toEqual([LIVE]);
  });
});

describe("PwaRegister — 서비스 워커의 물음을 받는 쪽", () => {
  const src = readFileSync("src/components/pwa/PwaRegister.tsx", "utf8");
  it("열어 달라는 물음에 답하고(같은 규칙) · 막 열린 홈 화면 앱은 기다리는 주소를 묻는다", () => {
    expect(src).toContain("data.type !== OPEN_MESSAGE");
    expect(src).toContain("notificationMove(data.url, window.location.href, isStandalone())");
    expect(src).toContain('event.ports[0]?.postMessage({ ok: move.action !== "stay" })');
    expect(src).toContain("controller.postMessage({ type: PENDING_MESSAGE }");
    expect(src).toContain("sw.startMessages()");
  });
  it("다른 화면으로 옮길 때는 30초 기억을 먼저 비운다 — 방금 본 불라방 화면이 새 링크 없이 뜨지 않게 (2026-10-22 오류 점검)", () => {
    // Next 16 의 refresh 리듀서가 그 자리에서 기억(BFCache)을 비우고, 곧이은 push 가 그 refresh 를 대신해 새로 받아 온다
    expect(src).toMatch(/else if \(move\.action === "go"\) \{[\s\S]*?router\.refresh\(\);\s*router\.push\(move\.path\);/);
  });
  it("답을 기다리는 시간은 1초 아래 — 파이어폭스는 누른 뒤 1초 안에만 새 창을 열어 준다", () => {
    const ms = Number(readFileSync("public/sw.js", "utf8").match(/const ASK_TIMEOUT_MS = (\d+);/)?.[1]);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
  });
  it("서비스 워커와 같은 이름의 물음을 쓴다", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain(`const OPEN_MESSAGE = "${OPEN_MESSAGE}"`);
    expect(sw).toContain(`const PENDING_MESSAGE = "${PENDING_MESSAGE}"`);
  });
});
