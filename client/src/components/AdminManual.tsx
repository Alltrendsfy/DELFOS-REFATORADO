import { useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileDown,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Info,
  Rocket,
  Shield,
  TrendingUp,
  Settings,
  Eye,
  Play,
  Pause,
  DollarSign,
  Target,
  Activity,
  CircuitBoard,
  Wallet,
  ListChecks,
  HelpCircle
} from 'lucide-react';

const pdfStrings = {
  'pt-BR': {
    title: 'DELFOS - Manual de Instruções',
    footer: 'Documento gerado em',
    at: 'às'
  },
  'en': {
    title: 'DELFOS - User Manual',
    footer: 'Document generated on',
    at: 'at'
  },
  'es': {
    title: 'DELFOS - Manual de Instrucciones',
    footer: 'Documento generado el',
    at: 'a las'
  }
};

export default function AdminManual() {
  const { language } = useLanguage();
  const manualRef = useRef<HTMLDivElement>(null);

  const getLang = () => {
    if (language === 'en' || language.startsWith('en-')) return 'en';
    if (language === 'es' || language.startsWith('es-')) return 'es';
    return 'pt-BR';
  };

  const handleExportPDF = () => {
    const printContent = manualRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const lang = getLang();
    const pdf = pdfStrings[lang] || pdfStrings['pt-BR'];
    const locale = lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${pdf.title}</title>
          <style>
            * { box-sizing: border-box; }
            body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
              line-height: 1.6; 
              color: #1a1d23; 
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 { 
              color: #5B9FB5; 
              border-bottom: 3px solid #7DD3E8; 
              padding-bottom: 10px;
              font-size: 28px;
            }
            h2 { 
              color: #5B9FB5; 
              margin-top: 30px;
              font-size: 20px;
              border-left: 4px solid #7DD3E8;
              padding-left: 12px;
            }
            h3 { 
              color: #1a1d23; 
              margin-top: 20px;
              font-size: 16px;
            }
            .section { 
              margin-bottom: 30px; 
              page-break-inside: avoid;
            }
            .step { 
              background: #f8fafc; 
              border-left: 4px solid #5B9FB5; 
              padding: 12px 16px; 
              margin: 12px 0;
              border-radius: 0 8px 8px 0;
            }
            .step-number {
              display: inline-block;
              background: #5B9FB5;
              color: white;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              text-align: center;
              line-height: 24px;
              font-weight: bold;
              margin-right: 10px;
              font-size: 12px;
            }
            .warning { 
              background: #fef3c7; 
              border-left: 4px solid #f59e0b; 
              padding: 12px 16px; 
              margin: 12px 0;
              border-radius: 0 8px 8px 0;
            }
            .tip { 
              background: #dbeafe; 
              border-left: 4px solid #3b82f6; 
              padding: 12px 16px; 
              margin: 12px 0;
              border-radius: 0 8px 8px 0;
            }
            .success { 
              background: #d1fae5; 
              border-left: 4px solid #10b981; 
              padding: 12px 16px; 
              margin: 12px 0;
              border-radius: 0 8px 8px 0;
            }
            ul { padding-left: 20px; }
            li { margin: 8px 0; }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 16px 0;
            }
            th, td { 
              border: 1px solid #e2e8f0; 
              padding: 10px; 
              text-align: left;
            }
            th { 
              background: #5B9FB5; 
              color: white;
            }
            .toc { 
              background: #f1f5f9; 
              padding: 20px; 
              border-radius: 8px;
              margin-bottom: 30px;
            }
            .toc ul { list-style: none; padding-left: 0; }
            .toc li { margin: 8px 0; }
            .toc a { color: #5B9FB5; text-decoration: none; }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 2px solid #e2e8f0;
              text-align: center;
              color: #64748b;
              font-size: 12px;
            }
            @media print {
              body { padding: 20px; }
              .section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <div class="footer">
            <p>DELFOS Trading Platform © ${new Date().getFullYear()}</p>
            <p>${pdf.footer}: ${new Date().toLocaleDateString(locale)} ${pdf.at} ${new Date().toLocaleTimeString(locale)}</p>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const content = {
    'pt-BR': {
      title: 'Manual de Instruções DELFOS',
      subtitle: 'Guia completo para criação e acompanhamento de campanhas',
      exportPdf: 'Exportar PDF',
      toc: 'Índice',
      sections: {
        intro: {
          title: '1. Introdução',
          content: `O DELFOS é uma plataforma de day trading automatizado para criptomoedas. 
          O sistema utiliza inteligência artificial e indicadores técnicos para identificar 
          oportunidades de trading em tempo real, executando operações de forma autônoma 
          através de "campanhas" configuráveis.`
        },
        prerequisites: {
          title: '2. Pré-requisitos',
          items: [
            'Conta ativa na plataforma DELFOS com acesso beta aprovado',
            'Para modo Paper: Nenhum requisito adicional (simulação)',
            'Para modo Live: Conta na exchange Kraken com credenciais API configuradas',
            'Para modo Live: Saldo mínimo de $6 USD na Kraken para cada operação'
          ]
        },
        paperCampaign: {
          title: '3. Criando uma Campanha Paper (Simulação)',
          description: 'O modo Paper permite testar estratégias sem risco financeiro real.',
          steps: [
            {
              title: 'Acesse o menu "Campanhas"',
              detail: 'Clique em "Campanhas" no menu lateral esquerdo'
            },
            {
              title: 'Clique em "Nova Campanha"',
              detail: 'O botão está localizado no canto superior direito da tela'
            },
            {
              title: 'Defina o nome e perfil de risco',
              detail: 'Escolha um nome descritivo e selecione entre Conservador, Moderado ou Agressivo'
            },
            {
              title: 'Configure o capital inicial',
              detail: 'Defina quanto capital virtual será usado (mínimo $10)'
            },
            {
              title: 'Selecione a duração',
              detail: 'Escolha 7, 14 ou 30 dias para a campanha'
            },
            {
              title: 'Escolha o modo "Paper Trading"',
              detail: 'Este modo simula operações usando preços reais de mercado, sem risco'
            },
            {
              title: 'Selecione ou crie um portfólio',
              detail: 'O portfólio define quais ativos serão monitorados'
            },
            {
              title: 'Revise e confirme',
              detail: 'Verifique todas as configurações e clique em "Criar Campanha"'
            }
          ]
        },
        liveCampaign: {
          title: '4. Criando uma Campanha Live (Real)',
          description: 'O modo Live executa operações reais na exchange Kraken usando sinais ATR (Average True Range) com validação EMA12/EMA36.',
          warning: 'ATENÇÃO: No modo Live, operações reais serão executadas e podem resultar em perdas financeiras. O robô usa momentum 1.5×ATR e confirmação de tendência EMA.',
          prerequisites: [
            'Credenciais API da Kraken configuradas em "Configurações"',
            'Saldo mínimo de $6 USD disponível na Kraken por operação',
            'API Key com permissões de "Query" e "Trade"',
            'Circuit breakers ativos (3 camadas: ativo, cluster, global)'
          ],
          steps: [
            {
              title: 'Configure suas credenciais Kraken',
              detail: 'Acesse "Configurações" > "Credenciais Kraken" e insira sua API Key e Secret'
            },
            {
              title: 'Verifique seu saldo',
              detail: 'Confirme que você tem pelo menos $6 USD disponível na Kraken'
            },
            {
              title: 'Inicie o wizard de nova campanha',
              detail: 'Clique em "Nova Campanha" na página de Campanhas'
            },
            {
              title: 'Selecione o modo "Live Trading"',
              detail: 'Este modo executará operações reais na sua conta Kraken'
            },
            {
              title: 'Configure capital e perfil de risco',
              detail: 'Defina quanto do seu saldo será usado e o nível de risco desejado'
            },
            {
              title: 'Selecione o portfólio',
              detail: 'Apenas portfólios em modo "LIVE" estarão disponíveis'
            },
            {
              title: 'Confirme os circuit breakers',
              detail: 'Os circuit breakers protegem contra perdas excessivas (ativados por padrão)'
            },
            {
              title: 'Revise e ative a campanha',
              detail: 'Verifique todas as configurações antes de criar'
            }
          ]
        },
        monitoring: {
          title: '5. Acompanhamento de Campanhas',
          sections: [
            {
              subtitle: 'Dashboard Principal',
              items: [
                'Valor total do portfólio em tempo real',
                'PnL (Lucro/Prejuízo) diário com percentual',
                'Contador de campanhas ativas e posições abertas',
                'Visão geral do mercado com principais criptomoedas'
              ]
            },
            {
              subtitle: 'Feed de Atividades do Robô',
              items: [
                'Sinais de trading gerados (compra/venda)',
                'Ordens executadas e posições abertas/fechadas',
                'Eventos de circuit breaker com timestamp',
                'Atualização automática a cada 10 segundos'
              ]
            },
            {
              subtitle: 'Página de Campanhas',
              items: [
                'Lista de todas as campanhas com PnL individual',
                'Status de cada campanha (Ativa, Pausada, Finalizada)',
                'Clique em uma campanha para ver detalhes e histórico',
                'Botões para pausar, retomar ou encerrar campanhas'
              ]
            }
          ]
        },
        circuitBreakers: {
          title: '6. Circuit Breakers (Proteções)',
          description: 'O DELFOS possui proteções automáticas para limitar perdas:',
          items: [
            {
              name: 'Drawdown Máximo',
              detail: 'Pausa a campanha se o prejuízo atingir o limite configurado (ex: -10%)'
            },
            {
              name: 'Circuit Breaker de Ativo',
              detail: 'Bloqueia operações em um ativo específico após perdas consecutivas'
            },
            {
              name: 'Circuit Breaker de Cluster',
              detail: 'Pausa operações em grupos de ativos correlacionados'
            },
            {
              name: 'Circuit Breaker Global',
              detail: 'Para todas as operações se o limite diário for atingido'
            },
            {
              name: 'Proteção de Dados Stale',
              detail: 'Bloqueia operações se os dados de mercado estiverem desatualizados'
            }
          ]
        },
        troubleshooting: {
          title: '7. Solução de Problemas',
          items: [
            {
              problem: 'Campanha não executa operações',
              solutions: [
                'Verifique se há saldo suficiente (mínimo $6 por operação)',
                'Confirme que as credenciais Kraken estão válidas',
                'Verifique se o circuit breaker não está ativo'
              ]
            },
            {
              problem: 'Erro "Insufficient Funds"',
              solutions: [
                'Deposite mais fundos na sua conta Kraken',
                'Reduza o tamanho das posições na configuração'
              ]
            },
            {
              problem: 'Dados de mercado desatualizados',
              solutions: [
                'Aguarde a reconexão automática do WebSocket',
                'O sistema tentará reconectar automaticamente em segundos'
              ]
            },
            {
              problem: 'Campanha pausada automaticamente',
              solutions: [
                'Verifique se o drawdown máximo foi atingido',
                'Revise o feed de atividades para entender o motivo',
                'Você pode retomar manualmente após revisar'
              ]
            }
          ]
        }
      }
    },
    'en': {
      title: 'DELFOS User Manual',
      subtitle: 'Complete guide for creating and monitoring campaigns',
      exportPdf: 'Export PDF',
      toc: 'Table of Contents',
      sections: {
        intro: {
          title: '1. Introduction',
          content: `DELFOS is an automated cryptocurrency day trading platform. 
          The system uses artificial intelligence and technical indicators to identify 
          trading opportunities in real-time, executing operations autonomously 
          through configurable "campaigns".`
        },
        prerequisites: {
          title: '2. Prerequisites',
          items: [
            'Active DELFOS platform account with approved beta access',
            'For Paper mode: No additional requirements (simulation)',
            'For Live mode: Kraken exchange account with configured API credentials',
            'For Live mode: Minimum balance of $6 USD on Kraken for each operation'
          ]
        },
        paperCampaign: {
          title: '3. Creating a Paper Campaign (Simulation)',
          description: 'Paper mode allows testing strategies without real financial risk.',
          steps: [
            {
              title: 'Access the "Campaigns" menu',
              detail: 'Click on "Campaigns" in the left sidebar'
            },
            {
              title: 'Click "New Campaign"',
              detail: 'The button is located in the top right corner'
            },
            {
              title: 'Define name and risk profile',
              detail: 'Choose a descriptive name and select Conservative, Moderate, or Aggressive'
            },
            {
              title: 'Configure initial capital',
              detail: 'Define how much virtual capital will be used (minimum $10)'
            },
            {
              title: 'Select duration',
              detail: 'Choose 7, 14, or 30 days for the campaign'
            },
            {
              title: 'Choose "Paper Trading" mode',
              detail: 'This mode simulates operations using real market prices, without risk'
            },
            {
              title: 'Select or create a portfolio',
              detail: 'The portfolio defines which assets will be monitored'
            },
            {
              title: 'Review and confirm',
              detail: 'Verify all settings and click "Create Campaign"'
            }
          ]
        },
        liveCampaign: {
          title: '4. Creating a Live Campaign (Real)',
          description: 'Live mode executes real operations on Kraken using ATR (Average True Range) signals with EMA12/EMA36 trend validation.',
          warning: 'WARNING: In Live mode, real operations will be executed and may result in financial losses. The robot uses 1.5×ATR momentum and EMA trend confirmation.',
          prerequisites: [
            'Kraken API credentials configured in "Settings"',
            'Minimum balance of $6 USD per operation on Kraken',
            'API Key with "Query" and "Trade" permissions',
            'Active circuit breakers (3 layers: asset, cluster, global)'
          ],
          steps: [
            {
              title: 'Configure your Kraken credentials',
              detail: 'Go to "Settings" > "Kraken Credentials" and enter your API Key and Secret'
            },
            {
              title: 'Check your balance',
              detail: 'Confirm you have at least $6 USD available on Kraken'
            },
            {
              title: 'Start the new campaign wizard',
              detail: 'Click "New Campaign" on the Campaigns page'
            },
            {
              title: 'Select "Live Trading" mode',
              detail: 'This mode will execute real operations on your Kraken account'
            },
            {
              title: 'Configure capital and risk profile',
              detail: 'Define how much of your balance will be used and the desired risk level'
            },
            {
              title: 'Select portfolio',
              detail: 'Only portfolios in "LIVE" mode will be available'
            },
            {
              title: 'Confirm circuit breakers',
              detail: 'Circuit breakers protect against excessive losses (enabled by default)'
            },
            {
              title: 'Review and activate campaign',
              detail: 'Verify all settings before creating'
            }
          ]
        },
        monitoring: {
          title: '5. Campaign Monitoring',
          sections: [
            {
              subtitle: 'Main Dashboard',
              items: [
                'Total portfolio value in real-time',
                'Daily PnL (Profit/Loss) with percentage',
                'Active campaigns and open positions counter',
                'Market overview with top cryptocurrencies'
              ]
            },
            {
              subtitle: 'Robot Activity Feed',
              items: [
                'Trading signals generated (buy/sell)',
                'Executed orders and opened/closed positions',
                'Circuit breaker events with timestamp',
                'Auto-refresh every 10 seconds'
              ]
            },
            {
              subtitle: 'Campaigns Page',
              items: [
                'List of all campaigns with individual PnL',
                'Status of each campaign (Active, Paused, Finished)',
                'Click a campaign to view details and history',
                'Buttons to pause, resume, or end campaigns'
              ]
            }
          ]
        },
        circuitBreakers: {
          title: '6. Circuit Breakers (Protections)',
          description: 'DELFOS has automatic protections to limit losses:',
          items: [
            {
              name: 'Maximum Drawdown',
              detail: 'Pauses the campaign if losses reach the configured limit (e.g., -10%)'
            },
            {
              name: 'Asset Circuit Breaker',
              detail: 'Blocks operations on a specific asset after consecutive losses'
            },
            {
              name: 'Cluster Circuit Breaker',
              detail: 'Pauses operations on groups of correlated assets'
            },
            {
              name: 'Global Circuit Breaker',
              detail: 'Stops all operations if daily limit is reached'
            },
            {
              name: 'Stale Data Protection',
              detail: 'Blocks operations if market data is outdated'
            }
          ]
        },
        troubleshooting: {
          title: '7. Troubleshooting',
          items: [
            {
              problem: 'Campaign not executing operations',
              solutions: [
                'Check if there is sufficient balance (minimum $6 per operation)',
                'Confirm Kraken credentials are valid',
                'Check if circuit breaker is not active'
              ]
            },
            {
              problem: '"Insufficient Funds" error',
              solutions: [
                'Deposit more funds to your Kraken account',
                'Reduce position sizes in configuration'
              ]
            },
            {
              problem: 'Outdated market data',
              solutions: [
                'Wait for automatic WebSocket reconnection',
                'The system will try to reconnect automatically in seconds'
              ]
            },
            {
              problem: 'Campaign paused automatically',
              solutions: [
                'Check if maximum drawdown was reached',
                'Review activity feed to understand the reason',
                'You can manually resume after reviewing'
              ]
            }
          ]
        }
      }
    },
    'es': {
      title: 'Manual de Instrucciones DELFOS',
      subtitle: 'Guía completa para crear y monitorear campañas',
      exportPdf: 'Exportar PDF',
      toc: 'Índice',
      sections: {
        intro: {
          title: '1. Introducción',
          content: `DELFOS es una plataforma de day trading automatizado para criptomonedas. 
          El sistema utiliza inteligencia artificial e indicadores técnicos para identificar 
          oportunidades de trading en tiempo real, ejecutando operaciones de forma autónoma 
          a través de "campañas" configurables.`
        },
        prerequisites: {
          title: '2. Prerrequisitos',
          items: [
            'Cuenta activa en la plataforma DELFOS con acceso beta aprobado',
            'Para modo Paper: Sin requisitos adicionales (simulación)',
            'Para modo Live: Cuenta en el exchange Kraken con credenciales API configuradas',
            'Para modo Live: Saldo mínimo de $6 USD en Kraken para cada operación'
          ]
        },
        paperCampaign: {
          title: '3. Creando una Campaña Paper (Simulación)',
          description: 'El modo Paper permite probar estrategias sin riesgo financiero real.',
          steps: [
            {
              title: 'Accede al menú "Campañas"',
              detail: 'Haz clic en "Campañas" en el menú lateral izquierdo'
            },
            {
              title: 'Haz clic en "Nueva Campaña"',
              detail: 'El botón está ubicado en la esquina superior derecha'
            },
            {
              title: 'Define el nombre y perfil de riesgo',
              detail: 'Elige un nombre descriptivo y selecciona entre Conservador, Moderado o Agresivo'
            },
            {
              title: 'Configura el capital inicial',
              detail: 'Define cuánto capital virtual se usará (mínimo $10)'
            },
            {
              title: 'Selecciona la duración',
              detail: 'Elige 7, 14 o 30 días para la campaña'
            },
            {
              title: 'Elige el modo "Paper Trading"',
              detail: 'Este modo simula operaciones usando precios reales de mercado, sin riesgo'
            },
            {
              title: 'Selecciona o crea un portafolio',
              detail: 'El portafolio define qué activos serán monitoreados'
            },
            {
              title: 'Revisa y confirma',
              detail: 'Verifica todas las configuraciones y haz clic en "Crear Campaña"'
            }
          ]
        },
        liveCampaign: {
          title: '4. Creando una Campaña Live (Real)',
          description: 'El modo Live ejecuta operaciones reales en Kraken usando señales ATR (Average True Range) con validación EMA12/EMA36.',
          warning: 'ATENCIÓN: En modo Live, se ejecutarán operaciones reales que pueden resultar en pérdidas financieras. El robot usa momentum 1.5×ATR y confirmación de tendencia EMA.',
          prerequisites: [
            'Credenciales API de Kraken configuradas en "Configuraciones"',
            'Saldo mínimo de $6 USD por operación disponible en Kraken',
            'API Key con permisos de "Query" y "Trade"',
            'Circuit breakers activos (3 capas: activo, cluster, global)'
          ],
          steps: [
            {
              title: 'Configura tus credenciales Kraken',
              detail: 'Ve a "Configuraciones" > "Credenciales Kraken" e ingresa tu API Key y Secret'
            },
            {
              title: 'Verifica tu saldo',
              detail: 'Confirma que tienes al menos $6 USD disponibles en Kraken'
            },
            {
              title: 'Inicia el asistente de nueva campaña',
              detail: 'Haz clic en "Nueva Campaña" en la página de Campañas'
            },
            {
              title: 'Selecciona el modo "Live Trading"',
              detail: 'Este modo ejecutará operaciones reales en tu cuenta Kraken'
            },
            {
              title: 'Configura capital y perfil de riesgo',
              detail: 'Define cuánto de tu saldo se usará y el nivel de riesgo deseado'
            },
            {
              title: 'Selecciona el portafolio',
              detail: 'Solo los portafolios en modo "LIVE" estarán disponibles'
            },
            {
              title: 'Confirma los circuit breakers',
              detail: 'Los circuit breakers protegen contra pérdidas excesivas (activados por defecto)'
            },
            {
              title: 'Revisa y activa la campaña',
              detail: 'Verifica todas las configuraciones antes de crear'
            }
          ]
        },
        monitoring: {
          title: '5. Monitoreo de Campañas',
          sections: [
            {
              subtitle: 'Dashboard Principal',
              items: [
                'Valor total del portafolio en tiempo real',
                'PnL (Ganancia/Pérdida) diario con porcentaje',
                'Contador de campañas activas y posiciones abiertas',
                'Vista general del mercado con principales criptomonedas'
              ]
            },
            {
              subtitle: 'Feed de Actividades del Robot',
              items: [
                'Señales de trading generadas (compra/venta)',
                'Órdenes ejecutadas y posiciones abiertas/cerradas',
                'Eventos de circuit breaker con marca de tiempo',
                'Actualización automática cada 10 segundos'
              ]
            },
            {
              subtitle: 'Página de Campañas',
              items: [
                'Lista de todas las campañas con PnL individual',
                'Estado de cada campaña (Activa, Pausada, Finalizada)',
                'Haz clic en una campaña para ver detalles e historial',
                'Botones para pausar, reanudar o finalizar campañas'
              ]
            }
          ]
        },
        circuitBreakers: {
          title: '6. Circuit Breakers (Protecciones)',
          description: 'DELFOS tiene protecciones automáticas para limitar pérdidas:',
          items: [
            {
              name: 'Drawdown Máximo',
              detail: 'Pausa la campaña si las pérdidas alcanzan el límite configurado (ej: -10%)'
            },
            {
              name: 'Circuit Breaker de Activo',
              detail: 'Bloquea operaciones en un activo específico después de pérdidas consecutivas'
            },
            {
              name: 'Circuit Breaker de Cluster',
              detail: 'Pausa operaciones en grupos de activos correlacionados'
            },
            {
              name: 'Circuit Breaker Global',
              detail: 'Detiene todas las operaciones si se alcanza el límite diario'
            },
            {
              name: 'Protección de Datos Obsoletos',
              detail: 'Bloquea operaciones si los datos de mercado están desactualizados'
            }
          ]
        },
        troubleshooting: {
          title: '7. Solución de Problemas',
          items: [
            {
              problem: 'La campaña no ejecuta operaciones',
              solutions: [
                'Verifica si hay saldo suficiente (mínimo $6 por operación)',
                'Confirma que las credenciales Kraken son válidas',
                'Verifica si el circuit breaker no está activo'
              ]
            },
            {
              problem: 'Error "Insufficient Funds"',
              solutions: [
                'Deposita más fondos en tu cuenta Kraken',
                'Reduce el tamaño de las posiciones en la configuración'
              ]
            },
            {
              problem: 'Datos de mercado desactualizados',
              solutions: [
                'Espera la reconexión automática del WebSocket',
                'El sistema intentará reconectarse automáticamente en segundos'
              ]
            },
            {
              problem: 'Campaña pausada automáticamente',
              solutions: [
                'Verifica si se alcanzó el drawdown máximo',
                'Revisa el feed de actividades para entender el motivo',
                'Puedes reanudar manualmente después de revisar'
              ]
            }
          ]
        }
      }
    }
  };

  const langKey = getLang() as keyof typeof content;
  const t = content[langKey] || content['pt-BR'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">{t.title}</h2>
            <p className="text-sm text-muted-foreground">{t.subtitle}</p>
          </div>
        </div>
        <Button onClick={handleExportPDF} data-testid="button-export-pdf">
          <FileDown className="h-4 w-4 mr-2" />
          {t.exportPdf}
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        <div ref={manualRef} className="space-y-6 pr-4">
          <h1>{t.title}</h1>
          
          <div className="toc">
            <h3 className="font-semibold mb-2">{t.toc}</h3>
            <ul className="space-y-1 text-sm">
              <li><a href="#intro" className="text-primary hover:underline">{t.sections.intro.title}</a></li>
              <li><a href="#prereq" className="text-primary hover:underline">{t.sections.prerequisites.title}</a></li>
              <li><a href="#paper" className="text-primary hover:underline">{t.sections.paperCampaign.title}</a></li>
              <li><a href="#live" className="text-primary hover:underline">{t.sections.liveCampaign.title}</a></li>
              <li><a href="#monitoring" className="text-primary hover:underline">{t.sections.monitoring.title}</a></li>
              <li><a href="#circuit" className="text-primary hover:underline">{t.sections.circuitBreakers.title}</a></li>
              <li><a href="#trouble" className="text-primary hover:underline">{t.sections.troubleshooting.title}</a></li>
            </ul>
          </div>

          <Card id="intro" className="section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                {t.sections.intro.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t.sections.intro.content}</p>
            </CardContent>
          </Card>

          <Card id="prereq" className="section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5" />
                {t.sections.prerequisites.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {t.sections.prerequisites.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card id="paper" className="section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                {t.sections.paperCampaign.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="tip flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <span className="text-sm">{t.sections.paperCampaign.description}</span>
              </div>
              
              <div className="space-y-3">
                {t.sections.paperCampaign.steps.map((step, i) => (
                  <div key={i} className="step flex items-start gap-3 p-3 rounded-lg bg-muted/50 border-l-4 border-primary">
                    <Badge variant="secondary" className="shrink-0">{i + 1}</Badge>
                    <div>
                      <p className="font-medium">{step.title}</p>
                      <p className="text-sm text-muted-foreground">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card id="live" className="section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                {t.sections.liveCampaign.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="warning flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-300 dark:border-yellow-800">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <span className="text-sm font-medium">{t.sections.liveCampaign.warning}</span>
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  {t.sections.prerequisites.title}
                </h4>
                <ul className="space-y-1">
                  {t.sections.liveCampaign.prerequisites.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              <div className="space-y-3">
                {t.sections.liveCampaign.steps.map((step, i) => (
                  <div key={i} className="step flex items-start gap-3 p-3 rounded-lg bg-muted/50 border-l-4 border-destructive">
                    <Badge variant="destructive" className="shrink-0">{i + 1}</Badge>
                    <div>
                      <p className="font-medium">{step.title}</p>
                      <p className="text-sm text-muted-foreground">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card id="monitoring" className="section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                {t.sections.monitoring.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {t.sections.monitoring.sections.map((section, i) => (
                <div key={i}>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    {i === 0 && <Activity className="h-4 w-4" />}
                    {i === 1 && <Target className="h-4 w-4" />}
                    {i === 2 && <TrendingUp className="h-4 w-4" />}
                    {section.subtitle}
                  </h4>
                  <ul className="space-y-1 ml-6">
                    {section.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-3 w-3 text-green-500 mt-1 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  {i < t.sections.monitoring.sections.length - 1 && <Separator className="my-3" />}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card id="circuit" className="section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircuitBoard className="h-5 w-5" />
                {t.sections.circuitBreakers.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{t.sections.circuitBreakers.description}</p>
              
              <div className="space-y-3">
                {t.sections.circuitBreakers.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                    <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card id="trouble" className="section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                {t.sections.troubleshooting.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {t.sections.troubleshooting.items.map((item, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="font-medium">{item.problem}</span>
                  </div>
                  <ul className="ml-6 space-y-1">
                    {item.solutions.map((solution, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-3 w-3 text-green-500 mt-1 shrink-0" />
                        <span className="text-muted-foreground">{solution}</span>
                      </li>
                    ))}
                  </ul>
                  {i < t.sections.troubleshooting.items.length - 1 && <Separator className="my-3" />}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
