import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { MarketDataCache } from "@shared/schema";

interface DashboardStats {
  portfolio_value: string;
  daily_pnl: string;
  daily_pnl_percentage: string;
  unrealized_pnl: string;
  realized_pnl: string;
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

  const isLoading = loadingMarket || loadingStats;

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

  const btcData = marketData?.find(m => m.symbol.includes('XBT'));
  const ethData = marketData?.find(m => m.symbol.includes('ETH'));

  // Determine locale for number formatting
  const locale = language === 'pt-BR' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US';

  // Safe parsing helper to prevent NaN
  const safeParseFloat = (value: string | undefined | null): number => {
    if (!value) return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Create formatters using Intl.NumberFormat
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Backend returns percentages as 0-100, so we format them as numbers and append '%'
  const formatPercentage = (value: number) => {
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'exceptZero',
    });
    return formatter.format(value) + '%';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">
          {t('dashboard.title')}
        </h1>
      </div>

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
            {stats && safeParseFloat(stats.portfolio_value) > 0 ? t('dashboard.active_portfolios') : t('dashboard.no_active_portfolio')}
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

        {btcData && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">
                BTC/USD
              </p>
              {safeParseFloat(btcData.change_24h_percentage) >= 0 ? (
                <TrendingUp className="w-4 h-4 text-success" />
              ) : (
                <TrendingDown className="w-4 h-4 text-destructive" />
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-mono font-bold" data-testid="text-btc-price">
                {currencyFormatter.format(safeParseFloat(btcData.current_price))}
              </p>
            </div>
            <p className={`text-xs mt-2 font-medium ${safeParseFloat(btcData.change_24h_percentage) >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatPercentage(safeParseFloat(btcData.change_24h_percentage))}
            </p>
          </Card>
        )}

        {ethData && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">
                ETH/USD
              </p>
              {safeParseFloat(ethData.change_24h_percentage) >= 0 ? (
                <TrendingUp className="w-4 h-4 text-success" />
              ) : (
                <TrendingDown className="w-4 h-4 text-destructive" />
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-mono font-bold" data-testid="text-eth-price">
                {currencyFormatter.format(safeParseFloat(ethData.current_price))}
              </p>
            </div>
            <p className={`text-xs mt-2 font-medium ${safeParseFloat(ethData.change_24h_percentage) >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatPercentage(safeParseFloat(ethData.change_24h_percentage))}
            </p>
          </Card>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Market Overview</h2>
          <div className="space-y-3">
            {marketData?.slice(0, 5).map((asset) => {
              const price = safeParseFloat(asset.current_price);
              const change = safeParseFloat(asset.change_24h_percentage);
              return (
                <div key={asset.symbol} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{asset.symbol}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-mono">
                      {currencyFormatter.format(price)}
                    </span>
                    <span className={`text-xs font-medium ${change >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatPercentage(change)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <p className="text-sm text-muted-foreground">
            Create a portfolio to start trading and tracking your positions.
          </p>
        </Card>
      </div>
    </div>
  );
}
