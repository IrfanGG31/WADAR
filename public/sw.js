// WADAR service worker, registered as /sw.js?slug=<shop> (src/lib/service-worker.ts).
//
// App shell + offline (D8, TECH-SPEC §14; hand-written instead of Serwist, see BACKLOG):
// the offline page, manifest and icons are precached; hashed /_next/static assets are
// cache-first; a page that can't load shows /offline. Pages, API answers and server
// actions are never cached — shop data stays fresh and private on shared phones.
//
// Push (GAP #7): pushes carry no payload: the server only says "a chat was escalated";
// the buyer's words stay in the inbox.
const SHELL_CACHE = "wadar-shell-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

const slug = new URL(self.location.href).searchParams.get("slug");
const inbox = slug ? `/${encodeURIComponent(slug)}/chat?tab=belum` : "/mulai";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // A failed precache must not block install: push (GAP #7) still needs this worker.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("wadar-shell-") && n !== SHELL_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r ?? Response.error())));
    return;
  }

  // Content-hashed build output never changes under the same URL.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
    return;
  }

  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
  }
});

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
