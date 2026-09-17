/* 역전토익 서비스 워커.
 * 1) 관리자 푸시: 푸시를 받아 알림을 띄우고, 알림을 누르면 해당 관리자 화면을 연다.
 * 2) 홈 화면 앱(PWA): 페이지 이동이 네트워크 오류로 실패할 때만 오프라인 안내 화면을 보여 준다.
 *    페이지·데이터는 캐시하지 않는다 (로그인별로 내용이 달라 오래된 화면이 보이면 안 된다).
 * 이 파일을 고치면 OFFLINE_CACHE 버전을 올린다. */

const OFFLINE_CACHE = "turn-toeic-offline-v1";
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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/admin", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })(),
  );
});
