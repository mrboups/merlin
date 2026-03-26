"use client";

import { ArrowRight, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showWaitlist } from "@/lib/waitlist";
import { trackEvent } from "@/lib/track";

export function CtaSection() {
  return (
    <section className="relative py-32 overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,rgba(0,212,170,0.1),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_50%,rgba(0,148,255,0.08),transparent)]" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Icon */}
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00d4aa]/20 to-[#0094ff]/20 border border-[#00d4aa]/30 mb-8 mx-auto">
          <Fingerprint className="h-8 w-8 text-[#00d4aa]" />
        </div>

        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
          Start Trading in{" "}
          <span className="bg-gradient-to-r from-[#00d4aa] to-[#0094ff] bg-clip-text text-transparent">
            30 Seconds
          </span>
        </h2>

        <p className="text-lg text-muted-foreground mb-4 max-w-xl mx-auto">
          No email. No password. Just your biometrics and a chat window.
        </p>

        <p className="text-sm text-muted-foreground mb-10 max-w-xl mx-auto">
          Merlin creates your non-custodial wallet on first launch. Your seed is generated
          locally, encrypted with your passkey, and never leaves your device.
        </p>

        <Button
          size="lg"
          onClick={() => { trackEvent("cta_click", "cta_section"); showWaitlist(); }}
          className="bg-gradient-to-r from-[#00d4aa] to-[#00bfa0] hover:from-[#00bfa0] hover:to-[#00a891] text-black font-bold gap-2 text-lg px-10 py-6 h-auto shadow-lg shadow-[#00d4aa]/20"
        >
          Open Merlin
          <ArrowRight className="h-5 w-5" />
        </Button>

        {/* Reassurance row */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
          <span>Non-custodial</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>No account required</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>Open source</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>Ethereum mainnet</span>
        </div>
      </div>
    </section>
  );
}
