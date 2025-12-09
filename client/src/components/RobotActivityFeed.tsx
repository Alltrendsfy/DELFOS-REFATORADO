import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Target,
  Search,
  XCircle,
  Zap,
  Info
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDistanceToNow } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";

interface RobotActivity {
  id: string;
  campaign_id: string;
  event_type: string;
  severity: string;
  symbol: string | null;
  message_key: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface SignalDetails {
  price?: number;
  atr?: number;
  atrPct?: number;
  ema12?: number;
  ema36?: number;
  signal?: string;
  slAtr?: number;
  tpAtr?: number;
  stopLoss?: number;
  takeProfit?: number;
  side?: string;
  quantity?: number;
}

interface PositionDetails {
  side?: string;
  entryPrice?: number;
  exitPrice?: number;
  quantity?: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl?: number;
  pnlPct?: number;
  closeReason?: string;
}

interface BreakerDetails {
  breakerType?: string;
  threshold?: number;
  currentValue?: number;
  triggered?: boolean;
}

interface RebalanceDetails {
  assetsAdded?: string[];
  assetsRemoved?: string[];
  tradableCount?: number;
}

interface MarketScanDetails {
  symbolsScanned?: number;
  signalsFound?: number;
  longSignals?: number;
  shortSignals?: number;
}

interface RobotActivityFeedProps {
  campaignId: string;
  limit?: number;
  refreshInterval?: number;
}

const getLocale = (language: string) => {
  switch (language) {
    case 'es': return es;
    case 'pt-BR': return ptBR;
    default: return enUS;
  }
};

const getEventIcon = (eventType: string, severity: string) => {
  switch (eventType) {
    case 'signal_analysis':
      return <Zap className="h-4 w-4 text-warning" />;
    case 'position_open':
      return <TrendingUp className="h-4 w-4 text-success" />;
    case 'position_close':
      return severity === 'success' 
        ? <CheckCircle className="h-4 w-4 text-success" />
        : <TrendingDown className="h-4 w-4 text-destructive" />;
    case 'circuit_breaker':
      return severity === 'error'
        ? <XCircle className="h-4 w-4 text-destructive" />
        : <AlertTriangle className="h-4 w-4 text-warning" />;
    case 'rebalance':
      return <RefreshCw className="h-4 w-4 text-primary" />;
    case 'market_scan':
      return <Search className="h-4 w-4 text-accent-foreground" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />;
  }
};

const getSeverityBadge = (severity: string, t: (key: string) => string) => {
  const variants: Record<string, string> = {
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    error: 'bg-destructive/10 text-destructive border-destructive/30',
    info: 'bg-primary/10 text-primary border-primary/30',
  };
  
  return (
    <Badge variant="outline" className={`text-xs ${variants[severity] || variants.info}`}>
      {t(`robot.severity.${severity}`)}
    </Badge>
  );
};

const formatSignalDetails = (details: SignalDetails, t: (key: string) => string) => {
  const parts: string[] = [];
  
  if (details.signal) {
    parts.push(`${t('robot.details.signal')}: ${details.signal}`);
  }
  if (details.price !== undefined) {
    parts.push(`${t('robot.details.price')}: $${details.price.toFixed(4)}`);
  }
  if (details.atrPct !== undefined) {
    parts.push(`ATR: ${details.atrPct.toFixed(2)}%`);
  }
  if (details.ema12 !== undefined && details.ema36 !== undefined) {
    const trend = details.ema12 > details.ema36 ? 'BULLISH' : 'BEARISH';
    parts.push(`EMA12/36: ${trend}`);
  }
  if (details.slAtr !== undefined && details.tpAtr !== undefined) {
    parts.push(`SL: ${details.slAtr}xATR | TP: ${details.tpAtr}xATR`);
  }
  
  return parts;
};

const formatPositionDetails = (details: PositionDetails, t: (key: string) => string) => {
  const parts: string[] = [];
  
  if (details.side) {
    parts.push(`${t('robot.details.side')}: ${details.side.toUpperCase()}`);
  }
  if (details.entryPrice !== undefined) {
    parts.push(`${t('robot.details.entry')}: $${details.entryPrice.toFixed(4)}`);
  }
  if (details.exitPrice !== undefined) {
    parts.push(`${t('robot.details.exit')}: $${details.exitPrice.toFixed(4)}`);
  }
  if (details.stopLoss !== undefined && details.takeProfit !== undefined) {
    parts.push(`SL: $${details.stopLoss.toFixed(4)} | TP: $${details.takeProfit.toFixed(4)}`);
  }
  if (details.pnl !== undefined) {
    const pnlColor = details.pnl >= 0 ? 'text-green-600' : 'text-red-600';
    parts.push(`PnL: ${details.pnl >= 0 ? '+' : ''}$${details.pnl.toFixed(2)} (${details.pnlPct?.toFixed(2)}%)`);
  }
  if (details.closeReason) {
    parts.push(`${t('robot.details.reason')}: ${details.closeReason}`);
  }
  
  return parts;
};

const formatBreakerDetails = (details: BreakerDetails, t: (key: string) => string) => {
  const parts: string[] = [];
  
  if (details.breakerType) {
    parts.push(`${t('robot.details.type')}: ${details.breakerType.toUpperCase()}`);
  }
  if (details.threshold !== undefined) {
    parts.push(`${t('robot.details.threshold')}: ${details.threshold}`);
  }
  if (details.currentValue !== undefined) {
    parts.push(`${t('robot.details.current')}: ${details.currentValue}`);
  }
  
  return parts;
};

const formatRebalanceDetails = (details: RebalanceDetails, t: (key: string) => string) => {
  const parts: string[] = [];
  
  if (details.tradableCount !== undefined) {
    parts.push(`${t('robot.details.tradable')}: ${details.tradableCount}`);
  }
  if (details.assetsAdded?.length) {
    parts.push(`${t('robot.details.added')}: ${details.assetsAdded.length}`);
  }
  if (details.assetsRemoved?.length) {
    parts.push(`${t('robot.details.removed')}: ${details.assetsRemoved.length}`);
  }
  
  return parts;
};

const formatMarketScanDetails = (details: MarketScanDetails, t: (key: string) => string) => {
  const parts: string[] = [];
  
  if (details.symbolsScanned !== undefined) {
    parts.push(`${t('robot.details.scanned')}: ${details.symbolsScanned}`);
  }
  if (details.signalsFound !== undefined) {
    parts.push(`${t('robot.details.signals')}: ${details.signalsFound}`);
  }
  if (details.longSignals !== undefined || details.shortSignals !== undefined) {
    parts.push(`LONG: ${details.longSignals || 0} | SHORT: ${details.shortSignals || 0}`);
  }
  
  return parts;
};

const formatActivityDetails = (
  eventType: string,
  details: Record<string, unknown> | null,
  t: (key: string) => string
): string[] => {
  if (!details) return [];
  
  switch (eventType) {
    case 'signal_analysis':
      return formatSignalDetails(details as SignalDetails, t);
    case 'position_open':
    case 'position_close':
      return formatPositionDetails(details as PositionDetails, t);
    case 'circuit_breaker':
      return formatBreakerDetails(details as BreakerDetails, t);
    case 'rebalance':
      return formatRebalanceDetails(details as RebalanceDetails, t);
    case 'market_scan':
      return formatMarketScanDetails(details as MarketScanDetails, t);
    default:
      return [];
  }
};

export function RobotActivityFeed({ 
  campaignId, 
  limit = 50,
  refreshInterval = 5000
}: RobotActivityFeedProps) {
  const { t, language } = useLanguage();
  const locale = getLocale(language);
  
  const { data: activities, isLoading, error } = useQuery<RobotActivity[]>({
    queryKey: ['/api/campaigns', campaignId, 'activities', { limit }],
    refetchInterval: refreshInterval,
    enabled: !!campaignId,
  });
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('robot.feed.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('robot.feed.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{t('robot.feed.error')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          {t('robot.feed.title')}
          {activities && activities.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activities.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          {!activities || activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Target className="h-12 w-12 mb-4" />
              <p>{t('robot.feed.empty')}</p>
              <p className="text-sm">{t('robot.feed.waiting')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {activities.map((activity) => {
                const detailParts = formatActivityDetails(activity.event_type, activity.details, t);
                const timeAgo = formatDistanceToNow(new Date(activity.created_at), {
                  addSuffix: true,
                  locale
                });
                
                return (
                  <div 
                    key={activity.id} 
                    className="p-4 hover-elevate transition-colors"
                    data-testid={`activity-${activity.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getEventIcon(activity.event_type, activity.severity)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {t(activity.message_key) || activity.message_key}
                          </span>
                          {activity.symbol && (
                            <Badge variant="outline" className="font-mono text-xs">
                              {activity.symbol}
                            </Badge>
                          )}
                          {getSeverityBadge(activity.severity, t)}
                        </div>
                        
                        {detailParts.length > 0 && (
                          <div className="mt-2 text-sm text-muted-foreground font-mono bg-muted/30 rounded p-2 space-y-1">
                            {detailParts.map((part, i) => (
                              <div key={i}>{part}</div>
                            ))}
                          </div>
                        )}
                        
                        <div className="mt-1 text-xs text-muted-foreground">
                          {timeAgo}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
