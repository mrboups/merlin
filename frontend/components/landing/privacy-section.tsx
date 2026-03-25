import { Key, Fingerprint, Eye, EyeOff, CheckCircle2 } from "lucide-react";

const cards = [
  {
    icon: Key,
    color: "#0094ff",
    title: "Non-Custodial",
    description:
      "Your seed phrase is generated locally and encrypted with your passkey. It never touches our servers. Not even we can access your funds.",
    points: [
      "BIP-39 seed generated in your browser",
      "Encrypted with your passkey (WebAuthn)",
      "Stored encrypted on your device only",
    ],
  },
  {
    icon: Fingerprint,
    color: "#00d4aa",
    title: "Passkey Auth",
    description:
      "No passwords to forget. No 2FA codes to copy. Your device biometrics (Face ID, Touch ID, Windows Hello) ARE your login.",
    points: [
      "WebAuthn — phishing-proof by design",
      "Works on iOS, Android, macOS, Windows",
      "Add backup devices for recovery",
    ],
  },
  {
    icon: Eye,
    color: "#a855f7",
    title: "Three Privacy Modes",
    description:
      "Every trade has a privacy setting. Go fully private via Railgun's ZK proofs, or use Privacy Pools for compliance-compatible shielding.",
    points: [
      "Public — standard on-chain transaction",
      "Shielded — Railgun ZK privacy proofs",
      "Compliant — Privacy Pools (OFAC-compatible)",
    ],
  },
];

const trustItems = [
  "Open-source smart contracts",
  "Audited by Trail of Bits",
  "No server-side key storage",
  "Ethereum mainnet only",
  "No tracking, no analytics",
];

export function PrivacySection() {
  return (
    <section id="privacy" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_30%_60%,rgba(168,85,247,0.07),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_80%_20%,rgba(0,148,255,0.06),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#a855f7]/30 bg-[#a855f7]/10 px-3 py-1 text-xs text-[#a855f7] mb-6">
            Privacy and security
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Your Keys.{" "}
            <span className="bg-gradient-to-r from-[#a855f7] to-[#0094ff] bg-clip-text text-transparent">
              Your Privacy.
            </span>{" "}
            Your Choice.
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Merlin gives you full custody of your assets and full control over your transaction
            privacy. We built the infrastructure — you own the keys.
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {cards.map(({ icon: Icon, color, title, description, points }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 hover:border-white/20 transition-all duration-200 flex flex-col"
            >
              {/* Icon */}
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center mb-5"
                style={{
                  background: `${color}15`,
                  border: `1px solid ${color}30`,
                }}
              >
                <Icon className="h-6 w-6" style={{ color }} />
              </div>

              <h3 className="text-lg font-bold mb-3">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">
                {description}
              </p>

              <ul className="space-y-2">
                {points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span
                      className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Privacy mode detail */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 mb-12">
          <div className="flex items-start gap-4 mb-6">
            <EyeOff className="h-6 w-6 text-[#a855f7] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-bold mb-1">Choose your privacy level, per trade</h3>
              <p className="text-sm text-muted-foreground">
                Set your default privacy mode in settings, or override it per transaction in chat.
                Just say &ldquo;buy Tesla privately&rdquo; and Merlin routes through Railgun.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <span className="text-sm font-semibold">Public</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Standard on-chain trade. Fully transparent. Best for compliant flows.
              </p>
            </div>
            <div className="rounded-xl border border-[#a855f7]/30 bg-[#a855f7]/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2 w-2 rounded-full bg-[#a855f7]" />
                <span className="text-sm font-semibold">Shielded</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Railgun ZK proofs. On-chain amounts and addresses are fully hidden.
              </p>
            </div>
            <div className="rounded-xl border border-[#00d4aa]/30 bg-[#00d4aa]/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2 w-2 rounded-full bg-[#00d4aa]" />
                <span className="text-sm font-semibold">Compliant</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Privacy Pools — cryptographic anonymity with OFAC compliance proofs.
              </p>
            </div>
          </div>
        </div>

        {/* Trust indicators */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          {trustItems.map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-[#00d4aa]" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
