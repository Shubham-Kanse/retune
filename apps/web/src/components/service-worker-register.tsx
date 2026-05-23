"use client";

/**
 * Service worker registration (Charter 27 Epic 04).
 *
 * Registers `/sw.js` on first mount in production-like environments.
 * In dev we skip registration to avoid stale caches confusing HMR.
 */

import { useEffect } from "react";

export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Skip in plain dev (Next dev server) — service workers + HMR
    // produce confusing stale-cache states. Honour an opt-in escape
    // hatch for engineers who want to test SW behaviour locally.
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW !== "1") {
      return;
    }
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        // Encourage faster activation when a new SW is waiting.
        reg.waiting?.postMessage({ type: "SKIP_WAITING" });
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              // A newer SW is ready — tell it to activate so the
              // next navigation gets fresh assets.
              next.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      } catch {
        // Registration is best-effort. PWA is enhancement, not a
        // requirement for the app to work.
      }
    };
    void register();
  }, []);

  return null;
}
