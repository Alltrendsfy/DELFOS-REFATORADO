import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  AlertTriangle,
  DollarSign,
  BarChart3,
  Shield,
  ArrowDownUp
} from "lucide-react";

interface AuditData {
  period: string;
  timestamp: string;
  performance: {
    hitRate: string;
    avgWin: string;
    avgLoss: string;
    profitFactor: string;
    payoff: string;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
  };
  pnl: {
    realized: string;
    unrealized: string;
    total: string;
    percentage: string;
  };
  risk: {
    var95: string;
    expectedShortfall: string;
    maxDrawdown: string;
    currentEquity: string;
  };
  costs: {
    totalFees: string;
    totalSlippage: string;
    totalCosts: string;
    costPerTrade: string;
  };
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  positive,
  neutral,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: typeof TrendingUp;
  positive?: boolean;
  neutral?: boolean;
}) {
  const colorClass = neutral 
    ? "text-muted-foreground" 
    : positive 
      ? "text-emerald-500" 
      : "text-rose-500";

  return (
    <Card data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className={`text-2xl font-bold ${colorClass}`} data-testid={`value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={`p-2 rounded-lg bg-muted ${colorClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: typeof BarChart3 }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-5 w-5 text-primary" />
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}

export default function AuditDashboard() {
  const { t } = useLanguage();

  const { data: audit, isLoading, error } = useQuery<AuditData>({
    queryKey: ['/api/operations/audit'],
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="container mx-auto p-4">
        <Card className="bg-destructive/10 border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <p>{t('errors.generic')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pnlValue = parseFloat(audit.pnl.total);
  const pnlPercentage = parseFloat(audit.pnl.percentage);
  const hitRate = parseFloat(audit.performance.hitRate);
  const profitFactor = parseFloat(audit.performance.profitFactor);

  return (
    <div className="container mx-auto p-4 space-y-6" data-testid="page-audit-dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="title-audit">{t('audit.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('audit.subtitle')}</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {t('audit.period')}: {audit.period}
        </Badge>
      </div>

      {/* Performance Section */}
      <div>
        <SectionHeader title={t('audit.performance')} icon={BarChart3} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title={t('audit.hitRate')}
            value={`${audit.performance.hitRate}%`}
            subtitle={`${audit.performance.winningTrades}/${audit.performance.totalTrades} ${t('audit.trades')}`}
            icon={Target}
            positive={hitRate >= 50}
            neutral={audit.performance.totalTrades === 0}
          />
          <MetricCard
            title={t('audit.profitFactor')}
            value={audit.performance.profitFactor}
            subtitle={profitFactor >= 1.5 ? t('audit.excellent') : profitFactor >= 1 ? t('audit.good') : t('audit.poor')}
            icon={BarChart3}
            positive={profitFactor >= 1}
            neutral={audit.performance.totalTrades === 0}
          />
          <MetricCard
            title={t('audit.avgWin')}
            value={`$${audit.performance.avgWin}`}
            subtitle={`${audit.performance.winningTrades} ${t('audit.wins')}`}
            icon={TrendingUp}
            positive
          />
          <MetricCard
            title={t('audit.avgLoss')}
            value={`$${audit.performance.avgLoss}`}
            subtitle={`${audit.performance.losingTrades} ${t('audit.losses')}`}
            icon={TrendingDown}
            positive={false}
          />
        </div>
      </div>

      {/* PnL Section */}
      <div>
        <SectionHeader title={t('audit.pnlSection')} icon={DollarSign} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title={t('audit.totalPnL')}
            value={`$${audit.pnl.total}`}
            subtitle={`${pnlPercentage >= 0 ? '+' : ''}${audit.pnl.percentage}%`}
            icon={pnlValue >= 0 ? TrendingUp : TrendingDown}
            positive={pnlValue >= 0}
          />
          <MetricCard
            title={t('audit.realized')}
            value={`$${audit.pnl.realized}`}
            icon={DollarSign}
            positive={parseFloat(audit.pnl.realized) >= 0}
          />
          <MetricCard
            title={t('audit.unrealized')}
            value={`$${audit.pnl.unrealized}`}
            icon={ArrowDownUp}
            positive={parseFloat(audit.pnl.unrealized) >= 0}
          />
          <MetricCard
            title={t('audit.equity')}
            value={`$${audit.risk.currentEquity}`}
            icon={DollarSign}
            neutral
          />
        </div>
      </div>

      {/* Risk Section */}
      <div>
        <SectionHeader title={t('audit.riskSection')} icon={Shield} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            title={t('audit.var95')}
            value={`$${audit.risk.var95}`}
            subtitle={t('audit.var95Desc')}
            icon={Shield}
            positive={parseFloat(audit.risk.var95) < 100}
            neutral={parseFloat(audit.risk.var95) === 0}
          />
          <MetricCard
            title={t('audit.expectedShortfall')}
            value={`$${audit.risk.expectedShortfall}`}
            subtitle={t('audit.esDesc')}
            icon={AlertTriangle}
            positive={parseFloat(audit.risk.expectedShortfall) < 150}
            neutral={parseFloat(audit.risk.expectedShortfall) === 0}
          />
          <MetricCard
            title={t('audit.maxDrawdown')}
            value={`${audit.risk.maxDrawdown}%`}
            subtitle={t('audit.drawdownDesc')}
            icon={TrendingDown}
            positive={parseFloat(audit.risk.maxDrawdown) < 5}
            neutral={parseFloat(audit.risk.maxDrawdown) === 0}
          />
        </div>
      </div>

      {/* Costs Section */}
      <div>
        <SectionHeader title={t('audit.costsSection')} icon={DollarSign} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title={t('audit.totalFees')}
            value={`$${audit.costs.totalFees}`}
            icon={DollarSign}
            neutral
          />
          <MetricCard
            title={t('audit.slippage')}
            value={`$${audit.costs.totalSlippage}`}
            icon={ArrowDownUp}
            neutral
          />
          <MetricCard
            title={t('audit.totalCosts')}
            value={`$${audit.costs.totalCosts}`}
            icon={DollarSign}
            positive={false}
          />
          <MetricCard
            title={t('audit.costPerTrade')}
            value={`$${audit.costs.costPerTrade}`}
            icon={BarChart3}
            neutral
          />
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-center text-xs text-muted-foreground pt-4">
        {t('audit.lastUpdated')}: {new Date(audit.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
