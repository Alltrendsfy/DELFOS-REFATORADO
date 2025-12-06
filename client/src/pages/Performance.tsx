import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Target, DollarSign, BarChart3, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface PerformanceOverview {
  totalPnL: number;
  totalPnLPercentage: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  bestTrade: { pnl: number; symbol: string; date: Date } | null;
  worstTrade: { pnl: number; symbol: string; date: Date } | null;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
}

interface DrawdownMetrics {
  currentDrawdown: number;
  currentDrawdownPercentage: number;
  maxDrawdown: number;
  maxDrawdownPercentage: number;
  recoveryPercentage: number;
  peakEquity: number;
  currentEquity: number;
}

interface ChartDataPoint {
  date: string;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  cumulativeFees: number;
}

interface Trade {
  id: string;
  symbol: string;
  side: string;
  entry_price: string;
  exit_price: string;
  quantity: string;
  realized_pnl: string;
  realized_pnl_percentage: string;
  fees: string;
  opened_at: Date;
  closed_at: Date;
}

export default function Performance() {
  const { language } = useLanguage();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);

  const texts = {
    en: {
      title: "Performance Dashboard",
      description: "Track your trading performance metrics",
      overview: "Overview",
      drawdown: "Drawdown",
      trades: "Trades History",
      chart: "Equity Chart",
      totalPnL: "Total P&L",
      winRate: "Win Rate",
      totalTrades: "Total Trades",
      bestTrade: "Best Trade",
      worstTrade: "Worst Trade",
      avgWin: "Avg Win",
      avgLoss: "Avg Loss",
      profitFactor: "Profit Factor",
      currentDD: "Current Drawdown",
      maxDD: "Max Drawdown",
      recovery: "Recovery",
      peakEquity: "Peak Equity",
      currentEquity: "Current Equity",
      symbol: "Symbol",
      side: "Side",
      entryPrice: "Entry",
      exitPrice: "Exit",
      pnl: "P&L",
      percentage: "(%)",
      fees: "Fees",
      date: "Date",
      long: "Long",
      short: "Short",
      noData: "No performance data available. Start trading to see metrics.",
      selectPortfolio: "Select a portfolio to view performance",
    },
    es: {
      title: "Panel de Rendimiento",
      description: "Seguimiento de métricas de rendimiento",
      overview: "Resumen",
      drawdown: "Drawdown",
      trades: "Historial de Operaciones",
      chart: "Gráfico de Patrimonio",
      totalPnL: "P&L Total",
      winRate: "Tasa de Éxito",
      totalTrades: "Total Operaciones",
      bestTrade: "Mejor Operación",
      worstTrade: "Peor Operación",
      avgWin: "Ganancia Prom",
      avgLoss: "Pérdida Prom",
      profitFactor: "Factor Beneficio",
      currentDD: "Drawdown Actual",
      maxDD: "Drawdown Máximo",
      recovery: "Recuperación",
      peakEquity: "Patrimonio Pico",
      currentEquity: "Patrimonio Actual",
      symbol: "Símbolo",
      side: "Lado",
      entryPrice: "Entrada",
      exitPrice: "Salida",
      pnl: "P&L",
      percentage: "(%)",
      fees: "Comisiones",
      date: "Fecha",
      long: "Largo",
      short: "Corto",
      noData: "Sin datos de rendimiento. Comienza a operar para ver métricas.",
      selectPortfolio: "Selecciona un portafolio para ver rendimiento",
    },
    "pt-BR": {
      title: "Painel de Performance",
      description: "Acompanhe suas métricas de negociação",
      overview: "Visão Geral",
      drawdown: "Drawdown",
      trades: "Histórico de Trades",
      chart: "Gráfico de Patrimônio",
      totalPnL: "P&L Total",
      winRate: "Taxa de Acerto",
      totalTrades: "Total de Trades",
      bestTrade: "Melhor Trade",
      worstTrade: "Pior Trade",
      avgWin: "Ganho Médio",
      avgLoss: "Perda Média",
      profitFactor: "Fator de Lucro",
      currentDD: "Drawdown Atual",
      maxDD: "Drawdown Máximo",
      recovery: "Recuperação",
      peakEquity: "Patrimônio Pico",
      currentEquity: "Patrimônio Atual",
      symbol: "Símbolo",
      side: "Lado",
      entryPrice: "Entrada",
      exitPrice: "Saída",
      pnl: "P&L",
      percentage: "(%)",
      fees: "Taxas",
      date: "Data",
      long: "Long",
      short: "Short",
      noData: "Sem dados de performance. Comece a negociar para ver métricas.",
      selectPortfolio: "Selecione um portfólio para ver a performance",
    },
  };

  const t = texts[language];

  // Fetch user's portfolios
  const { data: portfolios } = useQuery<any[]>({
    queryKey: ['/api/portfolios'],
    enabled: true,
  });

  // Auto-select first portfolio
  if (!portfolioId && portfolios && portfolios.length > 0) {
    setPortfolioId(portfolios[0].id);
  }

  // Fetch performance data
  const { data: overview, isLoading: loadingOverview } = useQuery<PerformanceOverview>({
    queryKey: ['/api/portfolios', portfolioId, 'performance', 'overview'],
    enabled: !!portfolioId,
  });

  const { data: drawdown, isLoading: loadingDrawdown } = useQuery<DrawdownMetrics>({
    queryKey: ['/api/portfolios', portfolioId, 'performance', 'drawdown'],
    enabled: !!portfolioId,
  });

  const { data: chartData, isLoading: loadingChart } = useQuery<ChartDataPoint[]>({
    queryKey: ['/api/portfolios', portfolioId, 'performance', 'chart'],
    enabled: !!portfolioId,
  });

  const { data: trades, isLoading: loadingTrades } = useQuery<Trade[]>({
    queryKey: ['/api/portfolios', portfolioId, 'performance', 'trades'],
    enabled: !!portfolioId,
  });

  if (!portfolioId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>{t.selectPortfolio}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div className="h-full overflow-auto p-4 sm:p-6" data-testid="page-performance">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-performance-title">{t.title}</h1>
          <p className="text-muted-foreground" data-testid="text-performance-description">{t.description}</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">{t.overview}</TabsTrigger>
            <TabsTrigger value="chart" data-testid="tab-chart">{t.chart}</TabsTrigger>
            <TabsTrigger value="trades" data-testid="tab-trades">{t.trades}</TabsTrigger>
            <TabsTrigger value="drawdown" data-testid="tab-drawdown">{t.drawdown}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {loadingOverview ? (
              <div className="text-center py-8">Loading...</div>
            ) : overview && overview.totalTrades > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card data-testid="card-total-pnl">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t.totalPnL}</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${overview.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="value-total-pnl">
                      {formatCurrency(overview.totalPnL)}
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid="value-total-pnl-percentage">
                      {formatPercentage(overview.totalPnLPercentage)}
                    </p>
                  </CardContent>
                </Card>

                <Card data-testid="card-win-rate">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t.winRate}</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="value-win-rate">{overview.winRate.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground" data-testid="value-win-loss-trades">
                      {overview.winningTrades}W / {overview.losingTrades}L
                    </p>
                  </CardContent>
                </Card>

                <Card data-testid="card-total-trades">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t.totalTrades}</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="value-total-trades">{overview.totalTrades}</div>
                    <p className="text-xs text-muted-foreground" data-testid="value-profit-factor">
                      {t.profitFactor}: {overview.profitFactor.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>

                <Card data-testid="card-best-trade">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t.bestTrade}</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    {overview.bestTrade && (
                      <>
                        <div className="text-2xl font-bold text-green-600" data-testid="value-best-trade-pnl">
                          {formatCurrency(overview.bestTrade.pnl)}
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid="value-best-trade-symbol">
                          {overview.bestTrade.symbol}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-data">
                  {t.noData}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="chart">
            <Card>
              <CardHeader>
                <CardTitle>{t.chart}</CardTitle>
                <CardDescription>Cumulative equity over time</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingChart ? (
                  <div className="text-center py-8">Loading...</div>
                ) : chartData && chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                      />
                      <YAxis tickFormatter={(value) => `$${value.toFixed(0)}`} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => format(new Date(label), 'PPP')}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="equity" stroke="#0066CC" name="Equity" strokeWidth={2} />
                      <Line type="monotone" dataKey="realizedPnL" stroke="#10b981" name="Realized P&L" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-chart-data">
                    {t.noData}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trades">
            <Card>
              <CardHeader>
                <CardTitle>{t.trades}</CardTitle>
                <CardDescription>Complete trading history</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTrades ? (
                  <div className="text-center py-8">Loading...</div>
                ) : trades && trades.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full" data-testid="table-trades">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4">{t.symbol}</th>
                          <th className="text-left py-3 px-4">{t.side}</th>
                          <th className="text-right py-3 px-4">{t.entryPrice}</th>
                          <th className="text-right py-3 px-4">{t.exitPrice}</th>
                          <th className="text-right py-3 px-4">{t.pnl}</th>
                          <th className="text-right py-3 px-4">{t.percentage}</th>
                          <th className="text-right py-3 px-4">{t.date}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((trade) => (
                          <tr key={trade.id} className="border-b" data-testid={`trade-row-${trade.id}`}>
                            <td className="py-3 px-4 font-medium" data-testid={`trade-symbol-${trade.id}`}>{trade.symbol}</td>
                            <td className="py-3 px-4">
                              <Badge variant={trade.side === 'long' ? 'default' : 'secondary'} data-testid={`trade-side-${trade.id}`}>
                                {trade.side === 'long' ? t.long : t.short}
                              </Badge>
                            </td>
                            <td className="text-right py-3 px-4" data-testid={`trade-entry-${trade.id}`}>{Number(trade.entry_price).toFixed(2)}</td>
                            <td className="text-right py-3 px-4" data-testid={`trade-exit-${trade.id}`}>{Number(trade.exit_price).toFixed(2)}</td>
                            <td className={`text-right py-3 px-4 font-medium ${Number(trade.realized_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid={`trade-pnl-${trade.id}`}>
                              {formatCurrency(Number(trade.realized_pnl))}
                            </td>
                            <td className={`text-right py-3 px-4 ${Number(trade.realized_pnl_percentage) >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid={`trade-percentage-${trade.id}`}>
                              {formatPercentage(Number(trade.realized_pnl_percentage))}
                            </td>
                            <td className="text-right py-3 px-4 text-sm text-muted-foreground" data-testid={`trade-date-${trade.id}`}>
                              {format(new Date(trade.closed_at), 'PP')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-trades">
                    {t.noData}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="drawdown">
            <Card>
              <CardHeader>
                <CardTitle>{t.drawdown}</CardTitle>
                <CardDescription>Risk and drawdown analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingDrawdown ? (
                  <div className="text-center py-8">Loading...</div>
                ) : drawdown ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card data-testid="card-current-drawdown">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t.currentDD}</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-orange-600" data-testid="value-current-drawdown">
                          {formatCurrency(drawdown.currentDrawdown)}
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid="value-current-drawdown-percentage">
                          {drawdown.currentDrawdownPercentage.toFixed(2)}%
                        </p>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-max-drawdown">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t.maxDD}</CardTitle>
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-600" data-testid="value-max-drawdown">
                          {formatCurrency(drawdown.maxDrawdown)}
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid="value-max-drawdown-percentage">
                          {drawdown.maxDrawdownPercentage.toFixed(2)}%
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-drawdown-data">
                    {t.noData}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
