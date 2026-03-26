/**
 * Fire-and-forget analytics event tracking.
 * Sends to both Google Analytics (gtag) and backend Firestore.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(
  event: string,
  source?: string,
  metadata?: Record<string, unknown>
) {
  // Google Analytics
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", event, {
      event_category: source || "general",
      ...metadata,
    });
  }

  // Backend Firestore
  fetch("/api/v1/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, source, metadata }),
  }).catch(() => {
    // Silent fail — analytics should never block UX
  });
}
