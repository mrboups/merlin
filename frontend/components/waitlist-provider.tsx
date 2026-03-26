"use client";

import { useState, useEffect } from "react";
import { WaitlistOverlay } from "./waitlist-overlay";
import { registerOverlay } from "@/lib/waitlist";

export function WaitlistProvider() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    registerOverlay(
      () => setOpen(true),
      () => setOpen(false)
    );
  }, []);

  if (!open) return null;
  return <WaitlistOverlay onClose={() => setOpen(false)} />;
}
