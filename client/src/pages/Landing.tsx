import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "../data/landing-translations";
import { Header } from "../components/landing/Header";
import { Hero } from "../components/landing/Hero";
import { Stats } from "../components/landing/Stats";
import { ValueProps } from "../components/landing/ValueProps";
import { Technology } from "../components/landing/Technology";
import { CapitalProtection } from "../components/landing/CapitalProtection";
import { HowItWorks } from "../components/landing/HowItWorks";
import { FranchisePlans } from "../components/landing/FranchisePlans";
import { Testimonials } from "../components/landing/Testimonials";
import { Contact } from "../components/landing/Contact";
import { CTA } from "../components/landing/CTA";
import { AccessPortal } from "../components/landing/AccessPortal";
import { Footer } from "../components/landing/Footer";
import { LoginModal } from "../components/landing/LoginModal";

export default function Landing() {
  const { language } = useLanguage();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const content = translations[language as keyof typeof translations] || translations.en;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background">
      <LoginModal isOpen={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />

      <Hero content={content.hero} onScrollToSection={scrollToSection}>
        <Header
          content={content.nav}
          onScrollToSection={scrollToSection}
          onOpenLoginModal={() => setIsLoginModalOpen(true)}
        />
      </Hero>

      <Stats content={content.stats} />

      <ValueProps content={content.valueProps} navLabel={content.nav.benefits} />

      <Technology content={content.technology} />

      <CapitalProtection content={content.capitalProtection} />

      <HowItWorks content={content.howItWorks} />

      <FranchisePlans content={content.plans} navLabel={content.nav.plans} />

      <Testimonials content={content.testimonials} />

      <Contact content={content.contact} navLabel={content.nav.contact} onScrollToSection={scrollToSection} />

      <CTA content={content.cta} onScrollToSection={scrollToSection} />

      <AccessPortal content={content.accessPortal} />

      <Footer content={content.footer} />
    </div>
  );
}
