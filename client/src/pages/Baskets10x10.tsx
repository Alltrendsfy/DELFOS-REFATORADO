import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Loader2,
  Grid3X3,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  Target,
  Activity,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Layers,
  Gauge,
  BarChart2,
  PieChart,
  Wallet,
  CircleDot,
  Scale,
  Percent,
  Timer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";

interface BasketAsset {
  symbol: string;
  cluster_id: number;
  cluster_name: string;
  composite_score: number;
  momentum_trend_strength: number;
  volume_24h_usd: number;
  spread_bps: number;
  volatility_30d: number;
  correlation_btc: number;
  vre_regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  correlation_to_basket: number;
  weight: number;
}

interface ClusterBasket {
  cluster_id: number;
  cluster_name: string;
  cluster_strategy: string;
  assets: BasketAsset[];
  avg_cos_score: number;
  avg_momentum: number;
  avg_liquidity: number;
  total_weight: number;
}

interface ClusterDeficit {
  cluster_id: number;
  target: number;
  actual: number;
  deficit: number;
  reason: string;
}

interface CorrelationAudit {
  avg_btc_correlation: number;
  min_btc_correlation: number;
  max_btc_correlation: number;
  avg_intra_cluster_correlation: number;
  correlation_method: 'empirical' | 'fallback' | 'mixed';
  empirical_coverage_pct: number;
}

interface Basket10x10 {
  id: string;
  created_at: string;
  expires_at: string;
  total_assets: number;
  cluster_baskets: ClusterBasket[];
  total_cos_score: number;
  avg_correlation: number;
  diversification_score: number;
  max_correlation_threshold: number;
  is_complete: boolean;
  metadata: {
    generation_time_ms: number;
    clusters_used: number;
    assets_excluded_by_correlation: number;
    cluster_deficits: ClusterDeficit[];
    correlation_audit: CorrelationAudit;
  };
}

const CLUSTER_NAMES: Record<number, Record<string, string>> = {
  1: { en: "Liquidity Ultra", es: "Liquidez Ultra", "pt-BR": "Liquidez Ultra" },
  2: { en: "Vol Moderate", es: "Vol Moderada", "pt-BR": "Vol Moderada" },
  3: { en: "Explosive", es: "Explosivo", "pt-BR": "Explosivo" },
  4: { en: "Momentum Strong", es: "Momentum Fuerte", "pt-BR": "Momentum Forte" },
  5: { en: "Scalping", es: "Scalping", "pt-BR": "Scalping" },
  6: { en: "Narrative Hot", es: "Narrativa Caliente", "pt-BR": "Narrativa Quente" },
  7: { en: "Trend Defined", es: "Tendencia Definida", "pt-BR": "Tendência Definida" },
  8: { en: "Sideways", es: "Lateral", "pt-BR": "Lateral" },
  9: { en: "Altcoin Mid", es: "Altcoin Medio", "pt-BR": "Altcoin Médio" },
  10: { en: "Hybrid", es: "Híbrido", "pt-BR": "Híbrido" },
};

const CLUSTER_COLORS: Record<number, string> = {
  1: "bg-blue-500",
  2: "bg-green-500",
  3: "bg-red-500",
  4: "bg-purple-500",
  5: "bg-yellow-500",
  6: "bg-pink-500",
  7: "bg-indigo-500",
  8: "bg-gray-500",
  9: "bg-orange-500",
  10: "bg-teal-500",
};

const REGIME_COLORS: Record<string, string> = {
  LOW: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  NORMAL: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  EXTREME: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const translations = {
  en: {
    title: "Baskets 10×10",
    description: "Portfolio baskets with up to 100 assets selected by Cluster Opportunity Score",
    backToDashboard: "Back to Dashboard",
    tabOverview: "Overview",
    tabClusters: "By Cluster",
    tabAssets: "All Assets",
    tabAudit: "Audit",
    noBasket: "No basket available",
    noBasketDesc: "Generate a new basket to see portfolio allocation",
    refresh: "Refresh",
    refreshing: "Generating...",
    totalAssets: "Total Assets",
    totalCOS: "Total COS",
    diversification: "Diversification",
    avgCorrelation: "Avg Correlation",
    clustersUsed: "Clusters Used",
    excluded: "Excluded",
    complete: "Complete",
    incomplete: "Incomplete",
    generatedAt: "Generated",
    expiresIn: "Expires",
    generationTime: "Generation Time",
    cluster: "Cluster",
    assets: "Assets",
    avgScore: "Avg Score",
    avgMomentum: "Avg Momentum",
    avgLiquidity: "Avg Liquidity",
    weight: "Weight",
    symbol: "Symbol",
    score: "Score",
    momentum: "Momentum",
    volume: "Volume 24h",
    spread: "Spread",
    volatility: "Volatility",
    correlationBTC: "Corr BTC",
    regime: "Regime",
    correlationAudit: "Correlation Audit",
    avgBTCCorr: "Avg BTC Correlation",
    minBTCCorr: "Min BTC Correlation",
    maxBTCCorr: "Max BTC Correlation",
    intraClusterCorr: "Intra-Cluster Correlation",
    correlationMethod: "Correlation Method",
    empiricalCoverage: "Empirical Coverage",
    clusterDeficits: "Cluster Deficits",
    target: "Target",
    actual: "Actual",
    deficit: "Deficit",
    reason: "Reason",
    noDeficits: "No cluster deficits",
    details: "Details",
  },
  es: {
    title: "Cestas 10×10",
    description: "Cestas de portafolio con hasta 100 activos seleccionados por Score de Oportunidad de Cluster",
    backToDashboard: "Volver al Panel",
    tabOverview: "Resumen",
    tabClusters: "Por Cluster",
    tabAssets: "Todos los Activos",
    tabAudit: "Auditoría",
    noBasket: "No hay cesta disponible",
    noBasketDesc: "Genere una nueva cesta para ver la asignación del portafolio",
    refresh: "Actualizar",
    refreshing: "Generando...",
    totalAssets: "Total de Activos",
    totalCOS: "COS Total",
    diversification: "Diversificación",
    avgCorrelation: "Correlación Promedio",
    clustersUsed: "Clusters Usados",
    excluded: "Excluidos",
    complete: "Completo",
    incomplete: "Incompleto",
    generatedAt: "Generado",
    expiresIn: "Expira",
    generationTime: "Tiempo de Generación",
    cluster: "Cluster",
    assets: "Activos",
    avgScore: "Puntuación Promedio",
    avgMomentum: "Momentum Promedio",
    avgLiquidity: "Liquidez Promedio",
    weight: "Peso",
    symbol: "Símbolo",
    score: "Puntuación",
    momentum: "Momentum",
    volume: "Volumen 24h",
    spread: "Spread",
    volatility: "Volatilidad",
    correlationBTC: "Corr BTC",
    regime: "Régimen",
    correlationAudit: "Auditoría de Correlación",
    avgBTCCorr: "Correlación BTC Promedio",
    minBTCCorr: "Correlación BTC Mínima",
    maxBTCCorr: "Correlación BTC Máxima",
    intraClusterCorr: "Correlación Intra-Cluster",
    correlationMethod: "Método de Correlación",
    empiricalCoverage: "Cobertura Empírica",
    clusterDeficits: "Déficits de Cluster",
    target: "Objetivo",
    actual: "Actual",
    deficit: "Déficit",
    reason: "Razón",
    noDeficits: "Sin déficits de cluster",
    details: "Detalles",
  },
  "pt-BR": {
    title: "Cestas 10×10",
    description: "Cestas de portfólio com até 100 ativos selecionados por Score de Oportunidade de Cluster",
    backToDashboard: "Voltar ao Painel",
    tabOverview: "Visão Geral",
    tabClusters: "Por Cluster",
    tabAssets: "Todos os Ativos",
    tabAudit: "Auditoria",
    noBasket: "Nenhuma cesta disponível",
    noBasketDesc: "Gere uma nova cesta para ver a alocação do portfólio",
    refresh: "Atualizar",
    refreshing: "Gerando...",
    totalAssets: "Total de Ativos",
    totalCOS: "COS Total",
    diversification: "Diversificação",
    avgCorrelation: "Correlação Média",
    clustersUsed: "Clusters Usados",
    excluded: "Excluídos",
    complete: "Completo",
    incomplete: "Incompleto",
    generatedAt: "Gerado",
    expiresIn: "Expira",
    generationTime: "Tempo de Geração",
    cluster: "Cluster",
    assets: "Ativos",
    avgScore: "Pontuação Média",
    avgMomentum: "Momentum Médio",
    avgLiquidity: "Liquidez Média",
    weight: "Peso",
    symbol: "Símbolo",
    score: "Pontuação",
    momentum: "Momentum",
    volume: "Volume 24h",
    spread: "Spread",
    volatility: "Volatilidade",
    correlationBTC: "Corr BTC",
    regime: "Regime",
    correlationAudit: "Auditoria de Correlação",
    avgBTCCorr: "Correlação BTC Média",
    minBTCCorr: "Correlação BTC Mínima",
    maxBTCCorr: "Correlação BTC Máxima",
    intraClusterCorr: "Correlação Intra-Cluster",
    correlationMethod: "Método de Correlação",
    empiricalCoverage: "Cobertura Empírica",
    clusterDeficits: "Déficits de Cluster",
    target: "Alvo",
    actual: "Atual",
    deficit: "Déficit",
    reason: "Razão",
    noDeficits: "Sem déficits de cluster",
    details: "Detalhes",
  },
};

export default function Baskets10x10() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const t = translations[language as keyof typeof translations] || translations.en;
  const [selectedCluster, setSelectedCluster] = useState<ClusterBasket | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getDateLocale = () => {
    switch (language) {
      case "es": return es;
      case "pt-BR": return ptBR;
      default: return enUS;
    }
  };

  const { data: basketData, isLoading, refetch } = useQuery<{ basket: Basket10x10 }>({
    queryKey: ["/api/baskets/10x10"],
  });

  const basket = basketData?.basket;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/baskets/10x10/refresh");
      if (response.ok) {
        await refetch();
        toast({
          title: language === "es" ? "Cesta actualizada" : language === "pt-BR" ? "Cesta atualizada" : "Basket refreshed",
          description: language === "es" ? "La cesta ha sido regenerada" : language === "pt-BR" ? "A cesta foi regenerada" : "The basket has been regenerated",
        });
      } else {
        throw new Error("Failed to refresh");
      }
    } catch (error) {
      toast({
        title: language === "es" ? "Error" : language === "pt-BR" ? "Erro" : "Error",
        description: language === "es" ? "No se pudo actualizar la cesta" : language === "pt-BR" ? "Não foi possível atualizar a cesta" : "Failed to refresh basket",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-6" data-testid="page-baskets-loading">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6" data-testid="page-baskets-10x10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Grid3X3 className="h-6 w-6 text-primary" />
              {t.title}
            </h1>
            <p className="text-muted-foreground text-sm">{t.description}</p>
          </div>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          data-testid="button-refresh-basket"
        >
          {isRefreshing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t.refreshing}
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t.refresh}
            </>
          )}
        </Button>
      </div>

      {!basket ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <Grid3X3 className="h-16 w-16 text-muted-foreground/50" />
            <h3 className="text-xl font-semibold">{t.noBasket}</h3>
            <p className="text-muted-foreground">{t.noBasketDesc}</p>
            <Button onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t.refresh}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Wallet className="h-4 w-4" />
                  {t.totalAssets}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-assets">
                  {basket.total_assets}
                  <span className="text-sm text-muted-foreground ml-1">/100</span>
                </div>
                <Progress value={basket.total_assets} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Target className="h-4 w-4" />
                  {t.totalCOS}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-cos">
                  {basket.total_cos_score.toFixed(2)}
                </div>
                <Progress value={basket.total_cos_score * 10} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <PieChart className="h-4 w-4" />
                  {t.diversification}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-diversification">
                  {formatPercent(basket.diversification_score)}
                </div>
                <Progress value={basket.diversification_score * 100} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Scale className="h-4 w-4" />
                  {t.avgCorrelation}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-correlation">
                  {formatPercent(basket.avg_correlation)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Layers className="h-4 w-4" />
                  {t.clustersUsed}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-clusters-used">
                  {basket.metadata.clusters_used}
                  <span className="text-sm text-muted-foreground ml-1">/10</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  {t.excluded}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500" data-testid="text-excluded">
                  {basket.metadata.assets_excluded_by_correlation}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              {basket.is_complete ? (
                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-status-complete">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  {t.complete}
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" data-testid="badge-status-incomplete">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {t.incomplete}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1" data-testid="text-generated-at">
              <Clock className="h-4 w-4" />
              {t.generatedAt}: {format(new Date(basket.created_at), "PPp", { locale: getDateLocale() })}
            </div>
            <div className="flex items-center gap-1" data-testid="text-expires-in">
              <Timer className="h-4 w-4" />
              {t.expiresIn}: {formatDistanceToNow(new Date(basket.expires_at), { addSuffix: true, locale: getDateLocale() })}
            </div>
            <div className="flex items-center gap-1" data-testid="text-generation-time">
              <Gauge className="h-4 w-4" />
              {t.generationTime}: {basket.metadata.generation_time_ms}ms
            </div>
          </div>

          <Tabs defaultValue="clusters" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" data-testid="tab-overview">{t.tabOverview}</TabsTrigger>
              <TabsTrigger value="clusters" data-testid="tab-clusters">{t.tabClusters}</TabsTrigger>
              <TabsTrigger value="assets" data-testid="tab-assets">{t.tabAssets}</TabsTrigger>
              <TabsTrigger value="audit" data-testid="tab-audit">{t.tabAudit}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {basket.cluster_baskets.map((cluster) => (
                  <Card
                    key={cluster.cluster_id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => setSelectedCluster(cluster)}
                    data-testid={`card-cluster-${cluster.cluster_id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${CLUSTER_COLORS[cluster.cluster_id]}`} />
                        <CardTitle className="text-sm">
                          {CLUSTER_NAMES[cluster.cluster_id]?.[language] || cluster.cluster_name}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t.assets}</span>
                        <span className="font-medium" data-testid={`text-cluster-${cluster.cluster_id}-assets`}>{cluster.assets.length}/10</span>
                      </div>
                      <Progress value={cluster.assets.length * 10} className="h-2" />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t.avgScore}</span>
                        <span className="font-medium" data-testid={`text-cluster-${cluster.cluster_id}-score`}>{cluster.avg_cos_score.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t.weight}</span>
                        <span className="font-medium" data-testid={`text-cluster-${cluster.cluster_id}-weight`}>{formatPercent(cluster.total_weight)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="clusters" className="mt-6">
              <Accordion type="multiple" className="w-full space-y-2">
                {basket.cluster_baskets.map((cluster) => (
                  <AccordionItem
                    key={cluster.cluster_id}
                    value={`cluster-${cluster.cluster_id}`}
                    className="border rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline" data-testid={`accordion-cluster-${cluster.cluster_id}`}>
                      <div className="flex items-center gap-4 w-full">
                        <div className={`w-4 h-4 rounded-full ${CLUSTER_COLORS[cluster.cluster_id]}`} />
                        <div className="flex-1 text-left">
                          <span className="font-semibold">
                            {CLUSTER_NAMES[cluster.cluster_id]?.[language] || cluster.cluster_name}
                          </span>
                          <span className="text-muted-foreground ml-2 text-sm">
                            ({cluster.assets.length} {t.assets.toLowerCase()})
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm mr-4">
                          <div className="text-right">
                            <span className="text-muted-foreground">{t.avgScore}: </span>
                            <span className="font-medium">{cluster.avg_cos_score.toFixed(2)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-muted-foreground">{t.weight}: </span>
                            <span className="font-medium">{formatPercent(cluster.total_weight)}</span>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ScrollArea className="h-[300px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t.symbol}</TableHead>
                              <TableHead className="text-right">{t.score}</TableHead>
                              <TableHead className="text-right">{t.momentum}</TableHead>
                              <TableHead className="text-right">{t.volume}</TableHead>
                              <TableHead className="text-right">{t.spread}</TableHead>
                              <TableHead className="text-right">{t.correlationBTC}</TableHead>
                              <TableHead>{t.regime}</TableHead>
                              <TableHead className="text-right">{t.weight}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cluster.assets.map((asset) => (
                              <TableRow key={asset.symbol} data-testid={`row-asset-${asset.symbol}`}>
                                <TableCell className="font-medium">{asset.symbol}</TableCell>
                                <TableCell className="text-right">{asset.composite_score.toFixed(2)}</TableCell>
                                <TableCell className="text-right">
                                  <span className={asset.momentum_trend_strength > 0 ? "text-green-500" : "text-red-500"}>
                                    {asset.momentum_trend_strength > 0 ? "+" : ""}{(asset.momentum_trend_strength * 100).toFixed(1)}%
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(asset.volume_24h_usd)}</TableCell>
                                <TableCell className="text-right">{asset.spread_bps.toFixed(1)} bps</TableCell>
                                <TableCell className="text-right">{formatPercent(asset.correlation_btc)}</TableCell>
                                <TableCell>
                                  <Badge className={REGIME_COLORS[asset.vre_regime]}>
                                    {asset.vre_regime}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatPercent(asset.weight)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </TabsContent>

            <TabsContent value="assets" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart2 className="h-5 w-5" />
                    {t.tabAssets} ({basket.total_assets})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.symbol}</TableHead>
                          <TableHead>{t.cluster}</TableHead>
                          <TableHead className="text-right">{t.score}</TableHead>
                          <TableHead className="text-right">{t.momentum}</TableHead>
                          <TableHead className="text-right">{t.volume}</TableHead>
                          <TableHead className="text-right">{t.volatility}</TableHead>
                          <TableHead className="text-right">{t.correlationBTC}</TableHead>
                          <TableHead>{t.regime}</TableHead>
                          <TableHead className="text-right">{t.weight}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {basket.cluster_baskets.flatMap((cluster) =>
                          cluster.assets.map((asset) => (
                            <TableRow key={asset.symbol} data-testid={`row-all-asset-${asset.symbol}`}>
                              <TableCell className="font-medium">{asset.symbol}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${CLUSTER_COLORS[asset.cluster_id]}`} />
                                  <span className="text-sm">{CLUSTER_NAMES[asset.cluster_id]?.[language] || asset.cluster_name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{asset.composite_score.toFixed(2)}</TableCell>
                              <TableCell className="text-right">
                                <span className={asset.momentum_trend_strength > 0 ? "text-green-500" : "text-red-500"}>
                                  {asset.momentum_trend_strength > 0 ? "+" : ""}{(asset.momentum_trend_strength * 100).toFixed(1)}%
                                </span>
                              </TableCell>
                              <TableCell className="text-right">{formatCurrency(asset.volume_24h_usd)}</TableCell>
                              <TableCell className="text-right">{formatPercent(asset.volatility_30d)}</TableCell>
                              <TableCell className="text-right">{formatPercent(asset.correlation_btc)}</TableCell>
                              <TableCell>
                                <Badge className={REGIME_COLORS[asset.vre_regime]}>
                                  {asset.vre_regime}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">{formatPercent(asset.weight)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="h-5 w-5" />
                    {t.correlationAudit}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t.avgBTCCorr}</p>
                    <p className="text-xl font-bold" data-testid="text-audit-avg-btc">{formatPercent(basket.metadata.correlation_audit.avg_btc_correlation)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t.minBTCCorr}</p>
                    <p className="text-xl font-bold" data-testid="text-audit-min-btc">{formatPercent(basket.metadata.correlation_audit.min_btc_correlation)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t.maxBTCCorr}</p>
                    <p className="text-xl font-bold" data-testid="text-audit-max-btc">{formatPercent(basket.metadata.correlation_audit.max_btc_correlation)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t.intraClusterCorr}</p>
                    <p className="text-xl font-bold" data-testid="text-audit-intra-cluster">{formatPercent(basket.metadata.correlation_audit.avg_intra_cluster_correlation)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t.correlationMethod}</p>
                    <Badge variant="outline" data-testid="badge-correlation-method">{basket.metadata.correlation_audit.correlation_method}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t.empiricalCoverage}</p>
                    <p className="text-xl font-bold" data-testid="text-audit-empirical-coverage">{formatPercent(basket.metadata.correlation_audit.empirical_coverage_pct / 100)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    {t.clusterDeficits}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {basket.metadata.cluster_deficits.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                      <p>{t.noDeficits}</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.cluster}</TableHead>
                          <TableHead className="text-right">{t.target}</TableHead>
                          <TableHead className="text-right">{t.actual}</TableHead>
                          <TableHead className="text-right">{t.deficit}</TableHead>
                          <TableHead>{t.reason}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {basket.metadata.cluster_deficits.map((deficit) => (
                          <TableRow key={deficit.cluster_id} data-testid={`row-deficit-${deficit.cluster_id}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${CLUSTER_COLORS[deficit.cluster_id]}`} />
                                {CLUSTER_NAMES[deficit.cluster_id]?.[language] || `Cluster ${deficit.cluster_id}`}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{deficit.target}</TableCell>
                            <TableCell className="text-right">{deficit.actual}</TableCell>
                            <TableCell className="text-right text-orange-500 font-medium">-{deficit.deficit}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{deficit.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={!!selectedCluster} onOpenChange={() => setSelectedCluster(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-cluster-detail">
          {selectedCluster && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2" data-testid="dialog-cluster-title">
                  <div className={`w-4 h-4 rounded-full ${CLUSTER_COLORS[selectedCluster.cluster_id]}`} />
                  {CLUSTER_NAMES[selectedCluster.cluster_id]?.[language] || selectedCluster.cluster_name}
                </DialogTitle>
                <DialogDescription>{selectedCluster.cluster_strategy}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold" data-testid="dialog-cluster-assets-count">{selectedCluster.assets.length}</p>
                  <p className="text-sm text-muted-foreground">{t.assets}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold" data-testid="dialog-cluster-avg-score">{selectedCluster.avg_cos_score.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">{t.avgScore}</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl font-bold ${selectedCluster.avg_momentum > 0 ? "text-green-500" : "text-red-500"}`} data-testid="dialog-cluster-avg-momentum">
                    {selectedCluster.avg_momentum > 0 ? "+" : ""}{(selectedCluster.avg_momentum * 100).toFixed(1)}%
                  </p>
                  <p className="text-sm text-muted-foreground">{t.avgMomentum}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold" data-testid="dialog-cluster-weight">{formatPercent(selectedCluster.total_weight)}</p>
                  <p className="text-sm text-muted-foreground">{t.weight}</p>
                </div>
              </div>
              <ScrollArea className="h-[300px] mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.symbol}</TableHead>
                      <TableHead className="text-right">{t.score}</TableHead>
                      <TableHead className="text-right">{t.momentum}</TableHead>
                      <TableHead className="text-right">{t.volume}</TableHead>
                      <TableHead>{t.regime}</TableHead>
                      <TableHead className="text-right">{t.weight}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCluster.assets.map((asset) => (
                      <TableRow key={asset.symbol} data-testid={`row-dialog-asset-${asset.symbol}`}>
                        <TableCell className="font-medium">{asset.symbol}</TableCell>
                        <TableCell className="text-right">{asset.composite_score.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <span className={asset.momentum_trend_strength > 0 ? "text-green-500" : "text-red-500"}>
                            {asset.momentum_trend_strength > 0 ? "+" : ""}{(asset.momentum_trend_strength * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(asset.volume_24h_usd)}</TableCell>
                        <TableCell>
                          <Badge className={REGIME_COLORS[asset.vre_regime]}>{asset.vre_regime}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatPercent(asset.weight)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
