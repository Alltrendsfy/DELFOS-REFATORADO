import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  PauseCircle,
  Play,
  Pause,
  Square,
  RefreshCw,
  DollarSign,
  Target,
  Wallet,
  Zap,
  AlertCircle,
  Bot,
  Timer,
  Activity,
  ShieldAlert,
  Eye
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Campaign {
  id: string;
  portfolio_id: string;
  name: string;
  start_date: string;
  end_date: string;
  initial_capital: string;
  current_equity: string;
  max_drawdown_percentage: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface CampaignMetrics {
  campaignId: string;
  dayNumber: number;
  totalDays: number;
  daysRemaining: number;
  initialCapital: number;
  currentEquity: number;
  totalPnL: number;
  totalPnLPercentage: number;
  currentDrawdown: number;
  maxDrawdownLimit: number;
  isDrawdownBreached: boolean;
  status: string;
  progress: number;
}

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

interface CampaignPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: string;
  entry_price: string;
  current_price?: string;
  stop_loss: string;
  take_profit: string;
  unrealized_pnl?: number;
  opened_at: string;
}

interface Portfolio {
  id: string;
  name: string;
  trading_mode: string;
  total_value_usd: string;
}

interface EnhancedCampaignCardProps {
  campaign: Campaign;
  portfolios: Portfolio[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onStop: (id: string) => void;
  onRebalance: (id: string) => void;
  pendingAction: string | null;
}

export function EnhancedCampaignCard({ 
  campaign, 
  portfolios, 
  onPause, 
  onResume, 
  onStop, 
  onRebalance,
  pendingAction
}: EnhancedCampaignCardProps) {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [nextRebalanceIn, setNextRebalanceIn] = useState<string>('--:--:--');
  const [nextCycleIn, setNextCycleIn] = useState<string>('--');

  const { data: metrics, isLoading: metricsLoading, isError: metricsError, refetch: refetchMetrics } = useQuery<CampaignMetrics>({
    queryKey: ['/api/campaigns', campaign.id, 'metrics'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaign.id}/metrics`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    },
    refetchInterval: 10000,
    retry: 2,
    staleTime: 5000,
  });

  const { data: robotStatus } = useQuery<RobotStatus>({
    queryKey: ['/api/campaigns', campaign.id, 'robot-status'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaign.id}/robot-status`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch robot status');
      return res.json();
    },
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: openPositions } = useQuery<CampaignPosition[]>({
    queryKey: ['/api/campaigns', campaign.id, 'positions', 'open'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaign.id}/positions?status=open`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch positions');
      return res.json();
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });

  useEffect(() => {
    const calculateTimers = () => {
      const now = new Date();
      const hours = now.getUTCHours();
      const nextRebalanceHour = hours < 8 ? 8 : hours < 16 ? 16 : 24;
      const nextRebalance = new Date(now);
      nextRebalance.setUTCHours(nextRebalanceHour === 24 ? 0 : nextRebalanceHour, 0, 0, 0);
      if (nextRebalanceHour === 24) nextRebalance.setUTCDate(nextRebalance.getUTCDate() + 1);
      
      const diff = nextRebalance.getTime() - now.getTime();
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setNextRebalanceIn(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      
      const secondsUntilNextCycle = 5 - (now.getSeconds() % 5);
      setNextCycleIn(`${secondsUntilNextCycle}s`);
    };

    calculateTimers();
    const interval = setInterval(calculateTimers, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getPortfolioName = (portfolioId: string) => {
    const portfolio = portfolios?.find(p => p.id === portfolioId);
    return portfolio?.name || portfolioId;
  };

  const getPortfolioMode = (portfolioId: string) => {
    const portfolio = portfolios?.find(p => p.id === portfolioId);
    return portfolio?.trading_mode || 'paper';
  };

  const getRobotStatusColor = (status?: RobotStatus['status']) => {
    switch (status) {
      case 'in_position': return 'text-green-500';
      case 'monitoring': return 'text-blue-500';
      case 'waiting_entry': return 'text-cyan-500';
      case 'paused': return 'text-yellow-500';
      case 'stopped': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getRobotStatusIcon = (status?: RobotStatus['status']) => {
    switch (status) {
      case 'in_position': return <Zap className="h-4 w-4" />;
      case 'monitoring': return <Eye className="h-4 w-4" />;
      case 'waiting_entry': return <Target className="h-4 w-4" />;
      case 'paused': return <PauseCircle className="h-4 w-4" />;
      case 'stopped': return <Square className="h-4 w-4" />;
      default: return <Bot className="h-4 w-4" />;
    }
  };

  const isLive = getPortfolioMode(campaign.portfolio_id) === 'live';
  const isPending = pendingAction === campaign.id;

  const fallbackPnl = parseFloat(campaign.current_equity) - parseFloat(campaign.initial_capital);
  const fallbackPnlPercentage = (fallbackPnl / parseFloat(campaign.initial_capital)) * 100;
  const now = new Date();
  const startDate = new Date(campaign.start_date);
  const endDate = new Date(campaign.end_date);
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysPassed = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const fallbackProgress = Math.min(100, Math.max(0, (daysPassed / totalDays) * 100));
  const fallbackDaysRemaining = Math.max(0, totalDays - daysPassed);

  const hasCircuitBreaker = robotStatus?.circuitBreakers && 
    (robotStatus.circuitBreakers.campaign || robotStatus.circuitBreakers.dailyLoss || robotStatus.circuitBreakers.pair);

  return (
    <Card 
      className={`border-2 ${isLive ? 'border-red-500/50' : 'border-primary/50'}`}
      data-testid={`campaign-card-${campaign.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Calendar className={`h-6 w-6 ${isLive ? 'text-red-500' : 'text-primary'}`} />
            <div>
              <CardTitle 
                className="text-xl cursor-pointer hover:text-primary transition-colors" 
                data-testid={`campaign-name-${campaign.id}`}
                onClick={() => setLocation(`/campaigns/${campaign.id}`)}
              >
                {campaign.name}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 flex-wrap">
                <Wallet className="h-3 w-3" />
                {getPortfolioName(campaign.portfolio_id)}
                <Badge 
                  variant={isLive ? 'destructive' : 'secondary'} 
                  className="text-xs"
                  data-testid={`campaign-mode-${campaign.id}`}
                >
                  {isLive ? 'LIVE' : 'PAPER'}
                </Badge>
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {robotStatus && (
              <Badge 
                variant="outline" 
                className={`flex items-center gap-1 ${getRobotStatusColor(robotStatus.status)}`}
                data-testid={`robot-status-badge-${campaign.id}`}
              >
                {getRobotStatusIcon(robotStatus.status)}
                <span className="text-xs">{robotStatus.statusLabel}</span>
              </Badge>
            )}
            <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'} className="flex items-center gap-1">
              {campaign.status === 'active' ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <PauseCircle className="h-4 w-4 text-yellow-500" />
              )}
              <span className="capitalize" data-testid={`campaign-status-${campaign.id}`}>
                {campaign.status === 'active' ? t('campaign.active') : t('campaign.pausedStatus')}
              </span>
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {hasCircuitBreaker && (
          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg" data-testid={`circuit-breaker-alert-${campaign.id}`}>
            <ShieldAlert className="h-4 w-4 text-yellow-500" />
            <span className="text-sm text-yellow-600">{t('campaign.circuitBreakerActive')}</span>
            <div className="flex gap-1 ml-auto">
              {robotStatus?.circuitBreakers.campaign && <Badge variant="outline" className="text-xs">CB Campaign</Badge>}
              {robotStatus?.circuitBreakers.dailyLoss && <Badge variant="outline" className="text-xs">CB Daily</Badge>}
              {robotStatus?.circuitBreakers.pair && <Badge variant="outline" className="text-xs">CB Pair</Badge>}
            </div>
          </div>
        )}

        {campaign.status === 'active' && (
          <div className="grid grid-cols-3 gap-3 p-3 bg-muted/30 rounded-lg" data-testid={`timers-section-${campaign.id}`}>
            <div className="text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Timer className="h-3 w-3" />
                {t('campaign.nextCycle')}
              </p>
              <p className="font-mono text-lg font-bold text-primary" data-testid={`next-cycle-timer-${campaign.id}`}>
                {nextCycleIn}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <RefreshCw className="h-3 w-3" />
                {t('campaign.nextRebalance')}
              </p>
              <p className="font-mono text-lg font-bold" data-testid={`next-rebalance-timer-${campaign.id}`}>
                {nextRebalanceIn}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Activity className="h-3 w-3" />
                {t('campaign.tradesToday')}
              </p>
              <p className="font-mono text-lg font-bold" data-testid={`trades-today-${campaign.id}`}>
                {robotStatus?.todayTradesCount || 0}/{robotStatus?.maxDailyTrades || '--'}
              </p>
            </div>
          </div>
        )}

        {metricsLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-8 bg-muted rounded w-full" />
          </div>
        ) : metrics ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('campaign.dayProgress')}</span>
                <span className="font-medium font-mono" data-testid={`campaign-day-progress-${campaign.id}`}>
                  {t('campaign.day')} {metrics.dayNumber} / {metrics.totalDays}
                </span>
              </div>
              <Progress 
                value={metrics.progress} 
                className="h-3"
                data-testid={`campaign-progress-bar-${campaign.id}`}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatDate(campaign.start_date)}</span>
                <span className="font-medium">{metrics.daysRemaining} {t('campaign.daysRemaining')}</span>
                <span>{formatDate(campaign.end_date)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1 p-2 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {t('campaign.initialCapital')}
                </p>
                <p className="font-medium font-mono text-sm" data-testid={`campaign-initial-capital-${campaign.id}`}>
                  {formatCurrency(metrics.initialCapital)}
                </p>
              </div>
              <div className="space-y-1 p-2 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Wallet className="h-3 w-3" />
                  {t('campaign.currentEquity')}
                </p>
                <p className="font-medium font-mono text-sm" data-testid={`campaign-current-equity-${campaign.id}`}>
                  {formatCurrency(metrics.currentEquity)}
                </p>
              </div>
              <div className="space-y-1 p-2 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {metrics.totalPnL >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  {t('campaign.totalPnL')}
                </p>
                <p 
                  className={`font-medium font-mono text-sm ${metrics.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  data-testid={`campaign-total-pnl-${campaign.id}`}
                >
                  {formatCurrency(metrics.totalPnL)} ({formatPercentage(metrics.totalPnLPercentage)})
                </p>
              </div>
              <div className="space-y-1 p-2 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className={`h-3 w-3 ${metrics.isDrawdownBreached ? 'text-red-500' : 'text-yellow-500'}`} />
                  {t('campaign.drawdown')}
                </p>
                <p 
                  className={`font-medium font-mono text-sm ${metrics.isDrawdownBreached ? 'text-red-600' : ''}`}
                  data-testid={`campaign-drawdown-${campaign.id}`}
                >
                  {formatPercentage(metrics.currentDrawdown)} / {metrics.maxDrawdownLimit}%
                </p>
              </div>
            </div>

            {metrics.isDrawdownBreached && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm" data-testid={`campaign-drawdown-alert-${campaign.id}`}>
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-destructive">{t('campaign.drawdownBreached')}</span>
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1 p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">{t('campaign.initialCapital')}</p>
              <p className="font-medium font-mono text-sm">{formatCurrency(campaign.initial_capital)}</p>
            </div>
            <div className="space-y-1 p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">{t('campaign.currentEquity')}</p>
              <p className="font-medium font-mono text-sm">{formatCurrency(campaign.current_equity)}</p>
            </div>
            <div className="space-y-1 p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">{t('campaign.totalPnL')}</p>
              <p className={`font-medium font-mono text-sm ${fallbackPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(fallbackPnl)}
              </p>
            </div>
            <div className="space-y-1 p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">{t('campaign.drawdown')}</p>
              <p className="font-medium font-mono text-sm">--</p>
            </div>
          </div>
        )}

        {openPositions && openPositions.length > 0 && (
          <div className="p-3 bg-muted/30 rounded-lg" data-testid={`positions-section-${campaign.id}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {t('campaign.openPositions')} ({openPositions.length}/{robotStatus?.maxOpenPositions || '--'})
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {openPositions.slice(0, 5).map((pos) => {
                const pnlValue = pos.unrealized_pnl !== undefined && pos.unrealized_pnl !== null 
                  ? Number(pos.unrealized_pnl) 
                  : null;
                return (
                  <Badge 
                    key={pos.id}
                    variant="outline"
                    className={`text-xs font-mono ${pos.side === 'long' ? 'border-green-500/50 text-green-600' : 'border-red-500/50 text-red-600'}`}
                    data-testid={`position-badge-${pos.id}`}
                  >
                    {pos.side === 'long' ? '↑' : '↓'} {pos.symbol}
                    {pnlValue !== null && !isNaN(pnlValue) && (
                      <span className={`ml-1 ${pnlValue >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {pnlValue >= 0 ? '+' : ''}{pnlValue.toFixed(2)}%
                      </span>
                    )}
                  </Badge>
                );
              })}
              {openPositions.length > 5 && (
                <Badge variant="secondary" className="text-xs">
                  +{openPositions.length - 5} {t('common.more')}
                </Badge>
              )}
            </div>
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap gap-2">
          {campaign.status === 'active' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPause(campaign.id)}
                disabled={isPending}
                data-testid={`button-pause-campaign-${campaign.id}`}
              >
                <Pause className="h-4 w-4 mr-1" />
                {t('campaign.pause')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRebalance(campaign.id)}
                disabled={isPending}
                data-testid={`button-rebalance-campaign-${campaign.id}`}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                {t('campaign.rebalance')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onStop(campaign.id)}
                disabled={isPending}
                data-testid={`button-stop-campaign-${campaign.id}`}
              >
                <Square className="h-4 w-4 mr-1" />
                {t('campaign.stop')}
              </Button>
            </>
          )}
          {campaign.status === 'paused' && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => onResume(campaign.id)}
                disabled={isPending}
                data-testid={`button-resume-campaign-${campaign.id}`}
              >
                <Play className="h-4 w-4 mr-1" />
                {t('campaign.resume')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onStop(campaign.id)}
                disabled={isPending}
                data-testid={`button-stop-campaign-${campaign.id}`}
              >
                <Square className="h-4 w-4 mr-1" />
                {t('campaign.stop')}
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/campaigns/${campaign.id}`)}
            data-testid={`button-view-details-${campaign.id}`}
          >
            <Eye className="h-4 w-4 mr-1" />
            {t('common.viewDetails')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
