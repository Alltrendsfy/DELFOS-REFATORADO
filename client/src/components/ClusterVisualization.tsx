import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Target, 
  TrendingUp, 
  Activity,
  Layers,
  Zap
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ClusterData {
  cluster: number;
  count: number;
  tradable: number;
}

interface ClusterSummary {
  totalAssets: number;
  tradableAssets: number;
  clusterCount: number;
  clusters: ClusterData[];
}

interface ClusterVisualizationProps {
  campaignId: string;
}

const CLUSTER_COLORS = [
  { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-600', fill: 'bg-blue-500' },
  { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-600', fill: 'bg-green-500' },
  { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-600', fill: 'bg-purple-500' },
  { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-600', fill: 'bg-orange-500' },
  { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-600', fill: 'bg-cyan-500' },
  { bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'text-pink-600', fill: 'bg-pink-500' },
  { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-600', fill: 'bg-yellow-500' },
  { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-600', fill: 'bg-red-500' },
];

export function ClusterVisualization({ campaignId }: ClusterVisualizationProps) {
  const { t } = useLanguage();

  const { data: clusterSummary, isLoading, isError } = useQuery<ClusterSummary>({
    queryKey: ['/api/campaigns', campaignId, 'cluster-summary'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/cluster-summary`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch cluster summary');
      return res.json();
    },
    enabled: !!campaignId,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="flex gap-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-20 bg-muted rounded flex-1" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-muted-foreground">
          <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('common.error')}</p>
        </CardContent>
      </Card>
    );
  }

  if (!clusterSummary || clusterSummary.clusters.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-muted-foreground">
          <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('cluster.noData')}</p>
        </CardContent>
      </Card>
    );
  }

  const { totalAssets, tradableAssets, clusterCount, clusters } = clusterSummary;
  const tradablePercentage = totalAssets > 0 ? (tradableAssets / totalAssets) * 100 : 0;

  return (
    <Card data-testid={`cluster-visualization-${campaignId}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              {t('cluster.title')}
            </CardTitle>
            <CardDescription className="text-xs">
              {t('cluster.description')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t('cluster.totalAssets')}</p>
              <p className="font-mono font-medium">{totalAssets}</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t('cluster.tradable')}</p>
              <p className="font-mono font-medium text-green-600">{tradableAssets}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t('cluster.tradableRatio')}</span>
            <span className="font-mono">{tradablePercentage.toFixed(1)}%</span>
          </div>
          <Progress value={tradablePercentage} className="h-2" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {clusters.map((cluster, index) => {
            const colors = CLUSTER_COLORS[index % CLUSTER_COLORS.length];
            const clusterPct = totalAssets > 0 ? (cluster.count / totalAssets) * 100 : 0;
            const tradablePct = cluster.count > 0 ? (cluster.tradable / cluster.count) * 100 : 0;
            
            return (
              <div
                key={cluster.cluster}
                className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}
                data-testid={`cluster-card-${cluster.cluster}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${colors.text}`}
                    data-testid={`cluster-badge-${cluster.cluster}`}
                  >
                    C{cluster.cluster}
                  </Badge>
                  <span 
                    className="text-xs font-mono text-muted-foreground"
                    data-testid={`cluster-pct-${cluster.cluster}`}
                  >
                    {clusterPct.toFixed(0)}%
                  </span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3 text-muted-foreground" />
                    <span 
                      className="text-sm font-medium"
                      data-testid={`cluster-count-${cluster.cluster}`}
                    >
                      {cluster.count}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('cluster.assets')}</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-green-500" />
                    <span 
                      className="text-sm font-medium text-green-600"
                      data-testid={`cluster-tradable-${cluster.cluster}`}
                    >
                      {cluster.tradable}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('cluster.active')}</span>
                  </div>
                </div>

                <div className="mt-2">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${colors.fill} transition-all duration-300`}
                      style={{ width: `${tradablePct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-4 pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            <span data-testid={`cluster-active-count-${campaignId}`}>{clusterCount} {t('cluster.clustersActive')}</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span>{t('cluster.kmeansGrouping')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
