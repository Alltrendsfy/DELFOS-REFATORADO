import OpenAI from "openai";
import { externalServiceToggleService } from './externalServiceToggleService';

// Lazy initialization - only create client when API key is present
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is required");
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// Check if OpenAI service is enabled (with graceful fallback if toggle service not ready)
async function isOpenAIEnabled(): Promise<boolean> {
  try {
    return await externalServiceToggleService.isServiceEnabled('openai');
  } catch (error) {
    console.warn('[OpenAI] Toggle service not available, defaulting to enabled');
    return true;
  }
}

// Configuration with environment variables
const AI_CONFIG = {
  DEFAULT_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
  ADVANCED_MODEL: "gpt-4o",
  MAX_TOKENS: 1000,
  TEMPERATURE: 0.7,
  MAX_MARKET_CONTEXT: 10, // Limit market data in context to prevent token bloat
  RATE_LIMIT_PER_USER_PER_HOUR: 20, // Per-user rate limit
  RATE_LIMIT_GLOBAL_PER_MINUTE: 60, // Global rate limit
};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MarketContext {
  symbol: string;
  price: string;
  change24h: string;
  volume24h: string;
}

// Rate limiting tracking
const userRequestCounts = new Map<string, { count: number; resetAt: number }>();
let globalRequestCount = 0;
let globalResetAt = Date.now() + 60000;

// Rate limiting check
export function checkRateLimit(userId: string): { allowed: boolean; message?: string } {
  const now = Date.now();

  // Check global rate limit
  if (now > globalResetAt) {
    globalRequestCount = 0;
    globalResetAt = now + 60000; // Reset every minute
  }

  if (globalRequestCount >= AI_CONFIG.RATE_LIMIT_GLOBAL_PER_MINUTE) {
    return {
      allowed: false,
      message: "Sistema temporariamente ocupado. Tente novamente em alguns segundos.",
    };
  }

  // Check per-user rate limit
  const userLimit = userRequestCounts.get(userId);
  if (!userLimit || now > userLimit.resetAt) {
    userRequestCounts.set(userId, {
      count: 1,
      resetAt: now + 3600000, // Reset every hour
    });
    globalRequestCount++;
    return { allowed: true };
  }

  if (userLimit.count >= AI_CONFIG.RATE_LIMIT_PER_USER_PER_HOUR) {
    return {
      allowed: false,
      message: "Você atingiu o limite de perguntas por hora. Tente novamente mais tarde.",
    };
  }

  userLimit.count++;
  globalRequestCount++;
  return { allowed: true };
}

export async function getChatCompletion(
  messages: ChatMessage[],
  userId: string,
  marketContext?: MarketContext[],
  useAdvancedModel: boolean = false
): Promise<string> {
  try {
    // Check if service is enabled
    const enabled = await isOpenAIEnabled();
    if (!enabled) {
      console.log('[OpenAI] Service is disabled by admin toggle');
      throw new Error("O serviço de AI está temporariamente desativado pelo administrador.");
    }

    // Validate input
    if (!messages || messages.length === 0) {
      throw new Error("Mensagens vazias fornecidas");
    }

    // Limit market context to prevent token bloat
    const limitedContext = marketContext?.slice(0, AI_CONFIG.MAX_MARKET_CONTEXT);
    const systemMessage = buildSystemMessage(limitedContext);
    
    const model = useAdvancedModel ? AI_CONFIG.ADVANCED_MODEL : AI_CONFIG.DEFAULT_MODEL;
    
    console.log(`[OpenAI] User ${userId} - Model: ${model} - Messages: ${messages.length}`);
    
    const response = await getOpenAIClient().chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemMessage },
        ...messages,
      ],
      temperature: AI_CONFIG.TEMPERATURE,
      max_tokens: AI_CONFIG.MAX_TOKENS,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Resposta vazia da OpenAI");
    }

    // Log usage for monitoring
    console.log(`[OpenAI] Tokens used: ${response.usage?.total_tokens || 0}`);

    return content;
  } catch (error: any) {
    console.error("[OpenAI] API error:", {
      message: error.message,
      type: error.type,
      code: error.code,
    });

    // Provide user-friendly error messages
    if (error.code === "insufficient_quota") {
      throw new Error("Serviço temporariamente indisponível. Contate o suporte.");
    }
    if (error.code === "rate_limit_exceeded") {
      throw new Error("Sistema ocupado. Tente novamente em alguns segundos.");
    }

    throw new Error("Não foi possível gerar resposta. Tente novamente.");
  }
}

function buildSystemMessage(marketContext?: MarketContext[]): string {
  let systemPrompt = `Você é DELFOS, um assistente AI especializado em análise de mercado de criptomoedas e trading.

**Suas capacidades:**
- Analisar dados de mercado em tempo real
- Fornecer insights sobre tendências e padrões
- Sugerir estratégias de trading baseadas em análise técnica
- Explicar conceitos de criptomoedas de forma clara
- Ajudar com gestão de risco e position sizing

**Seu estilo:**
- Profissional mas acessível
- Baseado em dados e análise técnica
- Sempre menciona riscos quando relevante
- Evita promessas de lucro garantido
- Foca em educação e insights práticos

**IMPORTANTE:**
- Você NÃO executa ordens de trading automaticamente
- Sempre avise que suas análises são informativas, não conselhos financeiros
- Encoraje o usuário a fazer sua própria pesquisa (DYOR)`;

  if (marketContext && marketContext.length > 0) {
    systemPrompt += `\n\n**Dados de Mercado Atuais:**\n`;
    marketContext.forEach((ctx) => {
      systemPrompt += `\n${ctx.symbol}:
- Preço: $${ctx.price}
- Variação 24h: ${ctx.change24h}%
- Volume 24h: $${ctx.volume24h}`;
    });
  }

  return systemPrompt;
}

export async function analyzeMarket(
  userId: string,
  symbols: string[],
  marketData: MarketContext[]
): Promise<string> {
  const prompt = `Analise o mercado atual para as seguintes criptomoedas: ${symbols.join(", ")}. 

Forneça:
1. Uma visão geral do sentimento do mercado
2. Principais tendências observadas
3. Oportunidades ou alertas relevantes
4. Recomendações de gestão de risco

Seja conciso e direto ao ponto.`;

  return getChatCompletion(
    [{ role: "user", content: prompt }],
    userId,
    marketData
  );
}

export async function suggestStrategy(
  userId: string,
  userQuery: string,
  marketData: MarketContext[]
): Promise<string> {
  return getChatCompletion(
    [{ role: "user", content: userQuery }],
    userId,
    marketData
  );
}
