import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeProvider, useTheme } from "@/components/ThemeProvider";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { Moon, Sun, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DelfosLogo } from "@/components/DelfosLogo";
import Landing from "@/pages/Landing";
import BetaActivation from "@/pages/BetaActivation";
import Dashboard from "@/pages/Dashboard";
import AIAssistant from "@/pages/AIAssistant";
import Performance from "@/pages/Performance";
import Portfolios from "@/pages/Portfolios";
import Trading from "@/pages/Trading";
import Positions from "@/pages/Positions";
import Signals from "@/pages/Signals";
import RiskManagement from "@/pages/RiskManagement";
import CircuitBreakers from "@/pages/CircuitBreakers";
import News from "@/pages/News";
import AssetSelection from "@/pages/AssetSelection";
import MarketData from "@/pages/MarketData";
import Settings from "@/pages/Settings";
import TaxReports from "@/pages/TaxReports";
import CostsTaxes from "@/pages/CostsTaxes";
import Operations from "@/pages/Operations";
import AuditDashboard from "@/pages/AuditDashboard";
import Backtest from "@/pages/Backtest";
import Admin from "@/pages/Admin";
import Campaigns from "@/pages/Campaigns";
import CampaignWizard from "@/pages/CampaignWizard";
import NotFound from "@/pages/not-found";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
    >
      {theme === 'light' ? (
        <Moon className="w-5 h-5" />
      ) : (
        <Sun className="w-5 h-5" />
      )}
    </Button>
  );
}

function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-language-selector">
          <Globe className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setLanguage('en')}
          className={language === 'en' ? 'bg-accent' : ''}
          data-testid="option-language-en"
        >
          English
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage('es')}
          className={language === 'es' ? 'bg-accent' : ''}
          data-testid="option-language-es"
        >
          Español
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage('pt-BR')}
          className={language === 'pt-BR' ? 'bg-accent' : ''}
          data-testid="option-language-pt"
        >
          Português (BR)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AuthenticatedApp() {
  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between px-4 py-3 border-b bg-background">
            <div className="flex items-center gap-3">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <DelfosLogo variant="icon" className="md:hidden" />
            </div>
            <div className="flex items-center gap-2">
              <LanguageSelector />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-background">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/ai" component={AIAssistant} />
              <Route path="/performance" component={Performance} />
              <Route path="/portfolios" component={Portfolios} />
              <Route path="/trading" component={Trading} />
              <Route path="/positions" component={Positions} />
              <Route path="/signals" component={Signals} />
              <Route path="/risk" component={RiskManagement} />
              <Route path="/circuit-breakers" component={CircuitBreakers} />
              <Route path="/news" component={News} />
              <Route path="/assets" component={AssetSelection} />
              <Route path="/market-data" component={MarketData} />
              <Route path="/tax-reports" component={TaxReports} />
              <Route path="/costs-taxes" component={CostsTaxes} />
              <Route path="/operations" component={Operations} />
              <Route path="/audit" component={AuditDashboard} />
              <Route path="/backtest" component={Backtest} />
              <Route path="/campaigns" component={Campaigns} />
              <Route path="/campaigns/new" component={CampaignWizard} />
              <Route path="/settings" component={Settings} />
              <Route path="/admin" component={Admin} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

interface BetaStatus {
  isBetaApproved: boolean;
  betaCodeUsed: string | null;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  
  const { data: betaStatus, isLoading: isBetaLoading } = useQuery<BetaStatus>({
    queryKey: ["/api/user/beta-status"],
    enabled: isAuthenticated,
    retry: false,
  });

  if (isLoading || (isAuthenticated && isBetaLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  if (!betaStatus?.isBetaApproved) {
    return <BetaActivation />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <TooltipProvider>
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
