import { getChatCompletion, type ChatMessage, type MarketContext } from "../openaiService";
import type { IStorage } from "../../storage";

/**
 * AI Analysis Service
 * Orchestrates trading-specific analyses using OpenAI
 * Keeps openaiService as low-level gateway
 */

// Token budget constants
const MAX_SYMBOLS_IN_CONTEXT = 10;
const MAX_CLUSTERS_DETAIL = 5;

// Types for structured analysis data
export interface RankingData {
  symbol: string;
  rank: number;
  score: number;
  volume24h: number;
  volatility: number;
}

export interface ClusterData {
  clusterId: number;
  assetCount: number;
  avgVolatility: number;
  topSymbols: string[];
}

export interface RiskMetrics {
  maxPositionSizePct: number;
  maxDailyLossPct: number;
  maxPortfolioHeatPct: number;
  currentHeat?: number;
}

export interface AnalysisResult {
  analysis: string;
  highlights?: string[];
  symbols?: string[];
}

/**
 * Prompt Builders - Typed helpers for maintainable prompts
 */

function buildRankingsPrompt(rankings: RankingData[]): string {
  const topAssets = rankings.slice(0, 10);
  
  let prompt = `Analise os ativos de melhor classificação selecionados pelo sistema DELFOS:\n\n`;
  
  topAssets.forEach((asset, idx) => {
    prompt += `${idx + 1}. ${asset.symbol}
   - Score: ${asset.score.toFixed(3)}
   - Volume 24h: $${(asset.volume24h / 1_000_000).toFixed(2)}M
   - Volatilidade (ATR): ${(asset.volatility * 100).toFixed(2)}%
`;
  });
  
  prompt += `\nTotal de ${rankings.length} ativos selecionados.\n\n`;
  prompt += `Forneça:\n`;
  prompt += `1. Análise da composição geral (mix de volatilidade, volume)\n`;
  prompt += `2. Destaque os 3 ativos mais promissores para day trading\n`;
  prompt += `3. Identifique possíveis riscos ou correlações\n`;
  prompt += `4. Sugestões de alocação de capital\n\n`;
  prompt += `Seja conciso e prático.`;
  
  return prompt;
}

function buildClusterPrompt(clusters: ClusterData[], totalAssets: number): string {
  const topClusters = clusters.slice(0, MAX_CLUSTERS_DETAIL);
  
  let prompt = `O sistema DELFOS agrupou ${totalAssets} ativos em ${clusters.length} clusters usando K-means:\n\n`;
  
  topClusters.forEach((cluster, idx) => {
    prompt += `Cluster ${cluster.clusterId}:
   - ${cluster.assetCount} ativos
   - Volatilidade média: ${(cluster.avgVolatility * 100).toFixed(2)}%
   - Principais: ${cluster.topSymbols.slice(0, 5).join(', ')}
`;
  });
  
  if (clusters.length > MAX_CLUSTERS_DETAIL) {
    prompt += `\n... e mais ${clusters.length - MAX_CLUSTERS_DETAIL} clusters.\n`;
  }
  
  prompt += `\nAnalise:\n`;
  prompt += `1. Que estratégias diferenciadas cabem a cada grupo?\n`;
  prompt += `2. Como diversificar entre clusters?\n`;
  prompt += `3. Quais clusters têm melhor risco/retorno para day trading?\n\n`;
  prompt += `Seja prático e direto.`;
  
  return prompt;
}

function buildStrategyPrompt(
  userQuery: string,
  selectedAssets: string[],
  riskProfile: 'conservative' | 'moderate' | 'aggressive'
): string {
  const assetList = selectedAssets.slice(0, MAX_SYMBOLS_IN_CONTEXT).join(', ');
  
  let prompt = `Contexto: Trading em ${selectedAssets.length} ativos cripto (principais: ${assetList}).\n`;
  prompt += `Perfil de risco: ${riskProfile}\n\n`;
  prompt += `Pergunta do trader:\n${userQuery}\n\n`;
  prompt += `Forneça uma resposta estratégica considerando:\n`;
  prompt += `- Gestão de risco apropriada ao perfil\n`;
  prompt += `- Táticas práticas de day trading\n`;
  prompt += `- Stop-loss e take-profit recomendados\n`;
  prompt += `- Timing e janelas de mercado\n\n`;
  prompt += `Seja específico e acionável.`;
  
  return prompt;
}

function buildRiskPrompt(riskMetrics: RiskMetrics, activePositions: number): string {
  let prompt = `Análise de risco do portfolio:\n\n`;
  prompt += `Configuração de Risco:\n`;
  prompt += `- Max Position Size: ${riskMetrics.maxPositionSizePct}% do capital\n`;
  prompt += `- Max Daily Loss: ${riskMetrics.maxDailyLossPct}%\n`;
  prompt += `- Max Portfolio Heat: ${riskMetrics.maxPortfolioHeatPct}%\n`;
  
  if (riskMetrics.currentHeat !== undefined) {
    prompt += `- Heat Atual: ${riskMetrics.currentHeat.toFixed(2)}%\n`;
  }
  
  prompt += `\nPosições ativas: ${activePositions}\n\n`;
  prompt += `Avalie:\n`;
  prompt += `1. A configuração está adequada para day trading cripto?\n`;
  prompt += `2. Há margem para ajustes que melhorem risco/retorno?\n`;
  prompt += `3. Recomendações específicas baseadas no heat atual\n`;
  prompt += `4. Circuit breakers e proteções adicionais sugeridas\n\n`;
  prompt += `Seja objetivo e prático.`;
  
  return prompt;
}

/**
 * Analysis Functions - Compose data + prompts + OpenAI
 */

export async function analyzeRankings(
  userId: string,
  storage: IStorage,
  runId: string
): Promise<AnalysisResult> {
  // Fetch top rankings
  const rankings = await storage.getTopRankings(runId, 20);
  
  if (rankings.length === 0) {
    throw new Error("Nenhum ativo ranqueado encontrado. Execute a seleção de ativos primeiro.");
  }
  
  // Build rankings data with safe defaults
  const rankingData: RankingData[] = rankings.map((r: any, idx: number) => ({
    symbol: r.symbol || 'N/A',
    rank: idx + 1,
    score: Number(r.score) || 0,
    volume24h: Number(r.volume24hUsd) || 0,
    volatility: Number(r.atrPct) || 0,
  }));
  
  // Generate prompt
  const prompt = buildRankingsPrompt(rankingData);
  
  // Get AI analysis
  const analysis = await getChatCompletion(
    [{ role: "user", content: prompt }],
    userId,
    undefined,
    false // Use default model
  );
  
  // Extract symbols for context
  const symbols = rankingData.slice(0, 5).map(r => r.symbol);
  
  return {
    analysis,
    symbols,
  };
}

export async function analyzeClusters(
  userId: string,
  storage: IStorage,
  runId: string
): Promise<AnalysisResult> {
  // Fetch rankings with cluster assignments
  const rankings = await storage.getRankingsByRunId(runId);
  
  if (rankings.length === 0) {
    throw new Error("Nenhum cluster encontrado. Execute a seleção de ativos primeiro.");
  }
  
  // Group by cluster
  const clusterMap = new Map<number, any[]>();
  rankings.forEach((r: any) => {
    const clusterId = r.cluster_number || 0;
    if (!clusterMap.has(clusterId)) {
      clusterMap.set(clusterId, []);
    }
    clusterMap.get(clusterId)!.push(r);
  });
  
  // Fetch enriched data via getTopRankings for cluster analysis
  const enrichedRankings = await storage.getTopRankings(runId, 100);
  
  // Build symbol id to data map
  const symbolDataMap = new Map();
  enrichedRankings.forEach((r: any) => {
    symbolDataMap.set(r.symbol_id, {
      symbol: r.symbol,
      volume24hUsd: Number(r.volume24hUsd) || 0,
      atrPct: Number(r.atrPct) || 0,
    });
  });
  
  // Build cluster data using enriched information
  const clusterData: ClusterData[] = Array.from(clusterMap.entries())
    .map(([clusterId, assets]: [number, any[]]) => {
      const enrichedAssets = assets
        .map((a: any) => symbolDataMap.get(a.symbol_id))
        .filter((a: any) => a !== undefined);
      
      return {
        clusterId,
        assetCount: assets.length,
        avgVolatility: enrichedAssets.length > 0
          ? enrichedAssets.reduce((sum: number, a: any) => sum + (a.atrPct || 0), 0) / enrichedAssets.length
          : 0,
        topSymbols: enrichedAssets
          .sort((a: any, b: any) => b.volume24hUsd - a.volume24hUsd)
          .slice(0, 5)
          .map((a: any) => a.symbol || 'N/A'),
      };
    })
    .sort((a, b) => b.assetCount - a.assetCount); // Sort by size
  
  // Generate prompt
  const prompt = buildClusterPrompt(clusterData, rankings.length);
  
  // Get AI analysis
  const analysis = await getChatCompletion(
    [{ role: "user", content: prompt }],
    userId,
    undefined,
    false
  );
  
  return {
    analysis,
  };
}

export async function suggestTradingStrategy(
  userId: string,
  userQuery: string,
  storage: IStorage,
  runId: string,
  riskProfile: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
): Promise<AnalysisResult> {
  // Fetch selected assets
  const rankings = await storage.getTopRankings(runId, 50);
  const selectedAssets = rankings.map((r: any) => r.symbol || 'N/A');
  
  if (selectedAssets.length === 0) {
    throw new Error("Nenhum ativo selecionado. Execute a seleção de ativos primeiro.");
  }
  
  // Generate prompt
  const prompt = buildStrategyPrompt(userQuery, selectedAssets, riskProfile);
  
  // Get AI analysis
  const analysis = await getChatCompletion(
    [{ role: "user", content: prompt }],
    userId,
    undefined,
    false
  );
  
  return {
    analysis,
    symbols: selectedAssets.slice(0, MAX_SYMBOLS_IN_CONTEXT),
  };
}

export async function analyzeRiskProfile(
  userId: string,
  storage: IStorage
): Promise<AnalysisResult> {
  // Fetch user's portfolios
  const portfolios = await storage.getPortfoliosByUserId(userId);
  
  if (portfolios.length === 0) {
    throw new Error("Nenhum portfolio encontrado. Crie um portfolio primeiro.");
  }
  
  // Use first portfolio for analysis
  const portfolio = portfolios[0];
  
  // Fetch risk parameters
  const riskParams = await storage.getRiskParametersByPortfolioId(portfolio.id);
  
  if (!riskParams) {
    throw new Error("Parâmetros de risco não configurados.");
  }
  
  // Count positions (all positions are considered active in this simplified version)
  const positions = await storage.getPositionsByPortfolioId(portfolio.id);
  const activePositions = positions.length;
  
  // Calculate current heat (simplified)
  const currentHeat = activePositions > 0 ? (activePositions * 10) : 0; // Simplified
  
  // Build risk metrics
  const riskMetrics: RiskMetrics = {
    maxPositionSizePct: Number(riskParams.max_position_size_percentage) * 100,
    maxDailyLossPct: Number(riskParams.max_daily_loss_percentage) * 100,
    maxPortfolioHeatPct: Number(riskParams.max_portfolio_heat_percentage) * 100,
    currentHeat,
  };
  
  // Generate prompt
  const prompt = buildRiskPrompt(riskMetrics, activePositions);
  
  // Get AI analysis
  const analysis = await getChatCompletion(
    [{ role: "user", content: prompt }],
    userId,
    undefined,
    false
  );
  
  return {
    analysis,
  };
}

/**
 * Campaign Risk Configuration Suggestion
 * Analyzes campaign parameters and suggests optimal risk settings
 */
export interface CampaignRiskSuggestion {
  maxDrawdown: number;
  reasoning: string;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  tips: string[];
}

export interface CampaignContext {
  initialCapital: number;
  tradingMode: 'paper' | 'live';
  duration: number;
  portfolioName?: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: 0,
    maximumFractionDigits: 2 
  }).format(value);
}

function buildCampaignRiskPrompt(context: CampaignContext): string {
  const modeText = context.tradingMode === 'live' ? 'dinheiro real (LIVE)' : 'simulação (PAPER)';
  const capitalText = context.initialCapital < 100 ? 'pequeno' : context.initialCapital < 1000 ? 'médio' : 'grande';
  
  return `Como especialista em gestão de risco para trading de criptomoedas, analise os seguintes parâmetros de uma nova campanha de trading e sugira configurações de risco ideais:

**Parâmetros da Campanha:**
- Capital Inicial: $${formatCurrency(context.initialCapital)} (porte ${capitalText})
- Modo de Trading: ${modeText}
- Duração: ${context.duration} dias
${context.portfolioName ? `- Portfólio: ${context.portfolioName}` : ''}

**Analise e retorne APENAS um JSON válido** no seguinte formato exato (sem markdown, sem explicação adicional):
{
  "maxDrawdown": <número entre 5 e 30>,
  "riskLevel": "<conservative ou moderate ou aggressive>",
  "reasoning": "<explicação em 1-2 frases do motivo da recomendação>",
  "tips": ["<dica 1>", "<dica 2>", "<dica 3>"]
}

**Critérios para decisão:**
- Modo LIVE deve ter drawdown mais conservador (5-15%)
- Modo PAPER pode ser mais agressivo para testar (15-30%)
- Capital menor = drawdown menor para preservar capital
- Capital maior = pode ser mais flexível
- Duração maior = pode ter drawdown um pouco maior

Retorne APENAS o JSON, sem texto adicional.`;
}

export async function suggestCampaignRisk(
  userId: string,
  context: CampaignContext
): Promise<CampaignRiskSuggestion> {
  const prompt = buildCampaignRiskPrompt(context);
  
  const response = await getChatCompletion(
    [{ role: "user", content: prompt }],
    userId,
    undefined,
    false
  );
  
  try {
    const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const suggestion = JSON.parse(cleanResponse) as CampaignRiskSuggestion;
    
    if (typeof suggestion.maxDrawdown !== 'number' || 
        suggestion.maxDrawdown < 5 || 
        suggestion.maxDrawdown > 30) {
      suggestion.maxDrawdown = 10;
    }
    
    if (!['conservative', 'moderate', 'aggressive'].includes(suggestion.riskLevel)) {
      suggestion.riskLevel = 'moderate';
    }
    
    if (!Array.isArray(suggestion.tips)) {
      suggestion.tips = ['Monitore suas posições regularmente', 'Siga seu plano de trading', 'Não invista mais do que pode perder'];
    }
    
    return suggestion;
  } catch (error) {
    console.error('[AI] Failed to parse campaign risk suggestion:', error);
    
    const isLive = context.tradingMode === 'live';
    const isSmallCapital = context.initialCapital < 100;
    
    return {
      maxDrawdown: isLive ? (isSmallCapital ? 8 : 10) : 15,
      riskLevel: isLive ? 'conservative' : 'moderate',
      reasoning: isLive 
        ? 'Modo LIVE requer gestão de risco conservadora para proteger seu capital.'
        : 'Modo PAPER permite testar estratégias com maior tolerância a risco.',
      tips: [
        'Nunca arrisque mais do que pode perder',
        'Defina stops claros antes de entrar em trades',
        'Revise seu desempenho regularmente'
      ]
    };
  }
}
