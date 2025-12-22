import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePersona } from "@/hooks/usePersona";
import { Link } from "wouter";
import { 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Clock,
  Zap,
  Shield
} from "lucide-react";

interface RBMAggregateMetrics {
  summary: {
    totalActiveCampaigns: number;
    rbmActiveCampaigns: number;
    rbmReducedCampaigns: number;
    rbmPendingCampaigns: number;
    averageMultiplier: number;
  };
  multiplierDistribution: Record<string, number>;
  activeCampaignsWithRBM: Array<{
    id: string;
    name: string;
    multiplier: number;
    status: string;
    approvedAt: string | null;
    investorProfile: string;
  }>;
  recentEvents: Array<{
    id: string;
    campaign_id: string;
    event_type: string;
    previous_value: string | null;
    new_value: string | null;
    reason: string | null;
    created_at: string;
  }>;
  rollbackCount24h: number;
  approvalCount24h: number;
}

function AccessDenied() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center h-full p-8">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <ShieldAlert className="w-12 h-12 mx-auto text-destructive mb-4" />
          <CardTitle>{t('accessDenied.title') || 'Access Denied'}</CardTitle>
          <CardDescription>{t('accessDenied.message') || 'You do not have permission to access this page.'}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue, 
  variant = "default" 
}: { 
  title: string; 
  value: string | number; 
  icon: any; 
  trend?: "up" | "down" | "neutral"; 
  trendValue?: string;
  variant?: "default" | "success" | "warning" | "destructive";
}) {
  const variantClasses = {
    default: "text-foreground",
    success: "text-green-600",
    warning: "text-yellow-600",
    destructive: "text-red-600",
  };

  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : null;

  return (
    <Card data-testid={`metric-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${variantClasses[variant]}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <div className={`text-2xl font-bold ${variantClasses[variant]}`}>{value}</div>
          {TrendIcon && trendValue && (
            <span className={`flex items-center text-xs ${trend === "up" ? "text-green-600" : "text-red-600"}`}>
              <TrendIcon className="h-3 w-3" />
              {trendValue}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MultiplierDistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const { t } = useLanguage();
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  
  const colors: Record<string, string> = {
    '1.0x': 'bg-gray-400',
    '1.5x': 'bg-green-400',
    '2.0x': 'bg-blue-400',
    '2.5x': 'bg-yellow-400',
    '3.0x': 'bg-orange-400',
    '3.5x+': 'bg-red-400',
  };

  return (
    <div className="space-y-4">
      {Object.entries(distribution).map(([key, count]) => {
        const percentage = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{key}</span>
              <span className="text-muted-foreground">{count} {t('rbm.campaigns') || 'campaigns'} ({percentage.toFixed(0)}%)</span>
            </div>
            <Progress value={percentage} className={`h-2 ${colors[key] || 'bg-gray-400'}`} />
          </div>
        );
      })}
    </div>
  );
}

function EventBadge({ eventType }: { eventType: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
    'APPROVE': { variant: 'default', label: 'Approved' },
    'REQUEST': { variant: 'secondary', label: 'Requested' },
    'DENY': { variant: 'destructive', label: 'Denied' },
    'REDUCE': { variant: 'destructive', label: 'Reduced' },
    'RESTORE': { variant: 'outline', label: 'Restored' },
  };

  const { variant, label } = config[eventType] || { variant: 'secondary', label: eventType };

  return <Badge variant={variant}>{label}</Badge>;
}

function RecentEventsTable({ events }: { events: RBMAggregateMetrics['recentEvents'] }) {
  const { t } = useLanguage();

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('rbm.noRecentEvents') || 'No recent RBM events'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            <EventBadge eventType={event.event_type} />
            <div>
              <div className="text-sm font-medium">
                {event.previous_value || '1.0'}x → {event.new_value || '1.0'}x
              </div>
              {event.reason && (
                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {event.reason}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {new Date(event.created_at).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActiveRBMCampaignsTable({ campaigns }: { campaigns: RBMAggregateMetrics['activeCampaignsWithRBM'] }) {
  const { t } = useLanguage();

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('rbm.noActiveCampaigns') || 'No campaigns with active RBM'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {campaigns.map((campaign) => (
        <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate cursor-pointer">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                campaign.multiplier >= 3.0 ? 'bg-red-100 text-red-600' : 
                campaign.multiplier >= 2.0 ? 'bg-orange-100 text-orange-600' : 
                'bg-green-100 text-green-600'
              }`}>
                {campaign.multiplier.toFixed(1)}x
              </div>
              <div>
                <div className="text-sm font-medium">{campaign.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t('rbm.profile') || 'Profile'}: {campaign.investorProfile || 'M'}
                </div>
              </div>
            </div>
            <Badge variant={campaign.status === 'ACTIVE' ? 'default' : 'secondary'}>
              {campaign.status}
            </Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function FranchisorRBMDashboard() {
  const { t } = useLanguage();
  const { isFranchisor, isLoading: personaLoading } = usePersona();

  const { data: metrics, isLoading } = useQuery<RBMAggregateMetrics>({
    queryKey: ['/api/rbm/aggregate-metrics'],
    enabled: isFranchisor,
    refetchInterval: 30000,
  });

  if (personaLoading || isLoading) {
    return <LoadingSkeleton />;
  }

  if (!isFranchisor) {
    return <AccessDenied />;
  }

  const summary = metrics?.summary || {
    totalActiveCampaigns: 0,
    rbmActiveCampaigns: 0,
    rbmReducedCampaigns: 0,
    rbmPendingCampaigns: 0,
    averageMultiplier: 1.0,
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6" data-testid="page-franchisor-rbm-dashboard">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            {t('rbm.dashboardTitle') || 'RBM Network Dashboard'}
          </h1>
          <p className="text-muted-foreground">
            {t('rbm.dashboardDescription') || 'Monitor Risk-Based Multiplier usage across all campaigns'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3" />
            {t('common.live') || 'Live'}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title={t('rbm.activeCampaigns') || 'Active Campaigns'}
          value={summary.totalActiveCampaigns}
          icon={BarChart3}
        />
        <MetricCard
          title={t('rbm.rbmActive') || 'RBM Active'}
          value={summary.rbmActiveCampaigns}
          icon={Zap}
          variant={summary.rbmActiveCampaigns > 0 ? "success" : "default"}
        />
        <MetricCard
          title={t('rbm.avgMultiplier') || 'Avg Multiplier'}
          value={`${summary.averageMultiplier.toFixed(2)}x`}
          icon={TrendingUp}
          variant={summary.averageMultiplier > 2.0 ? "warning" : "default"}
        />
        <MetricCard
          title={t('rbm.rollbacks24h') || 'Rollbacks (24h)'}
          value={metrics?.rollbackCount24h || 0}
          icon={Shield}
          variant={(metrics?.rollbackCount24h || 0) > 0 ? "destructive" : "success"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t('rbm.multiplierDistribution') || 'Multiplier Distribution'}
            </CardTitle>
            <CardDescription>
              {t('rbm.distributionDescription') || 'Distribution of risk multipliers across campaigns'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MultiplierDistributionChart distribution={metrics?.multiplierDistribution || {}} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {t('rbm.activeCampaignsWithRBM') || 'Active Campaigns with RBM'}
            </CardTitle>
            <CardDescription>
              {t('rbm.campaignsDescription') || 'Campaigns currently using risk multipliers > 1.0x'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <ActiveRBMCampaignsTable campaigns={metrics?.activeCampaignsWithRBM || []} />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('rbm.recentActivity') || 'Recent RBM Activity'}
          </CardTitle>
          <CardDescription>
            {t('rbm.activityDescription') || 'Latest RBM events across the network'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecentEventsTable events={metrics?.recentEvents || []} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              {t('rbm.approvals24h') || 'Approvals (24h)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics?.approvalCount24h || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              {t('rbm.reduced') || 'Reduced'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{summary.rbmReducedCampaigns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              {t('rbm.pending') || 'Pending Approval'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{summary.rbmPendingCampaigns}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
