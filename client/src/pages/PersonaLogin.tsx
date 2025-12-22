import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { DelfosLogo } from "@/components/DelfosLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Building2, Crown, Users, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Link } from "wouter";

type PersonaType = "franchisor" | "master_franchise" | "franchise";

interface PersonaLoginProps {
  personaType: PersonaType;
}

const translations = {
  en: {
    franchisor: {
      title: "Franchisor Login",
      subtitle: "Access the DELFOS management platform",
      icon: Crown,
    },
    master_franchise: {
      title: "Master Franchise Login",
      subtitle: "Regional franchise management",
      icon: Building2,
    },
    franchise: {
      title: "Franchise Login",
      subtitle: "Access your franchise dashboard",
      icon: Users,
    },
    email: "Email",
    emailPlaceholder: "your@email.com",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    login: "Sign In",
    loggingIn: "Signing in...",
    forgotPassword: "Forgot password?",
    backToHome: "Back to Home",
    becomePartner: "Become a Franchise Partner",
    invalidCredentials: "Invalid email or password",
    accountLocked: "Account temporarily locked. Try again later.",
    accountNotActivated: "Please activate your account first",
  },
  es: {
    franchisor: {
      title: "Login Franqueador",
      subtitle: "Acceda a la plataforma de gestión DELFOS",
      icon: Crown,
    },
    master_franchise: {
      title: "Login Master Franquicia",
      subtitle: "Gestión de franquicias regionales",
      icon: Building2,
    },
    franchise: {
      title: "Login Franquicia",
      subtitle: "Acceda a su panel de franquicia",
      icon: Users,
    },
    email: "Email",
    emailPlaceholder: "su@email.com",
    password: "Contraseña",
    passwordPlaceholder: "Ingrese su contraseña",
    login: "Iniciar Sesión",
    loggingIn: "Iniciando sesión...",
    forgotPassword: "¿Olvidó su contraseña?",
    backToHome: "Volver al Inicio",
    becomePartner: "Sea un Socio Franquicia",
    invalidCredentials: "Email o contraseña inválidos",
    accountLocked: "Cuenta temporalmente bloqueada. Intente más tarde.",
    accountNotActivated: "Por favor active su cuenta primero",
  },
  "pt-BR": {
    franchisor: {
      title: "Login Franqueadora",
      subtitle: "Acesse a plataforma de gestão DELFOS",
      icon: Crown,
    },
    master_franchise: {
      title: "Login Master Franquia",
      subtitle: "Gestão de franquias regionais",
      icon: Building2,
    },
    franchise: {
      title: "Login Franquia",
      subtitle: "Acesse seu painel de franquia",
      icon: Users,
    },
    email: "E-mail",
    emailPlaceholder: "seu@email.com",
    password: "Senha",
    passwordPlaceholder: "Digite sua senha",
    login: "Entrar",
    loggingIn: "Entrando...",
    forgotPassword: "Esqueceu a senha?",
    backToHome: "Voltar ao Início",
    becomePartner: "Seja um Parceiro Franquia",
    invalidCredentials: "E-mail ou senha inválidos",
    accountLocked: "Conta temporariamente bloqueada. Tente mais tarde.",
    accountNotActivated: "Por favor ative sua conta primeiro",
  },
};

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function PersonaLogin({ personaType }: PersonaLoginProps) {
  const { language } = useLanguage();
  const t = translations[language] || translations.en;
  const personaT = t[personaType];
  const Icon = personaT.icon;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      return await apiRequest<{ success: boolean; persona: string; franchiseId?: string }>(
        "/api/auth/persona/login",
        "POST",
        {
          ...data,
          personaType,
        }
      );
    },
    onSuccess: (data) => {
      if (personaType === "franchisor") {
        setLocation("/franchisor");
      } else if (personaType === "master_franchise") {
        setLocation("/master-franchise");
      } else {
        setLocation("/franchise");
      }
    },
    onError: (error: any) => {
      const message = error.message || t.invalidCredentials;
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const getGradient = () => {
    switch (personaType) {
      case "franchisor":
        return "from-amber-900 via-amber-800 to-slate-900";
      case "master_franchise":
        return "from-blue-900 via-blue-800 to-slate-900";
      case "franchise":
        return "from-cyan-900 via-cyan-800 to-slate-900";
      default:
        return "from-slate-900 via-slate-800 to-slate-900";
    }
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${getGradient()} flex flex-col`}>
      <header className="p-4 flex items-center justify-between">
        <Link href="/">
          <DelfosLogo variant="full" className="h-10" />
        </Link>
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-white/70 hover:text-white" data-testid="link-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t.backToHome}
          </Button>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10">
              <Icon className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{personaT.title}</CardTitle>
            <CardDescription>{personaT.subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.email}</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="email" 
                          placeholder={t.emailPlaceholder} 
                          autoComplete="email"
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                            autoComplete="current-password"
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

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t.loggingIn}
                    </>
                  ) : (
                    t.login
                  )}
                </Button>

                <div className="flex justify-between text-sm">
                  <Link href={`/reset-password/${personaType}`}>
                    <Button variant="ghost" className="p-0 h-auto text-primary" data-testid="link-forgot-password">
                      {t.forgotPassword}
                    </Button>
                  </Link>
                </div>
              </form>
            </Form>

            {personaType === "franchise" && (
              <div className="mt-6 pt-6 border-t text-center">
                <Link href="/franchise-registration">
                  <Button variant="outline" className="w-full" data-testid="link-become-partner">
                    {t.becomePartner}
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export function FranchisorLogin() {
  return <PersonaLogin personaType="franchisor" />;
}

export function MasterFranchiseLogin() {
  return <PersonaLogin personaType="master_franchise" />;
}

export function FranchiseLogin() {
  return <PersonaLogin personaType="franchise" />;
}
