// Push service worker (GAP #7). Pushes carry no payload: the server only says "a chat was
// escalated"; the buyer's words stay in the inbox. Registered as /sw.js?slug=<shop>.
const slug = new URL(self.location.href).searchParams.get("slug");
const inbox = slug ? `/${encodeURIComponent(slug)}/chat?tab=belum` : "/mulai";

self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Chat perlu dibalas", {
      body: "Ada pembeli yang menunggu balasanmu. Ketuk untuk membuka Chat.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "wadar-escalation",
      renotify: true,
      data: { url: inbox },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? inbox;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).pathname.startsWith(slug ? `/${slug}` : "/"));
      return open ? open.navigate(url).then((w) => w?.focus()) : self.clients.openWindow(url);
    }),
  );
});
