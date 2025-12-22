import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  Target,
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  Sparkles,
  ArrowLeft,
  RefreshCw,
  Layers,
  Gauge,
  Wind,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";

type OpportunityWindow = {
  id: string;
  type: string;
  vre_regime: string;
  cluster_id: number;
  score: string;
  cos_score: string;
  thesis: string;
  feature_snapshot: any;
  symbols: string[];
  expires_at: string;
  consumed: boolean;
  consumed_by_blueprint_id?: string;
  content_hash?: string;
  created_at: string;
  updated_at: string;
};

const WINDOW_TYPE_LABELS: Record<string, Record<string, string>> = {
  "MEAN_REVERSION": { en: "Mean Reversion", es: "Reversión a la Media", "pt-BR": "Reversão à Média" },
  "VOLATILITY_BREAKOUT": { en: "Volatility Breakout", es: "Ruptura de Volatilidad", "pt-BR": "Rompimento de Volatilidade" },
  "MOMENTUM_SURGE": { en: "Momentum Surge", es: "Impulso de Momentum", "pt-BR": "Surto de Momentum" },
  "LIQUIDITY_IMBALANCE": { en: "Liquidity Imbalance", es: "Desequilibrio de Liquidez", "pt-BR": "Desequilíbrio de Liquidez" },
  "CORRELATION_BREAKDOWN": { en: "Correlation Breakdown", es: "Ruptura de Correlación", "pt-BR": "Quebra de Correlação" },
  "TECHNICAL_DIVERGENCE": { en: "Technical Divergence", es: "Divergencia Técnica", "pt-BR": "Divergência Técnica" },
};

const REGIME_LABELS: Record<string, Record<string, string>> = {
  "LOW": { en: "Low Volatility", es: "Baja Volatilidad", "pt-BR": "Baixa Volatilidade" },
  "NORMAL": { en: "Normal", es: "Normal", "pt-BR": "Normal" },
  "HIGH": { en: "High Volatility", es: "Alta Volatilidad", "pt-BR": "Alta Volatilidade" },
  "EXTREME": { en: "Extreme", es: "Extrema", "pt-BR": "Extrema" },
  "VOLATILITY_EXPANSION": { en: "Vol Expansion", es: "Expansión Vol", "pt-BR": "Expansão Vol" },
  "TRENDING_BULLISH": { en: "Trending Up", es: "Tendencia Alcista", "pt-BR": "Tendência Alta" },
  "TRENDING_BEARISH": { en: "Trending Down", es: "Tendencia Bajista", "pt-BR": "Tendência Baixa" },
};

const CLUSTER_NAMES: Record<number, string> = {
  1: "LIQUIDITY_ULTRA",
  2: "VOL_MODERATE",
  3: "EXPLOSIVE",
  4: "MOMENTUM_STRONG",
  5: "SCALPING",
  6: "NARRATIVE_HOT",
  7: "TREND_DEFINED",
  8: "SIDEWAYS",
  9: "ALTCOIN_MID",
  10: "HYBRID",
};

const translations = {
  en: {
    title: "Opportunity Windows",
    description: "Real-time market opportunities detected by the Opportunity Engine",
    backToDashboard: "Back to Dashboard",
    tabActive: "Active Windows",
    tabConsumed: "Generated Blueprints",
    noWindows: "No active opportunity windows",
    noWindowsDesc: "The Opportunity Engine continuously scans the market for trading opportunities",
    refresh: "Refresh",
    refreshing: "Scanning...",
    type: "Window Type",
    regime: "VRE Regime",
    cluster: "Cluster",
    score: "Score",
    cosScore: "COS Score",
    symbols: "Symbols",
    expiresIn: "Expires In",
    actions: "Actions",
    generateBlueprint: "Generate Blueprint",
    generating: "Generating...",
    view: "Details",
    consumed: "Blueprint Generated",
    expired: "Expired",
    statsTitle: "Detection Summary",
    activeWindows: "Active Windows",
    avgScore: "Avg Score",
    avgCOS: "Avg COS",
    topCluster: "Top Cluster",
    windowDetails: "Opportunity Window Details",
    thesis: "AI Thesis",
    featureSnapshot: "Feature Snapshot",
    close: "Close",
    generateSuccess: "Blueprint generated successfully!",
    generateError: "Failed to generate blueprint",
    rateLimit: "Rate limit exceeded. Try again in a minute.",
    noSymbols: "No symbols",
    viewBlueprint: "View Blueprint",
    createCampaign: "Create Campaign",
  },
  es: {
    title: "Ventanas de Oportunidad",
    description: "Oportunidades de mercado en tiempo real detectadas por el Motor de Oportunidades",
    backToDashboard: "Volver al Panel",
    tabActive: "Ventanas Activas",
    tabConsumed: "Blueprints Generados",
    noWindows: "No hay ventanas de oportunidad activas",
    noWindowsDesc: "El Motor de Oportunidades escanea continuamente el mercado en busca de oportunidades",
    refresh: "Actualizar",
    refreshing: "Escaneando...",
    type: "Tipo de Ventana",
    regime: "Régimen VRE",
    cluster: "Cluster",
    score: "Puntuación",
    cosScore: "Puntuación COS",
    symbols: "Símbolos",
    expiresIn: "Expira En",
    actions: "Acciones",
    generateBlueprint: "Generar Blueprint",
    generating: "Generando...",
    view: "Detalles",
    consumed: "Blueprint Generado",
    expired: "Expirada",
    statsTitle: "Resumen de Detección",
    activeWindows: "Ventanas Activas",
    avgScore: "Puntuación Prom",
    avgCOS: "COS Prom",
    topCluster: "Top Cluster",
    windowDetails: "Detalles de Ventana de Oportunidad",
    thesis: "Tesis AI",
    featureSnapshot: "Snapshot de Features",
    close: "Cerrar",
    generateSuccess: "Blueprint generado exitosamente!",
    generateError: "Error al generar blueprint",
    rateLimit: "Límite de tasa excedido. Intenta de nuevo en un minuto.",
    noSymbols: "Sin símbolos",
    viewBlueprint: "Ver Blueprint",
    createCampaign: "Crear Campaña",
  },
  "pt-BR": {
    title: "Janelas de Oportunidade",
    description: "Oportunidades de mercado em tempo real detectadas pelo Motor de Oportunidades",
    backToDashboard: "Voltar ao Painel",
    tabActive: "Janelas Ativas",
    tabConsumed: "Blueprints Gerados",
    noWindows: "Nenhuma janela de oportunidade ativa",
    noWindowsDesc: "O Motor de Oportunidades escaneia continuamente o mercado em busca de oportunidades",
    refresh: "Atualizar",
    refreshing: "Escaneando...",
    type: "Tipo de Janela",
    regime: "Regime VRE",
    cluster: "Cluster",
    score: "Pontuação",
    cosScore: "Pontuação COS",
    symbols: "Símbolos",
    expiresIn: "Expira Em",
    actions: "Ações",
    generateBlueprint: "Gerar Blueprint",
    generating: "Gerando...",
    view: "Detalhes",
    consumed: "Blueprint Gerado",
    expired: "Expirada",
    statsTitle: "Resumo de Detecção",
    activeWindows: "Janelas Ativas",
    avgScore: "Pontuação Média",
    avgCOS: "COS Médio",
    topCluster: "Top Cluster",
    windowDetails: "Detalhes da Janela de Oportunidade",
    thesis: "Tese AI",
    featureSnapshot: "Snapshot de Features",
    close: "Fechar",
    generateSuccess: "Blueprint gerado com sucesso!",
    generateError: "Falha ao gerar blueprint",
    rateLimit: "Limite de requisições excedido. Tente novamente em um minuto.",
    noSymbols: "Sem símbolos",
    viewBlueprint: "Ver Blueprint",
    createCampaign: "Criar Campanha",
  },
};

function getRegimeBadgeVariant(regime: string): "default" | "secondary" | "outline" | "destructive" {
  switch (regime) {
    case "LOW":
      return "secondary";
    case "NORMAL":
      return "default";
    case "HIGH":
      return "outline";
    case "EXTREME":
      return "destructive";
    default:
      return "outline";
  }
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return "text-green-500";
  if (score >= 0.6) return "text-emerald-500";
  if (score >= 0.4) return "text-yellow-500";
  return "text-orange-500";
}

function getClusterColor(clusterId: number): string {
  const colors = [
    "bg-blue-500/10 text-blue-600 border-blue-500/30",
    "bg-green-500/10 text-green-600 border-green-500/30",
    "bg-purple-500/10 text-purple-600 border-purple-500/30",
    "bg-orange-500/10 text-orange-600 border-orange-500/30",
    "bg-pink-500/10 text-pink-600 border-pink-500/30",
    "bg-red-500/10 text-red-600 border-red-500/30",
    "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
    "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
    "bg-teal-500/10 text-teal-600 border-teal-500/30",
  ];
  return colors[(clusterId - 1) % colors.length];
}

export default function OpportunityWindows() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const t = translations[language as keyof typeof translations] || translations.en;
  const dateLocale = language === "es" ? es : language === "pt-BR" ? ptBR : enUS;

  const [selectedWindow, setSelectedWindow] = useState<OpportunityWindow | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const { data: windowsData, isLoading, refetch, isFetching } = useQuery<{ windows: OpportunityWindow[] }>({
    queryKey: ["/api/opportunity-windows"],
    refetchInterval: 60000,
  });

  const generateMutation = useMutation({
    mutationFn: async (windowId: string) => {
      return await apiRequest<{ message: string; blueprint: any }>("/api/opportunity-blueprints/from-window", "POST", {
        window_id: windowId,
      });
    },
    onSuccess: (data) => {
      toast({ title: t.generateSuccess });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunity-windows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunity-blueprints"] });
      // Auto-navigate to campaign wizard with the newly created blueprint
      if (data?.blueprint?.id) {
        setLocation(`/campaigns/new?blueprint=${data.blueprint.id}`);
      }
    },
    onError: (error: any) => {
      const message = error?.message?.includes("Rate limit") ? t.rateLimit : t.generateError;
      toast({ title: message, variant: "destructive" });
    },
    onSettled: () => {
      setGeneratingId(null);
    },
  });

  const handleGenerate = (windowId: string) => {
    setGeneratingId(windowId);
    generateMutation.mutate(windowId);
  };

  const windows = windowsData?.windows || [];
  const activeWindows = windows.filter(w => !w.consumed && new Date(w.expires_at) > new Date());
  const consumedWindows = windows.filter(w => w.consumed);

  const avgScore = activeWindows.length > 0
    ? activeWindows.reduce((sum, w) => sum + parseFloat(w.score), 0) / activeWindows.length
    : 0;
  const avgCOS = activeWindows.length > 0
    ? activeWindows.reduce((sum, w) => sum + parseFloat(w.cos_score), 0) / activeWindows.length
    : 0;
  
  const clusterCounts = activeWindows.reduce((acc, w) => {
    acc[w.cluster_id] = (acc[w.cluster_id] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  const topCluster = Object.entries(clusterCounts).sort((a, b) => b[1] - a[1])[0];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-opportunity-windows">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Wind className="w-6 h-6 text-primary" />
              {t.title}
            </h1>
            <p className="text-muted-foreground text-sm">{t.description}</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-windows"
        >
          {isFetching ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {isFetching ? t.refreshing : t.refresh}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">{t.activeWindows}</p>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-mono font-bold" data-testid="text-active-count">
            {activeWindows.length}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">{t.avgScore}</p>
            <Target className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className={`text-2xl font-mono font-bold ${getScoreColor(avgScore)}`} data-testid="text-avg-score">
            {(avgScore * 100).toFixed(1)}%
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">{t.avgCOS}</p>
            <Gauge className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className={`text-2xl font-mono font-bold ${getScoreColor(avgCOS)}`} data-testid="text-avg-cos">
            {avgCOS.toFixed(4)}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">{t.topCluster}</p>
            <Layers className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-lg font-medium" data-testid="text-top-cluster">
            {topCluster ? CLUSTER_NAMES[parseInt(topCluster[0])] || `Cluster ${topCluster[0]}` : "-"}
          </p>
        </Card>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active">
            {t.tabActive}
            {activeWindows.length > 0 && (
              <Badge variant="secondary" className="ml-2">{activeWindows.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="consumed" data-testid="tab-consumed">
            {t.tabConsumed}
            {consumedWindows.length > 0 && (
              <Badge variant="outline" className="ml-2">{consumedWindows.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {activeWindows.length === 0 ? (
            <Card className="p-12 text-center">
              <Wind className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t.noWindows}</h3>
              <p className="text-muted-foreground text-sm">{t.noWindowsDesc}</p>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.type}</TableHead>
                    <TableHead>{t.regime}</TableHead>
                    <TableHead>{t.cluster}</TableHead>
                    <TableHead className="text-right">{t.score}</TableHead>
                    <TableHead className="text-right">{t.cosScore}</TableHead>
                    <TableHead>{t.symbols}</TableHead>
                    <TableHead>{t.expiresIn}</TableHead>
                    <TableHead className="text-right">{t.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeWindows.map((window) => {
                    const score = parseFloat(window.score);
                    const cosScore = parseFloat(window.cos_score);
                    const isExpired = new Date(window.expires_at) < new Date();
                    const typeLabel = WINDOW_TYPE_LABELS[window.type]?.[language] || window.type;
                    const regimeLabel = REGIME_LABELS[window.vre_regime]?.[language] || window.vre_regime;
                    const isGenerating = generatingId === window.id;

                    return (
                      <TableRow key={window.id} data-testid={`row-window-${window.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-primary" />
                            <span className="font-medium">{typeLabel}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRegimeBadgeVariant(window.vre_regime)}>
                            {regimeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getClusterColor(window.cluster_id)}>
                            {CLUSTER_NAMES[window.cluster_id] || `C${window.cluster_id}`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono font-semibold ${getScoreColor(score)}`}>
                            {(score * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono ${getScoreColor(cosScore)}`}>
                            {cosScore.toFixed(4)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {window.symbols && window.symbols.length > 0 ? (
                              window.symbols.slice(0, 3).map((sym) => (
                                <Badge key={sym} variant="secondary" className="text-xs">
                                  {sym}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-sm">{t.noSymbols}</span>
                            )}
                            {window.symbols && window.symbols.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{window.symbols.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className={isExpired ? "text-red-500" : ""}>
                              {isExpired
                                ? t.expired
                                : formatDistanceToNow(new Date(window.expires_at), {
                                    addSuffix: true,
                                    locale: dateLocale,
                                  })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedWindow(window)}
                              data-testid={`button-view-${window.id}`}
                            >
                              {t.view}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleGenerate(window.id)}
                              disabled={isGenerating || isExpired}
                              data-testid={`button-generate-${window.id}`}
                            >
                              {isGenerating ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  {t.generating}
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3 mr-1" />
                                  {t.generateBlueprint}
                                </>
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="consumed">
          {consumedWindows.length === 0 ? (
            <Card className="p-12 text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t.noWindows}</h3>
              <p className="text-muted-foreground text-sm">{t.noWindowsDesc}</p>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.type}</TableHead>
                    <TableHead>{t.regime}</TableHead>
                    <TableHead>{t.cluster}</TableHead>
                    <TableHead className="text-right">{t.score}</TableHead>
                    <TableHead className="text-right">{t.cosScore}</TableHead>
                    <TableHead>{t.symbols}</TableHead>
                    <TableHead className="text-right">{t.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumedWindows.map((window) => {
                    const score = parseFloat(window.score);
                    const cosScore = parseFloat(window.cos_score);
                    const typeLabel = WINDOW_TYPE_LABELS[window.type]?.[language] || window.type;
                    const regimeLabel = REGIME_LABELS[window.vre_regime]?.[language] || window.vre_regime;

                    return (
                      <TableRow key={window.id} className="opacity-75" data-testid={`row-consumed-${window.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="font-medium">{typeLabel}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRegimeBadgeVariant(window.vre_regime)}>
                            {regimeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getClusterColor(window.cluster_id)}>
                            {CLUSTER_NAMES[window.cluster_id] || `C${window.cluster_id}`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono font-semibold ${getScoreColor(score)}`}>
                            {(score * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono ${getScoreColor(cosScore)}`}>
                            {cosScore.toFixed(4)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {window.symbols && window.symbols.length > 0 ? (
                              window.symbols.slice(0, 3).map((sym) => (
                                <Badge key={sym} variant="secondary" className="text-xs">
                                  {sym}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-sm">{t.noSymbols}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedWindow(window)}
                              data-testid={`button-view-consumed-${window.id}`}
                            >
                              {t.view}
                            </Button>
                            {window.consumed_by_blueprint_id && (
                              <>
                                <Button size="sm" variant="outline" asChild>
                                  <Link href="/opportunities">
                                    <ArrowUpRight className="w-3 h-3 mr-1" />
                                    {t.viewBlueprint}
                                  </Link>
                                </Button>
                                <Button size="sm" variant="default" asChild data-testid={`button-create-campaign-${window.id}`}>
                                  <Link href={`/campaigns/new?blueprint=${window.consumed_by_blueprint_id}`}>
                                    <Zap className="w-3 h-3 mr-1" />
                                    {t.createCampaign}
                                  </Link>
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedWindow} onOpenChange={() => setSelectedWindow(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wind className="w-5 h-5 text-primary" />
              {t.windowDetails}
            </DialogTitle>
            <DialogDescription>
              {selectedWindow && (
                <span className="font-mono text-xs">
                  ID: {selectedWindow.id}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedWindow && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{t.type}</p>
                  <Badge variant="outline">
                    {WINDOW_TYPE_LABELS[selectedWindow.type]?.[language] || selectedWindow.type}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{t.regime}</p>
                  <Badge variant={getRegimeBadgeVariant(selectedWindow.vre_regime)}>
                    {REGIME_LABELS[selectedWindow.vre_regime]?.[language] || selectedWindow.vre_regime}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{t.cluster}</p>
                  <Badge variant="outline" className={getClusterColor(selectedWindow.cluster_id)}>
                    {CLUSTER_NAMES[selectedWindow.cluster_id] || `Cluster ${selectedWindow.cluster_id}`}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{t.score}</p>
                  <div className="flex items-center gap-2">
                    <Progress value={parseFloat(selectedWindow.score) * 100} className="h-2 flex-1" />
                    <span className={`font-mono font-semibold ${getScoreColor(parseFloat(selectedWindow.score))}`}>
                      {(parseFloat(selectedWindow.score) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1">{t.cosScore}</p>
                <p className={`font-mono text-lg font-bold ${getScoreColor(parseFloat(selectedWindow.cos_score))}`}>
                  {parseFloat(selectedWindow.cos_score).toFixed(6)}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">{t.thesis}</p>
                <Card className="p-4 bg-muted/50">
                  <p className="text-sm whitespace-pre-wrap">{selectedWindow.thesis}</p>
                </Card>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">{t.symbols}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedWindow.symbols && selectedWindow.symbols.length > 0 ? (
                    selectedWindow.symbols.map((sym) => (
                      <Badge key={sym} variant="secondary">{sym}</Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">{t.noSymbols}</span>
                  )}
                </div>
              </div>

              {selectedWindow.feature_snapshot && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">{t.featureSnapshot}</p>
                  <Card className="p-4 bg-muted/50">
                    <pre className="text-xs overflow-x-auto">
                      {JSON.stringify(selectedWindow.feature_snapshot, null, 2)}
                    </pre>
                  </Card>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedWindow(null)}>
              {t.close}
            </Button>
            {selectedWindow && !selectedWindow.consumed && new Date(selectedWindow.expires_at) > new Date() && (
              <Button
                onClick={() => {
                  handleGenerate(selectedWindow.id);
                  setSelectedWindow(null);
                }}
                disabled={generatingId === selectedWindow.id}
              >
                {generatingId === selectedWindow.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t.generating}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    {t.generateBlueprint}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
