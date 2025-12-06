import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, Loader2, TrendingUp, Target } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { ClusterScatterPlot } from "@/components/charts/ClusterScatterPlot";
import { FilterPanel, FilterConfig, DEFAULT_FILTERS } from "@/components/filters/FilterPanel";
import type { SymbolRanking } from "@shared/schema";

interface ClusteredAsset {
  symbol: string;
  exchange_symbol: string;
  volume_24h_usd: number;
  spread_mid_pct: number;
  depth_top10_usd: number;
  atr_daily_pct: number;
  cluster_number: number;
  rank: number;
  score: number;
}

interface SelectionResult {
  message: string;
  run_id: string;
  selected_count: number;
  cluster_count: number;
  assets: ClusteredAsset[];
  clusters: {
    cluster_number: number;
    assets: string[];
    avg_metrics: {
      volume: number;
      spread: number;
      depth: number;
      atr: number;
    };
  }[];
}

export default function AssetSelection() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterConfig>({
    minVolume24hUSD: 5_000_000, // $5M aligned with backend default
    maxSpreadPct: 0.10, // 10% aligned with backend default  
    minDepthUSD: 100_000, // $100K aligned with backend default
    minATRPct: 0.01, // 1% aligned with backend default
  });

  // Helper to replace placeholders in translations
  const replacePlaceholders = (text: string, values: Record<string, any>) => {
    let result = text;
    Object.entries(values).forEach(([key, value]) => {
      result = result.replace(`{${key}}`, String(value));
    });
    return result;
  };

  // First save filters, then run selection
  const saveFiltersMutation = useMutation({
    mutationFn: async (filtersToSave: FilterConfig) => {
      const serverFormat = {
        min_volume_24h_usd: filtersToSave.minVolume24hUSD.toString(),
        max_spread_mid_pct: filtersToSave.maxSpreadPct.toString(),
        min_depth_top10_usd: filtersToSave.minDepthUSD.toString(),
        min_atr_daily_pct: filtersToSave.minATRPct.toString(),
      };
      return await apiRequest("/api/asset-selection/filters", "POST", serverFormat);
    },
  });

  // Mutation to run asset selection
  const runSelection = useMutation({
    mutationFn: async () => {
      // Save filters first
      await saveFiltersMutation.mutateAsync(filters);
      // Then run selection
      return await apiRequest<SelectionResult>("/api/asset-selection/run", "POST", {});
    },
    onSuccess: (data) => {
      setLastRunId(data.run_id);
      localStorage.setItem("lastAssetSelectionRunId", data.run_id);
      toast({
        title: t('assets.success_title'),
        description: replacePlaceholders(t('assets.success_message'), {
          selected: data.selected_count,
          total: data.selected_count,
          clusters: data.cluster_count,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/asset-selection/selected'] });
    },
    onError: (error: any) => {
      toast({
        title: t('assets.error_title'),
        description: error.message || t('assets.error_message'),
        variant: "destructive",
      });
    },
  });

  // Load last runId from localStorage on mount
  useEffect(() => {
    const savedRunId = localStorage.getItem("lastAssetSelectionRunId");
    if (savedRunId) {
      setLastRunId(savedRunId);
    }
  }, []);

  // Query to fetch selected assets
  const { data: selectedData, isLoading: loadingRankings } = useQuery<{
    assets: SymbolRanking[];
    count: number;
  }>({
    queryKey: ['/api/asset-selection/selected'],
  });

  const rankings = selectedData?.assets || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b bg-background p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('assets.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('assets.description')}
            </p>
          </div>
          <Button
            onClick={() => runSelection.mutate()}
            disabled={runSelection.isPending}
            size="lg"
            className="gap-2"
            data-testid="button-run-selection"
          >
            {runSelection.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('assets.running')}
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                {t('assets.run_button')}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <FilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          onReset={() => setFilters(DEFAULT_FILTERS)}
        />

        {runSelection.isPending && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center space-y-4 py-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <div className="text-center space-y-2">
                  <p className="text-lg font-medium">{t('assets.running_title')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('assets.running_description')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {lastRunId && !runSelection.isPending && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card data-testid="card-run-id">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('assets.run_id')}</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xs font-mono text-muted-foreground truncate">
                    {lastRunId}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-selected">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('assets.assets_selected')}</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono" data-testid="text-selected-count">
                    {rankings.length}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-clusters">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('assets.clusters')}</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono" data-testid="text-cluster-count">
                    {new Set(rankings.map(r => r.cluster_number).filter(c => c !== null)).size}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-timestamp">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('assets.last_run')}</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">
                    {rankings.length > 0
                      ? new Date(rankings[0].created_at).toLocaleString()
                      : t('assets.never')}
                  </div>
                </CardContent>
              </Card>
            </div>

            {rankings.length > 0 && (
              <ClusterScatterPlot rankings={rankings} />
            )}

            <Card>
              <CardHeader>
                <CardTitle>{t('assets.top_100_title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingRankings ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : rankings.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">{t('assets.no_rankings')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">{t('assets.rank')}</TableHead>
                          <TableHead>{t('assets.symbol')}</TableHead>
                          <TableHead className="text-right">{t('assets.score')}</TableHead>
                          <TableHead className="text-center">{t('assets.cluster')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rankings.map((ranking: any) => (
                          <TableRow key={ranking.id} data-testid={`row-ranking-${ranking.rank}`}>
                            <TableCell className="font-medium font-mono">
                              #{ranking.rank}
                            </TableCell>
                            <TableCell className="font-semibold">
                              {ranking.symbol || ranking.symbol_id}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {parseFloat(ranking.score).toFixed(3)}
                            </TableCell>
                            <TableCell className="text-center">
                              {ranking.cluster_number !== null ? (
                                <Badge variant="outline" data-testid={`badge-cluster-${ranking.rank}`}>
                                  {t('assets.cluster_prefix')}{ranking.cluster_number}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">{t('assets.no_cluster')}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!lastRunId && !runSelection.isPending && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center space-y-4 py-12">
                <Target className="h-16 w-16 text-muted-foreground" />
                <div className="text-center space-y-2">
                  <p className="text-lg font-medium text-muted-foreground">
                    {t('assets.no_data')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
