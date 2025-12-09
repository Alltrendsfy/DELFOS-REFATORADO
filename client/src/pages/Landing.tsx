import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Shield, 
  BarChart3, 
  Zap,
  Bot,
  Brain,
  Target,
  Layers,
  Activity,
  Clock,
  Globe,
  Lock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  LogIn,
  ExternalLink
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/components/ThemeProvider";
import { DelfosLogo } from "@/components/DelfosLogo";
import { Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const translations = {
  en: {
    hero: {
      badge: "Professional Crypto Trading Platform",
      title: "Trade Smarter with",
      titleHighlight: "AI-Powered Automation",
      subtitle: "Autonomous multi-campaign trading with real-time market data, intelligent asset selection, and three-layer risk protection.",
      cta: "Start Trading",
      ctaSecondary: "Learn More"
    },
    features: {
      title: "Why Choose DELFOS?",
      subtitle: "Built for professional traders who demand precision, speed, and security.",
      items: [
        {
          icon: "Bot",
          title: "Autonomous Trading",
          description: "Independent robots per campaign running 1-5s cycles with ATR-based signals and EMA36 validation."
        },
        {
          icon: "Brain",
          title: "AI-Powered Analysis",
          description: "GPT-4 integration for market insights, trend analysis, and intelligent trading recommendations."
        },
        {
          icon: "Target",
          title: "Smart Asset Selection",
          description: "K-means clustering with 6 quantitative features for optimal cryptocurrency pair selection."
        },
        {
          icon: "Shield",
          title: "3-Layer Circuit Breakers",
          description: "Pair, daily, and campaign-level protection to safeguard your capital automatically."
        },
        {
          icon: "Activity",
          title: "Real-Time Data",
          description: "WebSocket connection to Kraken with Redis caching and staleness guards."
        },
        {
          icon: "Layers",
          title: "OCO Orders",
          description: "Atomic One-Cancels-Other orders with Stop Loss and Take Profit for every position."
        }
      ]
    },
    profiles: {
      title: "Campaign Profiles",
      subtitle: "Choose the operational risk level for your trading strategy.",
      conservative: {
        name: "Conservative",
        risk: "0.20% per trade",
        daily: "-2% daily limit",
        drawdown: "-8% max drawdown",
        positions: "5 max positions"
      },
      moderate: {
        name: "Moderate",
        risk: "0.50% per trade",
        daily: "-4% daily limit",
        drawdown: "-12% max drawdown",
        positions: "10 max positions"
      },
      aggressive: {
        name: "Aggressive",
        risk: "1.00% per trade",
        daily: "-7% daily limit",
        drawdown: "-20% max drawdown",
        positions: "20 max positions"
      }
    },
    capabilities: {
      title: "Platform Capabilities",
      items: [
        "30-day automated trading campaigns",
        "Paper trading mode for risk-free testing",
        "Historical backtesting with Monte Carlo simulation",
        "Real-time P&L tracking and analytics",
        "Multi-language support (EN/ES/PT-BR)",
        "WhatsApp notifications and alerts",
        "Comprehensive audit trail",
        "Tax and cost tracking system"
      ]
    },
    stats: {
      pairs: "100+",
      pairsLabel: "Tradeable Pairs",
      uptime: "99.9%",
      uptimeLabel: "System Uptime",
      latency: "<50ms",
      latencyLabel: "Data Latency",
      security: "256-bit",
      securityLabel: "Encryption"
    },
    cta: {
      title: "Ready to Trade Like a Pro?",
      subtitle: "Join DELFOS and experience the future of automated cryptocurrency trading.",
      button: "Get Started Now"
    },
    footer: {
      copyright: "DELFOS - Oracle of Trading. Professional Crypto Trading Platform."
    },
    loginModal: {
      title: "Welcome to DELFOS",
      description: "Sign in securely through Replit to access your professional trading dashboard.",
      features: [
        "Secure OAuth authentication",
        "No password required",
        "Instant access to your campaigns"
      ],
      button: "Continue with Replit",
      note: "Your data is encrypted and protected."
    }
  },
  es: {
    hero: {
      badge: "Plataforma Profesional de Trading Cripto",
      title: "Opera Inteligente con",
      titleHighlight: "Automatizacion Potenciada por IA",
      subtitle: "Trading autonomo multi-campana con datos de mercado en tiempo real, seleccion inteligente de activos y proteccion de riesgo de tres capas.",
      cta: "Comenzar a Operar",
      ctaSecondary: "Saber Mas"
    },
    features: {
      title: "Por que Elegir DELFOS?",
      subtitle: "Construido para traders profesionales que exigen precision, velocidad y seguridad.",
      items: [
        {
          icon: "Bot",
          title: "Trading Autonomo",
          description: "Robots independientes por campana ejecutando ciclos de 1-5s con senales basadas en ATR y validacion EMA36."
        },
        {
          icon: "Brain",
          title: "Analisis con IA",
          description: "Integracion GPT-4 para insights de mercado, analisis de tendencias y recomendaciones inteligentes."
        },
        {
          icon: "Target",
          title: "Seleccion Inteligente",
          description: "Clustering K-means con 6 caracteristicas cuantitativas para seleccion optima de pares."
        },
        {
          icon: "Shield",
          title: "Circuit Breakers 3 Capas",
          description: "Proteccion a nivel de par, diario y campana para salvaguardar tu capital automaticamente."
        },
        {
          icon: "Activity",
          title: "Datos en Tiempo Real",
          description: "Conexion WebSocket a Kraken con cache Redis y guardas de obsolescencia."
        },
        {
          icon: "Layers",
          title: "Ordenes OCO",
          description: "Ordenes atomicas One-Cancels-Other con Stop Loss y Take Profit para cada posicion."
        }
      ]
    },
    profiles: {
      title: "Perfiles de Campaña",
      subtitle: "Elige el nivel de riesgo operacional para tu estrategia de trading.",
      conservative: {
        name: "Conservador",
        risk: "0.20% por trade",
        daily: "-2% limite diario",
        drawdown: "-8% drawdown max",
        positions: "5 posiciones max"
      },
      moderate: {
        name: "Moderado",
        risk: "0.50% por trade",
        daily: "-4% limite diario",
        drawdown: "-12% drawdown max",
        positions: "10 posiciones max"
      },
      aggressive: {
        name: "Agresivo",
        risk: "1.00% por trade",
        daily: "-7% limite diario",
        drawdown: "-20% drawdown max",
        positions: "20 posiciones max"
      }
    },
    capabilities: {
      title: "Capacidades de la Plataforma",
      items: [
        "Campanas de trading automatizadas de 30 dias",
        "Modo paper trading para pruebas sin riesgo",
        "Backtesting historico con simulacion Monte Carlo",
        "Seguimiento de P&L y analiticas en tiempo real",
        "Soporte multi-idioma (EN/ES/PT-BR)",
        "Notificaciones y alertas por WhatsApp",
        "Registro de auditoria completo",
        "Sistema de seguimiento de impuestos y costos"
      ]
    },
    stats: {
      pairs: "100+",
      pairsLabel: "Pares Operables",
      uptime: "99.9%",
      uptimeLabel: "Tiempo Activo",
      latency: "<50ms",
      latencyLabel: "Latencia de Datos",
      security: "256-bit",
      securityLabel: "Encriptacion"
    },
    cta: {
      title: "Listo para Operar como un Pro?",
      subtitle: "Unete a DELFOS y experimenta el futuro del trading automatizado de criptomonedas.",
      button: "Comenzar Ahora"
    },
    footer: {
      copyright: "DELFOS - Oraculo del Trading. Plataforma Profesional de Trading Cripto."
    },
    loginModal: {
      title: "Bienvenido a DELFOS",
      description: "Inicia sesion de forma segura a traves de Replit para acceder a tu panel de trading profesional.",
      features: [
        "Autenticacion OAuth segura",
        "Sin contrasena requerida",
        "Acceso instantaneo a tus campanas"
      ],
      button: "Continuar con Replit",
      note: "Tus datos estan encriptados y protegidos."
    }
  },
  "pt-BR": {
    hero: {
      badge: "Plataforma Profissional de Trading Cripto",
      title: "Opere com Inteligencia usando",
      titleHighlight: "Automacao com IA",
      subtitle: "Trading autonomo multi-campanha com dados de mercado em tempo real, selecao inteligente de ativos e protecao de risco em tres camadas.",
      cta: "Comecar a Operar",
      ctaSecondary: "Saiba Mais"
    },
    features: {
      title: "Por que Escolher o DELFOS?",
      subtitle: "Construido para traders profissionais que exigem precisao, velocidade e seguranca.",
      items: [
        {
          icon: "Bot",
          title: "Trading Autonomo",
          description: "Robos independentes por campanha executando ciclos de 1-5s com sinais baseados em ATR e validacao EMA36."
        },
        {
          icon: "Brain",
          title: "Analise com IA",
          description: "Integracao GPT-4 para insights de mercado, analise de tendencias e recomendacoes inteligentes."
        },
        {
          icon: "Target",
          title: "Selecao Inteligente",
          description: "Clustering K-means com 6 caracteristicas quantitativas para selecao otima de pares."
        },
        {
          icon: "Shield",
          title: "Circuit Breakers 3 Camadas",
          description: "Protecao em nivel de par, diario e campanha para proteger seu capital automaticamente."
        },
        {
          icon: "Activity",
          title: "Dados em Tempo Real",
          description: "Conexao WebSocket com Kraken com cache Redis e guardas de obsolescencia."
        },
        {
          icon: "Layers",
          title: "Ordens OCO",
          description: "Ordens atomicas One-Cancels-Other com Stop Loss e Take Profit para cada posicao."
        }
      ]
    },
    profiles: {
      title: "Perfis de Campanha",
      subtitle: "Escolha o nivel de risco operacional para sua estrategia de trading.",
      conservative: {
        name: "Conservador",
        risk: "0.20% por trade",
        daily: "-2% limite diario",
        drawdown: "-8% drawdown max",
        positions: "5 posicoes max"
      },
      moderate: {
        name: "Moderado",
        risk: "0.50% por trade",
        daily: "-4% limite diario",
        drawdown: "-12% drawdown max",
        positions: "10 posicoes max"
      },
      aggressive: {
        name: "Agressivo",
        risk: "1.00% por trade",
        daily: "-7% limite diario",
        drawdown: "-20% drawdown max",
        positions: "20 posicoes max"
      }
    },
    capabilities: {
      title: "Capacidades da Plataforma",
      items: [
        "Campanhas de trading automatizadas de 30 dias",
        "Modo paper trading para testes sem risco",
        "Backtesting historico com simulacao Monte Carlo",
        "Acompanhamento de P&L e analiticas em tempo real",
        "Suporte multi-idioma (EN/ES/PT-BR)",
        "Notificacoes e alertas via WhatsApp",
        "Trilha de auditoria completa",
        "Sistema de acompanhamento de impostos e custos"
      ]
    },
    stats: {
      pairs: "100+",
      pairsLabel: "Pares Negociaveis",
      uptime: "99.9%",
      uptimeLabel: "Tempo Ativo",
      latency: "<50ms",
      latencyLabel: "Latencia de Dados",
      security: "256-bit",
      securityLabel: "Criptografia"
    },
    cta: {
      title: "Pronto para Operar como um Pro?",
      subtitle: "Junte-se ao DELFOS e experimente o futuro do trading automatizado de criptomoedas.",
      button: "Comecar Agora"
    },
    footer: {
      copyright: "DELFOS - Oraculo do Trading. Plataforma Profissional de Trading Cripto."
    },
    loginModal: {
      title: "Bem-vindo ao DELFOS",
      description: "Faca login de forma segura atraves do Replit para acessar seu painel de trading profissional.",
      features: [
        "Autenticacao OAuth segura",
        "Sem necessidade de senha",
        "Acesso instantaneo as suas campanhas"
      ],
      button: "Continuar com Replit",
      note: "Seus dados sao criptografados e protegidos."
    }
  }
};

const iconMap: Record<string, typeof Bot> = {
  Bot,
  Brain,
  Target,
  Shield,
  Activity,
  Layers
};

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="text-white/80 hover:text-white hover:bg-white/10"
      data-testid="button-theme-toggle-landing"
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
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-white/80 hover:text-white hover:bg-white/10"
          data-testid="button-language-selector-landing"
        >
          <Globe className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setLanguage('en')}
          className={language === 'en' ? 'bg-accent' : ''}
          data-testid="option-language-en-landing"
        >
          English
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage('es')}
          className={language === 'es' ? 'bg-accent' : ''}
          data-testid="option-language-es-landing"
        >
          Espanol
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage('pt-BR')}
          className={language === 'pt-BR' ? 'bg-accent' : ''}
          data-testid="option-language-pt-landing"
        >
          Portugues (BR)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Landing() {
  const { language } = useLanguage();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const content = translations[language as keyof typeof translations] || translations.en;

  const handleLogin = () => {
    window.location.href = '/api/login';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Login Modal */}
      <Dialog open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <div className="flex justify-center mb-4">
              <DelfosLogo variant="icon" className="w-16 h-16" />
            </div>
            <DialogTitle className="text-2xl font-bold">
              {content.loginModal.title}
            </DialogTitle>
            <DialogDescription className="text-base mt-2">
              {content.loginModal.description}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <ul className="space-y-3">
              {content.loginModal.features.map((feature, index) => (
                <li key={index} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-[#5B9FB5] flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          
          <Button
            size="lg"
            className="w-full py-6 text-lg bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white"
            onClick={handleLogin}
            data-testid="button-login-modal"
          >
            <LogIn className="w-5 h-5 mr-2" />
            {content.loginModal.button}
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
          
          <p className="text-xs text-center text-muted-foreground mt-2">
            <Lock className="w-3 h-3 inline mr-1" />
            {content.loginModal.note}
          </p>
        </DialogContent>
      </Dialog>
      {/* Hero Section with Gradient Background */}
      <section className="relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1A1D23] via-[#2A3040] to-[#1A1D23]" />
        
        {/* Animated Grid Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `linear-gradient(to right, #5B9FB5 1px, transparent 1px),
                             linear-gradient(to bottom, #5B9FB5 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }} />
        </div>
        
        {/* Glowing Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#5B9FB5]/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#7DD3E8]/20 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          {/* Navigation */}
          <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <nav className="flex justify-between items-center">
              <DelfosLogo variant="full" className="[&_span]:text-white [&_.text-muted-foreground]:text-white/60" />
              <div className="flex items-center gap-2">
                <LanguageSelector />
                <ThemeToggle />
              </div>
            </nav>
          </header>

          {/* Hero Content */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24 sm:pt-20 sm:pb-32">
            <div className="text-center">
              {/* Badge */}
              <Badge 
                variant="outline" 
                className="mb-6 px-4 py-1.5 text-sm border-[#7DD3E8]/50 text-[#7DD3E8] bg-[#7DD3E8]/10"
                data-testid="badge-hero"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {content.hero.badge}
              </Badge>
              
              {/* Logo 3D */}
              <div className="flex justify-center mb-8 logo-3d-container">
                <div className="logo-3d-rotate">
                  <DelfosLogo variant="icon" className="w-32 h-32 sm:w-40 sm:h-40" />
                </div>
              </div>
              
              {/* Title */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4">
                {content.hero.title}
                <span className="block mt-2 bg-gradient-to-r from-[#5B9FB5] via-[#7DD3E8] to-[#5B9FB5] bg-clip-text text-transparent">
                  {content.hero.titleHighlight}
                </span>
              </h1>
              
              {/* Subtitle */}
              <p className="text-lg sm:text-xl text-white/70 max-w-3xl mx-auto mb-10">
                {content.hero.subtitle}
              </p>
              
              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="px-8 py-6 text-lg bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white shadow-lg shadow-[#5B9FB5]/25"
                  onClick={() => setIsLoginModalOpen(true)}
                  data-testid="button-login"
                >
                  {content.hero.cta}
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8 py-6 text-lg border-white/30 text-white hover:bg-white/10"
                  onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                  data-testid="button-learn-more"
                >
                  {content.hero.ctaSecondary}
                </Button>
              </div>
            </div>
          </div>
          
          {/* Wave Divider */}
          <div className="absolute bottom-0 left-0 right-0">
            <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
              <path d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" className="fill-background"/>
            </svg>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 sm:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {content.features.title}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {content.features.subtitle}
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {content.features.items.map((feature, index) => {
              const IconComponent = iconMap[feature.icon] || Bot;
              return (
                <Card 
                  key={index} 
                  className="p-6 hover-elevate border-border/50 bg-card/50 backdrop-blur-sm"
                  data-testid={`card-feature-${index}`}
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#5B9FB5]/20 to-[#7DD3E8]/20 flex items-center justify-center mb-4">
                    <IconComponent className="w-6 h-6 text-[#5B9FB5]" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gradient-to-r from-[#5B9FB5]/10 via-[#7DD3E8]/10 to-[#5B9FB5]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center" data-testid="stat-pairs">
              <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                {content.stats.pairs}
              </div>
              <div className="text-sm text-muted-foreground uppercase tracking-wide">
                {content.stats.pairsLabel}
              </div>
            </div>
            <div className="text-center" data-testid="stat-uptime">
              <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                {content.stats.uptime}
              </div>
              <div className="text-sm text-muted-foreground uppercase tracking-wide">
                {content.stats.uptimeLabel}
              </div>
            </div>
            <div className="text-center" data-testid="stat-latency">
              <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                {content.stats.latency}
              </div>
              <div className="text-sm text-muted-foreground uppercase tracking-wide">
                {content.stats.latencyLabel}
              </div>
            </div>
            <div className="text-center" data-testid="stat-security">
              <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                {content.stats.security}
              </div>
              <div className="text-sm text-muted-foreground uppercase tracking-wide">
                {content.stats.securityLabel}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Campaign Profiles Section */}
      <section className="py-20 sm:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {content.profiles.title}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {content.profiles.subtitle}
            </p>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-6">
            {/* Conservative */}
            <Card className="p-6 border-green-500/30 bg-green-500/5" data-testid="card-profile-conservative">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-green-500" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">
                  {content.profiles.conservative.name}
                </h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {content.profiles.conservative.risk}
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {content.profiles.conservative.daily}
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {content.profiles.conservative.drawdown}
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {content.profiles.conservative.positions}
                </li>
              </ul>
            </Card>
            
            {/* Moderate */}
            <Card className="p-6 border-[#5B9FB5]/30 bg-[#5B9FB5]/5 relative" data-testid="card-profile-moderate">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#5B9FB5]">
                Popular
              </Badge>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-[#5B9FB5]/20 flex items-center justify-center">
                  <Target className="w-5 h-5 text-[#5B9FB5]" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">
                  {content.profiles.moderate.name}
                </h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-[#5B9FB5]" />
                  {content.profiles.moderate.risk}
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-[#5B9FB5]" />
                  {content.profiles.moderate.daily}
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-[#5B9FB5]" />
                  {content.profiles.moderate.drawdown}
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-[#5B9FB5]" />
                  {content.profiles.moderate.positions}
                </li>
              </ul>
            </Card>
            
            {/* Aggressive */}
            <Card className="p-6 border-orange-500/30 bg-orange-500/5" data-testid="card-profile-aggressive">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-orange-500" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">
                  {content.profiles.aggressive.name}
                </h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-orange-500" />
                  {content.profiles.aggressive.risk}
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-orange-500" />
                  {content.profiles.aggressive.daily}
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-orange-500" />
                  {content.profiles.aggressive.drawdown}
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-orange-500" />
                  {content.profiles.aggressive.positions}
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section className="py-20 sm:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-8">
                {content.capabilities.title}
              </h2>
              <ul className="space-y-4">
                {content.capabilities.items.map((item, index) => (
                  <li key={index} className="flex items-start gap-3" data-testid={`capability-${index}`}>
                    <div className="w-6 h-6 rounded-full bg-[#7DD3E8]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle2 className="w-4 h-4 text-[#7DD3E8]" />
                    </div>
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[#5B9FB5]/20 to-[#7DD3E8]/20 rounded-3xl blur-2xl" />
              <Card className="relative p-8 bg-card/80 backdrop-blur-sm border-border/50">
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex flex-col items-center p-4 rounded-xl bg-muted/50">
                    <Clock className="w-8 h-8 text-[#5B9FB5] mb-2" />
                    <span className="text-sm text-muted-foreground text-center">1-5s Cycles</span>
                  </div>
                  <div className="flex flex-col items-center p-4 rounded-xl bg-muted/50">
                    <Bot className="w-8 h-8 text-[#5B9FB5] mb-2" />
                    <span className="text-sm text-muted-foreground text-center">Autonomous</span>
                  </div>
                  <div className="flex flex-col items-center p-4 rounded-xl bg-muted/50">
                    <BarChart3 className="w-8 h-8 text-[#5B9FB5] mb-2" />
                    <span className="text-sm text-muted-foreground text-center">Real Analytics</span>
                  </div>
                  <div className="flex flex-col items-center p-4 rounded-xl bg-muted/50">
                    <Lock className="w-8 h-8 text-[#5B9FB5] mb-2" />
                    <span className="text-sm text-muted-foreground text-center">Secure</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-24 bg-gradient-to-br from-[#1A1D23] via-[#2A3040] to-[#1A1D23] relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `linear-gradient(to right, #5B9FB5 1px, transparent 1px),
                             linear-gradient(to bottom, #5B9FB5 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }} />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#5B9FB5]/10 rounded-full blur-3xl" />
        
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            {content.cta.title}
          </h2>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            {content.cta.subtitle}
          </p>
          <Button
            size="lg"
            className="px-10 py-6 text-lg bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white shadow-lg shadow-[#5B9FB5]/25"
            onClick={() => setIsLoginModalOpen(true)}
            data-testid="button-cta-final"
          >
            {content.cta.button}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-background border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <DelfosLogo variant="full" />
            <p className="text-sm text-muted-foreground text-center sm:text-right">
              &copy; 2025 {content.footer.copyright}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
