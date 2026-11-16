const CACHE_NAME = "tein-pwa-v20";
const PAGES_CACHE = "tein-pages-v4";

const STATIC_ASSETS = [
  "/static/style.css?v=6.3",
  "/static/mobile.css?v=1.7",
  "/static/js/dashboard.js?v=6.0",
  "/static/favicon.svg",
  "/static/icon-192.png",
  "/static/icon-512.png",
  "/static/characters/hero_bhaiya.webp",
  "/static/characters/campus_sunset.webp",
  "/static/characters/mascot_present.webp",
  "/static/characters/mascot_absent.webp",
  "/static/characters/mascot_safe.webp",
  "/static/characters/mascot_target.webp",
  "/static/manifest.json"
];

// Install: Cache static shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old cache versions
self.addEventListener("activate", (event) => {
  const allowedCaches = [CACHE_NAME, PAGES_CACHE];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!allowedCaches.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy:
// - Static assets (/static/): Stale-while-revalidate (fastest load)
// - HTML Pages: Network-first with PAGES_CACHE fallback for True Offline Mode
// - APIs: Network-first
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle HTTP/HTTPS requests
  if (!url.protocol.startsWith("http")) {
    return;
  }

  // Only handle GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // 1. Static assets: Network-first for CSS/JS to guarantee instant updates, Stale-while-revalidate for media
  if (url.pathname.startsWith("/static/")) {
    const isCodeAsset = url.pathname.endsWith(".css") || url.pathname.endsWith(".js");
    if (isCodeAsset) {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => caches.match(event.request))
      );
      return;
    }

    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 2. HTML Navigation requests: Network-first with Cache Fallback for True Offline Mode
  const isHtmlRequest =
    event.request.mode === "navigate" ||
    (event.request.headers.get("accept") && event.request.headers.get("accept").includes("text/html"));

  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(PAGES_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
              // Also store under root "/" if navigating home
              if (url.pathname === "/" || url.pathname === "") {
                cache.put("/", networkResponse.clone());
              }
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Network failed: Serve cached HTML page
          const cache = await caches.open(PAGES_CACHE);
          const cachedPage = await cache.match(event.request);
          if (cachedPage) {
            return cachedPage;
          }
          // Fallback to cached home dashboard
          const fallbackHome = await cache.match("/");
          if (fallbackHome) {
            return fallbackHome;
          }
          // First time offline fallback shell
          return new Response(
            `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TEIN - Offline</title><link rel="stylesheet" href="/static/style.css"></head><body style="padding:20px;text-align:center;font-family:sans-serif;"><div style="max-width:400px;margin:60px auto;padding:24px;background:#fff;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.08);"><div style="font-size:42px;margin-bottom:12px;">📶</div><h2 style="margin:0 0 8px;">You are currently offline</h2><p style="color:#666;font-size:14px;line-height:1.5;">Please connect to the internet once so TEIN can load your attendance records.</p><button onclick="window.location.reload()" style="margin-top:16px;padding:10px 20px;background:#f59e0b;color:#fff;border:none;border-radius:9999px;font-weight:bold;cursor:pointer;">Retry</button></div></body></html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
    );
    return;
  }

  // 3. Other API routes: Network-first
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
