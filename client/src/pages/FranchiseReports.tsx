import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Building2, 
  TrendingUp,
  TrendingDown,
  Clock,
  Activity,
  ArrowLeft,
  AlertTriangle,
  Bot,
  CheckCircle,
  Pause,
  Play,
  BarChart3,
  History,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';

interface FranchiseReportsData {
  franchise: {
    id: string;
    name: string;
  };
  operational: {
    activeCampaigns: number;
    pausedCampaigns: number;
    completedCampaigns: number;
    totalOpenPositions: number;
    totalTradesToday: number;
    circuitBreakersActive: number;
    campaigns: Array<{
      id: string;
      name: string;
      status: string;
      statusLabel: string;
      openPositions: number;
      tradesToday: number;
      circuitBreakers: {
        campaign: boolean;
        dailyLoss: boolean;
        pair: boolean;
      };
    }>;
  };
  report8h: {
    periodStart: string;
    periodEnd: string;
    totalTrades: number;
    wins: number;
    losses: number;
    netPnL: number;
    netPnLPct: number;
    topPerformers: Array<{ symbol: string; pnl: number }>;
    worstPerformers: Array<{ symbol: string; pnl: number }>;
    campaignBreakdown: Array<{
      campaignId: string;
      campaignName: string;
      trades: number;
      pnl: number;
    }>;
  };
  report24h: {
    periodStart: string;
    periodEnd: string;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    netPnL: number;
    totalInitialEquity: number;
    totalFinalEquity: number;
    roi: number;
    keyDecisions: Array<{
      time: string;
      action: string;
      symbol: string;
      result: number;
      campaignName: string;
    }>;
    summary: string;
    campaignBreakdown: Array<{
      campaignId: string;
      campaignName: string;
      trades: number;
      pnl: number;
      winRate: number;
      roi: number;
    }>;
  };
  history: {
    periodStart: string;
    periodEnd: string;
    trades: Array<{
      id: string;
      timestamp: string;
      action: string;
      symbol: string;
      price: number;
      quantity: number;
      side: string;
      pnl: number | null;
      closeReason: string | null;
      campaignName: string;
    }>;
    totalTrades: number;
    accumulatedPnL: number;
    totalVolume: number;
  };
}

export default function FranchiseReports() {
  const { t } = useLanguage();

  const { data, isLoading, error } = useQuery<FranchiseReportsData>({
    queryKey: ['/api/franchise-reports'],
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'in_position':
        return <Activity className="w-4 h-4 text-blue-500" />;
      case 'monitoring':
      case 'waiting_entry':
        return <Bot className="w-4 h-4 text-green-500" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-amber-500" />;
      case 'stopped':
        return <CheckCircle className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Bot className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    const errorData = error as any;
    if (errorData?.code === 'NO_FRANCHISE') {
      return (
        <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
          <Building2 className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">{t('franchiseReports.noFranchise')}</h2>
          <p className="text-muted-foreground text-center max-w-md mb-4">
            {t('franchiseReports.noFranchiseDesc')}
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

  if (!data) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/franchise">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-franchise-reports-title">
              {t('franchiseReports.title')}
            </h1>
            <p className="text-muted-foreground">{data.franchise.name}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="operational" className="space-y-4">
        <TabsList data-testid="tabs-franchise-reports">
          <TabsTrigger value="operational" data-testid="tab-operational">
            <Bot className="w-4 h-4 mr-2" />
            {t('franchiseReports.tabs.operational')}
          </TabsTrigger>
          <TabsTrigger value="8h" data-testid="tab-8h">
            <Clock className="w-4 h-4 mr-2" />
            {t('franchiseReports.tabs.8h')}
          </TabsTrigger>
          <TabsTrigger value="24h" data-testid="tab-24h">
            <BarChart3 className="w-4 h-4 mr-2" />
            {t('franchiseReports.tabs.24h')}
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="w-4 h-4 mr-2" />
            {t('franchiseReports.tabs.history')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operational" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.activeCampaigns')}</CardTitle>
                <Play className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-active-count">
                  {data.operational.activeCampaigns}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.operational.pausedCampaigns} {t('franchiseReports.paused')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.openPositions')}</CardTitle>
                <Activity className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-open-positions">
                  {data.operational.totalOpenPositions}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('franchiseReports.acrossAllCampaigns')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.tradesToday')}</CardTitle>
                <BarChart3 className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-trades-today">
                  {data.operational.totalTradesToday}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('franchiseReports.executedToday')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.circuitBreakers')}</CardTitle>
                <AlertTriangle className={`h-4 w-4 ${data.operational.circuitBreakersActive > 0 ? 'text-amber-500' : 'text-green-500'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${data.operational.circuitBreakersActive > 0 ? 'text-amber-600' : 'text-green-600'}`} data-testid="text-cb-count">
                  {data.operational.circuitBreakersActive}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.operational.circuitBreakersActive > 0 ? t('franchiseReports.cbActive') : t('franchiseReports.cbClear')}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('franchiseReports.campaignStatus')}</CardTitle>
              <CardDescription>{t('franchiseReports.campaignStatusDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {data.operational.campaigns.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('campaign.form.name')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="text-center">{t('franchiseReports.positions')}</TableHead>
                      <TableHead className="text-center">{t('franchiseReports.trades')}</TableHead>
                      <TableHead>{t('franchiseReports.protection')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.operational.campaigns.map((campaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell>
                          <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:underline" data-testid={`link-campaign-${campaign.id}`}>
                            {campaign.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(campaign.status)}
                            <span className="text-sm">{campaign.statusLabel}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{campaign.openPositions}</TableCell>
                        <TableCell className="text-center">{campaign.tradesToday}</TableCell>
                        <TableCell>
                          {(campaign.circuitBreakers.campaign || campaign.circuitBreakers.dailyLoss || campaign.circuitBreakers.pair) ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              CB
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              OK
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>{t('franchiseReports.noCampaigns')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="8h" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.totalTrades')}</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-8h-trades">
                  {data.report8h.totalTrades}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.report8h.wins} {t('franchiseReports.wins')} / {data.report8h.losses} {t('franchiseReports.losses')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.netPnL')}</CardTitle>
                {data.report8h.netPnL >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${data.report8h.netPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-8h-pnl">
                  {data.report8h.netPnL >= 0 ? '+' : ''}${data.report8h.netPnL.toFixed(2)}
                </div>
                <p className={`text-xs ${data.report8h.netPnLPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.report8h.netPnLPct >= 0 ? '+' : ''}{data.report8h.netPnLPct.toFixed(2)}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.topPerformer')}</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                {data.report8h.topPerformers.length > 0 ? (
                  <>
                    <div className="text-lg font-bold text-green-600" data-testid="text-8h-top">
                      {data.report8h.topPerformers[0].symbol}
                    </div>
                    <p className="text-xs text-green-600">+${data.report8h.topPerformers[0].pnl.toFixed(2)}</p>
                  </>
                ) : (
                  <div className="text-muted-foreground">-</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.worstPerformer')}</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                {data.report8h.worstPerformers.length > 0 ? (
                  <>
                    <div className="text-lg font-bold text-red-600" data-testid="text-8h-worst">
                      {data.report8h.worstPerformers[0].symbol}
                    </div>
                    <p className="text-xs text-red-600">${data.report8h.worstPerformers[0].pnl.toFixed(2)}</p>
                  </>
                ) : (
                  <div className="text-muted-foreground">-</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('franchiseReports.campaignBreakdown')}</CardTitle>
              <CardDescription>
                {format(new Date(data.report8h.periodStart), 'HH:mm')} - {format(new Date(data.report8h.periodEnd), 'HH:mm')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.report8h.campaignBreakdown.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('campaign.form.name')}</TableHead>
                      <TableHead className="text-center">{t('franchiseReports.trades')}</TableHead>
                      <TableHead className="text-right">{t('franchiseReports.pnl')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.report8h.campaignBreakdown.map((campaign) => (
                      <TableRow key={campaign.campaignId}>
                        <TableCell className="font-medium">{campaign.campaignName}</TableCell>
                        <TableCell className="text-center">{campaign.trades}</TableCell>
                        <TableCell className={`text-right ${campaign.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {campaign.pnl >= 0 ? '+' : ''}${campaign.pnl.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>{t('franchiseReports.noTrades8h')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="24h" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm" data-testid="text-24h-summary">{data.report24h.summary}</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.winRate')}</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-24h-winrate">
                  {data.report24h.winRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.report24h.wins}/{data.report24h.totalTrades} {t('franchiseReports.trades')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.roi')}</CardTitle>
                {data.report24h.roi >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${data.report24h.roi >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-24h-roi">
                  {data.report24h.roi >= 0 ? '+' : ''}{data.report24h.roi.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('franchiseReports.last24h')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.netPnL')}</CardTitle>
                {data.report24h.netPnL >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${data.report24h.netPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-24h-pnl">
                  {data.report24h.netPnL >= 0 ? '+' : ''}${data.report24h.netPnL.toFixed(2)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.equity')}</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-24h-equity">
                  ${data.report24h.totalFinalEquity.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('franchiseReports.initial')}: ${data.report24h.totalInitialEquity.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('franchiseReports.keyDecisions')}</CardTitle>
              <CardDescription>{t('franchiseReports.keyDecisionsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {data.report24h.keyDecisions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('franchiseReports.time')}</TableHead>
                      <TableHead>{t('campaign.form.name')}</TableHead>
                      <TableHead>{t('franchiseReports.action')}</TableHead>
                      <TableHead>{t('assets.symbol')}</TableHead>
                      <TableHead className="text-right">{t('franchiseReports.result')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.report24h.keyDecisions.map((decision, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(decision.time), 'HH:mm')}
                        </TableCell>
                        <TableCell className="font-medium">{decision.campaignName}</TableCell>
                        <TableCell>{decision.action}</TableCell>
                        <TableCell className="text-primary">{decision.symbol}</TableCell>
                        <TableCell className={`text-right ${decision.result >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {decision.result >= 0 ? '+' : ''}${decision.result.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>{t('franchiseReports.noDecisions')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.totalTrades')}</CardTitle>
                <History className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-history-trades">
                  {data.history.totalTrades}
                </div>
                <p className="text-xs text-muted-foreground">{t('franchiseReports.last72h')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.accumulatedPnL')}</CardTitle>
                {data.history.accumulatedPnL >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${data.history.accumulatedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-history-pnl">
                  {data.history.accumulatedPnL >= 0 ? '+' : ''}${data.history.accumulatedPnL.toFixed(2)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{t('franchiseReports.volume')}</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-history-volume">
                  ${data.history.totalVolume.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('franchiseReports.tradeHistory')}</CardTitle>
              <CardDescription>
                {format(new Date(data.history.periodStart), 'dd/MM HH:mm')} - {format(new Date(data.history.periodEnd), 'dd/MM HH:mm')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.history.trades.length > 0 ? (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('franchiseReports.time')}</TableHead>
                        <TableHead>{t('campaign.form.name')}</TableHead>
                        <TableHead>{t('assets.symbol')}</TableHead>
                        <TableHead>{t('franchiseReports.side')}</TableHead>
                        <TableHead className="text-right">{t('franchiseReports.price')}</TableHead>
                        <TableHead className="text-right">{t('franchiseReports.pnl')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.history.trades.map((trade) => (
                        <TableRow key={trade.id}>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {format(new Date(trade.timestamp), 'dd/MM HH:mm')}
                          </TableCell>
                          <TableCell className="font-medium">{trade.campaignName}</TableCell>
                          <TableCell className="text-primary">{trade.symbol}</TableCell>
                          <TableCell>
                            <Badge variant={trade.side === 'long' ? 'default' : 'secondary'}>
                              {trade.side === 'long' ? 'LONG' : 'SHORT'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">${trade.price.toFixed(2)}</TableCell>
                          <TableCell className={`text-right ${trade.pnl !== null ? (trade.pnl >= 0 ? 'text-green-600' : 'text-red-600') : 'text-muted-foreground'}`}>
                            {trade.pnl !== null ? (trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>{t('franchiseReports.noTrades')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
