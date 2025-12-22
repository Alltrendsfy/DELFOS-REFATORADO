import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { DelfosLogo } from "@/components/DelfosLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Globe, Building2, Loader2, MapPin, User, Phone, FileText } from "lucide-react";
import { Link } from "wouter";

const translations = {
  en: {
    title: "Become a Master Franchise",
    subtitle: "Expand DELFOS in your region as a Master Franchisee",
    description: "As a Master Franchise, you will have exclusive rights to operate and expand DELFOS in your territory, managing sub-franchises and earning royalties from the entire region.",
    benefits: [
      "Exclusive territorial rights",
      "Revenue from all regional franchises",
      "Full support from DELFOS headquarters",
      "Access to advanced management tools",
    ],
    step1Title: "Your Information",
    step2Title: "Territory & Documents",
    next: "Next",
    previous: "Previous",
    submit: "Submit Application",
    submitting: "Submitting...",
    success: "Application Submitted!",
    successMessage: "Your Master Franchise application has been received. Your application code is:",
    successNote: "Our team will review your application and contact you within 5-7 business days for the next steps.",
    backToHome: "Back to Home",
    startNew: "Submit Another Application",
    name: "Full Name / Company Name",
    namePlaceholder: "Legal name or company name",
    email: "Email",
    emailPlaceholder: "your@email.com",
    phone: "Phone",
    phonePlaceholder: "+1 555 123-4567",
    territory: "Desired Territory",
    territoryPlaceholder: "Country, State or Region",
    documentType: "Document Type",
    cpf: "CPF (Individual)",
    cnpj: "CNPJ (Company)",
    passport: "Passport",
    taxId: "Tax ID",
    documentNumber: "Document Number",
    documentPlaceholder: "Enter your document number",
    city: "City",
    cityPlaceholder: "Your city",
    country: "Country",
    notes: "Why do you want to be a Master Franchise?",
    notesPlaceholder: "Tell us about your experience, resources, and why you're interested in becoming a DELFOS Master Franchise...",
    required: "This field is required",
    invalidEmail: "Invalid email address",
    loginMaster: "Master Login",
    loginFranchisor: "Franchisor Login",
  },
  es: {
    title: "Conviértase en Master Franchise",
    subtitle: "Expanda DELFOS en su región como Master Franquiciado",
    description: "Como Master Franchise, tendrá derechos exclusivos para operar y expandir DELFOS en su territorio, gestionando sub-franquicias y ganando regalías de toda la región.",
    benefits: [
      "Derechos territoriales exclusivos",
      "Ingresos de todas las franquicias regionales",
      "Soporte completo de la sede de DELFOS",
      "Acceso a herramientas avanzadas de gestión",
    ],
    step1Title: "Su Información",
    step2Title: "Territorio y Documentos",
    next: "Siguiente",
    previous: "Anterior",
    submit: "Enviar Solicitud",
    submitting: "Enviando...",
    success: "¡Solicitud Enviada!",
    successMessage: "Su solicitud de Master Franchise ha sido recibida. Su código de solicitud es:",
    successNote: "Nuestro equipo revisará su solicitud y lo contactará dentro de 5-7 días hábiles para los próximos pasos.",
    backToHome: "Volver al Inicio",
    startNew: "Enviar Otra Solicitud",
    name: "Nombre Completo / Razón Social",
    namePlaceholder: "Nombre legal o razón social",
    email: "Email",
    emailPlaceholder: "su@email.com",
    phone: "Teléfono",
    phonePlaceholder: "+34 555 123-456",
    territory: "Territorio Deseado",
    territoryPlaceholder: "País, Estado o Región",
    documentType: "Tipo de Documento",
    cpf: "CPF (Persona Física)",
    cnpj: "CNPJ (Empresa)",
    passport: "Pasaporte",
    taxId: "ID Fiscal",
    documentNumber: "Número de Documento",
    documentPlaceholder: "Ingrese su número de documento",
    city: "Ciudad",
    cityPlaceholder: "Su ciudad",
    country: "País",
    notes: "¿Por qué quiere ser Master Franchise?",
    notesPlaceholder: "Cuéntenos sobre su experiencia, recursos y por qué está interesado en convertirse en Master Franchise de DELFOS...",
    required: "Este campo es obligatorio",
    invalidEmail: "Dirección de email inválida",
    loginMaster: "Login Master",
    loginFranchisor: "Login Franqueador",
  },
  "pt-BR": {
    title: "Torne-se um Master Franchise",
    subtitle: "Expanda a DELFOS na sua região como Master Franqueado",
    description: "Como Master Franchise, você terá direitos exclusivos para operar e expandir a DELFOS no seu território, gerenciando sub-franquias e ganhando royalties de toda a região.",
    benefits: [
      "Direitos territoriais exclusivos",
      "Receita de todas as franquias regionais",
      "Suporte completo da sede DELFOS",
      "Acesso a ferramentas avançadas de gestão",
    ],
    step1Title: "Suas Informações",
    step2Title: "Território e Documentos",
    next: "Próximo",
    previous: "Anterior",
    submit: "Enviar Candidatura",
    submitting: "Enviando...",
    success: "Candidatura Enviada!",
    successMessage: "Sua candidatura para Master Franchise foi recebida. Seu código de candidatura é:",
    successNote: "Nossa equipe analisará sua candidatura e entrará em contato em 5-7 dias úteis para os próximos passos.",
    backToHome: "Voltar ao Início",
    startNew: "Enviar Outra Candidatura",
    name: "Nome Completo / Razão Social",
    namePlaceholder: "Nome legal ou razão social",
    email: "Email",
    emailPlaceholder: "seu@email.com",
    phone: "Telefone",
    phonePlaceholder: "+55 11 99999-9999",
    territory: "Território Desejado",
    territoryPlaceholder: "País, Estado ou Região",
    documentType: "Tipo de Documento",
    cpf: "CPF (Pessoa Física)",
    cnpj: "CNPJ (Empresa)",
    passport: "Passaporte",
    taxId: "ID Fiscal",
    documentNumber: "Número do Documento",
    documentPlaceholder: "Digite o número do documento",
    city: "Cidade",
    cityPlaceholder: "Sua cidade",
    country: "País",
    notes: "Por que você quer ser Master Franchise?",
    notesPlaceholder: "Conte-nos sobre sua experiência, recursos e por que está interessado em se tornar Master Franchise da DELFOS...",
    required: "Este campo é obrigatório",
    invalidEmail: "Endereço de email inválido",
    loginMaster: "Login Master",
    loginFranchisor: "Login Franqueador",
  },
};

const countries = [
  { code: "BRA", name: "Brasil" },
  { code: "USA", name: "United States" },
  { code: "ESP", name: "España" },
  { code: "PRT", name: "Portugal" },
  { code: "MEX", name: "México" },
  { code: "ARG", name: "Argentina" },
  { code: "COL", name: "Colombia" },
  { code: "CHL", name: "Chile" },
  { code: "PER", name: "Perú" },
  { code: "OTHER", name: "Other / Outro" },
];

const formSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  territory: z.string().min(1),
  documentType: z.string().min(1),
  documentNumber: z.string().min(1),
  addressCity: z.string().optional(),
  addressCountry: z.string().min(1),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function MasterFranchiseLanding() {
  const { language } = useLanguage();
  const t = translations[language as keyof typeof translations] || translations.en;
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [masterCode, setMasterCode] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      territory: "",
      documentType: "",
      documentNumber: "",
      addressCity: "",
      addressCountry: "BRA",
      notes: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch("/api/master-leads/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Registration failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setMasterCode(data.masterCode);
      setSubmitted(true);
      toast({
        title: t.success,
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Registration failed",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    submitMutation.mutate(data);
  };

  const nextStep = async () => {
    const fields = step === 1 
      ? ["name", "email", "phone"] as const
      : ["territory", "documentType", "documentNumber", "addressCountry"] as const;
    
    const isValid = await form.trigger(fields);
    if (isValid) {
      setStep(step + 1);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-black/40 border-blue-500/30 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <DelfosLogo />
            </div>
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-400" />
            </div>
            <CardTitle className="text-2xl text-blue-100">{t.success}</CardTitle>
            <CardDescription className="text-blue-200/70">
              {t.successMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-900/50 border border-blue-500/30 rounded-lg p-4 text-center">
              <p className="text-blue-300 text-sm mb-1">Master Code</p>
              <p className="text-2xl font-mono font-bold text-blue-100" data-testid="text-master-code">
                {masterCode}
              </p>
            </div>
            <p className="text-blue-200/70 text-sm text-center">
              {t.successNote}
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/">
                <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white" data-testid="button-back-home">
                  {t.backToHome}
                </Button>
              </Link>
              <Button 
                variant="outline" 
                className="w-full border-blue-500/30 text-blue-200 hover:bg-blue-900/30"
                onClick={() => {
                  setSubmitted(false);
                  setStep(1);
                  form.reset();
                }}
                data-testid="button-new-application"
              >
                {t.startNew}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center mb-8">
          <DelfosLogo />
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-blue-100 mb-2" data-testid="text-title">
              {t.title}
            </h1>
            <p className="text-blue-200/70 text-lg">
              {t.subtitle}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card className="bg-black/30 border-blue-500/20 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl text-blue-100 flex items-center gap-2">
                  <Globe className="h-5 w-5 text-blue-400" />
                  Master Franchise Benefits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-blue-200/70 mb-4">
                  {t.description}
                </p>
                <ul className="space-y-2">
                  {t.benefits.map((benefit, index) => (
                    <li key={index} className="flex items-center gap-2 text-blue-200">
                      <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-blue-500/30 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center gap-4 mb-2">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-blue-900'}`}>
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div className="h-0.5 flex-1 bg-blue-800">
                    <div className={`h-full ${step >= 2 ? 'bg-blue-500' : 'bg-blue-800'}`} style={{ width: step >= 2 ? '100%' : '0%' }} />
                  </div>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-blue-900'}`}>
                    <MapPin className="h-4 w-4 text-white" />
                  </div>
                </div>
                <CardTitle className="text-lg text-blue-100">
                  {step === 1 ? t.step1Title : t.step2Title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {step === 1 && (
                      <>
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-blue-200">{t.name}</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder={t.namePlaceholder}
                                  className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
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
                              <FormLabel className="text-blue-200">{t.email}</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="email"
                                  placeholder={t.emailPlaceholder}
                                  className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                  data-testid="input-email"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-blue-200">{t.phone}</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder={t.phonePlaceholder}
                                  className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                  data-testid="input-phone"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {step === 2 && (
                      <>
                        <FormField
                          control={form.control}
                          name="territory"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-blue-200">{t.territory}</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder={t.territoryPlaceholder}
                                  className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                  data-testid="input-territory"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="documentType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-blue-200">{t.documentType}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="bg-black/30 border-blue-500/30 text-blue-100" data-testid="select-document-type">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="cpf">{t.cpf}</SelectItem>
                                    <SelectItem value="cnpj">{t.cnpj}</SelectItem>
                                    <SelectItem value="passport">{t.passport}</SelectItem>
                                    <SelectItem value="tax_id">{t.taxId}</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="documentNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-blue-200">{t.documentNumber}</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder={t.documentPlaceholder}
                                    className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                    data-testid="input-document-number"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="addressCity"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-blue-200">{t.city}</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder={t.cityPlaceholder}
                                    className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                    data-testid="input-city"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="addressCountry"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-blue-200">{t.country}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="bg-black/30 border-blue-500/30 text-blue-100" data-testid="select-country">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {countries.map((country) => (
                                      <SelectItem key={country.code} value={country.code}>
                                        {country.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-blue-200">{t.notes}</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder={t.notesPlaceholder}
                                  className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50 min-h-[100px]"
                                  data-testid="textarea-notes"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    <div className="flex gap-2">
                      {step > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1 border-blue-500/30 text-blue-200 hover:bg-blue-900/30"
                          onClick={() => setStep(step - 1)}
                          data-testid="button-previous"
                        >
                          {t.previous}
                        </Button>
                      )}
                      
                      {step < 2 ? (
                        <Button
                          type="button"
                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
                          onClick={nextStep}
                          data-testid="button-next"
                        >
                          {t.next}
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
                          disabled={submitMutation.isPending}
                          data-testid="button-submit"
                        >
                          {submitMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t.submitting}
                            </>
                          ) : (
                            t.submit
                          )}
                        </Button>
                      )}
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center gap-4 mt-8">
            <Link href="/login/master_franchise">
              <Button variant="outline" className="border-blue-500/30 text-blue-200 hover:bg-blue-900/30" data-testid="link-login-master">
                <Building2 className="mr-2 h-4 w-4" />
                {t.loginMaster}
              </Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" className="text-blue-300 hover:text-blue-200" data-testid="link-back-home">
                {t.backToHome}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
