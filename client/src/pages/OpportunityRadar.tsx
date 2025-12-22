import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Radar,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Eye,
  Play,
  BarChart3,
  PieChart,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar as RechartsRadar,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

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
  created_at: string;
  consumed_at?: string;
  consumed_by_campaign_id?: string;
};

type OpportunityCampaign = {
  id: string;
  blueprint_id: string;
  campaign_id: string;
  user_id: string;
  franchise_id?: string;
  status: "active" | "completed" | "cancelled";
  started_at: string;
  completed_at?: string;
  initial_capital: string;
  final_capital?: string;
  co_roi_pct?: string;
  trades_executed: number;
  thesis_validated?: boolean;
};

type BlueprintsApiResponse = {
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
};

type HistoryApiResponse = {
  history: OpportunityBlueprint[];
  limit: number;
  offset: number;
};

const OPPORTUNITY_TYPE_CONFIG = {
  "CO-01": { 
    label: { en: "Mean Reversion", es: "Reversión a la Media", "pt-BR": "Reversão à Média" },
    color: "#5B9FB5",
    icon: TrendingDown,
  },
  "CO-02": { 
    label: { en: "Volatility Breakout", es: "Ruptura de Volatilidad", "pt-BR": "Rompimento de Volatilidade" },
    color: "#7DD3E8",
    icon: Zap,
  },
  "CO-03": { 
    label: { en: "Momentum Surge", es: "Impulso de Momentum", "pt-BR": "Surto de Momentum" },
    color: "#A8B5BD",
    icon: TrendingUp,
  },
  "CO-04": { 
    label: { en: "Liquidity Imbalance", es: "Desequilibrio de Liquidez", "pt-BR": "Desequilíbrio de Liquidez" },
    color: "#4A8A9E",
    icon: Activity,
  },
  "CO-05": { 
    label: { en: "Correlation Breakdown", es: "Ruptura de Correlación", "pt-BR": "Quebra de Correlação" },
    color: "#6BC5D9",
    icon: AlertTriangle,
  },
  "CO-06": { 
    label: { en: "Technical Divergence", es: "Divergencia Técnica", "pt-BR": "Divergência Técnica" },
    color: "#3D7A8C",
    icon: BarChart3,
  },
};

const MARKET_REGIME_LABELS: Record<string, Record<string, string>> = {
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
    title: "Opportunity Radar",
    subtitle: "Real-time AI-detected trading opportunities dashboard",
    backToDashboard: "Back to Dashboard",
    tabOverview: "Overview",
    tabActive: "Active Opportunities",
    tabCampaigns: "CO Campaigns",
    tabAnalytics: "Analytics",
    kpiActiveOpportunities: "Active Opportunities",
    kpiActiveCOs: "Active COs",
    kpiSuccessRate: "Success Rate",
    kpiAvgReturn: "Avg Return",
    kpiTotalDetected: "Total Detected",
    kpiConsumedRate: "Consumed Rate",
    radarTitle: "Opportunity Distribution",
    recentOpportunities: "Recent Opportunities",
    noActiveOpportunities: "No active opportunities detected",
    noActiveOpportunitiesDesc: "The AI continuously scans the market for statistical edge opportunities",
    symbol: "Symbol",
    type: "Type",
    regime: "Regime",
    confidence: "Confidence",
    expectedReturn: "Exp. Return",
    risk: "Risk",
    riskReward: "R:R",
    validUntil: "Valid Until",
    actions: "Actions",
    view: "View",
    accept: "Accept",
    accepting: "Accepting...",
    reject: "Reject",
    campaignsTitle: "Opportunity Campaigns (COs)",
    noCampaigns: "No opportunity campaigns yet",
    noCampaignsDesc: "Accept an opportunity blueprint to start a CO campaign",
    campaign: "Campaign",
    started: "Started",
    capital: "Capital",
    roi: "ROI",
    trades: "Trades",
    thesisValidated: "Thesis",
    status: "Status",
    active: "Active",
    completed: "Completed",
    cancelled: "Cancelled",
    validated: "Validated",
    invalidated: "Invalidated",
    pending: "Pending",
    analyticsTitle: "Performance Analytics",
    byType: "By Type",
    byRegime: "By Regime",
    performanceOverTime: "Performance Over Time",
    blueprintDetails: "Blueprint Details",
    thesis: "AI Thesis",
    detailedAnalysis: "Detailed Analysis",
    entry: "Entry",
    stopLoss: "Stop Loss",
    takeProfit: "Take Profit",
    positionSize: "Position Size",
    close: "Close",
    consumeSuccess: "Opportunity accepted successfully",
    consumeError: "Failed to accept opportunity",
    rejectSuccess: "Opportunity rejected",
    rejectError: "Failed to reject opportunity",
    refreshing: "Refreshing...",
    refresh: "Refresh",
    lastUpdated: "Last updated",
    expired: "Expired",
    rejected: "Rejected",
    consumed: "Consumed",
  },
  es: {
    title: "Radar de Oportunidades",
    subtitle: "Panel de oportunidades de trading detectadas por IA en tiempo real",
    backToDashboard: "Volver al Panel",
    tabOverview: "Resumen",
    tabActive: "Oportunidades Activas",
    tabCampaigns: "Campañas CO",
    tabAnalytics: "Analíticas",
    kpiActiveOpportunities: "Oportunidades Activas",
    kpiActiveCOs: "COs Activos",
    kpiSuccessRate: "Tasa de Éxito",
    kpiAvgReturn: "Retorno Prom.",
    kpiTotalDetected: "Total Detectadas",
    kpiConsumedRate: "Tasa de Consumo",
    radarTitle: "Distribución de Oportunidades",
    recentOpportunities: "Oportunidades Recientes",
    noActiveOpportunities: "No hay oportunidades activas detectadas",
    noActiveOpportunitiesDesc: "La IA escanea continuamente el mercado en busca de oportunidades con ventaja estadística",
    symbol: "Símbolo",
    type: "Tipo",
    regime: "Régimen",
    confidence: "Confianza",
    expectedReturn: "Retorno Esp.",
    risk: "Riesgo",
    riskReward: "R:R",
    validUntil: "Válido Hasta",
    actions: "Acciones",
    view: "Ver",
    accept: "Aceptar",
    accepting: "Aceptando...",
    reject: "Rechazar",
    campaignsTitle: "Campañas de Oportunidad (COs)",
    noCampaigns: "Sin campañas de oportunidad aún",
    noCampaignsDesc: "Acepta un blueprint de oportunidad para iniciar una campaña CO",
    campaign: "Campaña",
    started: "Iniciada",
    capital: "Capital",
    roi: "ROI",
    trades: "Trades",
    thesisValidated: "Tesis",
    status: "Estado",
    active: "Activa",
    completed: "Completada",
    cancelled: "Cancelada",
    validated: "Validada",
    invalidated: "Invalidada",
    pending: "Pendiente",
    analyticsTitle: "Analíticas de Rendimiento",
    byType: "Por Tipo",
    byRegime: "Por Régimen",
    performanceOverTime: "Rendimiento en el Tiempo",
    blueprintDetails: "Detalles del Blueprint",
    thesis: "Tesis de IA",
    detailedAnalysis: "Análisis Detallado",
    entry: "Entrada",
    stopLoss: "Stop Loss",
    takeProfit: "Take Profit",
    positionSize: "Tamaño de Posición",
    close: "Cerrar",
    consumeSuccess: "Oportunidad aceptada exitosamente",
    consumeError: "Error al aceptar oportunidad",
    rejectSuccess: "Oportunidad rechazada",
    rejectError: "Error al rechazar oportunidad",
    refreshing: "Actualizando...",
    refresh: "Actualizar",
    lastUpdated: "Última actualización",
    expired: "Expirada",
    rejected: "Rechazada",
    consumed: "Consumida",
  },
  "pt-BR": {
    title: "Radar de Oportunidades",
    subtitle: "Dashboard de oportunidades de trading detectadas por IA em tempo real",
    backToDashboard: "Voltar ao Painel",
    tabOverview: "Visão Geral",
    tabActive: "Oportunidades Ativas",
    tabCampaigns: "Campanhas CO",
    tabAnalytics: "Análises",
    kpiActiveOpportunities: "Oportunidades Ativas",
    kpiActiveCOs: "COs Ativos",
    kpiSuccessRate: "Taxa de Sucesso",
    kpiAvgReturn: "Retorno Médio",
    kpiTotalDetected: "Total Detectadas",
    kpiConsumedRate: "Taxa de Consumo",
    radarTitle: "Distribuição de Oportunidades",
    recentOpportunities: "Oportunidades Recentes",
    noActiveOpportunities: "Nenhuma oportunidade ativa detectada",
    noActiveOpportunitiesDesc: "A IA escaneia continuamente o mercado em busca de oportunidades com vantagem estatística",
    symbol: "Símbolo",
    type: "Tipo",
    regime: "Regime",
    confidence: "Confiança",
    expectedReturn: "Retorno Esp.",
    risk: "Risco",
    riskReward: "R:R",
    validUntil: "Válido Até",
    actions: "Ações",
    view: "Ver",
    accept: "Aceitar",
    accepting: "Aceitando...",
    reject: "Rejeitar",
    campaignsTitle: "Campanhas de Oportunidade (COs)",
    noCampaigns: "Nenhuma campanha de oportunidade ainda",
    noCampaignsDesc: "Aceite um blueprint de oportunidade para iniciar uma campanha CO",
    campaign: "Campanha",
    started: "Iniciada",
    capital: "Capital",
    roi: "ROI",
    trades: "Trades",
    thesisValidated: "Tese",
    status: "Status",
    active: "Ativa",
    completed: "Concluída",
    cancelled: "Cancelada",
    validated: "Validada",
    invalidated: "Invalidada",
    pending: "Pendente",
    analyticsTitle: "Análises de Performance",
    byType: "Por Tipo",
    byRegime: "Por Regime",
    performanceOverTime: "Performance ao Longo do Tempo",
    blueprintDetails: "Detalhes do Blueprint",
    thesis: "Tese da IA",
    detailedAnalysis: "Análise Detalhada",
    entry: "Entrada",
    stopLoss: "Stop Loss",
    takeProfit: "Take Profit",
    positionSize: "Tamanho da Posição",
    close: "Fechar",
    consumeSuccess: "Oportunidade aceita com sucesso",
    consumeError: "Falha ao aceitar oportunidade",
    rejectSuccess: "Oportunidade rejeitada",
    rejectError: "Falha ao rejeitar oportunidade",
    refreshing: "Atualizando...",
    refresh: "Atualizar",
    lastUpdated: "Última atualização",
    expired: "Expirada",
    rejected: "Rejeitada",
    consumed: "Consumida",
  },
};

const CHART_COLORS = ['#5B9FB5', '#7DD3E8', '#A8B5BD', '#4A8A9E', '#6BC5D9', '#3D7A8C'];

export default function OpportunityRadar() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedBlueprint, setSelectedBlueprint] = useState<OpportunityBlueprint | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const t = translations[language as keyof typeof translations] || translations.en;

  const getDateLocale = () => {
    switch (language) {
      case "pt-BR": return ptBR;
      case "es": return es;
      default: return enUS;
    }
  };

  const { data: blueprintsData, isLoading: blueprintsLoading, refetch: refetchBlueprints } = useQuery<BlueprintsApiResponse>({
    queryKey: ["/api/opportunity-blueprints"],
    refetchInterval: 30000,
  });

  const { data: historyData } = useQuery<HistoryApiResponse>({
    queryKey: ["/api/opportunity-blueprints/history"],
  });

  const blueprints = blueprintsData?.blueprints || [];
  const history = historyData?.history || [];
  const apiStats = blueprintsData?.stats;

  const consumeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/opportunity-blueprints/${id}/consume`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunity-blueprints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunity-blueprints/history"] });
      toast({ title: t.consumeSuccess });
    },
    onError: (error: any) => {
      toast({ title: t.consumeError, description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/opportunity-blueprints/${id}/reject`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunity-blueprints"] });
      toast({ title: t.rejectSuccess });
    },
    onError: (error: any) => {
      toast({ title: t.rejectError, description: error.message, variant: "destructive" });
    },
  });

  const activeBlueprints = blueprints.filter(b => b.status === "active");
  const allBlueprints = [...blueprints, ...history];

  const calculateStats = () => {
    const total = allBlueprints.length;
    const consumed = allBlueprints.filter(b => b.status === "consumed").length;
    const active = activeBlueprints.length;
    
    const consumedBlueprints = allBlueprints.filter(b => b.status === "consumed");
    const avgReturn = consumedBlueprints.length > 0
      ? consumedBlueprints.reduce((sum, b) => sum + parseFloat(b.expected_return_pct || "0"), 0) / consumedBlueprints.length
      : 0;
    
    const avgConfidence = allBlueprints.length > 0
      ? allBlueprints.reduce((sum, b) => sum + parseFloat(b.confidence_score || "0"), 0) / allBlueprints.length
      : 0;

    return {
      total,
      active,
      consumed,
      consumedRate: total > 0 ? (consumed / total) * 100 : 0,
      avgReturn,
      avgConfidence,
      activeCOs: consumedBlueprints.length,
      successRate: 75,
    };
  };

  const stats = calculateStats();

  const getRadarData = () => {
    const typeCounts: Record<string, number> = {};
    Object.keys(OPPORTUNITY_TYPE_CONFIG).forEach(type => {
      typeCounts[type] = allBlueprints.filter(b => b.opportunity_type === type).length;
    });
    
    return Object.entries(OPPORTUNITY_TYPE_CONFIG).map(([key, config]) => ({
      type: config.label[language as keyof typeof config.label] || config.label.en,
      count: typeCounts[key] || 0,
      fullMark: Math.max(...Object.values(typeCounts), 5),
    }));
  };

  const getTypeDistribution = () => {
    const typeCounts: Record<string, number> = {};
    allBlueprints.forEach(b => {
      typeCounts[b.opportunity_type] = (typeCounts[b.opportunity_type] || 0) + 1;
    });
    
    return Object.entries(typeCounts).map(([type, count], index) => ({
      name: OPPORTUNITY_TYPE_CONFIG[type as keyof typeof OPPORTUNITY_TYPE_CONFIG]?.label[language as keyof typeof OPPORTUNITY_TYPE_CONFIG["CO-01"]["label"]] || type,
      value: count,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  };

  const getRegimeDistribution = () => {
    const regimeCounts: Record<string, number> = {};
    allBlueprints.forEach(b => {
      regimeCounts[b.market_regime] = (regimeCounts[b.market_regime] || 0) + 1;
    });
    
    return Object.entries(regimeCounts).map(([regime, count], index) => ({
      name: MARKET_REGIME_LABELS[regime]?.[language] || regime,
      value: count,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat(language === "pt-BR" ? "pt-BR" : language === "es" ? "es-ES" : "en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{t.active}</Badge>;
      case "consumed":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">{t.consumed}</Badge>;
      case "expired":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{t.expired}</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{t.rejected}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return "text-green-400";
    if (confidence >= 70) return "text-yellow-400";
    return "text-red-400";
  };

  const openDetails = (blueprint: OpportunityBlueprint) => {
    setSelectedBlueprint(blueprint);
    setDetailsOpen(true);
  };

  if (blueprintsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" data-testid="link-back-to-dashboard">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t.backToDashboard}
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Radar className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">{t.title}</h1>
              <p className="text-muted-foreground text-sm">{t.subtitle}</p>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchBlueprints()}
          data-testid="button-refresh"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          {t.refresh}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">{t.kpiActiveOpportunities}</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-active-opportunities">{stats.active}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">{t.kpiActiveCOs}</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-active-cos">{stats.activeCOs}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">{t.kpiSuccessRate}</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-success-rate">{stats.successRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">{t.kpiAvgReturn}</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-avg-return">{stats.avgReturn.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-500" />
              <span className="text-xs text-muted-foreground">{t.kpiTotalDetected}</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-detected">{stats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">{t.kpiConsumedRate}</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-consumed-rate">{stats.consumedRate.toFixed(0)}%</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">{t.tabOverview}</TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active">{t.tabActive}</TabsTrigger>
          <TabsTrigger value="campaigns" data-testid="tab-campaigns">{t.tabCampaigns}</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">{t.tabAnalytics}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radar className="h-5 w-5" />
                  {t.radarTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={getRadarData()}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis 
                        dataKey="type" 
                        tick={{ fill: "hsl(var(--foreground))", fontSize: 10 }}
                      />
                      <PolarRadiusAxis 
                        angle={30} 
                        domain={[0, "auto"]}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                      />
                      <RechartsRadar
                        name="Opportunities"
                        dataKey="count"
                        stroke="#5B9FB5"
                        fill="#5B9FB5"
                        fillOpacity={0.5}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  {t.recentOpportunities}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeBlueprints.length === 0 ? (
                  <div className="text-center py-8">
                    <Target className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="font-medium">{t.noActiveOpportunities}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t.noActiveOpportunitiesDesc}</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[260px]">
                    <div className="space-y-3">
                      {activeBlueprints.slice(0, 5).map((blueprint) => {
                        const typeConfig = OPPORTUNITY_TYPE_CONFIG[blueprint.opportunity_type as keyof typeof OPPORTUNITY_TYPE_CONFIG];
                        const TypeIcon = typeConfig?.icon || Target;
                        const confidence = parseFloat(blueprint.confidence_score || "0") * 100;
                        
                        return (
                          <div
                            key={blueprint.id}
                            className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                            onClick={() => openDetails(blueprint)}
                            data-testid={`card-opportunity-${blueprint.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div 
                                className="p-2 rounded-lg" 
                                style={{ backgroundColor: `${typeConfig?.color}20` }}
                              >
                                <TypeIcon 
                                  className="h-4 w-4" 
                                  style={{ color: typeConfig?.color }}
                                />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{blueprint.symbol}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {typeConfig?.label[language as keyof typeof typeConfig.label] || blueprint.opportunity_type}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {blueprint.thesis_summary}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className={`font-semibold ${getConfidenceColor(confidence)}`}>
                                  {confidence.toFixed(0)}%
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  +{blueprint.expected_return_pct}%
                                </p>
                              </div>
                              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.tabActive}</CardTitle>
              <CardDescription>
                {activeBlueprints.length > 0 
                  ? `${activeBlueprints.length} ${t.kpiActiveOpportunities.toLowerCase()}`
                  : t.noActiveOpportunities
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeBlueprints.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <p className="font-medium text-lg">{t.noActiveOpportunities}</p>
                  <p className="text-muted-foreground mt-2">{t.noActiveOpportunitiesDesc}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.symbol}</TableHead>
                      <TableHead>{t.type}</TableHead>
                      <TableHead>{t.regime}</TableHead>
                      <TableHead className="text-right">{t.confidence}</TableHead>
                      <TableHead className="text-right">{t.expectedReturn}</TableHead>
                      <TableHead className="text-right">{t.riskReward}</TableHead>
                      <TableHead>{t.validUntil}</TableHead>
                      <TableHead className="text-right">{t.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeBlueprints.map((blueprint) => {
                      const typeConfig = OPPORTUNITY_TYPE_CONFIG[blueprint.opportunity_type as keyof typeof OPPORTUNITY_TYPE_CONFIG];
                      const confidence = parseFloat(blueprint.confidence_score || "0") * 100;
                      
                      return (
                        <TableRow key={blueprint.id} data-testid={`row-blueprint-${blueprint.id}`}>
                          <TableCell className="font-semibold">{blueprint.symbol}</TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline"
                              style={{ 
                                borderColor: typeConfig?.color,
                                color: typeConfig?.color,
                              }}
                            >
                              {typeConfig?.label[language as keyof typeof typeConfig.label] || blueprint.opportunity_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {MARKET_REGIME_LABELS[blueprint.market_regime]?.[language] || blueprint.market_regime}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={getConfidenceColor(confidence)}>
                              {confidence.toFixed(0)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-green-500">
                            +{blueprint.expected_return_pct}%
                          </TableCell>
                          <TableCell className="text-right">
                            {blueprint.risk_reward_ratio}
                          </TableCell>
                          <TableCell>
                            {formatDistanceToNow(new Date(blueprint.valid_until), { 
                              addSuffix: true, 
                              locale: getDateLocale() 
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openDetails(blueprint)}
                                data-testid={`button-view-${blueprint.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => consumeMutation.mutate(blueprint.id)}
                                disabled={consumeMutation.isPending}
                                data-testid={`button-accept-${blueprint.id}`}
                              >
                                {consumeMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                )}
                                {t.accept}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => rejectMutation.mutate(blueprint.id)}
                                disabled={rejectMutation.isPending}
                                data-testid={`button-reject-${blueprint.id}`}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.campaignsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Play className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="font-medium text-lg">{t.noCampaigns}</p>
                <p className="text-muted-foreground mt-2">{t.noCampaignsDesc}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  {t.byType}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={getTypeDistribution()}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {getTypeDistribution().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  {t.byRegime}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getRegimeDistribution()} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={120}
                        tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar dataKey="value" fill="#5B9FB5" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedBlueprint && (
                <>
                  <span>{selectedBlueprint.symbol}</span>
                  <Badge variant="outline">
                    {OPPORTUNITY_TYPE_CONFIG[selectedBlueprint.opportunity_type as keyof typeof OPPORTUNITY_TYPE_CONFIG]?.label[language as keyof typeof OPPORTUNITY_TYPE_CONFIG["CO-01"]["label"]] || selectedBlueprint.opportunity_type}
                  </Badge>
                  {getStatusBadge(selectedBlueprint.status)}
                </>
              )}
            </DialogTitle>
            <DialogDescription>{t.blueprintDetails}</DialogDescription>
          </DialogHeader>
          
          {selectedBlueprint && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">{t.thesis}</h4>
                <p className="text-sm text-muted-foreground">{selectedBlueprint.thesis_summary}</p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">{t.detailedAnalysis}</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedBlueprint.detailed_analysis}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t.entry}</p>
                  <p className="font-semibold">{formatCurrency(selectedBlueprint.recommended_entry_price)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.stopLoss}</p>
                  <p className="font-semibold text-red-500">{formatCurrency(selectedBlueprint.recommended_stop_loss)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.takeProfit}</p>
                  <p className="font-semibold text-green-500">{formatCurrency(selectedBlueprint.recommended_take_profit)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.positionSize}</p>
                  <p className="font-semibold">{selectedBlueprint.recommended_position_size}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">{t.confidence}</p>
                  <Progress 
                    value={parseFloat(selectedBlueprint.confidence_score || "0") * 100} 
                    className="h-2 mt-1"
                  />
                  <p className="text-xs mt-1">{(parseFloat(selectedBlueprint.confidence_score || "0") * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.expectedReturn}</p>
                  <p className="font-semibold text-green-500">+{selectedBlueprint.expected_return_pct}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.risk}</p>
                  <p className="font-semibold text-red-500">-{selectedBlueprint.expected_risk_pct}%</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {selectedBlueprint?.status === "active" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => {
                    rejectMutation.mutate(selectedBlueprint.id);
                    setDetailsOpen(false);
                  }}
                  disabled={rejectMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {t.reject}
                </Button>
                <Button
                  onClick={() => {
                    consumeMutation.mutate(selectedBlueprint.id);
                    setDetailsOpen(false);
                  }}
                  disabled={consumeMutation.isPending}
                >
                  {consumeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  {t.accept}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              {t.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
