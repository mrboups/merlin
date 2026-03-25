import { LandingNav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { RwaSection } from "@/components/landing/rwa-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { InnovationSection } from "@/components/landing/innovation-section";
import { PrivacySection } from "@/components/landing/privacy-section";
import { TechSection } from "@/components/landing/tech-section";
import { CtaSection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export default function HomePage() {
  return (
    <main>
      <LandingNav />
      <Hero />
      <RwaSection />
      <HowItWorks />
      <InnovationSection />
      <PrivacySection />
      <TechSection />
      <CtaSection />
      <Footer />
    </main>
  );
}
