import { useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { DelfosLogo } from "@/components/DelfosLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, ArrowLeft, Building2, User, MapPin, Phone, FileText, Loader2, Upload, X, File, Zap, TrendingUp, Crown, Shield, Bot, BarChart3, Check, LogIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ObjectUploader } from "@/components/ObjectUploader";

interface UploadedDocument {
  type: string;
  url: string;
  name: string;
}

const translations = {
  en: {
    title: "Become a DELFOS Franchise",
    subtitle: "Join the leading AI-powered cryptocurrency trading platform",
    step1: "Personal / Business Info",
    step2: "Address",
    step3: "Contact & Documents",
    step4: "Payment",
    next: "Next",
    paymentTitle: "Complete Your Franchise Registration",
    paymentDesc: "Your information has been saved. Complete the payment to finalize your franchise registration.",
    paymentAmount: "Franchise Fee",
    payWithCard: "Pay with Credit Card",
    processingPayment: "Redirecting to payment...",
    paymentNote: "You will be redirected to our secure payment partner (Stripe) to complete your transaction.",
    previous: "Previous",
    submit: "Submit Application",
    submitting: "Submitting...",
    success: "Application Submitted!",
    successMessage: "Your franchise application has been received. Your franchise code is:",
    successNote: "Our team will review your application and contact you within 2-3 business days.",
    backToHome: "Back to Home",
    startNew: "Submit Another Application",
    // Form fields
    selectPlan: "Select a Plan",
    name: "Full Name / Company Name",
    namePlaceholder: "Enter legal name or company name",
    tradeName: "Trade Name (Optional)",
    tradeNamePlaceholder: "Business trading name",
    documentType: "Document Type",
    cpf: "CPF (Individual)",
    cnpj: "CNPJ (Company)",
    documentNumber: "Document Number",
    documentPlaceholder: "Enter CPF or CNPJ",
    secondaryDocument: "RG / State Registration",
    secondaryPlaceholder: "RG for individuals or State Registration for companies",
    birthDate: "Birth Date",
    // Address
    street: "Street",
    streetPlaceholder: "Street name",
    number: "Number",
    numberPlaceholder: "Number",
    complement: "Complement",
    complementPlaceholder: "Apt, Suite, etc.",
    reference: "Reference",
    referencePlaceholder: "Near landmark",
    neighborhood: "Neighborhood",
    neighborhoodPlaceholder: "Neighborhood",
    zipCode: "ZIP Code",
    zipPlaceholder: "Postal code",
    city: "City",
    cityPlaceholder: "City name",
    country: "Country",
    // Contact
    phone: "Phone",
    phonePlaceholder: "+55 11 99999-9999",
    whatsapp: "WhatsApp",
    whatsappPlaceholder: "+55 11 99999-9999",
    email: "Email",
    emailPlaceholder: "your@email.com",
    notes: "Additional Notes",
    notesPlaceholder: "Any additional information you'd like to share",
    // Documents upload
    uploadDocuments: "Upload Documents",
    uploadDocumentsDesc: "Upload required documents (PDF, JPG, PNG - max 5MB each)",
    uploadButton: "Upload Files",
    uploadedFiles: "Uploaded Files",
    noFilesUploaded: "No files uploaded yet",
    removeFile: "Remove",
    // Validation
    required: "This field is required",
    invalidEmail: "Invalid email address",
    invalidDocument: "Invalid document number",
    // Errors
    errorEmailDuplicate: "This email is already registered",
    errorDocumentDuplicate: "This CPF/CNPJ is already registered",
    errorGeneric: "Failed to submit application",
    loginFranchisor: "Franchisor Login",
    loginFranchise: "Franchise Login",
    // Access Portal Section
    accessPortalTitle: "Access Portal",
    accessPortalSubtitle: "Already a member? Access your dashboard",
    franchisorAccess: "Franchisor",
    franchisorAccessDesc: "Platform administration and global management",
    masterAccess: "Master Franchise",
    masterAccessDesc: "Territory management and regional operations",
    franchiseAccess: "Franchise",
    franchiseAccessDesc: "Trading operations and campaign management",
    accessButton: "Access",
    // Marketing Plans Section
    plansTitle: "Choose Your Plan",
    plansSubtitle: "Select the plan that best fits your trading goals",
    chooseThisPlan: "Choose This Plan",
    perMonth: "/month",
    mostPopular: "Most Popular",
    premium: "Premium",
    // Starter Plan
    starterName: "Starter",
    starterTagline: "Perfect for beginners",
    starterDesc: "Start your trading journey with controlled risk and AI guidance. Ideal for those taking their first steps in crypto trading.",
    starterFeature1: "Up to US$ 100,000 in capital",
    starterFeature2: "30 simultaneous campaigns",
    starterFeature3: "Conservative risk profile",
    starterFeature4: "AI alerts and insights",
    starterFeature5: "15% max drawdown protection",
    starterFeature6: "20% performance royalties",
    // Professional Plan
    proName: "Professional",
    proTagline: "For experienced traders",
    proDesc: "Maximize your opportunities with full access to all risk profiles and advanced AI features. Scale your trading operation.",
    proFeature1: "Up to US$ 500,000 in capital",
    proFeature2: "60 simultaneous campaigns",
    proFeature3: "All risk profiles available",
    proFeature4: "Full AI + Opportunity Campaigns",
    proFeature5: "15% max drawdown protection",
    proFeature6: "20% performance royalties",
    // Enterprise Plan
    enterpriseName: "Enterprise",
    enterpriseTagline: "Maximum flexibility",
    enterpriseDesc: "For high-volume operations with virtually unlimited capacity. Full customization and premium support for serious traders.",
    enterpriseFeature1: "Unlimited capital",
    enterpriseFeature2: "200 simultaneous campaigns",
    enterpriseFeature3: "Full customization",
    enterpriseFeature4: "Unlimited Opportunity Campaigns",
    enterpriseFeature5: "15% max drawdown protection",
    enterpriseFeature6: "20% performance royalties",
  },
  es: {
    title: "Sea una Franquicia DELFOS",
    subtitle: "Únase a la plataforma líder de trading de criptomonedas con IA",
    step1: "Info Personal / Empresa",
    step2: "Dirección",
    step3: "Contacto y Documentos",
    step4: "Pago",
    next: "Siguiente",
    paymentTitle: "Complete Su Registro de Franquicia",
    paymentDesc: "Su información ha sido guardada. Complete el pago para finalizar su registro de franquicia.",
    paymentAmount: "Tasa de Franquicia",
    payWithCard: "Pagar con Tarjeta de Crédito",
    processingPayment: "Redirigiendo al pago...",
    paymentNote: "Será redirigido a nuestro socio de pago seguro (Stripe) para completar su transacción.",
    previous: "Anterior",
    submit: "Enviar Solicitud",
    submitting: "Enviando...",
    success: "¡Solicitud Enviada!",
    successMessage: "Su solicitud de franquicia ha sido recibida. Su código de franquicia es:",
    successNote: "Nuestro equipo revisará su solicitud y lo contactará en 2-3 días hábiles.",
    backToHome: "Volver al Inicio",
    startNew: "Enviar Otra Solicitud",
    selectPlan: "Seleccionar Plan",
    name: "Nombre Completo / Razón Social",
    namePlaceholder: "Ingrese nombre legal o razón social",
    tradeName: "Nombre Fantasía (Opcional)",
    tradeNamePlaceholder: "Nombre comercial",
    documentType: "Tipo de Documento",
    cpf: "CPF (Persona Física)",
    cnpj: "CNPJ (Empresa)",
    documentNumber: "Número de Documento",
    documentPlaceholder: "Ingrese CPF o CNPJ",
    secondaryDocument: "RG / Inscripción Estadual",
    secondaryPlaceholder: "RG para personas físicas o Inscripción Estadual para empresas",
    birthDate: "Fecha de Nacimiento",
    street: "Calle",
    streetPlaceholder: "Nombre de la calle",
    number: "Número",
    numberPlaceholder: "Número",
    complement: "Complemento",
    complementPlaceholder: "Depto, Suite, etc.",
    reference: "Referencia",
    referencePlaceholder: "Punto de referencia",
    neighborhood: "Barrio",
    neighborhoodPlaceholder: "Barrio",
    zipCode: "Código Postal",
    zipPlaceholder: "Código postal",
    city: "Ciudad",
    cityPlaceholder: "Nombre de la ciudad",
    country: "País",
    phone: "Teléfono",
    phonePlaceholder: "+55 11 99999-9999",
    whatsapp: "WhatsApp",
    whatsappPlaceholder: "+55 11 99999-9999",
    email: "Email",
    emailPlaceholder: "su@email.com",
    notes: "Notas Adicionales",
    notesPlaceholder: "Información adicional que desee compartir",
    uploadDocuments: "Subir Documentos",
    uploadDocumentsDesc: "Suba los documentos requeridos (PDF, JPG, PNG - máx 5MB cada uno)",
    uploadButton: "Subir Archivos",
    uploadedFiles: "Archivos Subidos",
    noFilesUploaded: "Ningún archivo subido",
    removeFile: "Eliminar",
    required: "Este campo es obligatorio",
    invalidEmail: "Dirección de email inválida",
    invalidDocument: "Número de documento inválido",
    errorEmailDuplicate: "Este email ya está registrado",
    errorDocumentDuplicate: "Este CPF/CNPJ ya está registrado",
    errorGeneric: "Error al enviar la solicitud",
    loginFranchisor: "Login Franqueador",
    loginFranchise: "Login Franquicia",
    // Access Portal Section
    accessPortalTitle: "Portal de Acceso",
    accessPortalSubtitle: "¿Ya eres miembro? Accede a tu panel",
    franchisorAccess: "Franqueador",
    franchisorAccessDesc: "Administración de plataforma y gestión global",
    masterAccess: "Master Franquicia",
    masterAccessDesc: "Gestión de territorios y operaciones regionales",
    franchiseAccess: "Franquicia",
    franchiseAccessDesc: "Operaciones de trading y gestión de campañas",
    accessButton: "Acceder",
    // Marketing Plans Section
    plansTitle: "Elija Su Plan",
    plansSubtitle: "Seleccione el plan que mejor se adapte a sus objetivos de trading",
    chooseThisPlan: "Elegir Este Plan",
    perMonth: "/mes",
    mostPopular: "Más Popular",
    premium: "Premium",
    // Starter Plan
    starterName: "Starter",
    starterTagline: "Perfecto para principiantes",
    starterDesc: "Comience su viaje de trading con riesgo controlado y guía de IA. Ideal para quienes dan sus primeros pasos en cripto.",
    starterFeature1: "Hasta US$ 100,000 en capital",
    starterFeature2: "30 campañas simultáneas",
    starterFeature3: "Perfil de riesgo conservador",
    starterFeature4: "Alertas e insights de IA",
    starterFeature5: "Protección de drawdown máx. 15%",
    starterFeature6: "20% royalties por performance",
    // Professional Plan
    proName: "Professional",
    proTagline: "Para traders experimentados",
    proDesc: "Maximice sus oportunidades con acceso completo a todos los perfiles de riesgo y funciones avanzadas de IA.",
    proFeature1: "Hasta US$ 500,000 en capital",
    proFeature2: "60 campañas simultáneas",
    proFeature3: "Todos los perfiles de riesgo",
    proFeature4: "IA completa + Campañas de Oportunidad",
    proFeature5: "Protección de drawdown máx. 15%",
    proFeature6: "20% royalties por performance",
    // Enterprise Plan
    enterpriseName: "Enterprise",
    enterpriseTagline: "Máxima flexibilidad",
    enterpriseDesc: "Para operaciones de alto volumen con capacidad virtualmente ilimitada. Personalización total para traders serios.",
    enterpriseFeature1: "Capital ilimitado",
    enterpriseFeature2: "200 campañas simultáneas",
    enterpriseFeature3: "Personalización completa",
    enterpriseFeature4: "Campañas de Oportunidad ilimitadas",
    enterpriseFeature5: "Protección de drawdown máx. 15%",
    enterpriseFeature6: "20% royalties por performance",
  },
  "pt-BR": {
    title: "Seja uma Franquia DELFOS",
    subtitle: "Junte-se à plataforma líder de trading de criptomoedas com IA",
    step1: "Dados Pessoais / Empresa",
    step2: "Endereço",
    step3: "Contato e Documentos",
    step4: "Pagamento",
    next: "Próximo",
    paymentTitle: "Complete Seu Registro de Franquia",
    paymentDesc: "Suas informações foram salvas. Complete o pagamento para finalizar seu registro de franquia.",
    paymentAmount: "Taxa de Franquia",
    payWithCard: "Pagar com Cartão de Crédito",
    processingPayment: "Redirecionando para pagamento...",
    paymentNote: "Você será redirecionado para nosso parceiro de pagamento seguro (Stripe) para completar sua transação.",
    previous: "Anterior",
    submit: "Enviar Candidatura",
    submitting: "Enviando...",
    success: "Candidatura Enviada!",
    successMessage: "Sua candidatura de franquia foi recebida. Seu código de franquia é:",
    successNote: "Nossa equipe analisará sua candidatura e entrará em contato em 2-3 dias úteis.",
    backToHome: "Voltar ao Início",
    startNew: "Enviar Outra Candidatura",
    selectPlan: "Selecionar Plano",
    name: "Nome Completo / Razão Social",
    namePlaceholder: "Digite o nome legal ou razão social",
    tradeName: "Nome Fantasia (Opcional)",
    tradeNamePlaceholder: "Nome comercial",
    documentType: "Tipo de Documento",
    cpf: "CPF (Pessoa Física)",
    cnpj: "CNPJ (Pessoa Jurídica)",
    documentNumber: "Número do Documento",
    documentPlaceholder: "Digite CPF ou CNPJ",
    secondaryDocument: "RG / Inscrição Estadual",
    secondaryPlaceholder: "RG para pessoa física ou Inscrição Estadual para empresa",
    birthDate: "Data de Nascimento",
    street: "Rua",
    streetPlaceholder: "Nome da rua",
    number: "Número",
    numberPlaceholder: "Número",
    complement: "Complemento",
    complementPlaceholder: "Apto, Sala, etc.",
    reference: "Referência",
    referencePlaceholder: "Ponto de referência",
    neighborhood: "Bairro",
    neighborhoodPlaceholder: "Bairro",
    zipCode: "CEP",
    zipPlaceholder: "CEP",
    city: "Cidade",
    cityPlaceholder: "Nome da cidade",
    country: "País",
    phone: "Telefone",
    phonePlaceholder: "+55 11 99999-9999",
    whatsapp: "WhatsApp",
    whatsappPlaceholder: "+55 11 99999-9999",
    email: "E-mail",
    emailPlaceholder: "seu@email.com",
    notes: "Observações",
    notesPlaceholder: "Informações adicionais que deseja compartilhar",
    uploadDocuments: "Enviar Documentos",
    uploadDocumentsDesc: "Envie os documentos necessários (PDF, JPG, PNG - máx 5MB cada)",
    uploadButton: "Enviar Arquivos",
    uploadedFiles: "Arquivos Enviados",
    noFilesUploaded: "Nenhum arquivo enviado",
    removeFile: "Remover",
    required: "Este campo é obrigatório",
    invalidEmail: "Endereço de e-mail inválido",
    invalidDocument: "Número de documento inválido",
    errorEmailDuplicate: "Este e-mail já está cadastrado",
    errorDocumentDuplicate: "Este CPF/CNPJ já está cadastrado",
    errorGeneric: "Falha ao enviar candidatura",
    loginFranchisor: "Login Franqueadora",
    loginFranchise: "Login Franquia",
    // Access Portal Section
    accessPortalTitle: "Portal de Acesso",
    accessPortalSubtitle: "Já é membro? Acesse seu painel",
    franchisorAccess: "Franqueadora",
    franchisorAccessDesc: "Administração da plataforma e gestão global",
    masterAccess: "Master Franquia",
    masterAccessDesc: "Gestão de territórios e operações regionais",
    franchiseAccess: "Franquia",
    franchiseAccessDesc: "Operações de trading e gestão de campanhas",
    accessButton: "Acessar",
    // Marketing Plans Section
    plansTitle: "Escolha Seu Plano",
    plansSubtitle: "Selecione o plano que melhor se adapta aos seus objetivos de trading",
    chooseThisPlan: "Escolher Este Plano",
    perMonth: "/mês",
    mostPopular: "Mais Popular",
    premium: "Premium",
    // Starter Plan
    starterName: "Starter",
    starterTagline: "Perfeito para iniciantes",
    starterDesc: "Comece sua jornada de trading com risco controlado e orientação de IA. Ideal para quem está dando os primeiros passos em cripto.",
    starterFeature1: "Até US$ 100.000 em capital",
    starterFeature2: "30 campanhas simultâneas",
    starterFeature3: "Perfil de risco conservador",
    starterFeature4: "Alertas e insights de IA",
    starterFeature5: "Proteção de drawdown máx. 15%",
    starterFeature6: "20% royalties por performance",
    // Professional Plan
    proName: "Professional",
    proTagline: "Para traders experientes",
    proDesc: "Maximize suas oportunidades com acesso completo a todos os perfis de risco e recursos avançados de IA.",
    proFeature1: "Até US$ 500.000 em capital",
    proFeature2: "60 campanhas simultâneas",
    proFeature3: "Todos os perfis de risco",
    proFeature4: "IA completa + Campanhas de Oportunidade",
    proFeature5: "Proteção de drawdown máx. 15%",
    proFeature6: "20% royalties por performance",
    // Enterprise Plan
    enterpriseName: "Enterprise",
    enterpriseTagline: "Máxima flexibilidade",
    enterpriseDesc: "Para operações de alto volume com capacidade virtualmente ilimitada. Personalização total para traders sérios.",
    enterpriseFeature1: "Capital ilimitado",
    enterpriseFeature2: "200 campanhas simultâneas",
    enterpriseFeature3: "Personalização completa",
    enterpriseFeature4: "Campanhas de Oportunidade ilimitadas",
    enterpriseFeature5: "Proteção de drawdown máx. 15%",
    enterpriseFeature6: "20% royalties por performance",
  },
};

const formSchema = z.object({
  planId: z.string().optional(),
  name: z.string().min(3, "Name must be at least 3 characters"),
  tradeName: z.string().optional(),
  documentType: z.enum(["cpf", "cnpj"]),
  documentNumber: z.string().min(11, "Document number is required"),
  secondaryDocument: z.string().optional(),
  birthDate: z.string().optional(),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressComplement: z.string().optional(),
  addressReference: z.string().optional(),
  addressNeighborhood: z.string().optional(),
  addressZip: z.string().optional(),
  addressCity: z.string().optional(),
  addressCountry: z.string().default("BRA"),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email("Invalid email address"),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// Plan visual styling (static - design only)
const PLAN_STYLES = {
  starter: {
    icon: Zap,
    color: "from-cyan-500 to-blue-600",
    borderColor: "border-cyan-500/50",
    checkColor: "text-cyan-400",
  },
  pro: {
    icon: TrendingUp,
    color: "from-violet-500 to-purple-600",
    borderColor: "border-violet-500/50",
    checkColor: "text-violet-400",
    popular: true,
  },
  enterprise: {
    icon: Crown,
    color: "from-amber-500 to-orange-600",
    borderColor: "border-amber-500/50",
    checkColor: "text-amber-400",
    premium: true,
  },
};

// Helper to format price from USD to BRL display
const formatPlanPrice = (priceUsd: string | null | undefined): string => {
  if (!priceUsd) return "R$ 0";
  const num = parseFloat(priceUsd);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// Helper to get plan style by code
const getPlanStyle = (code: string) => {
  const normalizedCode = code.toLowerCase();
  if (normalizedCode === "starter") return PLAN_STYLES.starter;
  if (normalizedCode === "pro" || normalizedCode === "professional") return PLAN_STYLES.pro;
  if (normalizedCode === "enterprise") return PLAN_STYLES.enterprise;
  return PLAN_STYLES.starter;
};

export default function FranchiseLanding() {
  const { language } = useLanguage();
  const t = translations[language] || translations.en;
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [franchiseCode, setFranchiseCode] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const pendingObjectPaths = useRef<Map<string, string>>(new Map());

  const handleSelectPlan = (planId: string | undefined | null) => {
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
    form.setValue("planId", planId);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleUploadComplete = useCallback((result: any) => {
    if (result.successful && result.successful.length > 0) {
      const newDocs: UploadedDocument[] = result.successful.map((file: any) => {
        const storedPath = pendingObjectPaths.current.get(file.id) || `/objects/uploads/${file.id}`;
        pendingObjectPaths.current.delete(file.id);
        return {
          type: "document",
          url: storedPath,
          name: file.name || "Document",
        };
      });
      setUploadedDocuments(prev => [...prev, ...newDocs]);
      toast({
        title: language === "pt-BR" ? "Sucesso" : language === "es" ? "Éxito" : "Success",
        description: language === "pt-BR" 
          ? "Arquivo enviado com sucesso" 
          : language === "es" 
          ? "Archivo subido exitosamente" 
          : "File uploaded successfully",
      });
    }
  }, [toast, language]);

  const removeDocument = useCallback((index: number) => {
    setUploadedDocuments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const getUploadParameters = useCallback(async (file: any) => {
    const res = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type,
      }),
    });
    const { uploadURL, objectPath } = await res.json();
    pendingObjectPaths.current.set(file.id, objectPath);
    return {
      method: "PUT" as const,
      url: uploadURL,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    };
  }, []);

  // Fetch plans dynamically from database - prices controlled by Franchisor settings
  const { data: plansData, isLoading: plansLoading } = useQuery<any[]>({
    queryKey: ["/api/franchise-plans"],
  });
  
  // Sort plans by display_order and get by code
  const getPlanByCode = (code: string) => {
    if (!plansData) return null;
    return plansData.find(p => p.code?.toLowerCase() === code.toLowerCase());
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      documentType: "cpf",
      addressCountry: "BRA",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return await apiRequest<{ success: boolean; franchiseCode: string; leadId: string; message: string }>(
        "/api/franchise-leads/register",
        "POST",
        {
          ...data,
          documentsUrls: uploadedDocuments,
        }
      );
    },
    onSuccess: (data) => {
      setFranchiseCode(data.franchiseCode);
      setLeadId(data.leadId);
      setStep(4);
    },
    onError: (error: any) => {
      let description = t.errorGeneric;
      if (error.message?.includes("email_already_registered")) {
        description = t.errorEmailDuplicate;
      } else if (error.message?.includes("document_already_registered")) {
        description = t.errorDocumentDuplicate;
      } else if (error.message) {
        description = error.message;
      }
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    submitMutation.mutate(data);
  };

  const nextStep = async () => {
    let fieldsToValidate: (keyof FormData)[] = [];
    if (step === 1) {
      fieldsToValidate = ["name", "documentType", "documentNumber", "email"];
    } else if (step === 2) {
      fieldsToValidate = ["addressStreet", "addressCity"];
    }
    
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setStep(step + 1);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <CardTitle className="text-2xl">{t.success}</CardTitle>
            <CardDescription className="text-base">{t.successMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-primary/10 rounded-lg p-4">
              <code className="text-2xl font-bold text-primary" data-testid="text-franchise-code">
                {franchiseCode}
              </code>
            </div>
            <p className="text-sm text-muted-foreground">{t.successNote}</p>
            <div className="flex flex-col gap-2">
              <Link href="/">
                <Button variant="outline" className="w-full" data-testid="button-back-home">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t.backToHome}
                </Button>
              </Link>
              <Button 
                variant="ghost" 
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="p-4 flex items-center justify-between">
        <Link href="/">
          <DelfosLogo variant="full" className="h-10" />
        </Link>
        <div className="flex gap-2">
          <Link href="/login/franchisor">
            <Button variant="ghost" size="sm" data-testid="link-login-franchisor">
              {t.loginFranchisor}
            </Button>
          </Link>
          <Link href="/login/franchise">
            <Button variant="outline" size="sm" data-testid="link-login-franchise">
              {t.loginFranchise}
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="text-center mb-8 max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{t.title}</h1>
          <p className="text-slate-400">{t.subtitle}</p>
        </div>

        {/* Marketing Plans Section */}
        <section className="mb-12 max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">{t.plansTitle}</h2>
            <p className="text-slate-400">{t.plansSubtitle}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plansLoading ? (
              <div className="col-span-3 flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              </div>
            ) : (
              <>
                {/* Starter Plan - Dynamic Price from Database */}
                {(() => {
                  const plan = getPlanByCode("starter");
                  const style = PLAN_STYLES.starter;
                  const IconComponent = style.icon;
                  return (
                    <Card 
                      className={`relative overflow-visible border-2 ${style.borderColor} bg-slate-800/50 backdrop-blur cursor-pointer transition-all ${plan ? 'hover-elevate' : 'opacity-50'}`}
                      onClick={() => handleSelectPlan(plan?.id)}
                      data-testid="card-plan-starter"
                    >
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.color}`} />
                      <CardHeader className="text-center pb-2">
                        <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-r ${style.color} flex items-center justify-center mb-3`}>
                          <IconComponent className="w-7 h-7 text-white" />
                        </div>
                        <CardTitle className="text-xl text-white">{t.starterName}</CardTitle>
                        <CardDescription className="text-cyan-400">{t.starterTagline}</CardDescription>
                      </CardHeader>
                      <CardContent className="text-center">
                        <div className="mb-4">
                          <span className="text-3xl font-bold text-white" data-testid="price-starter">
                            {formatPlanPrice(plan?.franchise_fee_usd)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 mb-4">{t.starterDesc}</p>
                        <ul className="space-y-2 text-left mb-6">
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.starterFeature1}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.starterFeature2}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.starterFeature3}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.starterFeature4}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Shield className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.starterFeature5}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <BarChart3 className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.starterFeature6}
                          </li>
                        </ul>
                        <Button 
                          className={`w-full bg-gradient-to-r ${style.color} hover:opacity-90`}
                          data-testid="button-select-starter"
                          disabled={!plan}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectPlan(plan?.id);
                          }}
                        >
                          {t.chooseThisPlan}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Professional Plan - Dynamic Price from Database */}
                {(() => {
                  const plan = getPlanByCode("pro");
                  const style = PLAN_STYLES.pro;
                  const IconComponent = style.icon;
                  return (
                    <Card 
                      className={`relative overflow-visible border-2 ${style.borderColor} bg-slate-800/50 backdrop-blur cursor-pointer transition-all scale-105 shadow-xl shadow-violet-500/20 ${plan ? 'hover-elevate' : 'opacity-50'}`}
                      onClick={() => handleSelectPlan(plan?.id)}
                      data-testid="card-plan-professional"
                    >
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0">
                        {t.mostPopular}
                      </Badge>
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.color}`} />
                      <CardHeader className="text-center pb-2">
                        <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-r ${style.color} flex items-center justify-center mb-3`}>
                          <IconComponent className="w-7 h-7 text-white" />
                        </div>
                        <CardTitle className="text-xl text-white">{t.proName}</CardTitle>
                        <CardDescription className="text-violet-400">{t.proTagline}</CardDescription>
                      </CardHeader>
                      <CardContent className="text-center">
                        <div className="mb-4">
                          <span className="text-3xl font-bold text-white" data-testid="price-professional">
                            {formatPlanPrice(plan?.franchise_fee_usd)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 mb-4">{t.proDesc}</p>
                        <ul className="space-y-2 text-left mb-6">
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.proFeature1}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.proFeature2}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.proFeature3}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Bot className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.proFeature4}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Shield className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.proFeature5}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <BarChart3 className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.proFeature6}
                          </li>
                        </ul>
                        <Button 
                          className={`w-full bg-gradient-to-r ${style.color} hover:opacity-90`}
                          data-testid="button-select-professional"
                          disabled={!plan}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectPlan(plan?.id);
                          }}
                        >
                          {t.chooseThisPlan}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Enterprise Plan - Dynamic Price from Database */}
                {(() => {
                  const plan = getPlanByCode("enterprise");
                  const style = PLAN_STYLES.enterprise;
                  const IconComponent = style.icon;
                  return (
                    <Card 
                      className={`relative overflow-visible border-2 ${style.borderColor} bg-slate-800/50 backdrop-blur cursor-pointer transition-all ${plan ? 'hover-elevate' : 'opacity-50'}`}
                      onClick={() => handleSelectPlan(plan?.id)}
                      data-testid="card-plan-enterprise"
                    >
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0">
                        {t.premium}
                      </Badge>
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.color}`} />
                      <CardHeader className="text-center pb-2">
                        <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-r ${style.color} flex items-center justify-center mb-3`}>
                          <IconComponent className="w-7 h-7 text-white" />
                        </div>
                        <CardTitle className="text-xl text-white">{t.enterpriseName}</CardTitle>
                        <CardDescription className="text-amber-400">{t.enterpriseTagline}</CardDescription>
                      </CardHeader>
                      <CardContent className="text-center">
                        <div className="mb-4">
                          <span className="text-3xl font-bold text-white" data-testid="price-enterprise">
                            {formatPlanPrice(plan?.franchise_fee_usd)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 mb-4">{t.enterpriseDesc}</p>
                        <ul className="space-y-2 text-left mb-6">
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.enterpriseFeature1}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.enterpriseFeature2}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.enterpriseFeature3}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Bot className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.enterpriseFeature4}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <Shield className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.enterpriseFeature5}
                          </li>
                          <li className="flex items-center gap-2 text-sm text-slate-300">
                            <BarChart3 className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                            {t.enterpriseFeature6}
                          </li>
                        </ul>
                        <Button 
                          className={`w-full bg-gradient-to-r ${style.color} hover:opacity-90`}
                          data-testid="button-select-enterprise"
                          disabled={!plan}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectPlan(plan?.id);
                          }}
                        >
                          {t.chooseThisPlan}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })()}
              </>
            )}
          </div>
        </section>

        {/* Access Portal Section */}
        <section className="py-16 -mx-4 px-4 md:-mx-8 md:px-8 bg-gradient-to-b from-slate-900/50 via-slate-800/80 to-slate-900/50 border-y border-slate-700/50 mb-12">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center gap-2 bg-slate-700/50 rounded-full px-4 py-2 mb-4">
                <LogIn className="w-5 h-5 text-cyan-400" />
                <span className="text-sm font-medium text-cyan-400">{t.accessPortalTitle}</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">{t.accessPortalTitle}</h2>
              <p className="text-lg text-slate-300">{t.accessPortalSubtitle}</p>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Franchisor Access Card - Amber/Gold */}
            <Link href="/login/franchisor">
              <Card 
                className="relative overflow-visible border-2 border-amber-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate"
                data-testid="card-access-franchisor"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-yellow-600" />
                <CardHeader className="text-center pb-2">
                  <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-amber-500 to-yellow-600 flex items-center justify-center mb-3">
                    <Crown className="w-7 h-7 text-white" />
                  </div>
                  <CardTitle className="text-xl text-white">{t.franchisorAccess}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-sm text-slate-300 mb-4">{t.franchisorAccessDesc}</p>
                  <Button 
                    className="w-full bg-gradient-to-r from-amber-500 to-yellow-600"
                    data-testid="button-access-franchisor"
                  >
                    {t.accessButton}
                  </Button>
                </CardContent>
              </Card>
            </Link>

            {/* Master Franchise Access Card - Blue */}
            <Link href="/login/master">
              <Card 
                className="relative overflow-visible border-2 border-blue-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate"
                data-testid="card-access-master"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
                <CardHeader className="text-center pb-2">
                  <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center mb-3">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>
                  <CardTitle className="text-xl text-white">{t.masterAccess}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-sm text-slate-300 mb-4">{t.masterAccessDesc}</p>
                  <Button 
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600"
                    data-testid="button-access-master"
                  >
                    {t.accessButton}
                  </Button>
                </CardContent>
              </Card>
            </Link>

            {/* Franchise Access Card - Cyan */}
            <Link href="/login/franchise">
              <Card 
                className="relative overflow-visible border-2 border-cyan-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate"
                data-testid="card-access-franchise"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 to-teal-600" />
                <CardHeader className="text-center pb-2">
                  <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-cyan-500 to-teal-600 flex items-center justify-center mb-3">
                    <TrendingUp className="w-7 h-7 text-white" />
                  </div>
                  <CardTitle className="text-xl text-white">{t.franchiseAccess}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-sm text-slate-300 mb-4">{t.franchiseAccessDesc}</p>
                  <Button 
                    className="w-full bg-gradient-to-r from-cyan-500 to-teal-600"
                    data-testid="button-access-franchise"
                  >
                    {t.accessButton}
                  </Button>
                </CardContent>
              </Card>
            </Link>
          </div>
          </div>
        </section>

        {/* Registration Form - shown after plan selection */}
        <div ref={formRef} className="max-w-2xl mx-auto">
        {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      s === step
                        ? "bg-primary text-primary-foreground"
                        : s < step
                        ? "bg-green-500 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s < step ? <Check className="w-4 h-4" /> : s}
                  </div>
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                {step === 1 && t.step1}
                {step === 2 && t.step2}
                {step === 3 && t.step3}
                {step === 4 && t.step4}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {step === 1 && (
                  <>
                    <div className="flex items-center gap-2 text-lg font-medium mb-4">
                      <User className="w-5 h-5" />
                      {t.step1}
                    </div>

                    {plansData && Array.isArray(plansData) && plansData.length > 0 && (
                      <FormField
                        control={form.control}
                        name="planId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.selectPlan}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-plan">
                                  <SelectValue placeholder={t.selectPlan} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {plansData.map((plan: any) => (
                                  <SelectItem key={plan.id} value={plan.id}>
                                    {plan.name} - {formatPlanPrice(plan.franchise_fee_usd)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.name} *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={t.namePlaceholder} data-testid="input-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="tradeName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.tradeName}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={t.tradeNamePlaceholder} data-testid="input-trade-name" />
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
                            <FormLabel>{t.documentType} *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-document-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="cpf">{t.cpf}</SelectItem>
                                <SelectItem value="cnpj">{t.cnpj}</SelectItem>
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
                            <FormLabel>{t.documentNumber} *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t.documentPlaceholder} data-testid="input-document" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="secondaryDocument"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.secondaryDocument}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={t.secondaryPlaceholder} data-testid="input-secondary-doc" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="birthDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.birthDate}</FormLabel>
                          <FormControl>
                            <Input {...field} type="date" data-testid="input-birth-date" />
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
                          <FormLabel>{t.email} *</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" placeholder={t.emailPlaceholder} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="flex items-center gap-2 text-lg font-medium mb-4">
                      <MapPin className="w-5 h-5" />
                      {t.step2}
                    </div>

                    <FormField
                      control={form.control}
                      name="addressStreet"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.street}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={t.streetPlaceholder} data-testid="input-street" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="addressNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.number}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t.numberPlaceholder} data-testid="input-number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="addressComplement"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>{t.complement}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t.complementPlaceholder} data-testid="input-complement" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="addressReference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.reference}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={t.referencePlaceholder} data-testid="input-reference" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="addressNeighborhood"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.neighborhood}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t.neighborhoodPlaceholder} data-testid="input-neighborhood" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="addressZip"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.zipCode}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t.zipPlaceholder} data-testid="input-zip" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="addressCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.city}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={t.cityPlaceholder} data-testid="input-city" />
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
                          <FormLabel>{t.country}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-country">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="BRA">Brasil</SelectItem>
                              <SelectItem value="USA">United States</SelectItem>
                              <SelectItem value="MEX">México</SelectItem>
                              <SelectItem value="ARG">Argentina</SelectItem>
                              <SelectItem value="COL">Colombia</SelectItem>
                              <SelectItem value="PER">Perú</SelectItem>
                              <SelectItem value="CHL">Chile</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="flex items-center gap-2 text-lg font-medium mb-4">
                      <Phone className="w-5 h-5" />
                      {t.step3}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.phone}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t.phonePlaceholder} data-testid="input-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="whatsapp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.whatsapp}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t.whatsappPlaceholder} data-testid="input-whatsapp" />
                            </FormControl>
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
                          <FormLabel>{t.notes}</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder={t.notesPlaceholder}
                              rows={4}
                              data-testid="input-notes"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        <div>
                          <Label className="text-base font-medium">{t.uploadDocuments}</Label>
                          <p className="text-sm text-muted-foreground">{t.uploadDocumentsDesc}</p>
                        </div>
                      </div>

                      <ObjectUploader
                        maxNumberOfFiles={5}
                        maxFileSize={5242880}
                        onGetUploadParameters={getUploadParameters}
                        onComplete={handleUploadComplete}
                        buttonClassName="w-full"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {t.uploadButton}
                      </ObjectUploader>

                      {uploadedDocuments.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm">{t.uploadedFiles}</Label>
                          <div className="space-y-2">
                            {uploadedDocuments.map((doc, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-2 bg-muted rounded-md"
                                data-testid={`uploaded-file-${index}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <File className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                  <span className="text-sm truncate">{doc.name}</span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeDocument(index)}
                                  data-testid={`button-remove-file-${index}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {uploadedDocuments.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">{t.noFilesUploaded}</p>
                      )}
                    </div>
                  </>
                )}

                {step === 4 && (
                  <>
                    <div className="flex items-center gap-2 text-lg font-medium mb-4">
                      <Shield className="w-5 h-5" />
                      {t.step4}
                    </div>

                    <div className="space-y-6">
                      <div className="text-center space-y-2">
                        <h3 className="text-xl font-semibold">{t.paymentTitle}</h3>
                        <p className="text-muted-foreground">{t.paymentDesc}</p>
                      </div>

                      {selectedPlanId && plansData && (() => {
                        const selectedPlan = plansData.find((p: any) => p.id === selectedPlanId);
                        if (!selectedPlan) return null;
                        const style = getPlanStyle(selectedPlan.code || "starter");
                        return (
                          <div className={`p-4 rounded-lg border ${style.borderColor} bg-gradient-to-r ${style.color}/10`}>
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-medium">{selectedPlan.name}</p>
                                <p className="text-sm text-muted-foreground">{t.paymentAmount}</p>
                              </div>
                              <div className="text-2xl font-bold" data-testid="payment-amount">
                                {formatPlanPrice(selectedPlan.franchise_fee_usd)}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="space-y-3">
                        <Button
                          type="button"
                          className="w-full"
                          size="lg"
                          disabled={isProcessingPayment || !leadId}
                          onClick={async () => {
                            if (!leadId || !selectedPlanId) return;
                            setIsProcessingPayment(true);
                            try {
                              const response = await apiRequest<{ checkoutUrl: string; sessionId: string }>(
                                `/api/franchise-leads/${leadId}/checkout`, 
                                "POST", 
                                { planId: selectedPlanId }
                              );
                              if (response.checkoutUrl) {
                                window.location.href = response.checkoutUrl;
                              }
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.message || "Failed to create checkout session",
                                variant: "destructive",
                              });
                              setIsProcessingPayment(false);
                            }
                          }}
                          data-testid="button-pay"
                        >
                          {isProcessingPayment ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {t.processingPayment}
                            </>
                          ) : (
                            t.payWithCard
                          )}
                        </Button>

                        <p className="text-xs text-center text-muted-foreground">
                          {t.paymentNote}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {step < 4 && (
                  <div className="flex justify-between pt-4">
                    {step > 1 ? (
                      <Button type="button" variant="outline" onClick={() => setStep(step - 1)} data-testid="button-previous">
                        {t.previous}
                      </Button>
                    ) : (
                      <div />
                    )}

                    {step < 3 ? (
                      <Button type="button" onClick={nextStep} data-testid="button-next">
                        {t.next}
                      </Button>
                    ) : (
                      <Button type="submit" disabled={submitMutation.isPending} data-testid="button-submit">
                        {submitMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {t.submitting}
                          </>
                        ) : (
                          t.submit
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>
        )}
        </div>
      </main>
    </div>
  );
}
