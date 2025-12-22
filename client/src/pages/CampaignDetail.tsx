import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  ArrowLeft,
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  PauseCircle,
  XCircle,
  Play,
  Pause,
  Square,
  RefreshCw,
  DollarSign,
  Target,
  Wallet,
  Zap,
  AlertCircle,
  Coins,
  Search,
  Filter,
  BarChart3,
  Activity,
  Bot,
  Banknote
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RobotActivityFeed } from "@/components/RobotActivityFeed";
import { CampaignReports } from "@/components/CampaignReports";

interface Campaign {
  id: string;
  portfolio_id: string;
  name: string;
  start_date: string;
  end_date: string;
  initial_capital: string;
  current_equity: string;
  max_drawdown_percentage: string;
  status: string;
  investor_profile: string;
  created_at: string;
  completed_at: string | null;
  rbm_status?: string | null;
  rbm_approved?: string | null;
  rbm_requested?: string | null;
}

interface CampaignMetrics {
  campaignId: string;
  dayNumber: number;
  totalDays: number;
  daysRemaining: number;
  initialCapital: number;
  currentEquity: number;
  totalPnL: number;
  totalPnLPercentage: number;
  currentDrawdown: number;
  maxDrawdownLimit: number;
  isDrawdownBreached: boolean;
  status: string;
  progress: number;
}

interface RbmEvent {
  id: string;
  campaign_id: string;
  event_type: string;
  previous_value: string | null;
  new_value: string | null;
  trigger_source: string | null;
  snapshot_data: Record<string, unknown> | null;
  created_at: string;
}

interface AssetUniverse {
  id: string;
  campaign_id: string;
  symbol: string;
  initial_weight: string | null;
  current_weight: string | null;
  is_active: boolean;
  is_in_tradable_set: boolean;
  last_score: string | null;
  last_rank: number | null;
  cluster_number: number | null;
  is_problematic: boolean;
  problem_reason: string | null;
  last_rebalance_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Portfolio {
  id: string;
  name: string;
  trading_mode: string;
}

interface CampaignPosition {
  id: string;
  campaign_id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: string;
  entry_price: string;
  current_price: string | null;
  stop_loss: string | null;
  take_profit: string | null;
  atr_at_entry: string | null;
  risk_amount: string | null;
  adds_count: number;
  avg_entry_price: string | null;
  unrealized_pnl: string | null;
  unrealized_pnl_pct: string | null;
  realized_pnl: string | null;
  state: 'open' | 'closed';
  close_reason: string | null;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
}

const CLUSTER_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-700' },
  { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-300 dark:border-green-700' },
  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-700' },
  { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-700' },
  { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-300 dark:border-pink-700' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-300 dark:border-cyan-700' },
  { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-300 dark:border-yellow-700' },
  { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-700' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-700' },
  { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-700' },
];

export default function CampaignDetail() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/campaigns/:id");
  const campaignId = params?.id;

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clusterFilter, setClusterFilter] = useState<string>("all");

  const { data: campaign, isLoading: campaignLoading } = useQuery<Campaign>({
    queryKey: ['/api/campaigns/detail', campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/detail/${campaignId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch campaign');
      return res.json();
    },
    enabled: !!campaignId,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<CampaignMetrics>({
    queryKey: ['/api/campaigns', campaignId, 'metrics'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/metrics`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    },
    enabled: !!campaignId,
    refetchInterval: 10000,
  });

  const { data: universe, isLoading: universeLoading, refetch: refetchUniverse } = useQuery<AssetUniverse[]>({
    queryKey: ['/api/campaigns', campaignId, 'universe'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/universe`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch universe');
      return res.json();
    },
    enabled: !!campaignId,
  });

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ['/api/portfolios'],
  });

  // Fetch campaign positions
  const { data: positions, isLoading: positionsLoading } = useQuery<CampaignPosition[]>({
    queryKey: ['/api/campaigns', campaignId, 'positions'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/positions`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch positions');
      return res.json();
    },
    enabled: !!campaignId,
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  // Separate open and closed positions
  const openPositions = positions?.filter(p => p.state === 'open') || [];
  const closedPositions = positions?.filter(p => p.state === 'closed') || [];

  // Fetch RBM events for audit trail
  const { data: rbmEvents, isLoading: rbmEventsLoading } = useQuery<RbmEvent[]>({
    queryKey: ['/api/rbm/campaign', campaignId, 'events'],
    queryFn: async () => {
      const res = await fetch(`/api/rbm/campaign/${campaignId}/events`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch RBM events');
      const data = await res.json();
      return data.events || [];
    },
    enabled: !!campaignId,
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiRequest(`/api/campaigns/${campaignId}/pause`, 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: t('campaign.paused'), description: t('campaign.pausedDesc') });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/campaigns/${campaignId}/resume`, 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: t('campaign.resumed'), description: t('campaign.resumedDesc') });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest(`/api/campaigns/${campaignId}/stop`, 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: t('campaign.stopped'), description: t('campaign.stoppedDesc') });
    },
  });

  const rebalanceMutation = useMutation({
    mutationFn: () => apiRequest(`/api/campaigns/${campaignId}/rebalance`, 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      refetchUniverse();
      toast({ title: t('campaign.rebalanced'), description: t('campaign.rebalancedDesc') });
    },
  });

  const liquidateMutation = useMutation({
    mutationFn: () => apiRequest(`/api/campaigns/${campaignId}/liquidate-positions`, 'POST'),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'positions'] });
      toast({ 
        title: t('campaign.liquidated') || 'Positions Liquidated',
        description: data.message || `Liquidated ${data.liquidatedCount} positions for ~$${data.estimatedUSD?.toFixed(2) || '0.00'}`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: t('common.error') || 'Error',
        description: error.message || 'Failed to liquidate positions',
        variant: 'destructive'
      });
    },
  });

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getPortfolioName = (portfolioId: string) => {
    const portfolio = portfolios?.find(p => p.id === portfolioId);
    return portfolio?.name || portfolioId;
  };

  const getPortfolioMode = (portfolioId: string) => {
    const portfolio = portfolios?.find(p => p.id === portfolioId);
    return portfolio?.trading_mode || 'paper';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'paused': return <PauseCircle className="h-4 w-4 text-yellow-500" />;
      case 'stopped': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-blue-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'active': return 'default';
      case 'paused': return 'secondary';
      case 'stopped': return 'destructive';
      case 'completed': return 'outline';
      default: return 'secondary';
    }
  };

  const getClusterColor = (clusterNum: number | null) => {
    if (clusterNum === null) return CLUSTER_COLORS[0];
    return CLUSTER_COLORS[clusterNum % CLUSTER_COLORS.length];
  };

  const getAssetStatus = (asset: AssetUniverse) => {
    if (asset.is_problematic) return 'problematic';
    if (!asset.is_active) return 'inactive';
    if (asset.is_in_tradable_set) return 'tradable';
    return 'active';
  };

  const getAssetStatusBadge = (asset: AssetUniverse) => {
    const status = getAssetStatus(asset);
    switch (status) {
      case 'tradable':
        return <Badge variant="default" className="bg-green-500">{t('campaignDetail.universe.tradable')}</Badge>;
      case 'active':
        return <Badge variant="secondary">{t('campaignDetail.universe.active')}</Badge>;
      case 'inactive':
        return <Badge variant="outline">{t('campaignDetail.universe.inactive')}</Badge>;
      case 'problematic':
        return <Badge variant="destructive">{t('campaignDetail.universe.problematic')}</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  const uniqueClusters = universe
    ? Array.from(new Set(universe.map(a => a.cluster_number).filter(c => c !== null)))
    : [];

  const filteredUniverse = universe?.filter(asset => {
    const matchesSearch = asset.symbol.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || getAssetStatus(asset) === statusFilter;
    const matchesCluster = clusterFilter === 'all' || 
      (clusterFilter === 'none' && asset.cluster_number === null) ||
      asset.cluster_number?.toString() === clusterFilter;
    return matchesSearch && matchesStatus && matchesCluster;
  }).sort((a, b) => (a.last_rank || 999) - (b.last_rank || 999));

  const universeStats = universe ? {
    total: universe.length,
    tradable: universe.filter(a => a.is_in_tradable_set).length,
    active: universe.filter(a => a.is_active && !a.is_in_tradable_set).length,
    inactive: universe.filter(a => !a.is_active).length,
    problematic: universe.filter(a => a.is_problematic).length,
    clusters: uniqueClusters.length,
  } : null;

  if (campaignLoading) {
    return (
      <div className="container mx-auto py-6 px-4 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="container mx-auto py-6 px-4">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t('campaignDetail.notFound')}</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setLocation('/campaigns')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('campaignDetail.backToCampaigns')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLive = getPortfolioMode(campaign.portfolio_id) === 'live';
  const isPending = pauseMutation.isPending || resumeMutation.isPending || stopMutation.isPending || rebalanceMutation.isPending || liquidateMutation.isPending;

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation('/campaigns')}
            data-testid="button-back-campaigns"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-campaign-name">{campaign.name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{getPortfolioName(campaign.portfolio_id)}</span>
              <Badge variant={isLive ? 'default' : 'secondary'} className="text-xs">
                {isLive ? 'LIVE' : 'PAPER'}
              </Badge>
              <Badge variant={getStatusBadgeVariant(campaign.status)}>
                {getStatusIcon(campaign.status)}
                <span className="ml-1">{t(`campaign.${campaign.status}Status`)}</span>
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {campaign.status === 'active' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pauseMutation.mutate()}
                disabled={isPending}
                data-testid="button-pause"
              >
                <Pause className="h-4 w-4 mr-1" />
                {t('campaign.pause')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => rebalanceMutation.mutate()}
                disabled={isPending}
                data-testid="button-rebalance"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                {t('campaign.rebalance')}
              </Button>
            </>
          )}
          {campaign.status === 'paused' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resumeMutation.mutate()}
              disabled={isPending}
              data-testid="button-resume"
            >
              <Play className="h-4 w-4 mr-1" />
              {t('campaign.resume')}
            </Button>
          )}
          {(campaign.status === 'active' || campaign.status === 'paused') && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => stopMutation.mutate()}
              disabled={isPending}
              data-testid="button-stop"
            >
              <Square className="h-4 w-4 mr-1" />
              {t('campaign.stop')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Wallet className="h-4 w-4" />
              {t('campaign.initialCapital')}
            </div>
            <p className="text-xl font-bold" data-testid="text-initial-capital">
              {formatCurrency(campaign.initial_capital)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="h-4 w-4" />
              {t('campaign.currentEquity')}
            </div>
            <p className="text-xl font-bold" data-testid="text-current-equity">
              {formatCurrency(metrics?.currentEquity || campaign.current_equity)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              {(metrics?.totalPnL || 0) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              {t('campaign.totalPnL')}
            </div>
            <p className={`text-xl font-bold ${(metrics?.totalPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-total-pnl">
              {formatCurrency(metrics?.totalPnL || 0)} ({formatPercentage(metrics?.totalPnLPercentage || 0)})
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <AlertTriangle className="h-4 w-4" />
              {t('campaign.drawdown')}
            </div>
            <p className={`text-xl font-bold ${(metrics?.currentDrawdown || 0) > 5 ? 'text-red-500' : ''}`} data-testid="text-drawdown">
              {(metrics?.currentDrawdown || 0).toFixed(2)}% / {campaign.max_drawdown_percentage}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Zap className={`h-4 w-4 ${campaign.rbm_status === 'ACTIVE' ? 'text-yellow-500' : 'text-muted-foreground'}`} />
              {t('rbm.title')}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold" data-testid="text-rbm-multiplier">
                {campaign.rbm_approved ? `${parseFloat(campaign.rbm_approved).toFixed(1)}x` : '1.0x'}
              </p>
              {campaign.rbm_status && campaign.rbm_status !== 'INACTIVE' && (
                <Badge 
                  variant={campaign.rbm_status === 'ACTIVE' ? 'default' : campaign.rbm_status === 'PENDING' ? 'secondary' : 'destructive'}
                  className="text-xs"
                  data-testid="badge-rbm-status"
                >
                  {campaign.rbm_status}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {t('campaign.day')} {metrics?.dayNumber || 1} / {metrics?.totalDays || 30}
            </span>
            <span className="text-sm text-muted-foreground">
              {metrics?.daysRemaining || 30} {t('campaign.daysRemaining')}
            </span>
          </div>
          <Progress value={metrics?.progress || 0} className="h-2" />
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>{formatDate(campaign.start_date)}</span>
            <span>{formatDate(campaign.end_date)}</span>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="activity" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="activity" data-testid="tab-activity">
            <Bot className="h-4 w-4 mr-2" />
            {t('campaignDetail.tabs.activity')}
          </TabsTrigger>
          <TabsTrigger value="universe" data-testid="tab-universe">
            <Coins className="h-4 w-4 mr-2" />
            {t('campaignDetail.tabs.universe')}
          </TabsTrigger>
          <TabsTrigger value="positions" data-testid="tab-positions">
            <Target className="h-4 w-4 mr-2" />
            {t('campaignDetail.tabs.positions')}
          </TabsTrigger>
          <TabsTrigger value="rbm" data-testid="tab-rbm">
            <Zap className="h-4 w-4 mr-2" />
            RBM
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('campaignDetail.tabs.reports')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          {campaignId && (
            <RobotActivityFeed 
              campaignId={campaignId} 
              limit={100}
              refreshInterval={5000}
            />
          )}
        </TabsContent>

        <TabsContent value="universe" className="space-y-4">
          {universeStats && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-6">
              <Card>
                <CardContent className="pt-3 pb-3 text-center">
                  <p className="text-2xl font-bold" data-testid="stat-total">{universeStats.total}</p>
                  <p className="text-xs text-muted-foreground">{t('campaignDetail.universe.total')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-3 text-center">
                  <p className="text-2xl font-bold text-green-500" data-testid="stat-tradable">{universeStats.tradable}</p>
                  <p className="text-xs text-muted-foreground">{t('campaignDetail.universe.tradable')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-3 text-center">
                  <p className="text-2xl font-bold text-blue-500" data-testid="stat-active">{universeStats.active}</p>
                  <p className="text-xs text-muted-foreground">{t('campaignDetail.universe.active')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-3 text-center">
                  <p className="text-2xl font-bold text-muted-foreground" data-testid="stat-inactive">{universeStats.inactive}</p>
                  <p className="text-xs text-muted-foreground">{t('campaignDetail.universe.inactive')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-3 text-center">
                  <p className="text-2xl font-bold text-red-500" data-testid="stat-problematic">{universeStats.problematic}</p>
                  <p className="text-xs text-muted-foreground">{t('campaignDetail.universe.problematic')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-3 text-center">
                  <p className="text-2xl font-bold text-purple-500" data-testid="stat-clusters">{universeStats.clusters}</p>
                  <p className="text-xs text-muted-foreground">{t('campaignDetail.universe.clusters')}</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5" />
                    {t('campaignDetail.universe.title')}
                  </CardTitle>
                  <CardDescription>{t('campaignDetail.universe.description')}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchUniverse()}
                  disabled={universeLoading}
                  data-testid="button-refresh-universe"
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${universeLoading ? 'animate-spin' : ''}`} />
                  {t('common.retry')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('campaignDetail.universe.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-assets"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-40" data-testid="select-status-filter">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder={t('campaignDetail.universe.filterStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('campaignDetail.universe.allStatus')}</SelectItem>
                    <SelectItem value="tradable">{t('campaignDetail.universe.tradable')}</SelectItem>
                    <SelectItem value="active">{t('campaignDetail.universe.active')}</SelectItem>
                    <SelectItem value="inactive">{t('campaignDetail.universe.inactive')}</SelectItem>
                    <SelectItem value="problematic">{t('campaignDetail.universe.problematic')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={clusterFilter} onValueChange={setClusterFilter}>
                  <SelectTrigger className="w-full md:w-40" data-testid="select-cluster-filter">
                    <Activity className="h-4 w-4 mr-2" />
                    <SelectValue placeholder={t('campaignDetail.universe.filterCluster')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('campaignDetail.universe.allClusters')}</SelectItem>
                    <SelectItem value="none">{t('campaignDetail.universe.noCluster')}</SelectItem>
                    {uniqueClusters.sort((a, b) => (a || 0) - (b || 0)).map(cluster => (
                      <SelectItem key={cluster} value={cluster!.toString()}>
                        Cluster {cluster}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {universeLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredUniverse && filteredUniverse.length > 0 ? (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">{t('campaignDetail.universe.rank')}</TableHead>
                        <TableHead>{t('campaignDetail.universe.symbol')}</TableHead>
                        <TableHead className="text-center">{t('campaignDetail.universe.cluster')}</TableHead>
                        <TableHead className="text-right">{t('campaignDetail.universe.score')}</TableHead>
                        <TableHead className="text-right">{t('campaignDetail.universe.weight')}</TableHead>
                        <TableHead className="text-center">{t('campaignDetail.universe.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUniverse.map((asset) => {
                        const clusterColor = getClusterColor(asset.cluster_number);
                        return (
                          <TableRow key={asset.id} data-testid={`row-asset-${asset.symbol}`}>
                            <TableCell className="font-mono text-muted-foreground">
                              #{asset.last_rank || '-'}
                            </TableCell>
                            <TableCell className="font-medium">
                              {asset.symbol}
                            </TableCell>
                            <TableCell className="text-center">
                              {asset.cluster_number !== null ? (
                                <Badge 
                                  variant="outline" 
                                  className={`${clusterColor.bg} ${clusterColor.text} ${clusterColor.border}`}
                                >
                                  C{asset.cluster_number}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {asset.last_score ? parseFloat(asset.last_score).toFixed(4) : '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {asset.current_weight ? `${(parseFloat(asset.current_weight) * 100).toFixed(2)}%` : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {getAssetStatusBadge(asset)}
                              {asset.is_problematic && asset.problem_reason && (
                                <span className="block text-xs text-red-500 mt-1">{asset.problem_reason}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Coins className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{t('campaignDetail.universe.empty')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions">
          <div className="space-y-6">
            {/* Open Positions */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-delfos-cyan" />
                    {t('campaignDetail.positions.openPositions')}
                    <Badge variant="secondary" className="ml-2">{openPositions.length}</Badge>
                  </CardTitle>
                  {openPositions.length > 0 && (campaign?.status === 'running' || campaign?.status === 'paused' || campaign?.status === 'active') && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm(t('campaignDetail.positions.confirmLiquidate') || 'Are you sure you want to liquidate all open positions? This will sell all assets to generate USD liquidity.')) {
                          liquidateMutation.mutate();
                        }
                      }}
                      disabled={liquidateMutation.isPending}
                      data-testid="button-liquidate-positions"
                    >
                      <Banknote className="h-4 w-4 mr-2" />
                      {liquidateMutation.isPending ? (t('common.loading') || 'Loading...') : (t('campaignDetail.positions.liquidate') || 'Liquidate All')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {positionsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : openPositions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('campaignDetail.positions.symbol')}</TableHead>
                          <TableHead>{t('campaignDetail.positions.side')}</TableHead>
                          <TableHead className="text-right">{t('campaignDetail.positions.quantity')}</TableHead>
                          <TableHead className="text-right">{t('campaignDetail.positions.entryPrice')}</TableHead>
                          <TableHead className="text-right">{t('campaignDetail.positions.currentPrice')}</TableHead>
                          <TableHead className="text-right">{t('campaignDetail.positions.stopLoss')}</TableHead>
                          <TableHead className="text-right">{t('campaignDetail.positions.takeProfit')}</TableHead>
                          <TableHead className="text-right">{t('campaignDetail.positions.unrealizedPnl')}</TableHead>
                          <TableHead>{t('campaignDetail.positions.openedAt')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {openPositions.map((pos) => {
                          const pnl = pos.unrealized_pnl ? parseFloat(pos.unrealized_pnl) : 0;
                          const pnlPct = pos.unrealized_pnl_pct ? parseFloat(pos.unrealized_pnl_pct) : 0;
                          const isProfit = pnl >= 0;
                          return (
                            <TableRow key={pos.id} data-testid={`row-position-${pos.id}`}>
                              <TableCell className="font-mono font-medium">{pos.symbol}</TableCell>
                              <TableCell>
                                <Badge 
                                  variant={pos.side === 'long' ? 'default' : 'destructive'}
                                  className={pos.side === 'long' ? 'bg-green-600' : 'bg-red-600'}
                                >
                                  {pos.side === 'long' ? t('campaignDetail.positions.long') : t('campaignDetail.positions.short')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">{parseFloat(pos.quantity).toFixed(6)}</TableCell>
                              <TableCell className="text-right font-mono">${parseFloat(pos.entry_price).toFixed(4)}</TableCell>
                              <TableCell className="text-right font-mono">
                                {pos.current_price ? `$${parseFloat(pos.current_price).toFixed(4)}` : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-red-500">
                                {pos.stop_loss ? `$${parseFloat(pos.stop_loss).toFixed(4)}` : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-green-500">
                                {pos.take_profit ? `$${parseFloat(pos.take_profit).toFixed(4)}` : '-'}
                              </TableCell>
                              <TableCell className={`text-right font-mono ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                                <div className="flex flex-col items-end">
                                  <span>{isProfit ? '+' : ''}{formatCurrency(pnl)}</span>
                                  <span className="text-xs">({isProfit ? '+' : ''}{pnlPct.toFixed(2)}%)</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {new Date(pos.opened_at).toLocaleDateString()}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Target className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">{t('campaignDetail.positions.noOpenPositions')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Closed Positions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-muted-foreground" />
                  {t('campaignDetail.positions.closedPositions')}
                  <Badge variant="outline" className="ml-2">{closedPositions.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {positionsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : closedPositions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('campaignDetail.positions.symbol')}</TableHead>
                          <TableHead>{t('campaignDetail.positions.side')}</TableHead>
                          <TableHead className="text-right">{t('campaignDetail.positions.quantity')}</TableHead>
                          <TableHead className="text-right">{t('campaignDetail.positions.entryPrice')}</TableHead>
                          <TableHead className="text-right">{t('campaignDetail.positions.realizedPnl')}</TableHead>
                          <TableHead>{t('campaignDetail.positions.closeReason')}</TableHead>
                          <TableHead>{t('campaignDetail.positions.openedAt')}</TableHead>
                          <TableHead>{t('campaignDetail.positions.closedAt')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {closedPositions.map((pos) => {
                          const pnl = pos.realized_pnl ? parseFloat(pos.realized_pnl) : 0;
                          const isProfit = pnl >= 0;
                          const getCloseReasonBadge = (reason: string | null) => {
                            if (!reason) return <span className="text-muted-foreground">-</span>;
                            const reasonLower = reason.toLowerCase();
                            if (reasonLower.includes('tp') || reasonLower.includes('profit')) {
                              return <Badge className="bg-green-600">{t('campaignDetail.positions.tp')}</Badge>;
                            }
                            if (reasonLower.includes('sl') || reasonLower.includes('stop') || reasonLower.includes('loss')) {
                              return <Badge variant="destructive">{t('campaignDetail.positions.sl')}</Badge>;
                            }
                            if (reasonLower.includes('manual')) {
                              return <Badge variant="secondary">{t('campaignDetail.positions.manual')}</Badge>;
                            }
                            if (reasonLower.includes('expired')) {
                              return <Badge variant="outline">{t('campaignDetail.positions.expired')}</Badge>;
                            }
                            return <Badge variant="outline">{reason}</Badge>;
                          };
                          return (
                            <TableRow key={pos.id} data-testid={`row-closed-position-${pos.id}`}>
                              <TableCell className="font-mono font-medium">{pos.symbol}</TableCell>
                              <TableCell>
                                <Badge 
                                  variant={pos.side === 'long' ? 'default' : 'destructive'}
                                  className={pos.side === 'long' ? 'bg-green-600/70' : 'bg-red-600/70'}
                                >
                                  {pos.side === 'long' ? t('campaignDetail.positions.long') : t('campaignDetail.positions.short')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">{parseFloat(pos.quantity).toFixed(6)}</TableCell>
                              <TableCell className="text-right font-mono">${parseFloat(pos.entry_price).toFixed(4)}</TableCell>
                              <TableCell className={`text-right font-mono font-semibold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                                {isProfit ? '+' : ''}{formatCurrency(pnl)}
                              </TableCell>
                              <TableCell>{getCloseReasonBadge(pos.close_reason)}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {new Date(pos.opened_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {pos.closed_at ? new Date(pos.closed_at).toLocaleDateString() : '-'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">{t('campaignDetail.positions.noClosedPositions')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="rbm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                {t('rbm.title')} - {t('campaignDetail.tabs.activity')}
              </CardTitle>
              <CardDescription>
                {language === 'pt-BR' ? 'Histórico de eventos do multiplicador de risco' : 
                 language === 'es' ? 'Historial de eventos del multiplicador de riesgo' : 
                 'Risk multiplier event history and audit trail'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rbmEventsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : rbmEvents && rbmEvents.length > 0 ? (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">
                          {language === 'pt-BR' ? 'Tipo de Evento' : language === 'es' ? 'Tipo de Evento' : 'Event Type'}
                        </TableHead>
                        <TableHead className="text-right">
                          {language === 'pt-BR' ? 'Anterior' : language === 'es' ? 'Anterior' : 'Previous'}
                        </TableHead>
                        <TableHead className="text-right">
                          {language === 'pt-BR' ? 'Novo' : language === 'es' ? 'Nuevo' : 'New'}
                        </TableHead>
                        <TableHead>
                          {language === 'pt-BR' ? 'Fonte' : language === 'es' ? 'Origen' : 'Source'}
                        </TableHead>
                        <TableHead>
                          {language === 'pt-BR' ? 'Data' : language === 'es' ? 'Fecha' : 'Date'}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rbmEvents.map((event) => {
                        const getEventBadge = (type: string) => {
                          switch(type) {
                            case 'ACTIVATION': return <Badge variant="default">Activation</Badge>;
                            case 'REDUCTION': return <Badge className="bg-yellow-500">Reduction</Badge>;
                            case 'ROLLBACK': return <Badge variant="destructive">Rollback</Badge>;
                            case 'DEACTIVATION': return <Badge variant="secondary">Deactivation</Badge>;
                            default: return <Badge variant="outline">{type}</Badge>;
                          }
                        };
                        return (
                          <TableRow key={event.id} data-testid={`rbm-event-row-${event.id}`}>
                            <TableCell>{getEventBadge(event.event_type)}</TableCell>
                            <TableCell className="text-right font-mono">
                              {event.previous_value ? `${parseFloat(event.previous_value).toFixed(1)}x` : '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {event.new_value ? `${parseFloat(event.new_value).toFixed(1)}x` : '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {event.trigger_source || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {new Date(event.created_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Zap className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">
                    {language === 'pt-BR' ? 'Nenhum evento RBM registrado' : 
                     language === 'es' ? 'No hay eventos RBM registrados' : 
                     'No RBM events recorded'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          {campaignId && <CampaignReports campaignId={campaignId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
