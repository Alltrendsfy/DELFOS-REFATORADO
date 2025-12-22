import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation, useRoute } from "wouter";
import { DelfosLogo } from "@/components/DelfosLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2, Eye, EyeOff, KeyRound, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

const translations = {
  en: {
    title: "Activate Your Account",
    subtitle: "Create a secure password to access your franchise dashboard",
    password: "Password",
    passwordPlaceholder: "Enter a strong password",
    confirmPassword: "Confirm Password",
    confirmPlaceholder: "Re-enter your password",
    requirements: "Password must be at least 8 characters",
    activate: "Activate Account",
    activating: "Activating...",
    success: "Account Activated!",
    successMessage: "Your account is now active. You can log in to access your dashboard.",
    goToLogin: "Go to Login",
    invalidToken: "Invalid or expired activation link",
    tokenExpired: "This activation link has expired. Please contact support.",
    passwordMismatch: "Passwords do not match",
  },
  es: {
    title: "Active Su Cuenta",
    subtitle: "Cree una contraseña segura para acceder a su panel de franquicia",
    password: "Contraseña",
    passwordPlaceholder: "Ingrese una contraseña segura",
    confirmPassword: "Confirmar Contraseña",
    confirmPlaceholder: "Re-ingrese su contraseña",
    requirements: "La contraseña debe tener al menos 8 caracteres",
    activate: "Activar Cuenta",
    activating: "Activando...",
    success: "¡Cuenta Activada!",
    successMessage: "Su cuenta está activa. Puede iniciar sesión para acceder a su panel.",
    goToLogin: "Ir al Login",
    invalidToken: "Enlace de activación inválido o expirado",
    tokenExpired: "Este enlace de activación ha expirado. Por favor contacte soporte.",
    passwordMismatch: "Las contraseñas no coinciden",
  },
  "pt-BR": {
    title: "Ative Sua Conta",
    subtitle: "Crie uma senha segura para acessar seu painel de franquia",
    password: "Senha",
    passwordPlaceholder: "Digite uma senha forte",
    confirmPassword: "Confirmar Senha",
    confirmPlaceholder: "Re-digite sua senha",
    requirements: "A senha deve ter no mínimo 8 caracteres",
    activate: "Ativar Conta",
    activating: "Ativando...",
    success: "Conta Ativada!",
    successMessage: "Sua conta está ativa. Você pode fazer login para acessar seu painel.",
    goToLogin: "Ir para Login",
    invalidToken: "Link de ativação inválido ou expirado",
    tokenExpired: "Este link de ativação expirou. Por favor contate o suporte.",
    passwordMismatch: "As senhas não coincidem",
  },
};

const activationSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ActivationFormData = z.infer<typeof activationSchema>;

export default function AccountActivation() {
  const { language } = useLanguage();
  const t = translations[language] || translations.en;
  const { toast } = useToast();
  const [, params] = useRoute("/activate/:token");
  const token = params?.token || "";
  const [activated, setActivated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm<ActivationFormData>({
    resolver: zodResolver(activationSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  // Show error for missing token
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <AlertTriangle className="w-16 h-16 text-red-500" />
            </div>
            <CardTitle className="text-2xl text-red-600">{t.invalidToken}</CardTitle>
            <CardDescription className="text-base">{t.tokenExpired}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {language === "pt-BR" 
                ? "O link de ativação está faltando ou é inválido. Verifique seu e-mail para o link correto."
                : language === "es"
                ? "El enlace de activación está faltando o es inválido. Verifique su correo para el enlace correcto."
                : "The activation link is missing or invalid. Please check your email for the correct link."
              }
            </p>
            <Link href="/">
              <Button variant="outline" className="w-full" data-testid="button-back-home">
                {language === "pt-BR" ? "Voltar ao Início" : language === "es" ? "Volver al Inicio" : "Back to Home"}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activateMutation = useMutation({
    mutationFn: async (data: ActivationFormData) => {
      return await apiRequest<{ success: boolean; message: string }>(
        "/api/auth/persona/activate",
        "POST",
        {
          token,
          password: data.password,
        }
      );
    },
    onSuccess: () => {
      setActivated(true);
    },
    onError: (error: any) => {
      const message = error.message || t.invalidToken;
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ActivationFormData) => {
    activateMutation.mutate(data);
  };

  if (activated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <CardTitle className="text-2xl">{t.success}</CardTitle>
            <CardDescription className="text-base">{t.successMessage}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login/franchise">
              <Button className="w-full" data-testid="button-go-to-login">
                {t.goToLogin}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-900 via-cyan-800 to-slate-900 flex flex-col">
      <header className="p-4">
        <Link href="/">
          <DelfosLogo variant="full" className="h-10" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10">
              <KeyRound className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{t.title}</CardTitle>
            <CardDescription>{t.subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.password}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            {...field} 
                            type={showPassword ? "text" : "password"}
                            placeholder={t.passwordPlaceholder}
                            data-testid="input-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => setShowPassword(!showPassword)}
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.confirmPassword}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            {...field} 
                            type={showConfirm ? "text" : "password"}
                            placeholder={t.confirmPlaceholder}
                            data-testid="input-confirm-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => setShowConfirm(!showConfirm)}
                            data-testid="button-toggle-confirm"
                          >
                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <p className="text-sm text-muted-foreground">{t.requirements}</p>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={activateMutation.isPending}
                  data-testid="button-activate"
                >
                  {activateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t.activating}
                    </>
                  ) : (
                    t.activate
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
