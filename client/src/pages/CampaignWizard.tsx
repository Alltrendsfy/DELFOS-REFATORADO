import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Rocket,
  Wallet,
  Shield,
  Target,
  AlertTriangle,
  CheckCircle,
  Info,
  Calendar,
  DollarSign,
  Zap,
  Sparkles,
  Loader2,
  Lightbulb,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  BarChart3,
  RefreshCw
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Portfolio {
  id: string;
  name: string;
  trading_mode: string;
  total_value_usd: string;
}

interface KrakenCredentialsStatus {
  hasApiKey: boolean;
  hasApiSecret: boolean;
}

interface AISuggestion {
  maxDrawdown: number;
  reasoning: string;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  tips: string[];
}

interface MarketBrief {
  timestamp: string;
  overallStatus: 'healthy' | 'warning' | 'critical';
  dataQuality: {
    activeSymbols: number;
    quarantinedSymbols: number;
    unsupportedSymbols: number;
    maxStaleness: number;
    avgStaleness: number;
  };
  circuitBreakers: {
    globalStatus: string;
    stalenessLevel: string;
    tradingAllowed: boolean;
    newPositionsAllowed: boolean;
  };
  volatility: {
    marketAvg: number;
    level: string;
    topVolatile: Array<{ symbol: string; volatility: number }>;
  };
  recommendation: string;
}

interface AIStepAdvice {
  step: string;
  advice: string;
  timestamp: string;
}

interface AICampaignSummary {
  summary: string;
  pros: string[];
  cons: string[];
  overallScore: number;
  recommendation: string;
  config: {
    name: string;
    initialCapital: number;
    duration: number;
    tradingMode: string;
    maxDrawdown: number;
  };
  timestamp: string;
}

interface RiskProfile {
  id: string;
  profile_code: string;
  profile_name: string;
  risk_per_trade_pct: string;
  max_drawdown_30d_pct: string;
  max_open_positions: number;
  max_trades_per_day: number;
  tp_atr_multiplier: string;
  max_cluster_risk_pct: string;
}

const STEPS = [
  { id: 1, key: 'basics', icon: Wallet },
  { id: 2, key: 'mode', icon: Zap },
  { id: 3, key: 'portfolio', icon: Target },
  { id: 4, key: 'risk', icon: Shield },
  { id: 5, key: 'review', icon: Rocket },
];

export default function CampaignWizard() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [currentStep, setCurrentStep] = useState(1);
  
  const [formData, setFormData] = useState({
    name: '',
    initialCapital: '100',
    duration: 30,
    tradingMode: 'paper',
    portfolioId: '',
    portfolioName: '',
    investorProfile: 'M',
    maxDrawdown: 10,
    enableCircuitBreakers: true,
  });

  const { data: portfolios, isLoading: portfoliosLoading } = useQuery<Portfolio[]>({
    queryKey: ['/api/portfolios'],
  });

  const { data: krakenCredentials, refetch: refetchKrakenCredentials } = useQuery<KrakenCredentialsStatus>({
    queryKey: ['/api/user/kraken-credentials'],
    staleTime: 0,
  });
  
  const isKrakenValid = krakenCredentials?.hasApiKey === true && krakenCredentials?.hasApiSecret === true;

  const { data: marketBrief, isLoading: marketBriefLoading, refetch: refetchMarketBrief } = useQuery<MarketBrief>({
    queryKey: ['/api/dashboard/market-brief'],
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Fallback risk profiles in case API fails
  const fallbackProfiles: RiskProfile[] = [
    {
      id: 'fallback-c',
      profile_code: 'C',
      profile_name: 'Conservador',
      risk_per_trade_pct: '0.20',
      max_drawdown_30d_pct: '8.00',
      max_open_positions: 5,
      max_trades_per_day: 15,
      tp_atr_multiplier: '1.50',
      max_cluster_risk_pct: '6.00',
    },
    {
      id: 'fallback-m',
      profile_code: 'M',
      profile_name: 'Moderado',
      risk_per_trade_pct: '0.50',
      max_drawdown_30d_pct: '12.00',
      max_open_positions: 10,
      max_trades_per_day: 30,
      tp_atr_multiplier: '2.00',
      max_cluster_risk_pct: '10.00',
    },
    {
      id: 'fallback-a',
      profile_code: 'A',
      profile_name: 'Agressivo',
      risk_per_trade_pct: '1.00',
      max_drawdown_30d_pct: '20.00',
      max_open_positions: 20,
      max_trades_per_day: 60,
      tp_atr_multiplier: '3.00',
      max_cluster_risk_pct: '15.00',
    },
  ];

  const { data: riskProfilesData, isLoading: riskProfilesLoading, isError: riskProfilesError } = useQuery<RiskProfile[]>({
    queryKey: ['/api/risk-profiles'],
    retry: 2,
    staleTime: 60000,
  });

  // Use API profiles if available, otherwise use fallback
  const riskProfiles = (riskProfilesData && riskProfilesData.length > 0) ? riskProfilesData : fallbackProfiles;

  const selectedProfile = riskProfiles?.find(p => p.profile_code === formData.investorProfile);

  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [stepAdvice, setStepAdvice] = useState<string | null>(null);
  const [isLoadingStepAdvice, setIsLoadingStepAdvice] = useState(false);
  const [aiSummary, setAiSummary] = useState<AICampaignSummary | null>(null);
  const [isLoadingAISummary, setIsLoadingAISummary] = useState(false);

  const fetchStepAdvice = async (step: string) => {
    if (isLoadingStepAdvice) return;
    
    setIsLoadingStepAdvice(true);
    setStepAdvice(null);
    
    try {
      const response = await apiRequest<AIStepAdvice>('/api/ai/campaign-step-advice', 'POST', {
        step,
        context: {
          name: formData.name,
          initialCapital: parseFloat(formData.initialCapital),
          duration: formData.duration,
          tradingMode: formData.tradingMode,
          portfolioName: formData.portfolioName,
          maxDrawdown: formData.maxDrawdown,
          marketStatus: marketBrief?.overallStatus || 'unknown',
          volatilityLevel: marketBrief?.volatility?.level || 'moderate',
        },
        language
      });
      
      setStepAdvice(response.advice);
    } catch (error: any) {
      console.error("Error fetching step advice:", error);
    } finally {
      setIsLoadingStepAdvice(false);
    }
  };

  const fetchAISuggestion = async () => {
    if (isLoadingAI) return;
    
    setIsLoadingAI(true);
    setAiSuggestion(null);
    
    try {
      const response = await apiRequest<AISuggestion>('/api/ai/campaign-risk-suggestion', 'POST', {
        initialCapital: parseFloat(formData.initialCapital),
        tradingMode: formData.tradingMode,
        duration: formData.duration,
        portfolioName: formData.portfolioName || undefined
      });
      
      setAiSuggestion(response);
      
      toast({
        title: t('wizard.aiSuggestionReady'),
        description: t('wizard.aiSuggestionDesc'),
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('wizard.aiSuggestionError'),
        variant: 'destructive'
      });
    } finally {
      setIsLoadingAI(false);
    }
  };

  const fetchAISummary = async () => {
    if (isLoadingAISummary) return;
    
    setIsLoadingAISummary(true);
    setAiSummary(null);
    
    try {
      const response = await apiRequest<AICampaignSummary>('/api/ai/campaign-summary', 'POST', {
        name: formData.name,
        initialCapital: parseFloat(formData.initialCapital),
        duration: formData.duration,
        tradingMode: formData.tradingMode,
        portfolioName: formData.portfolioName,
        maxDrawdown: formData.maxDrawdown,
        marketStatus: marketBrief?.overallStatus || 'unknown',
        volatilityLevel: marketBrief?.volatility?.level || 'moderate',
        totalAssets: marketBrief?.dataQuality?.activeSymbols || 80,
        clusterCount: 5,
        language
      });
      
      setAiSummary(response);
    } catch (error: any) {
      console.error("Error fetching AI summary:", error);
    } finally {
      setIsLoadingAISummary(false);
    }
  };

  const applyAISuggestion = () => {
    if (aiSuggestion) {
      setFormData(prev => ({ ...prev, maxDrawdown: aiSuggestion.maxDrawdown }));
      toast({
        title: t('wizard.suggestionApplied'),
        description: `${t('wizard.maxDrawdown')}: ${aiSuggestion.maxDrawdown}%`
      });
    }
  };

  useEffect(() => {
    if (currentStep === 5 && !aiSummary && !isLoadingAISummary) {
      fetchAISummary();
    }
  }, [currentStep]);

  const createCampaignMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({ 
        title: t('wizard.success'), 
        description: t('wizard.campaignCreated')
      });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/all'] });
      setLocation('/campaigns');
    },
    onError: (error: any) => {
      toast({ 
        title: t('common.error'), 
        description: error?.message || t('wizard.createError'),
        variant: 'destructive' 
      });
    }
  });

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!formData.name.trim()) {
          toast({ title: t('wizard.validation.nameRequired'), variant: 'destructive' });
          return false;
        }
        if (parseFloat(formData.initialCapital) < 10) {
          toast({ title: t('wizard.validation.minCapital'), variant: 'destructive' });
          return false;
        }
        return true;
      case 2:
        if (formData.tradingMode === 'live' && !isKrakenValid) {
          toast({ title: t('wizard.validation.krakenRequired'), variant: 'destructive' });
          return false;
        }
        return true;
      case 3:
        if (!formData.portfolioId) {
          toast({ title: t('wizard.validation.portfolioRequired'), variant: 'destructive' });
          return false;
        }
        return true;
      case 4:
        return true;
      case 5:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 5));
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handlePortfolioSelect = (portfolioId: string) => {
    const portfolio = portfolios?.find(p => p.id === portfolioId);
    const newMode = portfolio?.trading_mode || 'paper';
    
    setFormData(prev => ({
      ...prev,
      portfolioId,
      portfolioName: portfolio?.name || '',
      tradingMode: newMode,
    }));
    
    if (newMode === 'live') {
      refetchKrakenCredentials();
    }
  };

  const handleCreateCampaign = () => {
    if (formData.tradingMode === 'live' && !isKrakenValid) {
      toast({ 
        title: t('wizard.validation.krakenRequired'), 
        description: t('wizard.configureKraken'),
        variant: 'destructive' 
      });
      return;
    }
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + formData.duration);

    const campaignData = {
      portfolio_id: formData.portfolioId,
      name: formData.name,
      investor_profile: formData.investorProfile,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      initial_capital: formData.initialCapital,
      current_equity: formData.initialCapital,
      max_drawdown_percentage: (-formData.maxDrawdown).toString(),
      status: 'active',
      risk_config: selectedProfile ? {
        ...selectedProfile,
        maxDrawdown: formData.maxDrawdown,
        circuitBreakersEnabled: formData.enableCircuitBreakers,
      } : {
        maxDrawdown: formData.maxDrawdown,
        circuitBreakersEnabled: formData.enableCircuitBreakers,
      },
    };
    
    createCampaignMutation.mutate(campaignData);
  };

  const progressPercentage = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  const getMarketStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getMarketStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="w-5 h-5" />;
      case 'warning': return <AlertTriangle className="w-5 h-5" />;
      case 'critical': return <AlertCircle className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-wizard-title">
          {t('wizard.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('wizard.subtitle')}
        </p>
      </div>

      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            
            return (
              <div 
                key={step.id}
                className={`flex flex-col items-center ${isCurrent ? 'text-primary' : isCompleted ? 'text-green-500' : 'text-muted-foreground'}`}
              >
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all
                    ${isCurrent ? 'border-primary bg-primary/10' : isCompleted ? 'border-green-500 bg-green-500/10' : 'border-muted-foreground/30'}
                  `}
                  data-testid={`step-indicator-${step.id}`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span className="text-xs mt-1 hidden sm:block">
                  {t(`wizard.step.${step.key}`)}
                </span>
              </div>
            );
          })}
        </div>
        <Progress value={progressPercentage} className="h-2" data-testid="progress-wizard" />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => {
              const Icon = STEPS[currentStep - 1].icon;
              return <Icon className="w-5 h-5" />;
            })()}
            {t(`wizard.step${currentStep}.title`)}
          </CardTitle>
          <CardDescription>
            {t(`wizard.step${currentStep}.description`)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">{t('wizard.campaignName')}</Label>
                <Input
                  id="campaign-name"
                  data-testid="input-campaign-name"
                  placeholder={t('wizard.campaignNamePlaceholder')}
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="space-y-4">
                <Label className="text-base font-medium">{t('wizard.selectProfile')}</Label>
                {riskProfilesLoading ? (
                  <div className="flex gap-3">
                    <Skeleton className="h-20 flex-1" />
                    <Skeleton className="h-20 flex-1" />
                    <Skeleton className="h-20 flex-1" />
                  </div>
                ) : riskProfiles && riskProfiles.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {riskProfiles.map((profile) => (
                      <div
                        key={profile.profile_code}
                        className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                          formData.investorProfile === profile.profile_code
                            ? 'border-primary bg-primary/5'
                            : 'border-muted hover-elevate'
                        }`}
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            investorProfile: profile.profile_code,
                            maxDrawdown: Math.abs(parseFloat(profile.max_drawdown_30d_pct))
                          }));
                        }}
                        data-testid={`profile-option-${profile.profile_code}`}
                      >
                        <Badge variant={
                          profile.profile_code === 'C' ? 'secondary' :
                          profile.profile_code === 'M' ? 'outline' : 'destructive'
                        } className="mb-2">
                          {profile.profile_code === 'C' ? t('wizard.risk.conservative') :
                           profile.profile_code === 'M' ? t('wizard.risk.moderate') :
                           t('wizard.risk.aggressive')}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {t('wizard.riskPerTrade')}: {profile.risk_per_trade_pct}%
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-center">
                    <p className="text-sm text-destructive">
                      {t('wizard.profilesLoadError') || 'Erro ao carregar perfis de risco. Por favor, atualize a página.'}
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => window.location.reload()}
                      data-testid="button-reload-profiles"
                    >
                      {t('wizard.retry') || 'Tentar novamente'}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="initial-capital">{t('wizard.initialCapital')}</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="initial-capital"
                    data-testid="input-initial-capital"
                    type="number"
                    min="10"
                    step="10"
                    className="pl-10"
                    value={formData.initialCapital}
                    onChange={(e) => setFormData(prev => ({ ...prev, initialCapital: e.target.value }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t('wizard.minCapitalHint')}</p>
              </div>

              <div className="space-y-2">
                <Label>{t('wizard.duration')}</Label>
                <Select
                  value={formData.duration.toString()}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, duration: parseInt(value) }))}
                >
                  <SelectTrigger data-testid="select-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 {t('wizard.days')}</SelectItem>
                    <SelectItem value="14">14 {t('wizard.days')}</SelectItem>
                    <SelectItem value="30">30 {t('wizard.days')} ({t('wizard.recommended')})</SelectItem>
                    <SelectItem value="60">60 {t('wizard.days')}</SelectItem>
                    <SelectItem value="90">90 {t('wizard.days')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <RadioGroup
                value={formData.tradingMode}
                onValueChange={(value) => setFormData(prev => ({ ...prev, tradingMode: value }))}
                className="space-y-4"
              >
                <div 
                  className={`flex items-start space-x-4 p-4 rounded-lg border-2 transition-all cursor-pointer
                    ${formData.tradingMode === 'paper' ? 'border-primary bg-primary/5' : 'border-muted hover-elevate'}
                  `}
                  onClick={() => setFormData(prev => ({ ...prev, tradingMode: 'paper' }))}
                  data-testid="radio-paper-mode"
                >
                  <RadioGroupItem value="paper" id="paper" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="paper" className="text-lg font-medium cursor-pointer">
                      {t('wizard.paperMode')}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('wizard.paperModeDesc')}
                    </p>
                    <Badge variant="secondary" className="mt-2">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {t('wizard.noRiskBadge')}
                    </Badge>
                  </div>
                </div>

                <div 
                  className={`flex items-start space-x-4 p-4 rounded-lg border-2 transition-all cursor-pointer
                    ${formData.tradingMode === 'live' ? 'border-primary bg-primary/5' : 'border-muted hover-elevate'}
                  `}
                  onClick={() => setFormData(prev => ({ ...prev, tradingMode: 'live' }))}
                  data-testid="radio-live-mode"
                >
                  <RadioGroupItem value="live" id="live" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="live" className="text-lg font-medium cursor-pointer">
                      {t('wizard.liveMode')}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('wizard.liveModeDesc')}
                    </p>
                    <Badge variant="outline" className="mt-2 border-yellow-500 text-yellow-600">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {t('wizard.realMoneyBadge')}
                    </Badge>
                  </div>
                </div>
              </RadioGroup>

              {formData.tradingMode === 'live' && (
                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{t('wizard.krakenValidation')}</span>
                  </div>
                  {isKrakenValid ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span>{t('wizard.krakenValid')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-yellow-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span>{t('wizard.krakenInvalid')}</span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setLocation('/settings')}
                        data-testid="button-configure-kraken"
                      >
                        {t('wizard.configureKraken')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              {portfoliosLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : portfolios && portfolios.length > 0 ? (
                <>
                  <RadioGroup
                    value={formData.portfolioId}
                    onValueChange={handlePortfolioSelect}
                    className="space-y-3"
                  >
                    {portfolios.map((portfolio) => (
                      <div 
                        key={portfolio.id}
                        className={`flex items-center space-x-4 p-4 rounded-lg border-2 transition-all cursor-pointer
                          ${formData.portfolioId === portfolio.id ? 'border-primary bg-primary/5' : 'border-muted hover-elevate'}
                        `}
                        onClick={() => handlePortfolioSelect(portfolio.id)}
                        data-testid={`radio-portfolio-${portfolio.id}`}
                      >
                        <RadioGroupItem value={portfolio.id} id={portfolio.id} />
                        <div className="flex-1">
                          <Label htmlFor={portfolio.id} className="text-lg font-medium cursor-pointer">
                            {portfolio.name}
                          </Label>
                          <div className="flex items-center gap-3 mt-1">
                            <Badge variant={portfolio.trading_mode === 'live' ? 'default' : 'secondary'}>
                              {portfolio.trading_mode === 'live' ? 'LIVE' : 'PAPER'}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              ${parseFloat(portfolio.total_value_usd).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                  
                  {formData.tradingMode === 'live' && formData.portfolioId && (
                    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 space-y-2">
                      <div className="flex items-center gap-2 text-yellow-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-medium">{t('wizard.livePortfolioWarning')}</span>
                      </div>
                      {isKrakenValid ? (
                        <div className="flex items-center gap-2 text-green-600 text-sm">
                          <CheckCircle className="w-4 h-4" />
                          <span>{t('wizard.krakenValid')}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-yellow-600 text-sm">
                          <AlertTriangle className="w-4 h-4" />
                          <span>{t('wizard.krakenInvalid')}</span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setLocation('/settings')}
                          >
                            {t('wizard.configureKraken')}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">{t('wizard.noPortfolios')}</p>
                  <Button 
                    onClick={() => setLocation('/portfolios')}
                    data-testid="button-create-portfolio"
                  >
                    {t('wizard.createPortfolio')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>{t('wizard.maxDrawdown')}</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchAISuggestion}
                    disabled={isLoadingAI}
                    data-testid="button-ai-suggest"
                  >
                    {isLoadingAI ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    {t('wizard.aiSuggest')}
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    min="5"
                    max="50"
                    value={formData.maxDrawdown}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxDrawdown: parseInt(e.target.value) || 10 }))}
                    className="w-24"
                    data-testid="input-max-drawdown"
                  />
                  <span className="text-lg font-medium">%</span>
                  <Badge variant="outline">
                    {t('wizard.circuitBreaker')}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('wizard.maxDrawdownDesc')}
                </p>
              </div>

              {aiSuggestion && (
                <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-primary" />
                      <h4 className="font-medium">{t('wizard.aiRecommendation')}</h4>
                    </div>
                    <Badge variant={
                      aiSuggestion.riskLevel === 'conservative' ? 'secondary' : 
                      aiSuggestion.riskLevel === 'moderate' ? 'outline' : 'destructive'
                    }>
                      {t(`wizard.risk.${aiSuggestion.riskLevel}`)}
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">{t('wizard.suggestedDrawdown')}:</span>
                      <span className="text-xl font-bold text-primary">{aiSuggestion.maxDrawdown}%</span>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">{aiSuggestion.reasoning}</p>
                    
                    {aiSuggestion.tips.length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-2">{t('wizard.aiTips')}:</p>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {aiSuggestion.tips.map((tip, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <Button 
                      size="sm" 
                      onClick={applyAISuggestion}
                      className="w-full mt-2"
                      data-testid="button-apply-suggestion"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      {t('wizard.applySuggestion')}
                    </Button>
                  </div>
                </div>
              )}

              <Separator />

              <div className="p-4 rounded-lg bg-muted/50">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  {t('wizard.protectionsEnabled')}
                </h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    {t('wizard.protection1')}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    {t('wizard.protection2')}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    {t('wizard.protection3')}
                  </li>
                </ul>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Wallet className="w-4 h-4" />
                    {t('wizard.campaignName')}
                  </div>
                  <p className="font-medium text-lg" data-testid="review-name">{formData.name}</p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <DollarSign className="w-4 h-4" />
                    {t('wizard.initialCapital')}
                  </div>
                  <p className="font-medium text-lg" data-testid="review-capital">
                    ${parseFloat(formData.initialCapital).toLocaleString()}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Calendar className="w-4 h-4" />
                    {t('wizard.duration')}
                  </div>
                  <p className="font-medium text-lg" data-testid="review-duration">
                    {formData.duration} {t('wizard.days')}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Zap className="w-4 h-4" />
                    {t('wizard.mode')}
                  </div>
                  <Badge 
                    variant={formData.tradingMode === 'live' ? 'default' : 'secondary'}
                    data-testid="review-mode"
                  >
                    {formData.tradingMode === 'live' ? 'LIVE' : 'PAPER'}
                  </Badge>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Target className="w-4 h-4" />
                    {t('wizard.portfolio')}
                  </div>
                  <p className="font-medium text-lg" data-testid="review-portfolio">
                    {formData.portfolioName}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Shield className="w-4 h-4" />
                    {t('wizard.maxDrawdown')}
                  </div>
                  <p className="font-medium text-lg" data-testid="review-drawdown">
                    -{formData.maxDrawdown}%
                  </p>
                </div>
              </div>

              <Separator />

              {isLoadingAISummary ? (
                <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    <div>
                      <h4 className="font-medium">{t('wizard.aiAnalyzing')}</h4>
                      <p className="text-sm text-muted-foreground">
                        {t('wizard.aiAnalyzingDesc')}
                      </p>
                    </div>
                  </div>
                </div>
              ) : aiSummary ? (
                <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      <h4 className="font-medium">{t('wizard.aiSummary')}</h4>
                    </div>
                    <Badge variant={
                      aiSummary.overallScore >= 8 ? 'default' :
                      aiSummary.overallScore >= 6 ? 'secondary' : 'destructive'
                    }>
                      {aiSummary.overallScore}/10
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">{aiSummary.summary}</p>
                  
                  {aiSummary.pros && aiSummary.pros.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-green-600 mb-2">{t('wizard.pros')}</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {aiSummary.pros.map((pro, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                            {pro}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {aiSummary.cons && aiSummary.cons.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-yellow-600 mb-2">{t('wizard.cons')}</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {aiSummary.cons.map((con, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                            {con}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {aiSummary.recommendation && (
                    <div className="pt-2 border-t border-primary/10">
                      <p className="text-xs font-medium text-primary mb-1">{t('wizard.aiRecommendation')}</p>
                      <p className="text-sm text-muted-foreground">{aiSummary.recommendation}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Rocket className="w-6 h-6 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium">{t('wizard.readyToLaunch')}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t('wizard.launchDescription')}
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => fetchAISummary()}
                      disabled={isLoadingAISummary}
                      data-testid="button-retry-ai-summary"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentStep === 1}
          data-testid="button-prev"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          {t('wizard.previous')}
        </Button>

        {currentStep < 5 ? (
          <Button
            onClick={handleNext}
            data-testid="button-next"
          >
            {t('wizard.next')}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleCreateCampaign}
            disabled={createCampaignMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-activate"
          >
            {createCampaignMutation.isPending ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
            ) : (
              <Rocket className="w-4 h-4 mr-2" />
            )}
            {t('wizard.activateCampaign')}
          </Button>
        )}
      </div>
    </div>
  );
}
