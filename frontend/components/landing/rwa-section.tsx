import { TrendingUp, Clock, Zap, Shield } from "lucide-react";

const xStocks = [
  { ticker: "xTSLA", name: "Tesla", color: "#cc0000", letter: "T" },
  { ticker: "xAAPL", name: "Apple", color: "#555555", letter: "A" },
  { ticker: "xNVDA", name: "NVIDIA", color: "#76b900", letter: "N" },
  { ticker: "xGOOGL", name: "Alphabet", color: "#4285f4", letter: "G" },
  { ticker: "xAMZN", name: "Amazon", color: "#ff9900", letter: "A" },
  { ticker: "xMSFT", name: "Microsoft", color: "#00a4ef", letter: "M" },
  { ticker: "xSPY", name: "S&P 500", color: "#00d4aa", letter: "S" },
  { ticker: "xGLD", name: "Gold", color: "#ffd700", letter: "G" },
];

const stats = [
  { icon: TrendingUp, value: "80+", label: "Tokenized assets" },
  { icon: Clock, value: "24/7", label: "Trading hours" },
  { icon: Zap, value: "~12s", label: "Settlement time" },
  { icon: Shield, value: "100%", label: "Self-custody" },
];

export function RwaSection() {
  return (
    <section id="features" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_20%_50%,rgba(0,148,255,0.06),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#0094ff]/30 bg-[#0094ff]/10 px-3 py-1 text-xs text-[#0094ff] mb-6">
            Real-World Assets on Ethereum
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            80+ Real-World Assets,{" "}
            <span className="bg-gradient-to-r from-[#0094ff] to-[#00d4aa] bg-clip-text text-transparent">
              24/7
            </span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Tokenized stocks, ETFs, and commodities issued as ERC-20 tokens on Ethereum.
            Trade Apple stock at 3am. Hold gold in your own wallet. No broker. No custodian.
          </p>
        </div>

        {/* xStock grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">
          {xStocks.map((asset) => (
            <div
              key={asset.ticker}
              className="group rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 hover:border-white/20 hover:bg-white/8 transition-all duration-200"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: asset.color + "25", border: `1px solid ${asset.color}40` }}
                >
                  <span style={{ color: asset.color }}>{asset.letter}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{asset.name}</p>
                  <p className="text-xs text-muted-foreground">{asset.ticker}</p>
                </div>
              </div>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <p className="text-xs text-muted-foreground mt-3">
                Trade via chat
              </p>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map(({ icon: Icon, value, label }) => (
            <div
              key={label}
              className="flex flex-col items-center text-center rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <div className="mb-3 h-10 w-10 rounded-full bg-gradient-to-br from-[#00d4aa]/20 to-[#0094ff]/20 flex items-center justify-center">
                <Icon className="h-5 w-5 text-[#00d4aa]" />
              </div>
              <p className="text-3xl font-bold tabular-nums mb-1">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Fine print */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          xStocks are tokenized tracker certificates issued by xStocks.fi / Backed Finance on Ethereum.
          Trading of xStocks is restricted for US persons and residents of sanctioned countries.
        </p>
      </div>
    </section>
  );
}
