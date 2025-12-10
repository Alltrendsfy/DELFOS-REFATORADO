import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  Bot,
  Clock,
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  CheckCircle,
  History,
  BarChart3,
  RefreshCw,
  FileText,
  Timer,
  Calendar,
  Coins
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface RobotStatus {
  campaignId: string;
  campaignName: string;
  status: 'waiting_entry' | 'monitoring' | 'in_position' | 'paused' | 'stopped';
  statusLabel: string;
  tradableAssets: string[];
  currentlyMonitoring: string[];
  entryCondition: string;
  lastSignalCheck: string | null;
  openPositionsCount: number;
  todayTradesCount: number;
  maxOpenPositions: number;
  maxDailyTrades: number;
  nextActionPlan: string;
  circuitBreakers: {
    campaign: boolean;
    dailyLoss: boolean;
    pair: boolean;
  };
}

interface Report8h {
  campaignId: string;
  campaignName: string;
  periodStart: string;
  periodEnd: string;
  tradesCount: number;
  wins: number;
  losses: number;
  netPnL: number;
  netPnLPct: number;
  openPositions: Array<{
    symbol: string;
    side: string;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    unrealizedPnLPct: number;
  }>;
  topPerformers: Array<{ symbol: string; pnl: number }>;
  worstPerformers: Array<{ symbol: string; pnl: number }>;
  nextAction: string;
}

interface Report24h {
  campaignId: string;
  campaignName: string;
  periodStart: string;
  periodEnd: string;
  tradesCount: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnL: number;
  roi: number;
  initialEquity: number;
  finalEquity: number;
  benchmarks: {
    btc24h: number;
    eth24h: number;
  };
  keyDecisions: Array<{
    time: string;
    action: string;
    symbol: string;
    result: number;
  }>;
  summary: string;
}

interface TradeHistory {
  id: string;
  timestamp: string;
  action: 'buy' | 'sell' | 'close';
  symbol: string;
  price: number;
  quantity: number;
  side: string;
  pnl: number | null;
  closeReason: string | null;
}

interface HistoryReport {
  campaignId: string;
  campaignName: string;
  periodStart: string;
  periodEnd: string;
  trades: TradeHistory[];
  totalTrades: number;
  accumulatedPnL: number;
  totalVolume: number;
}

interface CampaignReportsProps {
  campaignId: string;
}

const content = {
  'pt-BR': {
    tabs: {
      status: 'Estado Atual',
      report8h: 'Relatório 8h',
      report24h: 'Relatório 24h',
      history: 'Histórico',
    },
    status: {
      title: 'Estado Operacional do Robô',
      subtitle: 'Status atual e próximas ações planejadas',
      currentStatus: 'Status Atual',
      monitoringAssets: 'Ativos Monitorados',
      entryCondition: 'Condição de Entrada',
      nextAction: 'Próxima Ação Planejada',
      openPositions: 'Posições Abertas',
      todayTrades: 'Trades Hoje',
      lastCheck: 'Última Verificação',
      circuitBreakers: 'Circuit Breakers',
      cbCampaign: 'Campanha',
      cbDailyLoss: 'Perda Diária',
      cbPair: 'Par',
      statusLabels: {
        waiting_entry: 'Aguardando Entrada',
        monitoring: 'Monitorando Mercado',
        in_position: 'Em Posição',
        paused: 'Pausado',
        stopped: 'Parado',
      },
    },
    report8h: {
      title: 'Relatório de 8 Horas',
      subtitle: 'Resumo do desempenho recente',
      period: 'Período',
      tradesCount: 'Negociações',
      wins: 'Ganhos',
      losses: 'Perdas',
      netPnL: 'Lucro/Prejuízo Líquido',
      openPositions: 'Posições Ativas',
      topPerformers: 'Melhores Desempenhos',
      worstPerformers: 'Piores Desempenhos',
      nextAction: 'Próxima Ação Prevista',
      noPositions: 'Nenhuma posição aberta',
      noTrades: 'Nenhuma negociação no período',
    },
    report24h: {
      title: 'Relatório de 24 Horas',
      subtitle: 'Análise completa do dia',
      period: 'Período',
      tradesCount: 'Negociações',
      winRate: 'Taxa de Acerto',
      netPnL: 'Lucro/Prejuízo Líquido',
      roi: 'ROI do Período',
      initialEquity: 'Capital Inicial',
      finalEquity: 'Capital Final',
      summary: 'Resumo do Dia',
      keyDecisions: 'Principais Decisões',
      benchmarks: 'Comparativo de Mercado',
    },
    history: {
      title: 'Histórico de Operações',
      subtitle: 'Registro detalhado de todas as ações',
      period: 'Período',
      totalTrades: 'Total de Operações',
      accumulatedPnL: 'P&L Acumulado',
      totalVolume: 'Volume Total',
      date: 'Data/Hora',
      action: 'Ação',
      symbol: 'Ativo',
      price: 'Preço',
      quantity: 'Quantidade',
      result: 'Resultado',
      reason: 'Motivo',
      noTrades: 'Nenhuma operação no período',
      actions: {
        buy: 'Compra',
        sell: 'Venda',
        close: 'Fechamento',
      },
    },
    refresh: 'Atualizar',
    loading: 'Carregando...',
  },
  'en': {
    tabs: {
      status: 'Current Status',
      report8h: '8h Report',
      report24h: '24h Report',
      history: 'History',
    },
    status: {
      title: 'Robot Operational Status',
      subtitle: 'Current status and planned next actions',
      currentStatus: 'Current Status',
      monitoringAssets: 'Monitored Assets',
      entryCondition: 'Entry Condition',
      nextAction: 'Planned Next Action',
      openPositions: 'Open Positions',
      todayTrades: 'Trades Today',
      lastCheck: 'Last Check',
      circuitBreakers: 'Circuit Breakers',
      cbCampaign: 'Campaign',
      cbDailyLoss: 'Daily Loss',
      cbPair: 'Pair',
      statusLabels: {
        waiting_entry: 'Waiting Entry',
        monitoring: 'Monitoring Market',
        in_position: 'In Position',
        paused: 'Paused',
        stopped: 'Stopped',
      },
    },
    report8h: {
      title: '8-Hour Report',
      subtitle: 'Recent performance summary',
      period: 'Period',
      tradesCount: 'Trades',
      wins: 'Wins',
      losses: 'Losses',
      netPnL: 'Net Profit/Loss',
      openPositions: 'Active Positions',
      topPerformers: 'Top Performers',
      worstPerformers: 'Worst Performers',
      nextAction: 'Next Planned Action',
      noPositions: 'No open positions',
      noTrades: 'No trades in this period',
    },
    report24h: {
      title: '24-Hour Report',
      subtitle: 'Complete daily analysis',
      period: 'Period',
      tradesCount: 'Trades',
      winRate: 'Win Rate',
      netPnL: 'Net Profit/Loss',
      roi: 'Period ROI',
      initialEquity: 'Initial Capital',
      finalEquity: 'Final Capital',
      summary: 'Day Summary',
      keyDecisions: 'Key Decisions',
      benchmarks: 'Market Comparison',
    },
    history: {
      title: 'Trade History',
      subtitle: 'Detailed record of all actions',
      period: 'Period',
      totalTrades: 'Total Trades',
      accumulatedPnL: 'Accumulated P&L',
      totalVolume: 'Total Volume',
      date: 'Date/Time',
      action: 'Action',
      symbol: 'Asset',
      price: 'Price',
      quantity: 'Quantity',
      result: 'Result',
      reason: 'Reason',
      noTrades: 'No trades in this period',
      actions: {
        buy: 'Buy',
        sell: 'Sell',
        close: 'Close',
      },
    },
    refresh: 'Refresh',
    loading: 'Loading...',
  },
  'es': {
    tabs: {
      status: 'Estado Actual',
      report8h: 'Informe 8h',
      report24h: 'Informe 24h',
      history: 'Historial',
    },
    status: {
      title: 'Estado Operacional del Robot',
      subtitle: 'Estado actual y próximas acciones planificadas',
      currentStatus: 'Estado Actual',
      monitoringAssets: 'Activos Monitoreados',
      entryCondition: 'Condición de Entrada',
      nextAction: 'Próxima Acción Planificada',
      openPositions: 'Posiciones Abiertas',
      todayTrades: 'Trades Hoy',
      lastCheck: 'Última Verificación',
      circuitBreakers: 'Circuit Breakers',
      cbCampaign: 'Campaña',
      cbDailyLoss: 'Pérdida Diaria',
      cbPair: 'Par',
      statusLabels: {
        waiting_entry: 'Esperando Entrada',
        monitoring: 'Monitoreando Mercado',
        in_position: 'En Posición',
        paused: 'Pausado',
        stopped: 'Detenido',
      },
    },
    report8h: {
      title: 'Informe de 8 Horas',
      subtitle: 'Resumen del rendimiento reciente',
      period: 'Período',
      tradesCount: 'Operaciones',
      wins: 'Ganancias',
      losses: 'Pérdidas',
      netPnL: 'Ganancia/Pérdida Neta',
      openPositions: 'Posiciones Activas',
      topPerformers: 'Mejores Rendimientos',
      worstPerformers: 'Peores Rendimientos',
      nextAction: 'Próxima Acción Prevista',
      noPositions: 'Sin posiciones abiertas',
      noTrades: 'Sin operaciones en el período',
    },
    report24h: {
      title: 'Informe de 24 Horas',
      subtitle: 'Análisis completo del día',
      period: 'Período',
      tradesCount: 'Operaciones',
      winRate: 'Tasa de Acierto',
      netPnL: 'Ganancia/Pérdida Neta',
      roi: 'ROI del Período',
      initialEquity: 'Capital Inicial',
      finalEquity: 'Capital Final',
      summary: 'Resumen del Día',
      keyDecisions: 'Decisiones Clave',
      benchmarks: 'Comparativo de Mercado',
    },
    history: {
      title: 'Historial de Operaciones',
      subtitle: 'Registro detallado de todas las acciones',
      period: 'Período',
      totalTrades: 'Total de Operaciones',
      accumulatedPnL: 'P&L Acumulado',
      totalVolume: 'Volumen Total',
      date: 'Fecha/Hora',
      action: 'Acción',
      symbol: 'Activo',
      price: 'Precio',
      quantity: 'Cantidad',
      result: 'Resultado',
      reason: 'Motivo',
      noTrades: 'Sin operaciones en el período',
      actions: {
        buy: 'Compra',
        sell: 'Venta',
        close: 'Cierre',
      },
    },
    refresh: 'Actualizar',
    loading: 'Cargando...',
  },
};

export function CampaignReports({ campaignId }: CampaignReportsProps) {
  const { language } = useLanguage();

  const getLang = (): 'pt-BR' | 'en' | 'es' => {
    if (language === 'pt-BR') return 'pt-BR';
    if (language.startsWith('en')) return 'en';
    if (language.startsWith('es')) return 'es';
    return 'pt-BR';
  };

  const t = content[getLang()];
  const locale = getLang() === 'pt-BR' ? 'pt-BR' : getLang() === 'es' ? 'es-ES' : 'en-US';

  const { data: robotStatus, isLoading: loadingStatus, refetch: refetchStatus } = useQuery<RobotStatus>({
    queryKey: ['/api/campaigns', campaignId, 'robot-status'],
    refetchInterval: 10000,
  });

  const { data: report8h, isLoading: loading8h, refetch: refetch8h } = useQuery<Report8h>({
    queryKey: ['/api/campaigns', campaignId, 'report', '8h'],
  });

  const { data: report24h, isLoading: loading24h, refetch: refetch24h } = useQuery<Report24h>({
    queryKey: ['/api/campaigns', campaignId, 'report', '24h'],
  });

  const { data: history, isLoading: loadingHistory, refetch: refetchHistory } = useQuery<HistoryReport>({
    queryKey: ['/api/campaigns', campaignId, 'history'],
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(locale);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString(locale);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting_entry':
      case 'monitoring':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'in_position':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'paused':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'stopped':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'waiting_entry':
        return <Target className="h-4 w-4" />;
      case 'monitoring':
        return <Activity className="h-4 w-4" />;
      case 'in_position':
        return <TrendingUp className="h-4 w-4" />;
      case 'paused':
        return <AlertTriangle className="h-4 w-4" />;
      case 'stopped':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Bot className="h-4 w-4" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-delfos-cyan" />
          <CardTitle className="text-lg">{t.tabs.status}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="status" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="status" className="gap-1" data-testid="tab-status">
              <Bot className="h-3 w-3" />
              <span className="hidden sm:inline">{t.tabs.status}</span>
            </TabsTrigger>
            <TabsTrigger value="report8h" className="gap-1" data-testid="tab-report-8h">
              <Timer className="h-3 w-3" />
              <span className="hidden sm:inline">{t.tabs.report8h}</span>
            </TabsTrigger>
            <TabsTrigger value="report24h" className="gap-1" data-testid="tab-report-24h">
              <Calendar className="h-3 w-3" />
              <span className="hidden sm:inline">{t.tabs.report24h}</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1" data-testid="tab-history">
              <History className="h-3 w-3" />
              <span className="hidden sm:inline">{t.tabs.history}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="mt-4">
            {loadingStatus ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : robotStatus ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge className={`gap-1 ${getStatusColor(robotStatus.status)}`}>
                      {getStatusIcon(robotStatus.status)}
                      {t.status.statusLabels[robotStatus.status] || robotStatus.statusLabel}
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchStatus()} data-testid="button-refresh-status">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    {t.refresh}
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.status.openPositions}</p>
                    <p className="text-xl font-mono font-bold">{robotStatus.openPositionsCount}/{robotStatus.maxOpenPositions}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.status.todayTrades}</p>
                    <p className="text-xl font-mono font-bold">{robotStatus.todayTradesCount}/{robotStatus.maxDailyTrades}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.status.monitoringAssets}</p>
                    <p className="text-xl font-mono font-bold">{robotStatus.tradableAssets.length}</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4 text-delfos-cyan" />
                    {t.status.nextAction}
                  </h4>
                  <p className="text-sm text-muted-foreground">{robotStatus.nextActionPlan}</p>
                </div>

                <div className="p-4 rounded-lg border">
                  <h4 className="text-sm font-medium mb-2">{t.status.entryCondition}</h4>
                  <p className="text-xs text-muted-foreground">{robotStatus.entryCondition}</p>
                </div>

                <div className="p-4 rounded-lg border">
                  <h4 className="text-sm font-medium mb-2">{t.status.circuitBreakers}</h4>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant={robotStatus.circuitBreakers.campaign ? "destructive" : "outline"}>
                      {t.status.cbCampaign}: {robotStatus.circuitBreakers.campaign ? 'ON' : 'OFF'}
                    </Badge>
                    <Badge variant={robotStatus.circuitBreakers.dailyLoss ? "destructive" : "outline"}>
                      {t.status.cbDailyLoss}: {robotStatus.circuitBreakers.dailyLoss ? 'ON' : 'OFF'}
                    </Badge>
                    <Badge variant={robotStatus.circuitBreakers.pair ? "destructive" : "outline"}>
                      {t.status.cbPair}: {robotStatus.circuitBreakers.pair ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                </div>

                {robotStatus.lastSignalCheck && (
                  <p className="text-xs text-muted-foreground">
                    {t.status.lastCheck}: {formatDateTime(robotStatus.lastSignalCheck)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">{t.loading}</p>
            )}
          </TabsContent>

          <TabsContent value="report8h" className="mt-4">
            {loading8h ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : report8h ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t.report8h.period}: {formatTime(report8h.periodStart)} - {formatTime(report8h.periodEnd)}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => refetch8h()} data-testid="button-refresh-8h">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    {t.refresh}
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.report8h.tradesCount}</p>
                    <p className="text-xl font-mono font-bold">{report8h.tradesCount}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.report8h.wins}/{t.report8h.losses}</p>
                    <p className="text-xl font-mono font-bold text-green-500">{report8h.wins} <span className="text-muted-foreground">/</span> <span className="text-red-500">{report8h.losses}</span></p>
                  </div>
                  <div className="p-3 rounded-lg border col-span-2">
                    <p className="text-xs text-muted-foreground">{t.report8h.netPnL}</p>
                    <p className={`text-xl font-mono font-bold ${report8h.netPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatCurrency(report8h.netPnL)} ({formatPercent(report8h.netPnLPct)})
                    </p>
                  </div>
                </div>

                {report8h.openPositions.length > 0 && (
                  <div className="p-4 rounded-lg border">
                    <h4 className="text-sm font-medium mb-2">{t.report8h.openPositions}</h4>
                    <div className="space-y-2">
                      {report8h.openPositions.map((pos, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="font-mono">{pos.symbol}</span>
                          <Badge variant={pos.side === 'long' ? 'default' : 'destructive'}>{pos.side.toUpperCase()}</Badge>
                          <span className={pos.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}>
                            {formatCurrency(pos.unrealizedPnL)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-medium mb-2">{t.report8h.nextAction}</h4>
                  <p className="text-sm text-muted-foreground">{report8h.nextAction}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">{t.loading}</p>
            )}
          </TabsContent>

          <TabsContent value="report24h" className="mt-4">
            {loading24h ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : report24h ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t.report24h.period}: {formatDate(report24h.periodStart)} - {formatDate(report24h.periodEnd)}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => refetch24h()} data-testid="button-refresh-24h">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    {t.refresh}
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.report24h.tradesCount}</p>
                    <p className="text-xl font-mono font-bold">{report24h.tradesCount}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.report24h.winRate}</p>
                    <p className="text-xl font-mono font-bold">{formatPercent(report24h.winRate)}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.report24h.netPnL}</p>
                    <p className={`text-xl font-mono font-bold ${report24h.netPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatCurrency(report24h.netPnL)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.report24h.roi}</p>
                    <p className={`text-xl font-mono font-bold ${report24h.roi >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatPercent(report24h.roi)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.report24h.initialEquity}</p>
                    <p className="text-lg font-mono font-bold">{formatCurrency(report24h.initialEquity)}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.report24h.finalEquity}</p>
                    <p className="text-lg font-mono font-bold">{formatCurrency(report24h.finalEquity)}</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-medium mb-2">{t.report24h.summary}</h4>
                  <p className="text-sm text-muted-foreground">{report24h.summary}</p>
                </div>

                {report24h.keyDecisions.length > 0 && (
                  <div className="p-4 rounded-lg border">
                    <h4 className="text-sm font-medium mb-2">{t.report24h.keyDecisions}</h4>
                    <div className="space-y-2">
                      {report24h.keyDecisions.map((dec, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">{formatTime(dec.time)}</span>
                          <span>{dec.action} {dec.symbol}</span>
                          <span className={dec.result >= 0 ? 'text-green-500' : 'text-red-500'}>
                            {formatCurrency(dec.result)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">{t.loading}</p>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {loadingHistory ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : history ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t.history.period}: {formatDate(history.periodStart)} - {formatDate(history.periodEnd)}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => refetchHistory()} data-testid="button-refresh-history">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    {t.refresh}
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.history.totalTrades}</p>
                    <p className="text-xl font-mono font-bold">{history.totalTrades}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.history.accumulatedPnL}</p>
                    <p className={`text-xl font-mono font-bold ${history.accumulatedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatCurrency(history.accumulatedPnL)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">{t.history.totalVolume}</p>
                    <p className="text-xl font-mono font-bold">{formatCurrency(history.totalVolume)}</p>
                  </div>
                </div>

                {history.trades.length > 0 ? (
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.history.date}</TableHead>
                          <TableHead>{t.history.action}</TableHead>
                          <TableHead>{t.history.symbol}</TableHead>
                          <TableHead className="text-right">{t.history.price}</TableHead>
                          <TableHead className="text-right">{t.history.result}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.trades.map((trade) => (
                          <TableRow key={trade.id}>
                            <TableCell className="text-xs">{formatDateTime(trade.timestamp)}</TableCell>
                            <TableCell>
                              <Badge variant={trade.action === 'buy' ? 'default' : trade.action === 'sell' ? 'destructive' : 'outline'}>
                                {t.history.actions[trade.action]}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{trade.symbol}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatCurrency(trade.price)}</TableCell>
                            <TableCell className={`text-right font-mono text-sm ${trade.pnl !== null && trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {trade.pnl !== null ? formatCurrency(trade.pnl) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <p className="text-center text-muted-foreground py-8">{t.history.noTrades}</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">{t.loading}</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
