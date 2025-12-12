import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Zap,
  RefreshCw,
  X,
  ChevronUp,
  ChevronDown,
  Activity
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";

interface RobotActivity {
  id: string;
  campaign_id: string;
  activity_type: string;
  symbol: string | null;
  side: string | null;
  message: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface CampaignAlertsProps {
  campaignId?: string;
  maxAlerts?: number;
}

export function CampaignAlerts({ campaignId, maxAlerts = 5 }: CampaignAlertsProps) {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());

  const { data: activities } = useQuery<RobotActivity[]>({
    queryKey: campaignId 
      ? ['/api/campaigns', campaignId, 'activities'] 
      : ['/api/robot-activities/recent'],
    queryFn: async () => {
      const url = campaignId 
        ? `/api/campaigns/${campaignId}/activities?limit=${maxAlerts * 2}`
        : `/api/robot-activities/recent?limit=${maxAlerts * 2}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch activities');
      return res.json();
    },
    refetchInterval: 3000,
    staleTime: 2000,
  });

  useEffect(() => {
    if (activities && activities.length > 0) {
      const currentIds = new Set(activities.map(a => a.id));
      const newIds = new Set<string>();
      currentIds.forEach(id => {
        if (!dismissedIds.has(id) && !newAlertIds.has(id)) {
          newIds.add(id);
        }
      });
      if (newIds.size > 0) {
        setNewAlertIds(prev => new Set([...Array.from(prev), ...Array.from(newIds)]));
        setTimeout(() => {
          setNewAlertIds(prev => {
            const updated = new Set(prev);
            newIds.forEach(id => updated.delete(id));
            return updated;
          });
        }, 5000);
      }
    }
  }, [activities?.map(a => a.id).join(',')]);

  const getActivityIcon = (type: string, side?: string | null) => {
    switch (type) {
      case 'position_opened':
        return side === 'long' 
          ? <TrendingUp className="h-4 w-4 text-green-500" />
          : <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'position_closed':
        return <Zap className="h-4 w-4 text-primary" />;
      case 'circuit_breaker_triggered':
        return <ShieldAlert className="h-4 w-4 text-yellow-500" />;
      case 'circuit_breaker_reset':
        return <RefreshCw className="h-4 w-4 text-green-500" />;
      case 'signal_generated':
        return <Activity className="h-4 w-4 text-blue-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'position_opened':
        return 'border-green-500/30 bg-green-500/5';
      case 'position_closed':
        return 'border-primary/30 bg-primary/5';
      case 'circuit_breaker_triggered':
        return 'border-yellow-500/30 bg-yellow-500/5';
      case 'circuit_breaker_reset':
        return 'border-green-500/30 bg-green-500/5';
      case 'error':
        return 'border-red-500/30 bg-red-500/5';
      default:
        return 'border-muted bg-muted/5';
    }
  };

  const getActivityTypeLabel = (type: string): string => {
    switch (type) {
      case 'position_opened':
        return t('activity.positionOpened');
      case 'position_closed':
        return t('activity.positionClosed');
      case 'circuit_breaker_triggered':
        return t('activity.circuitBreaker');
      case 'circuit_breaker_reset':
        return t('activity.circuitReset');
      case 'signal_generated':
        return t('activity.signalGenerated');
      case 'analysis_cycle':
        return t('activity.analysisCycle');
      case 'market_scan':
        return t('activity.marketScan');
      case 'rebalance':
        return t('activity.rebalance');
      case 'error':
        return t('activity.error');
      default:
        return t('activity.systemEvent');
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const visibleActivities = activities?.filter(a => !dismissedIds.has(a.id)).slice(0, maxAlerts) || [];

  if (visibleActivities.length === 0) {
    return null;
  }

  return (
    <div className="w-full" data-testid="campaign-alerts">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{t('alerts.title')}</span>
          <Badge variant="secondary" className="text-xs">
            {visibleActivities.length}
          </Badge>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setIsExpanded(!isExpanded)}
          data-testid="button-toggle-alerts"
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {isExpanded && (
        <div className="space-y-2" data-testid="alerts-list">
          {visibleActivities.map((activity) => (
            <div 
              key={activity.id}
              className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${getActivityColor(activity.activity_type)} ${newAlertIds.has(activity.id) ? 'animate-pulse' : ''}`}
              data-testid={`alert-item-${activity.id}`}
            >
              {getActivityIcon(activity.activity_type, activity.side)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {activity.symbol ? (
                    <Badge variant="outline" className="text-xs font-mono">
                      {activity.symbol}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {getActivityTypeLabel(activity.activity_type)}
                    </Badge>
                  )}
                  {activity.side && (
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${activity.side === 'long' ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {activity.side.toUpperCase()}
                    </Badge>
                  )}
                </div>
                {activity.message && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {activity.message}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">
                  {formatTime(activity.created_at)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setDismissedIds(prev => new Set([...Array.from(prev), activity.id]))}
                  data-testid={`button-dismiss-alert-${activity.id}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
