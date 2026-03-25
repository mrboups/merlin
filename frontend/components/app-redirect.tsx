"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Redirects to /chat when accessed via app.letmerlincook.com.
 * This allows the app subdomain to go straight to the trading chat.
 */
export function AppRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname.startsWith("app.")) {
      router.replace("/chat");
    }
  }, [router]);

  return null;
}
