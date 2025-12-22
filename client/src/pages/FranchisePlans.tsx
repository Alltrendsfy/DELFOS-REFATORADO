import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  Plus, 
  Building2, 
  FileText, 
  DollarSign, 
  Target, 
  TrendingUp, 
  Shield, 
  Brain, 
  Zap, 
  Percent, 
  Scale, 
  History,
  Check,
  Archive,
  Copy,
  Eye,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Settings
} from "lucide-react";
import type { FranchisePlan, FranchisePlanVersion } from "@shared/schema";
import { ProtectedRoute } from '@/components/ProtectedRoute';

type PlanWithVersion = FranchisePlan & {
  activeVersion: FranchisePlanVersion | null;
  versionCount: number;
};

type PlanWithVersions = {
  plan: FranchisePlan;
  version: FranchisePlanVersion | null;
  versions: FranchisePlanVersion[];
};

const TAB_LABELS = {
  en: {
    identification: "Identification",
    franchiseFee: "Franchise Fee",
    campaignLimits: "Campaign Limits",
    capitalExposure: "Capital & Exposure",
    riskProfiles: "Risk Profiles",
    aiOpportunity: "AI & Opportunities",
    triggersAutomation: "Triggers & Automation",
    royalties: "Royalties",
    governance: "Governance",
    auditHistory: "Audit History",
  },
  es: {
    identification: "Identificación",
    franchiseFee: "Tasa de Franquicia",
    campaignLimits: "Límites de Campañas",
    capitalExposure: "Capital y Exposición",
    riskProfiles: "Perfiles de Riesgo",
    aiOpportunity: "IA y Oportunidades",
    triggersAutomation: "Gatillos y Automatización",
    royalties: "Royalties",
    governance: "Gobernanza",
    auditHistory: "Historial de Auditoría",
  },
  "pt-BR": {
    identification: "Identificação",
    franchiseFee: "Taxa de Franquia",
    campaignLimits: "Limites de Campanhas",
    capitalExposure: "Capital e Exposição",
    riskProfiles: "Perfis de Risco",
    aiOpportunity: "IA e Oportunidades",
    triggersAutomation: "Gatilhos e Automação",
    royalties: "Royalties",
    governance: "Governança",
    auditHistory: "Histórico de Auditoria",
  },
};

const TRANSLATIONS = {
  en: {
    title: "Franchise Plans",
    subtitle: "Manage franchise plan configurations and versions",
    newPlan: "New Plan",
    createPlan: "Create Plan",
    editVersion: "Edit Version",
    viewVersion: "View Version",
    createVersion: "Create New Version",
    activateVersion: "Activate Version",
    archiveVersion: "Archive Version",
    duplicateVersion: "Duplicate Version",
    planName: "Plan Name",
    planCode: "Plan Code",
    planType: "Plan Type",
    description: "Description",
    versions: "versions",
    noActiveVersion: "No active version",
    version: "Version",
    draft: "Draft",
    active: "Active",
    archived: "Archived",
    loading: "Loading...",
    save: "Save",
    cancel: "Cancel",
    next: "Next",
    previous: "Previous",
    planTypes: {
      starter: "Starter",
      pro: "Professional",
      enterprise: "Enterprise",
      custom: "Custom",
    } as Record<string, string>,
    franchiseFeeValue: "Fee Value (R$)",
    periodicity: "Periodicity",
    months: "months",
    firstDueOffset: "Days until first payment",
    paymentMethods: "Payment Methods",
    autoAdjustment: "Automatic Adjustment",
    adjustmentIndex: "Adjustment Index",
    latePenalty: "Late Payment Penalty (%)",
    lateInterest: "Monthly Interest (%)",
    toleranceDays: "Tolerance Days",
    maxSimultaneous: "Max Simultaneous Campaigns",
    maxStandard: "Max Standard Campaigns",
    maxOpportunity: "Max Opportunity Campaigns (CO)",
    cooldownHours: "Cooldown Between Campaigns (hours)",
    maxTotalCapital: "Max Total Capital",
    maxPerCampaign: "Max per Campaign (%)",
    maxPerCO: "Max per CO (%)",
    maxPerAsset: "Max Exposure per Asset (%)",
    maxPerCluster: "Max Exposure per Cluster (%)",
    allowedProfiles: "Allowed Risk Profiles",
    maxRiskPerTrade: "Max Risk per Trade (%)",
    maxDrawdown: "Max Drawdown per Campaign (%)",
    allowCustomization: "Allow Risk Customization",
    aiAccessLevel: "AI Access Level",
    maxCOsPerPeriod: "Max COs per Period",
    coPeriodDays: "CO Period (days)",
    minOpportunityScore: "Min Opportunity Score",
    allowBlueprintAdjust: "Allow Blueprint Adjustment",
    riskTriggers: "Risk Triggers",
    perfTriggers: "Performance Triggers",
    benchTriggers: "Benchmark Triggers",
    autoRebalance: "Auto Rebalance",
    auditFrequency: "Min Audit Frequency (hours)",
    royaltyModel: "Royalty Model",
    royaltyMin: "Royalty Min (%)",
    royaltyMax: "Royalty Max (%)",
    royaltyAppliesCO: "Royalties Apply to COs",
    royaltyPeriod: "Calculation Period",
    auditLevel: "Audit Level",
    autoDowngrade: "Allow Auto Downgrade",
    suspensionDays: "Days Before Suspension",
    antifraudTolerance: "Antifraud Tolerance",
    noPlan: "Select a plan to view details",
    noPlans: "No franchise plans configured",
    createFirst: "Create your first franchise plan",
    versionNotes: "Version Notes",
  },
  es: {
    title: "Planes de Franquicia",
    subtitle: "Gestione configuraciones y versiones de planes",
    newPlan: "Nuevo Plan",
    createPlan: "Crear Plan",
    editVersion: "Editar Versión",
    viewVersion: "Ver Versión",
    createVersion: "Crear Nueva Versión",
    activateVersion: "Activar Versión",
    archiveVersion: "Archivar Versión",
    duplicateVersion: "Duplicar Versión",
    planName: "Nombre del Plan",
    planCode: "Código del Plan",
    planType: "Tipo de Plan",
    description: "Descripción",
    versions: "versiones",
    noActiveVersion: "Sin versión activa",
    version: "Versión",
    draft: "Borrador",
    active: "Activo",
    archived: "Archivado",
    loading: "Cargando...",
    save: "Guardar",
    cancel: "Cancelar",
    next: "Siguiente",
    previous: "Anterior",
    planTypes: {
      starter: "Inicial",
      pro: "Profesional",
      enterprise: "Empresarial",
      custom: "Personalizado",
    },
    franchiseFeeValue: "Valor de la Tasa (R$)",
    periodicity: "Periodicidad",
    months: "meses",
    firstDueOffset: "Días hasta primer pago",
    paymentMethods: "Métodos de Pago",
    autoAdjustment: "Ajuste Automático",
    adjustmentIndex: "Índice de Ajuste",
    latePenalty: "Multa por Atraso (%)",
    lateInterest: "Interés Mensual (%)",
    toleranceDays: "Días de Tolerancia",
    maxSimultaneous: "Máx. Campañas Simultáneas",
    maxStandard: "Máx. Campañas Estándar",
    maxOpportunity: "Máx. Campañas de Oportunidad (CO)",
    cooldownHours: "Enfriamiento Entre Campañas (horas)",
    maxTotalCapital: "Capital Total Máximo",
    maxPerCampaign: "Máx. por Campaña (%)",
    maxPerCO: "Máx. por CO (%)",
    maxPerAsset: "Máx. Exposición por Activo (%)",
    maxPerCluster: "Máx. Exposición por Cluster (%)",
    allowedProfiles: "Perfiles de Riesgo Permitidos",
    maxRiskPerTrade: "Riesgo Máx. por Operación (%)",
    maxDrawdown: "Drawdown Máx. por Campaña (%)",
    allowCustomization: "Permitir Personalización de Riesgo",
    aiAccessLevel: "Nivel de Acceso IA",
    maxCOsPerPeriod: "Máx. COs por Período",
    coPeriodDays: "Período de CO (días)",
    minOpportunityScore: "Puntuación Mín. de Oportunidad",
    allowBlueprintAdjust: "Permitir Ajuste de Blueprint",
    riskTriggers: "Gatillos de Riesgo",
    perfTriggers: "Gatillos de Performance",
    benchTriggers: "Gatillos de Benchmark",
    autoRebalance: "Rebalanceo Automático",
    auditFrequency: "Frecuencia Mín. de Auditoría (horas)",
    royaltyModel: "Modelo de Royalty",
    royaltyMin: "Royalty Mín. (%)",
    royaltyMax: "Royalty Máx. (%)",
    royaltyAppliesCO: "Royalties Aplican a COs",
    royaltyPeriod: "Período de Cálculo",
    auditLevel: "Nivel de Auditoría",
    autoDowngrade: "Permitir Rebaja Automática",
    suspensionDays: "Días Antes de Suspensión",
    antifraudTolerance: "Tolerancia Antifraude",
    noPlan: "Seleccione un plan para ver detalles",
    noPlans: "No hay planes de franquicia configurados",
    createFirst: "Cree su primer plan de franquicia",
    versionNotes: "Notas de la Versión",
  },
  "pt-BR": {
    title: "Planos de Franquia",
    subtitle: "Gerencie configurações e versões dos planos",
    newPlan: "Novo Plano",
    createPlan: "Criar Plano",
    editVersion: "Editar Versão",
    viewVersion: "Ver Versão",
    createVersion: "Criar Nova Versão",
    activateVersion: "Ativar Versão",
    archiveVersion: "Arquivar Versão",
    duplicateVersion: "Duplicar Versão",
    planName: "Nome do Plano",
    planCode: "Código do Plano",
    planType: "Tipo do Plano",
    description: "Descrição",
    versions: "versões",
    noActiveVersion: "Sem versão ativa",
    version: "Versão",
    draft: "Rascunho",
    active: "Ativo",
    archived: "Arquivado",
    loading: "Carregando...",
    save: "Salvar",
    cancel: "Cancelar",
    next: "Próximo",
    previous: "Anterior",
    planTypes: {
      starter: "Starter",
      pro: "Profissional",
      enterprise: "Empresarial",
      custom: "Personalizado",
    },
    franchiseFeeValue: "Valor da Taxa (R$)",
    periodicity: "Periodicidade",
    months: "meses",
    firstDueOffset: "Dias até primeiro pagamento",
    paymentMethods: "Formas de Pagamento",
    autoAdjustment: "Reajuste Automático",
    adjustmentIndex: "Índice de Reajuste",
    latePenalty: "Multa por Atraso (%)",
    lateInterest: "Juros Mensais (%)",
    toleranceDays: "Dias de Tolerância",
    maxSimultaneous: "Máx. Campanhas Simultâneas",
    maxStandard: "Máx. Campanhas Padrão",
    maxOpportunity: "Máx. Campanhas de Oportunidade (CO)",
    cooldownHours: "Cooldown Entre Campanhas (horas)",
    maxTotalCapital: "Capital Total Máximo",
    maxPerCampaign: "Máx. por Campanha (%)",
    maxPerCO: "Máx. por CO (%)",
    maxPerAsset: "Máx. Exposição por Ativo (%)",
    maxPerCluster: "Máx. Exposição por Cluster (%)",
    allowedProfiles: "Perfis de Risco Permitidos",
    maxRiskPerTrade: "Risco Máx. por Trade (%)",
    maxDrawdown: "Drawdown Máx. por Campanha (%)",
    allowCustomization: "Permitir Personalização de Risco",
    aiAccessLevel: "Nível de Acesso IA",
    maxCOsPerPeriod: "Máx. COs por Período",
    coPeriodDays: "Período de CO (dias)",
    minOpportunityScore: "Score Mínimo de Oportunidade",
    allowBlueprintAdjust: "Permitir Ajuste de Blueprint",
    riskTriggers: "Gatilhos de Risco",
    perfTriggers: "Gatilhos de Performance",
    benchTriggers: "Gatilhos de Benchmark",
    autoRebalance: "Rebalanceamento Automático",
    auditFrequency: "Frequência Mín. de Auditoria (horas)",
    royaltyModel: "Modelo de Royalty",
    royaltyMin: "Royalty Mín. (%)",
    royaltyMax: "Royalty Máx. (%)",
    royaltyAppliesCO: "Royalties Aplicam a COs",
    royaltyPeriod: "Período de Cálculo",
    auditLevel: "Nível de Auditoria",
    autoDowngrade: "Permitir Rebaixamento Automático",
    suspensionDays: "Dias Antes da Suspensão",
    antifraudTolerance: "Tolerância Antifraude",
    noPlan: "Selecione um plano para ver detalhes",
    noPlans: "Nenhum plano de franquia configurado",
    createFirst: "Crie seu primeiro plano de franquia",
    versionNotes: "Notas da Versão",
  },
};

export default function FranchisePlans() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const t = TRANSLATIONS[language as keyof typeof TRANSLATIONS] || TRANSLATIONS.en;
  const tabLabels = TAB_LABELS[language as keyof typeof TAB_LABELS] || TAB_LABELS.en;
  
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [wizardTab, setWizardTab] = useState("identification");
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [newPlanData, setNewPlanData] = useState({ name: "", code: "" });
  const [versionFormData, setVersionFormData] = useState<Partial<FranchisePlanVersion>>({});

  const { data: plans = [], isLoading: plansLoading } = useQuery<PlanWithVersion[]>({
    queryKey: ["/api/franchise-plans"],
  });

  const { data: planDetails, isLoading: detailsLoading } = useQuery<PlanWithVersions>({
    queryKey: ["/api/franchise-plans", selectedPlanId],
    enabled: !!selectedPlanId,
  });

  const createPlanMutation = useMutation({
    mutationFn: async (data: { name: string; code: string }) => {
      return apiRequest("/api/franchise-plans", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/franchise-plans"] });
      setShowCreatePlan(false);
      setNewPlanData({ name: "", code: "" });
      toast({ title: "Plano criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao criar plano", variant: "destructive" });
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: async (data: { planId: string; versionData: any }) => {
      return apiRequest(`/api/franchise-plans/${data.planId}/versions`, "POST", data.versionData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/franchise-plans", selectedPlanId] });
      setIsEditMode(false);
      toast({ title: "Versão criada com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao criar versão", variant: "destructive" });
    },
  });

  const activateVersionMutation = useMutation({
    mutationFn: async (data: { planId: string; versionId: string }) => {
      return apiRequest(`/api/franchise-plans/${data.planId}/versions/${data.versionId}/activate`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/franchise-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/franchise-plans", selectedPlanId] });
      toast({ title: "Versão ativada com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao ativar versão", variant: "destructive" });
    },
  });

  const duplicateVersionMutation = useMutation({
    mutationFn: async (data: { planId: string; versionId: string }) => {
      return apiRequest(`/api/franchise-plans/${data.planId}/versions/${data.versionId}/duplicate`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/franchise-plans", selectedPlanId] });
      toast({ title: "Versão duplicada com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao duplicar versão", variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-600" data-testid="badge-status-active">{t.active}</Badge>;
      case "draft":
        return <Badge variant="secondary" data-testid="badge-status-draft">{t.draft}</Badge>;
      case "archived":
        return <Badge variant="outline" data-testid="badge-status-archived">{t.archived}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlanTypeIcon = (type: string) => {
    switch (type) {
      case "starter":
        return <Building2 className="h-4 w-4" />;
      case "pro":
        return <TrendingUp className="h-4 w-4" />;
      case "enterprise":
        return <Shield className="h-4 w-4" />;
      default:
        return <Settings className="h-4 w-4" />;
    }
  };

  const handleStartCreateVersion = () => {
    if (!planDetails?.version) {
      setVersionFormData({
        franchise_fee: "1500.00",
        fee_periodicity_months: 1,
        first_due_date_offset_days: 30,
        allowed_payment_methods: ["pix", "boleto"],
        auto_adjustment: true,
        adjustment_index: "ipca",
        late_payment_penalty_pct: "2.00",
        late_payment_interest_pct: "1.00",
        payment_tolerance_days: 3,
        max_simultaneous_campaigns: 1,
        max_standard_campaigns: 5,
        max_opportunity_campaigns: 0,
        campaign_cooldown_hours: 24,
        max_total_capital: "50000.00",
        max_capital_per_campaign_pct: "50.00",
        max_capital_per_co_pct: "25.00",
        max_exposure_per_asset_pct: "20.00",
        max_exposure_per_cluster_pct: "40.00",
        allowed_risk_profiles: ["conservative"],
        max_risk_per_trade_pct: "2.00",
        max_drawdown_per_campaign_pct: "10.00",
        allow_risk_customization: false,
        ai_access_level: "none",
        max_cos_per_period: 0,
        co_period_days: 30,
        min_opportunity_score: 75,
        allow_blueprint_adjustment: false,
        risk_triggers_enabled: true,
        performance_triggers_enabled: true,
        benchmark_triggers_enabled: false,
        auto_rebalance_enabled: false,
        min_audit_frequency_hours: 8,
        royalty_model: "fixed",
        royalty_min_pct: "10.00",
        royalty_max_pct: "30.00",
        royalty_applies_to_cos: true,
        royalty_calculation_period: "monthly",
        audit_level: "standard",
        allow_auto_downgrade: false,
        suspension_policy_days: 30,
        antifraud_tolerance: 3,
      });
    } else {
      const { id, version, version_status, created_at, activated_at, archived_at, ...versionData } = planDetails.version;
      setVersionFormData(versionData);
    }
    setIsEditMode(true);
    setWizardTab("identification");
  };

  const handleSaveVersion = () => {
    if (!selectedPlanId) return;
    createVersionMutation.mutate({
      planId: selectedPlanId,
      versionData: versionFormData,
    });
  };

  const wizardTabs = [
    { id: "identification", label: tabLabels.identification, icon: FileText },
    { id: "franchiseFee", label: tabLabels.franchiseFee, icon: DollarSign },
    { id: "campaignLimits", label: tabLabels.campaignLimits, icon: Target },
    { id: "capitalExposure", label: tabLabels.capitalExposure, icon: TrendingUp },
    { id: "riskProfiles", label: tabLabels.riskProfiles, icon: Shield },
    { id: "aiOpportunity", label: tabLabels.aiOpportunity, icon: Brain },
    { id: "triggersAutomation", label: tabLabels.triggersAutomation, icon: Zap },
    { id: "royalties", label: tabLabels.royalties, icon: Percent },
    { id: "governance", label: tabLabels.governance, icon: Scale },
  ];

  const currentTabIndex = wizardTabs.findIndex(tab => tab.id === wizardTab);
  const canGoNext = currentTabIndex < wizardTabs.length - 1;
  const canGoPrevious = currentTabIndex > 0;

  const handleNext = () => {
    if (canGoNext) {
      setWizardTab(wizardTabs[currentTabIndex + 1].id);
    }
  };

  const handlePrevious = () => {
    if (canGoPrevious) {
      setWizardTab(wizardTabs[currentTabIndex - 1].id);
    }
  };

  const updateVersionField = (field: string, value: any) => {
    setVersionFormData(prev => ({ ...prev, [field]: value }));
  };

  if (plansLoading) {
    return (
      <ProtectedRoute requiredRole="franchisor">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRole="franchisor">
      <div className="flex h-full gap-4 p-4" data-testid="page-franchise-plans">
      <Card className="w-80 shrink-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg" data-testid="text-plans-title">{t.title}</CardTitle>
            <Dialog open={showCreatePlan} onOpenChange={setShowCreatePlan}>
              <DialogTrigger asChild>
                <Button size="icon" variant="ghost" data-testid="button-new-plan">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.createPlan}</DialogTitle>
                  <DialogDescription>{t.subtitle}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="planName">{t.planName}</Label>
                    <Input
                      id="planName"
                      value={newPlanData.name}
                      onChange={(e) => setNewPlanData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Starter, Pro, Enterprise"
                      data-testid="input-plan-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="planCode">{t.planCode}</Label>
                    <Input
                      id="planCode"
                      value={newPlanData.code}
                      onChange={(e) => setNewPlanData(prev => ({ ...prev, code: e.target.value.toLowerCase() }))}
                      placeholder="Ex: starter, pro, enterprise"
                      data-testid="input-plan-code"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreatePlan(false)} data-testid="button-cancel-create">
                    {t.cancel}
                  </Button>
                  <Button 
                    onClick={() => createPlanMutation.mutate(newPlanData)}
                    disabled={!newPlanData.name || !newPlanData.code || createPlanMutation.isPending}
                    data-testid="button-confirm-create"
                  >
                    {createPlanMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t.createPlan}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>{t.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-220px)]">
            {plans.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                <p>{t.noPlans}</p>
                <p className="mt-1">{t.createFirst}</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      setIsEditMode(false);
                    }}
                    className={`w-full text-left p-3 rounded-lg transition-colors hover-elevate ${
                      selectedPlanId === plan.id ? "bg-accent" : ""
                    }`}
                    data-testid={`button-plan-${plan.id}`}
                  >
                    <div className="flex items-center gap-2">
                      {getPlanTypeIcon(plan.code)}
                      <span className="font-medium">{plan.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {plan.activeVersion ? (
                        <Badge variant="default" className="bg-green-600 text-xs">
                          v{plan.activeVersion.version}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{t.noActiveVersion}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {plan.versionCount} {t.versions}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex-1">
        {!selectedPlanId ? (
          <Card className="h-full flex items-center justify-center">
            <CardContent className="text-center text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t.noPlan}</p>
            </CardContent>
          </Card>
        ) : detailsLoading ? (
          <Card className="h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </Card>
        ) : planDetails ? (
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2" data-testid="text-selected-plan-name">
                    {getPlanTypeIcon(planDetails.plan.code)}
                    {planDetails.plan.name}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    {planDetails.version ? (
                      <>
                        {t.version} {planDetails.version.version}
                        {getStatusBadge(planDetails.version.version_status)}
                      </>
                    ) : (
                      t.noActiveVersion
                    )}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditMode && (
                    <>
                      <Button variant="outline" size="sm" onClick={handleStartCreateVersion} data-testid="button-create-version">
                        <Plus className="h-4 w-4 mr-1" />
                        {t.createVersion}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="flex-1 overflow-hidden p-0">
              {isEditMode ? (
                <div className="flex flex-col h-full">
                  <div className="border-b px-4 py-2 shrink-0">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                      {wizardTabs.map((tab, index) => {
                        const Icon = tab.icon;
                        const isActive = wizardTab === tab.id;
                        const isPassed = index < currentTabIndex;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setWizardTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                              isActive 
                                ? "bg-primary text-primary-foreground" 
                                : isPassed
                                  ? "bg-accent text-accent-foreground"
                                  : "text-muted-foreground hover:bg-accent"
                            }`}
                            data-testid={`tab-${tab.id}`}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="hidden lg:inline">{tab.label}</span>
                            <span className="lg:hidden">{index + 1}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  
                  <ScrollArea className="flex-1 px-4 py-4">
                    <div className="space-y-4 max-w-2xl">
                      {wizardTab === "identification" && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>{t.versionNotes}</Label>
                            <Textarea
                              value={versionFormData.version_notes || ""}
                              onChange={(e) => updateVersionField("version_notes", e.target.value)}
                              placeholder="Descreva as alterações desta versão..."
                              data-testid="input-version-notes"
                            />
                          </div>
                        </div>
                      )}

                      {wizardTab === "franchiseFee" && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.franchiseFeeValue}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.franchise_fee || ""}
                                onChange={(e) => updateVersionField("franchise_fee", e.target.value)}
                                data-testid="input-franchise-fee"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.periodicity}</Label>
                              <Select
                                value={String(versionFormData.fee_periodicity_months || 1)}
                                onValueChange={(v) => updateVersionField("fee_periodicity_months", parseInt(v))}
                              >
                                <SelectTrigger data-testid="select-periodicity">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">1 {t.months}</SelectItem>
                                  <SelectItem value="3">3 {t.months}</SelectItem>
                                  <SelectItem value="6">6 {t.months}</SelectItem>
                                  <SelectItem value="12">12 {t.months}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.firstDueOffset}</Label>
                              <Input
                                type="number"
                                value={versionFormData.first_due_date_offset_days || 30}
                                onChange={(e) => updateVersionField("first_due_date_offset_days", parseInt(e.target.value))}
                                data-testid="input-first-due-offset"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.toleranceDays}</Label>
                              <Input
                                type="number"
                                value={versionFormData.payment_tolerance_days || 3}
                                onChange={(e) => updateVersionField("payment_tolerance_days", parseInt(e.target.value))}
                                data-testid="input-tolerance-days"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={versionFormData.auto_adjustment || false}
                                onCheckedChange={(v) => updateVersionField("auto_adjustment", v)}
                                data-testid="switch-auto-adjustment"
                              />
                              <Label>{t.autoAdjustment}</Label>
                            </div>
                            {versionFormData.auto_adjustment && (
                              <Select
                                value={versionFormData.adjustment_index || "ipca"}
                                onValueChange={(v) => updateVersionField("adjustment_index", v)}
                              >
                                <SelectTrigger className="w-32" data-testid="select-adjustment-index">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ipca">IPCA</SelectItem>
                                  <SelectItem value="igpm">IGP-M</SelectItem>
                                  <SelectItem value="selic">SELIC</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.latePenalty}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.late_payment_penalty_pct || "2.00"}
                                onChange={(e) => updateVersionField("late_payment_penalty_pct", e.target.value)}
                                data-testid="input-late-penalty"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.lateInterest}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.late_payment_interest_pct || "1.00"}
                                onChange={(e) => updateVersionField("late_payment_interest_pct", e.target.value)}
                                data-testid="input-late-interest"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {wizardTab === "campaignLimits" && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.maxSimultaneous}</Label>
                              <Input
                                type="number"
                                value={versionFormData.max_simultaneous_campaigns || 1}
                                onChange={(e) => updateVersionField("max_simultaneous_campaigns", parseInt(e.target.value))}
                                data-testid="input-max-simultaneous"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.maxStandard}</Label>
                              <Input
                                type="number"
                                value={versionFormData.max_standard_campaigns || 5}
                                onChange={(e) => updateVersionField("max_standard_campaigns", parseInt(e.target.value))}
                                data-testid="input-max-standard"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.maxOpportunity}</Label>
                              <Input
                                type="number"
                                value={versionFormData.max_opportunity_campaigns || 0}
                                onChange={(e) => updateVersionField("max_opportunity_campaigns", parseInt(e.target.value))}
                                data-testid="input-max-opportunity"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.cooldownHours}</Label>
                              <Input
                                type="number"
                                value={versionFormData.campaign_cooldown_hours || 24}
                                onChange={(e) => updateVersionField("campaign_cooldown_hours", parseInt(e.target.value))}
                                data-testid="input-cooldown-hours"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {wizardTab === "capitalExposure" && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>{t.maxTotalCapital}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={versionFormData.max_total_capital || ""}
                              onChange={(e) => updateVersionField("max_total_capital", e.target.value)}
                              data-testid="input-max-capital"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.maxPerCampaign}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.max_capital_per_campaign_pct || "50.00"}
                                onChange={(e) => updateVersionField("max_capital_per_campaign_pct", e.target.value)}
                                data-testid="input-max-per-campaign"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.maxPerCO}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.max_capital_per_co_pct || "25.00"}
                                onChange={(e) => updateVersionField("max_capital_per_co_pct", e.target.value)}
                                data-testid="input-max-per-co"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.maxPerAsset}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.max_exposure_per_asset_pct || "20.00"}
                                onChange={(e) => updateVersionField("max_exposure_per_asset_pct", e.target.value)}
                                data-testid="input-max-per-asset"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.maxPerCluster}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.max_exposure_per_cluster_pct || "40.00"}
                                onChange={(e) => updateVersionField("max_exposure_per_cluster_pct", e.target.value)}
                                data-testid="input-max-per-cluster"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {wizardTab === "riskProfiles" && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>{t.allowedProfiles}</Label>
                            <div className="flex flex-wrap gap-2">
                              {["conservative", "moderate", "aggressive"].map((profile) => (
                                <Button
                                  key={profile}
                                  variant={((versionFormData.allowed_risk_profiles as string[]) || []).includes(profile) ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => {
                                    const current = (versionFormData.allowed_risk_profiles as string[]) || [];
                                    if (current.includes(profile)) {
                                      updateVersionField("allowed_risk_profiles", current.filter(p => p !== profile));
                                    } else {
                                      updateVersionField("allowed_risk_profiles", [...current, profile]);
                                    }
                                  }}
                                  data-testid={`button-profile-${profile}`}
                                >
                                  {profile.charAt(0).toUpperCase() + profile.slice(1)}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.maxRiskPerTrade}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.max_risk_per_trade_pct || "2.00"}
                                onChange={(e) => updateVersionField("max_risk_per_trade_pct", e.target.value)}
                                data-testid="input-max-risk-trade"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.maxDrawdown}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.max_drawdown_per_campaign_pct || "10.00"}
                                onChange={(e) => updateVersionField("max_drawdown_per_campaign_pct", e.target.value)}
                                data-testid="input-max-drawdown"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={versionFormData.allow_risk_customization || false}
                              onCheckedChange={(v) => updateVersionField("allow_risk_customization", v)}
                              data-testid="switch-risk-customization"
                            />
                            <Label>{t.allowCustomization}</Label>
                          </div>
                        </div>
                      )}

                      {wizardTab === "aiOpportunity" && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>{t.aiAccessLevel}</Label>
                            <Select
                              value={versionFormData.ai_access_level || "none"}
                              onValueChange={(v) => updateVersionField("ai_access_level", v)}
                            >
                              <SelectTrigger data-testid="select-ai-level">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nenhum</SelectItem>
                                <SelectItem value="alerts">Alertas</SelectItem>
                                <SelectItem value="alerts_co">Alertas + CO</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.maxCOsPerPeriod}</Label>
                              <Input
                                type="number"
                                value={versionFormData.max_cos_per_period || 0}
                                onChange={(e) => updateVersionField("max_cos_per_period", parseInt(e.target.value))}
                                data-testid="input-max-cos"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.coPeriodDays}</Label>
                              <Input
                                type="number"
                                value={versionFormData.co_period_days || 30}
                                onChange={(e) => updateVersionField("co_period_days", parseInt(e.target.value))}
                                data-testid="input-co-period"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>{t.minOpportunityScore} (0-100)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={versionFormData.min_opportunity_score || 75}
                              onChange={(e) => updateVersionField("min_opportunity_score", parseInt(e.target.value))}
                              data-testid="input-min-score"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={versionFormData.allow_blueprint_adjustment || false}
                              onCheckedChange={(v) => updateVersionField("allow_blueprint_adjustment", v)}
                              data-testid="switch-blueprint-adjust"
                            />
                            <Label>{t.allowBlueprintAdjust}</Label>
                          </div>
                        </div>
                      )}

                      {wizardTab === "triggersAutomation" && (
                        <div className="space-y-4">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={versionFormData.risk_triggers_enabled !== false}
                                onCheckedChange={(v) => updateVersionField("risk_triggers_enabled", v)}
                                data-testid="switch-risk-triggers"
                              />
                              <Label>{t.riskTriggers}</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={versionFormData.performance_triggers_enabled !== false}
                                onCheckedChange={(v) => updateVersionField("performance_triggers_enabled", v)}
                                data-testid="switch-perf-triggers"
                              />
                              <Label>{t.perfTriggers}</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={versionFormData.benchmark_triggers_enabled || false}
                                onCheckedChange={(v) => updateVersionField("benchmark_triggers_enabled", v)}
                                data-testid="switch-bench-triggers"
                              />
                              <Label>{t.benchTriggers}</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={versionFormData.auto_rebalance_enabled || false}
                                onCheckedChange={(v) => updateVersionField("auto_rebalance_enabled", v)}
                                data-testid="switch-auto-rebalance"
                              />
                              <Label>{t.autoRebalance}</Label>
                            </div>
                          </div>
                          <Separator />
                          <div className="space-y-2">
                            <Label>{t.auditFrequency}</Label>
                            <Input
                              type="number"
                              value={versionFormData.min_audit_frequency_hours || 8}
                              onChange={(e) => updateVersionField("min_audit_frequency_hours", parseInt(e.target.value))}
                              data-testid="input-audit-frequency"
                            />
                          </div>
                        </div>
                      )}

                      {wizardTab === "royalties" && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>{t.royaltyModel}</Label>
                            <Select
                              value={versionFormData.royalty_model || "fixed"}
                              onValueChange={(v) => updateVersionField("royalty_model", v)}
                            >
                              <SelectTrigger data-testid="select-royalty-model">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fixed">Fixo</SelectItem>
                                <SelectItem value="dynamic_prs">Dinâmico (PRS)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.royaltyMin}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.royalty_min_pct || "10.00"}
                                onChange={(e) => updateVersionField("royalty_min_pct", e.target.value)}
                                data-testid="input-royalty-min"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.royaltyMax}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={versionFormData.royalty_max_pct || "30.00"}
                                onChange={(e) => updateVersionField("royalty_max_pct", e.target.value)}
                                data-testid="input-royalty-max"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>{t.royaltyPeriod}</Label>
                            <Select
                              value={versionFormData.royalty_calculation_period || "monthly"}
                              onValueChange={(v) => updateVersionField("royalty_calculation_period", v)}
                            >
                              <SelectTrigger data-testid="select-royalty-period">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="weekly">Semanal</SelectItem>
                                <SelectItem value="monthly">Mensal</SelectItem>
                                <SelectItem value="quarterly">Trimestral</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={versionFormData.royalty_applies_to_cos !== false}
                              onCheckedChange={(v) => updateVersionField("royalty_applies_to_cos", v)}
                              data-testid="switch-royalty-cos"
                            />
                            <Label>{t.royaltyAppliesCO}</Label>
                          </div>
                        </div>
                      )}

                      {wizardTab === "governance" && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>{t.auditLevel}</Label>
                            <Select
                              value={versionFormData.audit_level || "standard"}
                              onValueChange={(v) => updateVersionField("audit_level", v)}
                            >
                              <SelectTrigger data-testid="select-audit-level">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="standard">Padrão</SelectItem>
                                <SelectItem value="reinforced">Reforçado</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t.suspensionDays}</Label>
                              <Input
                                type="number"
                                value={versionFormData.suspension_policy_days || 30}
                                onChange={(e) => updateVersionField("suspension_policy_days", parseInt(e.target.value))}
                                data-testid="input-suspension-days"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{t.antifraudTolerance}</Label>
                              <Input
                                type="number"
                                value={versionFormData.antifraud_tolerance || 3}
                                onChange={(e) => updateVersionField("antifraud_tolerance", parseInt(e.target.value))}
                                data-testid="input-antifraud-tolerance"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={versionFormData.allow_auto_downgrade || false}
                              onCheckedChange={(v) => updateVersionField("allow_auto_downgrade", v)}
                              data-testid="switch-auto-downgrade"
                            />
                            <Label>{t.autoDowngrade}</Label>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                  
                  <div className="border-t p-4 flex items-center justify-between shrink-0">
                    <Button
                      variant="outline"
                      onClick={handlePrevious}
                      disabled={!canGoPrevious}
                      data-testid="button-previous"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      {t.previous}
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => setIsEditMode(false)} data-testid="button-cancel-edit">
                        {t.cancel}
                      </Button>
                      {canGoNext ? (
                        <Button onClick={handleNext} data-testid="button-next">
                          {t.next}
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      ) : (
                        <Button 
                          onClick={handleSaveVersion} 
                          disabled={createVersionMutation.isPending}
                          data-testid="button-save-version"
                        >
                          {createVersionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {t.save}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-full p-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <History className="h-4 w-4" />
                        {t.versions}
                      </h4>
                      <div className="space-y-2">
                        {planDetails.versions?.map((version) => (
                          <div
                            key={version.id}
                            className="flex items-center justify-between p-3 rounded-lg border"
                            data-testid={`version-${version.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-medium">v{version.version}</span>
                              {getStatusBadge(version.version_status)}
                              {version.version_notes && (
                                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                                  {version.version_notes}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  const { id, version: v, version_status, created_at, activated_at, archived_at, ...data } = version;
                                  setVersionFormData(data);
                                  setIsEditMode(true);
                                  setWizardTab("identification");
                                }}
                                data-testid={`button-view-version-${version.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {version.version_status === "draft" && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => activateVersionMutation.mutate({ 
                                    planId: selectedPlanId, 
                                    versionId: version.id 
                                  })}
                                  disabled={activateVersionMutation.isPending}
                                  data-testid={`button-activate-version-${version.id}`}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => duplicateVersionMutation.mutate({
                                  planId: selectedPlanId,
                                  versionId: version.id,
                                })}
                                disabled={duplicateVersionMutation.isPending}
                                data-testid={`button-duplicate-version-${version.id}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {(!planDetails.versions || planDetails.versions.length === 0) && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            {t.noActiveVersion}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        ) : null}
        </div>
      </div>
    </ProtectedRoute>
  );
}
