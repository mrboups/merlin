"use client";

import { useEffect, useRef, useCallback } from "react";

const CHECK_INTERVAL = 30_000; // Check every 30 seconds

/**
 * VersionCheck — 3-layer cache busting for FutureWallet PWA
 *
 * Layer 1: Next.js content-hashed JS/CSS chunks (_next/static/*)
 *          → immutable, max-age=1yr. Hash changes on code change.
 *
 * Layer 2: version.json (no hash, no cache) polled every 30s
 *          → When version changes, force hard reload.
 *
 * Layer 3: Service Worker (sw.js)
 *          → On update: clears all caches, skipWaiting, notifies clients.
 *
 * Firebase Hosting auto-invalidates CDN on deploy. These layers
 * handle browser-level caching and stale PWA installs.
 */
export function VersionCheck() {
  const currentVersion = useRef<string | null>(null);
  const reloading = useRef(false);

  const hardReload = useCallback(() => {
    if (reloading.current) return;
    reloading.current = true;
    console.log("[FutureWallet] New version detected — clearing caches and reloading...");

    // Clear all caches before reloading
    const doReload = () => globalThis.location?.reload();
    if ("caches" in globalThis) {
      caches.keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .then(doReload)
        .catch(doReload);
    } else {
      doReload();
    }
  }, []);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("[FutureWallet] SW registered");

          // Check for SW updates on each version check
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "activated" &&
                  navigator.serviceWorker.controller
                ) {
                  // New SW activated — reload to get fresh assets
                  hardReload();
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn("[FutureWallet] SW registration failed:", err);
        });

      // Listen for SW messages (e.g., SW_UPDATED from activate event)
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SW_UPDATED") {
          hardReload();
        }
      });
    }

    // Version polling
    async function checkVersion() {
      try {
        const res = await fetch("/version.json?_=" + Date.now(), {
          cache: "no-store",
          headers: { Pragma: "no-cache" },
        });
        if (!res.ok) return;
        const data = await res.json();
        const newVersion = data.v;

        if (currentVersion.current === null) {
          currentVersion.current = newVersion;
        } else if (currentVersion.current !== newVersion) {
          hardReload();
        }
      } catch {
        // Ignore fetch errors (offline, etc.)
      }
    }

    // Also trigger SW update check on each poll
    async function checkAll() {
      await checkVersion();
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        reg?.update().catch(() => {});
      }
    }

    checkAll();
    const interval = setInterval(checkAll, CHECK_INTERVAL);

    // Also check on visibility change (user returns to tab)
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        checkAll();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hardReload]);

  return null;
}
