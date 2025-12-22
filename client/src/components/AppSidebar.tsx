import { 
  LayoutDashboard, Sparkles, Wallet, Shield, Settings, LogOut, Activity, 
  ClipboardCheck, History, ShieldCheck, Calendar, Building2, Users, ShieldAlert, 
  Lightbulb, DollarSign, Radar, BarChart3, ChevronDown, MapPin, Crown, Gauge, 
  Wind, Grid3X3, Brain, FileText, Globe, Network, TrendingUp, Power
} from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useLanguage } from "@/contexts/LanguageContext";
import { DelfosLogo } from "@/components/DelfosLogo";
import { usePersona, UserPersona } from "@/hooks/usePersona";

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  testId: string;
  badge?: string;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
}

function PersonaBadge({ persona }: { persona: UserPersona }) {
  const { t } = useLanguage();
  
  // Apenas 3 personas: Franqueadora, Master, Franquia
  const config = {
    franchisor: { label: t('persona.franchisor') || 'Franqueadora', className: 'bg-amber-600' },
    master_franchise: { label: t('persona.masterFranchise') || 'Master', className: 'bg-purple-600' },
    franchise: { label: t('persona.franchise') || 'Franquia', className: 'bg-blue-600' },
  };
  
  const { label, className } = config[persona];
  
  return (
    <Badge className={`${className} text-xs`} data-testid="badge-persona">
      {label}
    </Badge>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { t } = useLanguage();
  const { persona, isFranchisor, isMasterFranchise, isFranchise, canConfigurePlatform, isLoading } = usePersona();
  const [franchiseMenuOpen, setFranchiseMenuOpen] = useState(true);
  const [tradingMenuOpen, setTradingMenuOpen] = useState(true);

  const { data: adminStatus } = useQuery<{ isAdmin: boolean }>({
    queryKey: ['/api/admin/status'],
  });

  const isAdmin = adminStatus?.isAdmin ?? false;
  
  // Menu Trading COMPLETO - apenas para Franqueadora (inclui configurações)
  const getFullTradingMenuItems = (): MenuItem[] => [
    { title: t('nav.dashboard'), url: "/", icon: LayoutDashboard, testId: "link-dashboard" },
    { title: t('campaign.title'), url: "/campaigns", icon: Calendar, testId: "link-campaigns" },
    { title: t('nav.opportunities'), url: "/opportunities", icon: Lightbulb, testId: "link-opportunities" },
    { title: t('nav.opportunityRadar'), url: "/opportunity-radar", icon: Radar, testId: "link-opportunity-radar" },
    { title: t('nav.opportunityWindows') || "Opportunity Windows", url: "/opportunity-windows", icon: Wind, testId: "link-opportunity-windows" },
    { title: t('nav.baskets10x10') || "Baskets 10×10", url: "/baskets", icon: Grid3X3, testId: "link-baskets" },
    { title: "Market Data", url: "/market-data", icon: Activity, testId: "link-market-data" },
    { title: t('nav.risk'), url: "/risk", icon: Shield, testId: "link-risk" },
    { title: t('nav.vreDashboard') || "VRE Dashboard", url: "/vre", icon: Gauge, testId: "link-vre" },
    { title: t('nav.featureStore') || "Feature Store", url: "/feature-store", icon: BarChart3, testId: "link-feature-store" },
    { title: t('nav.portfolios'), url: "/portfolios", icon: Wallet, testId: "link-portfolios" },
    { title: t('nav.backtest'), url: "/backtest", icon: History, testId: "link-backtest" },
    { title: t('nav.audit'), url: "/audit", icon: ClipboardCheck, testId: "link-audit" },
    { title: "AI Assistant", url: "/ai", icon: Sparkles, testId: "link-ai-assistant" },
    { title: t('nav.aiLearning') || "AI Learning", url: "/ai-learning", icon: Brain, testId: "link-ai-learning" },
  ];

  // Menu Trading OPERACIONAL - para Franquia e Master (apenas visualização/operação)
  // Apenas itens permitidos: Dashboard, Campanhas, Oportunidades, Market Data, Portfolios, AI Assistant
  const getOperationalTradingMenuItems = (): MenuItem[] => [
    { title: t('nav.dashboard'), url: "/", icon: LayoutDashboard, testId: "link-dashboard" },
    { title: t('campaign.title'), url: "/campaigns", icon: Calendar, testId: "link-campaigns" },
    { title: t('nav.opportunities'), url: "/opportunities", icon: Lightbulb, testId: "link-opportunities" },
    { title: "Market Data", url: "/market-data", icon: Activity, testId: "link-market-data" },
    { title: t('nav.portfolios'), url: "/portfolios", icon: Wallet, testId: "link-portfolios" },
    { title: "AI Assistant", url: "/ai", icon: Sparkles, testId: "link-ai-assistant" },
  ];

  // Retorna menu baseado na persona
  const getTradingMenuItems = (): MenuItem[] => {
    if (canConfigurePlatform) {
      return getFullTradingMenuItems();
    }
    return getOperationalTradingMenuItems();
  };

  const getFranchisorMenuItems = (): MenuGroup[] => [
    {
      label: t('nav.networkManagement') || "Gestão da Rede",
      items: [
        { title: t('nav.franchisorDashboard') || "Dashboard Rede", url: "/franchisor", icon: Network, testId: "link-franchisor-dashboard" },
        { title: t('nav.rbmDashboard') || "RBM Dashboard", url: "/franchisor/rbm", icon: TrendingUp, testId: "link-rbm-dashboard" },
        { title: t('nav.franchisorSettings') || "Configurações Matriz", url: "/franchisor-settings", icon: Building2, testId: "link-franchisor-settings" },
        { title: t('nav.externalServices') || "Serviços Externos", url: "/franchisor/external-services", icon: Power, testId: "link-external-services" },
        { title: t('nav.contractTemplates') || "Modelos de Contrato", url: "/contract-templates", icon: FileText, testId: "link-contract-templates" },
        { title: t('nav.territories') || "Territórios", url: "/territories", icon: Globe, testId: "link-territories" },
      ]
    },
    {
      label: t('nav.franchiseManagement') || "Franquias",
      items: [
        { title: t('nav.franchises'), url: "/franchise-admin", icon: Building2, testId: "link-franchise-admin" },
        { title: t('nav.masterFranchises') || "Master Franchises", url: "/master-franchises", icon: Crown, testId: "link-master-franchises" },
        { title: t('nav.franchisePlans'), url: "/franchise-plans", icon: ClipboardCheck, testId: "link-franchise-plans" },
        { title: t('nav.franchisorFinancial'), url: "/franchisor-financial", icon: DollarSign, testId: "link-franchisor-financial" },
      ]
    },
  ];

  const getMasterFranchiseMenuItems = (): MenuGroup[] => [
    {
      label: t('nav.territoryManagement') || "Gestão Territorial",
      items: [
        { title: t('nav.masterDashboard') || "Dashboard Regional", url: "/master-franchise", icon: Crown, testId: "link-master-dashboard" },
        { title: t('nav.myTerritory') || "Meu Território", url: "/master-franchise/territory", icon: MapPin, testId: "link-my-territory" },
        { title: t('nav.subFranchises') || "Minhas Franquias", url: "/master-franchise/franchises", icon: Building2, testId: "link-sub-franchises" },
        { title: t('nav.regionalPerformance') || "Performance Regional", url: "/master-franchise/performance", icon: TrendingUp, testId: "link-regional-performance" },
        { title: t('nav.masterFinancial') || "Financeiro", url: "/master-franchise/financial", icon: DollarSign, testId: "link-master-financial" },
      ]
    },
  ];

  const getFranchiseMenuItems = (): MenuGroup[] => [
    {
      label: t('nav.myFranchise') || "Minha Franquia",
      items: [
        { title: t('nav.franchiseDashboard') || "Dashboard", url: "/franchise", icon: Users, testId: "link-my-franchise" },
        { title: t('nav.myRoyalties'), url: "/franchise/royalties", icon: DollarSign, testId: "link-my-royalties" },
        { title: t('nav.myReports'), url: "/franchise/reports", icon: BarChart3, testId: "link-my-reports" },
      ]
    },
  ];

  const renderMenuItem = (item: MenuItem) => {
    const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild isActive={isActive} data-testid={item.testId}>
          <Link href={item.url}>
            <item.icon className="w-4 h-4" />
            <span>{item.title}</span>
            {item.badge && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {item.badge}
              </Badge>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderMenuGroup = (group: MenuGroup, index: number) => (
    <SidebarGroup key={index}>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map(renderMenuItem)}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  const renderTradingMenu = () => (
    <Collapsible open={tradingMenuOpen} onOpenChange={setTradingMenuOpen}>
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent/50 rounded-md px-2 py-1 flex items-center justify-between">
            <span>{t('nav.trading') || "Trading"}</span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${tradingMenuOpen ? 'rotate-180' : ''}`} />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {getTradingMenuItems().map(renderMenuItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );

  const renderAdminMenu = () => {
    if (!isAdmin) return null;
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{t('nav.admin') || "Admin"}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {renderMenuItem({ title: t('nav.admin'), url: "/admin", icon: ShieldCheck, testId: "link-admin" })}
            {renderMenuItem({ title: t('nav.fraudAlerts'), url: "/admin/fraud-alerts", icon: ShieldAlert, testId: "link-fraud-alerts" })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };


  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <DelfosLogo variant="full" />
          {!isLoading && <PersonaBadge persona={persona} />}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isFranchisor && (
          <>
            {getFranchisorMenuItems().map(renderMenuGroup)}
            <SidebarSeparator />
            {renderTradingMenu()}
          </>
        )}
        
        {isMasterFranchise && (
          <>
            {getMasterFranchiseMenuItems().map(renderMenuGroup)}
            <SidebarSeparator />
            {renderTradingMenu()}
          </>
        )}
        
        {isFranchise && (
          <>
            {getFranchiseMenuItems().map(renderMenuGroup)}
            <SidebarSeparator />
            {renderTradingMenu()}
          </>
        )}
        
        {renderAdminMenu()}
        
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderMenuItem({ title: t('nav.settings'), url: "/settings", icon: Settings, testId: "link-settings" })}
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
