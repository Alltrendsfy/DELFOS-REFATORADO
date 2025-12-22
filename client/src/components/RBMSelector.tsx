import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, AlertTriangle, CheckCircle, Info, TrendingUp, Shield, Zap } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface RBMConfig {
  minMultiplier: number;
  maxMultiplier: number;
  defaultMultiplier: number;
  steps: number[];
  qualityGateChecks: string[];
}

interface RBMSelectorProps {
  campaignId?: string;
  initialValue?: number;
  maxAllowed?: number;
  onValueChange?: (value: number) => void;
  disabled?: boolean;
  showSimulation?: boolean;
}

export function RBMSelector({
  campaignId,
  initialValue = 1.0,
  maxAllowed = 5.0,
  onValueChange,
  disabled = false,
  showSimulation = true,
}: RBMSelectorProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [value, setValue] = useState(initialValue);
  const [simulationOpen, setSimulationOpen] = useState(false);

  // Sync internal state with prop changes (e.g., blueprint overrides)
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const { data: config, isLoading: configLoading } = useQuery<RBMConfig>({
    queryKey: ['/api/rbm/config'],
    staleTime: 60000,
  });

  const effectiveMax = Math.min(maxAllowed, config?.maxMultiplier || 5.0);

  const handleValueChange = (newValue: number[]) => {
    const v = newValue[0];
    setValue(v);
    onValueChange?.(v);
  };

  const getRiskLevel = (multiplier: number): { level: string; color: string; icon: typeof Shield } => {
    if (multiplier <= 1.5) return { level: t('rbm.riskLow'), color: 'bg-green-500', icon: Shield };
    if (multiplier <= 2.5) return { level: t('rbm.riskModerate'), color: 'bg-yellow-500', icon: Info };
    if (multiplier <= 3.5) return { level: t('rbm.riskHigh'), color: 'bg-orange-500', icon: AlertTriangle };
    return { level: t('rbm.riskVeryHigh'), color: 'bg-red-500', icon: Zap };
  };

  const risk = getRiskLevel(value);
  const RiskIcon = risk.icon;

  if (configLoading) {
    return (
      <Card data-testid="rbm-selector-card-loading">
        <CardHeader>
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="rbm-selector-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {t('rbm.title')}
        </CardTitle>
        <CardDescription>{t('rbm.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('rbm.multiplier')}</span>
            <Badge variant="secondary" className="text-lg px-3 py-1" data-testid="rbm-current-value">
              {value.toFixed(1)}x
            </Badge>
          </div>

          <Slider
            value={[value]}
            min={1.0}
            max={effectiveMax}
            step={0.5}
            onValueChange={handleValueChange}
            disabled={disabled}
            className="w-full"
            data-testid="rbm-slider"
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1.0x ({t('rbm.default')})</span>
            <span>{effectiveMax.toFixed(1)}x ({t('rbm.max')})</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          <RiskIcon className={`h-5 w-5 ${value > 1.5 ? 'text-yellow-500' : 'text-green-500'}`} />
          <div className="flex-1">
            <div className="text-sm font-medium">{t('rbm.riskLevel')}: {risk.level}</div>
            <div className="text-xs text-muted-foreground">
              {value === 1.0 
                ? t('rbm.noAdditionalRisk')
                : `${t('rbm.additionalRisk')} ${value.toFixed(1)}x`
              }
            </div>
          </div>
          <div className={`w-3 h-3 rounded-full ${risk.color}`} />
        </div>

        {value > 1.0 && (
          <Alert variant="default">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('rbm.qualityGateRequired')}</AlertTitle>
            <AlertDescription className="text-xs">
              {t('rbm.qualityGateDescription')}
            </AlertDescription>
          </Alert>
        )}

        {value > 1.0 && showSimulation && campaignId && (
          <RBMSimulationDialog
            campaignId={campaignId}
            multiplier={value}
            open={simulationOpen}
            onOpenChange={setSimulationOpen}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface RBMSimulationDialogProps {
  campaignId: string;
  multiplier: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RBMSimulationDialog({ campaignId, multiplier, open, onOpenChange }: RBMSimulationDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const requestMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/rbm/request', 'POST', { campaignId, multiplier });
    },
    onSuccess: (data: any) => {
      if (data.approved) {
        toast({
          title: t('rbm.approved'),
          description: `${t('rbm.approvedDescription')} ${data.multiplier}x`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/rbm/campaign', campaignId] });
        onOpenChange(false);
      } else {
        toast({
          title: t('rbm.notApproved'),
          description: data.reason || t('rbm.qualityGateFailed'),
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('rbm.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const { data: config } = useQuery<RBMConfig>({
    queryKey: ['/api/rbm/config'],
    staleTime: 60000,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full" data-testid="rbm-simulate-button">
          <Info className="h-4 w-4 mr-2" />
          {t('rbm.simulateAndRequest')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('rbm.simulationTitle')}</DialogTitle>
          <DialogDescription>
            {`${t('rbm.simulationDescription')} ${multiplier.toFixed(1)}x`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 rounded-lg bg-muted">
            <div className="text-center">
              <div className="text-3xl font-bold">{multiplier.toFixed(1)}x</div>
              <div className="text-sm text-muted-foreground">{t('rbm.requestedMultiplier')}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">{t('rbm.qualityGateChecks')}:</div>
            <ul className="space-y-1">
              {config?.qualityGateChecks.map((check, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <span>{check}</span>
                </li>
              ))}
            </ul>
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('rbm.warning')}</AlertTitle>
            <AlertDescription className="text-xs">
              {t('rbm.warningDescription')}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={() => requestMutation.mutate()} 
            disabled={requestMutation.isPending}
            data-testid="rbm-confirm-request-button"
          >
            {requestMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('rbm.requesting')}
              </>
            ) : (
              t('rbm.confirmRequest')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RBMStatusBadgeProps {
  status: string;
  multiplier: number;
}

export function RBMStatusBadge({ status, multiplier }: RBMStatusBadgeProps) {
  const getVariant = () => {
    switch (status) {
      case 'ACTIVE': return 'default';
      case 'REDUCED': return 'secondary';
      case 'ROLLED_BACK': return 'outline';
      default: return 'outline';
    }
  };

  if (status === 'DEFAULT' || multiplier <= 1.0) {
    return null;
  }

  return (
    <Badge variant={getVariant()} data-testid="rbm-status-badge">
      RBM {multiplier.toFixed(1)}x ({status})
    </Badge>
  );
}

export default RBMSelector;
