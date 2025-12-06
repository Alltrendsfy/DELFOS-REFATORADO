import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  DollarSign, 
  TrendingDown, 
  Percent, 
  FileText, 
  Download, 
  HelpCircle,
  Globe,
  CheckCircle,
  AlertCircle,
  Receipt,
  Calculator,
  BarChart3,
  Loader2
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface CostImpactData {
  portfolioId: string;
  taxYear: number;
  summary: {
    grossProfit: number;
    netProfit: number;
    totalFees: number;
    totalSlippage: number;
    totalTaxes: number;
    totalCosts: number;
  };
  impact: {
    feesPercentage: number;
    slippagePercentage: number;
    taxPercentage: number;
    totalPercentage: number;
  };
  breakdown: Array<{
    type: string;
    label: string;
    amount: number;
    percentage: number;
    color: string;
  }>;
  stats: {
    tradesCount: number;
    profitableTrades: number;
    winRate: number;
    effectiveTaxRate: number;
    countryCode: string;
    taxRegime: string;
  };
}

interface TaxSuggestion {
  detectedCountry: string;
  confidence: string;
  suggestion: {
    country_code: string;
    tax_regime: string;
    short_term_rate_pct: number;
    long_term_rate_pct: number;
    minimum_taxable_amount: number;
    description: string;
  };
  availableRegimes: Array<{
    key: string;
    countryCode: string;
    regime: string;
    shortTermRate: number;
    longTermRate: number;
    description: string;
  }>;
}

interface TaxProfile {
  id: string;
  country_code: string;
  tax_regime: string;
  short_term_rate_pct: string;
  long_term_rate_pct: string;
  minimum_taxable_amount: string;
  tax_year: number;
  description: string | null;
  is_active: boolean;
}

export default function CostsTaxes() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isExporting, setIsExporting] = useState(false);

  const { data: portfolios } = useQuery<any[]>({
    queryKey: ['/api/portfolios'],
    enabled: true,
  });

  useEffect(() => {
    if (!portfolioId && portfolios && portfolios.length > 0) {
      setPortfolioId(portfolios[0].id);
    }
  }, [portfolios, portfolioId]);

  const { data: costImpact, isLoading: loadingCosts } = useQuery<CostImpactData>({
    queryKey: ['/api/costs/impact', portfolioId, { taxYear: selectedYear }],
    enabled: !!portfolioId,
  });

  const { data: taxSuggestion } = useQuery<TaxSuggestion>({
    queryKey: ['/api/tax/profile/suggest'],
  });

  const { data: activeTaxProfile } = useQuery<TaxProfile | null>({
    queryKey: ['/api/tax-profiles/active', { taxYear: selectedYear }],
  });

  const { data: allTaxProfiles } = useQuery<TaxProfile[]>({
    queryKey: ['/api/tax-profiles'],
  });

  const createProfileMutation = useMutation({
    mutationFn: async (profile: any) => {
      return await apiRequest('/api/tax-profiles', 'POST', profile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tax-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/costs/impact'] });
      toast({
        title: t('tax.profileSaved'),
        description: t('common.success'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('tax.profileError'),
        variant: 'destructive',
      });
    },
  });

  const handleAcceptSuggestion = () => {
    if (!taxSuggestion?.suggestion) return;
    
    createProfileMutation.mutate({
      country_code: taxSuggestion.suggestion.country_code,
      tax_regime: taxSuggestion.suggestion.tax_regime,
      short_term_rate_pct: taxSuggestion.suggestion.short_term_rate_pct.toString(),
      long_term_rate_pct: taxSuggestion.suggestion.long_term_rate_pct.toString(),
      minimum_taxable_amount: taxSuggestion.suggestion.minimum_taxable_amount.toString(),
      tax_year: selectedYear,
      description: taxSuggestion.suggestion.description,
    });
  };

  const handleExportCSV = async () => {
    if (!portfolioId) return;
    
    setIsExporting(true);
    try {
      const response = await fetch(`/api/tax/report/${portfolioId}?taxYear=${selectedYear}&format=csv`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `delfos_tax_report_${selectedYear}_${portfolioId.substring(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: t('report.success'),
        description: t('common.success'),
      });
    } catch (error) {
      toast({
        title: t('report.error'),
        description: t('common.error'),
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(language === 'pt-BR' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">{t('costs.title')}</h1>
          <p className="text-muted-foreground">{t('costs.subtitle')}</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <Select value={portfolioId || ''} onValueChange={setPortfolioId}>
            <SelectTrigger className="w-[180px]" data-testid="select-portfolio">
              <SelectValue placeholder="Select portfolio" />
            </SelectTrigger>
            <SelectContent>
              {portfolios?.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[120px]" data-testid="select-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            variant="outline" 
            onClick={handleExportCSV}
            disabled={!portfolioId || isExporting}
            data-testid="button-export-csv"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {t('report.exportCSV')}
          </Button>
        </div>
      </div>

      {!activeTaxProfile && taxSuggestion && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">{t('tax.suggestLocation')}</CardTitle>
              {taxSuggestion.confidence === 'high' && (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  High confidence
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-medium">{taxSuggestion.suggestion.description}</p>
                <p className="text-sm text-muted-foreground">
                  {t('tax.shortTermRate')}: {taxSuggestion.suggestion.short_term_rate_pct}%
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={handleAcceptSuggestion}
                  disabled={createProfileMutation.isPending}
                  data-testid="button-accept-suggestion"
                >
                  {t('tax.acceptSuggestion')}
                </Button>
                <Button variant="outline" data-testid="button-configure-manually">
                  {t('tax.configureManually')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="impact" className="space-y-4">
        <TabsList>
          <TabsTrigger value="impact" data-testid="tab-impact">
            <BarChart3 className="w-4 h-4 mr-2" />
            {t('costs.impact')}
          </TabsTrigger>
          <TabsTrigger value="profile" data-testid="tab-profile">
            <Calculator className="w-4 h-4 mr-2" />
            {t('tax.profile')}
          </TabsTrigger>
          <TabsTrigger value="report" data-testid="tab-report">
            <FileText className="w-4 h-4 mr-2" />
            {t('report.title')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="impact" className="space-y-4">
          {loadingCosts ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {t('common.loading')}
              </CardContent>
            </Card>
          ) : !costImpact ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {t('costs.noData')}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card data-testid="card-gross-profit">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t('costs.grossProfit')}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 ml-1 inline text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{t('tooltip.grossProfit')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold font-mono ${costImpact.summary.grossProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatCurrency(costImpact.summary.grossProfit)}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-total-costs">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">{t('costs.totalCosts')}</CardTitle>
                    <TrendingDown className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-mono text-amber-500">
                      -{formatCurrency(costImpact.summary.totalCosts)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatPercent(costImpact.impact.totalPercentage)} {t('costs.impactOnProfit')}
                    </p>
                  </CardContent>
                </Card>

                <Card data-testid="card-net-profit">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t('costs.netProfit')}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 ml-1 inline text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{t('tooltip.netProfit')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                    <Receipt className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold font-mono ${costImpact.summary.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatCurrency(costImpact.summary.netProfit)}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-effective-rate">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">{t('costs.effectiveRate')}</CardTitle>
                    <Percent className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-mono">
                      {formatPercent(costImpact.stats.effectiveTaxRate)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {costImpact.stats.countryCode} - {costImpact.stats.taxRegime}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{t('costs.breakdown')}</CardTitle>
                  <CardDescription>{t('costs.impactDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {costImpact.breakdown.map((item) => (
                    <div key={item.type} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-medium">{item.label}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>{t(`tooltip.${item.type}`)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-muted-foreground">
                            {formatPercent(item.percentage)}
                          </span>
                          <span className="font-mono font-medium w-24 text-right">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      </div>
                      <Progress 
                        value={Math.min(item.percentage, 100)} 
                        className="h-2"
                        style={{ 
                          '--progress-background': item.color 
                        } as React.CSSProperties}
                      />
                    </div>
                  ))}

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between font-medium">
                      <span>{t('costs.totalCosts')}</span>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-muted-foreground">
                          {formatPercent(costImpact.impact.totalPercentage)}
                        </span>
                        <span className="font-mono w-24 text-right text-amber-500">
                          -{formatCurrency(costImpact.summary.totalCosts)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card data-testid="card-fees">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {t('costs.totalFees')}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{t('tooltip.fees')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold font-mono" style={{ color: '#5B9FB5' }}>
                      {formatCurrency(costImpact.summary.totalFees)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPercent(costImpact.impact.feesPercentage)} of gross profit
                    </p>
                  </CardContent>
                </Card>

                <Card data-testid="card-slippage">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {t('costs.totalSlippage')}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{t('tooltip.slippage')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold font-mono" style={{ color: '#7DD3E8' }}>
                      {formatCurrency(costImpact.summary.totalSlippage)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPercent(costImpact.impact.slippagePercentage)} of gross profit
                    </p>
                  </CardContent>
                </Card>

                <Card data-testid="card-taxes">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {t('costs.totalTaxes')}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{t('tooltip.taxes')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold font-mono" style={{ color: '#A8B5BD' }}>
                      {formatCurrency(costImpact.summary.totalTaxes)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPercent(costImpact.impact.taxPercentage)} of gross profit
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('costs.trades')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold font-mono">{costImpact.stats.tradesCount}</div>
                      <div className="text-xs text-muted-foreground">{t('costs.trades')}</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold font-mono text-green-500">{costImpact.stats.profitableTrades}</div>
                      <div className="text-xs text-muted-foreground">{t('costs.profitableTrades')}</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold font-mono">{costImpact.stats.winRate}%</div>
                      <div className="text-xs text-muted-foreground">Win Rate</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold font-mono">{costImpact.stats.effectiveTaxRate}%</div>
                      <div className="text-xs text-muted-foreground">{t('costs.effectiveRate')}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('tax.profile')}</CardTitle>
              <CardDescription>{t('tax.profileDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {activeTaxProfile ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="font-medium">Active Profile for {selectedYear}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('tax.country')}</p>
                      <p className="font-medium">{activeTaxProfile.country_code}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('tax.regime')}</p>
                      <p className="font-medium">{activeTaxProfile.tax_regime}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('tax.shortTermRate')}</p>
                      <p className="font-medium">{activeTaxProfile.short_term_rate_pct}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('tax.longTermRate')}</p>
                      <p className="font-medium">{activeTaxProfile.long_term_rate_pct}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('tax.minimumTaxable')}</p>
                      <p className="font-medium">${activeTaxProfile.minimum_taxable_amount}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('tax.year')}</p>
                      <p className="font-medium">{activeTaxProfile.tax_year}</p>
                    </div>
                  </div>

                  {activeTaxProfile.description && (
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                      {activeTaxProfile.description}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">{t('tax.noProfile')}</p>
                  {taxSuggestion && (
                    <Button onClick={handleAcceptSuggestion} disabled={createProfileMutation.isPending}>
                      {t('tax.acceptSuggestion')}
                    </Button>
                  )}
                </div>
              )}

              {taxSuggestion && (
                <div className="pt-6 border-t">
                  <h4 className="font-medium mb-4">Available Tax Regimes</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {taxSuggestion.availableRegimes.map((regime) => (
                      <div 
                        key={regime.key}
                        className="p-3 border rounded-lg hover-elevate cursor-pointer"
                        onClick={() => {
                          createProfileMutation.mutate({
                            country_code: regime.countryCode,
                            tax_regime: regime.regime,
                            short_term_rate_pct: regime.shortTermRate.toString(),
                            long_term_rate_pct: regime.longTermRate.toString(),
                            minimum_taxable_amount: "0",
                            tax_year: selectedYear,
                            description: regime.description,
                          });
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{regime.countryCode}</span>
                          <Badge variant="secondary">{regime.shortTermRate}%</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{regime.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('report.title')}</CardTitle>
              <CardDescription>{t('report.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">{t('report.period')}: {selectedYear}</p>
                  <p className="text-sm text-muted-foreground">
                    {costImpact ? `${costImpact.stats.tradesCount} trades` : 'No data'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleExportCSV}
                    disabled={!portfolioId || !costImpact || isExporting}
                    data-testid="button-download-csv"
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    {t('report.exportCSV')}
                  </Button>
                </div>
              </div>

              {costImpact && (
                <div className="space-y-4">
                  <h4 className="font-medium">{t('report.summary')}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">{t('costs.grossProfit')}</p>
                      <p className={`font-mono font-medium ${costImpact.summary.grossProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {formatCurrency(costImpact.summary.grossProfit)}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">{t('costs.totalCosts')}</p>
                      <p className="font-mono font-medium text-amber-500">
                        -{formatCurrency(costImpact.summary.totalCosts)}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">{t('costs.totalTaxes')}</p>
                      <p className="font-mono font-medium">
                        {formatCurrency(costImpact.summary.totalTaxes)}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">{t('costs.netProfit')}</p>
                      <p className={`font-mono font-medium ${costImpact.summary.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {formatCurrency(costImpact.summary.netProfit)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
