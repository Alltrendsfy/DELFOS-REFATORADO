import OpenAI from "openai";
import crypto from "crypto";
import { db } from "../db";
import { 
  opportunity_blueprints, 
  opportunity_ai_logs,
  opportunity_campaigns,
  campaigns,
  portfolios,
  MARKET_REGIMES,
  OPPORTUNITY_TYPES,
  type InsertOpportunityBlueprint,
  type OpportunityBlueprint,
  type InsertOpportunityAILog
} from "@shared/schema";
import { eq, and, lt, gte, desc, sql, count } from "drizzle-orm";

// Lazy initialization to avoid module load failures
let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (openaiInstance) return openaiInstance;
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[OpportunityBlueprint] OPENAI_API_KEY not configured - AI detection disabled');
    return null;
  }
  
  try {
    openaiInstance = new OpenAI({ apiKey });
    return openaiInstance;
  } catch (error) {
    console.error('[OpportunityBlueprint] Failed to initialize OpenAI:', error);
    return null;
  }
}

const CONFIG = {
  MODEL: "gpt-4o",
  MAX_TOKENS: 4000,
  TEMPERATURE: 0.3,
  MIN_OPPORTUNITY_SCORE: 75,
  MIN_CONFIDENCE: 0.70,
  DEFAULT_EXPIRY_HOURS: 24,
  MAX_ACTIVE_COS_PER_USER: 3,
  MAX_ACTIVE_BLUEPRINTS_PER_USER: 10,
  COOLDOWN_AFTER_CONSUMPTION_MINUTES: 30,
};

export interface MarketData {
  symbol: string;
  price: number;
  volume24h: number;
  change24h: number;
  volatility: number;
  high24h: number;
  low24h: number;
}

export interface CampaignHistory {
  id: string;
  name: string;
  roi: number;
  winRate: number;
  totalTrades: number;
  regime?: string;
}

export interface DetectionContext {
  userId: string;
  franchiseId?: string;
  marketData: MarketData[];
  campaignHistory: CampaignHistory[];
  clusterData?: Record<string, { cluster: number; performance: number }>;
  currentRegime?: string;
}

export interface OpportunityDetectionResult {
  detected: boolean;
  blueprint?: OpportunityBlueprint;
  rejectionReason?: string;
  aiLog: {
    id: string;
    tokensUsed: number;
    latencyMs: number;
  };
}

const OPPORTUNITY_SYSTEM_PROMPT = `Você é a IA de Oportunidades do sistema DELFOS.

Seu papel NÃO é executar operações, NÃO é criar campanhas e NÃO é assumir riscos.

Seu único objetivo é identificar janelas de oportunidade estatisticamente favoráveis
que justifiquem a criação de uma Campanha de Oportunidade (CO), separada das campanhas
regulares do sistema.

Você deve:

1. Analisar continuamente:
   - histórico completo das campanhas DELFOS
   - histórico de mercado (preço, volume, volatilidade, correlação)
   - regimes de mercado
   - comportamento por clusters de ativos
   - dados de volatilidade e assimetria risco/retorno

2. Detectar oportunidades apenas quando:
   - houver vantagem estatística clara
   - o contexto NÃO estiver contemplado pelas campanhas ativas
   - a assimetria risco/retorno for superior à média histórica
   - houver liquidez suficiente
   - houver recorrência histórica em regimes semelhantes

3. Classificar o regime de mercado atual antes de sugerir qualquer oportunidade.

4. Trabalhar exclusivamente com Teses pré-definidas:
   - CO-01: Reversão Estatística - Ativos com desvio significativo da média
   - CO-02: Expansão de Volatilidade - Breakout de ranges com aumento de volume
   - CO-03: Momentum Setorial - Força relativa em cluster específico
   - CO-04: Evento de Liquidez - Alta liquidez anormal criando oportunidade
   - CO-05: Correlation Breakdown - Quebra de correlação histórica entre ativos
   - CO-06: Cross-Asset Divergence - Divergência entre ativos correlacionados

5. Gerar um Opportunity Score (0 a 100) considerando:
   - Assimetria risco/retorno
   - Probabilidade histórica de sucesso
   - Confiança estatística

6. Somente sugerir oportunidades quando:
   - Opportunity Score ≥ 75
   - Confiança ≥ 0.70

7. Para cada oportunidade válida, gerar JSON com esta estrutura EXATA:
{
  "opportunity_detected": true,
  "type": "CO-XX",
  "regime": "REGIME_NAME",
  "opportunity_score": 0-100,
  "confidence": 0.00-1.00,
  "assets": ["SYMBOL/USD"],
  "campaign_parameters": {
    "duration_days": 7-30,
    "capital_allocation_pct": 5-20,
    "compounding_enabled": boolean,
    "investor_profile": "C|M|A"
  },
  "risk_parameters": {
    "max_position_size_pct": 1-10,
    "stop_loss_pct": 1-5,
    "take_profit_pct": 2-15,
    "max_drawdown_pct": 5-15,
    "trailing_stop": boolean
  },
  "execution_logic": {
    "entry_conditions": ["condição 1", "condição 2"],
    "exit_conditions": ["condição 1", "condição 2"],
    "time_constraints": {
      "max_hold_hours": 24-168,
      "trading_hours": "24/7"
    }
  },
  "explanation": {
    "thesis": "Descrição da tese",
    "rationale": "Justificativa detalhada",
    "historical_evidence": "Evidências históricas",
    "risk_factors": ["risco 1", "risco 2"]
  }
}

8. Se NÃO detectar oportunidade válida, responda:
{
  "opportunity_detected": false,
  "rejection_reason": "Motivo da rejeição"
}

9. Você NUNCA deve:
   - executar trades
   - alterar campanhas ativas
   - criar campanhas automaticamente
   - ultrapassar limites globais do DELFOS
   - ocultar incertezas

10. Seja conservador. É preferível NÃO gerar oportunidade do que gerar uma oportunidade fraca.

REGIMES DE MERCADO VÁLIDOS: ${MARKET_REGIMES.join(', ')}
TIPOS DE OPORTUNIDADE: ${OPPORTUNITY_TYPES.join(', ')}`;

function generateBlueprintHash(data: Partial<InsertOpportunityBlueprint>): string {
  const hashData = {
    type: data.type,
    regime: data.regime,
    assets: data.assets,
    opportunity_score: data.opportunity_score,
    confidence: data.confidence,
    campaign_parameters: data.campaign_parameters,
    risk_parameters: data.risk_parameters,
    execution_logic: data.execution_logic,
  };
  return crypto.createHash('sha256').update(JSON.stringify(hashData)).digest('hex');
}

export async function detectOpportunity(context: DetectionContext): Promise<OpportunityDetectionResult> {
  const startTime = Date.now();
  
  // Lazy-load OpenAI client
  const openai = getOpenAI();
  
  // Defensive check: if OpenAI is not configured, return gracefully
  if (!openai) {
    return {
      detected: false,
      rejectionReason: 'OpenAI API key not configured - opportunity detection disabled',
      aiLog: { id: 'no-openai', tokensUsed: 0, latencyMs: 0 }
    };
  }
  
  try {
    const activeBlueprints = await db
      .select({ count: count() })
      .from(opportunity_blueprints)
      .where(
        and(
          eq(opportunity_blueprints.user_id, context.userId),
          eq(opportunity_blueprints.status, 'ACTIVE')
        )
      );
    
    if (activeBlueprints[0].count >= CONFIG.MAX_ACTIVE_BLUEPRINTS_PER_USER) {
      const logEntry = await logAIDecision({
        user_id: context.userId,
        analysis_type: 'opportunity_detection',
        model: CONFIG.MODEL,
        input_context: { marketData: context.marketData.slice(0, 5) },
        output: { skipped: true, reason: 'max_active_blueprints' },
        opportunity_detected: false,
        rejection_reason: `Limite de ${CONFIG.MAX_ACTIVE_BLUEPRINTS_PER_USER} blueprints ativos atingido`,
        tokens_used: 0,
        latency_ms: Date.now() - startTime,
      });
      
      return {
        detected: false,
        rejectionReason: `Limite de blueprints ativos atingido`,
        aiLog: { id: logEntry.id, tokensUsed: 0, latencyMs: Date.now() - startTime }
      };
    }
    
    const userPrompt = buildUserPrompt(context);
    
    const response = await openai.chat.completions.create({
      model: CONFIG.MODEL,
      messages: [
        { role: "system", content: OPPORTUNITY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: CONFIG.TEMPERATURE,
      max_tokens: CONFIG.MAX_TOKENS,
      response_format: { type: "json_object" }
    });
    
    const latencyMs = Date.now() - startTime;
    const tokensUsed = response.usage?.total_tokens || 0;
    const aiOutput = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    if (!aiOutput.opportunity_detected) {
      const logEntry = await logAIDecision({
        user_id: context.userId,
        analysis_type: 'opportunity_detection',
        model: CONFIG.MODEL,
        input_context: { 
          marketData: context.marketData.slice(0, 5),
          campaignHistoryCount: context.campaignHistory.length 
        },
        output: aiOutput,
        opportunity_detected: false,
        rejection_reason: aiOutput.rejection_reason || 'No opportunity detected',
        tokens_used: tokensUsed,
        latency_ms: latencyMs,
      });
      
      return {
        detected: false,
        rejectionReason: aiOutput.rejection_reason,
        aiLog: { id: logEntry.id, tokensUsed, latencyMs }
      };
    }
    
    if (aiOutput.opportunity_score < CONFIG.MIN_OPPORTUNITY_SCORE || 
        aiOutput.confidence < CONFIG.MIN_CONFIDENCE) {
      const logEntry = await logAIDecision({
        user_id: context.userId,
        analysis_type: 'opportunity_detection',
        model: CONFIG.MODEL,
        input_context: { marketData: context.marketData.slice(0, 5) },
        output: aiOutput,
        opportunity_detected: false,
        rejection_reason: `Score ${aiOutput.opportunity_score} ou confiança ${aiOutput.confidence} abaixo do mínimo`,
        tokens_used: tokensUsed,
        latency_ms: latencyMs,
      });
      
      return {
        detected: false,
        rejectionReason: `Score ou confiança abaixo do mínimo exigido`,
        aiLog: { id: logEntry.id, tokensUsed, latencyMs }
      };
    }
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CONFIG.DEFAULT_EXPIRY_HOURS);
    
    const blueprintData: InsertOpportunityBlueprint = {
      user_id: context.userId,
      franchise_id: context.franchiseId,
      type: aiOutput.type,
      regime: aiOutput.regime,
      opportunity_score: aiOutput.opportunity_score,
      confidence: String(aiOutput.confidence),
      assets: aiOutput.assets,
      campaign_parameters: aiOutput.campaign_parameters,
      risk_parameters: aiOutput.risk_parameters,
      execution_logic: aiOutput.execution_logic,
      explanation: aiOutput.explanation,
      status: 'ACTIVE',
      expires_at: expiresAt,
      creation_hash: '',
      detection_source: 'ai_engine',
      detection_model: CONFIG.MODEL,
      detection_latency_ms: latencyMs,
      market_context: {
        btc_price: context.marketData.find(m => m.symbol.includes('BTC'))?.price,
        analyzed_at: new Date().toISOString(),
        symbols_count: context.marketData.length
      }
    };
    
    blueprintData.creation_hash = generateBlueprintHash(blueprintData);
    
    const [blueprint] = await db.insert(opportunity_blueprints).values(blueprintData).returning();
    
    const logEntry = await logAIDecision({
      user_id: context.userId,
      blueprint_id: blueprint.id,
      analysis_type: 'opportunity_detection',
      model: CONFIG.MODEL,
      input_context: { 
        marketData: context.marketData.slice(0, 5),
        campaignHistoryCount: context.campaignHistory.length 
      },
      output: aiOutput,
      opportunity_detected: true,
      tokens_used: tokensUsed,
      latency_ms: latencyMs,
      cost_usd: String(tokensUsed * 0.00001),
    });
    
    console.log(`[OpportunityBlueprint] Created blueprint ${blueprint.id} - Type: ${blueprint.type}, Score: ${blueprint.opportunity_score}`);
    
    return {
      detected: true,
      blueprint,
      aiLog: { id: logEntry.id, tokensUsed, latencyMs }
    };
    
  } catch (error: any) {
    console.error('[OpportunityBlueprint] Detection error:', error.message);
    
    const logEntry = await logAIDecision({
      user_id: context.userId,
      analysis_type: 'opportunity_detection',
      model: CONFIG.MODEL,
      input_context: { error: true },
      output: { error: error.message },
      opportunity_detected: false,
      rejection_reason: `Error: ${error.message}`,
      tokens_used: 0,
      latency_ms: Date.now() - startTime,
    });
    
    return {
      detected: false,
      rejectionReason: `Erro na detecção: ${error.message}`,
      aiLog: { id: logEntry.id, tokensUsed: 0, latencyMs: Date.now() - startTime }
    };
  }
}

function buildUserPrompt(context: DetectionContext): string {
  let prompt = `Analise os seguintes dados de mercado e histórico para identificar oportunidades:\n\n`;
  
  prompt += `## DADOS DE MERCADO ATUAL (${context.marketData.length} ativos)\n`;
  context.marketData.slice(0, 20).forEach(m => {
    prompt += `- ${m.symbol}: Preço $${m.price.toFixed(2)}, Volume $${(m.volume24h/1e6).toFixed(2)}M, `;
    prompt += `Variação ${m.change24h > 0 ? '+' : ''}${m.change24h.toFixed(2)}%, `;
    prompt += `Volatilidade ${(m.volatility * 100).toFixed(2)}%\n`;
  });
  
  if (context.currentRegime) {
    prompt += `\n## REGIME DE MERCADO ATUAL\n${context.currentRegime}\n`;
  }
  
  if (context.campaignHistory.length > 0) {
    prompt += `\n## HISTÓRICO DE CAMPANHAS (${context.campaignHistory.length} campanhas)\n`;
    context.campaignHistory.slice(0, 10).forEach(c => {
      prompt += `- ${c.name}: ROI ${c.roi > 0 ? '+' : ''}${c.roi.toFixed(2)}%, `;
      prompt += `WinRate ${c.winRate.toFixed(1)}%, Trades: ${c.totalTrades}\n`;
    });
  }
  
  if (context.clusterData && Object.keys(context.clusterData).length > 0) {
    prompt += `\n## PERFORMANCE POR CLUSTER\n`;
    Object.entries(context.clusterData).forEach(([symbol, data]) => {
      prompt += `- ${symbol} (Cluster ${data.cluster}): Performance ${data.performance > 0 ? '+' : ''}${data.performance.toFixed(2)}%\n`;
    });
  }
  
  prompt += `\n## INSTRUÇÕES\n`;
  prompt += `1. Analise os dados acima considerando assimetria risco/retorno\n`;
  prompt += `2. Identifique se existe alguma oportunidade que se encaixe nas teses disponíveis\n`;
  prompt += `3. Seja conservador - apenas sugira se a oportunidade for CLARA e FAVORÁVEL\n`;
  prompt += `4. Retorne o JSON conforme especificado no system prompt\n`;
  
  return prompt;
}

async function logAIDecision(data: InsertOpportunityAILog): Promise<{ id: string }> {
  const [log] = await db.insert(opportunity_ai_logs).values(data).returning({ id: opportunity_ai_logs.id });
  return log;
}

export async function getActiveBlueprints(userId: string, franchiseId?: string): Promise<OpportunityBlueprint[]> {
  const conditions = [
    eq(opportunity_blueprints.user_id, userId),
    eq(opportunity_blueprints.status, 'ACTIVE'),
    gte(opportunity_blueprints.expires_at, new Date())
  ];
  
  // If franchiseId is provided, filter by franchise
  if (franchiseId) {
    conditions.push(eq(opportunity_blueprints.franchise_id, franchiseId));
  }
  
  return db
    .select()
    .from(opportunity_blueprints)
    .where(and(...conditions))
    .orderBy(desc(opportunity_blueprints.opportunity_score));
}

export async function getBlueprintById(blueprintId: string, userId: string): Promise<OpportunityBlueprint | null> {
  const [blueprint] = await db
    .select()
    .from(opportunity_blueprints)
    .where(
      and(
        eq(opportunity_blueprints.id, blueprintId),
        eq(opportunity_blueprints.user_id, userId)
      )
    );
  return blueprint || null;
}

export async function expireBlueprints(): Promise<number> {
  const now = new Date();
  
  const result = await db
    .update(opportunity_blueprints)
    .set({ 
      status: 'EXPIRED',
      updated_at: now
    })
    .where(
      and(
        eq(opportunity_blueprints.status, 'ACTIVE'),
        lt(opportunity_blueprints.expires_at, now)
      )
    )
    .returning({ id: opportunity_blueprints.id });
  
  if (result.length > 0) {
    console.log(`[OpportunityBlueprint] Expired ${result.length} blueprints`);
  }
  
  return result.length;
}

export interface ConsumeResult {
  success: boolean;
  campaignId?: string;
  error?: string;
}

export async function consumeBlueprint(
  blueprintId: string, 
  userId: string,
  portfolioId: string,
  allocatedCapital: number
): Promise<ConsumeResult> {
  try {
    const blueprint = await getBlueprintById(blueprintId, userId);
    
    if (!blueprint) {
      return { success: false, error: 'Blueprint não encontrado' };
    }
    
    if (blueprint.status !== 'ACTIVE') {
      return { success: false, error: `Blueprint não está ativo (status: ${blueprint.status})` };
    }
    
    if (new Date(blueprint.expires_at) < new Date()) {
      await db.update(opportunity_blueprints)
        .set({ status: 'EXPIRED', updated_at: new Date() })
        .where(eq(opportunity_blueprints.id, blueprintId));
      return { success: false, error: 'Blueprint expirado' };
    }
    
    const [portfolio] = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId));
    if (!portfolio) {
      return { success: false, error: 'Portfólio não encontrado' };
    }
    
    const portfolioValue = parseFloat(portfolio.total_value_usd);
    if (allocatedCapital > portfolioValue) {
      return { success: false, error: 'Capital alocado maior que o valor do portfólio' };
    }
    
    const activeCOs = await db
      .select({ count: count() })
      .from(opportunity_campaigns)
      .where(
        and(
          eq(opportunity_campaigns.user_id, userId),
          eq(opportunity_campaigns.status, 'active')
        )
      );
    
    if (activeCOs[0].count >= CONFIG.MAX_ACTIVE_COS_PER_USER) {
      return { success: false, error: `Limite de ${CONFIG.MAX_ACTIVE_COS_PER_USER} campanhas CO ativas atingido` };
    }
    
    const params = blueprint.campaign_parameters as any;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + (params.duration_days || 14));
    
    const [campaign] = await db.insert(campaigns).values({
      name: `CO-${blueprint.type}-${Date.now().toString(36).toUpperCase()}`,
      portfolio_id: portfolioId,
      investor_profile: params.investor_profile || 'M',
      initial_capital: String(allocatedCapital),
      current_equity: String(allocatedCapital),
      status: 'active',
      start_date: startDate,
      end_date: endDate,
    }).returning();
    
    await db.insert(opportunity_campaigns).values({
      blueprint_id: blueprintId,
      campaign_id: campaign.id,
      user_id: userId,
      franchise_id: blueprint.franchise_id,
      allocated_capital: String(allocatedCapital),
      status: 'active',
      enhanced_audit: true,
    });
    
    await db.update(opportunity_blueprints)
      .set({
        status: 'CONSUMED',
        consumed_at: new Date(),
        consumed_by_campaign_id: campaign.id,
        updated_at: new Date()
      })
      .where(eq(opportunity_blueprints.id, blueprintId));
    
    console.log(`[OpportunityBlueprint] Blueprint ${blueprintId} consumed - Campaign ${campaign.id} created`);
    
    return { success: true, campaignId: campaign.id };
    
  } catch (error: any) {
    console.error('[OpportunityBlueprint] Consume error:', error.message);
    return { success: false, error: `Erro ao consumir blueprint: ${error.message}` };
  }
}

export async function rejectBlueprint(
  blueprintId: string, 
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [blueprint] = await db
      .select()
      .from(opportunity_blueprints)
      .where(
        and(
          eq(opportunity_blueprints.id, blueprintId),
          eq(opportunity_blueprints.user_id, userId)
        )
      );
    
    if (!blueprint) {
      return { success: false, error: 'Blueprint não encontrado' };
    }
    
    if (blueprint.status !== 'ACTIVE') {
      return { success: false, error: 'Apenas blueprints ativos podem ser rejeitados' };
    }
    
    await db.update(opportunity_blueprints)
      .set({
        status: 'REJECTED',
        updated_at: new Date()
      })
      .where(eq(opportunity_blueprints.id, blueprintId));
    
    console.log(`[OpportunityBlueprint] Blueprint ${blueprintId} rejected by user ${userId}`);
    
    return { success: true };
  } catch (error: any) {
    console.error('[OpportunityBlueprint] Reject error:', error.message);
    return { success: false, error: `Erro ao rejeitar blueprint: ${error.message}` };
  }
}

export async function validateBlueprintIntegrity(blueprintId: string): Promise<boolean> {
  const [blueprint] = await db
    .select()
    .from(opportunity_blueprints)
    .where(eq(opportunity_blueprints.id, blueprintId));
  
  if (!blueprint) return false;
  
  const recalculatedHash = generateBlueprintHash({
    type: blueprint.type,
    regime: blueprint.regime,
    assets: blueprint.assets,
    opportunity_score: blueprint.opportunity_score,
    confidence: blueprint.confidence,
    campaign_parameters: blueprint.campaign_parameters as any,
    risk_parameters: blueprint.risk_parameters as any,
    execution_logic: blueprint.execution_logic as any,
  });
  
  return recalculatedHash === blueprint.creation_hash;
}

export async function getUserBlueprintStats(userId: string, franchiseId?: string): Promise<{
  total: number;
  active: number;
  consumed: number;
  expired: number;
  consumedRate: number;
  avgConfidence: number;
  avgExpectedReturn: number;
  avgScore: number;
}> {
  const conditions = [eq(opportunity_blueprints.user_id, userId)];
  
  // If franchiseId is provided, filter by franchise
  if (franchiseId) {
    conditions.push(eq(opportunity_blueprints.franchise_id, franchiseId));
  }
  
  const blueprints = await db
    .select({
      status: opportunity_blueprints.status,
      score: opportunity_blueprints.opportunity_score,
      confidence: opportunity_blueprints.confidence,
      risk_parameters: opportunity_blueprints.risk_parameters,
    })
    .from(opportunity_blueprints)
    .where(and(...conditions));
  
  let activeCount = 0;
  let consumedCount = 0;
  let expiredCount = 0;
  let totalScore = 0;
  let totalConfidence = 0;
  let totalExpectedReturn = 0;
  let confidenceCount = 0;
  let returnCount = 0;
  
  blueprints.forEach(b => {
    if (b.status === 'ACTIVE') activeCount++;
    else if (b.status === 'CONSUMED') consumedCount++;
    else if (b.status === 'EXPIRED') expiredCount++;
    totalScore += b.score || 0;
    if (b.confidence != null) {
      // Handle string confidence values, including locale-specific formats
      let conf: number;
      if (typeof b.confidence === 'string') {
        // Replace commas with dots for locale-safe parsing
        conf = parseFloat(b.confidence.replace(',', '.'));
      } else {
        conf = b.confidence;
      }
      // Only add if it's a valid number
      if (!isNaN(conf) && isFinite(conf)) {
        totalConfidence += conf;
        confidenceCount++;
      }
    }
    // Extract expected return from risk_parameters if available
    try {
      const riskParams = (typeof b.risk_parameters === 'string' 
        ? JSON.parse(b.risk_parameters) 
        : b.risk_parameters) as { expected_return_pct?: number } | null;
      if (riskParams?.expected_return_pct != null) {
        const expReturn = typeof riskParams.expected_return_pct === 'string'
          ? parseFloat(riskParams.expected_return_pct)
          : riskParams.expected_return_pct;
        if (!isNaN(expReturn) && isFinite(expReturn)) {
          totalExpectedReturn += expReturn;
          returnCount++;
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  });
  
  const total = blueprints.length;
  const consumedRate = total > 0 ? (consumedCount / total) * 100 : 0;
  const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
  const avgExpectedReturn = returnCount > 0 ? totalExpectedReturn / returnCount : 0;
  const avgScore = total > 0 ? totalScore / total : 0;
  
  return {
    total,
    active: activeCount,
    consumed: consumedCount,
    expired: expiredCount,
    consumedRate,
    avgConfidence,
    avgExpectedReturn,
    avgScore,
  };
}

export async function getBlueprintHistory(
  userId: string, 
  limit: number = 20,
  offset: number = 0,
  franchiseId?: string
): Promise<OpportunityBlueprint[]> {
  const conditions = [eq(opportunity_blueprints.user_id, userId)];
  
  // If franchiseId is provided, filter by franchise
  if (franchiseId) {
    conditions.push(eq(opportunity_blueprints.franchise_id, franchiseId));
  }
  
  return db
    .select()
    .from(opportunity_blueprints)
    .where(and(...conditions))
    .orderBy(desc(opportunity_blueprints.created_at))
    .limit(limit)
    .offset(offset);
}

const OE_WINDOW_TYPE_MAP: Record<string, string> = {
  'REGIME_TRANSITION': 'CO-01',
  'CLUSTER_MOMENTUM': 'CO-02',
  'VOLATILITY_EXPANSION': 'CO-03',
  'LIQUIDITY_SURGE': 'CO-04',
  'CORRELATION_BREAKDOWN': 'CO-05',
  'NARRATIVE_PEAK': 'CO-06',
};

import { opportunity_windows, OpportunityWindow, InsertOpportunityWindow, rate_limit_counters } from "@shared/schema";
import { gt } from "drizzle-orm";

interface CachedWindow {
  window: OpportunityWindow;
  cachedAt: number;
}

const windowCache = new Map<string, CachedWindow>();
const WINDOW_CACHE_TTL_MS = 5 * 60 * 1000;

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_BLUEPRINT = 10;
const RATE_LIMIT_MAX_DETECTION = 5;

let lastDetectionTime = 0;
const DETECTION_COOLDOWN_MS = 30 * 1000;

async function checkPersistentRateLimit(endpoint: string, maxRequests: number): Promise<boolean> {
  const now = new Date();
  
  const [existing] = await db
    .select()
    .from(rate_limit_counters)
    .where(eq(rate_limit_counters.endpoint, endpoint))
    .limit(1);
  
  if (!existing) {
    await db.insert(rate_limit_counters).values({
      endpoint,
      count: 1,
      window_start: now,
      window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      max_requests: maxRequests,
    });
    return true;
  }
  
  const windowEnd = new Date(existing.window_start.getTime() + existing.window_seconds * 1000);
  
  if (now > windowEnd) {
    await db
      .update(rate_limit_counters)
      .set({
        count: 1,
        window_start: now,
        updated_at: now,
      })
      .where(eq(rate_limit_counters.endpoint, endpoint));
    return true;
  }
  
  if (existing.count >= existing.max_requests) {
    return false;
  }
  
  await db
    .update(rate_limit_counters)
    .set({
      count: existing.count + 1,
      updated_at: now,
    })
    .where(eq(rate_limit_counters.endpoint, endpoint));
  
  return true;
}

export async function checkDetectionRateLimit(userId: string): Promise<boolean> {
  const endpoint = `detection:${userId}`;
  return checkPersistentRateLimit(endpoint, RATE_LIMIT_MAX_DETECTION);
}

async function checkRateLimit(userId: string): Promise<boolean> {
  const endpoint = `blueprint:${userId}`;
  return checkPersistentRateLimit(endpoint, RATE_LIMIT_MAX_BLUEPRINT);
}

export async function detectAndPersistOpportunityWindows(): Promise<OpportunityWindow[]> {
  const now = Date.now();
  
  const existingWindows = await db
    .select()
    .from(opportunity_windows)
    .where(and(
      eq(opportunity_windows.consumed, false),
      gt(opportunity_windows.expires_at, new Date())
    ));
  
  for (const w of existingWindows) {
    windowCache.set(w.id, { window: w, cachedAt: now });
  }
  
  if (now - lastDetectionTime < DETECTION_COOLDOWN_MS) {
    return existingWindows;
  }
  
  lastDetectionTime = now;
  
  const { opportunityEngineService } = await import('./opportunity/opportunityEngineService');
  const detectedWindows = await opportunityEngineService.detectOpportunityWindows();
  
  const persistedWindows: OpportunityWindow[] = [...existingWindows];
  
  const seenDedupeKeys = new Set<string>();
  for (const ew of existingWindows) {
    seenDedupeKeys.add(`${ew.type}-${ew.vre_regime}-${ew.cluster_id}`);
  }
  
  for (const w of detectedWindows) {
    const regime = w.vre_regime || 'NORMAL';
    const dedupeKey = `${w.type}-${regime}-${w.cluster_id}`;
    
    if (seenDedupeKeys.has(dedupeKey)) {
      continue;
    }
    
    seenDedupeKeys.add(dedupeKey);
    
    const contentHash = crypto.createHash('sha256')
      .update(`${w.type}:${regime}:${w.cluster_id}`)
      .digest('hex');
    
    const windowData: InsertOpportunityWindow = {
      type: w.type,
      vre_regime: regime,
      cluster_id: w.cluster_id,
      cluster_name: w.cluster_name,
      score: w.score.toFixed(4),
      cos_score: w.cos_score.toFixed(4),
      thesis: w.thesis,
      strength: w.strength,
      expected_duration_hours: w.expected_duration_hours,
      recommended_assets: w.recommended_assets,
      content_hash: contentHash,
      expires_at: w.expires_at,
    };
    
    const [persisted] = await db.insert(opportunity_windows)
      .values(windowData)
      .onConflictDoUpdate({
        target: [opportunity_windows.type, opportunity_windows.vre_regime, opportunity_windows.cluster_id],
        set: {
          score: windowData.score,
          cos_score: windowData.cos_score,
          thesis: windowData.thesis,
          strength: windowData.strength,
          expected_duration_hours: windowData.expected_duration_hours,
          recommended_assets: windowData.recommended_assets,
          expires_at: windowData.expires_at,
        },
      })
      .returning();
    
    persistedWindows.push(persisted);
    
    windowCache.set(persisted.id, { window: persisted, cachedAt: now });
    
    console.log(`[OpportunityWindows] Upserted window ${persisted.id} (type: ${w.type}, regime: ${regime}, cluster: ${w.cluster_id})`);
  }
  
  return persistedWindows;
}

export async function getOpportunityWindow(windowId: string): Promise<OpportunityWindow | null> {
  const cached = windowCache.get(windowId);
  if (cached && Date.now() - cached.cachedAt < WINDOW_CACHE_TTL_MS) {
    if (!cached.window.consumed && new Date(cached.window.expires_at) > new Date()) {
      return cached.window;
    }
  }
  
  const [dbWindow] = await db
    .select()
    .from(opportunity_windows)
    .where(and(
      eq(opportunity_windows.id, windowId),
      eq(opportunity_windows.consumed, false),
      gt(opportunity_windows.expires_at, new Date())
    ))
    .limit(1);
  
  if (dbWindow) {
    windowCache.set(windowId, { window: dbWindow, cachedAt: Date.now() });
  }
  
  return dbWindow || null;
}

async function markWindowConsumed(windowId: string, blueprintId: string): Promise<void> {
  await db
    .update(opportunity_windows)
    .set({ consumed: true, consumed_by_blueprint_id: blueprintId })
    .where(eq(opportunity_windows.id, windowId));
  
  windowCache.delete(windowId);
}

export async function generateBlueprintFromOpportunityWindow(
  userId: string,
  windowId: string,
  franchiseId?: string
): Promise<{ success: boolean; blueprint?: OpportunityBlueprint; error?: string; rateLimited?: boolean }> {
  try {
    if (!(await checkRateLimit(userId))) {
      return { success: false, error: 'Rate limit exceeded. Try again in a minute.', rateLimited: true };
    }
    
    const { basketsService } = await import('./opportunity/basketsService');
    
    const window = await getOpportunityWindow(windowId);
    
    if (!window) {
      return { success: false, error: 'Opportunity window not found or expired. Please refresh windows.' };
    }
    
    const basket = await basketsService.generateBasket10x10();
    const clusterBasket = basket.cluster_baskets.find((cb: any) => cb.cluster_id === window.cluster_id);
    
    const type = OE_WINDOW_TYPE_MAP[window.type] || 'CO-02';
    const regime = window.vre_regime || 'VOLATILITY_EXPANSION';
    const score = typeof window.score === 'string' ? parseFloat(window.score) : window.score;
    const cosScore = typeof window.cos_score === 'string' ? parseFloat(window.cos_score) : window.cos_score;
    const opportunityScore = Math.round(score * 100);
    const confidence = cosScore.toFixed(4);
    
    const campaignParameters = {
      duration_days: 30,
      capital_allocation_pct: calculateOECapitalAllocation(window),
      profile: determineOEProfile(window),
      max_heat_pct: 3.0,
      compounding_enabled: true,
      daily_compound_rate: 0.002,
    };
    
    const riskParameters = {
      max_position_size_pct: 2.0,
      stop_loss_pct: calculateOEStopLoss(window),
      take_profit_1_pct: calculateOETakeProfit1(window),
      take_profit_2_pct: calculateOETakeProfit2(window),
      max_drawdown_pct: 8.0,
      max_correlation_limit: 0.75,
      circuit_breaker_thresholds: {
        daily_loss_pct: 3.0,
        consecutive_losses: 3,
      },
    };
    
    const executionLogic = {
      entry_conditions: {
        vre_regimes_allowed: getAllowedOERegimes(window),
        min_cos_score: 0.4,
        min_liquidity_score: 0.5,
        max_spread_bps: 50,
      },
      exit_conditions: {
        trailing_stop_enabled: window.vre_regime !== 'EXTREME',
        trailing_atr_multiplier: 2.5,
        time_based_exit_hours: window.expected_duration_hours * 2,
      },
      time_constraints: {
        valid_hours_utc: [0, 24],
        avoid_weekends: false,
      },
    };
    
    const explanation = {
      thesis: window.thesis,
      rationale: generateOERationale(window),
      historical_evidence: `Cluster ${window.cluster_id} (${window.cluster_name}) shows ${window.strength.toLowerCase()} signals during ${window.vre_regime} regime.`,
      risk_factors: identifyOERiskFactors(window),
      expected_return_range: calculateOEExpectedReturnRange(window),
      confidence_basis: `COS Score: ${(cosScore * 100).toFixed(1)}%, Strength: ${window.strength}`,
    };
    
    const marketContext = {
      btc_price_usd: 0,
      eth_price_usd: 0,
      total_market_cap_b: 0,
      vre_regime: window.vre_regime,
      dominant_cluster_id: window.cluster_id,
      avg_correlation: clusterBasket ? basket.avg_correlation : 0.5,
      snapshot_timestamp: new Date().toISOString(),
    };
    
    const creationHash = generateBlueprintHash({
      type,
      regime,
      assets: window.recommended_assets,
      opportunity_score: opportunityScore,
      confidence,
      campaign_parameters: campaignParameters,
      risk_parameters: riskParameters,
      execution_logic: executionLogic,
    });
    
    const [blueprint] = await db.insert(opportunity_blueprints).values({
      user_id: userId,
      franchise_id: franchiseId || null,
      type,
      regime,
      opportunity_score: opportunityScore,
      confidence,
      assets: window.recommended_assets,
      campaign_parameters: campaignParameters,
      risk_parameters: riskParameters,
      execution_logic: executionLogic,
      explanation,
      status: 'ACTIVE',
      expires_at: window.expires_at,
      creation_hash: creationHash,
      detection_source: 'opportunity_engine',
      detection_model: 'opportunity_engine_v2',
      detection_latency_ms: null,
      market_context: marketContext,
    }).returning();
    
    await markWindowConsumed(windowId, blueprint.id);
    
    console.log(`[OpportunityBlueprint] Created OE-based blueprint ${blueprint.id} (type: ${type}, score: ${opportunityScore}, hash: ${creationHash.slice(0, 12)}...)`);
    
    return { success: true, blueprint };
  } catch (error) {
    console.error('[OpportunityBlueprint] Failed to generate from OE window:', error);
    return { success: false, error: String(error) };
  }
}

function calculateOECapitalAllocation(window: any): number {
  const baseAllocation = 10;
  const strengthMultiplier = window.strength === 'EXCEPTIONAL' ? 1.5 
    : window.strength === 'STRONG' ? 1.2 
    : window.strength === 'MODERATE' ? 1.0 
    : 0.7;
  return Math.min(25, baseAllocation * strengthMultiplier);
}

function determineOEProfile(window: any): 'C' | 'M' | 'A' | 'SA' | 'FULL' {
  if (window.vre_regime === 'EXTREME') return 'C';
  if (window.vre_regime === 'HIGH') return 'M';
  if (window.strength === 'EXCEPTIONAL') return 'A';
  if (window.cos_score >= 0.8) return 'SA';
  return 'M';
}

function calculateOEStopLoss(window: any): number {
  const base = 2.0;
  if (window.vre_regime === 'EXTREME') return base * 0.75;
  if (window.vre_regime === 'HIGH') return base * 0.9;
  return base;
}

function calculateOETakeProfit1(window: any): number {
  const base = 3.0;
  if (window.strength === 'EXCEPTIONAL') return base * 1.5;
  if (window.strength === 'STRONG') return base * 1.25;
  return base;
}

function calculateOETakeProfit2(window: any): number {
  return calculateOETakeProfit1(window) * 1.8;
}

function getAllowedOERegimes(window: any): string[] {
  if (window.vre_regime === 'EXTREME') return ['LOW', 'NORMAL'];
  if (window.vre_regime === 'HIGH') return ['LOW', 'NORMAL', 'HIGH'];
  return ['LOW', 'NORMAL', 'HIGH', 'EXTREME'];
}

function generateOERationale(window: any): string {
  const contributions = window.metadata?.contributions || {};
  const parts: string[] = [];
  if (contributions.momentum > 0.15) parts.push('strong momentum signals');
  if (contributions.liquidity > 0.15) parts.push('favorable liquidity conditions');
  if (contributions.volatility > 0.10) parts.push('optimal volatility environment');
  if (contributions.vre > 0.20) parts.push('supportive regime dynamics');
  return parts.length > 0 
    ? `This opportunity is driven by ${parts.join(', ')}.`
    : 'Multiple converging factors support this opportunity.';
}

function identifyOERiskFactors(window: any): string[] {
  const risks: string[] = [];
  if (window.vre_regime === 'EXTREME') risks.push('Extreme volatility may cause rapid position changes');
  if (window.vre_regime === 'HIGH') risks.push('Elevated volatility increases slippage risk');
  if (window.risk_level > 0.7) risks.push('High risk level requires careful position sizing');
  if (window.expected_duration_hours < 6) risks.push('Short duration window requires rapid execution');
  if (window.metadata?.correlation_divergence > 0.5) risks.push('Correlation breakdown may lead to unexpected correlations');
  if (risks.length === 0) risks.push('Standard market risks apply');
  return risks;
}

function calculateOEExpectedReturnRange(window: any): [number, number] {
  const baseReturn = window.cos_score * 5;
  const volatilityMultiplier = window.vre_regime === 'EXTREME' ? 2.0 
    : window.vre_regime === 'HIGH' ? 1.5 
    : 1.0;
  const adjustedReturn = baseReturn * volatilityMultiplier;
  return [adjustedReturn * 0.6, adjustedReturn * 1.4];
}
