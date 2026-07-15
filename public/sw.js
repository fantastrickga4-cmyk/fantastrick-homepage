// 관리자 폰 알림용 서비스워커 — 관리자 화면을 안 켜놔도 새 예약을 알려준다.
// 손님 화면과는 무관(캐싱 안 함 — 캐싱하면 배포해도 옛 화면이 남는 사고가 남).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = { title: "판타스트릭", body: "새 알림", url: "/admin" };
  try { if (event.data) d = { ...d, ...event.data.json() }; } catch { /* 본문이 깨져도 알림은 띄운다 */ }
  event.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: "/images/favicon.png",
      badge: "/images/favicon.png",
      tag: "fx-admin",          // 같은 태그는 덮어써서 알림이 쌓이지 않게
      renotify: true,
      data: { url: d.url || "/admin" },
    }),
  );
});

// 알림을 누르면 이미 열린 관리자 탭이 있으면 그리로, 없으면 새로 연다
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes("/admin") && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
