/* 역전토익 서비스 워커.
 * 1) 푸시: 관리자 알림 · 학생 알림(불라방 시작 · 숙제 미제출)을 받아 띄우고, 알림을 누르면 그 화면을 연다.
 * 2) 홈 화면 앱(PWA): 페이지 이동이 네트워크 오류로 실패할 때만 오프라인 안내 화면을 보여 준다.
 *    페이지·데이터는 캐시하지 않는다 (로그인별로 내용이 달라 오래된 화면이 보이면 안 된다).
 * 이 파일을 고치면 OFFLINE_CACHE 버전을 올린다. */

const OFFLINE_CACHE = "turn-toeic-offline-v2";
const SPLASH_CACHE = "turn-toeic-splash-v1"; // 스플래시 파일을 바꾸면 이 버전을 올린다
const OFFLINE_URL = "/offline.html";
// offline.html 은 로고까지 안에 넣은 한 파일이라 이것만 저장하면 된다
const OFFLINE_ASSETS = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(OFFLINE_ASSETS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => (k.startsWith("turn-toeic-offline-") && k !== OFFLINE_CACHE) || (k.startsWith("turn-toeic-splash-") && k !== SPLASH_CACHE))
          .map((k) => caches.delete(k)),
      );
      // 서비스 워커가 깨어나는 동안 페이지 요청을 미리 보내 둔다 (첫 화면이 느려지지 않게)
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // 스플래시 영상·포스터: 처음 한 번 받은 뒤 저장해 두 번째 실행부터 즉시(오프라인에서도) 재생. 앱으로 여는 사람만 요청하므로 미리 받지 않는다
  if (url.origin === self.location.origin && url.pathname.startsWith("/splash/") && event.request.method === "GET") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SPLASH_CACHE);
        const hit = await cache.match(event.request, { ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok && res.status === 200) cache.put(event.request, res.clone());
        return res;
      })(),
    );
    return;
  }
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(event.request);
      } catch {
        const cached = await caches.match(OFFLINE_URL);
        return cached || Response.error();
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "역전토익 알림", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "역전토익 알림";
  const options = {
    body: data.body || "",
    icon: "/icon.png",
    badge: "/icon.png",
    data: { url: data.url || "/admin" },
  };
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

/* 알림을 누르면 그 화면으로 (2026-10-19 Alan — "불라방 알람이 푸시로 왔을때 클릭하면 해당 불라방페이지로 바로 이어지면 좋겠어").
 * 아이폰 홈 화면 앱은 창이 하나뿐이라, 앱이 이미 떠 있으면 openWindow 가 그 화면으로 옮기지 못하고 보던 화면만 앞으로 가져왔다.
 * 그래서 우리 사이트 창이 열려 있으면 먼저 그 창에게 "이 화면을 열어" 라고 묻는다 — 받는 쪽은 PwaRegister (src/lib/notification-open.ts):
 *   - 이미 그 화면이면 새로 받아 오고(지금 들어온 링크가 보이게) 앞으로
 *   - 홈 화면 앱 창이면 그 자리에서 그 화면으로 옮긴다
 *   - 브라우저 탭이면(PC · 휴대폰 브라우저) 옮기지 않는다 — 쓰던 화면(글쓰기 등)을 날리지 않게 예전처럼 새 창을 연다
 * 답이 없으면(옛 화면 · 멈춘 탭) 새 창을 연다 — 기다림은 0.8초까지 (파이어폭스는 누른 뒤 1초 안에만 창을 열어 준다).
 * 앱이 꺼져 있었으면 openWindow 로 켜는데, 그래도 시작 화면으로 열렸으면 막 열린 앱 화면이 물어 올 때(wt-pending) 그 주소를 한 번 알려 준다 (30초 안). */
const OPEN_MESSAGE = "wt-open";
const PENDING_MESSAGE = "wt-pending";
const ASK_TIMEOUT_MS = 800;
const PENDING_TTL_MS = 30000;
let pendingOpen = null;

function askToOpen(client, url) {
  return new Promise((resolve) => {
    let settled = false;
    const channel = new MessageChannel();
    const timer = setTimeout(() => settle(false), ASK_TIMEOUT_MS);
    function settle(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    }
    channel.port1.onmessage = (e) => {
      const ok = Boolean(e.data && e.data.ok);
      // 늦게 온 답이어도 그 창이 옮겼으면 기다리던 주소는 지운다 — 나중에 새로고침한 화면이 다시 끌려가지 않게
      if (ok && pendingOpen && pendingOpen.url === url) pendingOpen = null;
      channel.port1.close();
      settle(ok);
    };
    try {
      client.postMessage({ type: OPEN_MESSAGE, url }, [channel.port2]);
    } catch {
      settle(false);
    }
  });
}

async function focusClient(client) {
  try {
    if ("focus" in client) await client.focus();
  } catch {
    // 아이폰은 알림을 누르면 앱이 저절로 앞으로 온다 — focus 가 막혀도 괜찮다
  }
}

function isOurWindow(client) {
  try {
    return new URL(client.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // 우리 사이트 안의 주소만 연다 — 알림 내용은 서버만 만들지만(VAPID 비밀) 밖의 주소가 끼어도 열지 않는다 (2026-10-09 보안 검토)
  const wanted = new URL((event.notification.data && event.notification.data.url) || "/admin", self.location.origin);
  const target = wanted.origin === self.location.origin ? wanted.href : new URL("/admin", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter(isOurWindow);
      const exact = windows.find((c) => c.url === target);
      const best = exact || windows.find((c) => c.focused) || windows.find((c) => c.visibilityState === "visible") || windows[0];
      if (best) {
        const moved = await askToOpen(best, target);
        // 이미 그 화면인 창은 답이 없어도(옛 화면) 새 창을 또 열지 않고 앞으로만
        if (moved || best === exact) return focusClient(best);
      }
      pendingOpen = { url: target, at: Date.now() };
      if (self.clients.openWindow) return self.clients.openWindow(target).catch(() => undefined);
      return undefined;
    })(),
  );
});

// 막 열린 홈 화면 앱 화면이 "열어야 할 화면이 있나" 묻는다 — 알림으로 앱을 켰는데 시작 화면으로 열렸을 때 (한 번만 · 30초 안)
self.addEventListener("message", (event) => {
  const data = event.data;
  const port = event.ports && event.ports[0];
  if (!data || data.type !== PENDING_MESSAGE || !port) return;
  const url = pendingOpen && Date.now() - pendingOpen.at < PENDING_TTL_MS ? pendingOpen.url : null;
  pendingOpen = null;
  port.postMessage({ url });
});
