const CACHE_NAME = "femn-app-v20";

// فایل‌های اصلی اپ (App Shell)
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// دیتاهایی که باید همیشه تازه باشند
const DATA_FILES = ["data.json", "history.json"];

// ===== INSTALL =====
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// ===== ACTIVATE =====
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ===== FETCH =====
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // ❗ درخواست‌های خارجی (CDN مثل chart.js) رو دست نزن
  if (url.origin !== location.origin) {
    return;
  }

  // ===== DATA STRATEGY (Network First) =====
  if (DATA_FILES.some((file) => url.pathname.endsWith(file))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // اگر response خراب بود، نریز تو کش
          if (!response || response.status !== 200) return response;

          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));

          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);

          if (cached) return cached;

          // 👇 جلوگیری از Pending
          return new Response(JSON.stringify({}), {
            headers: { "Content-Type": "application/json" }
          });
        })
    );
    return;
  }

  // ===== APP SHELL (Cache First + update in background) =====
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => null);

      // اگر کش داشت → سریع بده
      if (cached) {
        return cached;
      }

      // اگر کش نداشت → برو اینترنت
      return fetchPromise.then((res) => {
        if (res) return res;

        // fallback نهایی
        return new Response("Offline", { status: 503 });
      });
    })
  );
});
