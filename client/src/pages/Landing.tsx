import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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
  ExternalLink,
  Users,
  Building2,
  Crown,
  Rocket,
  HeadphonesIcon,
  GraduationCap,
  DollarSign,
  PieChart,
  Award,
  Phone,
  Mail,
  MapPin,
  Loader2
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const translations = {
  en: {
    nav: {
      franchise: "Franchise",
      plans: "Plans",
      benefits: "Benefits",
      contact: "Contact"
    },
    hero: {
      badge: "Institutional Trading Platform V2.0+",
      title: "Autonomous Trading",
      titleHighlight: "Powered by Artificial Intelligence",
      subtitle: "Offer your clients a professional trading platform with multi-layer risk protection, intelligent campaigns, and continuous AI learning. Technology that works for you 24/7.",
      cta: "Become a Franchisee",
      ctaSecondary: "Learn More"
    },
    valueProps: {
      title: "Why Choose DELFOS Franchise?",
      subtitle: "A proven business model with revolutionary technology and comprehensive support.",
      items: [
        {
          icon: "Brain",
          title: "Cutting-Edge Technology",
          description: "AI-powered autonomous trading platform with real-time market analysis and 3-layer risk protection."
        },
        {
          icon: "HeadphonesIcon",
          title: "Full Support",
          description: "Dedicated support team, ongoing training, and marketing materials to help you succeed."
        },
        {
          icon: "GraduationCap",
          title: "Complete Training",
          description: "Comprehensive onboarding program covering platform operation, sales, and customer support."
        },
        {
          icon: "DollarSign",
          title: "Attractive Returns",
          description: "Competitive royalty structure with multiple revenue streams and growth incentives."
        },
        {
          icon: "Users",
          title: "Established Network",
          description: "Join a growing network of successful franchisees operating across multiple regions."
        },
        {
          icon: "Shield",
          title: "Regulatory Compliance",
          description: "Full compliance framework with tax tracking, audit trails, and security certifications."
        }
      ]
    },
    plans: {
      title: "Franchise Plans",
      subtitle: "Choose the plan that fits your investment capacity and growth ambitions.",
      starter: {
        name: "Starter",
        description: "Perfect for entrepreneurs starting their journey in crypto trading services.",
        investment: "$25,000",
        investmentLabel: "Initial Investment",
        riskMultiplier: "2x",
        riskMultiplierLabel: "Max Risk Multiplier",
        features: [
          "Conservative risk profile",
          "Up to 50 client accounts",
          "Risk multiplier up to 2x",
          "Basic training program",
          "Email support",
          "Marketing starter kit"
        ],
        cta: "Start Here"
      },
      pro: {
        name: "Pro",
        badge: "Most Popular",
        description: "Ideal for established businesses looking to expand their financial services.",
        investment: "$75,000",
        investmentLabel: "Initial Investment",
        riskMultiplier: "3x",
        riskMultiplierLabel: "Max Risk Multiplier",
        features: [
          "Conservative & Moderate profiles",
          "Up to 200 client accounts",
          "Risk multiplier up to 3x",
          "Advanced training program",
          "Priority phone & email support",
          "Full marketing suite",
          "Regional exclusivity options"
        ],
        cta: "Go Pro"
      },
      enterprise: {
        name: "Enterprise",
        description: "For large-scale operations with maximum flexibility and premium benefits.",
        investment: "$150,000",
        investmentLabel: "Initial Investment",
        riskMultiplier: "4x",
        riskMultiplierLabel: "Max Risk Multiplier",
        features: [
          "All risk profiles unlocked",
          "Unlimited client accounts",
          "Risk multiplier up to 4x",
          "Executive training program",
          "24/7 dedicated support",
          "Custom branding options",
          "Multi-region exclusivity",
          "White-label possibilities"
        ],
        cta: "Contact Sales"
      },
    },
    howItWorks: {
      title: "How It Works",
      subtitle: "Your journey to becoming a DELFOS franchisee in 4 simple steps.",
      steps: [
        {
          number: "01",
          title: "Apply",
          description: "Fill out the franchise application form and tell us about your background."
        },
        {
          number: "02",
          title: "Evaluate",
          description: "Our team reviews your application and schedules a discovery call."
        },
        {
          number: "03",
          title: "Train",
          description: "Complete our comprehensive training program and get certified."
        },
        {
          number: "04",
          title: "Launch",
          description: "Open your franchise with full support and start serving clients."
        }
      ]
    },
    stats: {
      franchises: "50+",
      franchisesLabel: "Active Franchises",
      countries: "12",
      countriesLabel: "Countries",
      clients: "10K+",
      clientsLabel: "Clients Served",
      volume: "$500M+",
      volumeLabel: "Trading Volume"
    },
    testimonials: {
      title: "Franchisee Success Stories",
      items: [
        {
          quote: "DELFOS gave me the technology and support to build a thriving crypto trading business from scratch.",
          name: "Carlos M.",
          role: "Pro Franchisee, Miami"
        },
        {
          quote: "The training program was exceptional. I felt fully prepared to serve my clients from day one.",
          name: "Sarah L.",
          role: "Starter Franchisee, Toronto"
        },
        {
          quote: "The enterprise plan's white-label option allowed us to integrate seamlessly with our existing brand.",
          name: "James K.",
          role: "Enterprise Franchisee, London"
        }
      ]
    },
    contact: {
      title: "Ready to Join DELFOS?",
      subtitle: "Fill out the form below and our franchise team will contact you within 24 hours.",
      form: {
        name: "Full Name",
        email: "Email",
        phone: "Phone",
        country: "Country",
        investment: "Investment Capacity",
        message: "Tell us about yourself",
        submit: "Request Information",
        investmentOptions: {
          starter: "$25K - $50K",
          pro: "$50K - $100K",
          enterprise: "$100K+"
        }
      },
      info: {
        title: "Contact Information",
        email: "franchise@delfos.ai",
        phone: "+1 (888) DELFOS-1",
        address: "Global Operations"
      }
    },
    cta: {
      title: "Start Your Franchise Journey Today",
      subtitle: "Join the DELFOS network and be part of the future of automated crypto trading.",
      button: "Apply Now"
    },
    accessPortal: {
      title: "Access Portal",
      subtitle: "Already a DELFOS partner? Access your exclusive dashboard.",
      franchisor: "Franchisor",
      franchisorDesc: "Global network management and governance dashboard.",
      master: "Master Franchise",
      masterDesc: "Regional territory management and oversight.",
      franchise: "Franchise",
      franchiseDesc: "Daily operations and client management.",
      accessButton: "Access"
    },
    technology: {
      title: "Cutting-Edge Technology",
      subtitle: "A complete ecosystem that automates every aspect of professional trading.",
      items: [
        {
          icon: "Brain",
          title: "Autonomous AI",
          description: "Trading system that learns and adapts to market conditions in real-time."
        },
        {
          icon: "Activity",
          title: "Volatility Analysis",
          description: "4-level intelligent classification engine for automatic strategy adjustment."
        },
        {
          icon: "Layers",
          title: "Intelligent Campaigns",
          description: "30-day cycles with daily compounding and isolated position management."
        },
        {
          icon: "Sparkles",
          title: "Continuous Learning",
          description: "Pattern discovery system that constantly improves trading performance."
        }
      ]
    },
    capitalProtection: {
      title: "Capital Protection",
      subtitle: "Your clients' security is our priority. Multi-layer protection system.",
      items: [
        {
          title: "Multi-Layer Security",
          description: "Automatic circuit breakers that stop operations under adverse conditions."
        },
        {
          title: "6 Automatic Validations",
          description: "Quality gate that verifies every trade before execution."
        },
        {
          title: "Auto-Rollback",
          description: "Automatic protection that reverts risk settings if needed."
        },
        {
          title: "Risk Multiplier",
          description: "Progressive system from 2x to 5x with task-based unlocking."
        }
      ]
    },
    footer: {
      copyright: "DELFOS - Oracle of Trading. Professional Crypto Trading Franchise Network.",
      links: {
        privacy: "Privacy Policy",
        terms: "Terms of Service",
        faq: "FAQ"
      }
    },
    loginModal: {
      title: "Welcome to DELFOS",
      description: "Sign in securely through Replit to access your franchise dashboard.",
      features: [
        "Secure OAuth authentication",
        "No password required",
        "Instant access to your dashboard"
      ],
      button: "Continue with Replit",
      note: "Your data is encrypted and protected."
    }
  },
  es: {
    nav: {
      franchise: "Franquicia",
      plans: "Planes",
      benefits: "Beneficios",
      contact: "Contacto"
    },
    hero: {
      badge: "Plataforma Institucional de Trading V2.0+",
      title: "Trading Autonomo",
      titleHighlight: "Impulsado por Inteligencia Artificial",
      subtitle: "Ofrece a tus clientes una plataforma de trading profesional con proteccion de riesgo multicapa, campanas inteligentes y aprendizaje continuo de IA. Tecnologia que trabaja para ti 24/7.",
      cta: "Ser Franquiciado",
      ctaSecondary: "Saber Mas"
    },
    valueProps: {
      title: "Por que Elegir la Franquicia DELFOS?",
      subtitle: "Un modelo de negocio probado con tecnologia revolucionaria y soporte integral.",
      items: [
        {
          icon: "Brain",
          title: "Tecnologia de Vanguardia",
          description: "Plataforma de trading autonomo con IA, analisis de mercado en tiempo real y proteccion de riesgo de 3 capas."
        },
        {
          icon: "HeadphonesIcon",
          title: "Soporte Completo",
          description: "Equipo de soporte dedicado, capacitacion continua y materiales de marketing."
        },
        {
          icon: "GraduationCap",
          title: "Capacitacion Integral",
          description: "Programa de incorporacion completo sobre operacion de plataforma, ventas y atencion al cliente."
        },
        {
          icon: "DollarSign",
          title: "Retornos Atractivos",
          description: "Estructura de regalias competitiva con multiples flujos de ingresos e incentivos de crecimiento."
        },
        {
          icon: "Users",
          title: "Red Establecida",
          description: "Unete a una red creciente de franquiciados exitosos operando en multiples regiones."
        },
        {
          icon: "Shield",
          title: "Cumplimiento Regulatorio",
          description: "Marco de cumplimiento completo con seguimiento fiscal, registros de auditoria y certificaciones de seguridad."
        }
      ]
    },
    plans: {
      title: "Planes de Franquicia",
      subtitle: "Elige el plan que se ajuste a tu capacidad de inversion y ambiciones de crecimiento.",
      starter: {
        name: "Starter",
        description: "Perfecto para emprendedores que inician su camino en servicios de trading cripto.",
        investment: "$25,000",
        investmentLabel: "Inversion Inicial",
        riskMultiplier: "2x",
        riskMultiplierLabel: "Multiplicador de Riesgo Max",
        features: [
          "Perfil de riesgo conservador",
          "Hasta 50 cuentas de clientes",
          "Multiplicador de riesgo hasta 2x",
          "Programa de capacitacion basico",
          "Soporte por email",
          "Kit de marketing inicial"
        ],
        cta: "Comenzar Aqui"
      },
      pro: {
        name: "Pro",
        badge: "Mas Popular",
        description: "Ideal para negocios establecidos que buscan expandir sus servicios financieros.",
        investment: "$75,000",
        investmentLabel: "Inversion Inicial",
        riskMultiplier: "3x",
        riskMultiplierLabel: "Multiplicador de Riesgo Max",
        features: [
          "Perfiles Conservador y Moderado",
          "Hasta 200 cuentas de clientes",
          "Multiplicador de riesgo hasta 3x",
          "Programa de capacitacion avanzado",
          "Soporte prioritario telefono y email",
          "Suite completa de marketing",
          "Opciones de exclusividad regional"
        ],
        cta: "Ir Pro"
      },
      enterprise: {
        name: "Enterprise",
        description: "Para operaciones a gran escala con maxima flexibilidad y beneficios premium.",
        investment: "$150,000",
        investmentLabel: "Inversion Inicial",
        riskMultiplier: "4x",
        riskMultiplierLabel: "Multiplicador de Riesgo Max",
        features: [
          "Todos los perfiles de riesgo",
          "Cuentas de clientes ilimitadas",
          "Multiplicador de riesgo hasta 4x",
          "Programa de capacitacion ejecutivo",
          "Soporte dedicado 24/7",
          "Opciones de marca personalizada",
          "Exclusividad multi-region",
          "Posibilidades de marca blanca"
        ],
        cta: "Contactar Ventas"
      },
      master: {
        name: "Master",
        badge: "Premium",
        description: "Para maestros de territorio con control operacional completo y beneficios maximos.",
        investment: "$300,000",
        investmentLabel: "Inversion Inicial",
        riskMultiplier: "5x",
        riskMultiplierLabel: "Multiplicador de Riesgo Max",
        features: [
          "Todos los perfiles + acceso Master",
          "Cuentas de clientes ilimitadas",
          "Multiplicador de riesgo hasta 5x",
          "Capacitacion ejecutiva + mentoria",
          "Soporte VIP 24/7",
          "Derechos de territorio exclusivo",
          "Capacidades de marca blanca",
          "Gestion de sub-franquicias"
        ],
        cta: "Contactar Ventas"
      }
    },
    howItWorks: {
      title: "Como Funciona",
      subtitle: "Tu camino para convertirte en franquiciado DELFOS en 4 simples pasos.",
      steps: [
        {
          number: "01",
          title: "Aplica",
          description: "Completa el formulario de aplicacion y cuentanos sobre tu experiencia."
        },
        {
          number: "02",
          title: "Evalua",
          description: "Nuestro equipo revisa tu aplicacion y agenda una llamada de descubrimiento."
        },
        {
          number: "03",
          title: "Capacitate",
          description: "Completa nuestro programa de capacitacion integral y obten tu certificacion."
        },
        {
          number: "04",
          title: "Lanza",
          description: "Abre tu franquicia con soporte completo y comienza a atender clientes."
        }
      ]
    },
    stats: {
      franchises: "50+",
      franchisesLabel: "Franquicias Activas",
      countries: "12",
      countriesLabel: "Paises",
      clients: "10K+",
      clientsLabel: "Clientes Atendidos",
      volume: "$500M+",
      volumeLabel: "Volumen de Trading"
    },
    testimonials: {
      title: "Historias de Exito de Franquiciados",
      items: [
        {
          quote: "DELFOS me dio la tecnologia y el soporte para construir un negocio de trading cripto prospero desde cero.",
          name: "Carlos M.",
          role: "Franquiciado Pro, Miami"
        },
        {
          quote: "El programa de capacitacion fue excepcional. Me senti completamente preparado para atender a mis clientes desde el primer dia.",
          name: "Sarah L.",
          role: "Franquiciada Starter, Toronto"
        },
        {
          quote: "La opcion de marca blanca del plan enterprise nos permitio integrarnos perfectamente con nuestra marca existente.",
          name: "James K.",
          role: "Franquiciado Enterprise, Londres"
        }
      ]
    },
    contact: {
      title: "Listo para Unirte a DELFOS?",
      subtitle: "Completa el formulario y nuestro equipo de franquicias te contactara en 24 horas.",
      form: {
        name: "Nombre Completo",
        email: "Email",
        phone: "Telefono",
        country: "Pais",
        investment: "Capacidad de Inversion",
        message: "Cuentanos sobre ti",
        submit: "Solicitar Informacion",
        investmentOptions: {
          starter: "$25K - $50K",
          pro: "$50K - $100K",
          enterprise: "$100K+"
        }
      },
      info: {
        title: "Informacion de Contacto",
        email: "franquicias@delfos.ai",
        phone: "+1 (888) DELFOS-1",
        address: "Operaciones Globales"
      }
    },
    cta: {
      title: "Comienza Tu Viaje de Franquicia Hoy",
      subtitle: "Unete a la red DELFOS y se parte del futuro del trading cripto automatizado.",
      button: "Aplicar Ahora"
    },
    accessPortal: {
      title: "Portal de Acceso",
      subtitle: "Ya eres socio DELFOS? Accede a tu panel exclusivo.",
      franchisor: "Franquiciadora",
      franchisorDesc: "Panel de gestion y gobernanza de la red global.",
      master: "Master Franquicia",
      masterDesc: "Gestion de territorios regionales y supervision.",
      franchise: "Franquicia",
      franchiseDesc: "Operaciones diarias y gestion de clientes.",
      accessButton: "Acceder"
    },
    technology: {
      title: "Tecnologia de Vanguardia",
      subtitle: "Un ecosistema completo que automatiza cada aspecto del trading profesional.",
      items: [
        {
          icon: "Brain",
          title: "IA Autonoma",
          description: "Sistema de trading que aprende y se adapta a las condiciones del mercado en tiempo real."
        },
        {
          icon: "Activity",
          title: "Analisis de Volatilidad",
          description: "Motor de clasificacion inteligente de 4 niveles para ajuste automatico de estrategias."
        },
        {
          icon: "Layers",
          title: "Campanas Inteligentes",
          description: "Ciclos de 30 dias con composicion diaria y gestion de posiciones aisladas."
        },
        {
          icon: "Sparkles",
          title: "Aprendizaje Continuo",
          description: "Sistema de descubrimiento de patrones que mejora constantemente el rendimiento."
        }
      ]
    },
    capitalProtection: {
      title: "Proteccion de Capital",
      subtitle: "La seguridad de tus clientes es nuestra prioridad. Sistema de proteccion multicapa.",
      items: [
        {
          title: "Seguridad Multicapa",
          description: "Circuit breakers automaticos que detienen operaciones en condiciones adversas."
        },
        {
          title: "6 Validaciones Automaticas",
          description: "Quality gate que verifica cada operacion antes de su ejecucion."
        },
        {
          title: "Auto-Rollback",
          description: "Proteccion automatica que revierte configuraciones de riesgo si es necesario."
        },
        {
          title: "Multiplicador de Riesgo",
          description: "Sistema progresivo de 2x a 5x con desbloqueo por cumplimiento de tareas."
        }
      ]
    },
    footer: {
      copyright: "DELFOS - Oraculo del Trading. Red Profesional de Franquicias de Trading Cripto.",
      links: {
        privacy: "Politica de Privacidad",
        terms: "Terminos de Servicio",
        faq: "Preguntas Frecuentes"
      }
    },
    loginModal: {
      title: "Bienvenido a DELFOS",
      description: "Inicia sesion de forma segura a traves de Replit para acceder a tu panel de franquicia.",
      features: [
        "Autenticacion OAuth segura",
        "Sin contrasena requerida",
        "Acceso instantaneo a tu panel"
      ],
      button: "Continuar con Replit",
      note: "Tus datos estan encriptados y protegidos."
    }
  },
  "pt-BR": {
    nav: {
      franchise: "Franquia",
      plans: "Planos",
      benefits: "Beneficios",
      contact: "Contato"
    },
    hero: {
      badge: "Plataforma Institucional de Trading V2.0+",
      title: "Trading Autonomo",
      titleHighlight: "Movido por Inteligencia Artificial",
      subtitle: "Ofereca aos seus clientes uma plataforma de trading profissional com protecao de risco multicamada, campanhas inteligentes e aprendizado continuo de IA. Tecnologia que trabalha para voce 24/7.",
      cta: "Seja um Franqueado",
      ctaSecondary: "Saiba Mais"
    },
    valueProps: {
      title: "Por que Escolher a Franquia DELFOS?",
      subtitle: "Um modelo de negocio comprovado com tecnologia revolucionaria e suporte completo.",
      items: [
        {
          icon: "Brain",
          title: "Tecnologia de Ponta",
          description: "Plataforma de trading autonomo com IA, analise de mercado em tempo real e protecao de risco em 3 camadas."
        },
        {
          icon: "HeadphonesIcon",
          title: "Suporte Completo",
          description: "Equipe de suporte dedicada, treinamento continuo e materiais de marketing."
        },
        {
          icon: "GraduationCap",
          title: "Treinamento Integral",
          description: "Programa de integracao completo sobre operacao da plataforma, vendas e atendimento ao cliente."
        },
        {
          icon: "DollarSign",
          title: "Retornos Atrativos",
          description: "Estrutura de royalties competitiva com multiplos fluxos de receita e incentivos de crescimento."
        },
        {
          icon: "Users",
          title: "Rede Estabelecida",
          description: "Junte-se a uma rede crescente de franqueados de sucesso operando em multiplas regioes."
        },
        {
          icon: "Shield",
          title: "Conformidade Regulatoria",
          description: "Framework de conformidade completo com rastreamento fiscal, trilhas de auditoria e certificacoes de seguranca."
        }
      ]
    },
    plans: {
      title: "Planos de Franquia",
      subtitle: "Escolha o plano que se adapta a sua capacidade de investimento e ambicoes de crescimento.",
      starter: {
        name: "Starter",
        description: "Perfeito para empreendedores iniciando sua jornada em servicos de trading cripto.",
        investment: "$25,000",
        investmentLabel: "Investimento Inicial",
        riskMultiplier: "2x",
        riskMultiplierLabel: "Multiplicador de Risco Max",
        features: [
          "Perfil de risco conservador",
          "Ate 50 contas de clientes",
          "Multiplicador de risco ate 2x",
          "Programa de treinamento basico",
          "Suporte por email",
          "Kit de marketing inicial"
        ],
        cta: "Comecar Aqui"
      },
      pro: {
        name: "Pro",
        badge: "Mais Popular",
        description: "Ideal para negocios estabelecidos que buscam expandir seus servicos financeiros.",
        investment: "$75,000",
        investmentLabel: "Investimento Inicial",
        riskMultiplier: "3x",
        riskMultiplierLabel: "Multiplicador de Risco Max",
        features: [
          "Perfis Conservador e Moderado",
          "Ate 200 contas de clientes",
          "Multiplicador de risco ate 3x",
          "Programa de treinamento avancado",
          "Suporte prioritario telefone e email",
          "Suite completa de marketing",
          "Opcoes de exclusividade regional"
        ],
        cta: "Ir Pro"
      },
      enterprise: {
        name: "Enterprise",
        description: "Para operacoes em grande escala com maxima flexibilidade e beneficios premium.",
        investment: "$150,000",
        investmentLabel: "Investimento Inicial",
        riskMultiplier: "4x",
        riskMultiplierLabel: "Multiplicador de Risco Max",
        features: [
          "Todos os perfis de risco",
          "Contas de clientes ilimitadas",
          "Multiplicador de risco ate 4x",
          "Programa de treinamento executivo",
          "Suporte dedicado 24/7",
          "Opcoes de marca personalizada",
          "Exclusividade multi-regiao",
          "Possibilidades de white-label"
        ],
        cta: "Contatar Vendas"
      },
      master: {
        name: "Master",
        badge: "Premium",
        description: "Para mestres de territorio com controle operacional completo e beneficios maximos.",
        investment: "$300,000",
        investmentLabel: "Investimento Inicial",
        riskMultiplier: "5x",
        riskMultiplierLabel: "Multiplicador de Risco Max",
        features: [
          "Todos os perfis + acesso Master",
          "Contas de clientes ilimitadas",
          "Multiplicador de risco ate 5x",
          "Treinamento executivo + mentoria",
          "Suporte VIP 24/7",
          "Direitos de territorio exclusivo",
          "Capacidades white-label",
          "Gestao de sub-franquias"
        ],
        cta: "Contatar Vendas"
      }
    },
    howItWorks: {
      title: "Como Funciona",
      subtitle: "Sua jornada para se tornar um franqueado DELFOS em 4 passos simples.",
      steps: [
        {
          number: "01",
          title: "Aplique",
          description: "Preencha o formulario de aplicacao e conte-nos sobre sua experiencia."
        },
        {
          number: "02",
          title: "Avalie",
          description: "Nossa equipe revisa sua aplicacao e agenda uma chamada de descoberta."
        },
        {
          number: "03",
          title: "Treine",
          description: "Complete nosso programa de treinamento abrangente e obtenha sua certificacao."
        },
        {
          number: "04",
          title: "Lance",
          description: "Abra sua franquia com suporte total e comece a atender clientes."
        }
      ]
    },
    stats: {
      franchises: "50+",
      franchisesLabel: "Franquias Ativas",
      countries: "12",
      countriesLabel: "Paises",
      clients: "10K+",
      clientsLabel: "Clientes Atendidos",
      volume: "$500M+",
      volumeLabel: "Volume de Trading"
    },
    testimonials: {
      title: "Historias de Sucesso dos Franqueados",
      items: [
        {
          quote: "O DELFOS me deu a tecnologia e o suporte para construir um negocio de trading cripto prospero do zero.",
          name: "Carlos M.",
          role: "Franqueado Pro, Miami"
        },
        {
          quote: "O programa de treinamento foi excepcional. Me senti completamente preparado para atender meus clientes desde o primeiro dia.",
          name: "Sarah L.",
          role: "Franqueada Starter, Toronto"
        },
        {
          quote: "A opcao white-label do plano enterprise nos permitiu integrar perfeitamente com nossa marca existente.",
          name: "James K.",
          role: "Franqueado Enterprise, Londres"
        }
      ]
    },
    contact: {
      title: "Pronto para Fazer Parte do DELFOS?",
      subtitle: "Preencha o formulario e nossa equipe de franquias entrara em contato em 24 horas.",
      form: {
        name: "Nome Completo",
        email: "Email",
        phone: "Telefone",
        country: "Pais",
        investment: "Capacidade de Investimento",
        message: "Conte-nos sobre voce",
        submit: "Solicitar Informacoes",
        investmentOptions: {
          starter: "$25K - $50K",
          pro: "$50K - $100K",
          enterprise: "$100K+"
        }
      },
      info: {
        title: "Informacoes de Contato",
        email: "franquias@delfos.ai",
        phone: "+1 (888) DELFOS-1",
        address: "Operacoes Globais"
      }
    },
    cta: {
      title: "Comece Sua Jornada de Franquia Hoje",
      subtitle: "Junte-se a rede DELFOS e faca parte do futuro do trading cripto automatizado.",
      button: "Aplicar Agora"
    },
    accessPortal: {
      title: "Portal de Acesso",
      subtitle: "Ja e parceiro DELFOS? Acesse seu painel exclusivo.",
      franchisor: "Franqueadora",
      franchisorDesc: "Painel de gestao e governanca da rede global.",
      master: "Master Franquia",
      masterDesc: "Gestao de territorios regionais e supervisao.",
      franchise: "Franquia",
      franchiseDesc: "Operacoes diarias e gestao de clientes.",
      accessButton: "Acessar"
    },
    technology: {
      title: "Tecnologia de Ponta",
      subtitle: "Um ecossistema completo que automatiza cada aspecto do trading profissional.",
      items: [
        {
          icon: "Brain",
          title: "IA Autonoma",
          description: "Sistema de trading que aprende e se adapta as condicoes do mercado em tempo real."
        },
        {
          icon: "Activity",
          title: "Analise de Volatilidade",
          description: "Motor de classificacao inteligente de 4 niveis para ajuste automatico de estrategias."
        },
        {
          icon: "Layers",
          title: "Campanhas Inteligentes",
          description: "Ciclos de 30 dias com composicao diaria e gestao de posicoes isoladas."
        },
        {
          icon: "Sparkles",
          title: "Aprendizado Continuo",
          description: "Sistema de descoberta de padroes que melhora constantemente o desempenho."
        }
      ]
    },
    capitalProtection: {
      title: "Protecao de Capital",
      subtitle: "A seguranca dos seus clientes e nossa prioridade. Sistema de protecao multicamada.",
      items: [
        {
          title: "Seguranca Multicamada",
          description: "Circuit breakers automaticos que interrompem operacoes em condicoes adversas."
        },
        {
          title: "6 Validacoes Automaticas",
          description: "Quality gate que verifica cada operacao antes da execucao."
        },
        {
          title: "Auto-Rollback",
          description: "Protecao automatica que reverte configuracoes de risco se necessario."
        },
        {
          title: "Multiplicador de Risco",
          description: "Sistema progressivo de 2x a 5x com desbloqueio por cumprimento de tarefas."
        }
      ]
    },
    footer: {
      copyright: "DELFOS - Oraculo do Trading. Rede Profissional de Franquias de Trading Cripto.",
      links: {
        privacy: "Politica de Privacidade",
        terms: "Termos de Servico",
        faq: "Perguntas Frequentes"
      }
    },
    loginModal: {
      title: "Bem-vindo ao DELFOS",
      description: "Faca login de forma segura atraves do Replit para acessar seu painel de franquia.",
      features: [
        "Autenticacao OAuth segura",
        "Sem necessidade de senha",
        "Acesso instantaneo ao seu painel"
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
  Layers,
  HeadphonesIcon,
  GraduationCap,
  DollarSign,
  Users,
  Sparkles
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

interface FranchisePlan {
  id: string;
  name: string;
  code: string;
  franchise_fee_usd: string;
  max_rbm_multiplier: string;
  is_active: boolean;
}

export default function Landing() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const content = translations[language as keyof typeof translations] || translations.en;

  const { data: plans, isLoading: plansLoading } = useQuery<FranchisePlan[]>({
    queryKey: ['/api/franchise-plans'],
  });

  const handleLogin = async () => {
    if (!email || !password) {
      toast({ title: "Error", description: "Email and password required", variant: "destructive" });
      return;
    }
    
    setIsLoggingIn(true);
    try {
      const response = await fetch('/api/franchisor-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      if (!response.ok) {
        throw new Error('Invalid credentials');
      }
      
      const data = await response.json();
      localStorage.setItem('franchisor_token', data.token);
      localStorage.setItem('franchisor_user', JSON.stringify(data.user));
      setIsLoginModalOpen(false);
      setEmail('');
      setPassword('');
      setLocation('/franchisor-dashboard');
      toast({ title: "Success", description: "Welcome back!" });
    } catch (error) {
      toast({ title: "Error", description: "Login failed", variant: "destructive" });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectPlan = (planCode: string) => {
    setLocation(`/franchise/onboarding?plan=${planCode}`);
  };

  const getPlanColor = (code: string) => {
    if (code === 'starter') return { bg: 'bg-green-500', text: 'text-green-500', light: 'bg-green-500/10', lightText: 'text-green-600', icon: Shield };
    if (code === 'pro') return { bg: 'bg-[#5B9FB5]', text: 'text-[#5B9FB5]', light: 'bg-[#5B9FB5]/10', lightText: 'text-[#5B9FB5]', icon: Target, isMostPopular: true };
    if (code === 'enterprise') return { bg: 'bg-orange-500', text: 'text-orange-500', light: 'bg-orange-500/10', lightText: 'text-orange-600', icon: Building2 };
    return { bg: 'bg-gray-500', text: 'text-gray-500', light: 'bg-gray-500/10', lightText: 'text-gray-600', icon: Shield };
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
              Acesso Franqueadora
            </DialogTitle>
            <DialogDescription className="text-base mt-2">
              Faça login com suas credenciais
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md text-sm"
              data-testid="input-franchisor-email"
            />
            <input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md text-sm"
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              data-testid="input-franchisor-password"
            />
          </div>
          
          <Button
            size="lg"
            className="w-full py-6 text-lg bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white"
            onClick={handleLogin}
            disabled={isLoggingIn}
            data-testid="button-login-modal"
          >
            <LogIn className="w-5 h-5 mr-2" />
            {isLoggingIn ? "Autenticando..." : "Entrar"}
          </Button>
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
              <div className="hidden md:flex items-center gap-8">
                <button 
                  onClick={() => scrollToSection('benefits')}
                  className="text-white/80 hover:text-white text-sm font-medium transition-colors"
                  data-testid="nav-benefits"
                >
                  {content.nav.benefits}
                </button>
                <button 
                  onClick={() => scrollToSection('plans')}
                  className="text-white/80 hover:text-white text-sm font-medium transition-colors"
                  data-testid="nav-plans"
                >
                  {content.nav.plans}
                </button>
                <button 
                  onClick={() => scrollToSection('contact')}
                  className="text-white/80 hover:text-white text-sm font-medium transition-colors"
                  data-testid="nav-contact"
                >
                  {content.nav.contact}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <LanguageSelector />
                <ThemeToggle />
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/30 text-white hover:bg-white/10 ml-2"
                  onClick={() => setIsLoginModalOpen(true)}
                  data-testid="button-login-nav"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Login
                </Button>
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
                <Building2 className="w-4 h-4 mr-2" />
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
                  onClick={() => scrollToSection('plans')}
                  data-testid="button-cta-hero"
                >
                  <Rocket className="mr-2 w-5 h-5" />
                  {content.hero.cta}
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8 py-6 text-lg border-white/30 text-white hover:bg-white/10"
                  onClick={() => scrollToSection('benefits')}
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

      {/* Stats Section */}
      <section className="py-16 bg-gradient-to-r from-[#5B9FB5]/10 via-[#7DD3E8]/10 to-[#5B9FB5]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center" data-testid="stat-franchises">
              <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                {content.stats.franchises}
              </div>
              <div className="text-sm text-muted-foreground uppercase tracking-wide">
                {content.stats.franchisesLabel}
              </div>
            </div>
            <div className="text-center" data-testid="stat-countries">
              <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                {content.stats.countries}
              </div>
              <div className="text-sm text-muted-foreground uppercase tracking-wide">
                {content.stats.countriesLabel}
              </div>
            </div>
            <div className="text-center" data-testid="stat-clients">
              <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                {content.stats.clients}
              </div>
              <div className="text-sm text-muted-foreground uppercase tracking-wide">
                {content.stats.clientsLabel}
              </div>
            </div>
            <div className="text-center" data-testid="stat-volume">
              <div className="text-4xl sm:text-5xl font-bold text-[#5B9FB5] mb-2 font-mono">
                {content.stats.volume}
              </div>
              <div className="text-sm text-muted-foreground uppercase tracking-wide">
                {content.stats.volumeLabel}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Props Section */}
      <section id="benefits" className="py-20 sm:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-[#5B9FB5]/50 text-[#5B9FB5]">
              <Award className="w-4 h-4 mr-2" />
              {content.nav.benefits}
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {content.valueProps.title}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {content.valueProps.subtitle}
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {content.valueProps.items.map((item, index) => {
              const IconComponent = iconMap[item.icon] || Bot;
              return (
                <Card 
                  key={index} 
                  className="p-6 hover-elevate border-border/50 bg-card/50 backdrop-blur-sm"
                  data-testid={`card-value-prop-${index}`}
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#5B9FB5]/20 to-[#7DD3E8]/20 flex items-center justify-center mb-4">
                    <IconComponent className="w-6 h-6 text-[#5B9FB5]" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Technology Section V2.0+ */}
      <section id="technology" className="py-20 sm:py-24 bg-gradient-to-br from-[#1A1D23] via-[#2A3040] to-[#1A1D23] relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `linear-gradient(to right, #5B9FB5 1px, transparent 1px),
                             linear-gradient(to bottom, #5B9FB5 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }} />
        </div>
        <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-[#5B9FB5]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-[#7DD3E8]/10 rounded-full blur-3xl" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-[#7DD3E8]/50 text-[#7DD3E8] bg-[#7DD3E8]/10">
              <Zap className="w-4 h-4 mr-2" />
              V2.0+
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              {(content as any).technology?.title || "Cutting-Edge Technology"}
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              {(content as any).technology?.subtitle || "A complete ecosystem that automates every aspect of professional trading."}
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {((content as any).technology?.items || []).map((item: any, index: number) => {
              const IconComponent = iconMap[item.icon] || Bot;
              return (
                <Card 
                  key={index} 
                  className="p-6 bg-white/5 border-white/10 backdrop-blur-sm hover-elevate"
                  data-testid={`card-technology-${index}`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5B9FB5] to-[#7DD3E8] flex items-center justify-center mb-4 shadow-lg shadow-[#5B9FB5]/25">
                    <IconComponent className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-white/60 leading-relaxed">
                    {item.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Capital Protection Section */}
      <section id="protection" className="py-20 sm:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-green-500/50 text-green-500">
              <Shield className="w-4 h-4 mr-2" />
              {language === 'pt-BR' ? 'Seguranca' : language === 'es' ? 'Seguridad' : 'Security'}
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {(content as any).capitalProtection?.title || "Capital Protection"}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {(content as any).capitalProtection?.subtitle || "Your clients' security is our priority."}
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {((content as any).capitalProtection?.items || []).map((item: any, index: number) => (
              <Card 
                key={index} 
                className="p-6 border-green-500/20 bg-green-500/5 hover-elevate"
                data-testid={`card-protection-${index}`}
              >
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 sm:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {content.howItWorks.title}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {content.howItWorks.subtitle}
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {content.howItWorks.steps.map((step, index) => (
              <div key={index} className="text-center" data-testid={`step-${index}`}>
                <div className="relative inline-block mb-6">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#5B9FB5] to-[#7DD3E8] flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{step.number}</span>
                  </div>
                  {index < 3 && (
                    <div className="hidden lg:block absolute top-1/2 left-full w-full h-0.5 bg-gradient-to-r from-[#7DD3E8] to-transparent" />
                  )}
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Franchise Plans Section */}
      <section id="plans" className="py-20 sm:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-[#5B9FB5]/50 text-[#5B9FB5]">
              <Layers className="w-4 h-4 mr-2" />
              {content.nav.plans}
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {content.plans.title}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {content.plans.subtitle}
            </p>
          </div>
          
          {plansLoading ? (
            <div className="flex justify-center items-center min-h-96">
              <Loader2 className="w-8 h-8 animate-spin text-[#5B9FB5]" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans?.map((plan) => {
                const colors = getPlanColor(plan.code);
                const IconComponent = colors.icon;
                const isMostPopular = colors.isMostPopular;
                const fee = parseFloat(plan.franchise_fee_usd);
                const feeStr = language === 'pt-BR' 
                  ? `R$ ${(fee * 5.5).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : `$${fee.toLocaleString()}`;
                const planConfig = content.plans[plan.code as keyof typeof content.plans] as any;
                const description = planConfig?.description || 'Professional franchise plan';
                const features = planConfig?.features || [];
                const cta = planConfig?.cta || 'Select Plan';

                return (
                  <Card 
                    key={plan.id}
                    className={`p-6 relative ${
                      isMostPopular 
                        ? 'border-[#5B9FB5] bg-card ring-2 ring-[#5B9FB5]/20' 
                        : 'border-border/50 bg-card hover-elevate'
                    }`}
                    data-testid={`card-plan-${plan.code}`}
                  >
                    {isMostPopular && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] text-xs">
                        {content.plans.pro.badge}
                      </Badge>
                    )}
                    
                    <div className={`mb-4 ${isMostPopular ? 'mt-2' : ''}`}>
                      <div className={`w-10 h-10 rounded-xl ${colors.light} flex items-center justify-center mb-3`}>
                        <IconComponent className={`w-5 h-5 ${colors.text}`} />
                      </div>
                      <h3 className="text-xl font-bold text-foreground mb-1">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    
                    <div className="mb-2">
                      <div className="text-2xl font-bold text-foreground">{feeStr}</div>
                      <div className="text-xs text-muted-foreground">
                        {language === 'pt-BR' ? 'Taxa de Franquia' : language === 'es' ? 'Tarifa de Franquicia' : 'Franchise Fee'}
                      </div>
                    </div>
                    
                    <div className={`mb-4 py-2 px-3 ${colors.light} rounded-lg`}>
                      <div className={`text-lg font-bold ${colors.text}`}>{plan.max_rbm_multiplier}x</div>
                      <div className={`text-xs ${colors.lightText}`}>
                        {language === 'pt-BR' ? 'Multiplicador de Risco Máximo' : language === 'es' ? 'Multiplicador de Riesgo Máximo' : 'Max Risk Multiplier'}
                      </div>
                    </div>
                    
                    <ul className="space-y-2 mb-6">
                      {features.map((feature: string, index: number) => (
                        <li key={index} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className={`w-3 h-3 ${colors.text} flex-shrink-0 mt-0.5`} />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    
                    <Button 
                      className={isMostPopular ? `w-full bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white` : 'w-full'}
                      variant={isMostPopular ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSelectPlan(plan.code)}
                      data-testid={`button-plan-${plan.code}`}
                    >
                      {cta}
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 sm:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              {content.testimonials.title}
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {content.testimonials.items.map((testimonial, index) => (
              <Card key={index} className="p-6 bg-card border-border/50" data-testid={`testimonial-${index}`}>
                <div className="mb-4">
                  <Sparkles className="w-8 h-8 text-[#7DD3E8]" />
                </div>
                <p className="text-foreground italic mb-6">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5B9FB5] to-[#7DD3E8] flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">{testimonial.name.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 sm:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-4 border-[#5B9FB5]/50 text-[#5B9FB5]">
                <Phone className="w-4 h-4 mr-2" />
                {content.nav.contact}
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                {content.contact.title}
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                {content.contact.subtitle}
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Mail className="w-5 h-5 text-[#5B9FB5]" />
                  {content.contact.info.email}
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Phone className="w-5 h-5 text-[#5B9FB5]" />
                  {content.contact.info.phone}
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <MapPin className="w-5 h-5 text-[#5B9FB5]" />
                  {content.contact.info.address}
                </div>
              </div>
            </div>
            
            <Card className="p-8 bg-card border-border/50">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{language === 'pt-BR' ? 'Horário de Atendimento' : language === 'es' ? 'Horario de Atención' : 'Business Hours'}</h3>
                  <p className="text-sm text-muted-foreground">{language === 'pt-BR' ? 'Segunda a Sexta, 9h-18h (Horário de Brasília)' : language === 'es' ? 'Lunes a Viernes, 9:00-18:00 (Zona Horaria de Brasil)' : 'Monday to Friday, 9:00 AM - 6:00 PM (Brasilia Time)'}</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-4">{language === 'pt-BR' ? 'Redes Sociais' : language === 'es' ? 'Redes Sociales' : 'Follow Us'}</h3>
                  <div className="flex gap-3">
                    <Button size="sm" variant="outline" className="flex-1">{language === 'pt-BR' ? 'LinkedIn' : language === 'es' ? 'LinkedIn' : 'LinkedIn'}</Button>
                    <Button size="sm" variant="outline" className="flex-1">{language === 'pt-BR' ? 'Twitter' : language === 'es' ? 'Twitter' : 'Twitter'}</Button>
                    <Button size="sm" variant="outline" className="flex-1">{language === 'pt-BR' ? 'YouTube' : language === 'es' ? 'YouTube' : 'YouTube'}</Button>
                  </div>
                </div>
                
                <Button 
                  className="w-full bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white"
                  onClick={() => scrollToSection('plans')}
                  data-testid="button-contact-view-plans"
                >
                  {language === 'pt-BR' ? 'Ver Planos de Franquia' : language === 'es' ? 'Ver Planes de Franquicia' : 'View Franchise Plans'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </Card>
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
          <div className="flex justify-center mb-8">
            <DelfosLogo variant="icon" className="w-20 h-20" />
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            {content.cta.title}
          </h2>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            {content.cta.subtitle}
          </p>
          <Button
            size="lg"
            className="px-10 py-6 text-lg bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white shadow-lg shadow-[#5B9FB5]/25"
            onClick={() => scrollToSection('plans')}
            data-testid="button-cta-final"
          >
            <Rocket className="mr-2 w-5 h-5" />
            {content.cta.button}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Access Portal Section */}
      <section className="py-16 bg-gradient-to-b from-slate-900/50 via-slate-800/80 to-slate-900/50 border-y border-slate-700/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center gap-2 bg-slate-700/50 rounded-full px-4 py-2 mb-4">
              <LogIn className="w-5 h-5 text-cyan-400" />
              <span className="text-sm font-medium text-cyan-400">{content.accessPortal.title}</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">{content.accessPortal.title}</h2>
            <p className="text-lg text-slate-300">{content.accessPortal.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Franchisor Access Card - Amber/Gold */}
            <a href="/login/franchisor">
              <Card 
                className="relative overflow-visible border-2 border-amber-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate h-full"
                data-testid="card-access-franchisor"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-yellow-600" />
                <div className="p-6 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-amber-500 to-yellow-600 flex items-center justify-center mb-4">
                    <Crown className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{content.accessPortal.franchisor}</h3>
                  <p className="text-sm text-slate-300 mb-4">{content.accessPortal.franchisorDesc}</p>
                  <Button 
                    className="w-full bg-gradient-to-r from-amber-500 to-yellow-600"
                    data-testid="button-access-franchisor"
                  >
                    {content.accessPortal.accessButton}
                  </Button>
                </div>
              </Card>
            </a>

            {/* Master Franchise Access Card - Blue */}
            <a href="/login/master">
              <Card 
                className="relative overflow-visible border-2 border-blue-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate h-full"
                data-testid="card-access-master"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
                <div className="p-6 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center mb-4">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{content.accessPortal.master}</h3>
                  <p className="text-sm text-slate-300 mb-4">{content.accessPortal.masterDesc}</p>
                  <Button 
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600"
                    data-testid="button-access-master"
                  >
                    {content.accessPortal.accessButton}
                  </Button>
                </div>
              </Card>
            </a>

            {/* Franchise Access Card - Cyan */}
            <a href="/login/franchise">
              <Card 
                className="relative overflow-visible border-2 border-cyan-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate h-full"
                data-testid="card-access-franchise"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 to-teal-600" />
                <div className="p-6 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-cyan-500 to-teal-600 flex items-center justify-center mb-4">
                    <TrendingUp className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{content.accessPortal.franchise}</h3>
                  <p className="text-sm text-slate-300 mb-4">{content.accessPortal.franchiseDesc}</p>
                  <Button 
                    className="w-full bg-gradient-to-r from-cyan-500 to-teal-600"
                    data-testid="button-access-franchise"
                  >
                    {content.accessPortal.accessButton}
                  </Button>
                </div>
              </Card>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-background border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <DelfosLogo variant="full" />
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <button className="hover:text-foreground transition-colors" data-testid="link-privacy">
                {content.footer.links.privacy}
              </button>
              <button className="hover:text-foreground transition-colors" data-testid="link-terms">
                {content.footer.links.terms}
              </button>
              <button className="hover:text-foreground transition-colors" data-testid="link-faq">
                {content.footer.links.faq}
              </button>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              &copy; 2025 {content.footer.copyright}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
