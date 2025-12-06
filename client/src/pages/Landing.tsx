import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TrendingUp, Shield, BarChart3, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { DelfosLogo } from "@/components/DelfosLogo";

export default function Landing() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-primary/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="py-6 flex justify-between items-center">
          <DelfosLogo variant="full" />
        </header>

        {/* Hero Section */}
        <div className="pt-20 pb-16 text-center">
          <div className="flex justify-center mb-12 logo-3d-container">
            <div className="logo-3d-rotate">
              <DelfosLogo variant="icon" className="w-40 h-40 sm:w-48 sm:h-48" />
            </div>
          </div>
          <h2 className="text-5xl sm:text-6xl font-bold text-foreground mb-6 bg-gradient-to-r from-primary via-primary to-chart-2 bg-clip-text text-transparent">
            {t('auth.welcome')}
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            {t('auth.subtitle')}
          </p>
          <Button
            size="lg"
            className="px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-shadow"
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-login"
          >
            {t('auth.login')}
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 py-16">
          <Card className="p-6 hover-elevate">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Real-Time Data</h3>
            <p className="text-sm text-muted-foreground">
              Live market data from Kraken exchange via WebSocket
            </p>
          </Card>

          <Card className="p-6 hover-elevate">
            <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Risk Management</h3>
            <p className="text-sm text-muted-foreground">
              Advanced three-layer risk controls and circuit breakers
            </p>
          </Card>

          <Card className="p-6 hover-elevate">
            <div className="w-12 h-12 bg-chart-2/20 rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-chart-2" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Analytics</h3>
            <p className="text-sm text-muted-foreground">
              Performance tracking and comprehensive trade history
            </p>
          </Card>

          <Card className="p-6 hover-elevate">
            <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-warning" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Smart Alerts</h3>
            <p className="text-sm text-muted-foreground">
              WhatsApp notifications and price alerts for key movements
            </p>
          </Card>
        </div>

        {/* Footer */}
        <footer className="py-8 text-center text-sm text-muted-foreground border-t">
          <p>&copy; 2025 DELFOS - Oracle of Trading. Professional Crypto Trading Platform.</p>
        </footer>
      </div>
    </div>
  );
}
