import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  ArrowRight
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
      case 'order_placed':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'position_opened':
        return <Target className="w-4 h-4 text-blue-500" />;
      case 'position_closed':
        return <CheckCircle className="w-4 h-4 text-purple-500" />;
      case 'circuit_breaker':
        return <Activity className="w-4 h-4 text-red-500" />;
      default:
        return <Bot className="w-4 h-4 text-muted-foreground" />;
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
      </div>

      {/* Metrics Row */}
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
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {recentActivity.slice(0, 8).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg border border-transparent hover:border-border">
                    {getActivityIcon(activity.event_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{t(activity.message_key as any) || activity.message_key}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.created_at).toLocaleTimeString(locale)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">{t('dashboard.no_activity')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
