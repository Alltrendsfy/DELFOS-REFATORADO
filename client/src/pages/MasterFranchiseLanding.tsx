import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/master-franchise-translations";
import { Hero } from "@/components/master-franchise/Hero";
import { RegistrationForm } from "@/components/master-franchise/RegistrationForm";
import { SuccessView } from "@/components/master-franchise/SuccessView";

export default function MasterFranchiseLanding() {
  const { language } = useLanguage();
  const t = translations[language as keyof typeof translations] || translations.en;

  const [submitted, setSubmitted] = useState(false);
  const [masterCode, setMasterCode] = useState("");

  const handleSuccess = (data: any) => {
    setMasterCode(data.masterCode);
    setSubmitted(true);
  };

  const handleReset = () => {
    setSubmitted(false);
    setMasterCode("");
  };

  if (submitted) {
    return (
      <SuccessView
        t={t}
        masterCode={masterCode}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        <Hero t={t} />

        <div className="max-w-4xl mx-auto">
          <RegistrationForm
            t={t}
            onSuccess={handleSuccess}
          />
        </div>
      </div>
    </div>
  );
}
