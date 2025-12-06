import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Play,
  History,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Shield,
  Activity,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  ChevronRight,
  DollarSign,
  Percent,
  LineChart
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface BacktestRun {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  start_date: string;
  end_date: string;
  initial_capital: string;
  symbols: string[];
  apply_breakers: boolean;
  total_trades?: number;
  final_equity?: string;
  total_pnl?: string;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

interface BacktestMetrics {
  hit_rate: string;
  profit_factor: string;
  payoff_ratio: string;
  expectancy: string;
  avg_win: string;
  avg_loss: string;
  sharpe_ratio?: string;
  sortino_ratio?: string;
  var_95: string;
  var_99: string;
  es_95: string;
  es_99?: string;
  max_drawdown: string;
  turnover: string;
  total_fees: string;
  total_slippage: string;
  cost_drag: string;
  monte_carlo_results?: {
    mean_final_equity: number;
    std_final_equity: number;
    prob_positive_pnl: number;
    prob_exceed_10_dd: number;
    ci_lower_95: number;
    ci_upper_95: number;
    scenarios: number;
  };
  validation?: {
    es95_improved: boolean;
    var99_improved: boolean;
    pnl_positive: boolean;
    passed: boolean;
    notes: string[];
  };
  breaker_stats?: {
    asset_triggered: number;
    cluster_triggered: number;
    global_triggered: number;
    trades_blocked: number;
  };
}

interface BacktestTrade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  entry_price: string;
  exit_price: string;
  entry_time: string;
  exit_time: string;
  pnl: string;
  exit_reason: string;
}

interface BacktestResults {
  run: BacktestRun;
  metrics: BacktestMetrics | null;
  trades: BacktestTrade[];
  tradesCount: number;
}

function MetricCard({
  label,
  value,
  icon: Icon,
  positive,
  neutral,
  percentage,
}: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  positive?: boolean;
  neutral?: boolean;
  percentage?: boolean;
}) {
  const colorClass = neutral
    ? "text-muted-foreground"
    : positive
      ? "text-emerald-500"
      : "text-rose-500";

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-lg font-bold ${colorClass}`}>
          {value}{percentage ? "%" : ""}
        </p>
      </div>
      <div className={`p-2 rounded-lg bg-muted ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BacktestRun["status"] }) {
  const { t } = useLanguage();
  
  const config = {
    pending: { variant: "secondary" as const, icon: Loader2, label: t("backtest.pending") },
    running: { variant: "default" as const, icon: Loader2, label: t("backtest.running") },
    completed: { variant: "outline" as const, icon: CheckCircle2, label: t("backtest.completed") },
    failed: { variant: "destructive" as const, icon: XCircle, label: t("backtest.failed") },
  };

  const { variant, icon: Icon, label } = config[status];
  
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
      {label}
    </Badge>
  );
}

export default function Backtest() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    start_date: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
    initial_capital: "10000",
    symbols: "BTC/USD, ETH/USD",
    apply_breakers: true,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ runs: BacktestRun[] }>({
    queryKey: ["/api/backtest/history"],
    refetchInterval: 5000,
  });

  const { data: resultsData, isLoading: resultsLoading } = useQuery<BacktestResults>({
    queryKey: ["/api/backtest", selectedRunId, "results"],
    enabled: !!selectedRunId,
  });

  const runBacktestMutation = useMutation({
    mutationFn: async (data: typeof formData): Promise<{ id: string }> => {
      const symbols = data.symbols.split(",").map(s => s.trim()).filter(Boolean);
      return apiRequest("/api/backtest/run", "POST", {
        name: data.name || `Backtest ${format(new Date(), "yyyy-MM-dd HH:mm")}`,
        start_date: data.start_date,
        end_date: data.end_date,
        initial_capital: data.initial_capital,
        symbols,
        apply_breakers: data.apply_breakers,
      }) as Promise<{ id: string }>;
    },
    onSuccess: (result) => {
      toast({
        title: t("common.success"),
        description: t("backtest.running"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/backtest/history"] });
      setSelectedRunId(result.id);
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : "Failed to start backtest",
        variant: "destructive",
      });
    },
  });

  const deleteBacktestMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/backtest/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: t("common.success"),
        description: "Backtest deleted",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/backtest/history"] });
      if (selectedRunId) {
        setSelectedRunId(null);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runBacktestMutation.mutate(formData);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-backtest-title">
            {t("backtest.title")}
          </h1>
          <p className="text-muted-foreground">{t("backtest.subtitle")}</p>
        </div>
      </div>

      <Tabs defaultValue="new" className="space-y-6">
        <TabsList>
          <TabsTrigger value="new" className="gap-2" data-testid="tab-new-backtest">
            <Play className="h-4 w-4" />
            {t("backtest.newBacktest")}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2" data-testid="tab-history">
            <History className="h-4 w-4" />
            {t("backtest.history")}
          </TabsTrigger>
          {selectedRunId && (
            <TabsTrigger value="results" className="gap-2" data-testid="tab-results">
              <BarChart3 className="h-4 w-4" />
              {t("backtest.results")}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="new">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                {t("backtest.configuration")}
              </CardTitle>
              <CardDescription>
                {t("backtest.subtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("backtest.name")}</Label>
                    <Input
                      id="name"
                      placeholder={t("backtest.namePlaceholder")}
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      data-testid="input-backtest-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="initial_capital">{t("backtest.initialCapital")}</Label>
                    <Input
                      id="initial_capital"
                      type="number"
                      value={formData.initial_capital}
                      onChange={(e) => setFormData({ ...formData, initial_capital: e.target.value })}
                      data-testid="input-initial-capital"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="start_date">{t("backtest.startDate")}</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">{t("backtest.endDate")}</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      data-testid="input-end-date"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="symbols">{t("backtest.symbols")}</Label>
                  <Input
                    id="symbols"
                    placeholder={t("backtest.symbolsPlaceholder")}
                    value={formData.symbols}
                    onChange={(e) => setFormData({ ...formData, symbols: e.target.value })}
                    data-testid="input-symbols"
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <Label htmlFor="apply_breakers" className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      {t("backtest.applyBreakers")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("backtest.applyBreakersDesc")}
                    </p>
                  </div>
                  <Switch
                    id="apply_breakers"
                    checked={formData.apply_breakers}
                    onCheckedChange={(checked) => setFormData({ ...formData, apply_breakers: checked })}
                    data-testid="switch-apply-breakers"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={runBacktestMutation.isPending}
                  data-testid="button-run-backtest"
                >
                  {runBacktestMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("backtest.running")}
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      {t("backtest.runBacktest")}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                {t("backtest.history")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !historyData?.runs?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t("backtest.noBacktests")}
                </div>
              ) : (
                <div className="space-y-3">
                  {historyData.runs.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover-elevate cursor-pointer"
                      onClick={() => {
                        setSelectedRunId(run.id);
                        const tabTrigger = document.querySelector('[value="results"]') as HTMLButtonElement;
                        if (tabTrigger) tabTrigger.click();
                      }}
                      data-testid={`card-backtest-${run.id}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{run.name}</span>
                          <StatusBadge status={run.status} />
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{run.symbols.join(", ")}</span>
                          <span>{run.start_date} - {run.end_date}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {run.status === "completed" && run.total_pnl && (
                          <span className={`font-bold ${parseFloat(run.total_pnl) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            ${parseFloat(run.total_pnl).toFixed(2)}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBacktestMutation.mutate(run.id);
                          }}
                          data-testid={`button-delete-${run.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results">
          {resultsLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !resultsData ? (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                Select a backtest to view results
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{resultsData.run.name}</CardTitle>
                      <CardDescription>
                        {resultsData.run.start_date} - {resultsData.run.end_date}
                      </CardDescription>
                    </div>
                    <StatusBadge status={resultsData.run.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  {resultsData.run.status === "running" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>{t("backtest.progress")}</span>
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                      <Progress value={undefined} className="h-2" />
                    </div>
                  )}
                  {resultsData.run.status === "failed" && resultsData.run.error_message && (
                    <div className="p-3 bg-destructive/10 rounded-lg text-destructive">
                      <AlertTriangle className="h-4 w-4 inline mr-2" />
                      {resultsData.run.error_message}
                    </div>
                  )}
                </CardContent>
              </Card>

              {resultsData.metrics && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        {t("backtest.metrics.title")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <MetricCard
                          label={t("backtest.metrics.hitRate")}
                          value={resultsData.metrics.hit_rate}
                          icon={Target}
                          positive={parseFloat(resultsData.metrics.hit_rate) >= 50}
                          percentage
                        />
                        <MetricCard
                          label={t("backtest.metrics.profitFactor")}
                          value={resultsData.metrics.profit_factor}
                          icon={TrendingUp}
                          positive={parseFloat(resultsData.metrics.profit_factor) >= 1}
                        />
                        <MetricCard
                          label={t("backtest.metrics.avgWin")}
                          value={`$${resultsData.metrics.avg_win}`}
                          icon={TrendingUp}
                          positive
                        />
                        <MetricCard
                          label={t("backtest.metrics.avgLoss")}
                          value={`$${resultsData.metrics.avg_loss}`}
                          icon={TrendingDown}
                          positive={false}
                        />
                        <MetricCard
                          label={t("backtest.metrics.var95")}
                          value={`$${resultsData.metrics.var_95}`}
                          icon={Shield}
                          neutral
                        />
                        <MetricCard
                          label={t("backtest.metrics.es95")}
                          value={`$${resultsData.metrics.es_95}`}
                          icon={AlertTriangle}
                          neutral
                        />
                        <MetricCard
                          label={t("backtest.metrics.maxDrawdown")}
                          value={resultsData.metrics.max_drawdown}
                          icon={TrendingDown}
                          positive={parseFloat(resultsData.metrics.max_drawdown) <= 10}
                          percentage
                        />
                        <MetricCard
                          label={t("backtest.metrics.costDrag")}
                          value={resultsData.metrics.cost_drag}
                          icon={DollarSign}
                          neutral
                          percentage
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {resultsData.metrics.monte_carlo_results && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <LineChart className="h-5 w-5 text-primary" />
                          {t("backtest.monteCarlo.title")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          <MetricCard
                            label={t("backtest.monteCarlo.scenarios")}
                            value={resultsData.metrics.monte_carlo_results.scenarios}
                            icon={Activity}
                            neutral
                          />
                          <MetricCard
                            label={t("backtest.monteCarlo.meanEquity")}
                            value={`$${resultsData.metrics.monte_carlo_results.mean_final_equity.toFixed(2)}`}
                            icon={DollarSign}
                            positive={resultsData.metrics.monte_carlo_results.mean_final_equity > parseFloat(resultsData.run.initial_capital)}
                          />
                          <MetricCard
                            label={t("backtest.monteCarlo.probPositive")}
                            value={(resultsData.metrics.monte_carlo_results.prob_positive_pnl * 100).toFixed(1)}
                            icon={Percent}
                            positive={resultsData.metrics.monte_carlo_results.prob_positive_pnl >= 0.5}
                            percentage
                          />
                          <MetricCard
                            label={t("backtest.monteCarlo.probExceed10DD")}
                            value={(resultsData.metrics.monte_carlo_results.prob_exceed_10_dd * 100).toFixed(1)}
                            icon={AlertTriangle}
                            positive={resultsData.metrics.monte_carlo_results.prob_exceed_10_dd < 0.2}
                            percentage
                          />
                          <div className="md:col-span-2 p-3 border rounded-lg">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                              {t("backtest.monteCarlo.confidenceInterval")}
                            </p>
                            <p className="text-lg font-bold">
                              ${resultsData.metrics.monte_carlo_results.ci_lower_95.toFixed(2)} - ${resultsData.metrics.monte_carlo_results.ci_upper_95.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {resultsData.metrics.validation && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          {resultsData.metrics.validation.passed ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-rose-500" />
                          )}
                          {t("backtest.validation.title")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className={`p-4 rounded-lg ${resultsData.metrics.validation.passed ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
                            <p className={`font-bold text-lg ${resultsData.metrics.validation.passed ? "text-emerald-500" : "text-rose-500"}`}>
                              {resultsData.metrics.validation.passed ? t("backtest.validation.passed") : t("backtest.validation.failed")}
                            </p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="flex items-center gap-2 p-3 border rounded-lg">
                              {resultsData.metrics.validation.es95_improved ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                              ) : (
                                <XCircle className="h-5 w-5 text-rose-500" />
                              )}
                              <span className="text-sm">{t("backtest.validation.es95Improved")}</span>
                            </div>
                            <div className="flex items-center gap-2 p-3 border rounded-lg">
                              {resultsData.metrics.validation.var99_improved ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                              ) : (
                                <XCircle className="h-5 w-5 text-rose-500" />
                              )}
                              <span className="text-sm">{t("backtest.validation.var99Improved")}</span>
                            </div>
                            <div className="flex items-center gap-2 p-3 border rounded-lg">
                              {resultsData.metrics.validation.pnl_positive ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                              ) : (
                                <XCircle className="h-5 w-5 text-rose-500" />
                              )}
                              <span className="text-sm">{t("backtest.validation.pnlPositive")}</span>
                            </div>
                          </div>
                          {resultsData.metrics.validation.notes.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">{t("backtest.validation.notes")}</p>
                              <ul className="text-sm text-muted-foreground space-y-1">
                                {resultsData.metrics.validation.notes.map((note, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    {note}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {resultsData.metrics.breaker_stats && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Shield className="h-5 w-5 text-primary" />
                          {t("backtest.breakers.title")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 md:grid-cols-4">
                          <MetricCard
                            label={t("backtest.breakers.assetTriggered")}
                            value={resultsData.metrics.breaker_stats.asset_triggered}
                            icon={Shield}
                            neutral
                          />
                          <MetricCard
                            label={t("backtest.breakers.clusterTriggered")}
                            value={resultsData.metrics.breaker_stats.cluster_triggered}
                            icon={Shield}
                            neutral
                          />
                          <MetricCard
                            label={t("backtest.breakers.globalTriggered")}
                            value={resultsData.metrics.breaker_stats.global_triggered}
                            icon={AlertTriangle}
                            neutral
                          />
                          <MetricCard
                            label={t("backtest.breakers.tradesBlocked")}
                            value={resultsData.metrics.breaker_stats.trades_blocked}
                            icon={XCircle}
                            neutral
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {resultsData.trades.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      {t("backtest.trades.title")} ({resultsData.tradesCount})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("backtest.trades.symbol")}</TableHead>
                          <TableHead>{t("backtest.trades.side")}</TableHead>
                          <TableHead>{t("backtest.trades.entry")}</TableHead>
                          <TableHead>{t("backtest.trades.exit")}</TableHead>
                          <TableHead className="text-right">{t("backtest.trades.pnl")}</TableHead>
                          <TableHead>{t("backtest.trades.reason")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resultsData.trades.slice(0, 20).map((trade) => (
                          <TableRow key={trade.id}>
                            <TableCell className="font-medium">{trade.symbol}</TableCell>
                            <TableCell>
                              <Badge variant={trade.side === "buy" ? "default" : "secondary"}>
                                {trade.side.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell>${parseFloat(trade.entry_price).toFixed(2)}</TableCell>
                            <TableCell>${parseFloat(trade.exit_price).toFixed(2)}</TableCell>
                            <TableCell className={`text-right font-bold ${parseFloat(trade.pnl) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                              ${parseFloat(trade.pnl).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{trade.exit_reason}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
