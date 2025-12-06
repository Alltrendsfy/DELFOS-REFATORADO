import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertCircle, CheckCircle, XCircle, RefreshCw, Shield } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface AssetBreaker {
  id: string;
  symbol: string;
  is_triggered: boolean;
  trigger_reason: string | null;
  consecutive_losses: number;
  total_loss_amount: string;
  triggered_at: string | null;
  auto_reset_at: string | null;
}

interface ClusterBreaker {
  id: string;
  cluster_number: number;
  is_triggered: boolean;
  trigger_reason: string | null;
  aggregate_loss_percentage: string;
  affected_assets_count: number;
  triggered_at: string | null;
  auto_reset_at: string | null;
}

interface CircuitBreakersData {
  asset_breakers: AssetBreaker[];
  cluster_breakers: ClusterBreaker[];
  global_breaker: {
    triggered: boolean;
    enabled: boolean;
  };
}

export default function CircuitBreakers() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("");

  const { data: portfolios } = useQuery<any[]>({
    queryKey: ['/api/portfolios'],
  });

  const { data: breakers, isLoading } = useQuery<CircuitBreakersData>({
    queryKey: ['/api/circuit-breakers', selectedPortfolio],
    enabled: !!selectedPortfolio,
  });

  // Auto-select first portfolio
  useEffect(() => {
    if (portfolios && portfolios.length > 0 && !selectedPortfolio) {
      setSelectedPortfolio(portfolios[0].id);
    }
  }, [portfolios, selectedPortfolio]);

  const resetAssetMutation = useMutation({
    mutationFn: async (symbol: string) => {
      return await apiRequest("/api/circuit-breakers/asset/reset", "POST", {
        portfolioId: selectedPortfolio,
        symbol,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/circuit-breakers', selectedPortfolio] });
      toast({ title: t("success"), description: t("assetBreakerReset") });
    },
    onError: () => {
      toast({ title: t("error"), description: t("resetFailed"), variant: "destructive" });
    },
  });

  const resetClusterMutation = useMutation({
    mutationFn: async (clusterNumber: number) => {
      return await apiRequest("/api/circuit-breakers/cluster/reset", "POST", {
        portfolioId: selectedPortfolio,
        clusterNumber,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/circuit-breakers', selectedPortfolio] });
      toast({ title: t("success"), description: t("clusterBreakerReset") });
    },
    onError: () => {
      toast({ title: t("error"), description: t("resetFailed"), variant: "destructive" });
    },
  });

  const resetGlobalMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/circuit-breakers/global/reset", "POST", {
        portfolioId: selectedPortfolio,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/circuit-breakers', selectedPortfolio] });
      toast({ title: t("success"), description: t("globalBreakerReset") });
    },
    onError: () => {
      toast({ title: t("error"), description: t("resetFailed"), variant: "destructive" });
    },
  });

  const triggeredAssets = breakers?.asset_breakers.filter(b => b.is_triggered) || [];
  const triggeredClusters = breakers?.cluster_breakers.filter(b => b.is_triggered) || [];

  // Handle empty portfolio state
  if (portfolios && portfolios.length === 0) {
    return (
      <div className="container mx-auto p-6 space-y-6" data-testid="page-circuit-breakers">
        <div>
          <h1 className="text-3xl font-bold mb-2">Circuit Breakers</h1>
          <p className="text-muted-foreground">
            {t("circuitBreakersDescription") || "3-layer protection system: Asset → Cluster → Global"}
          </p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No portfolios found. Please create a portfolio first to manage circuit breakers.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-circuit-breakers">
      <div>
        <h1 className="text-3xl font-bold mb-2">Circuit Breakers</h1>
        <p className="text-muted-foreground">
          {t("circuitBreakersDescription") || "3-layer protection system: Asset → Cluster → Global"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Portfolio</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedPortfolio} onValueChange={setSelectedPortfolio}>
            <SelectTrigger data-testid="select-portfolio">
              <SelectValue placeholder={t("selectPortfolio") || "Select Portfolio"} />
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

      {selectedPortfolio && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Global Breaker</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  {breakers?.global_breaker.triggered ? (
                    <Badge variant="destructive" data-testid="badge-global-triggered">
                      <XCircle className="mr-1 h-3 w-3" />
                      Triggered
                    </Badge>
                  ) : (
                    <Badge variant="secondary" data-testid="badge-global-ok">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Active
                    </Badge>
                  )}
                  {breakers?.global_breaker.triggered && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resetGlobalMutation.mutate()}
                      disabled={resetGlobalMutation.isPending}
                      data-testid="button-reset-global"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Asset Breakers</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="count-asset-breakers">
                  {triggeredAssets.length}
                </div>
                <p className="text-xs text-muted-foreground">Blocked symbols</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cluster Breakers</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="count-cluster-breakers">
                  {triggeredClusters.length}
                </div>
                <p className="text-xs text-muted-foreground">Blocked clusters</p>
              </CardContent>
            </Card>
          </div>

          {(triggeredAssets.length > 0 || triggeredClusters.length > 0) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription data-testid="alert-breakers-active">
                Circuit breakers active: Trading may be blocked on some assets
              </AlertDescription>
            </Alert>
          )}

          {triggeredAssets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Asset Breakers</CardTitle>
                <CardDescription>Individual symbols blocked due to consecutive losses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {triggeredAssets.map((breaker) => (
                    <div
                      key={breaker.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`asset-breaker-${breaker.symbol}`}
                    >
                      <div className="flex-1">
                        <div className="font-semibold">{breaker.symbol}</div>
                        <div className="text-sm text-muted-foreground">{breaker.trigger_reason}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Losses: {breaker.consecutive_losses} • Total: ${breaker.total_loss_amount}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resetAssetMutation.mutate(breaker.symbol)}
                        disabled={resetAssetMutation.isPending}
                        data-testid={`button-reset-asset-${breaker.symbol}`}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Reset
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {triggeredClusters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cluster Breakers</CardTitle>
                <CardDescription>K-means clusters blocked due to aggregate losses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {triggeredClusters.map((breaker) => (
                    <div
                      key={breaker.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`cluster-breaker-${breaker.cluster_number}`}
                    >
                      <div className="flex-1">
                        <div className="font-semibold">Cluster {breaker.cluster_number}</div>
                        <div className="text-sm text-muted-foreground">{breaker.trigger_reason}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Loss: {(parseFloat(breaker.aggregate_loss_percentage) * 100).toFixed(2)}% •
                          Assets: {breaker.affected_assets_count}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resetClusterMutation.mutate(breaker.cluster_number)}
                        disabled={resetClusterMutation.isPending}
                        data-testid={`button-reset-cluster-${breaker.cluster_number}`}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Reset
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {!isLoading && triggeredAssets.length === 0 && triggeredClusters.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>No circuit breakers triggered</p>
                  <p className="text-sm mt-1">All systems operational</p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
