// App đã chuyển sang https://wifi-nha.giadinhxuan.workers.dev — gỡ service worker cũ và đưa các cửa sổ đang mở sang địa chỉ mới
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate("https://wifi-nha.giadinhxuan.workers.dev/");
  })());
});
