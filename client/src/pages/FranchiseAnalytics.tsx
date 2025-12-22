import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft,
  Building2, 
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Activity,
  BarChart3,
  Clock,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Info,
  Layers
} from 'lucide-react';
import { Link } from 'wouter';

interface FranchisePerformanceOverview {
  total_franchises: number;
  active_franchises: number;
  total_campaigns: number;
  active_campaigns: number;
  total_pnl: number;
  total_trades: number;
  win_rate: number;
  avg_roi: number;
  total_capital_under_management: number;
}

interface FranchiseRanking {
  franchise_id: string;
  franchise_name: string;
  plan_name: string;
  status: string;
  total_pnl: number;
  win_rate: number;
  total_trades: number;
  active_campaigns: number;
  capital_under_management: number;
  roi_percentage: number;
  rank: number;
}

interface SymbolPerformance {
  symbol: string;
  total_pnl: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pnl_per_trade: number;
  total_volume: number;
  franchises_trading: number;
}

interface ClusterPerformance {
  cluster_number: number;
  cluster_label: string;
  symbols_count: number;
  total_pnl: number;
  total_trades: number;
  win_rate: number;
  avg_roi: number;
  franchises_using: number;
}

interface TradingPattern {
  hour?: number;
  day_of_week?: number;
  total_trades: number;
  total_pnl: number;
  win_rate: number;
  avg_pnl: number;
}

interface StrategicInsight {
  type: 'opportunity' | 'warning' | 'alert' | 'info';
  category: 'performance' | 'risk' | 'efficiency' | 'growth';
  title_key: string;
  description_key: string;
  data: Record<string, any>;
  priority: number;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function FranchiseAnalytics() {
  const { t } = useLanguage();

  const { data: overview, isLoading: overviewLoading } = useQuery<FranchisePerformanceOverview>({
    queryKey: ['/api/admin/franchise-analytics/overview'],
  });

  const { data: rankings, isLoading: rankingsLoading } = useQuery<FranchiseRanking[]>({
    queryKey: ['/api/admin/franchise-analytics/rankings'],
  });

  const { data: symbols, isLoading: symbolsLoading } = useQuery<SymbolPerformance[]>({
    queryKey: ['/api/admin/franchise-analytics/symbols'],
  });

  const { data: clusters, isLoading: clustersLoading } = useQuery<ClusterPerformance[]>({
    queryKey: ['/api/admin/franchise-analytics/clusters'],
  });

  const { data: patterns, isLoading: patternsLoading } = useQuery<{ hourly: TradingPattern[]; daily: TradingPattern[] }>({
    queryKey: ['/api/admin/franchise-analytics/patterns'],
  });

  const { data: insights, isLoading: insightsLoading } = useQuery<StrategicInsight[]>({
    queryKey: ['/api/admin/franchise-analytics/insights'],
  });

  const isLoading = overviewLoading || rankingsLoading || symbolsLoading || clustersLoading || patternsLoading || insightsLoading;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'opportunity': return <Lightbulb className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'alert': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'info': return <Info className="h-4 w-4 text-blue-500" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getInsightBadgeVariant = (type: string) => {
    switch (type) {
      case 'opportunity': return 'outline';
      case 'warning': return 'outline';
      case 'alert': return 'destructive';
      case 'info': return 'secondary';
      default: return 'secondary';
    }
  };

  const getPnLColor = (pnl: number) => {
    if (pnl > 0) return 'text-green-600';
    if (pnl < 0) return 'text-red-600';
    return 'text-muted-foreground';
  };

  const getHeatmapColor = (value: number, max: number) => {
    if (max === 0) return 'bg-muted';
    const intensity = Math.min(value / max, 1);
    if (intensity < 0.2) return 'bg-blue-100 dark:bg-blue-900/30';
    if (intensity < 0.4) return 'bg-blue-200 dark:bg-blue-800/40';
    if (intensity < 0.6) return 'bg-blue-300 dark:bg-blue-700/50';
    if (intensity < 0.8) return 'bg-blue-400 dark:bg-blue-600/60';
    return 'bg-blue-500 dark:bg-blue-500/70';
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const maxHourlyTrades = Math.max(...(patterns?.hourly?.map(h => h.total_trades) || [0]));
  const maxDailyTrades = Math.max(...(patterns?.daily?.map(d => d.total_trades) || [0]));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/franchise-admin">
            <Button variant="ghost" size="icon" data-testid="button-back-franchise-admin">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-analytics-title">{t('analytics.title')}</h1>
            <p className="text-muted-foreground">{t('analytics.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.overview.franchises')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-franchises">{overview?.total_franchises || 0}</div>
            <p className="text-xs text-muted-foreground">
              {overview?.active_franchises || 0} {t('analytics.overview.active')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.overview.totalPnL')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getPnLColor(overview?.total_pnl || 0)}`} data-testid="text-total-pnl">
              {formatCurrency(overview?.total_pnl || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.total_trades || 0} {t('analytics.overview.trades')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.overview.winRate')}</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-win-rate">
              {formatPercent(overview?.win_rate || 0)}
            </div>
            <p className="text-xs text-muted-foreground">{t('analytics.overview.avgWinRate')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.overview.avgRoi')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getPnLColor(overview?.avg_roi || 0)}`} data-testid="text-avg-roi">
              {formatPercent(overview?.avg_roi || 0)}
            </div>
            <p className="text-xs text-muted-foreground">{t('analytics.overview.returnOnInvestment')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.overview.capital')}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-capital">
              {formatCurrency(overview?.total_capital_under_management || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.active_campaigns || 0} {t('analytics.overview.campaigns')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('analytics.rankings.title')}</CardTitle>
            <CardDescription>{t('analytics.rankings.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {rankings && rankings.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>{t('analytics.rankings.franchise')}</TableHead>
                    <TableHead>{t('analytics.rankings.plan')}</TableHead>
                    <TableHead className="text-right">{t('analytics.rankings.pnl')}</TableHead>
                    <TableHead className="text-right">{t('analytics.rankings.winRate')}</TableHead>
                    <TableHead className="text-right">{t('analytics.rankings.roi')}</TableHead>
                    <TableHead className="text-right">{t('analytics.rankings.trades')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankings.slice(0, 10).map((franchise) => (
                    <TableRow key={franchise.franchise_id} data-testid={`row-ranking-${franchise.franchise_id}`}>
                      <TableCell className="font-medium">{franchise.rank}</TableCell>
                      <TableCell>
                        <div className="font-medium">{franchise.franchise_name}</div>
                        <Badge 
                          variant="outline" 
                          className={franchise.status === 'active' ? 'bg-green-500/10 text-green-600' : 'bg-muted'}
                        >
                          {franchise.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{franchise.plan_name}</Badge>
                      </TableCell>
                      <TableCell className={`text-right font-medium ${getPnLColor(franchise.total_pnl)}`}>
                        {formatCurrency(franchise.total_pnl)}
                      </TableCell>
                      <TableCell className="text-right">{formatPercent(franchise.win_rate)}</TableCell>
                      <TableCell className={`text-right ${getPnLColor(franchise.roi_percentage)}`}>
                        {formatPercent(franchise.roi_percentage)}
                      </TableCell>
                      <TableCell className="text-right">{franchise.total_trades}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('analytics.rankings.noData')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              {t('analytics.insights.title')}
            </CardTitle>
            <CardDescription>{t('analytics.insights.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights && insights.length > 0 ? (
              insights.slice(0, 6).map((insight, idx) => (
                <div 
                  key={idx} 
                  className="p-3 rounded-lg border bg-card"
                  data-testid={`insight-${idx}`}
                >
                  <div className="flex items-start gap-3">
                    {getInsightIcon(insight.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{t(insight.title_key)}</span>
                        <Badge variant={getInsightBadgeVariant(insight.type)} className="text-xs">
                          {t(`analytics.insights.category.${insight.category}`)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t(insight.description_key)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('analytics.insights.noInsights')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="symbols" className="space-y-4">
        <TabsList>
          <TabsTrigger value="symbols" data-testid="tab-symbols">{t('analytics.tabs.symbols')}</TabsTrigger>
          <TabsTrigger value="clusters" data-testid="tab-clusters">{t('analytics.tabs.clusters')}</TabsTrigger>
          <TabsTrigger value="patterns" data-testid="tab-patterns">{t('analytics.tabs.patterns')}</TabsTrigger>
        </TabsList>

        <TabsContent value="symbols">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  {t('analytics.symbols.bestPerformers')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {symbols && symbols.filter(s => s.total_pnl > 0).length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('analytics.symbols.symbol')}</TableHead>
                        <TableHead className="text-right">{t('analytics.symbols.pnl')}</TableHead>
                        <TableHead className="text-right">{t('analytics.symbols.winRate')}</TableHead>
                        <TableHead className="text-right">{t('analytics.symbols.trades')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {symbols.filter(s => s.total_pnl > 0).slice(0, 8).map((symbol) => (
                        <TableRow key={symbol.symbol}>
                          <TableCell className="font-medium">{symbol.symbol}</TableCell>
                          <TableCell className="text-right text-green-600 font-medium">
                            {formatCurrency(symbol.total_pnl)}
                          </TableCell>
                          <TableCell className="text-right">{formatPercent(symbol.win_rate)}</TableCell>
                          <TableCell className="text-right">{symbol.total_trades}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>{t('analytics.symbols.noData')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                  {t('analytics.symbols.worstPerformers')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {symbols && symbols.filter(s => s.total_pnl < 0).length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('analytics.symbols.symbol')}</TableHead>
                        <TableHead className="text-right">{t('analytics.symbols.pnl')}</TableHead>
                        <TableHead className="text-right">{t('analytics.symbols.winRate')}</TableHead>
                        <TableHead className="text-right">{t('analytics.symbols.trades')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {symbols.filter(s => s.total_pnl < 0)
                        .sort((a, b) => a.total_pnl - b.total_pnl)
                        .slice(0, 8)
                        .map((symbol) => (
                        <TableRow key={symbol.symbol}>
                          <TableCell className="font-medium">{symbol.symbol}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {formatCurrency(symbol.total_pnl)}
                          </TableCell>
                          <TableCell className="text-right">{formatPercent(symbol.win_rate)}</TableCell>
                          <TableCell className="text-right">{symbol.total_trades}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>{t('analytics.symbols.noData')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clusters">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                {t('analytics.clusters.title')}
              </CardTitle>
              <CardDescription>{t('analytics.clusters.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {clusters && clusters.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {clusters.map((cluster) => (
                    <div 
                      key={cluster.cluster_number} 
                      className="p-4 rounded-lg border bg-card"
                      data-testid={`cluster-${cluster.cluster_number}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant="outline">{cluster.cluster_label}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {cluster.symbols_count} {t('analytics.clusters.symbols')}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{t('analytics.clusters.pnl')}</span>
                          <span className={`font-medium ${getPnLColor(cluster.total_pnl)}`}>
                            {formatCurrency(cluster.total_pnl)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{t('analytics.clusters.winRate')}</span>
                          <span className="font-medium">{formatPercent(cluster.win_rate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{t('analytics.clusters.trades')}</span>
                          <span className="font-medium">{cluster.total_trades}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{t('analytics.clusters.franchises')}</span>
                          <span className="font-medium">{cluster.franchises_using}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('analytics.clusters.noData')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patterns">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {t('analytics.patterns.hourly')}
                </CardTitle>
                <CardDescription>{t('analytics.patterns.hourlyDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-12 gap-1">
                  {patterns?.hourly?.map((hour) => (
                    <div
                      key={hour.hour}
                      className={`aspect-square rounded flex flex-col items-center justify-center text-xs ${getHeatmapColor(hour.total_trades, maxHourlyTrades)}`}
                      title={`${hour.hour}:00 - ${hour.total_trades} trades, ${formatPercent(hour.win_rate)} win rate`}
                    >
                      <span className="font-medium">{hour.hour}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t('analytics.patterns.lessActivity')}</span>
                  <div className="flex gap-1">
                    <div className="w-4 h-4 rounded bg-blue-100 dark:bg-blue-900/30" />
                    <div className="w-4 h-4 rounded bg-blue-200 dark:bg-blue-800/40" />
                    <div className="w-4 h-4 rounded bg-blue-300 dark:bg-blue-700/50" />
                    <div className="w-4 h-4 rounded bg-blue-400 dark:bg-blue-600/60" />
                    <div className="w-4 h-4 rounded bg-blue-500 dark:bg-blue-500/70" />
                  </div>
                  <span>{t('analytics.patterns.moreActivity')}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  {t('analytics.patterns.daily')}
                </CardTitle>
                <CardDescription>{t('analytics.patterns.dailyDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {patterns?.daily?.map((day) => (
                    <div key={day.day_of_week} className="flex items-center gap-3">
                      <span className="w-10 text-sm font-medium">{DAY_NAMES[day.day_of_week || 0]}</span>
                      <div className="flex-1 h-8 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full ${day.total_pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ 
                            width: maxDailyTrades > 0 
                              ? `${(day.total_trades / maxDailyTrades) * 100}%` 
                              : '0%' 
                          }}
                        />
                      </div>
                      <div className="w-24 text-right">
                        <div className="text-sm font-medium">{day.total_trades}</div>
                        <div className={`text-xs ${getPnLColor(day.total_pnl)}`}>
                          {formatCurrency(day.total_pnl)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
