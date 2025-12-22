import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Database, BarChart3, Layers, Activity, RefreshCw, Search, 
  CheckCircle2, XCircle, AlertTriangle, TrendingUp, TrendingDown,
  Zap, Shield, Eye
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type VolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

interface AssetFeatureVector {
  symbol: string;
  cluster_id: number;
  cluster_name: string;
  timestamp: string;
  vre: {
    regime: VolatilityRegime;
    z_score: number;
    rv_ratio: number;
    confidence: number;
  };
  liquidity: {
    spread_pct: number;
    depth_usd: number;
    volume_ratio_1h: number;
  };
  momentum: {
    rsi_14: number;
    macd_signal: number;
    trend_strength: number;
  };
  risk: {
    atr_14: number;
    volatility_30d: number;
    max_drawdown_7d: number;
    sharpe_estimate: number;
    correlation_btc: number;
  };
  composite_score: number;
  opportunity_eligible: boolean;
}

interface ClusterAggregate {
  cluster_id: number;
  cluster_name: string;
  asset_count: number;
  eligible_count: number;
  avg_composite_score: number;
  cluster_opportunity_score: number;
  top_assets: string[];
  timestamp: string;
}

interface SemanticCluster {
  id: number;
  name: string;
  description: string;
  characteristics: string[];
}

const REGIME_COLORS: Record<VolatilityRegime, { bg: string; text: string; border: string }> = {
  LOW: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
  NORMAL: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
  HIGH: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
  EXTREME: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
};

const CLUSTER_COLORS: Record<number, { badge: string; border: string }> = {
  1: { badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30', border: 'border-blue-500' },
  2: { badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30', border: 'border-cyan-500' },
  3: { badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30', border: 'border-red-500' },
  4: { badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30', border: 'border-green-500' },
  5: { badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30', border: 'border-purple-500' },
  6: { badge: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30', border: 'border-pink-500' },
  7: { badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30', border: 'border-indigo-500' },
  8: { badge: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30', border: 'border-gray-500' },
  9: { badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30', border: 'border-amber-500' },
  10: { badge: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30', border: 'border-slate-500' },
};

function RegimeBadge({ regime, t }: { regime: VolatilityRegime; t: (key: string) => string }) {
  const colors = REGIME_COLORS[regime];
  const labels: Record<VolatilityRegime, string> = {
    LOW: t('vre.regimeLow') || 'Low',
    NORMAL: t('vre.regimeNormal') || 'Normal',
    HIGH: t('vre.regimeHigh') || 'High',
    EXTREME: t('vre.regimeExtreme') || 'Extreme'
  };
  return (
    <Badge variant="outline" className={`${colors.bg} ${colors.text} ${colors.border} font-medium`}>
      {labels[regime]}
    </Badge>
  );
}

function ClusterBadge({ clusterId, name }: { clusterId: number; name: string }) {
  const colors = CLUSTER_COLORS[clusterId] || CLUSTER_COLORS[10];
  return (
    <Badge variant="outline" className={`${colors.badge} font-medium`}>
      {clusterId}. {name}
    </Badge>
  );
}

function ScoreIndicator({ score, label }: { score: number; label: string }) {
  const colorClass = score >= 0.7 ? 'bg-green-500' : score >= 0.5 ? 'bg-blue-500' : score >= 0.3 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{(score * 100).toFixed(1)}%</span>
      </div>
      <Progress value={score * 100} className="h-1.5" />
    </div>
  );
}

function HealthBadge({ status, t }: { status: 'healthy' | 'degraded' | 'offline'; t: (key: string) => string }) {
  const config = {
    healthy: { icon: CheckCircle2, class: 'bg-green-500/10 text-green-600 border-green-500/30', label: t('fs.healthy') },
    degraded: { icon: AlertTriangle, class: 'bg-orange-500/10 text-orange-600 border-orange-500/30', label: t('fs.degraded') },
    offline: { icon: XCircle, class: 'bg-red-500/10 text-red-600 border-red-500/30', label: t('fs.offline') },
  };
  const { icon: Icon, class: colorClass, label } = config[status];
  return (
    <Badge variant="outline" className={`${colorClass} font-medium`}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
    </Badge>
  );
}

function AssetFeatureCard({ asset, t }: { asset: AssetFeatureVector; t: (key: string) => string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Card className="cursor-pointer hover-elevate">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{asset.symbol}</span>
                {asset.opportunity_eligible && (
                  <Badge variant="default" className="bg-green-500 text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {t('fs.eligible')}
                  </Badge>
                )}
              </div>
              <RegimeBadge regime={asset.vre.regime} t={t} />
            </div>
            
            <div className="flex items-center gap-2 mb-3">
              <ClusterBadge clusterId={asset.cluster_id} name={asset.cluster_name} />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <ScoreIndicator score={asset.composite_score} label={t('fs.compositeScore')} />
              <ScoreIndicator score={asset.vre.confidence} label={t('fs.confidence')} />
            </div>
            
            <div className="mt-3 pt-3 border-t flex justify-between text-xs text-muted-foreground">
              <span>{t('fs.zScore')}: {asset.vre.z_score.toFixed(2)}</span>
              <span>{t('fs.spreadPct')}: {(asset.liquidity.spread_pct * 100).toFixed(3)}%</span>
            </div>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            {t('fs.featureVector')}: {asset.symbol}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4" />
                {t('fs.regime')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.regime')}</span><RegimeBadge regime={asset.vre.regime} t={t} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.zScore')}</span><span className="font-mono">{asset.vre.z_score.toFixed(3)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.confidence')}</span><span className="font-mono">{(asset.vre.confidence * 100).toFixed(1)}%</span></div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                {t('fs.liquidity')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.spreadPct')}</span><span className="font-mono">{(asset.liquidity.spread_pct * 100).toFixed(4)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.depth')}</span><span className="font-mono">${asset.liquidity.depth_usd.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.volumeRatio')}</span><span className="font-mono">{asset.liquidity.volume_ratio_1h.toFixed(2)}x</span></div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                {t('fs.momentum')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.rsi14')}</span><span className="font-mono">{asset.momentum.rsi_14.toFixed(1)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.macdSignal')}</span><span className="font-mono">{asset.momentum.macd_signal > 0 ? '+' : ''}{asset.momentum.macd_signal.toFixed(4)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.trendStrength')}</span><span className="font-mono">{(asset.momentum.trend_strength * 100).toFixed(1)}%</span></div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                {t('fs.risk')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.atr14')}</span><span className="font-mono">{asset.risk.atr_14.toFixed(4)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.volatility30d')}</span><span className="font-mono">{(asset.risk.volatility_30d * 100).toFixed(2)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.maxDrawdown7d')}</span><span className="font-mono text-red-500">{(asset.risk.max_drawdown_7d * 100).toFixed(2)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.sharpeEstimate')}</span><span className="font-mono">{asset.risk.sharpe_estimate.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('fs.correlationBtc')}</span><span className="font-mono">{asset.risk.correlation_btc.toFixed(3)}</span></div>
            </CardContent>
          </Card>
        </div>
        <div className="text-xs text-muted-foreground text-center mt-2">
          {t('fs.timestamp')}: {new Date(asset.timestamp).toLocaleString()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClusterCard({ cluster, t }: { cluster: ClusterAggregate; t: (key: string) => string }) {
  const colors = CLUSTER_COLORS[cluster.cluster_id] || CLUSTER_COLORS[10];
  return (
    <Card className={`border-l-4 ${colors.border}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" />
            {cluster.cluster_id}. {cluster.cluster_name}
          </CardTitle>
          <Badge variant="outline" className="font-mono">
            {t('fs.cos')}: {(cluster.cluster_opportunity_score * 100).toFixed(1)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div className="text-center">
            <div className="text-2xl font-bold">{cluster.asset_count}</div>
            <div className="text-xs text-muted-foreground">{t('fs.assetCount')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{cluster.eligible_count}</div>
            <div className="text-xs text-muted-foreground">{t('fs.eligibleCount')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{(cluster.avg_composite_score * 100).toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">{t('fs.avgComposite')}</div>
          </div>
        </div>
        
        {cluster.top_assets.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-muted-foreground mb-2">{t('fs.topAssets')}</div>
            <div className="flex flex-wrap gap-1">
              {cluster.top_assets.slice(0, 5).map((symbol) => (
                <Badge key={symbol} variant="secondary" className="text-xs">
                  {symbol}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FeatureStoreDashboard() {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [clusterFilter, setClusterFilter] = useState<string>('all');
  const [regimeFilter, setRegimeFilter] = useState<string>('all');
  const [eligibleOnly, setEligibleOnly] = useState(false);

  const { data: eligibleAssets, isLoading: assetsLoading, error: assetsError, refetch: refetchAssets } = useQuery<AssetFeatureVector[]>({
    queryKey: ['/api/feature-store/eligible', { min_score: 0 }],
  });

  const { data: clusters, isLoading: clustersLoading, error: clustersError, refetch: refetchClusters } = useQuery<ClusterAggregate[]>({
    queryKey: ['/api/feature-store/clusters'],
  });

  const { data: semanticClusters } = useQuery<Record<number, SemanticCluster>>({
    queryKey: ['/api/feature-store/semantic-clusters'],
  });

  const filteredAssets = eligibleAssets?.filter((asset) => {
    if (searchTerm && !asset.symbol.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (clusterFilter !== 'all' && asset.cluster_id !== parseInt(clusterFilter)) return false;
    if (regimeFilter !== 'all' && asset.vre.regime !== regimeFilter) return false;
    if (eligibleOnly && !asset.opportunity_eligible) return false;
    return true;
  }) || [];

  const stats = {
    totalAssets: eligibleAssets?.length || 0,
    eligibleAssets: eligibleAssets?.filter(a => a.opportunity_eligible).length || 0,
    avgScore: eligibleAssets?.length ? eligibleAssets.reduce((sum, a) => sum + a.composite_score, 0) / eligibleAssets.length : 0,
    healthStatus: (assetsError || clustersError) ? 'offline' : eligibleAssets?.length ? 'healthy' : 'degraded' as 'healthy' | 'degraded' | 'offline',
  };

  const handleRefresh = () => {
    refetchAssets();
    refetchClusters();
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-feature-store">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Database className="w-8 h-8 text-primary" />
            {t('fs.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('fs.subtitle')}</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" data-testid="button-refresh">
          <RefreshCw className="w-4 h-4 mr-2" />
          {t('fs.refreshData')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('fs.totalAssets')}</p>
                <p className="text-3xl font-bold">{stats.totalAssets}</p>
              </div>
              <Database className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('fs.eligibleAssets')}</p>
                <p className="text-3xl font-bold text-green-600">{stats.eligibleAssets}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('fs.avgScore')}</p>
                <p className="text-3xl font-bold">{(stats.avgScore * 100).toFixed(1)}%</p>
              </div>
              <BarChart3 className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('fs.systemHealth')}</p>
                <div className="mt-1">
                  <HealthBadge status={stats.healthStatus} t={t} />
                </div>
              </div>
              <Activity className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="assets" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="assets" data-testid="tab-assets">
            <Database className="w-4 h-4 mr-2" />
            {t('fs.assetFeatures')}
          </TabsTrigger>
          <TabsTrigger value="clusters" data-testid="tab-clusters">
            <Layers className="w-4 h-4 mr-2" />
            {t('fs.semanticClusters')}
          </TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">
            <Activity className="w-4 h-4 mr-2" />
            {t('fs.healthCheck')}
          </TabsTrigger>
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="w-4 h-4 mr-2" />
            {t('fs.overview')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder={t('fs.searchAssets')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
                <div className="flex gap-4 items-center flex-wrap">
                  <Select value={clusterFilter} onValueChange={setClusterFilter}>
                    <SelectTrigger className="w-48" data-testid="select-cluster">
                      <SelectValue placeholder={t('fs.filterByCluster')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('fs.allClusters')}</SelectItem>
                      {[1,2,3,4,5,6,7,8,9,10].map((id) => (
                        <SelectItem key={id} value={String(id)}>
                          {id}. {t(`fs.cluster${id}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={regimeFilter} onValueChange={setRegimeFilter}>
                    <SelectTrigger className="w-40" data-testid="select-regime">
                      <SelectValue placeholder={t('fs.filterByRegime')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('fs.allRegimes')}</SelectItem>
                      <SelectItem value="LOW">{t('vre.regimeLow') || 'Low'}</SelectItem>
                      <SelectItem value="NORMAL">{t('vre.regimeNormal') || 'Normal'}</SelectItem>
                      <SelectItem value="HIGH">{t('vre.regimeHigh') || 'High'}</SelectItem>
                      <SelectItem value="EXTREME">{t('vre.regimeExtreme') || 'Extreme'}</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <div className="flex items-center gap-2">
                    <Switch 
                      id="eligible-only" 
                      checked={eligibleOnly} 
                      onCheckedChange={setEligibleOnly}
                      data-testid="switch-eligible"
                    />
                    <Label htmlFor="eligible-only" className="text-sm">{t('fs.eligibleOnly')}</Label>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {assetsLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-muted-foreground">{t('fs.loadingFeatures')}</p>
                </div>
              ) : assetsError || !eligibleAssets?.length ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Database className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-2">{t('fs.noData')}</h3>
                  <p className="text-muted-foreground max-w-md">{t('fs.noDataDesc')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAssets.map((asset) => (
                    <AssetFeatureCard key={asset.symbol} asset={asset} t={t} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clusters">
          {clustersLoading ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground">{t('fs.loadingClusters')}</p>
              </CardContent>
            </Card>
          ) : clustersError || !clusters?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">{t('fs.noData')}</h3>
                <p className="text-muted-foreground max-w-md">{t('fs.noDataDesc')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clusters.map((cluster) => (
                <ClusterCard key={cluster.cluster_id} cluster={cluster} t={t} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="health">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  {t('fs.redisStatus')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('fs.systemHealth')}</span>
                    <HealthBadge status={stats.healthStatus} t={t} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('fs.assetTtl')}</span>
                    <span className="font-mono">60 {t('fs.seconds')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('fs.clusterTtl')}</span>
                    <span className="font-mono">120 {t('fs.seconds')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  {t('fs.cacheStats')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('fs.entriesCount')}</span>
                    <span className="font-mono">{stats.totalAssets + (clusters?.length || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('fs.lastUpdate')}</span>
                    <span className="font-mono text-xs">{new Date().toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  {t('fs.clusterDetails')}
                </CardTitle>
                <CardDescription>{t('fs.cosDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">ID</th>
                        <th className="text-left py-2 px-2">{t('fs.cluster')}</th>
                        <th className="text-center py-2 px-2">{t('fs.assetCount')}</th>
                        <th className="text-center py-2 px-2">{t('fs.eligibleCount')}</th>
                        <th className="text-center py-2 px-2">{t('fs.cos')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clusters?.map((cluster) => (
                        <tr key={cluster.cluster_id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-2 font-mono">{cluster.cluster_id}</td>
                          <td className="py-2 px-2">{cluster.cluster_name}</td>
                          <td className="py-2 px-2 text-center">{cluster.asset_count}</td>
                          <td className="py-2 px-2 text-center text-green-600">{cluster.eligible_count}</td>
                          <td className="py-2 px-2 text-center font-mono">{(cluster.cluster_opportunity_score * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  {t('fs.topAssets')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {eligibleAssets?.slice(0, 10).map((asset, idx) => (
                    <div key={asset.symbol} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground w-6">{idx + 1}.</span>
                        <span className="font-bold">{asset.symbol}</span>
                        <ClusterBadge clusterId={asset.cluster_id} name={asset.cluster_name} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{(asset.composite_score * 100).toFixed(1)}%</span>
                        <RegimeBadge regime={asset.vre.regime} t={t} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  {t('fs.semanticClusters')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[1,2,3,4,5,6,7,8,9,10].map((id) => {
                    const cluster = clusters?.find(c => c.cluster_id === id);
                    return (
                      <div key={id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`${CLUSTER_COLORS[id].badge} w-8 justify-center`}>
                            {id}
                          </Badge>
                          <span className="text-sm">{t(`fs.cluster${id}`)}</span>
                        </div>
                        <span className="font-mono text-sm">
                          {cluster ? `${cluster.asset_count} ${t('fs.assetCount').toLowerCase()}` : '-'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
