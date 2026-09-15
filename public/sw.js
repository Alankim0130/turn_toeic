/* 역전토익 관리자 푸시 알림 서비스 워커.
 * 푸시를 받아 알림을 띄우고, 알림을 누르면 해당 관리자 화면을 연다.
 * 페이지 요청(fetch)은 가로채지 않는다. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
