import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Target, 
  Scale, 
  Activity, 
  RefreshCw, 
  ClipboardCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  Timer
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface OperationalStatus {
  currentPhase: 'selection' | 'distribution' | 'trading' | 'rebalance' | 'audit';
  lastSelectionTime: string | null;
  lastDistributionTime: string | null;
  lastRebalanceTime: string | null;
  lastAuditTime: string | null;
  nextRebalanceTime: string | null;
  tradingActive: boolean;
  stalenessLevel: 'fresh' | 'warn' | 'hard' | 'kill_switch';
  assetsSelected: number;
  activePositions: number;
  dailyPnL: string;
  hitRate: string;
}

interface TimelineStep {
  id: string;
  phase: string;
  time: string;
  icon: React.ReactNode;
  status: 'completed' | 'active' | 'pending' | 'warning';
  description: string;
  lastRun?: string | null;
}

export default function Operations() {
  const { t, language } = useLanguage();

  const { data: status, isLoading } = useQuery<OperationalStatus>({
    queryKey: ['/api/operations/status'],
    refetchInterval: 5000,
  });

  const locale = language === 'pt-BR' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US';

  const formatTime = (isoString: string | null | undefined): string => {
    if (!isoString) return t('operations.never');
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return t('operations.never');
    }
  };

  const formatDateTime = (isoString: string | null | undefined): string => {
    if (!isoString) return t('operations.never');
    try {
      const date = new Date(isoString);
      return date.toLocaleString(locale, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return t('operations.never');
    }
  };

  const getPhaseStatus = (phase: string): 'completed' | 'active' | 'pending' | 'warning' => {
    if (!status) return 'pending';
    
    const phaseOrder = ['selection', 'distribution', 'trading', 'rebalance', 'audit'];
    const currentIndex = phaseOrder.indexOf(status.currentPhase);
    const phaseIndex = phaseOrder.indexOf(phase);
    
    if (phase === status.currentPhase) {
      if (status.stalenessLevel === 'warn' || status.stalenessLevel === 'hard') {
        return 'warning';
      }
      return 'active';
    }
    
    if (phaseIndex < currentIndex) return 'completed';
    return 'pending';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30"><CheckCircle2 className="w-3 h-3 mr-1" />{t('operations.status.completed')}</Badge>;
      case 'active':
        return <Badge className="bg-primary/20 text-primary border-primary/30"><PlayCircle className="w-3 h-3 mr-1" />{t('operations.status.active')}</Badge>;
      case 'warning':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30"><AlertCircle className="w-3 h-3 mr-1" />{t('operations.status.degraded')}</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground"><Timer className="w-3 h-3 mr-1" />{t('operations.status.pending')}</Badge>;
    }
  };

  const timelineSteps: TimelineStep[] = [
    {
      id: 'selection',
      phase: 'selection',
      time: '00:00',
      icon: <Target className="w-5 h-5" />,
      status: getPhaseStatus('selection'),
      description: t('operations.selection.description'),
      lastRun: status?.lastSelectionTime,
    },
    {
      id: 'distribution',
      phase: 'distribution',
      time: '00:05',
      icon: <Scale className="w-5 h-5" />,
      status: getPhaseStatus('distribution'),
      description: t('operations.distribution.description'),
      lastRun: status?.lastDistributionTime,
    },
    {
      id: 'trading',
      phase: 'trading',
      time: t('operations.trading.time'),
      icon: <Activity className="w-5 h-5" />,
      status: getPhaseStatus('trading'),
      description: t('operations.trading.description'),
      lastRun: null,
    },
    {
      id: 'rebalance',
      phase: 'rebalance',
      time: t('operations.rebalance.time'),
      icon: <RefreshCw className="w-5 h-5" />,
      status: getPhaseStatus('rebalance'),
      description: t('operations.rebalance.description'),
      lastRun: status?.lastRebalanceTime,
    },
    {
      id: 'audit',
      phase: 'audit',
      time: t('operations.audit.time'),
      icon: <ClipboardCheck className="w-5 h-5" />,
      status: getPhaseStatus('audit'),
      description: t('operations.audit.description'),
      lastRun: status?.lastAuditTime,
    },
  ];

  const getStalenessColor = (level: string) => {
    switch (level) {
      case 'fresh': return 'text-success';
      case 'warn': return 'text-warning';
      case 'hard': return 'text-destructive';
      case 'kill_switch': return 'text-destructive animate-pulse';
      default: return 'text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-48" /></CardContent></Card>
      </div>
    );
  }

  const currentPhaseIndex = timelineSteps.findIndex(s => s.phase === status?.currentPhase);
  const progressPercentage = status ? ((currentPhaseIndex + 1) / timelineSteps.length) * 100 : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-operations-title">
            {t('operations.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('operations.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t('operations.nextRebalance')}: {formatTime(status?.nextRebalanceTime)}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{t('operations.assetsSelected')}</p>
              <Target className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-2" data-testid="text-assets-selected">
              {status?.assetsSelected ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">{t('operations.of100')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{t('operations.activePositions')}</p>
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-2" data-testid="text-active-positions">
              {status?.activePositions ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">{t('operations.openPositions')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{t('operations.dailyPnL')}</p>
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <p className={`text-2xl font-bold font-mono mt-2 ${parseFloat(status?.dailyPnL || '0') >= 0 ? 'text-success' : 'text-destructive'}`} data-testid="text-daily-pnl">
              {parseFloat(status?.dailyPnL || '0') >= 0 ? '+' : ''}{status?.dailyPnL ?? '0.00'}%
            </p>
            <p className="text-xs text-muted-foreground">{t('operations.today')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{t('operations.dataStatus')}</p>
              <Activity className={`w-4 h-4 ${getStalenessColor(status?.stalenessLevel || 'fresh')}`} />
            </div>
            <p className={`text-2xl font-bold mt-2 ${getStalenessColor(status?.stalenessLevel || 'fresh')}`} data-testid="text-staleness">
              {t(`operations.staleness.${status?.stalenessLevel || 'fresh'}`)}
            </p>
            <p className="text-xs text-muted-foreground">{t('operations.dataQuality')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {t('operations.timeline.title')}
          </CardTitle>
          <CardDescription>{t('operations.timeline.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">{t('operations.cycleProgress')}</span>
              <span className="font-medium">{progressPercentage.toFixed(0)}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          <div className="relative">
            <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-border" />
            
            <div className="space-y-6">
              {timelineSteps.map((step, index) => (
                <div key={step.id} className="relative flex items-start gap-4">
                  <div className={`
                    relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 
                    ${step.status === 'active' ? 'bg-primary/10 border-primary text-primary' : ''}
                    ${step.status === 'completed' ? 'bg-success/10 border-success text-success' : ''}
                    ${step.status === 'warning' ? 'bg-warning/10 border-warning text-warning' : ''}
                    ${step.status === 'pending' ? 'bg-muted border-muted-foreground/30 text-muted-foreground' : ''}
                  `}>
                    {step.icon}
                  </div>
                  
                  <div className="flex-1 pt-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold">{t(`operations.${step.phase}.title`)}</h3>
                      {getStatusBadge(step.status)}
                      <span className="text-sm text-muted-foreground ml-auto">{step.time}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                    {step.lastRun && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-muted-foreground mt-1 cursor-help">
                            {t('operations.lastRun')}: {formatDateTime(step.lastRun)}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('operations.lastExecution')}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('operations.tradingWindow.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('operations.tradingWindow.signals')}</span>
                <Badge variant={status?.tradingActive ? 'default' : 'outline'}>
                  {status?.tradingActive ? t('operations.tradingWindow.active') : t('operations.tradingWindow.paused')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('operations.tradingWindow.oco')}</span>
                <span className="text-sm">{t('operations.tradingWindow.ocoEnabled')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('operations.tradingWindow.staleness')}</span>
                <Badge variant="outline" className={getStalenessColor(status?.stalenessLevel || 'fresh')}>
                  {t(`operations.staleness.${status?.stalenessLevel || 'fresh'}`)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('operations.rebalanceInfo.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('operations.rebalanceInfo.interval')}</span>
                <span className="text-sm font-medium">8h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('operations.rebalanceInfo.lastRun')}</span>
                <span className="text-sm">{formatDateTime(status?.lastRebalanceTime)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('operations.rebalanceInfo.nextRun')}</span>
                <span className="text-sm font-medium">{formatDateTime(status?.nextRebalanceTime)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
