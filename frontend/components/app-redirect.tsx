"use client";

import { useEffect } from "react";
import { showWaitlist } from "@/lib/waitlist";

/**
 * When accessed via app.letmerlincook.com, show the waitlist overlay
 * instead of redirecting to /chat (waitlist phase).
 */
export function AppRedirect() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname.startsWith("app.")) {
      showWaitlist();
    }
  }, []);

  return null;
}
