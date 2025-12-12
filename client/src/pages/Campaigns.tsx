import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  XCircle,
  Play,
  Pause,
  Square,
  RefreshCw,
  DollarSign,
  Target,
  Wallet,
  Zap,
  AlertCircle,
  Trash2,
  PlusCircle
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { GlobalStatsBar } from "@/components/GlobalStatsBar";
import { EnhancedCampaignCard } from "@/components/EnhancedCampaignCard";
import { CampaignAlerts } from "@/components/CampaignAlerts";
import { EquityCurve } from "@/components/EquityCurve";
import { PositionsPanel } from "@/components/PositionsPanel";
import { ClusterVisualization } from "@/components/ClusterVisualization";
import { CampaignReports } from "@/components/CampaignReports";

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

interface Portfolio {
  id: string;
  name: string;
  trading_mode: string;
  total_value_usd: string;
}

interface ClusterSummary {
  totalAssets: number;
  tradableAssets: number;
  clusterCount: number;
  clusters: { cluster: number; count: number; tradable: number }[];
}

const CLUSTER_COLORS = [
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-green-500', text: 'text-white' },
  { bg: 'bg-purple-500', text: 'text-white' },
  { bg: 'bg-orange-500', text: 'text-white' },
  { bg: 'bg-pink-500', text: 'text-white' },
  { bg: 'bg-cyan-500', text: 'text-white' },
  { bg: 'bg-yellow-500', text: 'text-black' },
  { bg: 'bg-red-500', text: 'text-white' },
  { bg: 'bg-indigo-500', text: 'text-white' },
  { bg: 'bg-teal-500', text: 'text-white' },
];

function getClusterColor(clusterNumber: number | null) {
  if (clusterNumber === null) return { bg: 'bg-muted', text: 'text-muted-foreground' };
  return CLUSTER_COLORS[clusterNumber % CLUSTER_COLORS.length];
}

function ActiveCampaignCard({ 
  campaign, 
  portfolios, 
  onPause, 
  onResume, 
  onStop, 
  onRebalance,
  pendingAction
}: { 
  campaign: Campaign;
  portfolios: Portfolio[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onStop: (id: string) => void;
  onRebalance: (id: string) => void;
  pendingAction: string | null;
}) {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();

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

  const { data: clusterSummary } = useQuery<ClusterSummary>({
    queryKey: ['/api/campaigns', campaign.id, 'cluster-summary'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaign.id}/cluster-summary`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch cluster summary');
      return res.json();
    },
    staleTime: 60000,
    retry: 1,
  });

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
      </CardHeader>
      
      <CardContent className="space-y-6">
        {metricsLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-8 bg-muted rounded w-full" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-muted rounded" />
              ))}
            </div>
          </div>
        ) : metricsError ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <span className="text-yellow-600">{t('campaign.errorLoading')}</span>
              <Button size="sm" variant="ghost" onClick={() => refetchMetrics()}>
                <RefreshCw className="h-3 w-3 mr-1" />
                {t('common.retry')}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('campaign.dayProgress')}</span>
                <span className="font-medium font-mono">
                  {t('campaign.day')} {daysPassed} / {totalDays}
                </span>
              </div>
              <Progress value={fallbackProgress} className="h-4" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatDate(campaign.start_date)}</span>
                <span className="font-medium">{fallbackDaysRemaining} {t('campaign.daysRemaining')}</span>
                <span>{formatDate(campaign.end_date)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {t('campaign.initialCapital')}
                </p>
                <p className="font-medium font-mono">{formatCurrency(campaign.initial_capital)}</p>
              </div>
              <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Wallet className="h-3 w-3" />
                  {t('campaign.currentEquity')}
                </p>
                <p className="font-medium font-mono">{formatCurrency(campaign.current_equity)}</p>
              </div>
              <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {fallbackPnl >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  {t('campaign.totalPnL')}
                </p>
                <p className={`font-medium font-mono ${fallbackPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(fallbackPnl)} ({formatPercentage(fallbackPnlPercentage)})
                </p>
              </div>
              <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-yellow-500" />
                  {t('campaign.drawdown')}
                </p>
                <p className="font-medium font-mono">
                  -- / {Math.abs(parseFloat(campaign.max_drawdown_percentage))}%
                </p>
              </div>
            </div>
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
                className="h-4"
                data-testid={`campaign-progress-bar-${campaign.id}`}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatDate(campaign.start_date)}</span>
                <span className="font-medium">{metrics.daysRemaining} {t('campaign.daysRemaining')}</span>
                <span>{formatDate(campaign.end_date)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {t('campaign.initialCapital')}
                </p>
                <p className="font-medium font-mono" data-testid={`campaign-initial-capital-${campaign.id}`}>
                  {formatCurrency(metrics.initialCapital)}
                </p>
              </div>
              <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Wallet className="h-3 w-3" />
                  {t('campaign.currentEquity')}
                </p>
                <p className="font-medium font-mono" data-testid={`campaign-current-equity-${campaign.id}`}>
                  {formatCurrency(metrics.currentEquity)}
                </p>
              </div>
              <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {metrics.totalPnL >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  {t('campaign.totalPnL')}
                </p>
                <p 
                  className={`font-medium font-mono ${metrics.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  data-testid={`campaign-total-pnl-${campaign.id}`}
                >
                  {formatCurrency(metrics.totalPnL)} ({formatPercentage(metrics.totalPnLPercentage)})
                </p>
              </div>
              <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className={`h-3 w-3 ${metrics.isDrawdownBreached ? 'text-red-500' : 'text-yellow-500'}`} />
                  {t('campaign.drawdown')}
                </p>
                <p 
                  className={`font-medium font-mono ${metrics.isDrawdownBreached ? 'text-red-600' : ''}`}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {t('campaign.initialCapital')}
              </p>
              <p className="font-medium font-mono">{formatCurrency(campaign.initial_capital)}</p>
            </div>
            <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Wallet className="h-3 w-3" />
                {t('campaign.currentEquity')}
              </p>
              <p className="font-medium font-mono">{formatCurrency(campaign.current_equity)}</p>
            </div>
            <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {fallbackPnl >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                {t('campaign.totalPnL')}
              </p>
              <p className={`font-medium font-mono ${fallbackPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(fallbackPnl)} ({formatPercentage(fallbackPnlPercentage)})
              </p>
            </div>
            <div className="space-y-1 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-yellow-500" />
                {t('campaign.drawdown')}
              </p>
              <p className="font-medium font-mono">
                -- / {Math.abs(parseFloat(campaign.max_drawdown_percentage))}%
              </p>
            </div>
          </div>
        )}

        {clusterSummary && clusterSummary.clusters.length > 0 && (
          <div className="p-3 bg-muted/30 rounded-lg" data-testid={`campaign-clusters-${campaign.id}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Target className="h-3 w-3" />
                {t('campaign.clusters')} ({clusterSummary.clusterCount})
              </p>
              <p className="text-xs text-muted-foreground">
                {clusterSummary.tradableAssets}/{clusterSummary.totalAssets} {t('campaign.tradableAssets')}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {clusterSummary.clusters.map((c) => {
                const color = getClusterColor(c.cluster);
                return (
                  <Badge 
                    key={c.cluster}
                    className={`${color.bg} ${color.text} text-xs font-mono`}
                    data-testid={`cluster-badge-${c.cluster}`}
                  >
                    C{c.cluster} ({c.tradable}/{c.count})
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap gap-3">
          {campaign.status === 'active' && (
            <>
              <Button
                variant="outline"
                onClick={() => onPause(campaign.id)}
                disabled={isPending}
                data-testid={`button-pause-campaign-${campaign.id}`}
              >
                <Pause className="h-4 w-4 mr-2" />
                {t('campaign.pause')}
              </Button>
              <Button
                variant="outline"
                onClick={() => onRebalance(campaign.id)}
                disabled={isPending}
                data-testid={`button-rebalance-campaign-${campaign.id}`}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('campaign.rebalance')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => onStop(campaign.id)}
                disabled={isPending}
                data-testid={`button-stop-campaign-${campaign.id}`}
              >
                <Square className="h-4 w-4 mr-2" />
                {t('campaign.stop')}
              </Button>
            </>
          )}
          {campaign.status === 'paused' && (
            <>
              <Button
                variant="default"
                onClick={() => onResume(campaign.id)}
                disabled={isPending}
                data-testid={`button-resume-campaign-${campaign.id}`}
              >
                <Play className="h-4 w-4 mr-2" />
                {t('campaign.resume')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => onStop(campaign.id)}
                disabled={isPending}
                data-testid={`button-stop-campaign-${campaign.id}`}
              >
                <Square className="h-4 w-4 mr-2" />
                {t('campaign.stop')}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CompactCampaignCard({ 
  campaign, 
  portfolios,
  onResume,
  onStop,
  onDelete,
  pendingAction
}: { 
  campaign: Campaign;
  portfolios: Portfolio[];
  onResume?: (id: string) => void;
  onStop?: (id: string) => void;
  onDelete?: (id: string) => void;
  pendingAction?: string | null;
}) {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();

  const { data: clusterSummary } = useQuery<ClusterSummary>({
    queryKey: ['/api/campaigns', campaign.id, 'cluster-summary'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaign.id}/cluster-summary`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch cluster summary');
      return res.json();
    },
    staleTime: 60000,
    retry: 1,
  });

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'paused':
        return <PauseCircle className="h-4 w-4 text-yellow-500" />;
      case 'stopped':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'active':
        return 'default';
      case 'paused':
        return 'secondary';
      case 'stopped':
        return 'destructive';
      case 'completed':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getPortfolioName = (portfolioId: string) => {
    const portfolio = portfolios?.find(p => p.id === portfolioId);
    return portfolio?.name || portfolioId;
  };

  const getPortfolioMode = (portfolioId: string) => {
    const portfolio = portfolios?.find(p => p.id === portfolioId);
    return portfolio?.trading_mode || 'paper';
  };

  const pnl = parseFloat(campaign.current_equity) - parseFloat(campaign.initial_capital);
  const pnlPercentage = (pnl / parseFloat(campaign.initial_capital)) * 100;
  const isLive = getPortfolioMode(campaign.portfolio_id) === 'live';
  const isPending = pendingAction === campaign.id;

  return (
    <Card 
      className={isLive ? 'border-red-500/30' : ''} 
      data-testid={`campaign-card-${campaign.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle 
              className="text-base cursor-pointer hover:text-primary transition-colors" 
              data-testid={`campaign-name-${campaign.id}`}
              onClick={() => setLocation(`/campaigns/${campaign.id}`)}
            >
              {campaign.name}
            </CardTitle>
            <CardDescription className="text-xs flex items-center gap-2 flex-wrap">
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
          <Badge variant={getStatusBadgeVariant(campaign.status)} className="flex items-center gap-1">
            {getStatusIcon(campaign.status)}
            <span className="capitalize text-xs" data-testid={`campaign-status-${campaign.id}`}>
              {campaign.status === 'active' ? t('campaign.active') : 
               campaign.status === 'paused' ? t('campaign.pausedStatus') :
               campaign.status === 'stopped' ? t('campaign.stoppedStatus') :
               campaign.status === 'completed' ? t('campaign.completedStatus') : campaign.status}
            </span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t('campaign.initialCapital')}</p>
            <p className="font-mono" data-testid={`campaign-initial-capital-${campaign.id}`}>
              {formatCurrency(campaign.initial_capital)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {campaign.status === 'completed' || campaign.status === 'stopped' 
                ? t('campaign.finalEquity') 
                : t('campaign.currentEquity')}
            </p>
            <p className="font-mono" data-testid={`campaign-current-equity-${campaign.id}`}>
              {formatCurrency(campaign.current_equity)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {formatDate(campaign.start_date)} - {formatDate(campaign.completed_at || campaign.end_date)}
          </span>
          <span 
            className={`font-mono font-medium ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
            data-testid={`campaign-pnl-${campaign.id}`}
          >
            {formatPercentage(pnlPercentage)}
          </span>
        </div>

        {clusterSummary && clusterSummary.clusters.length > 0 && (
          <div className="p-2 bg-muted/30 rounded-lg" data-testid={`campaign-clusters-${campaign.id}`}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-muted-foreground font-medium">
                {t('campaign.clusters')} ({clusterSummary.clusterCount})
              </p>
              <p className="text-xs text-muted-foreground">
                {clusterSummary.tradableAssets}/{clusterSummary.totalAssets}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {clusterSummary.clusters.map((c) => {
                const color = getClusterColor(c.cluster);
                return (
                  <Badge 
                    key={c.cluster}
                    className={`${color.bg} ${color.text} text-xs font-mono px-1.5 py-0`}
                    data-testid={`cluster-badge-${c.cluster}`}
                  >
                    C{c.cluster}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
        
        {campaign.status === 'paused' && onResume && onStop && (
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => onResume(campaign.id)}
              disabled={isPending}
              data-testid={`button-resume-campaign-${campaign.id}`}
            >
              <Play className="h-3 w-3 mr-1" />
              {t('campaign.resume')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onStop(campaign.id)}
              disabled={isPending}
              data-testid={`button-stop-campaign-${campaign.id}`}
            >
              <Square className="h-3 w-3 mr-1" />
              {t('campaign.stop')}
            </Button>
          </div>
        )}
        
        {/* Delete button for stopped/completed/paused campaigns */}
        {['stopped', 'completed', 'paused'].includes(campaign.status) && onDelete && (
          <div className="flex justify-end pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={isPending}
                  data-testid={`button-delete-campaign-${campaign.id}`}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {t('campaign.delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('campaign.deleteConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('campaign.deleteConfirmDesc')} "{campaign.name}"?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(campaign.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('campaign.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Campaigns() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const { data: portfolios, isLoading: portfoliosLoading } = useQuery<Portfolio[]>({
    queryKey: ['/api/portfolios'],
  });

  const { data: allCampaigns, isLoading: campaignsLoading, refetch } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns/all'],
    refetchInterval: 30000,
  });

  const pauseMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      setPendingAction(campaignId);
      return apiRequest(`/api/campaigns/${campaignId}/pause`, 'POST', { reason: 'Manual pause' });
    },
    onSuccess: () => {
      toast({ title: t('campaign.paused'), description: t('campaign.pausedDesc') });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/all'] });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
    onSettled: () => {
      setPendingAction(null);
    }
  });

  const resumeMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      setPendingAction(campaignId);
      return apiRequest(`/api/campaigns/${campaignId}/resume`, 'POST');
    },
    onSuccess: () => {
      toast({ title: t('campaign.resumed'), description: t('campaign.resumedDesc') });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/all'] });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
    onSettled: () => {
      setPendingAction(null);
    }
  });

  const stopMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      setPendingAction(campaignId);
      return apiRequest(`/api/campaigns/${campaignId}/stop`, 'POST', { reason: 'Manual stop' });
    },
    onSuccess: () => {
      toast({ title: t('campaign.stopped'), description: t('campaign.stoppedDesc') });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/all'] });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
    onSettled: () => {
      setPendingAction(null);
    }
  });

  const rebalanceMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      setPendingAction(campaignId);
      return apiRequest(`/api/campaigns/${campaignId}/rebalance`, 'POST');
    },
    onSuccess: () => {
      toast({ title: t('campaign.rebalanced'), description: t('campaign.rebalancedDesc') });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/all'] });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
    onSettled: () => {
      setPendingAction(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      setPendingAction(campaignId);
      return apiRequest(`/api/campaigns/${campaignId}`, 'DELETE');
    },
    onSuccess: () => {
      toast({ title: t('campaign.deleted'), description: t('campaign.deletedDesc') });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/all'] });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
    onSettled: () => {
      setPendingAction(null);
    }
  });

  const isLoading = portfoliosLoading || campaignsLoading;

  const activeCampaigns = allCampaigns?.filter(c => c.status === 'active') || [];
  const pausedCampaigns = allCampaigns?.filter(c => c.status === 'paused') || [];
  const historyCampaigns = allCampaigns?.filter(c => c.status === 'stopped' || c.status === 'completed') || [];

  const totalCampaigns = allCampaigns?.length || 0;

  return (
    <div className="space-y-0" data-testid="campaigns-page">
      <GlobalStatsBar />
      <div className="p-6 space-y-6">
        {activeCampaigns.length > 0 && (
          <Card className="p-4">
            <CampaignAlerts maxAlerts={5} />
          </Card>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold" data-testid="campaigns-title">{t('campaign.title')}</h1>
            <p className="text-muted-foreground">{t('campaign.subtitle')}</p>
          </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm" data-testid="campaigns-total-count">
            {totalCampaigns} {totalCampaigns === 1 ? 'campanha' : 'campanhas'}
          </Badge>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => refetch()}
            data-testid="button-refresh-campaigns"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/campaigns/new" data-testid="link-new-campaign">
            <Button data-testid="button-new-campaign">
              <PlusCircle className="h-4 w-4 mr-2" />
              {t('wizard.menuItem')}
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-8 bg-muted rounded w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {totalCampaigns === 0 ? (
            <Card data-testid="no-campaigns">
              <CardContent className="p-8 text-center">
                <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">{t('campaign.noCampaign')}</h3>
                <p className="text-muted-foreground mb-4">{t('campaign.noCampaignDesc')}</p>
                <Button asChild data-testid="button-create-first-campaign">
                  <a href="/campaigns/new">{t('campaign.createNew')}</a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {activeCampaigns.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-green-500" />
                    <h2 className="text-xl font-semibold" data-testid="active-campaigns-title">
                      {t('campaign.activeCampaigns')} ({activeCampaigns.length})
                    </h2>
                  </div>
                  <div className="space-y-6">
                    {activeCampaigns.map((campaign) => (
                      <div key={campaign.id} className="space-y-4">
                        <EnhancedCampaignCard
                          campaign={campaign}
                          portfolios={portfolios || []}
                          onPause={(id) => pauseMutation.mutate(id)}
                          onResume={(id) => resumeMutation.mutate(id)}
                          onStop={(id) => stopMutation.mutate(id)}
                          onRebalance={(id) => rebalanceMutation.mutate(id)}
                          pendingAction={pendingAction}
                        />
                        <div className="grid gap-4 md:grid-cols-2">
                          <EquityCurve 
                            campaignId={campaign.id} 
                            initialCapital={parseFloat(campaign.initial_capital)} 
                          />
                          <PositionsPanel campaignId={campaign.id} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <ClusterVisualization campaignId={campaign.id} />
                          <CampaignReports campaignId={campaign.id} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pausedCampaigns.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <PauseCircle className="h-5 w-5 text-yellow-500" />
                    <h2 className="text-xl font-semibold" data-testid="paused-campaigns-title">
                      {t('campaign.pausedCampaigns')} ({pausedCampaigns.length})
                    </h2>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {pausedCampaigns.map((campaign) => (
                      <CompactCampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        portfolios={portfolios || []}
                        onResume={(id) => resumeMutation.mutate(id)}
                        onStop={(id) => stopMutation.mutate(id)}
                        onDelete={(id) => deleteMutation.mutate(id)}
                        pendingAction={pendingAction}
                      />
                    ))}
                  </div>
                </div>
              )}

              {historyCampaigns.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-xl font-semibold" data-testid="history-campaigns-title">
                      {t('campaign.history')} ({historyCampaigns.length})
                    </h2>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {historyCampaigns.map((campaign) => (
                      <CompactCampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        portfolios={portfolios || []}
                        onDelete={(id) => deleteMutation.mutate(id)}
                        pendingAction={pendingAction}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
      </div>
    </div>
  );
}
