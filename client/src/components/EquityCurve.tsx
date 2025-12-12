import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart
} from "recharts";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface DailyReport {
  id: string;
  campaign_id: string;
  report_date: string;
  day_number: number;
  starting_equity: string;
  ending_equity: string;
  daily_pnl: string;
  daily_pnl_percentage: string;
  cumulative_pnl: string;
  cumulative_pnl_percentage: string;
  trades_executed: number;
  winning_trades: number;
  losing_trades: number;
  max_drawdown: string;
  created_at: string;
}

interface EquityCurveProps {
  campaignId: string;
  initialCapital: number;
}

export function EquityCurve({ campaignId, initialCapital }: EquityCurveProps) {
  const { t } = useLanguage();

  const { data: dailyReports, isLoading, isError } = useQuery<DailyReport[]>({
    queryKey: ['/api/campaigns', campaignId, 'daily-reports'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/daily-reports`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch daily reports');
      return res.json();
    },
    enabled: !!campaignId,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-4" />
            <div className="h-48 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('common.error')}</p>
        </CardContent>
      </Card>
    );
  }

  if (!dailyReports || dailyReports.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('equityCurve.noData')}</p>
        </CardContent>
      </Card>
    );
  }

  const sortedReports = [...dailyReports].sort((a, b) => a.day_number - b.day_number);
  
  const chartData = [
    { day: 0, equity: initialCapital, pnl: 0, pnlPct: 0 },
    ...sortedReports.map(report => ({
      day: report.day_number,
      equity: parseFloat(report.ending_equity),
      pnl: parseFloat(report.cumulative_pnl),
      pnlPct: parseFloat(report.cumulative_pnl_percentage),
      dailyPnl: parseFloat(report.daily_pnl),
      trades: report.trades_executed,
      wins: report.winning_trades,
      losses: report.losing_trades
    }))
  ];

  const latestEquity = chartData[chartData.length - 1]?.equity || initialCapital;
  const totalPnL = latestEquity - initialCapital;
  const totalPnLPct = (totalPnL / initialCapital) * 100;
  const isPositive = totalPnL >= 0;

  const minEquity = Math.min(...chartData.map(d => d.equity)) * 0.98;
  const maxEquity = Math.max(...chartData.map(d => d.equity)) * 1.02;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium mb-1">{t('equityCurve.day')} {label}</p>
          <p className="text-muted-foreground">
            {t('equityCurve.equity')}: <span className="font-mono">{formatCurrency(data.equity)}</span>
          </p>
          <p className={data.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
            P&L: <span className="font-mono">{formatCurrency(data.pnl)} ({data.pnlPct >= 0 ? '+' : ''}{data.pnlPct.toFixed(2)}%)</span>
          </p>
          {data.trades !== undefined && data.trades > 0 && (
            <p className="text-muted-foreground text-xs mt-1">
              {data.trades} trades ({data.wins}W / {data.losses}L)
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card data-testid={`equity-curve-${campaignId}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              {t('equityCurve.title')}
            </CardTitle>
            <CardDescription>{t('equityCurve.description')}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isPositive ? 'default' : 'destructive'} className="font-mono">
              {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {isPositive ? '+' : ''}{formatCurrency(totalPnL)} ({isPositive ? '+' : ''}{totalPnLPct.toFixed(2)}%)
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64" data-testid="equity-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="day" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => `D${value}`}
              />
              <YAxis 
                domain={[minEquity, maxEquity]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine 
                y={initialCapital} 
                stroke="#888" 
                strokeDasharray="3 3" 
                label={{ value: 'Initial', position: 'right', fontSize: 10 }}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="none"
                fill="url(#equityGradient)"
              />
              <Line
                type="monotone"
                dataKey="equity"
                stroke={isPositive ? '#22c55e' : '#ef4444'}
                strokeWidth={2}
                dot={{ fill: isPositive ? '#22c55e' : '#ef4444', strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
