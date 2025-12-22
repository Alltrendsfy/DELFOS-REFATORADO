import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  Brain, 
  RefreshCw, 
  TrendingUp, 
  Target, 
  Clock, 
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  Lightbulb,
  Activity,
  Sparkles,
  Play,
  History,
  FileText
} from "lucide-react";

interface CampaignPattern {
  id: string;
  scope: string;
  portfolio_id: string | null;
  campaign_id: string | null;
  pattern_type: string;
  pattern_name: string;
  pattern_description: string | null;
  pattern_data: Record<string, unknown>;
  sample_size: number;
  confidence_level: string;
  confidence_score: string | null;
  expected_improvement_pct: string | null;
  ai_reasoning: string | null;
  ai_recommendation: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface OpportunityPattern {
  id: string;
  scope: string;
  user_id: string | null;
  portfolio_id: string | null;
  pattern_type: string;
  pattern_name: string;
  pattern_description: string | null;
  pattern_data: Record<string, unknown>;
  sample_size: number;
  confidence_level: string;
  confidence_score: string | null;
  approval_rate_impact: string | null;
  success_rate_improvement: string | null;
  avg_pnl_improvement: string | null;
  ai_reasoning: string | null;
  ai_recommendation: string | null;
  is_active: boolean;
  created_at: string;
}

interface LearningRun {
  id: string;
  learner_type: string;
  run_trigger: string;
  scope: string;
  portfolio_id: string | null;
  campaign_id: string | null;
  user_id: string | null;
  analysis_window_start: string;
  analysis_window_end: string;
  min_sample_size: number;
  status: string;
  patterns_discovered: number;
  patterns_updated: number;
  patterns_invalidated: number;
  ai_tokens_used: number;
  ai_model_used: string | null;
  duration_ms: number | null;
  error_message: string | null;
  run_summary: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
}

export default function AILearning() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("patterns");
  const [selectedPatternType, setSelectedPatternType] = useState<string>("all");
  const [selectedPattern, setSelectedPattern] = useState<CampaignPattern | OpportunityPattern | null>(null);

  const { data: campaignPatterns, isLoading: loadingCampaignPatterns } = useQuery<{ patterns: CampaignPattern[], count: number }>({
    queryKey: ['/api/ai/learning/campaign/patterns'],
  });

  const { data: opportunityPatterns, isLoading: loadingOpportunityPatterns } = useQuery<{ patterns: OpportunityPattern[], count: number }>({
    queryKey: ['/api/ai/learning/opportunity/patterns'],
  });

  const { data: learningRuns, isLoading: loadingRuns } = useQuery<{ runs: LearningRun[], count: number }>({
    queryKey: ['/api/ai/learning/runs'],
  });

  const runCampaignAnalysis = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/ai/learning/campaign/analyze', 'POST', { scope: 'global', windowDays: 30 });
    },
    onSuccess: () => {
      toast({
        title: t('aiLearning.analysisStarted'),
        description: t('aiLearning.campaignAnalysisStartedDesc'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/learning/runs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/learning/campaign/patterns'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const runOpportunityAnalysis = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/ai/learning/opportunity/analyze', 'POST', { scope: 'global', windowDays: 60 });
    },
    onSuccess: () => {
      toast({
        title: t('aiLearning.analysisStarted'),
        description: t('aiLearning.opportunityAnalysisStartedDesc'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/learning/runs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/learning/opportunity/patterns'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getConfidenceBadge = (level: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", icon: typeof CheckCircle2 }> = {
      very_high: { variant: "default", icon: CheckCircle2 },
      high: { variant: "default", icon: CheckCircle2 },
      medium: { variant: "secondary", icon: AlertCircle },
      low: { variant: "outline", icon: XCircle },
    };
    const config = variants[level] || variants.medium;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1" data-testid={`badge-confidence-${level}`}>
        <Icon className="w-3 h-3" />
        {level.replace('_', ' ')}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      completed: "default",
      running: "secondary",
      failed: "destructive",
    };
    return (
      <Badge variant={variants[status] || "outline"} data-testid={`badge-status-${status}`}>
        {status}
      </Badge>
    );
  };

  const getPatternTypeIcon = (type: string) => {
    const icons: Record<string, typeof TrendingUp> = {
      entry_timing: Clock,
      exit_optimization: Target,
      symbol_performance: BarChart3,
      risk_sizing: Activity,
      circuit_breaker: AlertCircle,
      regime_adaptation: Zap,
      slippage_impact: TrendingUp,
      approval_success: CheckCircle2,
      rejection_avoidance: XCircle,
      scoring_calibration: Target,
      timing_optimization: Clock,
      thesis_performance: Lightbulb,
      capital_sizing: Activity,
    };
    const Icon = icons[type] || Brain;
    return <Icon className="w-4 h-4" />;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const allCampaignPatterns = campaignPatterns?.patterns || [];
  const allOpportunityPatterns = opportunityPatterns?.patterns || [];
  const allRuns = learningRuns?.runs || [];

  const filteredCampaignPatterns = selectedPatternType === 'all' 
    ? allCampaignPatterns 
    : allCampaignPatterns.filter(p => p.pattern_type === selectedPatternType);

  const filteredOpportunityPatterns = selectedPatternType === 'all'
    ? allOpportunityPatterns
    : allOpportunityPatterns.filter(p => p.pattern_type === selectedPatternType);

  const totalPatterns = allCampaignPatterns.length + allOpportunityPatterns.length;
  const activePatterns = [...allCampaignPatterns, ...allOpportunityPatterns].filter(p => p.is_active).length;
  const highConfidencePatterns = [...allCampaignPatterns, ...allOpportunityPatterns].filter(
    p => p.confidence_level === 'high' || p.confidence_level === 'very_high'
  ).length;
  const recentRuns = allRuns.filter(r => {
    const date = new Date(r.started_at);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return date > weekAgo;
  }).length;

  const isLoading = loadingCampaignPatterns || loadingOpportunityPatterns || loadingRuns;

  return (
    <div className="flex flex-col h-full" data-testid="page-ai-learning">
      <div className="flex items-center justify-between p-4 border-b gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Brain className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">{t('aiLearning.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('aiLearning.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runCampaignAnalysis.mutate()}
            disabled={runCampaignAnalysis.isPending}
            data-testid="button-run-campaign-analysis"
          >
            {runCampaignAnalysis.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {t('aiLearning.runCampaignAnalysis')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runOpportunityAnalysis.mutate()}
            disabled={runOpportunityAnalysis.isPending}
            data-testid="button-run-opportunity-analysis"
          >
            {runOpportunityAnalysis.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {t('aiLearning.runOpportunityAnalysis')}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card data-testid="card-total-patterns">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Brain className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('aiLearning.totalPatterns')}</p>
                  <p className="text-2xl font-bold" data-testid="text-total-patterns">{totalPatterns}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-active-patterns">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('aiLearning.activePatterns')}</p>
                  <p className="text-2xl font-bold" data-testid="text-active-patterns">{activePatterns}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-high-confidence">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Target className="w-5 h-5 text-cyan-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('aiLearning.highConfidence')}</p>
                  <p className="text-2xl font-bold" data-testid="text-high-confidence">{highConfidencePatterns}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-recent-runs">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <History className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('aiLearning.recentRuns')}</p>
                  <p className="text-2xl font-bold" data-testid="text-recent-runs">{recentRuns}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="patterns" data-testid="tab-patterns">
              <Brain className="w-4 h-4 mr-2" />
              {t('aiLearning.patterns')}
            </TabsTrigger>
            <TabsTrigger value="recommendations" data-testid="tab-recommendations">
              <Sparkles className="w-4 h-4 mr-2" />
              {t('aiLearning.recommendations')}
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="w-4 h-4 mr-2" />
              {t('aiLearning.history')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="patterns" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('aiLearning.discoveredPatterns')}</h2>
              <Select value={selectedPatternType} onValueChange={setSelectedPatternType}>
                <SelectTrigger className="w-[200px]" data-testid="select-pattern-type">
                  <SelectValue placeholder={t('aiLearning.filterByType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="option-pattern-all">{t('aiLearning.allTypes')}</SelectItem>
                  <SelectItem value="entry_timing" data-testid="option-pattern-entry">{t('aiLearning.entryTiming')}</SelectItem>
                  <SelectItem value="exit_optimization" data-testid="option-pattern-exit">{t('aiLearning.exitOptimization')}</SelectItem>
                  <SelectItem value="symbol_performance" data-testid="option-pattern-symbol">{t('aiLearning.symbolPerformance')}</SelectItem>
                  <SelectItem value="risk_sizing" data-testid="option-pattern-risk">{t('aiLearning.riskSizing')}</SelectItem>
                  <SelectItem value="approval_success" data-testid="option-pattern-approval">{t('aiLearning.approvalSuccess')}</SelectItem>
                  <SelectItem value="scoring_calibration" data-testid="option-pattern-scoring">{t('aiLearning.scoringCalibration')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      {t('aiLearning.campaignPatterns')}
                    </CardTitle>
                    <CardDescription>
                      {t('aiLearning.campaignPatternsDesc')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {filteredCampaignPatterns.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>{t('aiLearning.noPatternsFound')}</p>
                        <p className="text-sm mt-2">{t('aiLearning.runAnalysisToDiscover')}</p>
                      </div>
                    ) : (
                      <Accordion type="single" collapsible className="space-y-2">
                        {filteredCampaignPatterns.map((pattern) => (
                          <AccordionItem key={pattern.id} value={pattern.id} className="border rounded-lg px-3">
                            <AccordionTrigger className="hover:no-underline" data-testid={`accordion-campaign-pattern-${pattern.id}`}>
                              <div className="flex items-center gap-3 text-left">
                                {getPatternTypeIcon(pattern.pattern_type)}
                                <div className="flex-1">
                                  <p className="font-medium" data-testid={`text-pattern-name-${pattern.id}`}>{pattern.pattern_name}</p>
                                  <p className="text-xs text-muted-foreground">{pattern.pattern_type.replace('_', ' ')}</p>
                                </div>
                                {getConfidenceBadge(pattern.confidence_level)}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-2">
                              <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">{pattern.pattern_description}</p>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">{t('aiLearning.sampleSize')}:</span>
                                    <span className="ml-2 font-medium" data-testid={`text-sample-size-${pattern.id}`}>{pattern.sample_size}</span>
                                  </div>
                                  {pattern.expected_improvement_pct && (
                                    <div>
                                      <span className="text-muted-foreground">{t('aiLearning.expectedImprovement')}:</span>
                                      <span className="ml-2 font-medium text-green-500" data-testid={`text-improvement-${pattern.id}`}>
                                        +{parseFloat(pattern.expected_improvement_pct).toFixed(1)}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {pattern.ai_recommendation && (
                                  <div className="p-3 bg-primary/5 rounded-lg">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Lightbulb className="w-4 h-4 text-primary" />
                                      <span className="font-medium text-sm">{t('aiLearning.aiRecommendation')}</span>
                                    </div>
                                    <p className="text-sm" data-testid={`text-recommendation-${pattern.id}`}>{pattern.ai_recommendation}</p>
                                  </div>
                                )}
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" onClick={() => setSelectedPattern(pattern)} data-testid={`button-view-details-${pattern.id}`}>
                                      <FileText className="w-4 h-4 mr-2" />
                                      {t('aiLearning.viewDetails')}
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle className="flex items-center gap-2">
                                        {getPatternTypeIcon(pattern.pattern_type)}
                                        {pattern.pattern_name}
                                      </DialogTitle>
                                      <DialogDescription>{pattern.pattern_description}</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <h4 className="font-medium mb-2">{t('aiLearning.metrics')}</h4>
                                          <div className="space-y-1 text-sm">
                                            <p><span className="text-muted-foreground">{t('aiLearning.scope')}:</span> {pattern.scope}</p>
                                            <p><span className="text-muted-foreground">{t('aiLearning.sampleSize')}:</span> {pattern.sample_size}</p>
                                            <p><span className="text-muted-foreground">{t('aiLearning.confidence')}:</span> {pattern.confidence_score ? `${(parseFloat(pattern.confidence_score) * 100).toFixed(1)}%` : '-'}</p>
                                          </div>
                                        </div>
                                        <div>
                                          <h4 className="font-medium mb-2">{t('aiLearning.dates')}</h4>
                                          <div className="space-y-1 text-sm">
                                            <p><span className="text-muted-foreground">{t('aiLearning.created')}:</span> {formatDate(pattern.created_at)}</p>
                                            <p><span className="text-muted-foreground">{t('aiLearning.updated')}:</span> {formatDate(pattern.updated_at)}</p>
                                          </div>
                                        </div>
                                      </div>
                                      {pattern.ai_reasoning && (
                                        <div>
                                          <h4 className="font-medium mb-2">{t('aiLearning.aiReasoning')}</h4>
                                          <p className="text-sm bg-muted p-3 rounded-lg">{pattern.ai_reasoning}</p>
                                        </div>
                                      )}
                                      <div>
                                        <h4 className="font-medium mb-2">{t('aiLearning.patternData')}</h4>
                                        <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                                          {JSON.stringify(pattern.pattern_data, null, 2)}
                                        </pre>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="w-5 h-5" />
                      {t('aiLearning.opportunityPatterns')}
                    </CardTitle>
                    <CardDescription>
                      {t('aiLearning.opportunityPatternsDesc')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {filteredOpportunityPatterns.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Lightbulb className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>{t('aiLearning.noPatternsFound')}</p>
                        <p className="text-sm mt-2">{t('aiLearning.runAnalysisToDiscover')}</p>
                      </div>
                    ) : (
                      <Accordion type="single" collapsible className="space-y-2">
                        {filteredOpportunityPatterns.map((pattern) => (
                          <AccordionItem key={pattern.id} value={pattern.id} className="border rounded-lg px-3">
                            <AccordionTrigger className="hover:no-underline" data-testid={`accordion-opportunity-pattern-${pattern.id}`}>
                              <div className="flex items-center gap-3 text-left">
                                {getPatternTypeIcon(pattern.pattern_type)}
                                <div className="flex-1">
                                  <p className="font-medium" data-testid={`text-opp-pattern-name-${pattern.id}`}>{pattern.pattern_name}</p>
                                  <p className="text-xs text-muted-foreground">{pattern.pattern_type.replace('_', ' ')}</p>
                                </div>
                                {getConfidenceBadge(pattern.confidence_level)}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-2">
                              <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">{pattern.pattern_description}</p>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">{t('aiLearning.sampleSize')}:</span>
                                    <span className="ml-2 font-medium">{pattern.sample_size}</span>
                                  </div>
                                  {pattern.success_rate_improvement && (
                                    <div>
                                      <span className="text-muted-foreground">{t('aiLearning.successRateImprovement')}:</span>
                                      <span className="ml-2 font-medium text-green-500">
                                        +{parseFloat(pattern.success_rate_improvement).toFixed(1)}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {pattern.ai_recommendation && (
                                  <div className="p-3 bg-primary/5 rounded-lg">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Lightbulb className="w-4 h-4 text-primary" />
                                      <span className="font-medium text-sm">{t('aiLearning.aiRecommendation')}</span>
                                    </div>
                                    <p className="text-sm">{pattern.ai_recommendation}</p>
                                  </div>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  {t('aiLearning.aiInsights')}
                </CardTitle>
                <CardDescription>
                  {t('aiLearning.aiInsightsDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {totalPatterns === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Sparkles className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">{t('aiLearning.noInsightsYet')}</h3>
                    <p className="text-sm mb-4">{t('aiLearning.runAnalysisForInsights')}</p>
                    <div className="flex justify-center gap-2">
                      <Button
                        onClick={() => runCampaignAnalysis.mutate()}
                        disabled={runCampaignAnalysis.isPending}
                        data-testid="button-run-campaign-analysis-empty"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        {t('aiLearning.analyzeCampaigns')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => runOpportunityAnalysis.mutate()}
                        disabled={runOpportunityAnalysis.isPending}
                        data-testid="button-run-opportunity-analysis-empty"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        {t('aiLearning.analyzeOpportunities')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {[...allCampaignPatterns, ...allOpportunityPatterns]
                      .filter(p => p.ai_recommendation)
                      .slice(0, 5)
                      .map((pattern, idx) => (
                        <div key={pattern.id} className="p-4 border rounded-lg hover-elevate" data-testid={`card-insight-${idx}`}>
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              {getPatternTypeIcon(pattern.pattern_type)}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium">{pattern.pattern_name}</h4>
                                {getConfidenceBadge(pattern.confidence_level)}
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{pattern.ai_recommendation}</p>
                              {'expected_improvement_pct' in pattern && pattern.expected_improvement_pct && (
                                <Badge variant="outline" className="text-green-500">
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                  {t('aiLearning.potentialImprovement')}: +{parseFloat(pattern.expected_improvement_pct).toFixed(1)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  {t('aiLearning.analysisHistory')}
                </CardTitle>
                <CardDescription>
                  {t('aiLearning.analysisHistoryDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingRuns ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : allRuns.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">{t('aiLearning.noRunsYet')}</h3>
                    <p className="text-sm">{t('aiLearning.runFirstAnalysis')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allRuns.map((run) => (
                      <div key={run.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`card-run-${run.id}`}>
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${run.learner_type === 'campaign' ? 'bg-blue-500/10' : 'bg-purple-500/10'}`}>
                            {run.learner_type === 'campaign' ? (
                              <BarChart3 className="w-5 h-5 text-blue-500" />
                            ) : (
                              <Lightbulb className="w-5 h-5 text-purple-500" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium" data-testid={`text-run-type-${run.id}`}>
                                {run.learner_type === 'campaign' ? t('aiLearning.campaignAnalysis') : t('aiLearning.opportunityAnalysis')}
                              </p>
                              {getStatusBadge(run.status)}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                              <span data-testid={`text-run-started-${run.id}`}>{formatDate(run.started_at)}</span>
                              <span>{t('aiLearning.scope')}: {run.scope}</span>
                              <span>{t('aiLearning.duration')}: {formatDuration(run.duration_ms)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">{t('aiLearning.discovered')}:</span>
                              <span className="ml-1 font-medium text-green-500" data-testid={`text-run-discovered-${run.id}`}>{run.patterns_discovered}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t('aiLearning.updated')}:</span>
                              <span className="ml-1 font-medium text-blue-500">{run.patterns_updated}</span>
                            </div>
                            {run.ai_tokens_used > 0 && (
                              <div>
                                <span className="text-muted-foreground">{t('aiLearning.tokens')}:</span>
                                <span className="ml-1 font-medium">{run.ai_tokens_used.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                          {run.error_message && (
                            <p className="text-xs text-destructive mt-1">{run.error_message}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </div>
  );
}
