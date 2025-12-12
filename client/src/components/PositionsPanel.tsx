import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  Clock,
  Target,
  AlertTriangle,
  DollarSign,
  Activity,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useState } from "react";

interface CampaignPosition {
  id: string;
  campaign_id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: string;
  entry_price: string;
  current_price?: string;
  stop_loss: string;
  take_profit: string;
  unrealized_pnl?: number;
  unrealized_pnl_percentage?: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string;
  exit_price?: string;
  realized_pnl?: string;
}

interface PositionsPanelProps {
  campaignId: string;
}

export function PositionsPanel({ campaignId }: PositionsPanelProps) {
  const { t } = useLanguage();
  const [showClosed, setShowClosed] = useState(false);

  const { data: openPositions, isLoading: loadingOpen, isError: errorOpen } = useQuery<CampaignPosition[]>({
    queryKey: ['/api/campaigns', campaignId, 'positions', 'open'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/positions?status=open`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch open positions');
      return res.json();
    },
    enabled: !!campaignId,
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: closedPositions, isLoading: loadingClosed } = useQuery<CampaignPosition[]>({
    queryKey: ['/api/campaigns', campaignId, 'positions', 'closed'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/positions?status=closed&limit=10`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch closed positions');
      return res.json();
    },
    enabled: !!campaignId && showClosed,
    staleTime: 30000,
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

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculatePnL = (position: CampaignPosition): number => {
    if (position.unrealized_pnl !== undefined && position.unrealized_pnl !== null) {
      return Number(position.unrealized_pnl);
    }
    if (position.current_price && position.entry_price) {
      const entry = parseFloat(position.entry_price);
      const current = parseFloat(position.current_price);
      const qty = parseFloat(position.quantity);
      return position.side === 'long' 
        ? (current - entry) * qty
        : (entry - current) * qty;
    }
    return 0;
  };

  const calculatePnLPct = (position: CampaignPosition): number => {
    if (position.unrealized_pnl_percentage !== undefined && position.unrealized_pnl_percentage !== null) {
      return Number(position.unrealized_pnl_percentage);
    }
    if (position.current_price && position.entry_price) {
      const entry = parseFloat(position.entry_price);
      const current = parseFloat(position.current_price);
      return position.side === 'long' 
        ? ((current - entry) / entry) * 100
        : ((entry - current) / entry) * 100;
    }
    return 0;
  };

  const totalUnrealizedPnL = openPositions?.reduce((sum, pos) => sum + calculatePnL(pos), 0) || 0;

  if (loadingOpen) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (errorOpen) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-muted-foreground">
          <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('common.error')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid={`positions-panel-${campaignId}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              {t('positions.title')}
            </CardTitle>
            <CardDescription>
              {openPositions?.length || 0} {t('positions.openCount')}
            </CardDescription>
          </div>
          {openPositions && openPositions.length > 0 && (
            <Badge 
              variant={totalUnrealizedPnL >= 0 ? 'default' : 'destructive'} 
              className="font-mono"
              data-testid="total-unrealized-pnl"
            >
              {totalUnrealizedPnL >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {totalUnrealizedPnL >= 0 ? '+' : ''}{formatCurrency(totalUnrealizedPnL)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(!openPositions || openPositions.length === 0) ? (
          <div className="text-center text-muted-foreground py-4">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('positions.noOpen')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {openPositions.map((position) => {
              const pnl = calculatePnL(position);
              const pnlPct = calculatePnLPct(position);
              const isProfit = pnl >= 0;
              
              return (
                <div 
                  key={position.id}
                  className={`p-3 rounded-lg border ${isProfit ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}
                  data-testid={`position-row-${position.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {position.side === 'long' 
                        ? <TrendingUp className="h-4 w-4 text-green-500" />
                        : <TrendingDown className="h-4 w-4 text-red-500" />
                      }
                      <span className="font-mono font-medium">{position.symbol}</span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${position.side === 'long' ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {position.side.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                        {isProfit ? '+' : ''}{formatCurrency(pnl)}
                      </p>
                      <p className={`text-xs ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                        {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                    <div>
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {t('positions.entry')}: <span className="font-mono">{formatCurrency(position.entry_price)}</span>
                      </span>
                    </div>
                    <div>
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                        SL: <span className="font-mono">{formatCurrency(position.stop_loss)}</span>
                      </span>
                    </div>
                    <div>
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3 text-green-500" />
                        TP: <span className="font-mono">{formatCurrency(position.take_profit)}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(position.opened_at)}
                    </span>
                    {position.current_price && (
                      <span className="font-mono">
                        {t('positions.current')}: {formatCurrency(position.current_price)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowClosed(!showClosed)}
          className="w-full"
          data-testid="button-toggle-closed-positions"
        >
          {showClosed ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
          {showClosed ? t('positions.hideClosed') : t('positions.showClosed')}
        </Button>

        {showClosed && closedPositions && closedPositions.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground font-medium">{t('positions.recentClosed')}</p>
            {closedPositions.map((position) => {
              const realizedPnl = position.realized_pnl ? parseFloat(position.realized_pnl) : 0;
              const isProfit = realizedPnl >= 0;
              
              return (
                <div 
                  key={position.id}
                  className="p-2 rounded-lg bg-muted/30 text-sm"
                  data-testid={`closed-position-${position.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{position.symbol}</span>
                      <Badge variant="outline" className="text-xs">{position.side.toUpperCase()}</Badge>
                    </div>
                    <span className={`font-mono ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                      {isProfit ? '+' : ''}{formatCurrency(realizedPnl)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
