import { useQuery } from "@tanstack/react-query";
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  PauseCircle,
  Zap,
  Shield
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";

interface DashboardStats {
  totalCapital: number;
  totalEquity: number;
  totalPnL: number;
  totalPnLPercentage: number;
  globalDrawdown: number;
  activeCampaigns: number;
  pausedCampaigns: number;
  completedCampaigns: number;
  atRiskCampaigns: number;
  totalCampaigns: number;
  todayTradesCount: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
}

export function GlobalStatsBar() {
  const { t } = useLanguage();
  
  const { data: stats, isLoading, isError } = useQuery<DashboardStats>({
    queryKey: ['/api/user/dashboard-stats'],
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  if (isLoading) {
    return (
      <div className="w-full bg-card border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-32" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return null;
  }

  const getHealthColor = () => {
    switch (stats.healthStatus) {
      case 'healthy': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getHealthIcon = () => {
    switch (stats.healthStatus) {
      case 'healthy': return <CheckCircle className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      case 'critical': return <Shield className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const getHealthBadge = () => {
    switch (stats.healthStatus) {
      case 'healthy': return <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30">{t('globalStats.healthy')}</Badge>;
      case 'warning': return <Badge variant="default" className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">{t('globalStats.warning')}</Badge>;
      case 'critical': return <Badge variant="destructive">{t('globalStats.critical')}</Badge>;
      default: return null;
    }
  };

  return (
    <div className="w-full bg-card border-b border-border px-4 py-3" data-testid="global-stats-bar">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-2" data-testid="stat-health">
          <div className={`flex items-center gap-1.5 ${getHealthColor()}`}>
            {getHealthIcon()}
          </div>
          {getHealthBadge()}
        </div>
        
        <div className="flex items-center gap-2" data-testid="stat-campaigns">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t('globalStats.campaigns')}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-green-500" data-testid="stat-active-count">{stats.activeCampaigns} {t('globalStats.active')}</span>
              {stats.pausedCampaigns > 0 && (
                <span className="text-sm text-muted-foreground" data-testid="stat-paused-count">
                  <PauseCircle className="w-3 h-3 inline mr-0.5" />{stats.pausedCampaigns}
                </span>
              )}
              {stats.atRiskCampaigns > 0 && (
                <span className="text-sm text-orange-500" data-testid="stat-atrisk-count">
                  <Shield className="w-3 h-3 inline mr-0.5" />{stats.atRiskCampaigns}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2" data-testid="stat-capital">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t('globalStats.totalCapital')}</span>
            <span className="text-sm font-medium">{formatCurrency(stats.totalCapital)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2" data-testid="stat-equity">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t('globalStats.totalEquity')}</span>
            <span className="text-sm font-medium">{formatCurrency(stats.totalEquity)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2" data-testid="stat-pnl">
          {stats.totalPnL >= 0 ? (
            <TrendingUp className="w-4 h-4 text-green-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-500" />
          )}
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t('globalStats.totalPnL')}</span>
            <span className={`text-sm font-medium ${stats.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatCurrency(stats.totalPnL)} ({formatPercentage(stats.totalPnLPercentage)})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2" data-testid="stat-drawdown">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t('globalStats.drawdown')}</span>
            <span className={`text-sm font-medium ${stats.globalDrawdown > 8 ? 'text-red-500' : stats.globalDrawdown > 5 ? 'text-yellow-500' : 'text-green-500'}`}>
              {stats.globalDrawdown.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2" data-testid="stat-trades-today">
          <Zap className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t('globalStats.tradesToday')}</span>
            <span className="text-sm font-medium">{stats.todayTradesCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
