import { MessageSquare, CheckCircle, Layers } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: MessageSquare,
    title: "Chat",
    description:
      "Type what you want in plain English. \"Buy $100 of Apple\", \"Swap ETH to USDC\", \"What's my portfolio worth?\" — Merlin understands it all.",
    detail: "Powered by Claude tool use with intent parsing trained on financial language.",
    color: "#0094ff",
  },
  {
    number: "02",
    icon: CheckCircle,
    title: "Confirm",
    description:
      "Merlin shows you the exact quote: asset, quantity, price, slippage, and gas cost. One tap to confirm. Nothing executes without your explicit approval.",
    detail: "Simulated on-chain before broadcast. You see exactly what you get.",
    color: "#00d4aa",
  },
  {
    number: "03",
    icon: Layers,
    title: "Done",
    description:
      "Your trade executes on Ethereum via Uniswap V3. Tokens land in your non-custodial wallet. The blockchain is the record. You own it.",
    detail: "EIP-7702 smart EOA pays gas in USDC — no ETH needed to trade.",
    color: "#a855f7",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24 overflow-hidden">
      {/* Subtle right-side glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_90%_30%,rgba(0,212,170,0.07),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00d4aa]/30 bg-[#00d4aa]/10 px-3 py-1 text-xs text-[#00d4aa] mb-6">
            Three steps to your first trade
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Simple as sending a message
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            No charts to read. No order forms to fill. No wallet popups to click through.
            If you can text, you can trade.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden lg:block absolute top-20 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-px bg-gradient-to-r from-[#0094ff]/30 via-[#00d4aa]/50 to-[#a855f7]/30" />

          <div className="grid lg:grid-cols-3 gap-8">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="flex flex-col">
                  {/* Icon bubble */}
                  <div className="flex items-start gap-4 lg:flex-col lg:items-center lg:text-center mb-6">
                    <div className="relative shrink-0">
                      <div
                        className="h-16 w-16 rounded-2xl flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${step.color}20, ${step.color}10)`,
                          border: `1px solid ${step.color}30`,
                        }}
                      >
                        <Icon className="h-7 w-7" style={{ color: step.color }} />
                      </div>
                      {/* Step number badge */}
                      <div
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ background: step.color }}
                      >
                        {step.number.replace("0", "")}
                      </div>
                    </div>

                    <div className="lg:hidden">
                      <span
                        className="text-xs font-mono font-bold"
                        style={{ color: step.color }}
                      >
                        Step {step.number}
                      </span>
                      <h3 className="text-xl font-bold mt-0.5">{step.title}</h3>
                    </div>
                  </div>

                  {/* Text content */}
                  <div className="lg:text-center">
                    <span
                      className="hidden lg:block text-xs font-mono font-bold mb-1"
                      style={{ color: step.color }}
                    >
                      Step {step.number}
                    </span>
                    <h3 className="hidden lg:block text-xl font-bold mb-3">{step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed mb-4">
                      {step.description}
                    </p>
                    <p
                      className="text-xs rounded-lg px-3 py-2 inline-block"
                      style={{
                        color: step.color,
                        background: `${step.color}10`,
                        border: `1px solid ${step.color}20`,
                      }}
                    >
                      {step.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
