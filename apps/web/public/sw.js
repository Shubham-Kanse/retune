/**
 * Retune service worker (Charter 27 Epic 04).
 *
 * Strategy:
 *   - Network-first for navigation requests with an offline fallback.
 *   - Stale-while-revalidate for static assets (JS, CSS, images, fonts).
 *   - Pass-through (network-only) for API + auth + analytics, since
 *     these are user-specific and can't be safely cached.
 *
 * Versioning: bump CACHE_VERSION on every release to force a clean
 * activation. The activation step deletes any caches that don't match
 * the current version so we never serve stale code.
 *
 * What this does NOT do (deliberate):
 *   - No background sync — write paths must remain online-only so the
 *     user always sees the actual server state, not a queued mirage.
 *   - No push notifications — separate consent flow + Charter 25 Epic
 *     03 follow-up.
 */

/* eslint-disable no-restricted-globals */
/* global self, caches, clients */

const CACHE_VERSION = "retune-v1-2026-05-23";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const OFFLINE_URL = "/offline";
const PRECACHE_URLS = ["/", "/offline", "/manifest.webmanifest", "/favicon.svg", "/icon.svg"];

// ─── install ────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { credentials: "same-origin" }))),
      )
      .then(() => self.skipWaiting()),
  );
});

// ─── activate ───────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// ─── fetch ──────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache user-specific or analytics traffic.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("posthog") ||
    url.pathname.includes("sentry")
  ) {
    return;
  }

  // Navigation: network-first → offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, network.clone());
          return network;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("Offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (
    /\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|avif|ico)$/.test(url.pathname) ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached ?? new Response("", { status: 504 }));
        return cached ?? networkPromise;
      })(),
    );
  }
});

// ─── messages from the page (e.g. "skipWaiting") ─────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
