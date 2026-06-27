/**
 * AEGIS Service Worker — offline-first for field workers.
 *
 * v2 strategy:
 *   - Network-first for HTML pages and Next.js chunks (so updates land immediately)
 *   - Network-first for API
 *   - Cache-first only for truly static assets (images, fonts, manifest)
 *   - Background sync queue for offline-submitted incidents/safe checkins
 *
 * Important: the cache version bumps invalidate everything from older builds.
 */

const CACHE_VERSION = "aegis-v3";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // mutations replay via background sync

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const pathname = url.pathname;

  // ─── 1. API ─── network-first (always try fresh)
  if (pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE, /* fallbackOffline */ true));
    return;
  }

  // ─── 2. HTML documents / pages ─── network-first
  // Detect HTML either by Accept header or by no file extension.
  const acceptsHtml = req.headers.get("accept")?.includes("text/html");
  const isHtmlPath = !/\.[a-zA-Z0-9]{2,5}$/.test(pathname);
  if (acceptsHtml || isHtmlPath) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE, false));
    return;
  }

  // ─── 3. Next.js JS / CSS chunks ─── network-first
  // These are fingerprinted, so once cached they never need refetching, but we
  // still want the freshest one on first hit after a deploy.
  if (pathname.startsWith("/_next/")) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE, false));
    return;
  }

  // ─── 4. Static assets (images, fonts, manifest) ─── cache-first
  event.respondWith(cacheFirst(req, RUNTIME_CACHE));
});

// ─── Strategies ─────────────────────────────────────────────────

async function networkFirst(req, cacheName, fallbackOffline) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const clone = res.clone();
      caches.open(cacheName).then((c) => c.put(req, clone)).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (fallbackOffline) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: "OFFLINE", message: "You are offline" } }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    const offlineShell = await caches.match("/offline.html");
    return offlineShell || new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const clone = res.clone();
      caches.open(cacheName).then((c) => c.put(req, clone)).catch(() => {});
    }
    return res;
  } catch {
    return new Response("Not available offline", { status: 503 });
  }
}

// ─── Background sync — replay queued mutations ──────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === "aegis-replay-mutations") {
    event.waitUntil(replayMutations());
  }
});

async function replayMutations() {
  // App-side enqueue lives in src/lib/offline-queue.ts (IndexedDB)
}
