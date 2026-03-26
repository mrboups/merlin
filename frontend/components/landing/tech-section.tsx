import { Badge } from "@/components/ui/badge";
import { Cpu, Lock, Layers, Zap } from "lucide-react";

const techStack = [
  { name: "Ethereum", description: "L1 settlement", color: "#627eea" },
  { name: "Uniswap V3", description: "DEX routing", color: "#ff007a" },
  { name: "Railgun", description: "ZK privacy", color: "#a855f7" },
  { name: "Privacy Pools", description: "Compliant privacy", color: "#00d4aa" },
  { name: "Ambire", description: "Smart EOA (EIP-7702)", color: "#0094ff" },
  { name: "Claude", description: "Intent parsing", color: "#d97706" },
  { name: "Next.js", description: "PWA framework", color: "#ffffff" },
  { name: "Firestore", description: "Real-time sync", color: "#ffa611" },
];

const highlights = [
  {
    icon: Zap,
    color: "#fbbf24",
    title: "EIP-7702 Gasless Trading",
    description:
      "Your Ethereum EOA becomes a smart account via EIP-7702 delegation. Gas is paid in USDC automatically — no ETH required to trade or bridge.",
  },
  {
    icon: Lock,
    color: "#a855f7",
    title: "ZK Proof Privacy",
    description:
      "Railgun uses zk-SNARKs to shield balances and transaction amounts on-chain. Merlin generates proofs locally in the browser — no proof server.",
  },
  {
    icon: Layers,
    color: "#0094ff",
    title: "BIP-39/44 Key Derivation",
    description:
      "Standard 12/24-word seed phrase. Standard HD derivation (m/44'/60'/0'/0/0). Your wallet is portable to any BIP-44-compatible wallet.",
  },
  {
    icon: Cpu,
    color: "#00d4aa",
    title: "Post-Quantum Ready",
    description:
      "ZKNOX ERC-4337 hybrid signer combines ECDSA with FALCON/ML-DSA post-quantum signatures. Opt-in today, required tomorrow.",
  },
];

export function TechSection() {
  return (
    <section id="technology" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_10%_40%,rgba(0,148,255,0.07),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#0094ff]/30 bg-[#0094ff]/10 px-3 py-1 text-xs text-[#0094ff] mb-6">
            Technology
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Built on Battle-Tested Infrastructure
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Every component has been production-verified, independently audited, or is a live
            Ethereum protocol with billions in value secured.
          </p>
        </div>

        {/* Tech badges */}
        <div className="flex flex-wrap justify-center gap-3 mb-20">
          {techStack.map((tech) => (
            <div
              key={tech.name}
              className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 hover:border-white/20 transition-colors"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: tech.color }}
              />
              <span className="text-sm font-medium">{tech.name}</span>
              <span className="text-xs text-muted-foreground">{tech.description}</span>
            </div>
          ))}
        </div>

        {/* Technical highlights */}
        <div className="grid sm:grid-cols-2 gap-6">
          {highlights.map(({ icon: Icon, color, title, description }) => (
            <div
              key={title}
              className="flex gap-5 rounded-2xl border border-white/10 bg-white/5 p-6 hover:border-white/20 transition-all"
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: `${color}15`,
                  border: `1px solid ${color}25`,
                }}
              >
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <div>
                <h3 className="font-bold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Open source note */}
        <div className="mt-12 text-center">
          <Badge
            variant="outline"
            className="border-white/20 text-muted-foreground text-xs px-4 py-1.5"
          >
            All smart contracts are open source and verifiable on Etherscan
          </Badge>
        </div>
      </div>
    </section>
  );
}
