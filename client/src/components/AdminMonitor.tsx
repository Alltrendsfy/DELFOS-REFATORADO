import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Activity,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Eye,
  RefreshCw,
  Globe,
  List,
  LogIn,
  Rocket,
  AlertTriangle
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR, es, enUS } from 'date-fns/locale';

interface GlobalMetrics {
  totalUsers: number;
  activeUsers: number;
  totalCampaigns: number;
  activeCampaigns: number;
  paperCampaigns: number;
  realCampaigns: number;
  totalCapitalManaged: number;
  totalEquity: number;
  overallPnL: number;
  overallPnLPercentage: number;
  unreadAlerts: number;
}

interface CampaignDetail {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  portfolioId: string;
  portfolioName: string;
  portfolioMode: string;
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  initialCapital: number;
  currentEquity: number;
  pnl: number;
  pnlPercentage: number;
  startDate: string;
  endDate: string;
  createdAt: string;
}

interface AlertWithUser {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  details: any;
  isRead: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  campaign?: {
    id: string;
    name: string;
  } | null;
}

const translations = {
  en: {
    title: 'User & Campaign Monitor',
    description: 'Real-time monitoring of all users and their campaigns',
    tabs: {
      global: 'Global View',
      detailed: 'Detailed View',
      alerts: 'Alerts'
    },
    metrics: {
      totalUsers: 'Total Users',
      activeUsers: 'Active Users (7d)',
      totalCampaigns: 'Total Campaigns',
      activeCampaigns: 'Active Campaigns',
      paperCampaigns: 'Paper Mode',
      realCampaigns: 'Real Mode',
      capitalManaged: 'Capital Managed',
      totalEquity: 'Total Equity',
      overallPnL: 'Overall PnL',
      unreadAlerts: 'Unread Alerts'
    },
    table: {
      user: 'User',
      campaign: 'Campaign',
      mode: 'Mode',
      status: 'Status',
      capital: 'Capital',
      equity: 'Equity',
      pnl: 'PnL',
      created: 'Created'
    },
    alerts: {
      title: 'Activity Alerts',
      markAllRead: 'Mark All Read',
      noAlerts: 'No alerts yet',
      unread: 'unread alerts',
      new: 'NEW',
      types: {
        user_login: 'Login',
        campaign_created_paper: 'New Campaign (Paper)',
        campaign_created_real: 'New Campaign (Real)'
      }
    },
    refresh: 'Refresh',
    noData: 'No data available'
  },
  es: {
    title: 'Monitor de Usuarios y Campañas',
    description: 'Monitoreo en tiempo real de todos los usuarios y sus campañas',
    tabs: {
      global: 'Vista Global',
      detailed: 'Vista Detallada',
      alerts: 'Alertas'
    },
    metrics: {
      totalUsers: 'Total Usuarios',
      activeUsers: 'Usuarios Activos (7d)',
      totalCampaigns: 'Total Campañas',
      activeCampaigns: 'Campañas Activas',
      paperCampaigns: 'Modo Paper',
      realCampaigns: 'Modo Real',
      capitalManaged: 'Capital Gestionado',
      totalEquity: 'Patrimonio Total',
      overallPnL: 'PnL General',
      unreadAlerts: 'Alertas Sin Leer'
    },
    table: {
      user: 'Usuario',
      campaign: 'Campaña',
      mode: 'Modo',
      status: 'Estado',
      capital: 'Capital',
      equity: 'Patrimonio',
      pnl: 'PnL',
      created: 'Creado'
    },
    alerts: {
      title: 'Alertas de Actividad',
      markAllRead: 'Marcar Todas Leídas',
      noAlerts: 'Sin alertas aún',
      unread: 'alertas sin leer',
      new: 'NUEVO',
      types: {
        user_login: 'Login',
        campaign_created_paper: 'Nueva Campaña (Paper)',
        campaign_created_real: 'Nueva Campaña (Real)'
      }
    },
    refresh: 'Actualizar',
    noData: 'Sin datos disponibles'
  },
  'pt-BR': {
    title: 'Monitor de Usuários e Campanhas',
    description: 'Monitoramento em tempo real de todos os usuários e suas campanhas',
    tabs: {
      global: 'Visão Global',
      detailed: 'Visão Detalhada',
      alerts: 'Alertas'
    },
    metrics: {
      totalUsers: 'Total de Usuários',
      activeUsers: 'Usuários Ativos (7d)',
      totalCampaigns: 'Total de Campanhas',
      activeCampaigns: 'Campanhas Ativas',
      paperCampaigns: 'Modo Paper',
      realCampaigns: 'Modo Real',
      capitalManaged: 'Capital Gerenciado',
      totalEquity: 'Patrimônio Total',
      overallPnL: 'PnL Geral',
      unreadAlerts: 'Alertas Não Lidos'
    },
    table: {
      user: 'Usuário',
      campaign: 'Campanha',
      mode: 'Modo',
      status: 'Status',
      capital: 'Capital',
      equity: 'Patrimônio',
      pnl: 'PnL',
      created: 'Criado'
    },
    alerts: {
      title: 'Alertas de Atividade',
      markAllRead: 'Marcar Todas Lidas',
      noAlerts: 'Nenhum alerta ainda',
      unread: 'alertas não lidos',
      new: 'NOVO',
      types: {
        user_login: 'Login',
        campaign_created_paper: 'Nova Campanha (Paper)',
        campaign_created_real: 'Nova Campanha (Real)'
      }
    },
    refresh: 'Atualizar',
    noData: 'Sem dados disponíveis'
  }
};

export default function AdminMonitor() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const t = translations[language as keyof typeof translations] || translations['pt-BR'];
  const dateLocale = language === 'pt-BR' ? ptBR : language === 'es' ? es : enUS;

  const { data: globalMetrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<GlobalMetrics>({
    queryKey: ['/api/admin/monitor/global'],
    refetchInterval: 30000,
  });

  const { data: campaigns, isLoading: campaignsLoading, refetch: refetchCampaigns } = useQuery<CampaignDetail[]>({
    queryKey: ['/api/admin/monitor/campaigns'],
    refetchInterval: 30000,
  });

  const { data: alerts, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<AlertWithUser[]>({
    queryKey: ['/api/admin/monitor/alerts'],
    refetchInterval: 10000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/monitor/alerts/mark-all-read', 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/monitor/alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/monitor/global'] });
      toast({ title: 'Alertas marcados como lidos' });
    }
  });

  const markReadMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return await apiRequest(`/api/admin/monitor/alerts/${alertId}/read`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/monitor/alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/monitor/global'] });
    }
  });

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'user_login':
        return <LogIn className="h-4 w-4" />;
      case 'campaign_created_paper':
        return <Rocket className="h-4 w-4" />;
      case 'campaign_created_real':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'important':
        return 'bg-destructive text-destructive-foreground';
      case 'warning':
        return 'bg-yellow-500 text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getModeColor = (mode: string) => {
    return mode === 'real' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500 text-white';
      case 'completed':
        return 'bg-muted text-muted-foreground';
      case 'paused':
        return 'bg-yellow-500 text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const unreadCount = alerts?.filter(a => !a.isRead).length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t.title}</h2>
          <p className="text-muted-foreground">{t.description}</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => {
            refetchMetrics();
            refetchCampaigns();
            refetchAlerts();
          }}
          data-testid="button-refresh-monitor"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          {t.refresh}
        </Button>
      </div>

      <Tabs defaultValue="global" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="global" data-testid="tab-monitor-global">
            <Globe className="h-4 w-4 mr-2" />
            {t.tabs.global}
          </TabsTrigger>
          <TabsTrigger value="detailed" data-testid="tab-monitor-detailed">
            <List className="h-4 w-4 mr-2" />
            {t.tabs.detailed}
          </TabsTrigger>
          <TabsTrigger value="alerts" className="relative" data-testid="tab-monitor-alerts">
            {unreadCount > 0 ? <BellRing className="h-4 w-4 mr-2 text-destructive" /> : <Bell className="h-4 w-4 mr-2" />}
            {t.tabs.alerts}
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-4">
          {metricsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : globalMetrics ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t.metrics.totalUsers}</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="metric-total-users">{globalMetrics.totalUsers}</div>
                  <p className="text-xs text-muted-foreground">
                    {globalMetrics.activeUsers} {t.metrics.activeUsers}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t.metrics.activeCampaigns}</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="metric-active-campaigns">{globalMetrics.activeCampaigns}</div>
                  <p className="text-xs text-muted-foreground">
                    {globalMetrics.totalCampaigns} {t.metrics.totalCampaigns.toLowerCase()}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t.metrics.paperCampaigns}</CardTitle>
                  <Badge variant="secondary" className="bg-blue-500 text-white">PAPER</Badge>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="metric-paper-campaigns">{globalMetrics.paperCampaigns}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t.metrics.realCampaigns}</CardTitle>
                  <Badge variant="secondary" className="bg-green-500 text-white">REAL</Badge>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="metric-real-campaigns">{globalMetrics.realCampaigns}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t.metrics.capitalManaged}</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="metric-capital-managed">
                    ${globalMetrics.totalCapitalManaged.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t.metrics.totalEquity}</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="metric-total-equity">
                    ${globalMetrics.totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t.metrics.overallPnL}</CardTitle>
                  {globalMetrics.overallPnL >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${globalMetrics.overallPnL >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="metric-overall-pnl">
                    {globalMetrics.overallPnL >= 0 ? '+' : ''}${globalMetrics.overallPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {globalMetrics.overallPnLPercentage >= 0 ? '+' : ''}{globalMetrics.overallPnLPercentage.toFixed(2)}%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t.metrics.unreadAlerts}</CardTitle>
                  <BellRing className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="metric-unread-alerts">{globalMetrics.unreadAlerts}</div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">{t.noData}</div>
          )}
        </TabsContent>

        <TabsContent value="detailed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.tabs.detailed}</CardTitle>
              <CardDescription>{t.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : campaigns && campaigns.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.table.user}</TableHead>
                        <TableHead>{t.table.campaign}</TableHead>
                        <TableHead>{t.table.mode}</TableHead>
                        <TableHead>{t.table.status}</TableHead>
                        <TableHead className="text-right">{t.table.capital}</TableHead>
                        <TableHead className="text-right">{t.table.equity}</TableHead>
                        <TableHead className="text-right">{t.table.pnl}</TableHead>
                        <TableHead>{t.table.created}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map((campaign) => (
                        <TableRow key={campaign.campaignId} data-testid={`row-campaign-${campaign.campaignId}`}>
                          <TableCell>
                            <div className="font-medium text-sm">{campaign.email}</div>
                            {(campaign.firstName || campaign.lastName) && (
                              <div className="text-xs text-muted-foreground">
                                {campaign.firstName} {campaign.lastName}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{campaign.campaignName}</div>
                            <div className="text-xs text-muted-foreground">{campaign.portfolioName}</div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getModeColor(campaign.portfolioMode)}>
                              {campaign.portfolioMode.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(campaign.campaignStatus)}>
                              {campaign.campaignStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${campaign.initialCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${campaign.currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${campaign.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {campaign.pnl >= 0 ? '+' : ''}{campaign.pnlPercentage.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(campaign.createdAt), 'dd/MM/yy HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground">{t.noData}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t.alerts.title}</CardTitle>
                <CardDescription>{unreadCount} {t.alerts.unread}</CardDescription>
              </div>
              {unreadCount > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  data-testid="button-mark-all-read"
                >
                  <CheckCheck className="h-4 w-4 mr-2" />
                  {t.alerts.markAllRead}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : alerts && alerts.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {alerts.map((alert) => (
                      <div 
                        key={alert.id} 
                        className={`p-4 rounded-lg border ${!alert.isRead ? 'bg-muted/50 border-primary/20' : 'bg-background'}`}
                        data-testid={`alert-${alert.id}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className={`p-2 rounded-full ${getSeverityColor(alert.severity)}`}>
                              {getAlertIcon(alert.alertType)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{alert.title}</span>
                                <Badge variant="outline" className="text-xs">
                                  {t.alerts.types[alert.alertType as keyof typeof t.alerts.types] || alert.alertType}
                                </Badge>
                                {!alert.isRead && (
                                  <Badge variant="destructive" className="text-xs">{t.alerts.new}</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                <span>{alert.user.email}</span>
                                <span>•</span>
                                <span>{formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true, locale: dateLocale })}</span>
                              </div>
                            </div>
                          </div>
                          {!alert.isRead && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => markReadMutation.mutate(alert.id)}
                              disabled={markReadMutation.isPending}
                              data-testid={`button-mark-read-${alert.id}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground">{t.alerts.noAlerts}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
