import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertCircle, Shield, TrendingDown, TrendingUp, Activity, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const riskFormSchema = z.object({
  max_position_size_percentage: z.string().min(1),
  max_daily_loss_percentage: z.string().min(1),
  max_portfolio_heat_percentage: z.string().min(1),
  circuit_breaker_enabled: z.boolean(),
});

type RiskFormData = z.infer<typeof riskFormSchema>;

interface RiskMetrics {
  circuit_breaker_triggered: boolean;
  circuit_breaker_enabled: boolean;
  daily_pnl_percentage: number;
  max_daily_loss_percentage: number;
  max_position_size_percentage: number;
  max_portfolio_heat_percentage: number;
  current_portfolio_heat_percentage: number;
  total_exposure_usd: number;
  total_risk_usd: number;
  portfolio_value_usd: number;
  open_positions_count: number;
}

export default function RiskManagement() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("");

  const { data: portfolios } = useQuery<any[]>({
    queryKey: ['/api/portfolios'],
  });

  const { data: riskMetrics, isLoading: metricsLoading } = useQuery<RiskMetrics>({
    queryKey: ['/api/risk', selectedPortfolio],
    enabled: !!selectedPortfolio,
  });

  const form = useForm<RiskFormData>({
    resolver: zodResolver(riskFormSchema),
    values: riskMetrics ? {
      max_position_size_percentage: riskMetrics.max_position_size_percentage.toString(),
      max_daily_loss_percentage: riskMetrics.max_daily_loss_percentage.toString(),
      max_portfolio_heat_percentage: riskMetrics.max_portfolio_heat_percentage.toString(),
      circuit_breaker_enabled: riskMetrics.circuit_breaker_enabled,
    } : {
      max_position_size_percentage: "10",
      max_daily_loss_percentage: "5",
      max_portfolio_heat_percentage: "20",
      circuit_breaker_enabled: true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: RiskFormData) => {
      return await apiRequest(`/api/risk/${selectedPortfolio}`, "PUT", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/risk', selectedPortfolio] });
      toast({
        title: t("riskManagement.updateSuccess") || "Risk parameters updated",
        description: t("riskManagement.updateSuccessDesc") || "Your risk management settings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("riskManagement.updateError") || "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetCircuitBreakerMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/risk/${selectedPortfolio}/reset-circuit-breaker`, "POST", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/risk', selectedPortfolio] });
      toast({
        title: t("riskManagement.resetSuccess") || "Circuit breaker reset",
        description: t("riskManagement.resetSuccessDesc") || "Trading has been re-enabled.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("riskManagement.resetError") || "Reset failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RiskFormData) => {
    updateMutation.mutate(data);
  };

  const getHeatColor = (percentage: number, max: number) => {
    const ratio = percentage / max;
    if (ratio > 0.9) return "text-red-500";
    if (ratio > 0.7) return "text-yellow-500";
    return "text-green-500";
  };

  const getDailyPnLColor = (percentage: number) => {
    if (percentage > 0) return "text-green-500";
    if (percentage < 0) return "text-red-500";
    return "text-gray-500";
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl" data-testid="page-risk-management">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            {t("riskManagement.title") || "Risk Management"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("riskManagement.description") || "Configure risk limits and protect your capital"}
          </p>
        </div>
      </div>

      {/* Portfolio Selector */}
      <Card>
        <CardHeader>
          <CardTitle>{t("riskManagement.selectPortfolio") || "Select Portfolio"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedPortfolio} onValueChange={setSelectedPortfolio}>
            <SelectTrigger data-testid="select-portfolio">
              <SelectValue placeholder={t("riskManagement.selectPortfolioPlaceholder") || "Choose a portfolio"} />
            </SelectTrigger>
            <SelectContent>
              {portfolios?.map((portfolio) => (
                <SelectItem key={portfolio.id} value={portfolio.id}>
                  {portfolio.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedPortfolio && riskMetrics && (
        <>
          {/* Circuit Breaker Alert */}
          {riskMetrics.circuit_breaker_triggered && (
            <Alert variant="destructive" data-testid="alert-circuit-breaker">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  {t("riskManagement.circuitBreakerTriggered") || "Circuit Breaker Triggered - Trading Disabled"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resetCircuitBreakerMutation.mutate()}
                  disabled={resetCircuitBreakerMutation.isPending}
                  data-testid="button-reset-circuit-breaker"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t("riskManagement.reset") || "Reset"}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Risk Metrics Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("riskManagement.dailyPnL") || "Daily P&L"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold font-mono ${getDailyPnLColor(riskMetrics.daily_pnl_percentage)}`} data-testid="metric-daily-pnl">
                  {riskMetrics.daily_pnl_percentage > 0 ? "+" : ""}
                  {riskMetrics.daily_pnl_percentage.toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t("riskManagement.limit") || "Limit"}: -{riskMetrics.max_daily_loss_percentage}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("riskManagement.portfolioHeat") || "Portfolio Heat"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold font-mono ${getHeatColor(riskMetrics.current_portfolio_heat_percentage, riskMetrics.max_portfolio_heat_percentage)}`} data-testid="metric-portfolio-heat">
                  {riskMetrics.current_portfolio_heat_percentage.toFixed(1)}%
                </div>
                <Progress
                  value={(riskMetrics.current_portfolio_heat_percentage / riskMetrics.max_portfolio_heat_percentage) * 100}
                  className="mt-2"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {t("riskManagement.max") || "Max"}: {riskMetrics.max_portfolio_heat_percentage}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("riskManagement.totalRisk") || "Total Risk"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono" data-testid="metric-total-risk">
                  ${riskMetrics.total_risk_usd.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t("riskManagement.exposure") || "Exposure"}: ${riskMetrics.total_exposure_usd.toFixed(2)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("riskManagement.openPositions") || "Open Positions"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono" data-testid="metric-open-positions">
                  {riskMetrics.open_positions_count}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t("riskManagement.portfolioValue") || "Portfolio"}: ${riskMetrics.portfolio_value_usd.toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Risk Parameters Form */}
          <Card>
            <CardHeader>
              <CardTitle>{t("riskManagement.configureParameters") || "Configure Risk Parameters"}</CardTitle>
              <CardDescription>
                {t("riskManagement.parametersDesc") || "Set your risk limits to protect your capital"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="max_position_size_percentage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("riskManagement.maxPositionSize") || "Max Position Size (%)"}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="10"
                            {...field}
                            data-testid="input-max-position-size"
                          />
                        </FormControl>
                        <FormDescription>
                          {t("riskManagement.maxPositionSizeDesc") || "Maximum percentage of portfolio value for a single position"}
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="max_daily_loss_percentage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("riskManagement.maxDailyLoss") || "Max Daily Loss (%)"}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="5"
                            {...field}
                            data-testid="input-max-daily-loss"
                          />
                        </FormControl>
                        <FormDescription>
                          {t("riskManagement.maxDailyLossDesc") || "Circuit breaker triggers when daily loss exceeds this limit"}
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="max_portfolio_heat_percentage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("riskManagement.maxPortfolioHeat") || "Max Portfolio Heat (%)"}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="20"
                            {...field}
                            data-testid="input-max-portfolio-heat"
                          />
                        </FormControl>
                        <FormDescription>
                          {t("riskManagement.maxPortfolioHeatDesc") || "Maximum total risk exposure as percentage of portfolio"}
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="circuit_breaker_enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            {t("riskManagement.circuitBreaker") || "Circuit Breaker"}
                          </FormLabel>
                          <FormDescription>
                            {t("riskManagement.circuitBreakerDesc") || "Automatically disable trading when daily loss limit is exceeded"}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-circuit-breaker"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="w-full"
                    data-testid="button-save-parameters"
                  >
                    {updateMutation.isPending ? t("common.saving") || "Saving..." : t("common.save") || "Save Parameters"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </>
      )}

      {!selectedPortfolio && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {t("riskManagement.selectPortfolioPrompt") || "Select a portfolio to manage risk parameters"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
