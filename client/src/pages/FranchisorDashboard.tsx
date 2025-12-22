import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  Building2, Users, DollarSign, TrendingUp, MapPin, 
  AlertTriangle, Crown, FileText, Activity, CheckCircle2
} from "lucide-react";
import { Link } from "wouter";

interface NetworkStats {
  total_franchises: number;
  active_franchises: number;
  pending_onboarding: number;
  master_franchises: number;
  total_revenue: string;
  pending_royalties: string;
  territories_covered: number;
  contracts_pending: number;
}

export default function FranchisorDashboard() {
  const { t } = useLanguage();

  const { data: stats, isLoading } = useQuery<NetworkStats>({
    queryKey: ['/api/franchisor/network-stats'],
    refetchInterval: 60000,
  });

  const defaultStats: NetworkStats = {
    total_franchises: 0,
    active_franchises: 0,
    pending_onboarding: 0,
    master_franchises: 0,
    total_revenue: "0.00",
    pending_royalties: "0.00",
    territories_covered: 0,
    contracts_pending: 0,
  };

  const networkStats = stats || defaultStats;

  const statCards = [
    {
      title: t('franchisor.totalFranchises') || "Total Franchises",
      value: networkStats.total_franchises,
      icon: Building2,
      description: t('franchisor.inNetwork') || "In network",
      color: "text-blue-600",
    },
    {
      title: t('franchisor.activeFranchises') || "Active Franchises",
      value: networkStats.active_franchises,
      icon: CheckCircle2,
      description: t('franchisor.operating') || "Operating",
      color: "text-green-600",
    },
    {
      title: t('franchisor.masterFranchises') || "Master Franchises",
      value: networkStats.master_franchises,
      icon: Crown,
      description: t('franchisor.regionalManagers') || "Regional managers",
      color: "text-purple-600",
    },
    {
      title: t('franchisor.pendingOnboarding') || "Pending Onboarding",
      value: networkStats.pending_onboarding,
      icon: AlertTriangle,
      description: t('franchisor.awaitingApproval') || "Awaiting approval",
      color: "text-amber-600",
    },
    {
      title: t('franchisor.totalRevenue') || "Total Revenue",
      value: `$${parseFloat(networkStats.total_revenue).toLocaleString()}`,
      icon: DollarSign,
      description: t('franchisor.thisMonth') || "This month",
      color: "text-emerald-600",
    },
    {
      title: t('franchisor.pendingRoyalties') || "Pending Royalties",
      value: `$${parseFloat(networkStats.pending_royalties).toLocaleString()}`,
      icon: TrendingUp,
      description: t('franchisor.toCollect') || "To collect",
      color: "text-orange-600",
    },
    {
      title: t('franchisor.territoriesCovered') || "Territories",
      value: networkStats.territories_covered,
      icon: MapPin,
      description: t('franchisor.activeTerritories') || "Active territories",
      color: "text-cyan-600",
    },
    {
      title: t('franchisor.contractsPending') || "Contracts Pending",
      value: networkStats.contracts_pending,
      icon: FileText,
      description: t('franchisor.awaitingSignature') || "Awaiting signature",
      color: "text-rose-600",
    },
  ];

  const quickActions = [
    { title: t('franchisor.manageFranchises') || "Manage Franchises", url: "/franchise-admin", icon: Building2 },
    { title: t('franchisor.viewMasters') || "View Masters", url: "/master-franchises", icon: Crown },
    { title: t('franchisor.contractTemplates') || "Contract Templates", url: "/contract-templates", icon: FileText },
    { title: t('franchisor.matrixSettings') || "Matrix Settings", url: "/franchisor-settings", icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-franchisor-title">
            {t('franchisor.networkDashboard') || "Network Dashboard"}
          </h1>
          <p className="text-muted-foreground">
            {t('franchisor.networkOverview') || "Complete overview of your franchise network"}
          </p>
        </div>
        <Badge variant="outline" className="w-fit bg-amber-100 text-amber-800 border-amber-300">
          <Crown className="w-4 h-4 mr-1" />
          {t('persona.franchisor') || "Franchisor"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => (
          <Card key={index} className="hover-elevate" data-testid={`card-stat-${index}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? "..." : card.value}
              </div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('franchisor.quickActions') || "Quick Actions"}</CardTitle>
            <CardDescription>
              {t('franchisor.frequentTasks') || "Frequently used tasks"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((action, index) => (
              <Link key={index} href={action.url}>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2"
                  data-testid={`button-action-${index}`}
                >
                  <action.icon className="w-4 h-4" />
                  {action.title}
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('franchisor.recentActivity') || "Recent Activity"}</CardTitle>
            <CardDescription>
              {t('franchisor.latestUpdates') || "Latest network updates"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                <Users className="w-4 h-4 text-blue-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{t('franchisor.noRecentActivity') || "No recent activity"}</p>
                  <p className="text-xs text-muted-foreground">{t('franchisor.activityWillAppear') || "Activity will appear here"}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('franchisor.networkHealth') || "Network Health"}</CardTitle>
          <CardDescription>
            {t('franchisor.healthOverview') || "Overall network status and health indicators"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  {t('franchisor.systemStatus') || "System Status"}
                </span>
              </div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                {t('franchisor.operational') || "Operational"}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-800 dark:text-blue-200">
                  {t('franchisor.activeTrading') || "Active Trading"}
                </span>
              </div>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {networkStats.active_franchises} {t('franchisor.units') || "units"}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-purple-800 dark:text-purple-200">
                  {t('franchisor.coverage') || "Coverage"}
                </span>
              </div>
              <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                {networkStats.territories_covered} {t('franchisor.regions') || "regions"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
