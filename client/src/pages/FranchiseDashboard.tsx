import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Building2, 
  Users,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  Activity,
  ArrowRight,
  Play,
  Pause,
  CheckCircle,
  AlertTriangle,
  Bot,
  Eye,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';

interface FranchiseDashboardData {
  franchise: {
    id: string;
    name: string;
    status: string;
    under_audit: boolean;
    country: string;
    created_at: string;
  };
  plan: {
    name: string;
    max_campaigns: number;
    royalty_percentage: string;
  } | null;
  role: string | null;
  permissions: Record<string, boolean>;
  stats: {
    userCount: number;
    totalCampaigns: number;
    activeCampaigns: number;
    pausedCampaigns: number;
    completedCampaigns: number;
    totalEquity: string;
    totalPnL: string;
    pnlPercentage: string;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    symbol: string | null;
    message: string | null;
    created_at: string;
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    initial_capital: string;
    current_equity: string | null;
    started_at: string | null;
  }>;
}

interface FranchisorSummary {
  isFranchisor: boolean;
  franchiseCount: number;
  activeCount: number;
  message: string;
}

export default function FranchiseDashboard() {
  const { t } = useLanguage();

  const { data, isLoading, error } = useQuery<FranchiseDashboardData | FranchisorSummary>({
    queryKey: ['/api/franchise-dashboard'],
  });

  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case 'master':
        return <Badge variant="default" data-testid="badge-role">{t('franchise.roles.master')}</Badge>;
      case 'operator':
        return <Badge variant="secondary" data-testid="badge-role">{t('franchise.roles.operator')}</Badge>;
      case 'analyst':
        return <Badge variant="outline" data-testid="badge-role">{t('franchise.roles.analyst')}</Badge>;
      case 'finance':
        return <Badge variant="outline" data-testid="badge-role">{t('franchise.roles.finance')}</Badge>;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string, underAudit: boolean) => {
    if (underAudit) {
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30"><AlertTriangle className="w-3 h-3 mr-1" />{t('franchise.status.audit')}</Badge>;
    }
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />{t('franchise.status.active')}</Badge>;
      case 'suspended':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><Pause className="w-3 h-3 mr-1" />{t('franchise.status.suspended')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCampaignStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="default" className="bg-green-600"><Play className="w-3 h-3 mr-1" />{t('campaign.status.running')}</Badge>;
      case 'paused':
        return <Badge variant="secondary"><Pause className="w-3 h-3 mr-1" />{t('campaign.status.paused')}</Badge>;
      case 'completed':
      case 'stopped':
        return <Badge variant="outline"><CheckCircle className="w-3 h-3 mr-1" />{t('campaign.status.completed')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'order_placed':
      case 'order_filled':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'signal_generated':
        return <Activity className="w-4 h-4 text-blue-500" />;
      case 'circuit_breaker':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Bot className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    const errorData = error as any;
    if (errorData?.code === 'NO_FRANCHISE') {
      return (
        <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
          <Building2 className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">{t('franchiseDashboard.noFranchise')}</h2>
          <p className="text-muted-foreground text-center max-w-md mb-4">
            {t('franchiseDashboard.noFranchiseDesc')}
          </p>
          <Button asChild>
            <Link href="/">{t('nav.dashboard')}</Link>
          </Button>
        </div>
      );
    }
    return (
      <div className="p-6">
        <Card className="border-red-500/30">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <p>{t('common.error')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle franchisor summary view
  if (data && 'isFranchisor' in data && data.isFranchisor) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('franchiseDashboard.title')}</h1>
            <p className="text-muted-foreground">{t('franchiseDashboard.franchisorView')}</p>
          </div>
          <Button asChild>
            <Link href="/franchise-admin">
              <Building2 className="w-4 h-4 mr-2" />
              {t('nav.franchises')}
            </Link>
          </Button>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">{t('franchiseDashboard.totalFranchises')}</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-franchises">{data.franchiseCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">{t('franchiseDashboard.activeFranchises')}</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-active-franchises">{data.activeCount}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Full franchise member dashboard
  const dashboardData = data as FranchiseDashboardData;
  const pnl = parseFloat(dashboardData.stats.totalPnL);
  const pnlPercentage = parseFloat(dashboardData.stats.pnlPercentage);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-lg">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold" data-testid="text-franchise-name">{dashboardData.franchise.name}</h1>
              {getStatusBadge(dashboardData.franchise.status, dashboardData.franchise.under_audit)}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              {getRoleBadge(dashboardData.role)}
              {dashboardData.plan && (
                <span className="text-sm">• {dashboardData.plan.name}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline">
            <Link href={`/franchise/${dashboardData.franchise.id}`}>
              <Eye className="w-4 h-4 mr-2" />
              {t('franchiseDashboard.viewDetails')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/franchise/royalties" data-testid="link-franchise-royalties">
              <DollarSign className="w-4 h-4 mr-2" />
              {t('franchiseRoyalties.title')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/franchise/reports" data-testid="link-franchise-reports">
              <BarChart3 className="w-4 h-4 mr-2" />
              {t('franchiseReports.title')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchiseDashboard.totalEquity')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-equity">
              ${parseFloat(dashboardData.stats.totalEquity).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboardData.stats.totalCampaigns} {t('franchiseDashboard.campaigns')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchiseDashboard.totalPnL')}</CardTitle>
            {pnl >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-total-pnl">
              {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()} USD
            </div>
            <p className={`text-xs ${pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchiseDashboard.activeCampaigns')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-campaigns">{dashboardData.stats.activeCampaigns}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardData.stats.pausedCampaigns} {t('campaign.status.paused')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchiseDashboard.teamMembers')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-user-count">{dashboardData.stats.userCount}</div>
            <p className="text-xs text-muted-foreground">
              {t('franchiseDashboard.activeUsers')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns and Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Campaigns */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>{t('franchiseDashboard.recentCampaigns')}</CardTitle>
              <CardDescription>{t('franchiseDashboard.recentCampaignsDesc')}</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/campaigns">
                {t('common.viewAll')}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {dashboardData.campaigns.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('campaign.form.name')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-right">{t('campaign.equity')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboardData.campaigns.map((campaign) => {
                    const equity = campaign.current_equity ? parseFloat(campaign.current_equity) : parseFloat(campaign.initial_capital);
                    const initial = parseFloat(campaign.initial_capital);
                    const campaignPnl = equity - initial;
                    
                    return (
                      <TableRow key={campaign.id}>
                        <TableCell>
                          <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:underline" data-testid={`link-campaign-${campaign.id}`}>
                            {campaign.name}
                          </Link>
                        </TableCell>
                        <TableCell>{getCampaignStatusBadge(campaign.status)}</TableCell>
                        <TableCell className="text-right">
                          <div>${equity.toLocaleString()}</div>
                          <div className={`text-xs ${campaignPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {campaignPnl >= 0 ? '+' : ''}{campaignPnl.toFixed(2)}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>{t('franchiseDashboard.noCampaigns')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>{t('franchiseDashboard.recentActivity')}</CardTitle>
            <CardDescription>{t('franchiseDashboard.recentActivityDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboardData.recentActivity.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {dashboardData.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                    {getActivityIcon(activity.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {activity.symbol && <span className="text-primary">{activity.symbol}</span>}
                        {activity.symbol && ' • '}
                        {activity.type.replace(/_/g, ' ')}
                      </p>
                      {activity.message && (
                        <p className="text-xs text-muted-foreground truncate">{activity.message}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(activity.created_at), 'HH:mm')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>{t('franchiseDashboard.noActivity')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
