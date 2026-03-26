"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showWaitlist } from "@/lib/waitlist";
import { trackEvent } from "@/lib/track";

const links = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Privacy", href: "#privacy" },
  { label: "Technology", href: "#technology" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menu on route/hash navigation
  const handleNavClick = () => setMenuOpen(false);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-background/80 backdrop-blur-md border-b border-white/10 shadow-sm"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center group">
            <Image src="/logo-white.svg" alt="Merlin" width={120} height={37} priority />
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => { trackEvent("cta_click", "nav"); showWaitlist(); }}
              className="bg-[#00d4aa] hover:bg-[#00bfa0] text-black font-semibold"
            >
              Launch App
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-md border-b border-white/10">
          <nav className="mx-auto max-w-7xl px-4 py-4 flex flex-col gap-4">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleNavClick}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                {link.label}
              </a>
            ))}
            <Button
              size="sm"
              onClick={() => { handleNavClick(); trackEvent("cta_click", "nav_mobile"); showWaitlist(); }}
              className="bg-[#00d4aa] hover:bg-[#00bfa0] text-black font-semibold w-full mt-2"
            >
              Launch App
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
