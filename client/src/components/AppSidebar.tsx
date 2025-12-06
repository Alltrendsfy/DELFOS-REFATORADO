import { LayoutDashboard, Sparkles, TrendingUp, BarChart3, Wallet, Shield, AlertCircle, Newspaper, Settings, LogOut, Target, Radio, Receipt, Activity, Clock, ClipboardCheck, History, ShieldCheck, Calendar, LineChart, PlusCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { useLanguage } from "@/contexts/LanguageContext";
import { DelfosLogo } from "@/components/DelfosLogo";

export function AppSidebar() {
  const [location] = useLocation();
  const { t } = useLanguage();

  const { data: adminStatus } = useQuery<{ isAdmin: boolean }>({
    queryKey: ['/api/admin/status'],
  });

  const isAdmin = adminStatus?.isAdmin ?? false;

  const menuItems = [
    // SETUP: Preparação do ambiente de trading
    {
      title: t('nav.dashboard'),
      url: "/",
      icon: LayoutDashboard,
      testId: "link-dashboard",
    },
    {
      title: t('nav.assets'),
      url: "/assets",
      icon: Target,
      testId: "link-assets",
    },
    {
      title: t('nav.risk'),
      url: "/risk",
      icon: Shield,
      testId: "link-risk",
    },
    {
      title: "Circuit Breakers",
      url: "/circuit-breakers",
      icon: AlertCircle,
      testId: "link-circuit-breakers",
    },
    // ANÁLISE: Inteligência e contexto de mercado
    {
      title: "Signals",
      url: "/signals",
      icon: Radio,
      testId: "link-signals",
    },
    {
      title: "AI Assistant",
      url: "/ai",
      icon: Sparkles,
      testId: "link-ai-assistant",
    },
    {
      title: t('nav.news'),
      url: "/news",
      icon: Newspaper,
      testId: "link-news",
    },
    {
      title: "Market Data",
      url: "/market-data",
      icon: Activity,
      testId: "link-market-data",
    },
    // EXECUÇÃO: Operações de trading
    {
      title: t('nav.trading'),
      url: "/trading",
      icon: TrendingUp,
      testId: "link-trading",
    },
    {
      title: t('nav.positions'),
      url: "/positions",
      icon: LineChart,
      testId: "link-positions",
    },
    // MONITORAMENTO: Acompanhamento pós-trade
    {
      title: t('nav.portfolios'),
      url: "/portfolios",
      icon: Wallet,
      testId: "link-portfolios",
    },
    {
      title: t('nav.performance'),
      url: "/performance",
      icon: BarChart3,
      testId: "link-performance",
    },
    {
      title: t('nav.operations'),
      url: "/operations",
      icon: Clock,
      testId: "link-operations",
    },
    {
      title: t('nav.audit'),
      url: "/audit",
      icon: ClipboardCheck,
      testId: "link-audit",
    },
    {
      title: t('nav.backtest'),
      url: "/backtest",
      icon: History,
      testId: "link-backtest",
    },
    {
      title: t('campaign.title'),
      url: "/campaigns",
      icon: Calendar,
      testId: "link-campaigns",
    },
    {
      title: t('wizard.menuItem'),
      url: "/campaigns/new",
      icon: PlusCircle,
      testId: "link-campaign-wizard",
    },
    {
      title: t('costs.title'),
      url: "/costs-taxes",
      icon: Receipt,
      testId: "link-costs-taxes",
    },
    // ADMIN: Configurações
    {
      title: t('nav.settings'),
      url: "/settings",
      icon: Settings,
      testId: "link-settings",
    },
  ];

  const adminItem = {
    title: t('nav.admin'),
    url: "/admin",
    icon: ShieldCheck,
    testId: "link-admin",
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <DelfosLogo variant="full" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} data-testid={item.testId}>
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isAdmin && (
                <SidebarMenuItem key={adminItem.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location === adminItem.url} 
                    data-testid={adminItem.testId}
                  >
                    <Link href={adminItem.url}>
                      <adminItem.icon className="w-4 h-4" />
                      <span>{adminItem.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => window.location.href = '/api/logout'}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('nav.logout')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
