import Link from "next/link";
import Image from "next/image";

const footerLinks = [
  {
    heading: "Product",
    links: [
      { label: "Launch App", href: "/chat" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Assets", href: "/assets" },
      { label: "Trades", href: "/trades" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "User Docs", href: "/docs" },
      { label: "Developer Docs", href: "/dev" },
      { label: "Feature Specs", href: "/specs" },
      { label: "Whitepaper", href: "/whitepaper" },
      { label: "GitHub", href: "https://github.com/mrboups/merlin", external: true },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Risk Disclosure", href: "/risk" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand column */}
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center mb-4">
              <Image src="/logo-white.svg" alt="Merlin" width={120} height={37} />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Privacy-preserving non-custodial wallet for tokenized stocks and crypto.
              Trade by chatting.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Built on Ethereum
            </div>
          </div>

          {/* Link columns */}
          {footerLinks.map((group) => (
            <div key={group.heading}>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                {group.heading}
              </h4>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Merlin. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground text-center sm:text-right max-w-md">
            xStocks are tokenized tracker certificates. Trading restricted for US persons.
            Not financial advice. Crypto assets carry risk.
          </p>
        </div>
      </div>
    </footer>
  );
}
