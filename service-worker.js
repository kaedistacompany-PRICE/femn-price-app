const CACHE_NAME = "femn-app-v10"; // هر بار که app.js/index.html/style.css را تغییر می‌دهید، این عدد را +1 کنید
const CORE_ASSETS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// این فایل‌ها همیشه باید تازه باشند، هیچ‌وقت برای مدت طولانی کش نشوند
const NETWORK_FIRST_FILES = ["data.json", "history.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const isNetworkFirst = NETWORK_FIRST_FILES.some((name) => request.url.includes(name));

  if (isNetworkFirst) {
    // اول از اینترنت بگیر؛ فقط اگر آفلاین بود، از کش (نسخه‌ی قبلی) استفاده کن
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // فایل‌های ثابت (app.js, index.html, ...): اول از کش، بعد از اینترنت
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});
