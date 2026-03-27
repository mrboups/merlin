"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trackEvent } from "@/lib/track";

interface WaitlistOverlayProps {
  onClose: () => void;
}

type SubmitState = "idle" | "loading" | "success" | "error";

export function WaitlistOverlay({ onClose }: WaitlistOverlayProps) {
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Prevent body scroll while overlay is open + track open
  useEffect(() => {
    trackEvent("waitlist_open", "overlay");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !trimmed.includes("@")) {
        setErrorMessage("Please enter a valid email address.");
        setSubmitState("error");
        return;
      }

      setSubmitState("loading");
      setErrorMessage("");

      try {
        const res = await fetch("/api/v1/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { detail?: string }).detail ?? "Something went wrong.");
        }

        setSubmitState("success");
        trackEvent("waitlist_email_submit", "overlay", { email: trimmed });
        // Auto-close after 3 s
        setTimeout(() => onClose(), 5000);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
        setSubmitState("error");
      }
    },
    [email, onClose]
  );

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 animate-in fade-in duration-200"
      onClick={(e) => {
        // Close when clicking the backdrop (not the card)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Card */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-8 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted-foreground hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Image src="/logo-white.svg" alt="Merlin" width={140} height={43} priority />
        </div>

        {/* Headline */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight mb-2">Join the waitlist</h2>
          <p className="text-sm text-muted-foreground">
            Join the community and be the first to trade stocks by chatting.
          </p>
        </div>

        {/* Section 1: Telegram */}
        <div className="mb-6">
          <a
            href="https://t.me/letmerlincook"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("telegram_click", "waitlist_overlay")}
            className="flex items-center justify-center gap-3 w-full rounded-xl bg-[#00d4aa] hover:bg-[#00bfa0] text-black font-semibold py-3 px-6 transition-colors"
          >
            {/* Telegram paper-plane icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5 shrink-0"
              aria-hidden="true"
            >
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
            Join Telegram Community
          </a>
        </div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-transparent px-3 text-xs text-muted-foreground">or get notified by email</span>
          </div>
        </div>

        {/* Section 2: Email signup */}
        {submitState === "success" ? (
          <div className="flex flex-col items-center gap-3 py-4">
            {/* Checkmark */}
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00d4aa]/20 border border-[#00d4aa]/40">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-[#00d4aa]"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[#00d4aa]">You&apos;re on the list!</p>
            <p className="text-xs text-muted-foreground">We&apos;ll let you know when we launch.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (submitState === "error") setSubmitState("idle");
              }}
              required
              disabled={submitState === "loading"}
              className="bg-white/10 border-white/10 focus-visible:ring-[#00d4aa] placeholder:text-muted-foreground/60"
            />

            {submitState === "error" && errorMessage && (
              <p className="text-xs text-red-400">{errorMessage}</p>
            )}

            <Button
              type="submit"
              disabled={submitState === "loading"}
              className="w-full bg-white/10 hover:bg-white/20 text-foreground font-semibold border border-white/10"
            >
              {submitState === "loading" ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Saving...
                </span>
              ) : (
                "Notify me"
              )}
            </Button>
          </form>
        )}

        {/* Footer note */}
        <p className="mt-5 text-center text-xs text-muted-foreground/60">
          No spam. Just one email when we launch.
        </p>
      </div>
    </div>
  );
}
