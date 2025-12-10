import { LayoutDashboard, Sparkles, Wallet, Shield, Settings, LogOut, Activity, ClipboardCheck, History, ShieldCheck, Calendar } from "lucide-react";
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
    // VISÃO GERAL
    {
      title: t('nav.dashboard'),
      url: "/",
      icon: LayoutDashboard,
      testId: "link-dashboard",
    },
    // CAMPANHAS (consolidado - Nova Campanha agora é botão interno)
    {
      title: t('campaign.title'),
      url: "/campaigns",
      icon: Calendar,
      testId: "link-campaigns",
    },
    // ANÁLISE DE MERCADO
    {
      title: "Market Data",
      url: "/market-data",
      icon: Activity,
      testId: "link-market-data",
    },
    // Gestão de Risco (consolidado - Circuit Breakers agora é aba interna)
    {
      title: t('nav.risk'),
      url: "/risk",
      icon: Shield,
      testId: "link-risk",
    },
    // PORTFÓLIOS (consolidado - Desempenho agora é aba interna)
    {
      title: t('nav.portfolios'),
      url: "/portfolios",
      icon: Wallet,
      testId: "link-portfolios",
    },
    // ANÁLISE E COMPLIANCE
    {
      title: t('nav.backtest'),
      url: "/backtest",
      icon: History,
      testId: "link-backtest",
    },
    // Auditoria & Compliance (consolidado - Custos e Impostos agora é aba interna)
    {
      title: t('nav.audit'),
      url: "/audit",
      icon: ClipboardCheck,
      testId: "link-audit",
    },
    // FERRAMENTAS
    {
      title: "AI Assistant",
      url: "/ai",
      icon: Sparkles,
      testId: "link-ai-assistant",
    },
    // SISTEMA
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
