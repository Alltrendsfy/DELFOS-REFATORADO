import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, AlertTriangle, BarChart3, Shield, TrendingUp, Zap, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type VolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

interface VREState {
  symbol: string;
  regime: VolatilityRegime;
  z_score: number;
  confidence: number;
  confirmations: number;
  cooldown_remaining: number;
  timestamp: string;
}

interface AdaptiveParameters {
  entryFilters: {
    liquidityPercentile: number;
    maxSpreadPct: number;
    maxSlippagePct: number;
    volumeMultiplier: number;
    correlationThreshold: number;
  };
  stopsAndTPs: {
    slAtrMultiplier: number;
    tp1AtrMultiplier: number;
    tp2AtrMultiplier: number;
    trailAtrMultiplier: number;
    partialExitPct1: number;
    partialExitPct2: number;
  };
  positionSizing: {
    mSizeMultiplier: number;
    maxHeatPct: number;
  };
  tradeFrequency: {
    maxTradesPer6h: number;
    cooldownAfterWinMin: number;
    cooldownAfterLossMin: number;
  };
  pyramiding: {
    allowed: boolean;
    maxAdds: number;
    distanceAtr: number;
    sizeReduction: number;
  };
}

interface CircuitBreakerStatus {
  extremeSpikeGuard: {
    active: boolean;
    cooldownRemaining: number | null;
    reason: string | null;
  };
  whipsawGuard: {
    blockedAssets: Array<{
      symbol: string;
      blockUntil: string;
      consecutiveLosses: number;
    }>;
  };
}

const REGIME_COLORS: Record<VolatilityRegime, { bg: string; text: string; border: string }> = {
  LOW: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
  NORMAL: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
  HIGH: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
  EXTREME: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
};

function RegimeBadge({ regime, t }: { regime: VolatilityRegime; t?: (key: string) => string }) {
  const colors = REGIME_COLORS[regime];
  const getLabel = () => {
    if (!t) {
      const labels: Record<VolatilityRegime, string> = {
        LOW: 'Low Volatility', NORMAL: 'Normal', HIGH: 'High Volatility', EXTREME: 'Extreme'
      };
      return labels[regime];
    }
    const keys: Record<VolatilityRegime, string> = {
      LOW: 'vre.regimeLow', NORMAL: 'vre.regimeNormal', HIGH: 'vre.regimeHigh', EXTREME: 'vre.regimeExtreme'
    };
    return t(keys[regime]);
  };
  return (
    <Badge 
      variant="outline" 
      className={`${colors.bg} ${colors.text} ${colors.border} font-medium`}
      data-testid={`badge-regime-${regime.toLowerCase()}`}
    >
      {getLabel()}
    </Badge>
  );
}

function ZScoreIndicator({ zScore, t }: { zScore: number; t: (key: string) => string }) {
  const normalized = Math.min(Math.max((zScore + 2) / 4 * 100, 0), 100);
  let colorClass = 'bg-green-500';
  if (zScore > 1.75) colorClass = 'bg-red-500';
  else if (zScore > 0.75) colorClass = 'bg-orange-500';
  else if (zScore > -0.75) colorClass = 'bg-blue-500';
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{t('vre.zScore')}</span>
        <span className="font-mono font-medium">{zScore.toFixed(2)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full ${colorClass} transition-all duration-300`}
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  );
}

function SymbolRegimeCard({ state, t }: { state: VREState; t: (key: string) => string }) {
  const colors = REGIME_COLORS[state.regime];
  
  return (
    <Card className={`${colors.border} border-2`} data-testid={`card-symbol-${state.symbol.replace('/', '-')}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg font-mono">{state.symbol}</CardTitle>
          <RegimeBadge regime={state.regime} t={t} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ZScoreIndicator zScore={state.z_score} t={t} />
        
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">{t('vre.confidence')}</span>
            <p className="font-mono font-medium">{(state.confidence * 100).toFixed(0)}%</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('vre.confirmations')}</span>
            <p className="font-mono font-medium">{state.confirmations}/3</p>
          </div>
        </div>
        
        {state.cooldown_remaining > 0 && (
          <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
            <Zap className="w-3 h-3" />
            <span>{t('vre.cooldown')}: {state.cooldown_remaining} {t('vre.cycles')}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ParameterTable({ title, icon: Icon, params, t }: { 
  title: string; 
  icon: typeof Activity;
  params: Record<string, number | boolean | string>;
  t: (key: string) => string;
}) {
  const getParamLabel = (key: string): string => {
    const translationKey = `vre.param.${key}`;
    const translated = t(translationKey);
    if (translated !== translationKey) return translated;
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
  };
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="w-4 h-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Object.entries(params).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                {getParamLabel(key)}
              </span>
              <span className="font-mono font-medium">
                {typeof value === 'boolean' 
                  ? (value ? t('vre.yes') : t('vre.no'))
                  : typeof value === 'number' 
                    ? (value < 1 && value > 0 ? `${(value * 100).toFixed(1)}%` : value.toFixed(2))
                    : value
                }
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CircuitBreakerPanel({ status, t }: { status: CircuitBreakerStatus; t: (key: string) => string }) {
  const hasActiveBlocks = status.extremeSpikeGuard.active || status.whipsawGuard.blockedAssets.length > 0;
  
  return (
    <Card className={hasActiveBlocks ? 'border-orange-500/50' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="w-4 h-4" />
          {t('vre.cbTitle')}
        </CardTitle>
        <CardDescription>
          {t('vre.cbDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span className="font-medium">{t('vre.extremeSpikeGuard')}</span>
            </div>
            <Badge variant={status.extremeSpikeGuard.active ? 'destructive' : 'secondary'}>
              {status.extremeSpikeGuard.active ? t('vre.active') : t('vre.inactive')}
            </Badge>
          </div>
          {status.extremeSpikeGuard.active && (
            <p className="text-sm text-muted-foreground">
              {status.extremeSpikeGuard.reason}
              {status.extremeSpikeGuard.cooldownRemaining && 
                ` (${status.extremeSpikeGuard.cooldownRemaining}m ${t('vre.remaining')})`
              }
            </p>
          )}
        </div>
        
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">{t('vre.whipsawGuard')}</span>
            </div>
            <Badge variant={status.whipsawGuard.blockedAssets.length > 0 ? 'destructive' : 'secondary'}>
              {status.whipsawGuard.blockedAssets.length > 0 
                ? `${status.whipsawGuard.blockedAssets.length} ${t('vre.blocked')}` 
                : t('vre.clear')
              }
            </Badge>
          </div>
          
          {status.whipsawGuard.blockedAssets.length > 0 && (
            <div className="space-y-2 mt-2">
              {status.whipsawGuard.blockedAssets.map((asset) => (
                <div 
                  key={asset.symbol} 
                  className="flex items-center justify-between text-sm p-2 rounded bg-red-500/10"
                >
                  <span className="font-mono">{asset.symbol}</span>
                  <span className="text-muted-foreground">
                    {asset.consecutiveLosses} {t('vre.losses')} - {t('vre.blockedUntil')} {new Date(asset.blockUntil).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ProfileRestriction {
  profile: string;
  profileKey: string;
  allowedRegimes: VolatilityRegime[];
  pyramidingAllowed: boolean;
  maxMSize: number;
}

const PROFILE_RESTRICTIONS: ProfileRestriction[] = [
  { profile: 'C', profileKey: 'vre.profileC', allowedRegimes: ['LOW', 'NORMAL'], pyramidingAllowed: false, maxMSize: 0.80 },
  { profile: 'M', profileKey: 'vre.profileM', allowedRegimes: ['LOW', 'NORMAL', 'HIGH'], pyramidingAllowed: false, maxMSize: 1.00 },
  { profile: 'A', profileKey: 'vre.profileA', allowedRegimes: ['LOW', 'NORMAL', 'HIGH', 'EXTREME'], pyramidingAllowed: false, maxMSize: 1.15 },
  { profile: 'SA', profileKey: 'vre.profileSA', allowedRegimes: ['LOW', 'NORMAL', 'HIGH', 'EXTREME'], pyramidingAllowed: true, maxMSize: 1.25 },
  { profile: 'FULL', profileKey: 'vre.profileFull', allowedRegimes: ['LOW', 'NORMAL', 'HIGH', 'EXTREME'], pyramidingAllowed: true, maxMSize: 1.25 },
];

function ProfileRestrictionsPanel({ t }: { t: (key: string) => string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4" />
          {t('vre.profileRestrictions')}
        </CardTitle>
        <CardDescription>
          {t('vre.profileRestrictionsDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('vre.profile')}</th>
                <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('vre.allowedRegimes')}</th>
                <th className="text-center py-3 px-2 font-medium text-muted-foreground">{t('vre.pyramidingAllowed')}</th>
                <th className="text-center py-3 px-2 font-medium text-muted-foreground">{t('vre.maxMSize')}</th>
              </tr>
            </thead>
            <tbody>
              {PROFILE_RESTRICTIONS.map((restriction) => (
                <tr key={restriction.profile} className="border-b last:border-0">
                  <td className="py-3 px-2 font-medium">{t(restriction.profileKey)}</td>
                  <td className="py-3 px-2">
                    <div className="flex flex-wrap gap-1">
                      {restriction.allowedRegimes.map((regime) => (
                        <RegimeBadge key={regime} regime={regime} t={t} />
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Badge variant={restriction.pyramidingAllowed ? 'default' : 'secondary'}>
                      {restriction.pyramidingAllowed ? t('vre.yes') : t('vre.no')}
                    </Badge>
                  </td>
                  <td className="py-3 px-2 text-center font-mono">{restriction.maxMSize.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

interface AggregateResponse {
  aggregate_regime: VolatilityRegime;
  confidence: number;
  individual: Record<string, { regime: VolatilityRegime; z_score: number; confidence: number }>;
}

export default function VREDashboard() {
  const { t } = useLanguage();
  
  const symbols = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD', 'AVAX/USD'];
  const symbolsParam = symbols.join(',');
  
  const { data: aggregateData, isLoading: regimesLoading, isError: regimesError } = useQuery<AggregateResponse>({
    queryKey: ['/api/vre/aggregate', symbolsParam],
    queryFn: async () => {
      const res = await fetch(`/api/vre/aggregate?symbols=${encodeURIComponent(symbolsParam)}`);
      if (!res.ok) throw new Error('Failed to fetch regimes');
      return res.json();
    },
    refetchInterval: 30000,
    retry: 1,
  });
  
  const regimeStates: VREState[] = aggregateData 
    ? Object.entries(aggregateData.individual).map(([symbol, data]) => ({
        symbol,
        regime: data.regime,
        z_score: data.z_score,
        confidence: data.confidence,
        confirmations: 3,
        cooldown_remaining: 0,
        timestamp: new Date().toISOString(),
      }))
    : [];
  
  const { data: allParameters, isLoading: parametersLoading, isError: parametersError } = useQuery<Record<string, AdaptiveParameters>>({
    queryKey: ['/api/vre/parameters'],
    retry: 1,
  });
  
  const { data: circuitBreakers, isLoading: cbLoading, isError: cbError } = useQuery<CircuitBreakerStatus>({
    queryKey: ['/api/vre/circuit-breakers'],
    refetchInterval: 10000,
    retry: 1,
  });
  
  const aggregateRegime = aggregateData?.aggregate_regime ?? 'NORMAL';
  
  const avgZScore = regimeStates.length > 0
    ? regimeStates.reduce((sum, s) => sum + s.z_score, 0) / regimeStates.length
    : 0;

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-vre-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('vre.title')}</h1>
          <p className="text-muted-foreground">
            {t('vre.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">{t('vre.portfolioRegime')}</p>
            <RegimeBadge regime={aggregateRegime} t={t} />
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">{t('vre.avgZScore')}</p>
            <p className="font-mono font-bold text-lg">{avgZScore.toFixed(2)}</p>
          </div>
        </div>
      </div>
      
      <Tabs defaultValue="regimes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="regimes" data-testid="tab-regimes">
            <Activity className="w-4 h-4 mr-2" />
            {t('vre.symbolRegimes')}
          </TabsTrigger>
          <TabsTrigger value="parameters" data-testid="tab-parameters">
            <BarChart3 className="w-4 h-4 mr-2" />
            {t('vre.adaptiveParameters')}
          </TabsTrigger>
          <TabsTrigger value="circuit-breakers" data-testid="tab-circuit-breakers">
            <Shield className="w-4 h-4 mr-2" />
            {t('vre.circuitBreakers')}
          </TabsTrigger>
          <TabsTrigger value="profile-restrictions" data-testid="tab-profile-restrictions">
            <Users className="w-4 h-4 mr-2" />
            {t('vre.profileRestrictions')}
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="regimes" className="space-y-4">
          {regimesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {symbols.map((s) => (
                <Card key={s} className="animate-pulse">
                  <CardHeader className="pb-2">
                    <div className="h-6 bg-muted rounded w-24" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-20 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : regimeStates && regimeStates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {regimeStates.map((state) => (
                <SymbolRegimeCard key={state.symbol} state={state} t={t} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">{t('vre.noRegimeData')}</h3>
                <p className="text-muted-foreground max-w-md">
                  {t('vre.noRegimeDataDesc')}
                </p>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('vre.thresholds')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <p className="text-xs text-muted-foreground mb-1">LOW</p>
                  <p className="font-mono text-sm">Z &lt; -0.75</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <p className="text-xs text-muted-foreground mb-1">NORMAL</p>
                  <p className="font-mono text-sm">-0.75 ≤ Z &lt; 0.75</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <p className="text-xs text-muted-foreground mb-1">HIGH</p>
                  <p className="font-mono text-sm">0.75 ≤ Z &lt; 1.75</p>
                </div>
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <p className="text-xs text-muted-foreground mb-1">EXTREME</p>
                  <p className="font-mono text-sm">Z ≥ 1.75</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="parameters" className="space-y-4">
          {parametersLoading ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground">{t('vre.loadingParams')}</p>
              </CardContent>
            </Card>
          ) : parametersError || !allParameters ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">{t('vre.paramsNotConfigured')}</h3>
                <p className="text-muted-foreground">
                  {t('vre.paramsNotConfiguredDesc')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {(['LOW', 'NORMAL', 'HIGH', 'EXTREME'] as VolatilityRegime[]).map((regime) => {
                const params = allParameters[regime];
                if (!params) return null;
                
                return (
                  <div key={regime} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <RegimeBadge regime={regime} t={t} />
                      <span className="text-lg font-semibold">{t('vre.adaptiveParameters')}</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <ParameterTable 
                        title={`${t('vre.entryFilters')} (${t('vre.table1')})`}
                        icon={TrendingUp}
                        params={params.entryFilters}
                        t={t}
                      />
                      <ParameterTable 
                        title={`${t('vre.stopsAndTPs')} (${t('vre.table2')})`}
                        icon={Shield}
                        params={params.stopsAndTPs}
                        t={t}
                      />
                      <ParameterTable 
                        title={`${t('vre.positionSizing')} (${t('vre.table3')})`}
                        icon={BarChart3}
                        params={params.positionSizing}
                        t={t}
                      />
                      <ParameterTable 
                        title={`${t('vre.tradeFrequency')} (${t('vre.table4')})`}
                        icon={Activity}
                        params={params.tradeFrequency}
                        t={t}
                      />
                      <ParameterTable 
                        title={`${t('vre.pyramiding')} (${t('vre.table5')})`}
                        icon={Zap}
                        params={params.pyramiding}
                        t={t}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="circuit-breakers">
          {cbLoading ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground">{t('vre.loadingCb')}</p>
              </CardContent>
            </Card>
          ) : cbError || !circuitBreakers ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Shield className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">{t('vre.cbStatusUnavailable')}</h3>
                <p className="text-muted-foreground">
                  {t('vre.cbStatusUnavailableDesc')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <CircuitBreakerPanel status={circuitBreakers} t={t} />
          )}
        </TabsContent>
        
        <TabsContent value="profile-restrictions">
          <ProfileRestrictionsPanel t={t} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
