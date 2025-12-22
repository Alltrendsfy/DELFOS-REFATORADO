import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity,
  Target,
  Bot,
  Plus,
  List,
  Settings,
  Play,
  Pause,
  CheckCircle,
  Clock,
  ArrowRight,
  Zap,
  AlertTriangle,
  Wallet,
  Shield,
  Radio,
  XCircle,
  Eye,
  Lightbulb,
  Heart,
  AlertCircle
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import type { MarketDataCache, Campaign, RobotActivityLog } from "@shared/schema";

interface DashboardStats {
  portfolio_value: string;
  daily_pnl: string;
  daily_pnl_percentage: string;
  unrealized_pnl: string;
  realized_pnl: string;
  active_campaigns: number;
  open_positions: number;
}

interface EnhancedStats {
  opportunities: {
    active_count: number;
    recent: Array<{
      id: string;
      type: string;
      score: number;
      assets: string[];
      expires_at: string;
    }>;
  };
  system_health: {
    status: 'healthy' | 'warning' | 'critical';
    staleness_level: string;
    active_symbols: number;
    quarantined_symbols: number;
    alerts: string[];
  };
  kraken_balance: {
    zusd?: string;
    usdt?: string;
    total_available?: string;
    has_credentials: boolean;
  } | null;
  recent_signals: Array<{
    id: string;
    type: string;
    symbol: string | null;
    severity: string;
    timestamp: string;
  }>;
}

export default function Dashboard() {
  const { t, language } = useLanguage();

  const { data: marketData, isLoading: loadingMarket } = useQuery<MarketDataCache[]>({
    queryKey: ['/api/market-data'],
    refetchInterval: 30000,
  });

  const { data: stats, isLoading: loadingStats } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 30000,
  });

  const { data: enhancedStats, isLoading: loadingEnhanced } = useQuery<EnhancedStats>({
    queryKey: ['/api/dashboard/enhanced-stats'],
    refetchInterval: 15000,
  });

  const { data: campaigns, isLoading: loadingCampaigns } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns/all'],
    refetchInterval: 30000,
  });

  const { data: recentActivity, isLoading: loadingActivity } = useQuery<RobotActivityLog[]>({
    queryKey: ['/api/robot-activities/recent'],
    refetchInterval: 10000,
  });

  const isLoading = loadingMarket || loadingStats;

  const locale = language === 'pt-BR' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US';

  const safeParseFloat = (value: string | undefined | null): number => {
    if (!value) return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formatPercentage = (value: number) => {
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'exceptZero',
    });
    return formatter.format(value) + '%';
  };

  const getCampaignStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-green-600"><Play className="w-3 h-3 mr-1" />{t('dashboard.campaigns.running')}</Badge>;
      case 'paused':
        return <Badge variant="secondary"><Pause className="w-3 h-3 mr-1" />{t('dashboard.campaigns.paused')}</Badge>;
      case 'completed':
        return <Badge variant="outline"><CheckCircle className="w-3 h-3 mr-1" />{t('dashboard.campaigns.completed')}</Badge>;
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{t('dashboard.campaigns.pending')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'signal_generated':
        return <Zap className="w-4 h-4 text-yellow-500" />;
      case 'order_placed':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'position_open':
      case 'position_opened':
        return <Target className="w-4 h-4 text-blue-500" />;
      case 'position_close':
      case 'position_closed':
        return <CheckCircle className="w-4 h-4 text-purple-500" />;
      case 'circuit_breaker':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'kraken.order.failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Bot className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getActivitySeverityClass = (severity: string) => {
    switch (severity) {
      case 'success':
        return 'border-l-2 border-l-green-500';
      case 'warning':
        return 'border-l-2 border-l-yellow-500';
      case 'error':
        return 'border-l-2 border-l-red-500';
      default:
        return 'border-l-2 border-l-transparent';
    }
  };

  const getSystemHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Heart className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const activeCampaigns = campaigns?.filter(c => c.status === 'running' || c.status === 'paused') || [];
  const recentCampaigns = campaigns?.slice(0, 5) || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-24" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">
          {t('dashboard.title')}
        </h1>
        {enhancedStats?.system_health && (
          <div className="flex items-center gap-2">
            {getSystemHealthIcon(enhancedStats.system_health.status)}
            <span className={`text-sm font-medium ${
              enhancedStats.system_health.status === 'healthy' ? 'text-green-500' :
              enhancedStats.system_health.status === 'warning' ? 'text-yellow-500' : 'text-red-500'
            }`}>
              {t(`dashboard.system.${enhancedStats.system_health.status}`)}
            </span>
          </div>
        )}
      </div>

      {/* System Alerts */}
      {enhancedStats?.system_health?.alerts && enhancedStats.system_health.alerts.length > 0 && (
        <Card className={`border-l-4 ${
          enhancedStats.system_health.status === 'critical' ? 'border-l-red-500 bg-red-500/10' :
          'border-l-yellow-500 bg-yellow-500/10'
        }`}>
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${
                enhancedStats.system_health.status === 'critical' ? 'text-red-500' : 'text-yellow-500'
              }`} />
              <div className="flex-1">
                {enhancedStats.system_health.alerts.map((alert, i) => (
                  <p key={i} className="text-sm">{alert}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Primary Metrics Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t('dashboard.portfolio_value')}
            </p>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-mono font-bold" data-testid="text-portfolio-value">
              {currencyFormatter.format(stats ? safeParseFloat(stats.portfolio_value) : 0)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {activeCampaigns.length > 0 ? t('dashboard.active_portfolios') : t('dashboard.no_active_portfolio')}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t('dashboard.daily_pnl')}
            </p>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className={`text-2xl font-mono font-bold ${stats && safeParseFloat(stats.daily_pnl) > 0 ? 'text-success' : stats && safeParseFloat(stats.daily_pnl) < 0 ? 'text-destructive' : 'text-muted-foreground'}`} data-testid="text-daily-pnl">
              {currencyFormatter.format(stats ? safeParseFloat(stats.daily_pnl) : 0)}
            </p>
          </div>
          <p className={`text-xs mt-2 font-medium ${stats && safeParseFloat(stats.daily_pnl_percentage) > 0 ? 'text-success' : stats && safeParseFloat(stats.daily_pnl_percentage) < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {formatPercentage(stats ? safeParseFloat(stats.daily_pnl_percentage) : 0)}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t('dashboard.active_campaigns')}
            </p>
            <Bot className="w-4 h-4 text-delfos-cyan" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-mono font-bold text-delfos-cyan" data-testid="text-active-campaigns">
              {stats?.active_campaigns || 0}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t('dashboard.robots_trading')}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t('dashboard.open_positions')}
            </p>
            <Target className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-mono font-bold" data-testid="text-open-positions">
              {stats?.open_positions || 0}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t('dashboard.across_campaigns')}
          </p>
        </Card>
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Kraken Balance */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t('dashboard.kraken_balance')}
            </p>
            <Wallet className="w-4 h-4 text-muted-foreground" />
          </div>
          {loadingEnhanced ? (
            <Skeleton className="h-8 w-24" />
          ) : enhancedStats?.kraken_balance?.has_credentials ? (
            <>
              <p className="text-2xl font-mono font-bold" data-testid="text-kraken-balance">
                ${enhancedStats.kraken_balance.total_available || '0.00'}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                ZUSD {t('dashboard.available')}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-muted-foreground">--</p>
              <Link href="/settings">
                <p className="text-xs text-delfos-cyan mt-2 hover:underline cursor-pointer">
                  {t('dashboard.configure_kraken')}
                </p>
              </Link>
            </>
          )}
        </Card>

        {/* Active Opportunities */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t('dashboard.opportunities')}
            </p>
            <Lightbulb className="w-4 h-4 text-yellow-500" />
          </div>
          {loadingEnhanced ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <>
              <p className="text-2xl font-mono font-bold text-yellow-500" data-testid="text-opportunities">
                {enhancedStats?.opportunities?.active_count || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {t('dashboard.pending_analysis')}
              </p>
            </>
          )}
        </Card>

        {/* Active Symbols */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t('dashboard.active_symbols')}
            </p>
            <Radio className="w-4 h-4 text-green-500" />
          </div>
          {loadingEnhanced ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <>
              <p className="text-2xl font-mono font-bold text-green-500" data-testid="text-active-symbols">
                {enhancedStats?.system_health?.active_symbols || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {t('dashboard.websocket_connected')}
              </p>
            </>
          )}
        </Card>

        {/* Quarantined Symbols */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t('dashboard.quarantine')}
            </p>
            <Shield className="w-4 h-4 text-orange-500" />
          </div>
          {loadingEnhanced ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <>
              <p className={`text-2xl font-mono font-bold ${
                (enhancedStats?.system_health?.quarantined_symbols || 0) > 10 
                  ? 'text-orange-500' 
                  : 'text-muted-foreground'
              }`} data-testid="text-quarantined">
                {enhancedStats?.system_health?.quarantined_symbols || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {t('dashboard.temporarily_paused')}
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('dashboard.quick_actions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="gap-2" data-testid="button-new-campaign">
              <Link href="/campaigns/new">
                <Plus className="w-4 h-4" />
                {t('dashboard.new_campaign')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2" data-testid="button-view-campaigns">
              <Link href="/campaigns">
                <List className="w-4 h-4" />
                {t('dashboard.view_campaigns')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2" data-testid="button-opportunities">
              <Link href="/opportunities">
                <Lightbulb className="w-4 h-4" />
                {t('dashboard.view_opportunities')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2" data-testid="button-radar">
              <Link href="/opportunity-radar">
                <Eye className="w-4 h-4" />
                {t('dashboard.opportunity_radar')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2" data-testid="button-settings">
              <Link href="/settings">
                <Settings className="w-4 h-4" />
                {t('dashboard.settings')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Campaigns */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="w-5 h-5 text-delfos-cyan" />
                {t('dashboard.recent_campaigns')}
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="gap-1">
                <Link href="/campaigns">
                  {t('dashboard.view_all')}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingCampaigns ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : recentCampaigns.length > 0 ? (
              <div className="space-y-3">
                {recentCampaigns.map((campaign) => {
                  const pnl = safeParseFloat(campaign.current_equity) - safeParseFloat(campaign.initial_capital);
                  const isProfit = pnl >= 0;
                  return (
                    <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid={`card-campaign-${campaign.id}`}>
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{campaign.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {t(`dashboard.profile.${campaign.investor_profile}`)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-mono text-sm ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                            {isProfit ? '+' : ''}{currencyFormatter.format(pnl)}
                          </span>
                          {getCampaignStatusBadge(campaign.status)}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Bot className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">{t('dashboard.no_campaigns')}</p>
                <Link href="/campaigns/new">
                  <Button variant="outline" size="sm" className="mt-3 gap-2">
                    <Plus className="w-4 h-4" />
                    {t('dashboard.create_first')}
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Robot Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-delfos-cyan" />
              {t('dashboard.robot_activity')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : recentActivity && recentActivity.length > 0 ? (
              <ScrollArea className="h-[280px]">
                <div className="space-y-2 pr-4">
                  {recentActivity.slice(0, 10).map((activity) => (
                    <div 
                      key={activity.id} 
                      className={`flex items-start gap-3 p-2 rounded-lg border border-transparent hover:border-border ${getActivitySeverityClass(activity.severity)}`}
                    >
                      {getActivityIcon(activity.event_type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm truncate">{t(activity.message_key as any) || activity.message_key}</p>
                          {activity.symbol && (
                            <Badge variant="outline" className="font-mono text-xs">
                              {activity.symbol}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.created_at).toLocaleTimeString(locale)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8">
                <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">{t('dashboard.no_activity')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Opportunities Section */}
      {enhancedStats?.opportunities?.recent && enhancedStats.opportunities.recent.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-500" />
                {t('dashboard.recent_opportunities')}
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="gap-1">
                <Link href="/opportunities">
                  {t('dashboard.view_all')}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {enhancedStats.opportunities.recent.map((opp) => (
                <Link key={opp.id} href={`/opportunities`}>
                  <div className="p-4 rounded-lg border hover-elevate cursor-pointer">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="text-xs">
                        {opp.type}
                      </Badge>
                      <span className="text-sm font-mono font-bold text-yellow-500">
                        {opp.score}%
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {opp.assets?.slice(0, 3).map((asset) => (
                        <Badge key={asset} variant="secondary" className="text-xs font-mono">
                          {asset}
                        </Badge>
                      ))}
                      {opp.assets && opp.assets.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{opp.assets.length - 3}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('dashboard.expires')}: {new Date(opp.expires_at).toLocaleDateString(locale)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Market Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('dashboard.market_overview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
            {marketData?.slice(0, 6).map((asset) => {
              const price = safeParseFloat(asset.current_price);
              const change = safeParseFloat(asset.change_24h_percentage);
              const isPositive = change >= 0;
              return (
                <div key={asset.symbol} className="p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">{asset.symbol}</span>
                    {isPositive ? (
                      <TrendingUp className="w-3 h-3 text-green-500" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-red-500" />
                    )}
                  </div>
                  <p className="font-mono text-sm font-semibold">
                    {currencyFormatter.format(price)}
                  </p>
                  <p className={`text-xs font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {formatPercentage(change)}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
