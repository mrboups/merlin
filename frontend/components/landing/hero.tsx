"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showWaitlist } from "@/lib/waitlist";
import { trackEvent } from "@/lib/track";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background gradient layers */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(0,212,170,0.12),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_70%_60%,rgba(0,148,255,0.07),transparent)]" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: copy */}
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#00d4aa]/30 bg-[#00d4aa]/10 px-3 py-1 text-xs text-[#00d4aa] mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00d4aa] animate-pulse" />
              Non-custodial · Privacy-first · On Ethereum
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              Trade Stocks{" "}
              <span className="bg-gradient-to-r from-[#00d4aa] to-[#0094ff] bg-clip-text text-transparent">
                and Crypto
              </span>{" "}
              by Chatting
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed mb-10 max-w-xl">
              The first AI-powered wallet where the chat IS the trading interface. 80+ tokenized
              stocks. Non-custodial. Private. Your keys never leave your device.
            </p>

            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                onClick={() => { trackEvent("cta_click", "hero"); showWaitlist(); }}
                className="bg-[#00d4aa] hover:bg-[#00bfa0] text-black font-semibold gap-2 text-base px-8"
              >
                Start Trading
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/20 bg-white/5 hover:bg-white/10 text-foreground font-medium text-base px-8 gap-2"
              >
                <Link href="/whitepaper">
                  Read Whitepaper
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="mt-10 flex flex-wrap gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00d4aa]" />
                No email required
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00d4aa]" />
                No password
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00d4aa]" />
                Biometric login
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00d4aa]" />
                Self-custody
              </div>
            </div>
          </div>

          {/* Right: mock chat UI */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative w-full max-w-md">
              {/* Glow behind card */}
              <div className="absolute -inset-4 bg-gradient-to-r from-[#00d4aa]/20 to-[#0094ff]/20 rounded-3xl blur-2xl" />

              <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl">
                {/* Chat header */}
                <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                  <div className="h-2 w-2 rounded-full bg-[#00d4aa]" />
                  <span className="text-sm font-medium">Merlin</span>
                  <span className="ml-auto text-xs text-muted-foreground">Ethereum</span>
                </div>

                {/* Chat messages */}
                <div className="p-4 space-y-4">
                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="rounded-2xl rounded-tr-sm bg-[#0094ff]/20 border border-[#0094ff]/30 px-4 py-2.5 max-w-[80%]">
                      <p className="text-sm">Buy $50 of Tesla</p>
                    </div>
                  </div>

                  {/* AI response */}
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-tl-sm bg-white/5 border border-white/10 px-4 py-3 max-w-[85%] space-y-2">
                      <p className="text-sm">
                        Got it. I&apos;ll buy{" "}
                        <span className="text-[#00d4aa] font-semibold">0.23 xTSLA</span> for{" "}
                        <span className="font-semibold">$50.00</span> via Uniswap V3.
                      </p>
                      <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                          <span>Asset</span>
                          <span className="text-foreground font-medium">xTSLA (Tesla)</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Amount</span>
                          <span className="text-foreground font-medium">0.23 tokens</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Price</span>
                          <span className="text-foreground font-medium">$217.39 / token</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Gas</span>
                          <span className="text-[#00d4aa] font-medium">$0.12 USDC</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Confirm button */}
                  <div className="flex justify-end">
                    <div className="rounded-2xl rounded-tr-sm bg-[#00d4aa]/20 border border-[#00d4aa]/30 px-4 py-2.5 max-w-[80%]">
                      <p className="text-sm">Confirm</p>
                    </div>
                  </div>

                  {/* Success response */}
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-tl-sm bg-white/5 border border-white/10 px-4 py-3 max-w-[85%]">
                      <p className="text-sm">
                        <span className="text-[#00d4aa]">Done.</span> Bought 0.23 xTSLA for $50.
                        Trade confirmed on Ethereum.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Input bar */}
                <div className="border-t border-white/10 px-4 py-3">
                  <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5">
                    <span className="text-xs text-muted-foreground flex-1">Ask anything...</span>
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#00d4aa] to-[#0094ff] flex items-center justify-center">
                      <ArrowRight className="h-3 w-3 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
