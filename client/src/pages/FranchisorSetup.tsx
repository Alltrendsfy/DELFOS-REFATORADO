import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { DelfosLogo } from "@/components/DelfosLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Shield, Eye, EyeOff, Loader2, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

const translations = {
  en: {
    title: "DELFOS Platform Setup",
    subtitle: "Create the initial Franchisor administrator account",
    alreadyExists: "Franchisor Admin Already Exists",
    alreadyExistsMessage: "The platform has already been configured with an administrator. Please login to continue.",
    loginButton: "Go to Franchisor Login",
    email: "Admin Email",
    emailPlaceholder: "admin@yourdomain.com",
    password: "Password",
    passwordPlaceholder: "Minimum 8 characters",
    confirmPassword: "Confirm Password",
    confirmPlaceholder: "Repeat password",
    name: "Administrator Name",
    namePlaceholder: "Platform Administrator",
    setupKey: "Setup Key",
    setupKeyPlaceholder: "Security key provided by DELFOS",
    submit: "Create Administrator",
    submitting: "Creating...",
    success: "Administrator Created!",
    successMessage: "The Franchisor admin account has been created successfully. You can now login to manage the platform.",
    passwordMismatch: "Passwords do not match",
    required: "This field is required",
    invalidEmail: "Invalid email address",
    minPassword: "Password must be at least 8 characters",
    invalidKey: "Invalid setup key",
    backToHome: "Back to Home",
  },
  es: {
    title: "Configuración de Plataforma DELFOS",
    subtitle: "Crear la cuenta inicial de administrador Franqueador",
    alreadyExists: "El Admin Franqueador Ya Existe",
    alreadyExistsMessage: "La plataforma ya ha sido configurada con un administrador. Por favor inicie sesión para continuar.",
    loginButton: "Ir al Login de Franqueador",
    email: "Email del Admin",
    emailPlaceholder: "admin@sudominio.com",
    password: "Contraseña",
    passwordPlaceholder: "Mínimo 8 caracteres",
    confirmPassword: "Confirmar Contraseña",
    confirmPlaceholder: "Repetir contraseña",
    name: "Nombre del Administrador",
    namePlaceholder: "Administrador de Plataforma",
    setupKey: "Clave de Configuración",
    setupKeyPlaceholder: "Clave de seguridad proporcionada por DELFOS",
    submit: "Crear Administrador",
    submitting: "Creando...",
    success: "¡Administrador Creado!",
    successMessage: "La cuenta de administrador Franqueador ha sido creada exitosamente. Ahora puede iniciar sesión para gestionar la plataforma.",
    passwordMismatch: "Las contraseñas no coinciden",
    required: "Este campo es obligatorio",
    invalidEmail: "Dirección de email inválida",
    minPassword: "La contraseña debe tener al menos 8 caracteres",
    invalidKey: "Clave de configuración inválida",
    backToHome: "Volver al Inicio",
  },
  "pt-BR": {
    title: "Configuração da Plataforma DELFOS",
    subtitle: "Criar a conta inicial de administrador Franqueador",
    alreadyExists: "Admin Franqueador Já Existe",
    alreadyExistsMessage: "A plataforma já foi configurada com um administrador. Por favor faça login para continuar.",
    loginButton: "Ir para Login do Franqueador",
    email: "Email do Admin",
    emailPlaceholder: "admin@seudominio.com",
    password: "Senha",
    passwordPlaceholder: "Mínimo 8 caracteres",
    confirmPassword: "Confirmar Senha",
    confirmPlaceholder: "Repetir senha",
    name: "Nome do Administrador",
    namePlaceholder: "Administrador da Plataforma",
    setupKey: "Chave de Configuração",
    setupKeyPlaceholder: "Chave de segurança fornecida pela DELFOS",
    submit: "Criar Administrador",
    submitting: "Criando...",
    success: "Administrador Criado!",
    successMessage: "A conta de administrador Franqueador foi criada com sucesso. Agora você pode fazer login para gerenciar a plataforma.",
    passwordMismatch: "As senhas não coincidem",
    required: "Este campo é obrigatório",
    invalidEmail: "Endereço de email inválido",
    minPassword: "A senha deve ter pelo menos 8 caracteres",
    invalidKey: "Chave de configuração inválida",
    backToHome: "Voltar ao Início",
  },
};

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
  name: z.string().min(1),
  setupKey: z.string().min(1),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof formSchema>;

export default function FranchisorSetup() {
  const { language } = useLanguage();
  const t = translations[language as keyof typeof translations] || translations.en;
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  const { data: existsData, isLoading: checkingExists } = useQuery({
    queryKey: ['/api/auth/franchisor/exists'],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      name: "",
      setupKey: "",
    },
  });

  const setupMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch("/api/auth/franchisor/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          name: data.name,
          setupKey: data.setupKey,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Setup failed");
      }
      return response.json();
    },
    onSuccess: () => {
      setSetupComplete(true);
      toast({
        title: t.success,
        description: t.successMessage,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Setup failed",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    setupMutation.mutate(data);
  };

  if (checkingExists) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-900 via-amber-800 to-yellow-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-200" />
      </div>
    );
  }

  if (existsData?.exists) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-900 via-amber-800 to-yellow-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-black/40 border-amber-500/30 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <DelfosLogo />
            </div>
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-16 w-16 text-amber-400" />
            </div>
            <CardTitle className="text-2xl text-amber-100">{t.alreadyExists}</CardTitle>
            <CardDescription className="text-amber-200/70">
              {t.alreadyExistsMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/login/franchisor">
              <Button className="w-full bg-amber-600 hover:bg-amber-500 text-white" data-testid="button-goto-login">
                <Shield className="mr-2 h-4 w-4" />
                {t.loginButton}
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full border-amber-500/30 text-amber-200 hover:bg-amber-900/30" data-testid="button-back-home">
                {t.backToHome}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (setupComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-900 via-amber-800 to-yellow-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-black/40 border-amber-500/30 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <DelfosLogo />
            </div>
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-400" />
            </div>
            <CardTitle className="text-2xl text-amber-100">{t.success}</CardTitle>
            <CardDescription className="text-amber-200/70">
              {t.successMessage}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login/franchisor">
              <Button className="w-full bg-amber-600 hover:bg-amber-500 text-white" data-testid="button-goto-login-success">
                <Shield className="mr-2 h-4 w-4" />
                {t.loginButton}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-900 via-amber-800 to-yellow-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-black/40 border-amber-500/30 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <DelfosLogo />
          </div>
          <CardTitle className="text-2xl text-amber-100">{t.title}</CardTitle>
          <CardDescription className="text-amber-200/70">
            {t.subtitle}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-amber-200">{t.name}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.namePlaceholder}
                        className="bg-black/30 border-amber-500/30 text-amber-100 placeholder:text-amber-300/50"
                        data-testid="input-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-amber-200">{t.email}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder={t.emailPlaceholder}
                        className="bg-black/30 border-amber-500/30 text-amber-100 placeholder:text-amber-300/50"
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
                    <FormLabel className="text-amber-200">{t.password}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder={t.passwordPlaceholder}
                          className="bg-black/30 border-amber-500/30 text-amber-100 placeholder:text-amber-300/50 pr-10"
                          data-testid="input-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-300/70 hover:text-amber-200"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
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
                    <FormLabel className="text-amber-200">{t.confirmPassword}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder={t.confirmPlaceholder}
                        className="bg-black/30 border-amber-500/30 text-amber-100 placeholder:text-amber-300/50"
                        data-testid="input-confirm-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="setupKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-amber-200">{t.setupKey}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder={t.setupKeyPlaceholder}
                        className="bg-black/30 border-amber-500/30 text-amber-100 placeholder:text-amber-300/50"
                        data-testid="input-setup-key"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-amber-600 hover:bg-amber-500 text-white"
                disabled={setupMutation.isPending}
                data-testid="button-submit"
              >
                {setupMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.submitting}
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    {t.submit}
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <Link href="/">
              <Button variant="ghost" className="text-amber-300 hover:text-amber-200" data-testid="link-back-home">
                {t.backToHome}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
