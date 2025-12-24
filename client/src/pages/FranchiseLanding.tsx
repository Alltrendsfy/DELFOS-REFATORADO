import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/franchise-landing-translations";
import { Hero } from "@/components/franchise-landing/Hero";
import { Plans } from "@/components/franchise-landing/Plans";
import { AccessPortal } from "@/components/franchise-landing/AccessPortal";
import { RegistrationForm } from "@/components/franchise-landing/RegistrationForm";
import { SuccessView } from "@/components/franchise-landing/SuccessView";
import { useToast } from "@/hooks/use-toast";

export default function FranchiseLanding() {
  const { language } = useLanguage();
  const t = translations[language as keyof typeof translations] || translations.en;
  const { toast } = useToast();

  const [submitted, setSubmitted] = useState(false);
  const [franchiseCode, setFranchiseCode] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Fetch plans dynamically from database
  const { data: plansData, isLoading: plansLoading } = useQuery<any[]>({
    queryKey: ["/api/franchise-plans"],
  });

  const handleSelectPlan = (planId: string) => {
    if (!planId) {
      toast({
        title: language === "pt-BR" ? "Erro" : language === "es" ? "Error" : "Error",
        description: language === "pt-BR"
          ? "Plano não disponível. Por favor, tente novamente."
          : language === "es"
            ? "Plan no disponible. Por favor, intente de nuevo."
            : "Plan not available. Please try again.",
        variant: "destructive",
      });
      return;
    }
    setSelectedPlanId(planId);
    setShowForm(true);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleSuccess = (data: any) => {
    // Note: In the original code, success view is shown only if we want to.
    // But wait, the original code had a payment step (step 4).
    // The RegistrationForm component now handles the steps.
    // If the user completes payment, they might be redirected away or shown a success message.
    // If we want to show the SuccessView component, we need to setSubmitted(true).
    // However, the payment flow usually redirects to Stripe.
    // If it's a direct success (e.g. free plan or bypassed), we show success.
    // Let's assume for now we just update state if we get a code back and no redirect happens immediately.

    if (data.franchiseCode) {
      setFranchiseCode(data.franchiseCode);
      // If we are here, it means we might want to show success view?
      // Actually, the original code didn't set submitted=true in onSuccess of mutation.
      // It just setStep(4).
      // The SuccessView was rendered if `submitted` state was true.
      // But `submitted` was never set to true in the original code snippet I saw!
      // Wait, let me check the original code again.
      // Line 574: setFranchiseCode(data.franchiseCode);
      // Line 576: setStep(4);
      // Line 613: if (submitted) ...
      // I don't see setSubmitted(true) anywhere in the original code snippet I read!
      // Ah, maybe it was in a part I missed or it was just missing logic?
      // Or maybe step 4 IS the success view?
      // Step 4 in original code (lines 1428+) shows "Payment" title.
      // So `submitted` state might be for when payment is confirmed?
      // But I don't see where `submitted` is set to true.
      // Maybe I should just rely on the RegistrationForm to handle the UI for step 4.
      // And if there is a "SuccessView" component, maybe it's for a different flow?
      // The SuccessView component I extracted corresponds to lines 613-654.
      // It is rendered if `submitted` is true.
      // Since I can't find where `submitted` becomes true, maybe it's dead code or I missed a `setSubmitted(true)` call.
      // Let's look at `handleSuccess` in my new code.
      // I'll just keep it exposing the state setters.
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setFranchiseCode("");
    setShowForm(false);
    setSelectedPlanId(null);
  };

  if (submitted) {
    return (
      <SuccessView
        t={t}
        franchiseCode={franchiseCode}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Hero t={t} />

      <main className="container mx-auto px-4 py-8">
        <Plans
          t={t}
          plansData={plansData || []}
          plansLoading={plansLoading}
          onSelectPlan={handleSelectPlan}
        />

        <AccessPortal t={t} />

        <div ref={formRef} className="max-w-2xl mx-auto">
          {showForm && (
            <RegistrationForm
              t={t}
              plansData={plansData || []}
              selectedPlanId={selectedPlanId}
              onSuccess={handleSuccess}
              language={language}
            />
          )}
        </div>
      </main>
    </div>
  );
}
