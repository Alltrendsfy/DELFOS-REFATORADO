import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  Bell,
  Settings,
  History,
  Shield,
  Target,
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";

type OpportunityBlueprint = {
  id: string;
  symbol: string;
  opportunity_type: string;
  market_regime: string;
  thesis_summary: string;
  detailed_analysis: string;
  confidence_score: string;
  expected_return_pct: string;
  expected_risk_pct: string;
  risk_reward_ratio: string;
  recommended_entry_price: string;
  recommended_stop_loss: string;
  recommended_take_profit: string;
  recommended_position_size: string;
  valid_until: string;
  content_hash: string;
  status: "active" | "consumed" | "expired" | "rejected";
  ai_model: string;
  ai_prompt_version: string;
  raw_ai_response: any;
  market_data_snapshot: any;
  created_at: string;
  consumed_at?: string;
  consumed_by_campaign_id?: string;
};

type OpportunityTrigger = {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  conditions: {
    opportunity_types?: string[];
    market_regimes?: string[];
    min_confidence?: number;
    min_expected_return?: number;
    max_risk?: number;
    symbols?: string[];
  };
  actions: {
    notification_channels?: string[];
    auto_create_campaign?: boolean;
    custom_webhook_url?: string;
  };
  fire_count: number;
  last_fired_at?: string;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
};

type TriggerEvent = {
  id: string;
  trigger_id: string;
  blueprint_id: string;
  event_type: string;
  result: string;
  error_message?: string;
  notification_sent: boolean;
  campaign_created: boolean;
  created_campaign_id?: string;
  fired_at: string;
};

const OPPORTUNITY_TYPE_LABELS = {
  "CO-01": { en: "Mean Reversion", es: "Reversión a la Media", "pt-BR": "Reversão à Média" },
  "CO-02": { en: "Volatility Breakout", es: "Ruptura de Volatilidad", "pt-BR": "Rompimento de Volatilidade" },
  "CO-03": { en: "Momentum Surge", es: "Impulso de Momentum", "pt-BR": "Surto de Momentum" },
  "CO-04": { en: "Liquidity Imbalance", es: "Desequilibrio de Liquidez", "pt-BR": "Desequilíbrio de Liquidez" },
  "CO-05": { en: "Correlation Breakdown", es: "Ruptura de Correlación", "pt-BR": "Quebra de Correlação" },
  "CO-06": { en: "Technical Divergence", es: "Divergencia Técnica", "pt-BR": "Divergência Técnica" },
};

const MARKET_REGIME_LABELS = {
  "trending_bullish": { en: "Trending Bullish", es: "Tendencia Alcista", "pt-BR": "Tendência de Alta" },
  "trending_bearish": { en: "Trending Bearish", es: "Tendencia Bajista", "pt-BR": "Tendência de Baixa" },
  "ranging_high_vol": { en: "Range (High Vol)", es: "Rango (Alta Vol)", "pt-BR": "Lateral (Alta Vol)" },
  "ranging_low_vol": { en: "Range (Low Vol)", es: "Rango (Baja Vol)", "pt-BR": "Lateral (Baixa Vol)" },
  "breakout_bullish": { en: "Breakout Bullish", es: "Ruptura Alcista", "pt-BR": "Rompimento de Alta" },
  "breakout_bearish": { en: "Breakout Bearish", es: "Ruptura Bajista", "pt-BR": "Rompimento de Baixa" },
  "mean_reverting": { en: "Mean Reverting", es: "Reversión a la Media", "pt-BR": "Reversão à Média" },
  "unknown": { en: "Unknown", es: "Desconocido", "pt-BR": "Desconhecido" },
};

const translations = {
  en: {
    title: "Opportunity Blueprints",
    description: "AI-detected trading opportunities with statistical edge",
    backToDashboard: "Back to Dashboard",
    tabBlueprints: "Blueprints",
    tabTriggers: "Triggers",
    tabHistory: "History",
    noBlueprints: "No active blueprints",
    noBlueprintsDesc: "The AI will automatically detect new opportunities based on market conditions",
    noTriggers: "No triggers configured",
    noTriggersDesc: "Create triggers to get notified when opportunities match your criteria",
    createDefaults: "Create Default Triggers",
    creatingDefaults: "Creating...",
    symbol: "Symbol",
    type: "Type",
    regime: "Regime",
    confidence: "Confidence",
    return: "Exp. Return",
    risk: "Risk",
    riskReward: "R:R",
    entry: "Entry",
    stopLoss: "SL",
    takeProfit: "TP",
    validUntil: "Valid Until",
    status: "Status",
    actions: "Actions",
    consume: "Accept",
    consuming: "Accepting...",
    reject: "Reject",
    rejecting: "Rejecting...",
    view: "View",
    active: "Active",
    consumed: "Consumed",
    expired: "Expired",
    rejected: "Rejected",
    triggerName: "Name",
    triggerActive: "Active",
    conditions: "Conditions",
    fireCount: "Fires",
    lastFired: "Last Fired",
    cooldown: "Cooldown",
    never: "Never",
    minutes: "min",
    statsTitle: "Detection Stats",
    totalDetected: "Total Detected",
    consumedRate: "Consumed Rate",
    avgConfidence: "Avg Confidence",
    avgReturn: "Avg Expected Return",
    viewBlueprint: "View Blueprint",
    blueprintDetails: "Blueprint Details",
    thesis: "AI Thesis",
    detailedAnalysis: "Detailed Analysis",
    marketData: "Market Data Snapshot",
    aiModel: "AI Model",
    promptVersion: "Prompt Version",
    contentHash: "Content Hash",
    integrityVerified: "Integrity Verified",
    integrityFailed: "Integrity Failed",
    close: "Close",
    consumeSuccess: "Blueprint consumed successfully",
    consumeError: "Failed to consume blueprint",
    rejectSuccess: "Blueprint rejected",
    rejectError: "Failed to reject blueprint",
    defaultsCreated: "Default triggers created",
    defaultsError: "Failed to create default triggers",
    toggleSuccess: "Trigger updated",
    toggleError: "Failed to update trigger",
    eventsTitle: "Trigger Events",
    eventType: "Event",
    result: "Result",
    notificationSent: "Notification",
    campaignCreated: "Campaign",
    firedAt: "Fired At",
    noEvents: "No events yet",
    noEventsDesc: "Events will appear here when triggers fire",
  },
  es: {
    title: "Blueprints de Oportunidad",
    description: "Oportunidades de trading detectadas por IA con ventaja estadística",
    backToDashboard: "Volver al Panel",
    tabBlueprints: "Blueprints",
    tabTriggers: "Gatillos",
    tabHistory: "Historial",
    noBlueprints: "Sin blueprints activos",
    noBlueprintsDesc: "La IA detectará automáticamente nuevas oportunidades según las condiciones del mercado",
    noTriggers: "Sin gatillos configurados",
    noTriggersDesc: "Crea gatillos para recibir notificaciones cuando las oportunidades coincidan con tus criterios",
    createDefaults: "Crear Gatillos Predeterminados",
    creatingDefaults: "Creando...",
    symbol: "Símbolo",
    type: "Tipo",
    regime: "Régimen",
    confidence: "Confianza",
    return: "Retorno Esp.",
    risk: "Riesgo",
    riskReward: "R:R",
    entry: "Entrada",
    stopLoss: "SL",
    takeProfit: "TP",
    validUntil: "Válido Hasta",
    status: "Estado",
    actions: "Acciones",
    consume: "Aceptar",
    consuming: "Aceptando...",
    reject: "Rechazar",
    rejecting: "Rechazando...",
    view: "Ver",
    active: "Activo",
    consumed: "Consumido",
    expired: "Expirado",
    rejected: "Rechazado",
    triggerName: "Nombre",
    triggerActive: "Activo",
    conditions: "Condiciones",
    fireCount: "Disparos",
    lastFired: "Último Disparo",
    cooldown: "Enfriamiento",
    never: "Nunca",
    minutes: "min",
    statsTitle: "Estadísticas de Detección",
    totalDetected: "Total Detectados",
    consumedRate: "Tasa de Consumo",
    avgConfidence: "Confianza Promedio",
    avgReturn: "Retorno Promedio Esperado",
    viewBlueprint: "Ver Blueprint",
    blueprintDetails: "Detalles del Blueprint",
    thesis: "Tesis de IA",
    detailedAnalysis: "Análisis Detallado",
    marketData: "Snapshot de Datos de Mercado",
    aiModel: "Modelo de IA",
    promptVersion: "Versión del Prompt",
    contentHash: "Hash de Contenido",
    integrityVerified: "Integridad Verificada",
    integrityFailed: "Integridad Fallida",
    close: "Cerrar",
    consumeSuccess: "Blueprint consumido exitosamente",
    consumeError: "Error al consumir blueprint",
    rejectSuccess: "Blueprint rechazado",
    rejectError: "Error al rechazar blueprint",
    defaultsCreated: "Gatillos predeterminados creados",
    defaultsError: "Error al crear gatillos predeterminados",
    toggleSuccess: "Gatillo actualizado",
    toggleError: "Error al actualizar gatillo",
    eventsTitle: "Eventos de Gatillos",
    eventType: "Evento",
    result: "Resultado",
    notificationSent: "Notificación",
    campaignCreated: "Campaña",
    firedAt: "Disparado En",
    noEvents: "Sin eventos aún",
    noEventsDesc: "Los eventos aparecerán aquí cuando los gatillos se disparen",
  },
  "pt-BR": {
    title: "Blueprints de Oportunidade",
    description: "Oportunidades de trading detectadas por IA com vantagem estatística",
    backToDashboard: "Voltar ao Painel",
    tabBlueprints: "Blueprints",
    tabTriggers: "Gatilhos",
    tabHistory: "Histórico",
    noBlueprints: "Nenhum blueprint ativo",
    noBlueprintsDesc: "A IA detectará automaticamente novas oportunidades com base nas condições do mercado",
    noTriggers: "Nenhum gatilho configurado",
    noTriggersDesc: "Crie gatilhos para ser notificado quando oportunidades corresponderem aos seus critérios",
    createDefaults: "Criar Gatilhos Padrão",
    creatingDefaults: "Criando...",
    symbol: "Símbolo",
    type: "Tipo",
    regime: "Regime",
    confidence: "Confiança",
    return: "Retorno Esp.",
    risk: "Risco",
    riskReward: "R:R",
    entry: "Entrada",
    stopLoss: "SL",
    takeProfit: "TP",
    validUntil: "Válido Até",
    status: "Status",
    actions: "Ações",
    consume: "Aceitar",
    consuming: "Aceitando...",
    reject: "Rejeitar",
    rejecting: "Rejeitando...",
    view: "Ver",
    active: "Ativo",
    consumed: "Consumido",
    expired: "Expirado",
    rejected: "Rejeitado",
    triggerName: "Nome",
    triggerActive: "Ativo",
    conditions: "Condições",
    fireCount: "Disparos",
    lastFired: "Último Disparo",
    cooldown: "Cooldown",
    never: "Nunca",
    minutes: "min",
    statsTitle: "Estatísticas de Detecção",
    totalDetected: "Total Detectados",
    consumedRate: "Taxa de Consumo",
    avgConfidence: "Confiança Média",
    avgReturn: "Retorno Médio Esperado",
    viewBlueprint: "Ver Blueprint",
    blueprintDetails: "Detalhes do Blueprint",
    thesis: "Tese da IA",
    detailedAnalysis: "Análise Detalhada",
    marketData: "Snapshot de Dados do Mercado",
    aiModel: "Modelo de IA",
    promptVersion: "Versão do Prompt",
    contentHash: "Hash do Conteúdo",
    integrityVerified: "Integridade Verificada",
    integrityFailed: "Integridade Falhou",
    close: "Fechar",
    consumeSuccess: "Blueprint consumido com sucesso",
    consumeError: "Falha ao consumir blueprint",
    rejectSuccess: "Blueprint rejeitado",
    rejectError: "Falha ao rejeitar blueprint",
    defaultsCreated: "Gatilhos padrão criados",
    defaultsError: "Falha ao criar gatilhos padrão",
    toggleSuccess: "Gatilho atualizado",
    toggleError: "Falha ao atualizar gatilho",
    eventsTitle: "Eventos de Gatilhos",
    eventType: "Evento",
    result: "Resultado",
    notificationSent: "Notificação",
    campaignCreated: "Campanha",
    firedAt: "Disparado Em",
    noEvents: "Nenhum evento ainda",
    noEventsDesc: "Eventos aparecerão aqui quando gatilhos forem disparados",
  },
};

export default function OpportunityBlueprints() {
  const { language } = useLanguage();
  const t = translations[language as keyof typeof translations] || translations.en;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("blueprints");
  const [selectedBlueprint, setSelectedBlueprint] = useState<OpportunityBlueprint | null>(null);
  const [showBlueprintDialog, setShowBlueprintDialog] = useState(false);

  const dateLocale = language === "es" ? es : language === "pt-BR" ? ptBR : enUS;

  const { data: blueprintsData, isLoading: loadingBlueprints } = useQuery<{
    blueprints: OpportunityBlueprint[];
    stats: {
      total: number;
      active: number;
      consumed: number;
      expired: number;
      rejected: number;
      avgConfidence: number;
      avgExpectedReturn: number;
      consumedRate: number;
    };
  }>({
    queryKey: ["/api/opportunity-blueprints"],
    refetchInterval: 30000,
  });

  const { data: historyData, isLoading: loadingHistory } = useQuery<{
    blueprints: OpportunityBlueprint[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ["/api/opportunity-blueprints/history"],
    enabled: activeTab === "history",
  });

  const { data: triggersData, isLoading: loadingTriggers } = useQuery<{
    triggers: OpportunityTrigger[];
    stats: {
      total: number;
      active: number;
      totalFires: number;
    };
  }>({
    queryKey: ["/api/opportunity-triggers"],
    enabled: activeTab === "triggers",
  });

  const { data: eventsData, isLoading: loadingEvents } = useQuery<{
    events: TriggerEvent[];
    total: number;
  }>({
    queryKey: ["/api/opportunity-triggers/events"],
    enabled: activeTab === "triggers",
  });

  const consumeMutation = useMutation({
    mutationFn: async (blueprintId: string) => {
      return apiRequest("POST", `/api/opportunity-blueprints/${blueprintId}/consume`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunity-blueprints"] });
      toast({ title: t.consumeSuccess });
    },
    onError: () => {
      toast({ title: t.consumeError, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (blueprintId: string) => {
      return apiRequest(`/api/opportunity-blueprints/${blueprintId}/reject`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunity-blueprints"] });
      toast({ title: t.rejectSuccess });
    },
    onError: () => {
      toast({ title: t.rejectError, variant: "destructive" });
    },
  });

  const createDefaultsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/opportunity-triggers/defaults");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunity-triggers"] });
      toast({ title: t.defaultsCreated });
    },
    onError: () => {
      toast({ title: t.defaultsError, variant: "destructive" });
    },
  });

  const toggleTriggerMutation = useMutation({
    mutationFn: async (triggerId: string) => {
      return apiRequest("POST", `/api/opportunity-triggers/${triggerId}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunity-triggers"] });
      toast({ title: t.toggleSuccess });
    },
    onError: () => {
      toast({ title: t.toggleError, variant: "destructive" });
    },
  });

  const getTypeLabel = (type: string) => {
    const labels = OPPORTUNITY_TYPE_LABELS[type as keyof typeof OPPORTUNITY_TYPE_LABELS];
    return labels ? labels[language as keyof typeof labels] || labels.en : type;
  };

  const getRegimeLabel = (regime: string) => {
    const labels = MARKET_REGIME_LABELS[regime as keyof typeof MARKET_REGIME_LABELS];
    return labels ? labels[language as keyof typeof labels] || labels.en : regime;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      active: { variant: "default", label: t.active },
      consumed: { variant: "secondary", label: t.consumed },
      expired: { variant: "outline", label: t.expired },
      rejected: { variant: "destructive", label: t.rejected },
    };
    const config = variants[status] || variants.active;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatPrice = (price: string | number) => {
    const num = typeof price === "string" ? parseFloat(price) : price;
    if (num >= 1000) return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    if (num >= 1) return `$${num.toFixed(2)}`;
    return `$${num.toFixed(6)}`;
  };

  const formatPercent = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
  };

  const openBlueprintDetails = (blueprint: OpportunityBlueprint) => {
    setSelectedBlueprint(blueprint);
    setShowBlueprintDialog(true);
  };

  const blueprints = blueprintsData?.blueprints || [];
  const stats = blueprintsData?.stats;
  const triggers = triggersData?.triggers || [];
  const triggerStats = triggersData?.stats;
  const events = eventsData?.events || [];
  const history = historyData?.blueprints || [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" data-testid="link-back-to-dashboard">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t.backToDashboard}
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Lightbulb className="h-8 w-8 text-primary" />
              {t.title}
            </h1>
            <p className="text-muted-foreground mt-1">{t.description}</p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">{t.totalDetected}</CardTitle>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-detected">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">{t.consumedRate}</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-consumed-rate">
                {stats.consumedRate.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">{t.avgConfidence}</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-avg-confidence">
                {(stats.avgConfidence * 100).toFixed(0)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">{t.avgReturn}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-avg-return">
                +{stats.avgExpectedReturn.toFixed(2)}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="blueprints" data-testid="tab-blueprints">
            <Lightbulb className="h-4 w-4 mr-2" />
            {t.tabBlueprints}
          </TabsTrigger>
          <TabsTrigger value="triggers" data-testid="tab-triggers">
            <Zap className="h-4 w-4 mr-2" />
            {t.tabTriggers}
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-2" />
            {t.tabHistory}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="blueprints" className="space-y-4">
          {loadingBlueprints ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : blueprints.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">{t.noBlueprints}</h3>
                <p className="text-muted-foreground text-center max-w-md mt-2">
                  {t.noBlueprintsDesc}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.symbol}</TableHead>
                      <TableHead>{t.type}</TableHead>
                      <TableHead>{t.regime}</TableHead>
                      <TableHead className="text-right">{t.confidence}</TableHead>
                      <TableHead className="text-right">{t.return}</TableHead>
                      <TableHead className="text-right">{t.riskReward}</TableHead>
                      <TableHead>{t.validUntil}</TableHead>
                      <TableHead>{t.status}</TableHead>
                      <TableHead>{t.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blueprints.map((blueprint) => (
                      <TableRow key={blueprint.id} data-testid={`row-blueprint-${blueprint.id}`}>
                        <TableCell className="font-medium">{blueprint.symbol}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getTypeLabel(blueprint.opportunity_type)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{getRegimeLabel(blueprint.market_regime)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {(parseFloat(blueprint.confidence_score) * 100).toFixed(0)}%
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatPercent(blueprint.expected_return_pct)}
                        </TableCell>
                        <TableCell className="text-right">
                          {parseFloat(blueprint.risk_reward_ratio).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {formatDistanceToNow(new Date(blueprint.valid_until), { addSuffix: true, locale: dateLocale })}
                        </TableCell>
                        <TableCell>{getStatusBadge(blueprint.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openBlueprintDetails(blueprint)}
                              data-testid={`button-view-${blueprint.id}`}
                            >
                              {t.view}
                            </Button>
                            {blueprint.status === "active" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => consumeMutation.mutate(blueprint.id)}
                                  disabled={consumeMutation.isPending || rejectMutation.isPending}
                                  data-testid={`button-consume-${blueprint.id}`}
                                >
                                  {consumeMutation.isPending ? t.consuming : t.consume}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => rejectMutation.mutate(blueprint.id)}
                                  disabled={rejectMutation.isPending || consumeMutation.isPending}
                                  data-testid={`button-reject-${blueprint.id}`}
                                >
                                  {rejectMutation.isPending ? t.rejecting : t.reject}
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="triggers" className="space-y-4">
          {loadingTriggers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : triggers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">{t.noTriggers}</h3>
                <p className="text-muted-foreground text-center max-w-md mt-2">
                  {t.noTriggersDesc}
                </p>
                <Button
                  className="mt-4"
                  onClick={() => createDefaultsMutation.mutate()}
                  disabled={createDefaultsMutation.isPending}
                  data-testid="button-create-defaults"
                >
                  {createDefaultsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t.creatingDefaults}
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      {t.createDefaults}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.triggerName}</TableHead>
                        <TableHead>{t.triggerActive}</TableHead>
                        <TableHead>{t.conditions}</TableHead>
                        <TableHead className="text-right">{t.fireCount}</TableHead>
                        <TableHead>{t.lastFired}</TableHead>
                        <TableHead className="text-right">{t.cooldown}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {triggers.map((trigger) => (
                        <TableRow key={trigger.id} data-testid={`row-trigger-${trigger.id}`}>
                          <TableCell className="font-medium">{trigger.name}</TableCell>
                          <TableCell>
                            <Switch
                              checked={trigger.is_active}
                              onCheckedChange={() => toggleTriggerMutation.mutate(trigger.id)}
                              data-testid={`switch-trigger-${trigger.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {trigger.conditions.opportunity_types?.map((type) => (
                                <Badge key={type} variant="outline" className="text-xs">
                                  {type}
                                </Badge>
                              ))}
                              {trigger.conditions.min_confidence && (
                                <Badge variant="secondary" className="text-xs">
                                  ≥{(trigger.conditions.min_confidence * 100).toFixed(0)}%
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{trigger.fire_count}</TableCell>
                          <TableCell>
                            {trigger.last_fired_at
                              ? formatDistanceToNow(new Date(trigger.last_fired_at), { addSuffix: true, locale: dateLocale })
                              : t.never}
                          </TableCell>
                          <TableCell className="text-right">
                            {trigger.cooldown_minutes} {t.minutes}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    {t.eventsTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingEvents ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : events.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-8 w-8 mx-auto mb-2" />
                      <p>{t.noEvents}</p>
                      <p className="text-sm">{t.noEventsDesc}</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.eventType}</TableHead>
                          <TableHead>{t.result}</TableHead>
                          <TableHead>{t.notificationSent}</TableHead>
                          <TableHead>{t.campaignCreated}</TableHead>
                          <TableHead>{t.firedAt}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {events.map((event) => (
                          <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                            <TableCell>{event.event_type}</TableCell>
                            <TableCell>
                              <Badge variant={event.result === "success" ? "default" : "destructive"}>
                                {event.result}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {event.notification_sent ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell>
                              {event.campaign_created ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell>
                              {format(new Date(event.fired_at), "PPp", { locale: dateLocale })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <History className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">{t.noBlueprints}</h3>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.symbol}</TableHead>
                      <TableHead>{t.type}</TableHead>
                      <TableHead className="text-right">{t.confidence}</TableHead>
                      <TableHead className="text-right">{t.return}</TableHead>
                      <TableHead>{t.status}</TableHead>
                      <TableHead>{t.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((blueprint) => (
                      <TableRow key={blueprint.id} data-testid={`row-history-${blueprint.id}`}>
                        <TableCell className="font-medium">{blueprint.symbol}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getTypeLabel(blueprint.opportunity_type)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {(parseFloat(blueprint.confidence_score) * 100).toFixed(0)}%
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatPercent(blueprint.expected_return_pct)}
                        </TableCell>
                        <TableCell>{getStatusBadge(blueprint.status)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openBlueprintDetails(blueprint)}
                            data-testid={`button-view-history-${blueprint.id}`}
                          >
                            {t.view}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showBlueprintDialog} onOpenChange={setShowBlueprintDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {selectedBlueprint && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" />
                  {t.blueprintDetails}: {selectedBlueprint.symbol}
                </DialogTitle>
                <DialogDescription>
                  {getTypeLabel(selectedBlueprint.opportunity_type)} - {getRegimeLabel(selectedBlueprint.market_regime)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">{t.confidence}</Label>
                    <p className="text-lg font-semibold">
                      {(parseFloat(selectedBlueprint.confidence_score) * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">{t.return}</Label>
                    <p className="text-lg font-semibold text-green-600">
                      {formatPercent(selectedBlueprint.expected_return_pct)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">{t.risk}</Label>
                    <p className="text-lg font-semibold text-red-600">
                      {formatPercent(selectedBlueprint.expected_risk_pct)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">{t.riskReward}</Label>
                    <p className="text-lg font-semibold">
                      {parseFloat(selectedBlueprint.risk_reward_ratio).toFixed(2)}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">{t.entry}</Label>
                    <p className="font-mono">{formatPrice(selectedBlueprint.recommended_entry_price)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">{t.stopLoss}</Label>
                    <p className="font-mono text-red-600">{formatPrice(selectedBlueprint.recommended_stop_loss)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">{t.takeProfit}</Label>
                    <p className="font-mono text-green-600">{formatPrice(selectedBlueprint.recommended_take_profit)}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-muted-foreground text-xs">{t.thesis}</Label>
                  <p className="mt-1 text-sm">{selectedBlueprint.thesis_summary}</p>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">{t.detailedAnalysis}</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{selectedBlueprint.detailed_analysis}</p>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground text-xs">{t.aiModel}</Label>
                    <p>{selectedBlueprint.ai_model}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">{t.promptVersion}</Label>
                    <p>{selectedBlueprint.ai_prompt_version}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">{t.contentHash}</Label>
                  <p className="font-mono text-xs break-all">{selectedBlueprint.content_hash}</p>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowBlueprintDialog(false)}
                  data-testid="button-close-dialog"
                >
                  {t.close}
                </Button>
                {selectedBlueprint.status === "active" && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        rejectMutation.mutate(selectedBlueprint.id);
                        setShowBlueprintDialog(false);
                      }}
                      disabled={rejectMutation.isPending || consumeMutation.isPending}
                      data-testid="button-reject-dialog"
                    >
                      {rejectMutation.isPending ? t.rejecting : t.reject}
                    </Button>
                    <Button
                      onClick={() => {
                        consumeMutation.mutate(selectedBlueprint.id);
                        setShowBlueprintDialog(false);
                      }}
                      disabled={consumeMutation.isPending || rejectMutation.isPending}
                      data-testid="button-consume-dialog"
                    >
                      {consumeMutation.isPending ? t.consuming : t.consume}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
