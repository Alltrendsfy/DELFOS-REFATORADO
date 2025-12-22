import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw,
  TrendingUp,
  Activity,
  Zap,
  BarChart3,
  ArrowLeft
} from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';

interface FraudAlert {
  id: string;
  franchise_id: string | null;
  campaign_id: string | null;
  user_id: string | null;
  alert_type: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  detection_data: Record<string, unknown>;
  symbol: string | null;
  activity_start: string | null;
  activity_end: string | null;
  investigated_by: string | null;
  investigated_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface FraudStats {
  totalAlerts: number;
  newAlerts: number;
  investigatingAlerts: number;
  confirmedAlerts: number;
  dismissedAlerts: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
}

export default function FraudAlerts() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: alertsData, isLoading: alertsLoading } = useQuery<{ alerts: FraudAlert[]; total: number }>({
    queryKey: ['/api/admin/fraud-alerts', statusFilter, severityFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (severityFilter !== 'all') params.append('severity', severityFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      const response = await fetch(`/api/admin/fraud-alerts?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch alerts');
      return response.json();
    }
  });

  const { data: stats, isLoading: statsLoading } = useQuery<FraudStats>({
    queryKey: ['/api/admin/fraud-alerts/stats']
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/admin/fraud-alerts/scan', 'POST');
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fraud-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fraud-alerts/stats'] });
      toast({ 
        title: t('fraudAlerts.scanComplete'), 
        description: `${data.alertsCreated} ${t('fraudAlerts.alertsCreated')}` 
      });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest(`/api/admin/fraud-alerts/${id}`, 'PATCH', { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fraud-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fraud-alerts/stats'] });
      toast({ title: t('common.success'), description: t('fraudAlerts.statusUpdated') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      low: 'secondary',
      medium: 'outline',
      high: 'default',
      critical: 'destructive'
    };
    const colors: Record<string, string> = {
      low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    return (
      <Badge className={colors[severity] || ''} variant={variants[severity] || 'default'}>
        {t(`fraudAlerts.severity.${severity}`)}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const icons: Record<string, JSX.Element> = {
      new: <Clock className="w-3 h-3 mr-1" />,
      investigating: <Search className="w-3 h-3 mr-1" />,
      dismissed: <XCircle className="w-3 h-3 mr-1" />,
      confirmed: <CheckCircle2 className="w-3 h-3 mr-1" />
    };
    const colors: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      investigating: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      dismissed: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      confirmed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    return (
      <Badge className={`flex items-center ${colors[status] || ''}`}>
        {icons[status]}
        {t(`fraudAlerts.status.${status}`)}
      </Badge>
    );
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, JSX.Element> = {
      abnormal_volume: <BarChart3 className="w-4 h-4" />,
      atypical_hours: <Clock className="w-4 h-4" />,
      rapid_position_changes: <Zap className="w-4 h-4" />,
      suspicious_win_rate: <TrendingUp className="w-4 h-4" />
    };
    return icons[type] || <Activity className="w-4 h-4" />;
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/franchise-admin">
            <Button variant="ghost" size="icon" data-testid="button-back-franchise-admin">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <ShieldAlert className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-fraud-alerts-title">
              {t('fraudAlerts.title')}
            </h1>
            <p className="text-muted-foreground">{t('fraudAlerts.description')}</p>
          </div>
        </div>
        <Button 
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          data-testid="button-run-scan"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
          {t('fraudAlerts.runScan')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card data-testid="card-stats-total">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('fraudAlerts.stats.total')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-stats-total">
                {stats?.totalAlerts ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stats-new">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('fraudAlerts.stats.new')}</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-blue-600" data-testid="text-stats-new">
                {stats?.newAlerts ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stats-investigating">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('fraudAlerts.stats.investigating')}</CardTitle>
            <Search className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-purple-600" data-testid="text-stats-investigating">
                {stats?.investigatingAlerts ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stats-confirmed">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('fraudAlerts.stats.confirmed')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-red-600" data-testid="text-stats-confirmed">
                {stats?.confirmedAlerts ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stats-dismissed">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('fraudAlerts.stats.dismissed')}</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-muted-foreground" data-testid="text-stats-dismissed">
                {stats?.dismissedAlerts ?? 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>{t('fraudAlerts.alertsTable')}</CardTitle>
              <CardDescription>{t('fraudAlerts.alertsTableDescription')}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <SelectValue placeholder={t('fraudAlerts.filterStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('fraudAlerts.allStatuses')}</SelectItem>
                  <SelectItem value="new">{t('fraudAlerts.status.new')}</SelectItem>
                  <SelectItem value="investigating">{t('fraudAlerts.status.investigating')}</SelectItem>
                  <SelectItem value="confirmed">{t('fraudAlerts.status.confirmed')}</SelectItem>
                  <SelectItem value="dismissed">{t('fraudAlerts.status.dismissed')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-severity-filter">
                  <SelectValue placeholder={t('fraudAlerts.filterSeverity')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('fraudAlerts.allSeverities')}</SelectItem>
                  <SelectItem value="low">{t('fraudAlerts.severity.low')}</SelectItem>
                  <SelectItem value="medium">{t('fraudAlerts.severity.medium')}</SelectItem>
                  <SelectItem value="high">{t('fraudAlerts.severity.high')}</SelectItem>
                  <SelectItem value="critical">{t('fraudAlerts.severity.critical')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
                  <SelectValue placeholder={t('fraudAlerts.filterType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('fraudAlerts.allTypes')}</SelectItem>
                  <SelectItem value="abnormal_volume">{t('fraudAlerts.types.abnormal_volume')}</SelectItem>
                  <SelectItem value="atypical_hours">{t('fraudAlerts.types.atypical_hours')}</SelectItem>
                  <SelectItem value="rapid_position_changes">{t('fraudAlerts.types.rapid_position_changes')}</SelectItem>
                  <SelectItem value="suspicious_win_rate">{t('fraudAlerts.types.suspicious_win_rate')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {alertsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : alertsData?.alerts && alertsData.alerts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('fraudAlerts.columns.type')}</TableHead>
                  <TableHead>{t('fraudAlerts.columns.title')}</TableHead>
                  <TableHead>{t('fraudAlerts.columns.severity')}</TableHead>
                  <TableHead>{t('fraudAlerts.columns.status')}</TableHead>
                  <TableHead>{t('fraudAlerts.columns.date')}</TableHead>
                  <TableHead>{t('admin.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertsData.alerts.map((alert) => (
                  <TableRow key={alert.id} data-testid={`row-alert-${alert.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(alert.alert_type)}
                        <span className="text-sm">{t(`fraudAlerts.types.${alert.alert_type}`)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        <p className="font-medium truncate">{alert.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{alert.description}</p>
                      </div>
                    </TableCell>
                    <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                    <TableCell>{getStatusBadge(alert.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(alert.created_at), 'PP HH:mm')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {alert.status === 'new' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ id: alert.id, status: 'investigating' })}
                            disabled={updateStatusMutation.isPending}
                            data-testid={`button-investigate-${alert.id}`}
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        )}
                        {(alert.status === 'new' || alert.status === 'investigating') && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatusMutation.mutate({ id: alert.id, status: 'dismissed' })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-dismiss-${alert.id}`}
                            >
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatusMutation.mutate({ id: alert.id, status: 'confirmed' })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-confirm-${alert.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldAlert className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('fraudAlerts.noAlerts')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
