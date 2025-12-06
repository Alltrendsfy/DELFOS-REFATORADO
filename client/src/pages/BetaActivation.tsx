import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DelfosLogo } from "@/components/DelfosLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Moon, Sun, Globe, LogOut, Lock, ShieldCheck } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const translations = {
  en: {
    title: "Activate Your Beta Access",
    description: "Enter your invite code to access DELFOS trading platform.",
    placeholder: "Enter invite code",
    activate: "Activate Account",
    activating: "Activating...",
    logout: "Sign Out",
    contact: "Don't have an invite code? Contact our team to request access.",
    success: "Account activated successfully!",
    welcomeTitle: "Welcome to DELFOS Beta",
    welcomeDesc: "You have been granted exclusive early access to our AI-powered cryptocurrency trading platform.",
    secureNote: "Your account will have access to all beta features including live trading, AI analysis, and advanced risk management.",
  },
  es: {
    title: "Activa tu Acceso Beta",
    description: "Ingresa tu codigo de invitacion para acceder a la plataforma DELFOS.",
    placeholder: "Ingresa el codigo de invitacion",
    activate: "Activar Cuenta",
    activating: "Activando...",
    logout: "Cerrar Sesion",
    contact: "No tienes un codigo de invitacion? Contacta a nuestro equipo para solicitar acceso.",
    success: "Cuenta activada exitosamente!",
    welcomeTitle: "Bienvenido a DELFOS Beta",
    welcomeDesc: "Se te ha otorgado acceso exclusivo anticipado a nuestra plataforma de trading de criptomonedas impulsada por IA.",
    secureNote: "Tu cuenta tendra acceso a todas las funciones beta, incluyendo trading en vivo, analisis de IA y gestion avanzada de riesgos.",
  },
  "pt-BR": {
    title: "Ative seu Acesso Beta",
    description: "Insira seu codigo de convite para acessar a plataforma DELFOS.",
    placeholder: "Insira o codigo de convite",
    activate: "Ativar Conta",
    activating: "Ativando...",
    logout: "Sair",
    contact: "Nao tem um codigo de convite? Entre em contato com nossa equipe para solicitar acesso.",
    success: "Conta ativada com sucesso!",
    welcomeTitle: "Bem-vindo ao DELFOS Beta",
    welcomeDesc: "Voce recebeu acesso exclusivo antecipado a nossa plataforma de trading de criptomoedas com IA.",
    secureNote: "Sua conta tera acesso a todos os recursos beta, incluindo trading ao vivo, analise de IA e gerenciamento de risco avancado.",
  },
};

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
    >
      {theme === "light" ? (
        <Moon className="w-5 h-5" />
      ) : (
        <Sun className="w-5 h-5" />
      )}
    </Button>
  );
}

function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-language-selector">
          <Globe className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setLanguage("en")}
          className={language === "en" ? "bg-accent" : ""}
          data-testid="option-language-en"
        >
          English
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage("es")}
          className={language === "es" ? "bg-accent" : ""}
          data-testid="option-language-es"
        >
          Espanol
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage("pt-BR")}
          className={language === "pt-BR" ? "bg-accent" : ""}
          data-testid="option-language-pt"
        >
          Portugues (BR)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function BetaActivation() {
  const { language } = useLanguage();
  const t = translations[language];
  const queryClient = useQueryClient();
  
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activateMutation = useMutation({
    mutationFn: async (inviteCode: string) => {
      return await apiRequest<{ success: boolean; message: string }>(
        "/api/user/activate-beta",
        "POST",
        { code: inviteCode }
      );
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/user/beta-status"] });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.trim()) {
      activateMutation.mutate(code.trim());
    }
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <DelfosLogo variant="full" />
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="ml-2"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t.logout}
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <Card>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl" data-testid="text-activation-title">
                {t.title}
              </CardTitle>
              <CardDescription data-testid="text-activation-description">
                {t.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="text"
                    placeholder={t.placeholder}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="text-center text-lg tracking-wider font-mono"
                    maxLength={20}
                    disabled={activateMutation.isPending}
                    data-testid="input-invite-code"
                  />
                </div>

                {error && (
                  <Alert variant="destructive" data-testid="alert-error">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {activateMutation.isSuccess && (
                  <Alert className="border-green-500 bg-green-50 dark:bg-green-950" data-testid="alert-success">
                    <ShieldCheck className="w-4 h-4 text-green-600" />
                    <AlertDescription className="text-green-700 dark:text-green-300">
                      {t.success}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={!code.trim() || activateMutation.isPending}
                  data-testid="button-activate"
                >
                  {activateMutation.isPending ? t.activating : t.activate}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t.welcomeTitle}</p>
                  <p className="text-sm text-muted-foreground">{t.welcomeDesc}</p>
                  <p className="text-xs text-muted-foreground mt-2">{t.secureNote}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground" data-testid="text-contact-info">
            {t.contact}
          </p>
        </div>
      </main>
    </div>
  );
}
