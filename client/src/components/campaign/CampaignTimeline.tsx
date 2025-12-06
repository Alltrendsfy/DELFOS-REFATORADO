import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  PauseCircle,
  XCircle
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

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

interface CampaignTimelineProps {
  campaignId: string;
}

export function CampaignTimeline({ campaignId }: CampaignTimelineProps) {
  const { t } = useLanguage();
  
  const { data: metrics, isLoading, error } = useQuery<CampaignMetrics>({
    queryKey: ['/api/campaigns', campaignId, 'metrics'],
    refetchInterval: 30000,
    enabled: !!campaignId,
  });

  if (isLoading) {
    return (
      <Card data-testid="campaign-timeline-loading">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-8 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Card data-testid="campaign-timeline-error">
        <CardContent className="p-6 text-center text-muted-foreground">
          {t('campaign.errorLoading')}
        </CardContent>
      </Card>
    );
  }

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

  const getStatusBadgeVariant = (status: string) => {
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

  return (
    <Card data-testid="campaign-timeline">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('campaign.timeline')}
          </CardTitle>
          <Badge variant={getStatusBadgeVariant(metrics.status)} className="flex items-center gap-1">
            {getStatusIcon(metrics.status)}
            <span className="capitalize" data-testid="campaign-status">{metrics.status}</span>
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('campaign.dayProgress')}</span>
            <span className="font-medium" data-testid="campaign-day-number">
              {t('campaign.day')} {metrics.dayNumber} / {metrics.totalDays}
            </span>
          </div>
          <Progress 
            value={metrics.progress} 
            className="h-3"
            data-testid="campaign-progress-bar"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('campaign.day')} 1</span>
            <span>{metrics.daysRemaining} {t('campaign.daysRemaining')}</span>
            <span>{t('campaign.day')} {metrics.totalDays}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('campaign.initialCapital')}</p>
            <p className="font-medium" data-testid="campaign-initial-capital">
              {formatCurrency(metrics.initialCapital)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('campaign.currentEquity')}</p>
            <p className="font-medium" data-testid="campaign-current-equity">
              {formatCurrency(metrics.currentEquity)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t pt-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {metrics.totalPnL >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              {t('campaign.totalPnL')}
            </p>
            <p 
              className={`font-medium ${metrics.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}
              data-testid="campaign-total-pnl"
            >
              {formatCurrency(metrics.totalPnL)} ({formatPercentage(metrics.totalPnLPercentage)})
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className={`h-3 w-3 ${metrics.isDrawdownBreached ? 'text-red-500' : 'text-yellow-500'}`} />
              {t('campaign.drawdown')}
            </p>
            <p 
              className={`font-medium ${metrics.isDrawdownBreached ? 'text-red-600' : ''}`}
              data-testid="campaign-drawdown"
            >
              {formatPercentage(metrics.currentDrawdown)} / {metrics.maxDrawdownLimit}%
            </p>
          </div>
        </div>

        {metrics.isDrawdownBreached && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm" data-testid="campaign-drawdown-alert">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-destructive">{t('campaign.drawdownBreached')}</span>
          </div>
        )}

        {metrics.status === 'active' && !metrics.isDrawdownBreached && (
          <div className="text-center text-sm text-muted-foreground pt-2" data-testid="campaign-status-message">
            {t('campaign.activeMessage')} ({t('campaign.day')} {metrics.dayNumber})
          </div>
        )}
      </CardContent>
    </Card>
  );
}
