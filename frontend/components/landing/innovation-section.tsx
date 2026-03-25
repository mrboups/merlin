import { X, Check } from "lucide-react";

const oldWay = [
  "Open a brokerage app, navigate 4 menus",
  "Decipher candlestick charts and order books",
  "Choose limit vs market vs stop-loss",
  "Set slippage tolerance manually",
  "Approve wallet popup and pay gas",
  "Wait for confirmation emails",
  "Log back in to check your position",
];

const merlinWay = [
  "Open chat. Type what you want.",
  "Merlin parses intent and fetches a live quote",
  "One confirmation tap — Merlin handles routing",
  "Optimal slippage set automatically via simulation",
  "EIP-7702 smart EOA — gas paid in USDC",
  "Trade confirmed directly in chat",
  "Ask \"what's my portfolio?\" anytime",
];

export function InnovationSection() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_50%,rgba(0,212,170,0.05),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00d4aa]/30 bg-[#00d4aa]/10 px-3 py-1 text-xs text-[#00d4aa] mb-6">
            The paradigm shift
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
            The Chat{" "}
            <span className="bg-gradient-to-r from-[#00d4aa] to-[#0094ff] bg-clip-text text-transparent">
              IS
            </span>{" "}
            the Trading Interface
          </h2>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
            2 billion people already know how to use a chat. We pointed it at financial markets.
            No learning curve. No new interface to master. Just say what you want.
          </p>
        </div>

        {/* Comparison grid */}
        <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Old way */}
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-8 w-8 rounded-full bg-red-500/20 flex items-center justify-center">
                <X className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Traditional approach</h3>
                <p className="text-xs text-muted-foreground">Every other trading platform</p>
              </div>
            </div>
            <ul className="space-y-3">
              {oldWay.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <X className="h-4 w-4 text-red-400/70 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Merlin way */}
          <div className="rounded-2xl border border-[#00d4aa]/30 bg-[#00d4aa]/5 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-8 w-8 rounded-full bg-[#00d4aa]/20 flex items-center justify-center">
                <Check className="h-4 w-4 text-[#00d4aa]" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Merlin</h3>
                <p className="text-xs text-muted-foreground">Built for humans, not traders</p>
              </div>
            </div>
            <ul className="space-y-3">
              {merlinWay.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <Check className="h-4 w-4 text-[#00d4aa] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Pull quote */}
        <div className="mt-16 text-center">
          <blockquote className="text-2xl sm:text-3xl font-bold text-muted-foreground max-w-3xl mx-auto">
            &ldquo;If you can send a text,{" "}
            <span className="text-foreground">you can trade stocks on Ethereum.</span>&rdquo;
          </blockquote>
        </div>
      </div>
    </section>
  );
}
