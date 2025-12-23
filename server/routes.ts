import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import bcryptjs from "bcryptjs";
import cookieParser from "cookie-parser";
import { db } from "./db";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerRBMRoutes } from "./routes/rbmRoutes";
import { getChatCompletion, checkRateLimit, analyzeMarket, type MarketContext, type ChatMessage } from "./services/openaiService";
import { analyzeRankings, analyzeClusters, suggestTradingStrategy, analyzeRiskProfile, suggestCampaignRisk, type CampaignContext } from "./services/ai/aiAnalysisService";
import { campaignPatternLearnerService } from "./services/ai/campaignPatternLearnerService";
import { opportunityLearnerService } from "./services/ai/opportunityLearnerService";
import { performanceService } from "./services/performanceService";
import { TradingService } from "./services/tradingService";
import { RiskService } from "./services/riskService";
import { rebalanceService } from "./services/rebalance/rebalanceService";
import { CircuitBreakerService } from "./services/circuitBreakerService";
import { OrderExecutionService } from "./services/orderExecutionService";
import { TwitterService } from "./services/twitterService";
import { SignalEngine } from "./services/signalEngine";
import { indicatorService } from "./services/market/indicatorService";
import { dataIngestionService } from "./services/dataIngestionService";
import { observabilityService } from "./services/observabilityService";
import { dataRetentionService } from "./services/dataRetentionService";
import { clockSyncService } from "./services/clockSyncService";
import { keyRotationService } from "./services/keyRotationService";
import { assetSelectorService } from "./services/assetSelectorService";
import { stalenessGuardService } from "./services/stalenessGuardService";
import { campaignManagerService } from "./services/trading/campaignManagerService";
import { adminMonitorService } from "./services/adminMonitorService";
import type { Symbol } from "@shared/schema";
import { 
  insertOrderSchema, 
  insertDecisionLogSchema, 
  insertCampaignSchema, 
  insertClusterSchema,
  insertPortfolioSchema,
  insertAlertSchema,
  insertRiskParametersSchema,
  insertPositionSchema,
  insertAIConversationSchema,
  signals as signalsTable,
  signal_configs as signalConfigsTable,
  symbol_rankings,
  symbols,
  campaigns,
  robot_activity_logs,
  portfolios,
  clusters,
  campaign_risk_states,
  campaign_orders,
  campaign_positions,
  users,
  franchise_plans,
  franchise_leads,
  franchises,
  franchise_users,
  opportunity_blueprints,
  learning_runs,
  franchisor_settings,
  contract_templates,
  contract_acceptances,
  persona_credentials,
  persona_sessions,
  insertContractTemplateSchema,
  insertFranchisorSettingsSchema,
  franchisor_users,
} from "@shared/schema";
import { z } from "zod";
import { eq, and, desc, sql, inArray, count, or } from "drizzle-orm";

// Custom Zod schemas for non-DB endpoints
const krakenCredentialsSchema = z.object({
  apiKey: z.string().min(1, "API Key is required"),
  apiSecret: z.string().min(1, "API Secret is required"),
});

const betaCodeSchema = z.object({
  code: z.string().min(1, "Invite code is required").max(20, "Code too long"),
});

const aiChatSchema = z.object({
  message: z.string().min(1, "Message is required"),
  useAdvancedModel: z.boolean().optional().default(false),
});

const openPositionSchema = z.object({
  portfolioId: z.string().uuid("Invalid portfolio ID"),
  symbol: z.string().min(1, "Symbol is required"),
  side: z.enum(["long", "short"], { errorMap: () => ({ message: "Side must be long or short" }) }),
  quantity: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Quantity must be positive"),
  stopLoss: z.string().optional(),
  takeProfit: z.string().optional(),
});

const updateOrderStatusSchema = z.object({
  status: z.string().min(1, "Status is required"),
  filled_quantity: z.string().optional(),
  average_fill_price: z.string().optional(),
});

const updateCampaignEquitySchema = z.object({
  current_equity: z.string().refine((val) => !isNaN(parseFloat(val)), "Invalid equity value"),
});

const updateClusterPnLSchema = z.object({
  daily_pnl: z.string().refine((val) => !isNaN(parseFloat(val)), "Invalid PnL value"),
});

const executeOrderSchema = z.object({
  portfolioId: z.string().uuid("Invalid portfolio ID"),
  symbol: z.string().min(1, "Symbol is required"),
  side: z.enum(["buy", "sell"], { errorMap: () => ({ message: "Side must be buy or sell" }) }),
  type: z.enum(["market", "limit", "stop_loss", "take_profit"], { errorMap: () => ({ message: "Invalid order type" }) }),
  quantity: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Quantity must be positive"),
  price: z.string().optional(),
  stopPrice: z.string().optional(),
});

const resetAssetBreakerSchema = z.object({
  portfolioId: z.string().uuid("Invalid portfolio ID"),
  symbol: z.string().min(1, "Symbol is required"),
});

const resetClusterBreakerSchema = z.object({
  portfolioId: z.string().uuid("Invalid portfolio ID"),
  clusterNumber: z.number().int().nonnegative("Cluster number must be non-negative"),
});

const executeRebalanceSchema = z.object({
  dryRun: z.coerce.boolean().optional().default(false),
});

const updateAssetFiltersSchema = z.object({
  min_volume_24h_usd: z.string().optional(),
  max_spread_mid_pct: z.string().optional(),
  min_depth_top10_usd: z.string().optional(),
  min_atr_daily_pct: z.string().optional(),
  max_atr_daily_pct: z.string().optional(),
  target_assets_count: z.number().int().positive().optional(),
  num_clusters: z.number().int().positive().min(2).max(10).optional(),
});

//  Schema for trading signals scan
const marketDataItemSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  price: z.number().positive("Price must be positive"),
  ema12: z.number().positive("EMA12 must be positive"),
  ema36: z.number().positive("EMA36 must be positive"),
  atr: z.number().positive("ATR must be positive"),
});

const signalsScanSchema = z.object({
  portfolioId: z.string().uuid("Invalid portfolio ID"),
  marketData: z.array(marketDataItemSchema).min(1, "Market data cannot be empty").max(100, "Maximum 100 symbols per scan"),
});

// Maximum allowed limit for query results (prevent memory exhaustion)
const MAX_QUERY_LIMIT = 10000;

// Market metrics schemas
const marketMetricsSchema = z.object({
  symbols: z.array(
    z.string()
      .min(1, "Symbol cannot be empty")
      .transform(s => s.trim().toUpperCase())
      .refine(s => /^([A-Z]+:)?[A-Z0-9\/\-_]+$/.test(s), "Invalid symbol format")
  )
  .min(1, "At least one symbol required")
  .max(MAX_QUERY_LIMIT, `Maximum ${MAX_QUERY_LIMIT} symbols allowed`)
  .transform(symbols => Array.from(new Set(symbols))) // Deduplicate
});

const marketMetricItemSchema = z.object({
  symbol: z.string(),
  price: z.number().nullable(),
  ema12: z.number().nullable(),
  ema36: z.number().nullable(),
  atr: z.number().nullable(),
  updatedAt: z.string(),
});

export type MarketMetricItem = z.infer<typeof marketMetricItemSchema>;

// Symbol cache for fast lookups
let symbolsCache: Map<string, Symbol> | null = null;

// Add slash to exchange symbol format (e.g., "XBTUSD" → "XBT/USD")
// Also handles symbols that already have slash (e.g., "XBT/USD" → "XBT/USD")
function addSlashToExchangeSymbol(exchangeSymbol: string): string | null {
  // If already has slash, return as-is
  if (exchangeSymbol.includes('/')) {
    return exchangeSymbol;
  }
  
  // Otherwise, add slash manually
  // List of known quote currencies (most common first for performance)
  const quoteCurrencies = ['USD', 'EUR', 'USDT', 'BTC', 'ETH', 'USDC', 'GBP', 'JPY'];
  
  for (const quote of quoteCurrencies) {
    if (exchangeSymbol.endsWith(quote)) {
      const base = exchangeSymbol.slice(0, -quote.length);
      if (base.length > 0) {
        return `${base}/${quote}`;
      }
    }
  }
  
  // Fallback: couldn't determine format, return null
  console.warn(`[Market Metrics] Could not parse exchange symbol: ${exchangeSymbol}`);
  return null;
}

async function getSymbolsCache(): Promise<Map<string, Symbol>> {
  if (!symbolsCache) {
    const symbols = await storage.getAllSymbols();
    symbolsCache = new Map();
    
    // Index by BOTH symbol AND exchange_symbol for flexible lookup
    for (const s of symbols) {
      symbolsCache.set(s.symbol, s); // Index by DELFOS format (e.g., "BTC/USD")
      
      if (s.exchange_symbol) {
        const withSlash = addSlashToExchangeSymbol(s.exchange_symbol);
        if (withSlash && withSlash !== s.symbol) {
          symbolsCache.set(withSlash, s); // Index by Kraken format (e.g., "XBT/USD")
        }
      }
    }
    
    console.log(`[Market Metrics] Loaded ${symbols.length} symbols, ${symbolsCache.size} cache entries`);
  }
  return symbolsCache;
}

// Fetch market metrics for given symbols
async function fetchMarketMetrics(symbolStrings: string[]): Promise<{ metrics: MarketMetricItem[]; unknownSymbols: string[] }> {
  const cache = await getSymbolsCache();
  console.log(`[Market Metrics] Processing ${symbolStrings.length} symbols, cache has ${cache.size} entries`);
  
  // Track original symbol → normalized symbol → Symbol object
  const symbolMap = new Map<string, { normalized: string; symbolObj: Symbol | null }>();
  
  for (const originalSymbol of symbolStrings) {
    // Direct lookup without normalization - rely on dual-index cache
    const symbolObj = cache.get(originalSymbol);
    console.log(`[Market Metrics] Lookup: "${originalSymbol}" → ${symbolObj ? 'FOUND' : 'NOT FOUND'}`);
    
    // Sanity check: verify exchange_id is a string (should be "kraken", not UUID)
    if (symbolObj && typeof symbolObj.exchange_id !== 'string') {
      console.error(`[Market Metrics] Invalid exchange_id type for ${originalSymbol}: ${typeof symbolObj.exchange_id}`);
    }
    
    symbolMap.set(originalSymbol, { normalized: originalSymbol, symbolObj: symbolObj || null });
  }
  
  // Separate known and unknown symbols
  const unknownSymbols: string[] = [];
  const validEntries: Array<{ original: string; symbolObj: Symbol }> = [];
  
  for (const [originalSymbol, { symbolObj }] of Array.from(symbolMap.entries())) {
    if (!symbolObj) {
      unknownSymbols.push(originalSymbol);
    } else {
      validEntries.push({ original: originalSymbol, symbolObj });
    }
  }
  
  if (unknownSymbols.length > 0) {
    // Refresh cache once in case symbols were added
    symbolsCache = null;
    const refreshedCache = await getSymbolsCache();
    
    // Re-check unknown symbols (direct lookup, no normalization)
    const stillUnknown: string[] = [];
    for (const originalSymbol of unknownSymbols) {
      const symbolObj = refreshedCache.get(originalSymbol);
      
      if (!symbolObj) {
        stillUnknown.push(originalSymbol);
      } else {
        // Update symbolMap with found symbol
        symbolMap.set(originalSymbol, { normalized: originalSymbol, symbolObj });
        validEntries.push({ original: originalSymbol, symbolObj });
      }
    }
    
    // Update unknownSymbols list
    unknownSymbols.length = 0;
    unknownSymbols.push(...stillUnknown);
    
    // Warn about unknown symbols
    if (unknownSymbols.length > 0) {
      console.warn(`[Market Metrics] Unknown symbols: ${unknownSymbols.join(', ')}`);
    }
  }
  
  // Fetch latest prices and indicators in parallel
  const metricsPromises = validEntries.map(async ({ original, symbolObj }) => {
    try {
      // Parallel fetch: latest tick + indicators
      // Use exchange_id (string "kraken") + exchange_symbol ("XBTUSD") for data services
      const [recentTicks, indicators] = await Promise.all([
        dataIngestionService.getRecentTicks(symbolObj.exchange_id, symbolObj.exchange_symbol, 1),
        indicatorService.calculateIndicators(symbolObj)
      ]);
      
      // Get latest price from tick, or fallback to bars_1m
      let price: number | null = null;
      
      if (recentTicks && recentTicks.length > 0) {
        price = typeof recentTicks[0].price === 'string' 
          ? parseFloat(recentTicks[0].price) 
          : recentTicks[0].price; // Handle string or number
      } else {
        // Fallback to last 1m bar
        const now = new Date();
        const startTime = new Date(now.getTime() - 60000); // 1 minute ago
        const bars = await storage.getBars1m(symbolObj.exchange_id, symbolObj.exchange_symbol, startTime, now, 1);
        if (bars && bars.length > 0) {
          price = parseFloat(bars[0].close);
        } else {
          console.warn(`[Market Metrics] No tick or bar data for ${symbolObj.symbol}`);
        }
      }
      
      return {
        symbol: original, // Return original symbol frontend sent (e.g., "XBT/USD")
        price,
        ema12: indicators.ema12,
        ema36: indicators.ema36,
        atr: indicators.atr14, // Rename atr14 → atr for frontend
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[Market Metrics] Error fetching data for ${symbolObj.symbol}:`, error);
      // Return partial data with nulls
      return {
        symbol: original, // Return original symbol frontend sent
        price: null,
        ema12: null,
        ema36: null,
        atr: null,
        updatedAt: new Date().toISOString(),
      };
    }
  });
  
  const metrics = await Promise.all(metricsPromises);
  
  return { metrics, unknownSymbols };
}

// Helper function to validate query limit parameters
function validateQueryLimit(limit: unknown): number | undefined {
  if (!limit) return undefined;
  
  const num = Number(limit);
  if (!Number.isInteger(num) || !Number.isSafeInteger(num) || num <= 0 || num > MAX_QUERY_LIMIT) {
    throw new Error(`Invalid limit parameter (must be a positive integer ≤ ${MAX_QUERY_LIMIT})`);
  }
  
  return num;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup cookie parser middleware for persona authentication sessions
  app.use(cookieParser());
  
  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);
  registerRBMRoutes(app);

  // Public diagnostic/test endpoints (before auth middleware)
  app.get('/api/test/simple', async (req, res) => {
    console.log('[TEST] Simple test endpoint hit');
    res.json({ status: 'ok', message: 'Simple endpoint works' });
  });

  app.get('/api/test/redis-l2', async (req, res) => {
    console.log('[TEST] Redis L2 diagnostic endpoint hit');
    try {
      const { Redis } = await import('@upstash/redis');
      console.log('[TEST] Redis imported, creating client');
      const redis = Redis.fromEnv();
      console.log('[TEST] Redis client created');
      
      const testSymbol = 'ETH/USD';
      const bidsKey = `market:l2:bids:kraken:${testSymbol}`;
      const asksKey = `market:l2:asks:kraken:${testSymbol}`;
      
      console.log(`[TEST] Checking Redis keys: ${bidsKey}, ${asksKey}`);
      console.log('[TEST] Calling redis.exists for bids...');
      const bidsExists = await redis.exists(bidsKey);
      console.log(`[TEST] bidsExists result: ${bidsExists}`);
      
      console.log('[TEST] Calling redis.exists for asks...');
      const asksExists = await redis.exists(asksKey);
      console.log(`[TEST] asksExists result: ${asksExists}`);
      
      console.log('[TEST] Calling zrange for bids...');
      const bidsSample = await redis.zrange(bidsKey, 0, 2, { rev: true, withScores: true });
      console.log(`[TEST] bidsSample result:`, bidsSample);
      
      console.log('[TEST] Calling zrange for asks...');
      const asksSample = await redis.zrange(asksKey, 0, 2, { withScores: true });
      console.log(`[TEST] asksSample result:`, asksSample);
      
      console.log('[TEST] Sending response...');
      res.json({
        status: 'ok',
        symbol: testSymbol,
        bidsKey,
        asksKey,
        bidsExists: bidsExists === 1,
        asksExists: asksExists === 1,
        bidsSample,
        asksSample
      });
      console.log('[TEST] Response sent successfully');
    } catch (error) {
      console.error('[TEST] Error in Redis L2 diagnostic:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/orderbook/l2/*', async (req, res) => {
    try {
      const params = req.params as { '0': string };
      console.log('[L2 Endpoint] Request received:', params[0]);
      const pathParts = params[0].split('/');
      if (pathParts.length !== 2) {
        console.log('[L2 Endpoint] Invalid format:', pathParts);
        return res.status(400).json({ 
          message: "Invalid symbol format. Use: /api/orderbook/l2/BASE/QUOTE (e.g., /api/orderbook/l2/ETH/USD)" 
        });
      }
      
      const [base, quote] = pathParts;
      const userSymbol = `${base}/${quote}`;
      const krakenSymbol = userSymbol.replace('BTC/', 'XBT/');
      console.log(`[L2 Endpoint] Querying Redis: user="${userSymbol}", kraken="${krakenSymbol}"`);
      
      const { dataIngestionService } = await import('./services/dataIngestionService');
      const orderBook = await dataIngestionService.getL2OrderBook('kraken', krakenSymbol);
      
      console.log(`[L2 Endpoint] Redis result: ${orderBook.bids.length} bids, ${orderBook.asks.length} asks`);
      
      if (!orderBook.bids.length && !orderBook.asks.length) {
        console.log(`[L2 Endpoint] 404: No data for ${krakenSymbol}`);
        return res.status(404).json({ 
          message: "No order book data available",
          symbol: userSymbol,
          krakenSymbol,
          hint: "Data may not be available yet or symbol might be unsupported"
        });
      }
      
      console.log(`[L2 Endpoint] 200: Returning ${orderBook.bids.length} bids, ${orderBook.asks.length} asks`);
      res.json({
        symbol: userSymbol,
        krakenSymbol,
        exchange: 'kraken',
        depth: 10,
        bids: orderBook.bids,
        asks: orderBook.asks,
        timestamp: Date.now(),
        source: 'redis'
      });
    } catch (error) {
      console.error("[L2 Endpoint] Error:", error);
      res.status(500).json({ message: "Failed to fetch L2 order book", error: String(error) });
    }
  });

  // Setup Replit Auth
  await setupAuth(app);

  // Seed franchisor users (create if not exists)
  try {
    const existingFranchisor = await db.select().from(franchisor_users).where(eq(franchisor_users.email, 'itopaiva@hotmail.com')).limit(1);
    if (existingFranchisor.length === 0) {
      const passwordHash = await bcryptjs.hash('123456', 10);
      await db.insert(franchisor_users).values({
        email: 'itopaiva@hotmail.com',
        password_hash: passwordHash,
        name: 'RODERICO PAIXÃO LIMA',
        cpf_cnpj: '343.915.413-00',
        phone: '99-98214-8668',
        role_title: 'SÓCIO PROPRIETÁRIO',
        is_active: true,
      });
      console.log('✅ Franchisor user seeded: itopaiva@hotmail.com / 123456');
      console.log('   Nome: RODERICO PAIXÃO LIMA');
      console.log('   CPF: 343.915.413-00');
      console.log('   Telefone: 99-98214-8668');
      console.log('   Cargo: SÓCIO PROPRIETÁRIO');
    }
  } catch (error) {
    console.log('[Seed] Franchisor users table may not exist yet or seed failed (this is OK on first run)');
  }

  // Auth route - get current user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Auth debug endpoint - diagnose session state for multi-user troubleshooting
  app.get('/api/auth/debug', async (req: any, res) => {
    const sessionExists = !!req.session;
    const userExists = !!req.user;
    const hasSessionId = !!req.sessionID;
    
    // Debug info (safe to expose - no secrets)
    const debugInfo = {
      timestamp: new Date().toISOString(),
      host: req.hostname,
      origin: req.get('origin') || 'none',
      sessionExists,
      sessionId: hasSessionId ? req.sessionID?.substring(0, 8) + '...' : null,
      userExists,
      userId: req.user?.claims?.sub || null,
      userEmail: req.user?.claims?.email || null,
      isAuthenticated: req.isAuthenticated?.() || false,
      cookiesReceived: Object.keys(req.cookies || {}).length > 0,
      hasConnectSid: !!req.cookies?.['connect.sid'],
    };
    
    console.log(`[AUTH DEBUG] Session diagnostic | Host: ${req.hostname} | User: ${debugInfo.userId || 'none'} | Authenticated: ${debugInfo.isAuthenticated}`);
    
    res.json(debugInfo);
  });

  // Portfolio routes
  app.get('/api/portfolios', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const portfolios = await storage.getPortfoliosByUserId(userId);
      res.json(portfolios);
    } catch (error) {
      console.error("Error fetching portfolios:", error);
      res.status(500).json({ message: "Failed to fetch portfolios" });
    }
  });

  // Risk profiles route - get all predefined risk profiles (C/M/A)
  app.get('/api/risk-profiles', isAuthenticated, async (req: any, res) => {
    try {
      const profiles = await storage.getRiskProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching risk profiles:", error);
      res.status(500).json({ message: "Failed to fetch risk profiles" });
    }
  });

  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all user's portfolios
      const portfolios = await storage.getPortfoliosByUserId(userId);
      
      // Calculate total portfolio value
      const portfolioValue = portfolios.reduce((sum, p) => 
        sum + parseFloat(p.total_value_usd || '0'), 0
      );
      
      // Fetch positions and trades concurrently for all portfolios (performance optimization)
      const [positionsArrays, tradesArrays] = await Promise.all([
        Promise.all(portfolios.map(p => storage.getPositionsByPortfolioId(p.id))),
        Promise.all(portfolios.map(p => storage.getTradesByPortfolioId(p.id)))
      ]);
      
      // Calculate unrealized PnL from all positions
      const allPositions = positionsArrays.flat();
      const unrealizedPnL = allPositions.reduce((sum, pos) => 
        sum + parseFloat(pos.unrealized_pnl || '0'), 0
      );
      
      // Calculate realized PnL from today's trades
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const allTrades = tradesArrays.flat();
      const todayTrades = allTrades.filter(t => {
        const closedAt = new Date(t.closed_at);
        return closedAt >= today;
      });
      
      const realizedPnL = todayTrades.reduce((sum, trade) => 
        sum + parseFloat(trade.realized_pnl || '0'), 0
      );
      
      // Calculate total daily P&L
      const dailyPnL = unrealizedPnL + realizedPnL;
      
      // Calculate daily P&L percentage
      const dailyPnLPercentage = portfolioValue > 0 
        ? (dailyPnL / portfolioValue) * 100 
        : 0;
      
      // Get active campaigns count (exclude soft-deleted campaigns)
      const activeCampaigns = await db.select()
        .from(campaigns)
        .where(and(
          eq(campaigns.status, 'running'),
          eq(campaigns.is_deleted, false),
          inArray(campaigns.portfolio_id, portfolios.map(p => p.id))
        ));
      
      // Count open positions (positions table only contains open positions)
      const openPositionsCount = allPositions.length;
      
      res.json({
        portfolio_value: portfolioValue.toFixed(2),
        daily_pnl: dailyPnL.toFixed(2),
        daily_pnl_percentage: dailyPnLPercentage.toFixed(2),
        unrealized_pnl: unrealizedPnL.toFixed(2),
        realized_pnl: realizedPnL.toFixed(2),
        active_campaigns: activeCampaigns.length,
        open_positions: openPositionsCount,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Enhanced dashboard stats with opportunities, system health, and Kraken balance
  app.get('/api/dashboard/enhanced-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get opportunity blueprints count
      const activeBlueprints = await db.select({ count: count() })
        .from(opportunity_blueprints)
        .where(and(
          eq(opportunity_blueprints.user_id, userId),
          eq(opportunity_blueprints.status, 'ACTIVE')
        ));
      
      const pendingBlueprints = await db.select()
        .from(opportunity_blueprints)
        .where(and(
          eq(opportunity_blueprints.user_id, userId),
          eq(opportunity_blueprints.status, 'ACTIVE')
        ))
        .orderBy(desc(opportunity_blueprints.created_at))
        .limit(5);
      
      // Get staleness and system health status
      const stalenessLevel = stalenessGuardService.getGlobalStalenessLevel();
      const quarantineStatus = stalenessGuardService.getQuarantineStatus();
      
      // Determine system health
      let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
      let systemAlerts: string[] = [];
      
      if (stalenessLevel === 'kill_switch' || stalenessLevel === 'hard') {
        systemHealth = 'critical';
        systemAlerts.push('Dados de mercado atrasados - trading pausado');
      } else if (stalenessLevel === 'warn') {
        systemHealth = 'warning';
        systemAlerts.push('Alguns dados de mercado com atraso');
      }
      
      const quarantinedCount = quarantineStatus.quarantinedSymbols?.length || 0;
      const activeSymbolsCount = quarantineStatus.activeSymbols || 0;
      
      if (quarantinedCount > 10) {
        if (systemHealth === 'healthy') systemHealth = 'warning';
        systemAlerts.push(`${quarantinedCount} símbolos em quarentena`);
      }
      
      // Get Kraken balance if user has credentials
      let krakenBalance = null;
      try {
        const userSettings = await storage.getUserSettings(userId);
        if (userSettings?.kraken_api_key && userSettings?.kraken_api_secret) {
          const { krakenService } = await import('./services/krakenService');
          const balance = await krakenService.getBalance(userId);
          if (balance) {
            const zusdBalance = parseFloat(balance['ZUSD'] || '0');
            const usdtBalance = parseFloat(balance['USDT'] || '0');
            krakenBalance = {
              zusd: zusdBalance.toFixed(2),
              usdt: usdtBalance.toFixed(2),
              total_available: zusdBalance.toFixed(2), // ZUSD is the usable one for spot
              has_credentials: true
            };
          }
        }
      } catch (err) {
        // Kraken balance fetch failed - not critical
        krakenBalance = { has_credentials: false };
      }
      
      // Get recent signals from robot activities
      const portfolios = await storage.getPortfoliosByUserId(userId);
      const portfolioIds = portfolios.map(p => p.id);
      
      let recentSignals: any[] = [];
      if (portfolioIds.length > 0) {
        const userCampaigns = await db.select()
          .from(campaigns)
          .where(and(
            inArray(campaigns.portfolio_id, portfolioIds),
            eq(campaigns.is_deleted, false)
          ));
        
        const campaignIds = userCampaigns.map(c => c.id);
        
        if (campaignIds.length > 0) {
          const signalActivities = await db.select()
            .from(robot_activity_logs)
            .where(and(
              inArray(robot_activity_logs.campaign_id, campaignIds),
              inArray(robot_activity_logs.event_type, ['signal_generated', 'position_open', 'position_close'])
            ))
            .orderBy(desc(robot_activity_logs.created_at))
            .limit(5);
          
          recentSignals = signalActivities.map(a => ({
            id: a.id,
            type: a.event_type,
            symbol: a.symbol,
            severity: a.severity,
            timestamp: a.created_at
          }));
        }
      }
      
      res.json({
        opportunities: {
          active_count: activeBlueprints[0]?.count || 0,
          recent: pendingBlueprints.map(b => ({
            id: b.id,
            type: b.type,
            score: b.opportunity_score,
            assets: b.assets,
            expires_at: b.expires_at
          }))
        },
        system_health: {
          status: systemHealth,
          staleness_level: stalenessLevel,
          active_symbols: activeSymbolsCount,
          quarantined_symbols: quarantinedCount,
          alerts: systemAlerts
        },
        kraken_balance: krakenBalance,
        recent_signals: recentSignals
      });
    } catch (error) {
      console.error("Error fetching enhanced dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch enhanced dashboard stats" });
    }
  });

  // Recent robot activities for dashboard
  app.get('/api/robot-activities/recent', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user portfolios to filter campaigns
      const portfolios = await storage.getPortfoliosByUserId(userId);
      const portfolioIds = portfolios.map(p => p.id);
      
      if (portfolioIds.length === 0) {
        return res.json([]);
      }
      
      // Get campaigns for user's portfolios (exclude soft-deleted)
      const userCampaigns = await db.select()
        .from(campaigns)
        .where(and(
          inArray(campaigns.portfolio_id, portfolioIds),
          eq(campaigns.is_deleted, false)
        ));
      
      const campaignIds = userCampaigns.map(c => c.id);
      
      if (campaignIds.length === 0) {
        return res.json([]);
      }
      
      // Get recent activities from user's campaigns
      const activities = await db.select()
        .from(robot_activity_logs)
        .where(inArray(robot_activity_logs.campaign_id, campaignIds))
        .orderBy(desc(robot_activity_logs.created_at))
        .limit(20);
      
      res.json(activities);
    } catch (error) {
      console.error("Error fetching robot activities:", error);
      res.status(500).json({ message: "Failed to fetch robot activities" });
    }
  });

  // Market Brief endpoint for Campaign Wizard - aggregates market conditions
  app.get('/api/dashboard/market-brief', isAuthenticated, async (req: any, res) => {
    try {
      // Get staleness status
      const stalenessLevel = stalenessGuardService.getGlobalStalenessLevel();
      const quarantineStatus = stalenessGuardService.getQuarantineStatus();
      
      // Get latest asset rankings to determine active symbols
      const latestRankings = await db.select()
        .from(symbol_rankings)
        .orderBy(desc(symbol_rankings.created_at))
        .limit(100);
      
      const activeSymbolsCount = latestRankings.length;
      const quarantinedCount = quarantineStatus.quarantinedSymbols?.length || 0;
      
      // Determine market status based on staleness
      let marketStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      let statusMessage = 'Market data is fresh and trading conditions are normal';
      
      if (stalenessLevel === 'kill_switch') {
        marketStatus = 'critical';
        statusMessage = 'Market data is severely delayed - trading is paused for safety';
      } else if (stalenessLevel === 'hard') {
        marketStatus = 'critical';
        statusMessage = 'Market data is delayed - new positions are blocked';
      } else if (stalenessLevel === 'warn') {
        marketStatus = 'warning';
        statusMessage = 'Some market data is slightly delayed - proceed with caution';
      } else if (quarantinedCount > 10) {
        marketStatus = 'warning';
        statusMessage = `${quarantinedCount} symbols are temporarily unavailable`;
      }
      
      // Calculate average volatility from recent rankings
      let avgVolatility = 2.5; // Default moderate volatility
      if (latestRankings.length > 0) {
        const volatilityScores = latestRankings
          .filter((r: any) => r.score !== null)
          .map((r: any) => parseFloat(r.score || '0'));
        if (volatilityScores.length > 0) {
          avgVolatility = volatilityScores.reduce((a: number, b: number) => a + b, 0) / volatilityScores.length;
        }
      }
      
      // Determine volatility level
      let volatilityLevel: 'low' | 'moderate' | 'high' = 'moderate';
      if (avgVolatility < 1) volatilityLevel = 'low';
      else if (avgVolatility > 4) volatilityLevel = 'high';
      
      // Get recommended drawdown based on volatility
      let recommendedMaxDrawdown = 10;
      if (volatilityLevel === 'high') recommendedMaxDrawdown = 8;
      else if (volatilityLevel === 'low') recommendedMaxDrawdown = 12;
      
      res.json({
        timestamp: new Date().toISOString(),
        marketStatus,
        statusMessage,
        stalenessLevel,
        activeSymbols: activeSymbolsCount,
        quarantinedSymbols: quarantinedCount,
        volatility: {
          level: volatilityLevel,
          avgScore: avgVolatility.toFixed(2),
        },
        tradingRecommendation: {
          canStartCampaign: marketStatus !== 'critical',
          recommendedMaxDrawdown,
          warningMessages: marketStatus === 'warning' ? [statusMessage] : [],
        },
      });
    } catch (error) {
      console.error("Error fetching market brief:", error);
      res.status(500).json({ message: "Failed to fetch market brief" });
    }
  });

  // Risk current volatility endpoint for Campaign Wizard
  app.get('/api/risk/current-volatility', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's portfolios to check circuit breaker status
      const portfolios = await storage.getPortfoliosByUserId(userId);
      
      // Check circuit breakers status
      let breakersActive = 0;
      let breakersTriggered: string[] = [];
      
      for (const portfolio of portfolios) {
        const riskParams = await storage.getRiskParametersByPortfolioId(portfolio.id);
        if (riskParams?.circuit_breaker_triggered) {
          breakersActive++;
          breakersTriggered.push(portfolio.name);
        }
      }
      
      // Get staleness status
      const stalenessLevel = stalenessGuardService.getGlobalStalenessLevel();
      
      // Calculate market risk level
      let riskLevel: 'low' | 'moderate' | 'high' | 'extreme' = 'moderate';
      let riskScore = 50; // 0-100 scale
      
      if (stalenessLevel === 'kill_switch' || stalenessLevel === 'hard') {
        riskLevel = 'extreme';
        riskScore = 95;
      } else if (breakersActive > 0) {
        riskLevel = 'high';
        riskScore = 75;
      } else if (stalenessLevel === 'warn') {
        riskLevel = 'moderate';
        riskScore = 55;
      } else {
        riskLevel = 'low';
        riskScore = 30;
      }
      
      // Risk-adjusted drawdown recommendations
      const recommendations = {
        conservative: { maxDrawdown: 5, description: 'Very protective - for beginners or uncertain markets' },
        moderate: { maxDrawdown: 10, description: 'Balanced approach - recommended for most traders' },
        aggressive: { maxDrawdown: 15, description: 'Higher risk tolerance - for experienced traders' },
      };
      
      // Adjust recommendations based on current risk
      if (riskLevel === 'high' || riskLevel === 'extreme') {
        recommendations.conservative.maxDrawdown = 3;
        recommendations.moderate.maxDrawdown = 7;
        recommendations.aggressive.maxDrawdown = 10;
      }
      
      res.json({
        timestamp: new Date().toISOString(),
        riskLevel,
        riskScore,
        circuitBreakers: {
          active: breakersActive,
          triggeredPortfolios: breakersTriggered,
        },
        stalenessLevel,
        recommendations,
        warning: riskLevel === 'extreme' 
          ? 'Market conditions are very unstable. Consider waiting before starting a new campaign.'
          : null,
      });
    } catch (error) {
      console.error("Error fetching current volatility:", error);
      res.status(500).json({ message: "Failed to fetch volatility data" });
    }
  });

  // Recommended assets endpoint for Campaign Wizard
  app.get('/api/asset-selection/recommended', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get latest rankings with cluster info
      const latestRankings = await db.select()
        .from(symbol_rankings)
        .orderBy(desc(symbol_rankings.created_at))
        .limit(50);
      
      if (latestRankings.length === 0) {
        return res.json({
          hasSelection: false,
          message: 'No asset selection has been run yet. The system will automatically select the best assets when you start a campaign.',
          assets: [],
          clusters: [],
        });
      }
      
      // Group by cluster
      const clusterMap = new Map<number, any[]>();
      for (const ranking of latestRankings) {
        const cluster = ranking.cluster_number || 0;
        if (!clusterMap.has(cluster)) {
          clusterMap.set(cluster, []);
        }
        clusterMap.get(cluster)!.push(ranking);
      }
      
      // Get symbol details
      const symbolIds = latestRankings.map((r: any) => r.symbol_id);
      const symbolDetails = await db.select()
        .from(symbols)
        .where(sql`${symbols.id} IN (${sql.join(symbolIds.map(id => sql`${id}`), sql`, `)})`);
      
      const symbolMap = new Map(symbolDetails.map((s: any) => [s.id, s]));
      
      // Build cluster summaries with simple explanations
      const clusterDescriptions = [
        'High volume, stable assets - great for consistent trading',
        'Growth potential assets - higher volatility but more opportunities',
        'Emerging assets - newer but showing promise',
        'Defensive assets - lower volatility for capital protection',
        'Speculative assets - high risk, high reward potential',
      ];
      
      const clusters = Array.from(clusterMap.entries()).map(([clusterNum, rankings], idx) => {
        const clusterAssets = rankings.map((r: any) => {
          const sym = symbolMap.get(r.symbol_id);
          return {
            symbol: sym?.symbol || 'Unknown',
            rank: r.rank,
            score: parseFloat(r.score || '0').toFixed(2),
          };
        }).sort((a: any, b: any) => a.rank - b.rank);
        
        return {
          clusterNumber: clusterNum,
          name: `Cluster ${clusterNum + 1}`,
          description: clusterDescriptions[idx % clusterDescriptions.length],
          assetCount: clusterAssets.length,
          topAssets: clusterAssets.slice(0, 5),
        };
      });
      
      // Top assets overall
      const topAssets = latestRankings
        .slice(0, 10)
        .map((r: any) => {
          const sym = symbolMap.get(r.symbol_id);
          return {
            symbol: sym?.symbol || 'Unknown',
            exchangeSymbol: sym?.exchange_symbol || 'Unknown',
            rank: r.rank,
            score: parseFloat(r.score || '0').toFixed(2),
            cluster: r.cluster_number,
          };
        });
      
      res.json({
        hasSelection: true,
        lastUpdated: latestRankings[0]?.created_at || new Date().toISOString(),
        totalAssets: latestRankings.length,
        clusters,
        topAssets,
        explanation: `We've analyzed ${latestRankings.length} cryptocurrency pairs and grouped them into ${clusters.length} clusters based on their trading characteristics. The system will automatically diversify your campaign across these groups.`,
      });
    } catch (error) {
      console.error("Error fetching recommended assets:", error);
      res.status(500).json({ message: "Failed to fetch recommended assets" });
    }
  });

  // Operations status endpoint for Runbook Timeline
  app.get('/api/operations/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's portfolios to count positions and calculate PnL
      const portfolios = await storage.getPortfoliosByUserId(userId);
      
      // Calculate active positions across all portfolios
      const positionsArrays = await Promise.all(
        portfolios.map(p => storage.getPositionsByPortfolioId(p.id))
      );
      const allPositions = positionsArrays.flat();
      const activePositions = allPositions.length;
      
      // Calculate daily PnL percentage
      const portfolioValue = portfolios.reduce((sum, p) => 
        sum + parseFloat(p.total_value_usd || '0'), 0
      );
      const dailyPnL = portfolios.reduce((sum, p) => 
        sum + parseFloat(p.daily_pnl_percentage || '0'), 0
      );
      
      // Get staleness status from guard service
      const stalenessLevel = stalenessGuardService.getGlobalStalenessLevel();
      const quarantineStatus = stalenessGuardService.getQuarantineStatus();
      
      // Get asset selection info from latest rankings
      const latestRankings = await db.select()
        .from(symbol_rankings)
        .orderBy(desc(symbol_rankings.created_at))
        .limit(100);
      const assetsSelected = latestRankings.length;
      
      // Determine current operational phase based on time of day
      const now = new Date();
      const hourOfDay = now.getHours();
      const minuteOfDay = now.getMinutes();
      
      let currentPhase: 'selection' | 'distribution' | 'trading' | 'rebalance' | 'audit';
      
      // Selection at 00:00
      if (hourOfDay === 0 && minuteOfDay < 5) {
        currentPhase = 'selection';
      } 
      // Distribution at 00:05
      else if (hourOfDay === 0 && minuteOfDay >= 5 && minuteOfDay < 15) {
        currentPhase = 'distribution';
      }
      // Rebalance every 8 hours (00:00, 08:00, 16:00)
      else if ((hourOfDay % 8 === 0 && minuteOfDay < 30)) {
        currentPhase = 'rebalance';
      }
      // Audit at 24h mark (end of day)
      else if (hourOfDay === 23 && minuteOfDay >= 50) {
        currentPhase = 'audit';
      }
      // Default to trading during the day
      else {
        currentPhase = 'trading';
      }
      
      // Calculate next rebalance time (every 8 hours)
      const currentHour = now.getHours();
      const nextRebalanceHour = Math.ceil((currentHour + 1) / 8) * 8;
      const nextRebalanceTime = new Date(now);
      if (nextRebalanceHour >= 24) {
        nextRebalanceTime.setDate(nextRebalanceTime.getDate() + 1);
        nextRebalanceTime.setHours(0, 0, 0, 0);
      } else {
        nextRebalanceTime.setHours(nextRebalanceHour, 0, 0, 0);
      }
      
      // Get the latest audit log entries for timing info
      const auditLogs = await storage.getAuditTrailByUser(userId, 20);
      
      const lastSelectionLog = auditLogs.find(log => log.action_type === 'asset_selection');
      const lastRebalanceLog = auditLogs.find(log => log.action_type === 'rebalance' || log.action_type === 'campaign_rebalance');
      const lastAuditLog = auditLogs.find(log => log.action_type === 'daily_audit');
      
      res.json({
        currentPhase,
        lastSelectionTime: lastSelectionLog?.created_at?.toISOString() || null,
        lastDistributionTime: lastSelectionLog?.created_at?.toISOString() || null,
        lastRebalanceTime: lastRebalanceLog?.created_at?.toISOString() || null,
        lastAuditTime: lastAuditLog?.created_at?.toISOString() || null,
        nextRebalanceTime: nextRebalanceTime.toISOString(),
        tradingActive: stalenessLevel === 'fresh',
        stalenessLevel,
        assetsSelected,
        activePositions,
        dailyPnL: dailyPnL.toFixed(2),
        hitRate: '0.00',
        quarantinedSymbols: quarantineStatus.quarantinedCount,
      });
    } catch (error) {
      console.error("Error fetching operations status:", error);
      res.status(500).json({ message: "Failed to fetch operations status" });
    }
  });
  
  // Audit dashboard endpoint - 24h consolidated metrics
  app.get('/api/operations/audit', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's portfolios
      const portfolios = await storage.getPortfoliosByUserId(userId);
      
      // Get all trades and positions from the last 24 hours
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Fetch all portfolio data concurrently
      const [tradesArrays, positionsArrays, snapshotsArrays] = await Promise.all([
        Promise.all(portfolios.map(p => storage.getTradesByPortfolioId(p.id))),
        Promise.all(portfolios.map(p => storage.getPositionsByPortfolioId(p.id))),
        Promise.all(portfolios.map(p => storage.getSnapshotsByPortfolioId(p.id, 288))), // 5-min intervals for 24h
      ]);
      
      const allTrades = tradesArrays.flat();
      const allPositions = positionsArrays.flat();
      const allSnapshots = snapshotsArrays.flat();
      
      // Filter trades from last 24 hours
      const recentTrades = allTrades.filter(trade => {
        const closedAt = trade.closed_at ? new Date(trade.closed_at) : null;
        return closedAt && closedAt >= yesterday;
      });
      
      // Calculate performance metrics
      const winningTrades = recentTrades.filter(t => parseFloat(t.realized_pnl || '0') > 0);
      const losingTrades = recentTrades.filter(t => parseFloat(t.realized_pnl || '0') < 0);
      const totalTrades = recentTrades.length;
      
      const hitRate = totalTrades > 0 
        ? (winningTrades.length / totalTrades) * 100 
        : 0;
      
      const totalWins = winningTrades.reduce((sum, t) => sum + parseFloat(t.realized_pnl || '0'), 0);
      const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + parseFloat(t.realized_pnl || '0'), 0));
      
      const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
      const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
      const payoff = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 999 : 0);
      
      // Calculate total PnL
      const totalPnL = recentTrades.reduce((sum, t) => sum + parseFloat(t.realized_pnl || '0'), 0);
      const unrealizedPnL = allPositions.reduce((sum, p) => sum + parseFloat(p.unrealized_pnl || '0'), 0);
      
      // Calculate fees and slippage
      const totalFees = recentTrades.reduce((sum, t) => sum + parseFloat(t.fees || '0'), 0);
      const totalSlippage = recentTrades.reduce((sum, t) => sum + parseFloat((t as any).slippage_usd || '0'), 0);
      
      // Calculate VaR and Expected Shortfall (simplified 95% confidence)
      const pnlValues = recentTrades.map(t => parseFloat(t.realized_pnl || '0')).sort((a, b) => a - b);
      const varIndex = Math.floor(pnlValues.length * 0.05);
      const var95 = pnlValues.length > 0 ? Math.abs(pnlValues[varIndex] || 0) : 0;
      const tailLosses = pnlValues.slice(0, varIndex + 1);
      const expectedShortfall = tailLosses.length > 0 
        ? Math.abs(tailLosses.reduce((sum, v) => sum + v, 0) / tailLosses.length)
        : 0;
      
      // Calculate drawdown from snapshots
      let maxDrawdown = 0;
      let peakEquity = 0;
      
      const sortedSnapshots = [...allSnapshots].sort((a, b) => 
        new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime()
      );
      
      for (const snapshot of sortedSnapshots) {
        const equity = parseFloat(snapshot.equity_usd);
        if (equity > peakEquity) peakEquity = equity;
        const drawdown = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
      
      // Portfolio value
      const portfolioValue = portfolios.reduce((sum, p) => 
        sum + parseFloat(p.total_value_usd || '0'), 0
      );
      
      res.json({
        period: '24h',
        timestamp: now.toISOString(),
        performance: {
          hitRate: hitRate.toFixed(2),
          avgWin: avgWin.toFixed(2),
          avgLoss: avgLoss.toFixed(2),
          profitFactor: profitFactor.toFixed(2),
          payoff: payoff.toFixed(2),
          totalTrades,
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
        },
        pnl: {
          realized: totalPnL.toFixed(2),
          unrealized: unrealizedPnL.toFixed(2),
          total: (totalPnL + unrealizedPnL).toFixed(2),
          percentage: portfolioValue > 0 
            ? ((totalPnL + unrealizedPnL) / portfolioValue * 100).toFixed(2)
            : '0.00',
        },
        risk: {
          var95: var95.toFixed(2),
          expectedShortfall: expectedShortfall.toFixed(2),
          maxDrawdown: maxDrawdown.toFixed(2),
          currentEquity: portfolioValue.toFixed(2),
        },
        costs: {
          totalFees: totalFees.toFixed(4),
          totalSlippage: totalSlippage.toFixed(4),
          totalCosts: (totalFees + totalSlippage).toFixed(4),
          costPerTrade: totalTrades > 0 
            ? ((totalFees + totalSlippage) / totalTrades).toFixed(4)
            : '0.0000',
        },
      });
    } catch (error) {
      console.error("Error fetching audit metrics:", error);
      res.status(500).json({ message: "Failed to fetch audit metrics" });
    }
  });

  app.post('/api/portfolios', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email || 'unknown';

      console.log(`[PORTFOLIO] 📝 Creating portfolio | User: ${userId} (${userEmail}) | Name: ${req.body.name} | Mode: ${req.body.trading_mode || 'paper'}`);

      const portfolioData = {
        user_id: userId,
        name: req.body.name,
        total_value_usd: req.body.total_value_usd || "0",
        daily_pnl: req.body.daily_pnl || "0",
        daily_pnl_percentage: req.body.daily_pnl_percentage || "0",
        trading_mode: req.body.trading_mode || "paper",
      };

      // Validate request body with Zod
      const validationResult = insertPortfolioSchema.safeParse(portfolioData);
      if (!validationResult.success) {
        console.log(`[PORTFOLIO] ❌ Validation failed | User: ${userId} | Errors: ${JSON.stringify(validationResult.error.errors)}`);
        return res.status(400).json({ 
          message: "Invalid portfolio data", 
          errors: validationResult.error.errors 
        });
      }

      const portfolio = await storage.createPortfolio(validationResult.data);
      console.log(`[PORTFOLIO] ✓ Created successfully | User: ${userId} | Portfolio ID: ${portfolio.id} | Name: ${portfolio.name}`);
      res.json(portfolio);
    } catch (error) {
      console.error(`[PORTFOLIO] ❌ Error creating portfolio | User: ${req.user?.claims?.sub} |`, error);
      res.status(500).json({ message: "Failed to create portfolio" });
    }
  });

  // Delete portfolio (only if no active campaigns)
  app.delete('/api/portfolios/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const portfolioId = req.params.id;

      // Verify ownership
      const portfolio = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).limit(1);
      if (!portfolio.length) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      if (portfolio[0].user_id !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this portfolio" });
      }

      // Check for active campaigns
      const activeCampaigns = await db.select()
        .from(campaigns)
        .where(and(
          eq(campaigns.portfolio_id, portfolioId),
          eq(campaigns.status, 'active')
        ))
        .limit(1);
      
      if (activeCampaigns.length > 0) {
        return res.status(400).json({ 
          message: "Cannot delete portfolio with active campaigns. Stop the campaigns first." 
        });
      }

      // Soft-delete all non-active campaigns (ANTIFRAUDE: campaigns cannot be hard deleted)
      const portfolioCampaigns = await db.select({ id: campaigns.id })
        .from(campaigns)
        .where(and(
          eq(campaigns.portfolio_id, portfolioId),
          eq(campaigns.is_deleted, false)
        ));
      
      for (const campaign of portfolioCampaigns) {
        // Soft-delete: mark as deleted instead of removing data
        await db.update(campaigns)
          .set({ 
            is_deleted: true, 
            deleted_at: new Date(),
            deleted_reason: 'Portfolio deletion requested by user'
          })
          .where(eq(campaigns.id, campaign.id));
      }

      // Delete portfolio (cascades to positions, trades, risk_parameters via onDelete: 'cascade')
      await db.delete(portfolios).where(eq(portfolios.id, portfolioId));

      res.json({ success: true, message: "Portfolio deleted successfully" });
    } catch (error) {
      console.error("Error deleting portfolio:", error);
      res.status(500).json({ message: "Failed to delete portfolio" });
    }
  });

  // Position routes
  app.get('/api/portfolios/:portfolioId/positions', isAuthenticated, async (req: any, res) => {
    try {
      const positions = await storage.getPositionsByPortfolioId(req.params.portfolioId);
      res.json(positions);
    } catch (error) {
      console.error("Error fetching positions:", error);
      res.status(500).json({ message: "Failed to fetch positions" });
    }
  });

  // Trade routes
  app.get('/api/portfolios/:portfolioId/trades', isAuthenticated, async (req: any, res) => {
    try {
      const trades = await storage.getTradesByPortfolioId(req.params.portfolioId);
      res.json(trades);
    } catch (error) {
      console.error("Error fetching trades:", error);
      res.status(500).json({ message: "Failed to fetch trades" });
    }
  });

  // Alert routes
  app.get('/api/alerts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const alerts = await storage.getAlertsByUserId(userId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.post('/api/alerts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const alertData = {
        user_id: userId,
        symbol: req.body.symbol,
        condition: req.body.condition,
        target_price: req.body.target_price,
      };

      // Validate request body with Zod
      const validationResult = insertAlertSchema.safeParse(alertData);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid alert data", 
          errors: validationResult.error.errors 
        });
      }

      const alert = await storage.createAlert(validationResult.data);
      res.json(alert);
    } catch (error) {
      console.error("Error creating alert:", error);
      res.status(500).json({ message: "Failed to create alert" });
    }
  });

  // Market data routes (public)
  app.get('/api/market-data', async (req, res) => {
    try {
      const marketData = await storage.getAllMarketData();
      res.json(marketData);
    } catch (error) {
      console.error("Error fetching market data:", error);
      res.status(500).json({ message: "Failed to fetch market data" });
    }
  });

  app.get('/api/market-data/:symbol', async (req, res) => {
    try {
      const data = await storage.getMarketDataBySymbol(req.params.symbol);
      if (!data) {
        return res.status(404).json({ message: "Market data not found" });
      }
      res.json(data);
    } catch (error) {
      console.error("Error fetching market data:", error);
      res.status(500).json({ message: "Failed to fetch market data" });
    }
  });

  // PUBLIC ENDPOINT: Get all symbols (no authentication required)
  app.get('/api/symbols', async (req, res) => {
    try {
      const allSymbols = await storage.getAllSymbols();
      res.json({
        count: allSymbols.length,
        symbols: allSymbols.map(s => ({
          id: s.id,
          symbol: s.symbol,
          exchange_symbol: s.exchange_symbol,
          is_active: s.is_active,
        }))
      });
    } catch (error: any) {
      console.error("Error fetching symbols:", error);
      res.status(500).json({ message: "Failed to fetch symbols" });
    }
  });

  // PUBLIC ENDPOINT: Get VRE status (no authentication required)
  app.get('/api/vres', async (req, res) => {
    try {
      const vreData = await db.select().from(sql`vre_states`).limit(20);
      res.json({
        count: vreData.length,
        regimes: vreData.map((item: any) => ({
          symbol: item.symbol,
          regime: item.regime,
          confidence: item.confidence,
          updated_at: item.updated_at
        }))
      });
    } catch (error: any) {
      console.error("Error fetching VRE data:", error);
      // Fallback if table doesn't exist
      res.json({
        count: 0,
        regimes: [],
        message: "VRE data not yet initialized"
      });
    }
  });

  // Bars 1s endpoint (Redis-based high-frequency bars)
  app.get('/api/bars/1s/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const { limit, start, end } = req.query;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ message: "Invalid symbol parameter" });
      }
      
      const { redisBarService } = await import('./services/redisBarService');
      
      let bars;
      if (start && end) {
        const startTs = parseInt(start as string, 10);
        const endTs = parseInt(end as string, 10);
        
        if (isNaN(startTs) || isNaN(endTs)) {
          return res.status(400).json({ message: "Invalid start/end timestamp" });
        }
        
        bars = await redisBarService.getBars1sInRange(
          'kraken',
          symbol,
          startTs,
          endTs
        );
      } else {
        const limitNum = limit ? parseInt(limit as string, 10) : 3600;
        
        if (isNaN(limitNum) || limitNum < 1) {
          return res.status(400).json({ message: "Invalid limit parameter" });
        }
        
        bars = await redisBarService.getBars1s(
          'kraken',
          symbol,
          limitNum
        );
      }
      
      res.json({
        symbol,
        exchange: 'kraken',
        interval: '1s',
        bars,
        count: bars.length
      });
    } catch (error) {
      console.error("Error fetching 1s bars:", error);
      res.status(500).json({ message: "Failed to fetch 1s bars" });
    }
  });

  // Bars 5s endpoint (Redis-based medium-frequency bars)
  app.get('/api/bars/5s/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const { limit, start, end } = req.query;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ message: "Invalid symbol parameter" });
      }
      
      const { redisBarService } = await import('./services/redisBarService');
      
      let bars;
      if (start && end) {
        const startTs = parseInt(start as string, 10);
        const endTs = parseInt(end as string, 10);
        
        if (isNaN(startTs) || isNaN(endTs)) {
          return res.status(400).json({ message: "Invalid start/end timestamp" });
        }
        
        bars = await redisBarService.getBars5sInRange(
          'kraken',
          symbol,
          startTs,
          endTs
        );
      } else {
        const limitNum = limit ? parseInt(limit as string, 10) : 720;
        
        if (isNaN(limitNum) || limitNum < 1) {
          return res.status(400).json({ message: "Invalid limit parameter" });
        }
        
        bars = await redisBarService.getBars5s(
          'kraken',
          symbol,
          limitNum
        );
      }
      
      res.json({
        symbol,
        exchange: 'kraken',
        interval: '5s',
        bars,
        count: bars.length
      });
    } catch (error) {
      console.error("Error fetching 5s bars:", error);
      res.status(500).json({ message: "Failed to fetch 5s bars" });
    }
  });

  // Real-time market data endpoints
  
  // Recent ticks endpoint
  app.get('/api/market/ticks/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const { limit } = req.query;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ message: "Invalid symbol parameter" });
      }
      
      const limitNum = limit ? parseInt(limit as string, 10) : 100;
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
        return res.status(400).json({ message: "Invalid limit (1-1000)" });
      }
      
      const ticks = await dataIngestionService.getRecentTicks('kraken', symbol, limitNum);
      
      res.json({
        symbol,
        exchange: 'kraken',
        ticks,
        count: ticks.length
      });
    } catch (error) {
      console.error("Error fetching ticks:", error);
      res.status(500).json({ message: "Failed to fetch ticks" });
    }
  });

  // L1 quotes endpoint (best bid/ask)
  app.get('/api/market/l1/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ message: "Invalid symbol parameter" });
      }
      
      const l1Quote = await dataIngestionService.getL1Quote('kraken', symbol);
      
      if (!l1Quote) {
        return res.status(404).json({ message: "L1 quote not found" });
      }
      
      res.json({
        symbol,
        exchange: 'kraken',
        ...l1Quote
      });
    } catch (error) {
      console.error("Error fetching L1 quote:", error);
      res.status(500).json({ message: "Failed to fetch L1 quote" });
    }
  });

  // L2 order book endpoint
  app.get('/api/market/l2/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ message: "Invalid symbol parameter" });
      }
      
      const orderBook = await dataIngestionService.getL2OrderBook('kraken', symbol);
      
      res.json({
        symbol,
        exchange: 'kraken',
        bids: orderBook.bids,
        asks: orderBook.asks,
        bids_count: orderBook.bids.length,
        asks_count: orderBook.asks.length
      });
    } catch (error) {
      console.error("Error fetching L2 order book:", error);
      res.status(500).json({ message: "Failed to fetch L2 order book" });
    }
  });

  // Asset selection endpoints
  
  // Get selected assets with clusters
  app.get('/api/asset-selection/selected', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's filter preferences
      const filters = await assetSelectorService.getUserFilters(userId);
      
      // First, get the most recent run_id
      const latestRun = await db.select({
        run_id: symbol_rankings.run_id,
      })
        .from(symbol_rankings)
        .orderBy(desc(symbol_rankings.created_at))
        .limit(1)
        .execute();
      
      if (latestRun.length === 0) {
        return res.json({ assets: [], filters: filters || null, count: 0 });
      }
      
      const latestRunId = latestRun[0].run_id;
      
      // Get all rankings from the latest run with symbol names
      const rankings = await db.select({
        id: symbol_rankings.id,
        run_id: symbol_rankings.run_id,
        symbol_id: symbol_rankings.symbol_id,
        rank: symbol_rankings.rank,
        score: symbol_rankings.score,
        cluster_number: symbol_rankings.cluster_number,
        created_at: symbol_rankings.created_at,
        symbol: symbols.symbol,
        exchange_symbol: symbols.exchange_symbol,
      })
        .from(symbol_rankings)
        .leftJoin(symbols, eq(symbol_rankings.symbol_id, symbols.id))
        .where(eq(symbol_rankings.run_id, latestRunId))
        .orderBy(symbol_rankings.rank)
        .limit(filters?.target_assets_count || 100)
        .execute();
      
      res.json({
        assets: rankings,
        filters: filters || null,
        count: rankings.length
      });
    } catch (error) {
      console.error("Error fetching selected assets:", error);
      res.status(500).json({ message: "Failed to fetch selected assets" });
    }
  });

  // Get user filter preferences
  app.get('/api/asset-selection/filters', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const filters = await assetSelectorService.getUserFilters(userId);
      
      if (!filters) {
        // Return default filters
        return res.json({
          min_volume_usd: 5000000,
          max_spread_pct: 0.10,
          min_depth_usd: 100000,
          min_atr_pct: 0.01,
          max_assets: 30,
          num_clusters: 5
        });
      }
      
      res.json(filters);
    } catch (error) {
      console.error("Error fetching asset filters:", error);
      res.status(500).json({ message: "Failed to fetch asset filters" });
    }
  });

  // Update user filter preferences
  app.post('/api/asset-selection/filters', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body
      const validationResult = updateAssetFiltersSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Invalid filter data",
          errors: validationResult.error.errors
        });
      }
      
      await assetSelectorService.updateUserFilters(userId, validationResult.data);
      
      res.json({ message: "Filters updated successfully" });
    } catch (error) {
      console.error("Error updating asset filters:", error);
      res.status(500).json({ message: "Failed to update asset filters" });
    }
  });

  // Run asset selection with current filters
  app.post('/api/asset-selection/run', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      console.log(`[AssetSelection] Running selection for user ${userId}`);
      
      const result = await assetSelectorService.runSelection(userId);
      
      res.json({
        message: "Asset selection completed successfully",
        run_id: result.run_id,
        selected_count: result.assets.length,
        cluster_count: result.clusters.length,
        assets: result.assets,
        clusters: result.clusters
      });
    } catch (error) {
      console.error("Error running asset selection:", error);
      res.status(500).json({ message: "Failed to run asset selection", error: String(error) });
    }
  });

  // Kraken credentials routes
  app.get('/api/user/kraken-credentials', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log(`[KRAKEN CREDS] Fetching credential status for user ${userId}`);
      const user = await storage.getUserById(userId);
      
      if (!user) {
        console.log(`[KRAKEN CREDS] User ${userId} not found`);
        return res.status(404).json({ message: "User not found" });
      }

      const status = {
        hasApiKey: !!user.kraken_api_key,
        hasApiSecret: !!user.kraken_api_secret,
      };
      console.log(`[KRAKEN CREDS] User ${userId} credential status:`, status);

      // Return only whether credentials are set (not the actual values for security)
      res.json(status);
    } catch (error) {
      console.error("[KRAKEN CREDS] Error fetching Kraken credentials status:", error);
      res.status(500).json({ message: "Failed to fetch credentials status" });
    }
  });

  app.post('/api/user/kraken-credentials', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log(`[KRAKEN CREDS] Received save request for user ${userId}`);
      console.log(`[KRAKEN CREDS] Request body keys:`, Object.keys(req.body));

      // Validate request body with Zod
      const validationResult = krakenCredentialsSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.error(`[KRAKEN CREDS] Validation failed:`, validationResult.error.errors);
        return res.status(400).json({ 
          message: "Invalid credentials data", 
          errors: validationResult.error.errors 
        });
      }

      const { apiKey, apiSecret } = validationResult.data;
      console.log(`[KRAKEN CREDS] Validation passed. API Key length: ${apiKey.length}, Secret length: ${apiSecret.length}`);

      // Import encryption service
      const { encrypt } = await import('./services/encryptionService');
      
      // Encrypt credentials before storing
      console.log(`[KRAKEN CREDS] Encrypting credentials...`);
      const encryptedKey = encrypt(apiKey);
      const encryptedSecret = encrypt(apiSecret);
      console.log(`[KRAKEN CREDS] Encryption complete. Encrypted key length: ${encryptedKey.length}`);
      
      console.log(`[KRAKEN CREDS] Saving to database...`);
      await storage.updateUserKrakenCredentials(userId, encryptedKey, encryptedSecret);
      console.log(`[KRAKEN CREDS] Successfully saved credentials for user ${userId}`);

      res.json({ message: "Kraken credentials saved successfully" });
    } catch (error) {
      console.error("[KRAKEN CREDS] Error saving Kraken credentials:", error);
      res.status(500).json({ message: "Failed to save credentials" });
    }
  });

  app.delete('/api/user/kraken-credentials', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.updateUserKrakenCredentials(userId, null, null);
      res.json({ message: "Kraken credentials removed successfully" });
    } catch (error) {
      console.error("Error removing Kraken credentials:", error);
      res.status(500).json({ message: "Failed to remove credentials" });
    }
  });

  // Hardcoded authorized emails (always approved regardless of database)
  const ALWAYS_AUTHORIZED_EMAILS = [
    'alltrendsfy@gmail.com',
    'itopaiva01@gmail.com',
  ];

  // Beta invite code routes
  app.get('/api/user/beta-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email?.toLowerCase();
      console.log(`[BETA-STATUS] Checking status for user ${userId} (${userEmail})`);
      
      const user = await storage.getUserById(userId);
      
      if (!user) {
        console.log(`[BETA-STATUS] User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`[BETA-STATUS] User ${userId}: is_beta_approved=${user.is_beta_approved}, is_admin=${user.is_admin}`);

      // If already beta approved, return immediately
      if (user.is_beta_approved) {
        console.log(`[BETA-STATUS] User ${userId} already approved`);
        return res.json({
          isBetaApproved: true,
          betaCodeUsed: user.beta_code_used ?? null,
        });
      }

      // Check hardcoded authorized emails first
      if (userEmail && ALWAYS_AUTHORIZED_EMAILS.includes(userEmail)) {
        console.log(`[BETA-STATUS] Auto-approving user ${userId} with hardcoded authorized email ${userEmail}`);
        await storage.updateUserBetaStatus(userId, true, 'AUTHORIZED_EMAIL');
        return res.json({
          isBetaApproved: true,
          betaCodeUsed: 'AUTHORIZED_EMAIL',
        });
      }

      // If not yet beta approved, check if email is in authorized list (database)
      if (userEmail) {
        const authorizedEmail = await storage.getAuthorizedEmailByEmail(userEmail);
        if (authorizedEmail && authorizedEmail.is_active) {
          // Auto-activate user with authorized email
          console.log(`[BETA-STATUS] Auto-activating user ${userId} with authorized email from database ${userEmail}`);
          await storage.updateUserBetaStatus(userId, true, 'AUTHORIZED_EMAIL');
          return res.json({
            isBetaApproved: true,
            betaCodeUsed: 'AUTHORIZED_EMAIL',
          });
        }
      }

      console.log(`[BETA-STATUS] User ${userId} not approved and no authorized email found`);
      res.json({
        isBetaApproved: false,
        betaCodeUsed: null,
      });
    } catch (error) {
      console.error("[BETA-STATUS] Error fetching beta status:", error);
      res.status(500).json({ message: "Failed to fetch beta status" });
    }
  });

  app.post('/api/user/activate-beta', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      console.log(`[BETA-ACTIVATE] Activation request for user ${userId} (${userEmail})`);

      // Validate request body with Zod
      const validationResult = betaCodeSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.error(`[BETA-ACTIVATE] Validation failed:`, validationResult.error.errors);
        return res.status(400).json({ 
          message: "Invalid invite code format", 
          errors: validationResult.error.errors 
        });
      }

      const { code } = validationResult.data;
      const normalizedCode = code.toUpperCase().trim();
      console.log(`[BETA-ACTIVATE] Checking code: ${normalizedCode}`);

      // Check if user already has beta access
      const user = await storage.getUserById(userId);
      if (!user) {
        console.log(`[BETA-ACTIVATE] User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.is_beta_approved) {
        console.log(`[BETA-ACTIVATE] User ${userId} already approved - redirecting`);
        return res.json({ 
          success: true, 
          message: "Your account is already activated! Redirecting..." 
        });
      }

      // Validate and use the beta code
      const betaCode = await storage.getBetaCodeByCode(normalizedCode);
      if (!betaCode) {
        console.log(`[BETA-ACTIVATE] Code not found: ${normalizedCode}`);
        return res.status(400).json({ message: "Invite code not found. Please check the code and try again." });
      }

      if (!betaCode.is_active) {
        console.log(`[BETA-ACTIVATE] Code inactive: ${normalizedCode}`);
        return res.status(400).json({ message: "This invite code is no longer active" });
      }

      if (betaCode.current_uses >= betaCode.max_uses) {
        console.log(`[BETA-ACTIVATE] Code exhausted: ${normalizedCode} (${betaCode.current_uses}/${betaCode.max_uses})`);
        return res.status(400).json({ message: "This invite code has reached its usage limit" });
      }

      if (betaCode.expires_at && new Date() > betaCode.expires_at) {
        console.log(`[BETA-ACTIVATE] Code expired: ${normalizedCode}`);
        return res.status(400).json({ message: "This invite code has expired" });
      }

      // Use the code and update user status
      const codeUsed = await storage.useBetaCode(normalizedCode);
      if (!codeUsed) {
        console.log(`[BETA-ACTIVATE] Failed to use code: ${normalizedCode}`);
        return res.status(400).json({ message: "Failed to activate code. Please try again." });
      }

      await storage.updateUserBetaStatus(userId, true, normalizedCode);
      console.log(`[BETA-ACTIVATE] Successfully activated user ${userId} with code ${normalizedCode}`);

      res.json({ 
        success: true, 
        message: "Account activated successfully! Welcome to DELFOS beta." 
      });
    } catch (error: any) {
      console.error("[BETA-ACTIVATE] Error activating beta code:", error?.message || error);
      res.status(500).json({ message: "Server error while activating code. Please try again." });
    }
  });

  // ===== ADMIN ROUTES =====
  // Hardcoded admin emails (always have admin access regardless of database)
  const ALWAYS_ADMIN_EMAILS = [
    'alltrendsfy@gmail.com',
    'itopaiva01@gmail.com',
  ];

  // Middleware to check admin status (considers hardcoded emails)
  const isAdmin = async (req: any, res: any, next: any) => {
    try {
      const userId = req.user?.claims?.sub;
      const userEmail = req.user?.claims?.email?.toLowerCase();
      
      if (!userId) {
        console.log('[ADMIN] Middleware: No userId found');
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check hardcoded admin list first
      if (userEmail && ALWAYS_ADMIN_EMAILS.includes(userEmail)) {
        console.log(`[ADMIN] Middleware: User ${userId} (${userEmail}) has hardcoded admin access`);
        return next();
      }
      
      // Fall back to database check
      const user = await storage.getUserById(userId);
      if (!user?.is_admin) {
        console.log(`[ADMIN] Middleware: User ${userId} is not admin`);
        return res.status(403).json({ message: "Admin access required" });
      }
      
      next();
    } catch (error) {
      console.error("[ADMIN] Middleware error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };

  // Check if current user is admin
  app.get('/api/admin/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email?.toLowerCase();
      
      // Check hardcoded admin list first
      if (userEmail && ALWAYS_ADMIN_EMAILS.includes(userEmail)) {
        console.log(`[ADMIN] User ${userId} (${userEmail}) has hardcoded admin access`);
        return res.json({ isAdmin: true });
      }
      
      // Fall back to database check
      const user = await storage.getUserById(userId);
      res.json({ isAdmin: user?.is_admin ?? false });
    } catch (error) {
      console.error("[ADMIN] Error checking admin status:", error);
      res.status(500).json({ message: "Failed to check admin status" });
    }
  });

  // Get platform statistics (admin only)
  app.get('/api/admin/stats', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userStats = await storage.getUserStats();
      const betaCodes = await storage.getAllBetaCodes();
      const authorizedEmails = await storage.getAllAuthorizedEmails();
      
      res.json({
        users: userStats,
        betaCodes: {
          total: betaCodes.length,
          active: betaCodes.filter(c => c.is_active).length,
          totalUses: betaCodes.reduce((sum, c) => sum + c.current_uses, 0)
        },
        authorizedEmails: {
          total: authorizedEmails.length,
          active: authorizedEmails.filter(e => e.is_active).length
        }
      });
    } catch (error) {
      console.error("[ADMIN] Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch platform statistics" });
    }
  });

  // Get all users (admin only)
  app.get('/api/admin/users', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      const sanitizedUsers = users.map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        is_beta_approved: u.is_beta_approved,
        is_admin: u.is_admin,
        beta_code_used: u.beta_code_used,
        createdAt: u.createdAt
      }));
      res.json(sanitizedUsers);
    } catch (error) {
      console.error("[ADMIN] Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Set user admin status (admin only)
  app.patch('/api/admin/users/:userId/admin', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { isAdmin: targetIsAdmin } = req.body;
      
      if (typeof targetIsAdmin !== 'boolean') {
        return res.status(400).json({ message: "isAdmin must be a boolean" });
      }
      
      await storage.setUserAdminStatus(userId, targetIsAdmin);
      console.log(`[ADMIN] User ${userId} admin status set to ${targetIsAdmin} by ${req.user.claims.sub}`);
      
      res.json({ success: true, message: "Admin status updated" });
    } catch (error) {
      console.error("[ADMIN] Error updating admin status:", error);
      res.status(500).json({ message: "Failed to update admin status" });
    }
  });

  // Get all beta codes (admin only)
  app.get('/api/admin/beta-codes', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const codes = await storage.getAllBetaCodes();
      res.json(codes);
    } catch (error) {
      console.error("[ADMIN] Error fetching beta codes:", error);
      res.status(500).json({ message: "Failed to fetch beta codes" });
    }
  });

  // Create new beta code (admin only)
  app.post('/api/admin/beta-codes', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { code, max_uses, expires_at } = req.body;
      
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ message: "Code is required" });
      }
      
      const normalizedCode = code.toUpperCase().trim();
      
      const existing = await storage.getBetaCodeByCode(normalizedCode);
      if (existing) {
        return res.status(400).json({ message: "Code already exists" });
      }
      
      const newCode = await storage.createBetaCode({
        code: normalizedCode,
        max_uses: max_uses || 1,
        is_active: true,
        expires_at: expires_at ? new Date(expires_at) : null
      });
      
      console.log(`[ADMIN] Beta code ${normalizedCode} created by ${req.user.claims.sub}`);
      res.json(newCode);
    } catch (error) {
      console.error("[ADMIN] Error creating beta code:", error);
      res.status(500).json({ message: "Failed to create beta code" });
    }
  });

  // Deactivate beta code (admin only)
  app.patch('/api/admin/beta-codes/:code/deactivate', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { code } = req.params;
      const success = await storage.deactivateBetaCode(code.toUpperCase());
      
      if (!success) {
        return res.status(404).json({ message: "Code not found" });
      }
      
      console.log(`[ADMIN] Beta code ${code} deactivated by ${req.user.claims.sub}`);
      res.json({ success: true, message: "Code deactivated" });
    } catch (error) {
      console.error("[ADMIN] Error deactivating beta code:", error);
      res.status(500).json({ message: "Failed to deactivate beta code" });
    }
  });

  // Get all authorized emails (admin only)
  app.get('/api/admin/authorized-emails', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const emails = await storage.getAllAuthorizedEmails();
      res.json(emails);
    } catch (error) {
      console.error("[ADMIN] Error fetching authorized emails:", error);
      res.status(500).json({ message: "Failed to fetch authorized emails" });
    }
  });

  // Add authorized email (admin only)
  app.post('/api/admin/authorized-emails', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { email, notes } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email is required" });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      if (!normalizedEmail.includes('@')) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      
      const existing = await storage.getAuthorizedEmailByEmail(normalizedEmail);
      if (existing) {
        return res.status(400).json({ message: "Email already authorized" });
      }
      
      const authorized = await storage.createAuthorizedEmail({
        email: normalizedEmail,
        added_by: req.user.claims.sub,
        notes: notes || null,
        is_active: true
      });
      
      console.log(`[ADMIN] Email ${normalizedEmail} authorized by ${req.user.claims.sub}`);
      res.json(authorized);
    } catch (error) {
      console.error("[ADMIN] Error adding authorized email:", error);
      res.status(500).json({ message: "Failed to add authorized email" });
    }
  });

  // Remove authorized email (admin only)
  app.delete('/api/admin/authorized-emails/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAuthorizedEmail(id);
      
      console.log(`[ADMIN] Authorized email ${id} removed by ${req.user.claims.sub}`);
      res.json({ success: true, message: "Email removed from authorized list" });
    } catch (error) {
      console.error("[ADMIN] Error removing authorized email:", error);
      res.status(500).json({ message: "Failed to remove authorized email" });
    }
  });

  // Toggle authorized email status (admin only)
  app.patch('/api/admin/authorized-emails/:id/toggle', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { is_active } = req.body;
      
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ message: "is_active must be a boolean" });
      }
      
      const updated = await storage.updateAuthorizedEmail(id, { is_active });
      
      if (!updated) {
        return res.status(404).json({ message: "Email not found" });
      }
      
      console.log(`[ADMIN] Authorized email ${id} status set to ${is_active} by ${req.user.claims.sub}`);
      res.json(updated);
    } catch (error) {
      console.error("[ADMIN] Error toggling authorized email:", error);
      res.status(500).json({ message: "Failed to toggle email status" });
    }
  });

  // Approve user beta access (admin only) - bypasses code requirement
  app.patch('/api/admin/users/:userId/approve-beta', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await storage.updateUserBetaStatus(userId, true, "ADMIN-APPROVED");
      console.log(`[ADMIN] User ${userId} beta access approved by ${req.user.claims.sub}`);
      
      res.json({ success: true, message: "User beta access approved" });
    } catch (error) {
      console.error("[ADMIN] Error approving user beta:", error);
      res.status(500).json({ message: "Failed to approve user beta access" });
    }
  });

  // ===== API TOKENS (for external agents) =====
  
  // Helper function to hash tokens
  const hashToken = (token: string): string => {
    return crypto.createHash('sha256').update(token).digest('hex');
  };
  
  // Helper function to generate secure token
  const generateApiToken = (): string => {
    return `delfos_${crypto.randomBytes(32).toString('hex')}`;
  };
  
  // Middleware for API token authentication (alternative to session auth)
  const isApiTokenAuthenticated = async (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Missing or invalid Authorization header" });
      }
      
      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const tokenHash = hashToken(token);
      
      const apiToken = await storage.getApiTokenByHash(tokenHash);
      
      if (!apiToken) {
        console.log('[API-TOKEN] Token not found');
        return res.status(401).json({ message: "Invalid API token" });
      }
      
      if (!apiToken.is_active) {
        console.log('[API-TOKEN] Token is deactivated');
        return res.status(401).json({ message: "API token is deactivated" });
      }
      
      if (apiToken.expires_at && new Date(apiToken.expires_at) < new Date()) {
        console.log('[API-TOKEN] Token has expired');
        return res.status(401).json({ message: "API token has expired" });
      }
      
      // Get the associated user
      const user = await storage.getUserById(apiToken.user_id);
      if (!user) {
        console.log('[API-TOKEN] Associated user not found');
        return res.status(401).json({ message: "Token user not found" });
      }
      
      // Update last used timestamp
      await storage.updateApiTokenLastUsed(apiToken.id);
      
      // Attach user and token info to request
      req.user = {
        claims: {
          sub: user.id,
          email: user.email,
        }
      };
      req.apiToken = apiToken;
      
      console.log(`[API-TOKEN] Authenticated: ${apiToken.name} (user: ${user.email})`);
      next();
    } catch (error) {
      console.error('[API-TOKEN] Authentication error:', error);
      res.status(500).json({ message: "Authentication error" });
    }
  };
  
  // Combined auth middleware (session OR API token)
  const isAuthenticatedOrApiToken = async (req: any, res: any, next: any) => {
    // First try session auth
    if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
      return next();
    }
    
    // If no session, try API token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return isApiTokenAuthenticated(req, res, next);
    }
    
    // Neither auth method worked
    return res.status(401).json({ message: "Unauthorized - requires session or API token" });
  };

  // Get all API tokens (admin only)
  app.get('/api/admin/api-tokens', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const tokens = await storage.getAllApiTokens();
      // Don't expose token_hash, just return metadata
      const sanitized = tokens.map(t => ({
        id: t.id,
        name: t.name,
        user_id: t.user_id,
        permissions: t.permissions,
        is_active: t.is_active,
        last_used_at: t.last_used_at,
        expires_at: t.expires_at,
        created_at: t.created_at,
        created_by: t.created_by
      }));
      res.json(sanitized);
    } catch (error) {
      console.error("[ADMIN] Error fetching API tokens:", error);
      res.status(500).json({ message: "Failed to fetch API tokens" });
    }
  });

  // Create new API token (admin only)
  app.post('/api/admin/api-tokens', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { user_id, name, permissions, expires_at } = req.body;
      
      if (!user_id || !name) {
        return res.status(400).json({ message: "user_id and name are required" });
      }
      
      // Check if user exists
      const targetUser = await storage.getUserById(user_id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Generate the token
      const plainToken = generateApiToken();
      const tokenHash = hashToken(plainToken);
      
      // Create the token record
      const tokenRecord = await storage.createApiToken({
        token_hash: tokenHash,
        user_id,
        name,
        permissions: permissions || ['read', 'trade'],
        is_active: true,
        expires_at: expires_at ? new Date(expires_at) : null,
        created_by: req.user.claims.sub
      });
      
      console.log(`[ADMIN] API token created: ${name} for user ${user_id} by ${req.user.claims.sub}`);
      
      // Return the plain token ONLY ONCE - it cannot be retrieved later
      res.json({
        message: "API token created successfully. Save this token - it cannot be retrieved later!",
        token: plainToken,
        id: tokenRecord.id,
        name: tokenRecord.name,
        user_id: tokenRecord.user_id,
        permissions: tokenRecord.permissions,
        expires_at: tokenRecord.expires_at,
        created_at: tokenRecord.created_at
      });
    } catch (error) {
      console.error("[ADMIN] Error creating API token:", error);
      res.status(500).json({ message: "Failed to create API token" });
    }
  });

  // Deactivate API token (admin only)
  app.patch('/api/admin/api-tokens/:id/deactivate', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deactivateApiToken(id);
      console.log(`[ADMIN] API token ${id} deactivated by ${req.user.claims.sub}`);
      res.json({ success: true, message: "API token deactivated" });
    } catch (error) {
      console.error("[ADMIN] Error deactivating API token:", error);
      res.status(500).json({ message: "Failed to deactivate API token" });
    }
  });

  // Delete API token (admin only)
  app.delete('/api/admin/api-tokens/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteApiToken(id);
      console.log(`[ADMIN] API token ${id} deleted by ${req.user.claims.sub}`);
      res.json({ success: true, message: "API token deleted" });
    } catch (error) {
      console.error("[ADMIN] Error deleting API token:", error);
      res.status(500).json({ message: "Failed to delete API token" });
    }
  });

  // Test API token authentication (public endpoint for agents to verify their token)
  app.get('/api/auth/verify-token', isApiTokenAuthenticated, async (req: any, res) => {
    try {
      res.json({
        authenticated: true,
        token_name: req.apiToken.name,
        user_id: req.user.claims.sub,
        user_email: req.user.claims.email,
        permissions: req.apiToken.permissions,
        expires_at: req.apiToken.expires_at
      });
    } catch (error) {
      console.error("[API-TOKEN] Error verifying token:", error);
      res.status(500).json({ message: "Failed to verify token" });
    }
  });

  // News feed routes
  const twitterService = new TwitterService(storage);

  app.get('/api/news', isAuthenticated, async (req, res) => {
    try {
      const limit = req.query.limit ? validateQueryLimit(req.query.limit) : 50;
      const news = await storage.getNewsFeed(limit);
      res.json(news);
    } catch (error: any) {
      if (error.message?.includes('Invalid limit')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error fetching news:", error);
      res.status(500).json({ message: "Failed to fetch news" });
    }
  });

  app.post('/api/news/refresh', isAuthenticated, async (req, res) => {
    try {
      await twitterService.fetchCryptoNews();
      const news = await storage.getNewsFeed(50);
      res.json({ message: "News feed refreshed successfully", count: news.length, news });
    } catch (error: any) {
      console.error("Error refreshing news feed:", error);
      res.status(500).json({ message: error.message || "Failed to refresh news feed" });
    }
  });

  // AI Assistant routes
  app.post('/api/ai/chat', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Validate request body with Zod
      const validationResult = aiChatSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid chat data", 
          errors: validationResult.error.errors 
        });
      }

      const { message, useAdvancedModel } = validationResult.data;

      // Check rate limit
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }

      // Get market context
      const marketData = await storage.getAllMarketData();
      const marketContext: MarketContext[] = marketData.slice(0, 10).map(data => ({
        symbol: data.symbol,
        price: data.current_price,
        change24h: data.change_24h_percentage,
        volume24h: data.volume_24h,
      }));

      // Get AI response
      const response = await getChatCompletion(
        [{ role: "user", content: message }],
        userId,
        marketContext,
        useAdvancedModel
      );

      // Save conversation to database
      await storage.createConversation({
        user_id: userId,
        user_message: message,
        ai_response: response,
        model_used: useAdvancedModel ? "gpt-4o" : "gpt-4o-mini",
        tokens_used: 0, // TODO: extract from OpenAI response
        market_symbols: marketContext.map(m => m.symbol),
      });

      res.json({ response, marketContext });
    } catch (error: any) {
      console.error("Error in AI chat:", error);
      res.status(500).json({ message: error.message || "Failed to get AI response" });
    }
  });

  app.get('/api/ai/analyze', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Check rate limit
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }

      // Get market context
      const marketData = await storage.getAllMarketData();
      const marketContext: MarketContext[] = marketData.map(data => ({
        symbol: data.symbol,
        price: data.current_price,
        change24h: data.change_24h_percentage,
        volume24h: data.volume_24h,
      }));

      const symbols = marketContext.map(m => m.symbol);
      
      // Get AI analysis
      const analysis = await analyzeMarket(userId, symbols, marketContext);

      // Save to database
      await storage.createConversation({
        user_id: userId,
        user_message: "Análise automática de mercado",
        ai_response: analysis,
        model_used: "gpt-4o-mini",
        tokens_used: 0,
        market_symbols: symbols,
      });

      res.json({ analysis, marketContext });
    } catch (error: any) {
      console.error("Error in market analysis:", error);
      res.status(500).json({ message: error.message || "Failed to analyze market" });
    }
  });

  app.get('/api/ai/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = req.query.limit ? validateQueryLimit(req.query.limit) : 20;
      
      const conversations = await storage.getConversationsByUserId(userId, limit);
      res.json(conversations);
    } catch (error: any) {
      if (error.message?.includes('Invalid limit')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error fetching conversation history:", error);
      res.status(500).json({ message: "Failed to fetch conversation history" });
    }
  });

  // AI specialized analysis endpoints
  app.get('/api/ai/rankings-insight', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check rate limit
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }
      
      // Get latest run_id
      const runId = await storage.getLatestRunId();
      if (!runId) {
        return res.status(404).json({ message: "Nenhuma seleção de ativos encontrada. Execute a seleção primeiro." });
      }
      
      // Get rankings analysis
      const result = await analyzeRankings(userId, storage, runId);
      
      // Save to database
      await storage.createConversation({
        user_id: userId,
        user_message: "Análise automática de rankings de ativos",
        ai_response: result.analysis,
        model_used: "gpt-4o-mini",
        tokens_used: 0,
        market_symbols: result.symbols || [],
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Error in rankings analysis:", error);
      res.status(500).json({ message: error.message || "Failed to analyze rankings" });
    }
  });

  app.get('/api/ai/cluster-insight', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check rate limit
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }
      
      // Get latest run_id
      const runId = await storage.getLatestRunId();
      if (!runId) {
        return res.status(404).json({ message: "Nenhuma seleção de ativos encontrada. Execute a seleção primeiro." });
      }
      
      // Get cluster analysis
      const result = await analyzeClusters(userId, storage, runId);
      
      // Save to database
      await storage.createConversation({
        user_id: userId,
        user_message: "Análise automática de clusters K-means",
        ai_response: result.analysis,
        model_used: "gpt-4o-mini",
        tokens_used: 0,
        market_symbols: result.symbols || [],
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Error in cluster analysis:", error);
      res.status(500).json({ message: error.message || "Failed to analyze clusters" });
    }
  });

  app.post('/api/ai/strategy', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body
      const strategySchema = z.object({
        query: z.string().min(1, "Query is required"),
        riskProfile: z.enum(['conservative', 'moderate', 'aggressive']).optional().default('moderate'),
      });
      
      const validationResult = strategySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.errors 
        });
      }
      
      const { query, riskProfile } = validationResult.data;
      
      // Check rate limit
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }
      
      // Get latest run_id
      const runId = await storage.getLatestRunId();
      if (!runId) {
        return res.status(404).json({ message: "Nenhuma seleção de ativos encontrada. Execute a seleção primeiro." });
      }
      
      // Get strategy suggestion
      const result = await suggestTradingStrategy(userId, query, storage, runId, riskProfile);
      
      // Save to database
      await storage.createConversation({
        user_id: userId,
        user_message: `Sugestão de estratégia (${riskProfile}): ${query}`,
        ai_response: result.analysis,
        model_used: "gpt-4o-mini",
        tokens_used: 0,
        market_symbols: result.symbols || [],
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Error in strategy suggestion:", error);
      res.status(500).json({ message: error.message || "Failed to suggest strategy" });
    }
  });

  app.get('/api/ai/risk', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check rate limit
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }
      
      // Get risk analysis
      const result = await analyzeRiskProfile(userId, storage);
      
      // Save to database
      await storage.createConversation({
        user_id: userId,
        user_message: "Análise automática de perfil de risco",
        ai_response: result.analysis,
        model_used: "gpt-4o-mini",
        tokens_used: 0,
        market_symbols: [],
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Error in risk analysis:", error);
      res.status(500).json({ message: error.message || "Failed to analyze risk" });
    }
  });

  const campaignRiskSuggestionSchema = z.object({
    initialCapital: z.number().positive("Initial capital must be positive"),
    tradingMode: z.enum(['paper', 'live']),
    duration: z.number().int().min(1).max(365).optional().default(30),
    portfolioName: z.string().optional()
  });

  app.post('/api/ai/campaign-risk-suggestion', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }
      
      const parseResult = campaignRiskSuggestionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const { initialCapital, tradingMode, duration, portfolioName } = parseResult.data;
      
      const context: CampaignContext = {
        initialCapital,
        tradingMode,
        duration,
        portfolioName: portfolioName || undefined
      };
      
      const suggestion = await suggestCampaignRisk(userId, context);
      
      res.json(suggestion);
    } catch (error: any) {
      console.error("Error in campaign risk suggestion:", error);
      res.status(500).json({ message: error.message || "Failed to suggest campaign risk parameters" });
    }
  });

  // Campaign Step Advice - AI coaching for each wizard step
  const campaignStepAdviceSchema = z.object({
    step: z.enum(['market_brief', 'basics', 'mode', 'portfolio', 'assets', 'risk', 'review']),
    context: z.object({
      name: z.string().optional(),
      initialCapital: z.number().optional(),
      duration: z.number().optional(),
      tradingMode: z.enum(['paper', 'live']).optional(),
      portfolioName: z.string().optional(),
      maxDrawdown: z.number().optional(),
      marketStatus: z.string().optional(),
      volatilityLevel: z.string().optional(),
    }).optional(),
    language: z.enum(['en', 'es', 'pt-BR']).optional().default('pt-BR')
  });

  app.post('/api/ai/campaign-step-advice', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }
      
      const parseResult = campaignStepAdviceSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const { step, context, language } = parseResult.data;
      
      // Build contextual prompt based on step
      const stepPrompts: Record<string, string> = {
        market_brief: `Current market conditions for starting a trading campaign. Market status: ${context?.marketStatus || 'unknown'}. Volatility: ${context?.volatilityLevel || 'moderate'}.`,
        basics: `Setting up campaign basics. Name: ${context?.name || 'not set'}. Capital: $${context?.initialCapital || 0}. Duration: ${context?.duration || 30} days.`,
        mode: `Choosing trading mode. Current selection: ${context?.tradingMode || 'paper'}. This affects real money vs simulation.`,
        portfolio: `Selecting portfolio for campaign. Portfolio: ${context?.portfolioName || 'not selected'}.`,
        assets: `Asset selection for trading. The system automatically selects best assets using K-means clustering.`,
        risk: `Configuring risk parameters. Max drawdown: ${context?.maxDrawdown || 10}%. Volatility level: ${context?.volatilityLevel || 'moderate'}.`,
        review: `Final review before launching. Capital: $${context?.initialCapital || 0}, Mode: ${context?.tradingMode || 'paper'}, Duration: ${context?.duration || 30} days, Max Drawdown: ${context?.maxDrawdown || 10}%.`
      };
      
      const languageInstructions: Record<string, string> = {
        'en': 'Respond in English. Use simple, clear language.',
        'es': 'Responde en espanol. Usa lenguaje simple y claro.',
        'pt-BR': 'Responda em portugues brasileiro. Use linguagem simples e clara.'
      };
      
      const systemPrompt = `You are DELFOS AI, a friendly trading assistant helping users set up their cryptocurrency trading campaigns. 
${languageInstructions[language]}
Keep responses under 100 words.
Be encouraging but realistic about risks.
Focus on practical advice for the current step.`;

      const userPrompt = `The user is on the "${step}" step of campaign setup.
Context: ${stepPrompts[step] || 'General campaign setup'}
Provide a brief, helpful tip for this step. Include one specific actionable suggestion.`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      
      const response = await getChatCompletion(messages, userId);
      
      res.json({
        step,
        advice: response,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error in campaign step advice:", error);
      res.status(500).json({ message: error.message || "Failed to get step advice" });
    }
  });

  // Campaign Summary - AI narrative recap with pros/cons
  const campaignSummarySchema = z.object({
    name: z.string(),
    initialCapital: z.number().positive(),
    duration: z.number().int().min(1).max(365),
    tradingMode: z.enum(['paper', 'live']),
    portfolioName: z.string(),
    maxDrawdown: z.number().min(1).max(50),
    marketStatus: z.string().optional(),
    volatilityLevel: z.string().optional(),
    totalAssets: z.number().optional(),
    clusterCount: z.number().optional(),
    language: z.enum(['en', 'es', 'pt-BR']).optional().default('pt-BR')
  });

  app.post('/api/ai/campaign-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }
      
      const parseResult = campaignSummarySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const config = parseResult.data;
      
      const languageInstructions: Record<string, string> = {
        'en': 'Respond in English.',
        'es': 'Responde en espanol.',
        'pt-BR': 'Responda em portugues brasileiro.'
      };
      
      const systemPrompt = `You are DELFOS AI, a professional trading assistant.
${languageInstructions[config.language]}
Provide a balanced, honest analysis.
Format your response as JSON with these fields:
- summary: A 2-3 sentence executive summary
- pros: Array of 3 advantages of this configuration
- cons: Array of 2-3 potential risks or considerations
- overallScore: A score from 1-10 rating this campaign setup
- recommendation: A single actionable recommendation`;

      const userPrompt = `Analyze this trading campaign configuration:
- Campaign Name: ${config.name}
- Initial Capital: $${config.initialCapital}
- Duration: ${config.duration} days
- Trading Mode: ${config.tradingMode === 'live' ? 'LIVE (real money)' : 'PAPER (simulation)'}
- Portfolio: ${config.portfolioName}
- Max Drawdown Limit: ${config.maxDrawdown}%
- Market Status: ${config.marketStatus || 'normal'}
- Volatility Level: ${config.volatilityLevel || 'moderate'}
- Assets to Trade: ${config.totalAssets || 30} across ${config.clusterCount || 5} clusters

Provide your analysis as valid JSON.`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      
      const response = await getChatCompletion(messages, userId);
      
      // Try to parse as JSON, fallback to text if needed
      let analysis;
      try {
        // Remove markdown code blocks if present
        const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        analysis = JSON.parse(cleanResponse);
      } catch {
        analysis = {
          summary: response,
          pros: [],
          cons: [],
          overallScore: 7,
          recommendation: 'Review the configuration and proceed when ready.'
        };
      }
      
      res.json({
        ...analysis,
        config: {
          name: config.name,
          initialCapital: config.initialCapital,
          duration: config.duration,
          tradingMode: config.tradingMode,
          maxDrawdown: config.maxDrawdown,
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error in campaign summary:", error);
      res.status(500).json({ message: error.message || "Failed to generate campaign summary" });
    }
  });

  // ============================================================================
  // AI LEARNING ENDPOINTS
  // ============================================================================

  const campaignLearningSchema = z.object({
    scope: z.enum(['global', 'portfolio', 'campaign']),
    portfolioId: z.string().optional(),
    campaignId: z.string().optional(),
    windowDays: z.number().int().min(7).max(365).optional().default(30),
  });

  app.post('/api/ai/learning/campaign/analyze', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }
      
      const parseResult = campaignLearningSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const { scope, portfolioId, campaignId, windowDays } = parseResult.data;
      
      if (portfolioId) {
        const portfolio = await storage.getPortfolio(portfolioId);
        if (!portfolio) {
          return res.status(404).json({ message: "Portfolio not found" });
        }
        if (portfolio.user_id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      if (campaignId) {
        const campaign = await storage.getCampaign(campaignId);
        if (!campaign) {
          return res.status(404).json({ message: "Campaign not found" });
        }
        const portfolio = await storage.getPortfolio(campaign.portfolio_id);
        if (!portfolio || portfolio.user_id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      const run = await campaignPatternLearnerService.runAnalysis({
        scope,
        portfolioId,
        campaignId,
        userId,
        windowDays,
      });
      
      res.json({
        runId: run.id,
        status: run.status,
        patternsDiscovered: run.patterns_discovered,
        patternsUpdated: run.patterns_updated,
        message: "Analysis started successfully",
      });
    } catch (error: any) {
      console.error("Error in campaign pattern analysis:", error);
      res.status(500).json({ message: error.message || "Failed to run pattern analysis" });
    }
  });

  app.get('/api/ai/learning/campaign/patterns', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { scope, portfolioId, campaignId, patternType } = req.query;
      
      if (campaignId) {
        const campaign = await storage.getCampaign(campaignId as string);
        if (!campaign) {
          return res.status(404).json({ message: "Campaign not found" });
        }
        const portfolio = await storage.getPortfolio(campaign.portfolio_id);
        if (!portfolio || portfolio.user_id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      if (portfolioId) {
        const portfolio = await storage.getPortfolio(portfolioId as string);
        if (!portfolio) {
          return res.status(404).json({ message: "Portfolio not found" });
        }
        if (portfolio.user_id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      if (scope === 'portfolio' && !portfolioId) {
        return res.status(400).json({ message: "portfolioId required for portfolio scope" });
      }
      if (scope === 'campaign' && !campaignId) {
        return res.status(400).json({ message: "campaignId required for campaign scope" });
      }
      
      const patterns = await campaignPatternLearnerService.getActivePatterns({
        scope: scope as string,
        portfolioId: portfolioId as string,
        campaignId: campaignId as string,
        patternType: patternType as any,
      });
      
      res.json({ patterns, count: patterns.length });
    } catch (error: any) {
      console.error("Error fetching campaign patterns:", error);
      res.status(500).json({ message: error.message || "Failed to fetch patterns" });
    }
  });

  app.get('/api/ai/learning/campaign/:campaignId/recommendations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { campaignId } = req.params;
      
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      if (!portfolio || portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const recommendations = await campaignPatternLearnerService.getRecommendations(campaignId);
      
      res.json(recommendations);
    } catch (error: any) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ message: error.message || "Failed to fetch recommendations" });
    }
  });

  const opportunityLearningSchema = z.object({
    scope: z.enum(['global', 'portfolio', 'user']),
    portfolioId: z.string().optional(),
    windowDays: z.number().int().min(7).max(365).optional().default(60),
  });

  app.post('/api/ai/learning/opportunity/analyze', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const rateLimitCheck = checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }
      
      const parseResult = opportunityLearningSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const { scope, portfolioId, windowDays } = parseResult.data;
      
      if (portfolioId) {
        const portfolio = await storage.getPortfolio(portfolioId);
        if (!portfolio) {
          return res.status(404).json({ message: "Portfolio not found" });
        }
        if (portfolio.user_id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      const run = await opportunityLearnerService.runAnalysis({
        scope,
        userId,
        portfolioId,
        windowDays,
      });
      
      res.json({
        runId: run.id,
        status: run.status,
        patternsDiscovered: run.patterns_discovered,
        patternsUpdated: run.patterns_updated,
        message: "Analysis started successfully",
      });
    } catch (error: any) {
      console.error("Error in opportunity pattern analysis:", error);
      res.status(500).json({ message: error.message || "Failed to run pattern analysis" });
    }
  });

  app.get('/api/ai/learning/opportunity/patterns', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { scope, portfolioId, patternType } = req.query;
      
      if (portfolioId) {
        const portfolio = await storage.getPortfolio(portfolioId as string);
        if (!portfolio) {
          return res.status(404).json({ message: "Portfolio not found" });
        }
        if (portfolio.user_id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      if (scope === 'portfolio' && !portfolioId) {
        return res.status(400).json({ message: "portfolioId required for portfolio scope" });
      }
      
      const effectiveUserId = scope === 'user' ? userId : undefined;
      
      const patterns = await opportunityLearnerService.getActivePatterns({
        scope: scope as string,
        userId: effectiveUserId,
        portfolioId: portfolioId as string,
        patternType: patternType as any,
      });
      
      res.json({ patterns, count: patterns.length });
    } catch (error: any) {
      console.error("Error fetching opportunity patterns:", error);
      res.status(500).json({ message: error.message || "Failed to fetch patterns" });
    }
  });

  app.get('/api/ai/learning/opportunity/calibration', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const calibration = await opportunityLearnerService.getScoringCalibration(userId);
      
      res.json(calibration);
    } catch (error: any) {
      console.error("Error fetching scoring calibration:", error);
      res.status(500).json({ message: error.message || "Failed to fetch calibration" });
    }
  });

  app.get('/api/ai/learning/runs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { learnerType, limit } = req.query;
      
      let conditions = [eq(learning_runs.user_id, userId)];
      
      if (learnerType) {
        conditions.push(eq(learning_runs.learner_type, learnerType as string));
      }
      
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      
      const runs = await db.select()
        .from(learning_runs)
        .where(whereClause)
        .orderBy(desc(learning_runs.started_at))
        .limit(parseInt(limit as string) || 20);
      
      res.json({ runs, count: runs.length });
    } catch (error: any) {
      console.error("Error fetching learning runs:", error);
      res.status(500).json({ message: error.message || "Failed to fetch learning runs" });
    }
  });

  // Performance routes
  app.get('/api/portfolios/:portfolioId/performance/overview', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const overview = await performanceService.getOverview(portfolioId);
      res.json(overview);
    } catch (error) {
      console.error("Error fetching performance overview:", error);
      res.status(500).json({ message: "Failed to fetch performance overview" });
    }
  });

  app.get('/api/portfolios/:portfolioId/performance/drawdown', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const drawdown = await performanceService.getDrawdownMetrics(portfolioId);
      res.json(drawdown);
    } catch (error) {
      console.error("Error fetching drawdown metrics:", error);
      res.status(500).json({ message: "Failed to fetch drawdown metrics" });
    }
  });

  app.get('/api/portfolios/:portfolioId/performance/chart', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      const limit = req.query.limit ? validateQueryLimit(req.query.limit) : 100;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const chartData = await performanceService.getChartData(portfolioId, limit);
      res.json(chartData);
    } catch (error: any) {
      if (error.message?.includes('Invalid limit')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error fetching chart data:", error);
      res.status(500).json({ message: "Failed to fetch chart data" });
    }
  });

  app.get('/api/portfolios/:portfolioId/performance/trades', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const trades = await storage.getTradesByPortfolioId(portfolioId);
      res.json(trades);
    } catch (error) {
      console.error("Error fetching trades:", error);
      res.status(500).json({ message: "Failed to fetch trades" });
    }
  });

  app.post('/api/portfolios/:portfolioId/performance/snapshot', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const snapshot = await performanceService.createPerformanceSnapshot(portfolioId);
      res.json(snapshot);
    } catch (error) {
      console.error("Error creating snapshot:", error);
      res.status(500).json({ message: "Failed to create snapshot" });
    }
  });

  // Trading routes
  const tradingService = new TradingService(storage);

  app.post('/api/trading/positions/open', isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body with Zod
      const validationResult = openPositionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid position data", 
          errors: validationResult.error.errors 
        });
      }

      const { portfolioId, symbol, side, quantity, stopLoss, takeProfit } = validationResult.data;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const position = await tradingService.openPosition({
        portfolioId,
        symbol,
        side,
        quantity,
        stopLoss,
        takeProfit,
      });

      res.json(position);
    } catch (error: any) {
      console.error("Error opening position:", error);
      res.status(500).json({ message: error.message || "Failed to open position" });
    }
  });

  app.post('/api/trading/positions/:id/close', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { exitPrice, realizedPnl } = req.body;
      
      // Get position to verify ownership
      const position = await storage.getPosition(id);
      if (!position) {
        return res.status(404).json({ message: "Position not found" });
      }

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(position.portfolio_id);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Close position
      // PRODUCTION: Uses server-side market price (SECURITY: never trust client price)
      // TEST MODE: Accepts optional exitPrice/realizedPnl for deterministic testing
      await tradingService.closePosition({ 
        positionId: id,
        exitPrice,
        realizedPnl,
      });
      res.json({ message: "Position closed successfully" });
    } catch (error: any) {
      console.error("Error closing position:", error);
      res.status(500).json({ message: error.message || "Failed to close position" });
    }
  });

  // Get positions for a portfolio (with security checks)
  app.get('/api/trading/positions', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.query;
      
      if (!portfolioId || typeof portfolioId !== 'string') {
        return res.status(400).json({ message: "Portfolio ID required" });
      }
      
      // Verify portfolio belongs to user (SECURITY: ownership check)
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const positions = await storage.getPositionsByPortfolioId(portfolioId);
      res.json(positions);
    } catch (error: any) {
      console.error("Error fetching positions:", error);
      res.status(500).json({ message: error.message || "Failed to fetch positions" });
    }
  });

  app.get('/api/trading/symbols', isAuthenticated, async (req: any, res) => {
    try {
      const symbols = await tradingService.getAvailableSymbols();
      res.json(symbols);
    } catch (error) {
      console.error("Error fetching symbols:", error);
      res.status(500).json({ message: "Failed to fetch symbols" });
    }
  });

  app.post('/api/trading/positions/:portfolioId/update-prices', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await tradingService.updatePositionPrices(portfolioId);
      res.json({ message: "Prices updated successfully" });
    } catch (error) {
      console.error("Error updating prices:", error);
      res.status(500).json({ message: "Failed to update prices" });
    }
  });

  // ========== MARKET DATA ENDPOINTS ==========
  // POST /api/market/metrics - Get real-time market metrics for multiple symbols
  app.post('/api/market/metrics', isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body with Zod
      const validationResult = marketMetricsSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Invalid request data",
          errors: validationResult.error.errors
        });
      }

      const { symbols } = validationResult.data;

      // Fetch market metrics (graceful partial responses)
      const { metrics, unknownSymbols } = await fetchMarketMetrics(symbols);

      // Return 200 with partial data, even if some symbols are unknown
      res.json({
        metrics,
        unknownSymbols,
        message: unknownSymbols.length > 0 
          ? `Warning: ${unknownSymbols.length} unknown symbols`
          : undefined
      });
    } catch (error: any) {
      console.error("[Market Metrics] Error:", error);
      res.status(500).json({ message: "Failed to fetch market metrics" });
    }
  });

  // ========== TRADING SIGNALS ENDPOINTS ==========
  // Initialize CircuitBreakerService early for SignalEngine dependency
  const circuitBreakerService = new CircuitBreakerService(storage);
  const signalEngine = new SignalEngine(circuitBreakerService);

  // POST /api/signals/scan - Scan for trading signals
  app.post('/api/signals/scan', isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body with Zod
      const validationResult = signalsScanSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.errors 
        });
      }

      const { portfolioId, marketData } = validationResult.data;

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check for duplicate pending signals to avoid noise
      const existingPendingSignals = await db
        .select()
        .from(signalsTable)
        .where(
          and(
            eq(signalsTable.portfolio_id, portfolioId),
            eq(signalsTable.status, 'pending')
          )
        );

      const pendingSymbols = new Set(existingPendingSignals.map(s => s.symbol));
      
      // Filter out symbols that already have pending signals
      const filteredMarketData = marketData.filter(md => !pendingSymbols.has(md.symbol));

      if (filteredMarketData.length === 0) {
        return res.json({ 
          message: "No new signals generated (all symbols have pending signals)",
          signalIds: [],
          signals: []
        });
      }

      // Scan for signals (only new symbols)
      const signals = await signalEngine.scanForSignals(portfolioId, filteredMarketData);
      
      // Persist signals to database
      const signalIds = await signalEngine.persistSignals(signals);

      res.json({ 
        message: `Generated ${signals.length} signals (filtered ${marketData.length - filteredMarketData.length} duplicates)`,
        signalIds,
        signals 
      });
    } catch (error) {
      console.error("Error scanning for signals:", error);
      res.status(500).json({ message: "Failed to scan for signals" });
    }
  });

  // GET /api/signals - Get signals for a portfolio
  app.get('/api/signals', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId, status, limit } = req.query;

      if (!portfolioId || typeof portfolioId !== 'string') {
        return res.status(400).json({ message: "portfolioId required" });
      }

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate and constrain limit parameter (default: 100, max: 10000)
      const validatedLimit = limit ? validateQueryLimit(limit) : 100;

      // Validate status parameter
      const validStatuses = ['pending', 'executed', 'expired', 'cancelled'];
      if (status && !validStatuses.includes(status as string)) {
        return res.status(400).json({ 
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
      }

      // Build query conditions
      const conditions = [eq(signalsTable.portfolio_id, portfolioId)];
      
      // Add status filter if provided
      if (status) {
        conditions.push(eq(signalsTable.status, status as string));
      }

      // Fetch signals with pagination
      const signals = await db
        .select()
        .from(signalsTable)
        .where(and(...conditions))
        .orderBy(desc(signalsTable.generated_at))
        .limit(validatedLimit!);

      res.json(signals);
    } catch (error) {
      console.error("Error fetching signals:", error);
      
      // Handle validation errors gracefully
      if (error instanceof Error && error.message.includes('Invalid limit')) {
        return res.status(400).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to fetch signals" });
    }
  });

  // PUT /api/signals/:id/status - Update signal status
  app.put('/api/signals/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, positionId, executionPrice, reason } = req.body;

      // Validate target status
      const validTerminalStatuses = ['executed', 'expired', 'cancelled'];
      if (!status || !validTerminalStatuses.includes(status)) {
        return res.status(400).json({ 
          message: `Invalid status. Must be one of: ${validTerminalStatuses.join(', ')}` 
        });
      }

      // Get signal to verify ownership and current status
      const signal = await db
        .select()
        .from(signalsTable)
        .where(eq(signalsTable.id, id))
        .limit(1);

      if (!signal || signal.length === 0) {
        return res.status(404).json({ message: "Signal not found" });
      }

      const currentSignal = signal[0];

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(currentSignal.portfolio_id);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate state transition: only 'pending' can transition to terminal states
      if (currentSignal.status !== 'pending') {
        return res.status(400).json({ 
          message: `Invalid state transition. Signal is already '${currentSignal.status}'. Only 'pending' signals can be updated.` 
        });
      }

      // Validate required fields based on target status
      if (status === 'executed') {
        if (!positionId || typeof executionPrice !== 'number') {
          return res.status(400).json({ 
            message: "positionId (string) and executionPrice (number) are required for 'executed' status" 
          });
        }
      } else if (status === 'expired' || status === 'cancelled') {
        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
          return res.status(400).json({ 
            message: "reason (non-empty string) is required for 'expired' or 'cancelled' status" 
          });
        }
      }

      // Update signal status
      await signalEngine.updateSignalStatus(id, status, positionId, executionPrice, reason);

      res.json({ 
        message: `Signal status updated to '${status}' successfully`,
        signalId: id,
        previousStatus: 'pending',
        newStatus: status 
      });
    } catch (error) {
      console.error("Error updating signal status:", error);
      res.status(500).json({ message: "Failed to update signal status" });
    }
  });

  // POST /api/signals/config - Create or update signal config
  app.post('/api/signals/config', isAuthenticated, async (req: any, res) => {
    try {
      const configData = req.body;

      if (!configData.portfolioId || !configData.symbol) {
        return res.status(400).json({ message: "portfolioId and symbol required" });
      }

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(configData.portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if config already exists
      const existingConfig = await db
        .select()
        .from(signalConfigsTable)
        .where(
          and(
            eq(signalConfigsTable.portfolio_id, configData.portfolioId),
            eq(signalConfigsTable.symbol, configData.symbol)
          )
        )
        .limit(1);

      let result;
      if (existingConfig && existingConfig.length > 0) {
        // Update existing config
        result = await db
          .update(signalConfigsTable)
          .set({
            long_threshold_atr_multiplier: configData.long_threshold_atr_multiplier,
            short_threshold_atr_multiplier: configData.short_threshold_atr_multiplier,
            tp1_atr_multiplier: configData.tp1_atr_multiplier,
            tp2_atr_multiplier: configData.tp2_atr_multiplier,
            sl_atr_multiplier: configData.sl_atr_multiplier,
            tp1_close_percentage: configData.tp1_close_percentage,
            risk_per_trade_bps: configData.risk_per_trade_bps,
            enabled: configData.enabled !== undefined ? configData.enabled : true,
            updated_at: new Date(),
          })
          .where(eq(signalConfigsTable.id, existingConfig[0].id))
          .returning();
      } else {
        // Create new config
        const newConfig = {
          portfolio_id: configData.portfolioId,
          symbol: configData.symbol,
          long_threshold_atr_multiplier: configData.long_threshold_atr_multiplier || "2.0",
          short_threshold_atr_multiplier: configData.short_threshold_atr_multiplier || "1.5",
          tp1_atr_multiplier: configData.tp1_atr_multiplier || "1.2",
          tp2_atr_multiplier: configData.tp2_atr_multiplier || "2.5",
          sl_atr_multiplier: configData.sl_atr_multiplier || "1.0",
          tp1_close_percentage: configData.tp1_close_percentage || "50.00",
          risk_per_trade_bps: configData.risk_per_trade_bps || 20,
          enabled: configData.enabled !== undefined ? configData.enabled : true,
        };

        result = await db
          .insert(signalConfigsTable)
          .values(newConfig)
          .returning();
      }

      res.json({ 
        message: "Signal config saved successfully", 
        config: result[0] 
      });
    } catch (error) {
      console.error("Error saving signal config:", error);
      res.status(500).json({ message: "Failed to save signal config" });
    }
  });

  // GET /api/signals/config - Get signal configs for a portfolio
  app.get('/api/signals/config', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId, symbol } = req.query;

      if (!portfolioId) {
        return res.status(400).json({ message: "portfolioId required" });
      }

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Fetch configs
      let configs;
      if (symbol) {
        configs = await db
          .select()
          .from(signalConfigsTable)
          .where(
            and(
              eq(signalConfigsTable.portfolio_id, portfolioId),
              eq(signalConfigsTable.symbol, symbol)
            )
          );
      } else {
        configs = await db
          .select()
          .from(signalConfigsTable)
          .where(eq(signalConfigsTable.portfolio_id, portfolioId))
          .orderBy(signalConfigsTable.symbol);
      }

      res.json(configs);
    } catch (error) {
      console.error("Error fetching signal configs:", error);
      res.status(500).json({ message: "Failed to fetch signal configs" });
    }
  });

  // Risk Management endpoints
  const riskService = new RiskService(storage);
  // Note: circuitBreakerService already initialized above for SignalEngine
  
  // Fees Service (cost-integrated position sizing)
  const { feesService } = await import('./services/fees/feesService.js');
  
  // Order Execution Service (Kraken API integration)
  // Uses lazy initialization - only fails when actually calling Kraken API
  const orderExecutionService = new OrderExecutionService(storage);

  app.get('/api/risk/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const riskMetrics = await riskService.getPortfolioRiskMetrics(portfolioId);
      res.json(riskMetrics);
    } catch (error) {
      console.error("Error fetching risk metrics:", error);
      res.status(500).json({ message: "Failed to fetch risk metrics" });
    }
  });

  app.put('/api/risk/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const riskData = {
        portfolio_id: portfolioId,
        max_position_size_percentage: req.body.max_position_size_percentage,
        max_daily_loss_percentage: req.body.max_daily_loss_percentage,
        max_portfolio_heat_percentage: req.body.max_portfolio_heat_percentage,
        circuit_breaker_enabled: req.body.circuit_breaker_enabled,
      };

      // Validate request body with Zod
      const validationResult = insertRiskParametersSchema.safeParse(riskData);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid risk parameters", 
          errors: validationResult.error.errors 
        });
      }

      // Map to riskService format (portfolioId camelCase)
      const updated = await riskService.updateRiskParameters({
        portfolioId,
        max_position_size_percentage: validationResult.data.max_position_size_percentage,
        max_daily_loss_percentage: validationResult.data.max_daily_loss_percentage,
        max_portfolio_heat_percentage: validationResult.data.max_portfolio_heat_percentage,
        circuit_breaker_enabled: validationResult.data.circuit_breaker_enabled,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating risk parameters:", error);
      res.status(500).json({ message: "Failed to update risk parameters" });
    }
  });

  app.post('/api/risk/:portfolioId/reset-circuit-breaker', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await circuitBreakerService.resetGlobalBreaker(portfolioId);
      res.json({ message: "Circuit breaker reset successfully" });
    } catch (error) {
      console.error("Error resetting circuit breaker:", error);
      res.status(500).json({ message: "Failed to reset circuit breaker" });
    }
  });

  // POST /api/risk/sizing - Calculate position size with cost integration
  const sizingRequestSchema = z.object({
    portfolioId: z.string().uuid(),
    equity: z.number().positive(),
    riskBps: z.number().int().positive().max(1000), // Max 10% risk (1000 bps)
    slDecimal: z.number().positive().max(1), // Stop loss as decimal (e.g., 0.015 = 1.5%)
    symbol: z.string().min(1),
    volatilityScaleFactor: z.number().positive().optional().default(1.0),
  });

  app.post('/api/risk/sizing', isAuthenticated, async (req: any, res) => {
    try {
      // Validate and parse request body with Zod
      const validationResult = sizingRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: validationResult.error.errors 
        });
      }

      const { portfolioId, equity, riskBps, slDecimal, symbol, volatilityScaleFactor } = validationResult.data;

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get Kraken exchange ID (hardcoded for MVP, will be configurable later)
      const exchanges = await storage.getAllExchanges();
      const kraken = exchanges.find(ex => ex.name.toLowerCase() === "kraken");
      if (!kraken) {
        return res.status(500).json({ message: "Kraken exchange not found" });
      }

      // Calculate fees breakdown
      const fees = await feesService.calculateFees(kraken.id, symbol);

      // Calculate position size with cost integration
      // slDecimal is already in decimal form (0.015 = 1.5%), no conversion needed
      const positionSize = await feesService.calculatePositionSize(
        equity,
        riskBps,
        slDecimal,
        kraken.id,
        symbol,
        volatilityScaleFactor
      );

      // Check if position respects risk caps (cluster and global limits)
      // Cluster cap: 12-15% of equity per cluster (using 12% as default)
      // Global cap: 100% of equity total
      const CLUSTER_CAP_PCT = 0.12; // 12% per cluster
      const GLOBAL_CAP_PCT = 1.0;   // 100% global
      
      const clusterCapUsd = equity * CLUSTER_CAP_PCT;
      const globalCapUsd = equity * GLOBAL_CAP_PCT;
      
      const capsRespected = positionSize <= clusterCapUsd && positionSize <= globalCapUsd;

      res.json({
        positionSizeUsd: positionSize,
        qty: positionSize, // Alias for API spec compliance
        notional: positionSize,
        caps_respected: capsRespected,
        equity,
        riskBps,
        slDecimal,
        slPercent: slDecimal * 100,
        symbol,
        fees: {
          makerFeePct: fees.makerFeePct,
          takerFeePct: fees.takerFeePct,
          avgSlippagePct: fees.avgSlippagePct,
          feeAvgPct: fees.feeAvgPct,
          roundTripCostPct: fees.roundTripCostPct,
        },
        formula: {
          numerator: (riskBps / 10000) * equity,
          denominator: slDecimal + fees.feeAvgPct + fees.avgSlippagePct,
        },
        caps: {
          clusterCapPct: CLUSTER_CAP_PCT * 100,
          clusterCapUsd: clusterCapUsd,
          globalCapPct: GLOBAL_CAP_PCT * 100,
          globalCapUsd: globalCapUsd,
        },
      });
    } catch (error) {
      console.error("Error calculating position size:", error);
      res.status(500).json({ message: "Failed to calculate position size" });
    }
  });

  // ========== TAX MANAGEMENT ROUTES ==========
  const { TaxService } = await import('./services/tax/taxService.js');
  const taxService = new TaxService(storage);

  // GET /api/tax-profiles - Get all tax profiles for current user
  app.get('/api/tax-profiles', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profiles = await storage.getTaxProfilesByUserId(userId);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching tax profiles:", error);
      res.status(500).json({ message: "Failed to fetch tax profiles" });
    }
  });

  // GET /api/tax-profiles/active - Get active tax profile for current year
  app.get('/api/tax-profiles/active', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const taxYear = parseInt(req.query.taxYear as string) || new Date().getFullYear();
      const profile = await taxService.getActiveTaxProfile(userId, taxYear);
      res.json(profile);
    } catch (error) {
      console.error("Error fetching active tax profile:", error);
      res.status(500).json({ message: "Failed to fetch active tax profile" });
    }
  });

  // POST /api/tax-profiles - Create or update tax profile
  const taxProfileRequestSchema = z.object({
    country_code: z.string().length(2),
    tax_regime: z.string().min(1),
    short_term_rate_pct: z.number().min(0).max(100),
    long_term_rate_pct: z.number().min(0).max(100),
    minimum_taxable_amount: z.number().min(0),
    tax_year: z.number().int().min(2020).max(2100),
    description: z.string().optional(),
  });

  app.post('/api/tax-profiles', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const validationResult = taxProfileRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid tax profile data", 
          errors: validationResult.error.errors 
        });
      }

      // Convert numbers to string decimals for database
      const profileData = {
        country_code: validationResult.data.country_code,
        tax_regime: validationResult.data.tax_regime,
        short_term_rate_pct: validationResult.data.short_term_rate_pct.toString(),
        long_term_rate_pct: validationResult.data.long_term_rate_pct.toString(),
        minimum_taxable_amount: validationResult.data.minimum_taxable_amount.toString(),
        tax_year: validationResult.data.tax_year,
        description: validationResult.data.description,
      };

      const profile = await taxService.upsertTaxProfile(userId, profileData);
      res.json(profile);
    } catch (error) {
      console.error("Error creating tax profile:", error);
      res.status(500).json({ message: "Failed to create tax profile" });
    }
  });

  // GET /api/trade-costs/:portfolioId - Get trade costs for a portfolio
  app.get('/api/trade-costs/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      const { startDate, endDate } = req.query;

      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const costs = await taxService.getPortfolioTradeCosts(portfolioId, start, end);
      res.json(costs);
    } catch (error) {
      console.error("Error fetching trade costs:", error);
      res.status(500).json({ message: "Failed to fetch trade costs" });
    }
  });

  // GET /api/tax-summary/:portfolioId - Get tax summary for a portfolio
  app.get('/api/tax-summary/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      const taxYear = parseInt(req.query.taxYear as string) || new Date().getFullYear();

      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const summary = await taxService.getPortfolioTaxSummary(portfolioId, taxYear);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching tax summary:", error);
      res.status(500).json({ message: "Failed to fetch tax summary" });
    }
  });

  // GET /api/costs/impact/:portfolioId - Get cost impact analysis for dashboard
  app.get('/api/costs/impact/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      const taxYear = parseInt(req.query.taxYear as string) || new Date().getFullYear();

      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get tax summary which includes all cost breakdowns
      const summary = await taxService.getPortfolioTaxSummary(portfolioId, taxYear);
      
      // Calculate impact percentages
      const grossProfit = summary.totalGrossPnl;
      const feesImpact = grossProfit !== 0 ? (summary.totalFees / Math.abs(grossProfit)) * 100 : 0;
      const slippageImpact = grossProfit !== 0 ? (summary.totalSlippage / Math.abs(grossProfit)) * 100 : 0;
      const taxImpact = grossProfit !== 0 ? (summary.totalTaxOwed / Math.abs(grossProfit)) * 100 : 0;
      const totalCostImpact = feesImpact + slippageImpact + taxImpact;

      res.json({
        portfolioId,
        taxYear,
        summary: {
          grossProfit: summary.totalGrossPnl,
          netProfit: summary.totalNetAfterTax,
          totalFees: summary.totalFees,
          totalSlippage: summary.totalSlippage,
          totalTaxes: summary.totalTaxOwed,
          totalCosts: summary.totalCosts + summary.totalTaxOwed,
        },
        impact: {
          feesPercentage: parseFloat(feesImpact.toFixed(2)),
          slippagePercentage: parseFloat(slippageImpact.toFixed(2)),
          taxPercentage: parseFloat(taxImpact.toFixed(2)),
          totalPercentage: parseFloat(totalCostImpact.toFixed(2)),
        },
        breakdown: [
          { 
            type: 'fees', 
            label: 'Trading Fees', 
            amount: summary.totalFees, 
            percentage: parseFloat(feesImpact.toFixed(2)),
            color: '#5B9FB5' 
          },
          { 
            type: 'slippage', 
            label: 'Slippage', 
            amount: summary.totalSlippage, 
            percentage: parseFloat(slippageImpact.toFixed(2)),
            color: '#7DD3E8' 
          },
          { 
            type: 'taxes', 
            label: 'Taxes', 
            amount: summary.totalTaxOwed, 
            percentage: parseFloat(taxImpact.toFixed(2)),
            color: '#A8B5BD' 
          },
        ],
        stats: {
          tradesCount: summary.tradesCount,
          profitableTrades: summary.profitableTrades,
          winRate: summary.tradesCount > 0 
            ? parseFloat(((summary.profitableTrades / summary.tradesCount) * 100).toFixed(1)) 
            : 0,
          effectiveTaxRate: parseFloat(summary.effectiveTaxRate.toFixed(2)),
          countryCode: summary.countryCode,
          taxRegime: summary.regime,
        },
      });
    } catch (error) {
      console.error("Error fetching cost impact:", error);
      res.status(500).json({ message: "Failed to fetch cost impact analysis" });
    }
  });

  // GET /api/tax/profile/suggest - Suggest tax profile based on IP geolocation
  app.get('/api/tax/profile/suggest', isAuthenticated, async (req: any, res) => {
    try {
      // Get IP address from request
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
        || req.headers['x-real-ip'] 
        || req.socket?.remoteAddress 
        || '127.0.0.1';

      // Country code mapping based on common IP patterns
      // In production, this would use a real geolocation service like MaxMind or ip-api
      let suggestedCountry = 'US'; // Default fallback
      let confidence = 'low';

      // Try to get country from Cloudflare header if available
      const cfCountry = req.headers['cf-ipcountry'];
      if (cfCountry && cfCountry !== 'XX') {
        suggestedCountry = cfCountry;
        confidence = 'high';
      }

      // Map country code to tax regime
      const { TAX_REGIMES } = await import('./services/tax/taxService.js');
      let suggestedRegime;
      let description;

      switch (suggestedCountry) {
        case 'BR':
          suggestedRegime = TAX_REGIMES.BR_DAY_TRADING;
          description = 'Brazil - Day Trading (15% daily net profit)';
          break;
        case 'US':
          suggestedRegime = TAX_REGIMES.US_SHORT_TERM;
          description = 'United States - Short-term Capital Gains';
          break;
        case 'AE':
          suggestedRegime = TAX_REGIMES.AE_EXEMPT;
          description = 'UAE - Crypto Tax Exempt';
          break;
        case 'SG':
          suggestedRegime = TAX_REGIMES.SG_EXEMPT;
          description = 'Singapore - Crypto Tax Exempt';
          break;
        default:
          // EU countries
          const euCountries = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'SE', 'DK', 'PL', 'CZ', 'GR'];
          if (euCountries.includes(suggestedCountry)) {
            suggestedRegime = TAX_REGIMES.EU_CAPITAL_GAINS;
            description = 'European Union - Capital Gains Tax';
          } else {
            suggestedRegime = TAX_REGIMES.US_SHORT_TERM;
            description = 'Default - Short-term Capital Gains';
            confidence = 'low';
          }
      }

      res.json({
        detectedCountry: suggestedCountry,
        confidence,
        suggestion: {
          country_code: suggestedRegime.countryCode,
          tax_regime: suggestedRegime.regime,
          short_term_rate_pct: suggestedRegime.shortTermRate,
          long_term_rate_pct: suggestedRegime.longTermRate,
          minimum_taxable_amount: suggestedRegime.minimumTaxable,
          description,
        },
        availableRegimes: Object.entries(TAX_REGIMES).map(([key, regime]) => ({
          key,
          countryCode: regime.countryCode,
          regime: regime.regime,
          shortTermRate: regime.shortTermRate,
          longTermRate: regime.longTermRate,
          description: regime.description,
        })),
      });
    } catch (error) {
      console.error("Error suggesting tax profile:", error);
      res.status(500).json({ message: "Failed to suggest tax profile" });
    }
  });

  // GET /api/tax/report/:portfolioId - Export compliance report as CSV
  app.get('/api/tax/report/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      const taxYear = parseInt(req.query.taxYear as string) || new Date().getFullYear();
      const format = req.query.format || 'csv';

      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get all trade costs for the year
      const startDate = new Date(taxYear, 0, 1);
      const endDate = new Date(taxYear, 11, 31, 23, 59, 59);
      const tradeCosts = await storage.getTradeCostsByPortfolio(portfolioId, startDate, endDate);

      // Get trades to include symbol and side information
      const trades = await storage.getTradesByPortfolioId(portfolioId);
      const tradesMap = new Map(trades.map(t => [t.id, t]));

      // Get tax summary
      const summary = await taxService.getPortfolioTaxSummary(portfolioId, taxYear);

      // Get tax profile for header info
      const taxProfile = await taxService.getActiveTaxProfile(userId, taxYear);

      if (format === 'csv') {
        // Generate CSV content
        const csvHeader = [
          'Date',
          'Trade ID',
          'Symbol',
          'Side',
          'Gross PnL (USD)',
          'Fees (USD)',
          'Slippage (USD)',
          'Total Cost (USD)',
          'Net PnL (USD)',
          'Tax Owed (USD)',
          'Net After Tax (USD)',
        ].join(',');

        const csvRows = tradeCosts.map(cost => {
          const trade = tradesMap.get(cost.trade_id);
          return [
            cost.created_at.toISOString().split('T')[0],
            cost.trade_id,
            trade?.symbol || 'N/A',
            trade?.side || 'N/A',
            cost.gross_pnl_usd,
            cost.total_fees_usd,
            cost.total_slippage_usd,
            cost.total_cost_usd,
            cost.net_pnl_usd,
            cost.tax_owed_usd,
            cost.net_after_tax_usd,
          ].join(',');
        });

        // Add summary at the bottom
        const csvSummary = [
          '',
          'SUMMARY',
          `Tax Year,${taxYear}`,
          `Country Code,${summary.countryCode}`,
          `Tax Regime,${summary.regime}`,
          `Total Trades,${summary.tradesCount}`,
          `Profitable Trades,${summary.profitableTrades}`,
          `Total Gross PnL,$${summary.totalGrossPnl.toFixed(2)}`,
          `Total Fees,$${summary.totalFees.toFixed(2)}`,
          `Total Slippage,$${summary.totalSlippage.toFixed(2)}`,
          `Total Taxes,$${summary.totalTaxOwed.toFixed(2)}`,
          `Net After Tax,$${summary.totalNetAfterTax.toFixed(2)}`,
          `Effective Tax Rate,${summary.effectiveTaxRate.toFixed(2)}%`,
        ].join('\n');

        const csvContent = [csvHeader, ...csvRows, csvSummary].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=delfos_tax_report_${taxYear}_${portfolioId.substring(0, 8)}.csv`);
        res.send(csvContent);
      } else {
        // Return JSON for other formats
        res.json({
          portfolioId,
          taxYear,
          generatedAt: new Date().toISOString(),
          taxProfile: taxProfile ? {
            countryCode: taxProfile.country_code,
            regime: taxProfile.tax_regime,
            shortTermRate: taxProfile.short_term_rate_pct,
            longTermRate: taxProfile.long_term_rate_pct,
          } : null,
          summary,
          trades: tradeCosts.map(cost => {
            const trade = tradesMap.get(cost.trade_id);
            return {
              date: cost.created_at.toISOString(),
              tradeId: cost.trade_id,
              symbol: trade?.symbol || 'N/A',
              side: trade?.side || 'N/A',
              grossPnl: parseFloat(cost.gross_pnl_usd),
              fees: parseFloat(cost.total_fees_usd),
              slippage: parseFloat(cost.total_slippage_usd),
              totalCost: parseFloat(cost.total_cost_usd),
              netPnl: parseFloat(cost.net_pnl_usd),
              taxOwed: parseFloat(cost.tax_owed_usd),
              netAfterTax: parseFloat(cost.net_after_tax_usd),
            };
          }),
        });
      }
    } catch (error) {
      console.error("Error generating tax report:", error);
      res.status(500).json({ message: "Failed to generate tax report" });
    }
  });

  // ========== CIRCUIT BREAKERS ROUTES (3-Layer System) ==========

  app.get('/api/circuit-breakers/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const breakers = await circuitBreakerService.getAllBreakers(portfolioId);
      res.json(breakers);
    } catch (error) {
      console.error("Error fetching circuit breakers:", error);
      res.status(500).json({ message: "Failed to fetch circuit breakers" });
    }
  });

  app.get('/api/circuit-breakers/events/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      const { limit } = req.query;
      
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parsedLimit = limit ? validateQueryLimit(limit) : 50;
      const events = await storage.getCircuitBreakerEventsByPortfolio(portfolioId, parsedLimit);
      res.json(events);
    } catch (error: any) {
      if (error.message?.includes('Invalid limit')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error fetching breaker events:", error);
      res.status(500).json({ message: "Failed to fetch breaker events" });
    }
  });

  app.post('/api/circuit-breakers/asset/reset', isAuthenticated, async (req: any, res) => {
    try {
      const validationResult = resetAssetBreakerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.errors 
        });
      }

      const { portfolioId, symbol } = validationResult.data;
      
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await circuitBreakerService.resetAssetBreaker(portfolioId, symbol);
      res.json({ message: `Asset breaker for ${symbol} reset successfully` });
    } catch (error) {
      console.error("Error resetting asset breaker:", error);
      res.status(500).json({ message: "Failed to reset asset breaker" });
    }
  });

  app.post('/api/circuit-breakers/cluster/reset', isAuthenticated, async (req: any, res) => {
    try {
      const validationResult = resetClusterBreakerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.errors 
        });
      }

      const { portfolioId, clusterNumber } = validationResult.data;
      
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await circuitBreakerService.resetClusterBreaker(portfolioId, clusterNumber);
      res.json({ message: `Cluster ${clusterNumber} breaker reset successfully` });
    } catch (error) {
      console.error("Error resetting cluster breaker:", error);
      res.status(500).json({ message: "Failed to reset cluster breaker" });
    }
  });

  app.post('/api/circuit-breakers/global/reset', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.body;
      
      if (!portfolioId || typeof portfolioId !== 'string') {
        return res.status(400).json({ message: "Portfolio ID required" });
      }
      
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await circuitBreakerService.resetGlobalBreaker(portfolioId);
      res.json({ message: "Global circuit breaker reset successfully" });
    } catch (error) {
      console.error("Error resetting global breaker:", error);
      res.status(500).json({ message: "Failed to reset global breaker" });
    }
  });

  // ========== REBALANCING ROUTES ==========
  
  // POST /api/rebalance/:portfolioId/execute - Manual rebalance trigger
  app.post('/api/rebalance/:portfolioId/execute', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Validate request body
      const validation = executeRebalanceSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: validation.error.errors 
        });
      }
      const { dryRun } = validation.data;
      
      // Verify portfolio ownership
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Calculate rebalance plan first
      const plan = await rebalanceService.calculateRebalance(portfolioId);
      
      if (!plan.requiresRebalance) {
        return res.json({
          success: true,
          tradesExecuted: 0,
          totalCost: 0,
          logId: null,
          errors: [],
          message: plan.reason || "No rebalancing needed",
        });
      }

      // Validate circuit breakers before execution (even for dry-run)
      const circuitValidation = await rebalanceService.validateCircuitBreakers(portfolioId, plan.trades);
      if (!circuitValidation.valid) {
        return res.status(409).json({ 
          message: "Circuit breaker triggered - trading blocked for symbols", 
          blockedSymbols: circuitValidation.blockedSymbols 
        });
      }

      // Validate cluster caps
      const capsValidation = rebalanceService.validateClusterCaps(plan.clusterExposures);
      if (!capsValidation.valid) {
        return res.status(409).json({ 
          message: "Cluster caps violation", 
          violations: capsValidation.violations 
        });
      }

      // Execute rebalance with pre-computed plan (avoids duplicate validation)
      const result = await rebalanceService.executeRebalance(portfolioId, dryRun, plan);
      res.json(result);
    } catch (error: any) {
      console.error("Error executing rebalance:", error);
      
      // Return 400 for validation errors, 500 for unexpected errors
      if (error.message?.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      
      res.status(500).json({ message: error.message || "Failed to execute rebalance" });
    }
  });

  // GET /api/rebalance/:portfolioId/preview - Get rebalance plan without executing
  app.get('/api/rebalance/:portfolioId/preview', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const plan = await rebalanceService.calculateRebalance(portfolioId);
      
      // If rebalancing is required, validate circuit breakers
      if (plan.requiresRebalance) {
        const circuitValidation = await rebalanceService.validateCircuitBreakers(portfolioId, plan.trades);
        if (!circuitValidation.valid) {
          return res.status(409).json({ 
            message: "Circuit breaker triggered - preview blocked", 
            blockedSymbols: circuitValidation.blockedSymbols,
            plan 
          });
        }
      }

      res.json(plan);
    } catch (error: any) {
      console.error("Error generating rebalance preview:", error);
      
      if (error.message?.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      
      res.status(500).json({ message: error.message || "Failed to generate preview" });
    }
  });

  // GET /api/rebalance/:portfolioId/logs - Get rebalancing history
  app.get('/api/rebalance/:portfolioId/logs', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      const { limit } = req.query;
      
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parsedLimit = limit ? validateQueryLimit(limit) : 50;
      const logs = await storage.getRebalanceLogsByPortfolioId(portfolioId, parsedLimit);
      res.json(logs);
    } catch (error: any) {
      if (error.message?.includes('Invalid limit')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error fetching rebalance logs:", error);
      res.status(500).json({ message: "Failed to fetch logs" });
    }
  });

  // ========== TSDB / TIME-SERIES ROUTES ==========

  // Bars 1m - Get OHLCV candles (1 minute)
  app.get('/api/bars/1m/:exchange/:symbol', isAuthenticated, async (req: any, res) => {
    try {
      const { exchange, symbol } = req.params;
      const { startTime, endTime, limit } = req.query;

      if (!startTime || !endTime) {
        return res.status(400).json({ 
          message: "Missing required query parameters: startTime, endTime" 
        });
      }

      // Validate timestamps
      const start = new Date(startTime as string);
      const end = new Date(endTime as string);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid timestamp format" });
      }
      
      if (start >= end) {
        return res.status(400).json({ message: "startTime must be before endTime" });
      }

      // Validate limit using shared helper
      const parsedLimit = limit ? validateQueryLimit(limit) : undefined;

      const bars = await storage.getBars1m(exchange, symbol, start, end, parsedLimit);
      res.json(bars);
    } catch (error: any) {
      if (error.message?.includes('Invalid limit')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error fetching 1m bars:", error);
      res.status(500).json({ message: "Failed to fetch 1m bars" });
    }
  });

  // Bars 1h - Get OHLCV candles (1 hour)
  app.get('/api/bars/1h/:exchange/:symbol', isAuthenticated, async (req: any, res) => {
    try {
      const { exchange, symbol } = req.params;
      const { startTime, endTime, limit } = req.query;

      if (!startTime || !endTime) {
        return res.status(400).json({ 
          message: "Missing required query parameters: startTime, endTime" 
        });
      }

      // Validate timestamps
      const start = new Date(startTime as string);
      const end = new Date(endTime as string);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid timestamp format" });
      }
      
      if (start >= end) {
        return res.status(400).json({ message: "startTime must be before endTime" });
      }

      // Validate limit using shared helper
      const parsedLimit = limit ? validateQueryLimit(limit) : undefined;

      const bars = await storage.getBars1h(exchange, symbol, start, end, parsedLimit);
      res.json(bars);
    } catch (error: any) {
      if (error.message?.includes('Invalid limit')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error fetching 1h bars:", error);
      res.status(500).json({ message: "Failed to fetch 1h bars" });
    }
  });

  // Orders - Get by portfolio
  app.get('/api/orders/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const orders = await storage.getOrdersByPortfolioId(portfolioId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Orders - Create new order
  app.post('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body with Zod
      const validationResult = insertOrderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid order data", 
          errors: validationResult.error.errors 
        });
      }

      const { portfolio_id } = validationResult.data;
      
      // Verify portfolio belongs to user (SECURITY: prevent cross-tenant mutations)
      const portfolio = await storage.getPortfolio(portfolio_id);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const order = await storage.createOrder(validationResult.data);
      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Orders - Update status
  app.patch('/api/orders/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Validate request body with Zod
      const validationResult = updateOrderStatusSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid order status data", 
          errors: validationResult.error.errors 
        });
      }

      const { status, filled_quantity, average_fill_price } = validationResult.data;

      const updated = await storage.updateOrderStatus(
        id, 
        status, 
        filled_quantity, 
        average_fill_price
      );
      res.json(updated);
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // Orders - Get orders for a portfolio
  app.get('/api/orders/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get orders for this portfolio
      const orders = await storage.getOrdersByPortfolioId(portfolioId);
      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Orders - Execute order on Kraken (LIVE TRADING)
  app.post('/api/orders/execute', isAuthenticated, async (req: any, res) => {
    try {

      // Validate request body with Zod
      const validationResult = executeOrderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid order data", 
          errors: validationResult.error.errors 
        });
      }

      const { portfolioId, symbol, side, type, quantity, price, stopPrice } = validationResult.data;

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check circuit breaker
      const circuitBreakerTriggered = await riskService.checkCircuitBreaker(portfolioId);
      if (circuitBreakerTriggered) {
        return res.status(403).json({ 
          message: "Circuit breaker triggered - daily loss limit exceeded. Trading is disabled." 
        });
      }

      // For limit orders, validate risk limits
      if (type === 'limit' || type === 'market') {
        const entryPrice = price ? parseFloat(price) : 0; // Market orders use current price
        const qty = parseFloat(quantity);
        const positionValueUsd = entryPrice * qty;

        // Check risk limits
        const riskCheck = await riskService.canOpenPosition(
          portfolioId,
          positionValueUsd,
          entryPrice,
          qty,
          stopPrice ? parseFloat(stopPrice) : null
        );

        if (!riskCheck.allowed) {
          return res.status(403).json({ 
            message: riskCheck.reason || "Order violates risk limits" 
          });
        }
      }

      // Execute order on Kraken
      const order = await orderExecutionService.placeOrder({
        portfolioId,
        symbol,
        side,
        type,
        quantity,
        price,
        stopPrice,
      });

      res.json(order);
    } catch (error: any) {
      console.error("Error executing order:", error);
      res.status(500).json({ message: error.message || "Failed to execute order" });
    }
  });

  // Orders - Cancel order on Kraken
  app.post('/api/orders/:id/cancel', isAuthenticated, async (req: any, res) => {
    try {

      const { id } = req.params;

      // Get order to verify ownership
      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(order.portfolio_id);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Cancel order on Kraken
      await orderExecutionService.cancelOrder(id);

      res.json({ message: "Order cancelled successfully" });
    } catch (error: any) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ message: error.message || "Failed to cancel order" });
    }
  });

  // ===== ORDER ENTRY WITH ATR-BASED OCO (Topic 14.2) =====
  // POST /api/orders/entry - Create entry order with automatic OCO protection
  const orderEntrySchema = z.object({
    portfolioId: z.string().uuid(),
    symbol: z.string().min(1),
    side: z.enum(['buy', 'sell']),
    qty: z.string().min(1),
    entry_type: z.enum(['market', 'limit']).default('market'),
    price: z.string().optional(),
    sl_atr: z.number().positive().default(1.0),
    tp1_atr: z.number().positive().default(1.2),
    tp2_atr: z.number().positive().default(2.5),
  });

  app.post('/api/orders/entry', isAuthenticated, async (req: any, res) => {
    try {
      const { indicatorService } = await import('./services/market');
      const { dataIngestionService } = await import('./services/dataIngestionService');

      const validationResult = orderEntrySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid order entry data", 
          errors: validationResult.error.errors 
        });
      }

      const { portfolioId, symbol, side, qty, entry_type, price, sl_atr, tp1_atr, tp2_atr } = validationResult.data;

      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const circuitBreakerTriggered = await riskService.checkCircuitBreaker(portfolioId);
      if (circuitBreakerTriggered) {
        return res.status(403).json({ 
          message: "Circuit breaker triggered - trading is disabled" 
        });
      }

      const atrValue = await dataIngestionService.getIndicator(symbol, 'atr', 14);
      if (!atrValue) {
        return res.status(400).json({ 
          message: `ATR not available for ${symbol}. Please ensure market data is being collected.` 
        });
      }

      const atr = parseFloat(atrValue);
      console.log(`[OrderEntry] ${symbol} ATR(14) = ${atr}`);

      let entryPrice: number;
      if (entry_type === 'limit' && price) {
        entryPrice = parseFloat(price);
      } else {
        const l1Quote = await dataIngestionService.getL1Quote('kraken', symbol);
        if (!l1Quote) {
          return res.status(400).json({ 
            message: `Current price not available for ${symbol}` 
          });
        }
        const bidPrice = parseFloat(l1Quote.bid_price);
        const askPrice = parseFloat(l1Quote.ask_price);
        entryPrice = (bidPrice + askPrice) / 2;
      }

      const isLong = side === 'buy';
      const slPrice = isLong 
        ? entryPrice - (sl_atr * atr)
        : entryPrice + (sl_atr * atr);
      const tp1Price = isLong 
        ? entryPrice + (tp1_atr * atr)
        : entryPrice - (tp1_atr * atr);
      const tp2Price = isLong 
        ? entryPrice + (tp2_atr * atr)
        : entryPrice - (tp2_atr * atr);

      console.log(`[OrderEntry] ${symbol} ${side.toUpperCase()} @ ${entryPrice}`);
      console.log(`[OrderEntry] SL: ${slPrice.toFixed(8)} (${sl_atr}x ATR)`);
      console.log(`[OrderEntry] TP1: ${tp1Price.toFixed(8)} (${tp1_atr}x ATR)`);
      console.log(`[OrderEntry] TP2: ${tp2Price.toFixed(8)} (${tp2_atr}x ATR)`);

      const qtyNum = parseFloat(qty);
      const positionValueUsd = entryPrice * qtyNum;
      
      const riskCheck = await riskService.canOpenPosition(
        portfolioId,
        positionValueUsd,
        entryPrice,
        qtyNum,
        slPrice
      );

      if (!riskCheck.allowed) {
        return res.status(403).json({ 
          message: riskCheck.reason || "Order violates risk limits",
          details: {
            entryPrice,
            slPrice,
            tp1Price,
            tp2Price,
            atr,
            positionValueUsd
          }
        });
      }

      const mainOrder = await orderExecutionService.placeOrder({
        portfolioId,
        symbol,
        side,
        type: entry_type,
        quantity: qty,
        price: entry_type === 'limit' ? price : undefined,
      });

      const ocoIds: string[] = [];

      try {
        const slSide = isLong ? 'sell' : 'buy';

        const slOrder = await orderExecutionService.placeOrder({
          portfolioId,
          symbol,
          side: slSide,
          type: 'stop_loss',
          quantity: qty,
          stopPrice: slPrice.toFixed(8),
        });
        ocoIds.push(slOrder.id);

        const tp1Qty = (qtyNum * 0.5).toFixed(8);
        const tp2Qty = (qtyNum * 0.5).toFixed(8);

        const tp1Order = await orderExecutionService.placeOrder({
          portfolioId,
          symbol,
          side: slSide,
          type: 'limit',
          quantity: tp1Qty,
          price: tp1Price.toFixed(8),
        });
        ocoIds.push(tp1Order.id);

        const tp2Order = await orderExecutionService.placeOrder({
          portfolioId,
          symbol,
          side: slSide,
          type: 'limit',
          quantity: tp2Qty,
          price: tp2Price.toFixed(8),
        });
        ocoIds.push(tp2Order.id);

        console.log(`[OrderEntry] OCO orders created: SL=${slOrder.id}, TP1=${tp1Order.id}, TP2=${tp2Order.id}`);
      } catch (ocoError) {
        console.error(`[OrderEntry] Failed to create OCO orders, main order still placed:`, ocoError);
      }

      res.json({
        order_id: mainOrder.id,
        oco_ids: ocoIds,
        status: mainOrder.status,
        details: {
          symbol,
          side,
          qty,
          entry_type,
          entry_price: entryPrice,
          atr,
          sl_price: slPrice,
          tp1_price: tp1Price,
          tp2_price: tp2Price,
          sl_atr_multiplier: sl_atr,
          tp1_atr_multiplier: tp1_atr,
          tp2_atr_multiplier: tp2_atr,
        }
      });
    } catch (error: any) {
      console.error("[OrderEntry] Error:", error);
      res.status(500).json({ message: error.message || "Failed to create entry order with OCO" });
    }
  });

  // Orders - Refresh order status from Kraken
  app.get('/api/orders/:id/refresh', isAuthenticated, async (req: any, res) => {
    try {

      const { id } = req.params;

      // Get order to verify ownership
      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(order.portfolio_id);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Query and update order from Kraken
      const updatedOrder = await orderExecutionService.queryAndUpdateOrder(id);

      res.json(updatedOrder);
    } catch (error: any) {
      console.error("Error refreshing order status:", error);
      res.status(500).json({ message: error.message || "Failed to refresh order status" });
    }
  });

  // Decision Log - Get by portfolio
  app.get('/api/decisions/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      const { limit } = req.query;

      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const logs = await storage.getDecisionLogsByPortfolio(
        portfolioId,
        limit ? validateQueryLimit(limit) : undefined
      );
      res.json(logs);
    } catch (error: any) {
      if (error.message?.includes('Invalid limit')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error fetching decision logs:", error);
      res.status(500).json({ message: "Failed to fetch decision logs" });
    }
  });

  // Decision Log - Create
  app.post('/api/decisions', isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body with Zod
      const validationResult = insertDecisionLogSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid decision log data", 
          errors: validationResult.error.errors 
        });
      }

      const { portfolio_id } = validationResult.data;
      
      // portfolio_id is optional in decision_log, but if provided must be valid
      if (portfolio_id) {
        // Verify portfolio belongs to user (SECURITY: prevent cross-tenant mutations)
        const portfolio = await storage.getPortfolio(portfolio_id);
        if (!portfolio) {
          return res.status(404).json({ message: "Portfolio not found" });
        }
        
        const userId = req.user.claims.sub;
        if (portfolio.user_id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const log = await storage.createDecisionLog(validationResult.data);
      res.json(log);
    } catch (error) {
      console.error("Error creating decision log:", error);
      res.status(500).json({ message: "Failed to create decision log" });
    }
  });

  // Staleness Log - Get recent logs
  app.get('/api/staleness', isAuthenticated, async (req: any, res) => {
    try {
      const { hours } = req.query;
      const logs = await storage.getRecentStalenessLogs(
        hours ? parseInt(hours as string) : undefined
      );
      res.json(logs);
    } catch (error) {
      console.error("Error fetching staleness logs:", error);
      res.status(500).json({ message: "Failed to fetch staleness logs" });
    }
  });

  // Slippage Estimates - Get by symbol
  app.get('/api/slippage/:symbol', isAuthenticated, async (req: any, res) => {
    try {
      const { symbol } = req.params;
      const estimate = await storage.getSlippageEstimate(symbol);
      
      if (!estimate) {
        return res.status(404).json({ message: "Slippage estimate not found" });
      }
      
      res.json(estimate);
    } catch (error) {
      console.error("Error fetching slippage estimate:", error);
      res.status(500).json({ message: "Failed to fetch slippage estimate" });
    }
  });

  // Audit Trail - Get by user
  app.get('/api/audit', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { limit } = req.query;
      
      const logs = await storage.getAuditTrailByUser(
        userId,
        limit ? validateQueryLimit(limit) : undefined
      );
      res.json(logs);
    } catch (error: any) {
      if (error.message?.includes('Invalid limit')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error fetching audit trail:", error);
      res.status(500).json({ message: "Failed to fetch audit trail" });
    }
  });

  // User Dashboard - Global stats across all user campaigns
  app.get('/api/user/dashboard-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all portfolios for user
      const portfolios = await storage.getPortfoliosByUserId(userId);
      const portfolioIds = portfolios.map(p => p.id);
      
      // Get all campaigns for user's portfolios
      const allCampaigns: any[] = [];
      for (const portfolio of portfolios) {
        const campaigns = await storage.getCampaignsByPortfolio(portfolio.id);
        allCampaigns.push(...campaigns);
      }
      
      // Calculate aggregated stats
      let totalCapital = 0;
      let totalEquity = 0;
      let activeCampaigns = 0;
      let pausedCampaigns = 0;
      let completedCampaigns = 0;
      let atRiskCampaigns = 0;
      let globalDrawdown = 0;
      let worstDrawdown = 0;
      
      for (const campaign of allCampaigns) {
        const capital = parseFloat(campaign.initial_capital) || 0;
        const equity = parseFloat(campaign.current_equity) || 0;
        const maxDD = parseFloat(campaign.max_drawdown_percentage) || 10;
        
        totalCapital += capital;
        totalEquity += equity;
        
        // Calculate campaign drawdown
        const pnlPct = capital > 0 ? ((equity - capital) / capital) * 100 : 0;
        const drawdown = pnlPct < 0 ? Math.abs(pnlPct) : 0;
        
        if (drawdown > worstDrawdown) {
          worstDrawdown = drawdown;
        }
        
        // Status counts
        if (campaign.status === 'active') {
          activeCampaigns++;
          // Check if at risk (drawdown > 50% of max allowed)
          if (drawdown > maxDD * 0.5) {
            atRiskCampaigns++;
          }
        } else if (campaign.status === 'paused') {
          pausedCampaigns++;
        } else if (campaign.status === 'completed' || campaign.status === 'stopped') {
          completedCampaigns++;
        }
      }
      
      // Global drawdown is worst campaign drawdown
      globalDrawdown = worstDrawdown;
      
      // Calculate total PnL
      const totalPnL = totalEquity - totalCapital;
      const totalPnLPercentage = totalCapital > 0 ? (totalPnL / totalCapital) * 100 : 0;
      
      // Get today's trades count across all portfolios
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let todayTradesCount = 0;
      
      for (const portfolioId of portfolioIds) {
        const trades = await storage.getTradesByPortfolioId(portfolioId);
        const todayTrades = trades.filter(t => {
          const tradeDate = new Date(t.opened_at);
          return tradeDate >= today;
        });
        todayTradesCount += todayTrades.length;
      }
      
      // Determine overall health status
      let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (atRiskCampaigns > 0) {
        healthStatus = 'warning';
      }
      if (globalDrawdown > 8) {
        healthStatus = 'critical';
      }
      
      res.json({
        totalCapital,
        totalEquity,
        totalPnL,
        totalPnLPercentage,
        globalDrawdown,
        activeCampaigns,
        pausedCampaigns,
        completedCampaigns,
        atRiskCampaigns,
        totalCampaigns: allCampaigns.length,
        todayTradesCount,
        healthStatus,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Campaigns - Get all for user
  app.get('/api/campaigns/all', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all portfolios for user
      const portfolios = await storage.getPortfoliosByUserId(userId);
      
      // Get campaigns for all portfolios
      const allCampaigns: any[] = [];
      for (const portfolio of portfolios) {
        const campaigns = await storage.getCampaignsByPortfolio(portfolio.id);
        allCampaigns.push(...campaigns);
      }
      
      // Sort by created_at desc
      allCampaigns.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      res.json(allCampaigns);
    } catch (error) {
      console.error("Error fetching all campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // Campaigns - Get single campaign by ID
  app.get('/api/campaigns/detail/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      res.json(ownershipCheck.campaign);
    } catch (error) {
      console.error("Error fetching campaign:", error);
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  // Campaigns - Get by portfolio
  app.get('/api/campaigns/:portfolioId', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolioId } = req.params;
      
      // Verify portfolio belongs to user
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const campaigns = await storage.getCampaignsByPortfolio(portfolioId);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // Campaigns - Create
  app.post('/api/campaigns', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email || 'unknown';

      console.log(`[CAMPAIGN] 📝 Creating campaign | User: ${userId} (${userEmail}) | Name: ${req.body.name} | Portfolio: ${req.body.portfolio_id}`);

      // Convert ISO date strings to Date objects before validation
      const requestBody = {
        ...req.body,
        start_date: req.body.start_date ? new Date(req.body.start_date) : undefined,
        end_date: req.body.end_date ? new Date(req.body.end_date) : undefined,
      };
      
      // Validate request body with Zod
      const validationResult = insertCampaignSchema.safeParse(requestBody);
      if (!validationResult.success) {
        console.log(`[CAMPAIGN] ❌ Validation failed | User: ${userId} | Errors: ${JSON.stringify(validationResult.error.errors)}`);
        return res.status(400).json({ 
          message: "Invalid campaign data", 
          errors: validationResult.error.errors 
        });
      }

      const { portfolio_id } = validationResult.data;
      
      // Verify portfolio belongs to user (SECURITY: prevent cross-tenant mutations)
      const portfolio = await storage.getPortfolio(portfolio_id);
      if (!portfolio) {
        console.log(`[CAMPAIGN] ❌ Portfolio not found | User: ${userId} | Portfolio ID: ${portfolio_id}`);
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      if (portfolio.user_id !== userId) {
        console.log(`[CAMPAIGN] ❌ Access denied | User: ${userId} | Portfolio owner: ${portfolio.user_id}`);
        return res.status(403).json({ message: "Access denied" });
      }

      // SECURITY: Validate investor_profile against franchise plan AND governance requirements
      const investorProfile = validationResult.data.investor_profile;
      if (investorProfile) {
        const { franchisePlanService } = await import('./services/franchisePlanService');
        
        // For high-risk profiles (SA/F), use full governance validation
        if (['SA', 'F'].includes(investorProfile.toUpperCase())) {
          const customProfileId = (req.body as any).custom_profile_id;
          
          // FULL_CUSTOM profile requires customProfileId
          if (investorProfile.toUpperCase() === 'F' && !customProfileId) {
            console.log(`[CAMPAIGN] ❌ Full Custom profile requires customProfileId | User: ${userId}`);
            return res.status(400).json({
              message: "Full Custom profile requires a custom profile configuration",
              code: 'CUSTOM_PROFILE_REQUIRED'
            });
          }
          
          const fullValidation = await franchisePlanService.validateCampaignRiskProfile(
            userId,
            investorProfile,
            customProfileId
          );
          
          if (!fullValidation.valid) {
            const errors = fullValidation.governanceValidation?.errors?.map(e => e.message) || [];
            const planError = fullValidation.planValidation?.reason;
            const allErrors = planError ? [planError, ...errors] : errors;
            
            console.log(`[CAMPAIGN] ❌ Governance validation failed | User: ${userId} | Profile: ${investorProfile} | Errors: ${allErrors.join(', ')}`);
            return res.status(403).json({
              message: "Profile validation failed: " + allErrors.join('; '),
              code: 'GOVERNANCE_VALIDATION_FAILED',
              planValidation: fullValidation.planValidation,
              governanceValidation: fullValidation.governanceValidation,
              requiresDoubleConfirm: fullValidation.requiresDoubleConfirm,
              requiresLegalAcceptance: fullValidation.requiresLegalAcceptance
            });
          }
          
          // Additional check: require double confirmation and legal acceptance to be completed
          if (fullValidation.requiresDoubleConfirm || fullValidation.requiresLegalAcceptance) {
            console.log(`[CAMPAIGN] ⚠️ High-risk profile requires additional confirmations | User: ${userId} | Profile: ${investorProfile}`);
            // Note: The actual double-confirm and legal-acceptance are recorded after campaign creation
            // via separate endpoints. This validation ensures the user is eligible.
          }
        } else {
          // For standard profiles (C/M/A), use simpler plan-only validation
          const validation = await franchisePlanService.validateRiskProfileForUser(userId, investorProfile);
          
          if (!validation.valid) {
            console.log(`[CAMPAIGN] ❌ Risk profile not allowed | User: ${userId} | Profile: ${investorProfile} | Reason: ${validation.reason}`);
            return res.status(403).json({ 
              message: validation.reason,
              code: 'RISK_PROFILE_NOT_ALLOWED',
              allowedProfiles: validation.allowedProfiles
            });
          }
        }
      }

      const campaign = await storage.createCampaign(validationResult.data);
      console.log(`[CAMPAIGN] ✓ Created successfully | User: ${userId} | Campaign ID: ${campaign.id} | Name: ${campaign.name}`);
      
      // Create admin alert for new campaign
      try {
        const user = await storage.getUser(userId);
        const portfolioMode = (portfolio as any).mode || 'paper';
        await adminMonitorService.notifyCampaignCreated(
          userId,
          user?.email || 'Unknown',
          campaign.id,
          campaign.name,
          portfolio.id,
          portfolioMode as 'paper' | 'real',
          parseFloat(campaign.initial_capital)
        );
      } catch (alertError) {
        console.error('[AdminMonitor] Failed to create campaign alert:', alertError);
      }
      
      res.json(campaign);
    } catch (error) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // Campaigns - Update equity
  app.patch('/api/campaigns/:id/equity', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Validate request body with Zod
      const validationResult = updateCampaignEquitySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid campaign equity data", 
          errors: validationResult.error.errors 
        });
      }

      const { current_equity } = validationResult.data;

      const updated = await storage.updateCampaignEquity(id, current_equity);
      res.json(updated);
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error updating campaign equity:", error);
      res.status(500).json({ message: "Failed to update campaign equity" });
    }
  });

  // Campaigns - Complete
  app.patch('/api/campaigns/:id/complete', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.completeCampaign(id);
      res.json(updated);
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error completing campaign:", error);
      res.status(500).json({ message: "Failed to complete campaign" });
    }
  });

  // Campaigns - Get metrics (day number, progress, PnL, drawdown)
  app.get('/api/campaigns/:id/metrics', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const metrics = await campaignManagerService.getCampaignMetrics(id);
      
      if (!metrics) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching campaign metrics:", error);
      res.status(500).json({ message: "Failed to fetch campaign metrics" });
    }
  });

  // Campaigns - Get summary (metrics + trade stats)
  app.get('/api/campaigns/:id/summary', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const summary = await campaignManagerService.getCampaignSummary(id);
      
      res.json(summary);
    } catch (error) {
      console.error("Error fetching campaign summary:", error);
      res.status(500).json({ message: "Failed to fetch campaign summary" });
    }
  });

  // Campaigns - Start new campaign with automatic capital snapshot (with governance for SA/F)
  app.post('/api/campaigns/start', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolio_id, name, initial_capital, risk_config, selection_config, duration_days, max_drawdown_percentage, investor_profile, custom_profile_id } = req.body;
      
      if (!portfolio_id || !name || !initial_capital) {
        return res.status(400).json({ message: "portfolio_id, name, and initial_capital are required" });
      }

      const portfolio = await storage.getPortfolio(portfolio_id);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const userId = req.user.claims.sub;
      if (portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // SECURITY: Use authoritative SA/F parameter specification to detect bypass attempts
      const { checkExceedsStandardLimits } = await import('../shared/schema');
      const mergedRiskConfig = { ...risk_config, custom_profile_id };
      const exceededParams = checkExceedsStandardLimits(mergedRiskConfig);
      
      // SECURITY: Validate governance for high-risk profiles before starting
      const profileToCheck = investor_profile || risk_config?.investor_profile;
      
      // SECURITY: If any parameter exceeds standard limits, investor_profile MUST be SA/F
      if (exceededParams.length > 0 && (!profileToCheck || !['SA', 'F'].includes(profileToCheck.toUpperCase()))) {
        console.log(`[CAMPAIGN] ❌ Parameters exceed standard limits without SA/F profile | User: ${userId} | Exceeded: ${exceededParams.join(', ')}`);
        return res.status(400).json({
          message: `Parameters (${exceededParams.join(', ')}) exceed standard profile limits and require SA or F investor profile with governance approval`,
          code: 'PROFILE_MISMATCH',
          exceededParams
        });
      }
      
      if (profileToCheck && ['SA', 'F'].includes(profileToCheck.toUpperCase())) {
        const { franchisePlanService } = await import('./services/franchisePlanService');
        const customProfileId = custom_profile_id || risk_config?.custom_profile_id;
        
        const validation = await franchisePlanService.validateCampaignRiskProfile(
          userId,
          profileToCheck,
          customProfileId
        );
        
        if (!validation.valid) {
          console.log(`[CAMPAIGN] ❌ Governance validation failed on start | User: ${userId} | Profile: ${profileToCheck}`);
          return res.status(403).json({
            message: "Cannot start campaign: governance validation failed",
            code: 'GOVERNANCE_VALIDATION_FAILED',
            planValidation: validation.planValidation,
            governanceValidation: validation.governanceValidation,
            requiresDoubleConfirm: validation.requiresDoubleConfirm,
            requiresLegalAcceptance: validation.requiresLegalAcceptance
          });
        }
      }

      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const campaign = await campaignManagerService.startCampaign({
        portfolioId: portfolio_id,
        name,
        initialCapital: parseFloat(initial_capital),
        riskConfig: risk_config,
        selectionConfig: selection_config,
        durationDays: duration_days,
        maxDrawdownPercentage: max_drawdown_percentage
      });
      
      res.json(campaign);
    } catch (error: any) {
      console.error("Error starting campaign:", error);
      res.status(500).json({ message: error.message || "Failed to start campaign" });
    }
  });

  // Campaigns - Stop campaign (emergency or drawdown breach)
  app.post('/api/campaigns/:id/stop', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const campaign = await campaignManagerService.stopCampaign(id, reason || 'manual_stop');
      
      res.json(campaign);
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error stopping campaign:", error);
      res.status(500).json({ message: "Failed to stop campaign" });
    }
  });

  // Campaigns - Pause campaign
  app.post('/api/campaigns/:id/pause', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const campaign = await campaignManagerService.pauseCampaign(id, reason || 'manual_pause');
      
      res.json(campaign);
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error pausing campaign:", error);
      res.status(500).json({ message: "Failed to pause campaign" });
    }
  });

  // Campaigns - Resume campaign (with governance check for high-risk profiles)
  app.post('/api/campaigns/:id/resume', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Fetch campaign to check ownership and profile
      const campaign = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
      if (campaign.length === 0) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      const campaignData = campaign[0];
      
      // SECURITY: Verify ownership
      if (campaignData.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // SECURITY: Re-validate governance for high-risk profiles before resuming
      const investorProfile = campaignData.investor_profile;
      if (['SA', 'F'].includes(investorProfile.toUpperCase())) {
        const { franchisePlanService } = await import('./services/franchisePlanService');
        const customProfileId = (campaignData as any).custom_profile_id;
        
        const validation = await franchisePlanService.validateCampaignRiskProfile(
          userId,
          investorProfile,
          customProfileId
        );
        
        if (!validation.valid) {
          console.log(`[CAMPAIGN] ❌ Governance re-validation failed on resume | Campaign: ${id} | Profile: ${investorProfile}`);
          return res.status(403).json({
            message: "Cannot resume: governance validation failed",
            code: 'GOVERNANCE_VALIDATION_FAILED',
            governanceValidation: validation.governanceValidation
          });
        }
      }
      
      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const resumedCampaign = await campaignManagerService.resumeCampaign(id);
      
      res.json(resumedCampaign);
    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('not paused')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error resuming campaign:", error);
      res.status(500).json({ message: "Failed to resume campaign" });
    }
  });

  // ========== CAMPAIGN GOVERNANCE V2.0+ ENDPOINTS ==========
  // Note: Uses verifyCampaignOwnership helper defined later in this file

  // POST /api/campaigns/:id/lock - Lock campaign (immutable governance)
  app.post('/api/campaigns/:id/lock', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // SECURITY: Verify ownership (uses helper defined below)
      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      if (!portfolio || portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { campaignGovernanceService } = await import('./services/governance/campaignGovernanceService');
      
      const locked = await campaignGovernanceService.lockCampaign(id, userId);
      
      res.json({
        success: locked,
        message: locked ? 'Campaign locked successfully' : 'Campaign already locked',
        campaignId: id,
      });
    } catch (error: any) {
      console.error("Error locking campaign:", error);
      res.status(500).json({ message: error.message || "Failed to lock campaign" });
    }
  });

  // GET /api/campaigns/:id/integrity - Verify campaign integrity
  app.get('/api/campaigns/:id/integrity', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // SECURITY: Verify ownership
      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      if (!portfolio || portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { campaignGovernanceService } = await import('./services/governance/campaignGovernanceService');
      
      const isValid = await campaignGovernanceService.verifyIntegrity(id);
      
      res.json({
        campaignId: id,
        valid: isValid,
        message: isValid ? 'Campaign integrity verified' : 'INTEGRITY VIOLATION DETECTED',
        verifiedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error verifying campaign integrity:", error);
      res.status(500).json({ message: error.message || "Failed to verify integrity" });
    }
  });

  // GET /api/campaigns/:id/ledger - Get campaign audit ledger history
  app.get('/api/campaigns/:id/ledger', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 100;
      
      // SECURITY: Verify ownership
      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      if (!portfolio || portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { campaignGovernanceService } = await import('./services/governance/campaignGovernanceService');
      
      const entries = await campaignGovernanceService.getLedgerHistory(id, limit);
      
      res.json({
        campaignId: id,
        count: entries.length,
        entries,
      });
    } catch (error: any) {
      console.error("Error fetching campaign ledger:", error);
      res.status(500).json({ message: error.message || "Failed to fetch ledger" });
    }
  });

  // GET /api/campaigns/:id/ledger/verify - Verify ledger hash chain integrity
  app.get('/api/campaigns/:id/ledger/verify', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // SECURITY: Verify ownership
      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      if (!portfolio || portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { campaignGovernanceService } = await import('./services/governance/campaignGovernanceService');
      
      const result = await campaignGovernanceService.verifyLedgerChain(id);
      
      res.json({
        campaignId: id,
        valid: result.valid,
        checkedEntries: result.checkedEntries,
        errors: result.errors,
        brokenChainAt: result.brokenChainAt,
        verifiedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error verifying ledger chain:", error);
      res.status(500).json({ message: error.message || "Failed to verify ledger chain" });
    }
  });

  // POST /api/campaigns/:id/reconcile - Trigger exchange reconciliation
  app.post('/api/campaigns/:id/reconcile', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // SECURITY: Verify ownership
      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      if (!portfolio || portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { exchangeReconciliationService } = await import('./services/governance/exchangeReconciliationService');
      
      const result = await exchangeReconciliationService.reconcileCampaign(id);
      
      res.json({
        campaignId: id,
        status: result.status,
        discrepancyCount: result.discrepancies.length,
        discrepancies: result.discrepancies,
        delfosSnapshot: {
          positionCount: result.delfosSnapshot.positionCount,
          orderCount: result.delfosSnapshot.orderCount,
        },
        exchangeSnapshot: {
          positionCount: result.exchangeSnapshot.positionCount,
          orderCount: result.exchangeSnapshot.orderCount,
        },
        reconciliationHash: result.reconciliationHash,
        completedAt: result.completedAt,
      });
    } catch (error: any) {
      console.error("Error running reconciliation:", error);
      res.status(500).json({ message: error.message || "Failed to run reconciliation" });
    }
  });

  // GET /api/campaigns/:id/can-modify - Check if campaign can be modified
  app.get('/api/campaigns/:id/can-modify', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // SECURITY: Verify ownership
      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      if (!portfolio || portfolio.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { campaignGovernanceService } = await import('./services/governance/campaignGovernanceService');
      
      const result = await campaignGovernanceService.canModifyCampaign(id);
      
      res.json({
        campaignId: id,
        ...result,
      });
    } catch (error: any) {
      console.error("Error checking campaign modification:", error);
      res.status(500).json({ message: error.message || "Failed to check modification status" });
    }
  });

  // ========== END CAMPAIGN GOVERNANCE ENDPOINTS ==========

  // Campaigns - Apply compounding (reinvest realized PnL)
  app.post('/api/campaigns/:id/compound', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { realized_pnl } = req.body;
      
      if (realized_pnl === undefined) {
        return res.status(400).json({ message: "realized_pnl is required" });
      }

      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const result = await campaignManagerService.applyCompounding(id, parseFloat(realized_pnl));
      
      res.json(result);
    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('inactive')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error applying compounding:", error);
      res.status(500).json({ message: "Failed to apply compounding" });
    }
  });

  // Campaigns - Manual rebalance trigger
  app.post('/api/campaigns/:id/rebalance', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const result = await campaignManagerService.triggerManualRebalance(id);
      
      if (!result.success) {
        return res.status(400).json({ message: result.errors.join(', ') });
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Error triggering rebalance:", error);
      res.status(500).json({ message: "Failed to trigger rebalance" });
    }
  });

  // Campaigns - Get trades within campaign period
  app.get('/api/campaigns/:id/trades', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const trades = await campaignManagerService.getTradesForCampaign(id);
      
      res.json(trades);
    } catch (error) {
      console.error("Error fetching campaign trades:", error);
      res.status(500).json({ message: "Failed to fetch campaign trades" });
    }
  });

  // Campaigns - Get orders within campaign period
  app.get('/api/campaigns/:id/orders', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const orders = await campaignManagerService.getOrdersForCampaign(id);
      
      res.json(orders);
    } catch (error) {
      console.error("Error fetching campaign orders:", error);
      res.status(500).json({ message: "Failed to fetch campaign orders" });
    }
  });

  // ===== CAMPAIGN ENGINE ENDPOINTS (Multi-Campaign Autonomous Trading) =====
  
  // Campaign Engine - Start the main trading loop
  app.post('/api/campaign-engine/start', isAuthenticated, async (req: any, res) => {
    try {
      const { campaignEngineService } = await import('./services/trading/campaignEngineService');
      
      if (campaignEngineService.isRunning()) {
        return res.json({ message: "Campaign engine is already running", status: "running" });
      }
      
      await campaignEngineService.startMainLoop();
      res.json({ message: "Campaign engine started", status: "running" });
    } catch (error: any) {
      console.error("Error starting campaign engine:", error);
      res.status(500).json({ message: "Failed to start campaign engine" });
    }
  });

  // Campaign Engine - Stop the main trading loop
  app.post('/api/campaign-engine/stop', isAuthenticated, async (req: any, res) => {
    try {
      const { campaignEngineService } = await import('./services/trading/campaignEngineService');
      
      campaignEngineService.stopMainLoop();
      res.json({ message: "Campaign engine stopped", status: "stopped" });
    } catch (error: any) {
      console.error("Error stopping campaign engine:", error);
      res.status(500).json({ message: "Failed to stop campaign engine" });
    }
  });

  // Campaign Engine - Get status and all engine states
  app.get('/api/campaign-engine/status', isAuthenticated, async (req: any, res) => {
    try {
      const { campaignEngineService } = await import('./services/trading/campaignEngineService');
      
      res.json({
        isRunning: campaignEngineService.isRunning(),
        engineStates: campaignEngineService.getAllEngineStates(),
      });
    } catch (error: any) {
      console.error("Error getting campaign engine status:", error);
      res.status(500).json({ message: "Failed to get campaign engine status" });
    }
  });

  // Campaign Engine - Public health check and auto-start (no auth required for diagnostics)
  app.get('/api/campaign-engine/health', async (req, res) => {
    try {
      const { campaignEngineService } = await import('./services/trading/campaignEngineService');
      const isRunning = campaignEngineService.isRunning();
      
      // Auto-start if not running
      if (!isRunning) {
        console.log('[CampaignEngine] Health check detected engine not running - auto-starting...');
        await campaignEngineService.startMainLoop();
      }
      
      // Get active campaigns count
      const activeCampaigns = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.status, 'active'));
      
      res.json({
        status: campaignEngineService.isRunning() ? 'running' : 'starting',
        activeCampaigns: activeCampaigns.length,
        engineStates: campaignEngineService.getAllEngineStates(),
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error in campaign engine health check:", error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Helper function to verify campaign ownership
  async function verifyCampaignOwnership(campaignId: string, userId: string): Promise<{ success: boolean; error?: string; statusCode?: number; campaign?: any }> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return { success: false, error: "Campaign not found", statusCode: 404 };
    }
    
    const portfolio = await storage.getPortfolio(campaign.portfolio_id);
    if (!portfolio) {
      return { success: false, error: "Portfolio not found", statusCode: 404 };
    }
    
    if (portfolio.user_id !== userId) {
      return { success: false, error: "Access denied", statusCode: 403 };
    }
    
    return { success: true, campaign };
  }

  // Campaign Engine - Get risk state for a specific campaign
  app.get('/api/campaigns/:id/risk-state', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const riskStates = await db.select().from(require('@shared/schema').campaign_risk_states)
        .where(eq(require('@shared/schema').campaign_risk_states.campaign_id, id))
        .limit(1);
      
      if (riskStates.length === 0) {
        return res.status(404).json({ message: "Risk state not found for this campaign" });
      }
      
      res.json(riskStates[0]);
    } catch (error: any) {
      console.error("Error fetching campaign risk state:", error);
      res.status(500).json({ message: "Failed to fetch campaign risk state" });
    }
  });

  // Campaign Engine - Get asset universe for a campaign
  app.get('/api/campaigns/:id/universe', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const universe = await db.select().from(require('@shared/schema').campaign_asset_universes)
        .where(eq(require('@shared/schema').campaign_asset_universes.campaign_id, id));
      
      res.json(universe);
    } catch (error: any) {
      console.error("Error fetching campaign universe:", error);
      res.status(500).json({ message: "Failed to fetch campaign asset universe" });
    }
  });

  // Campaign Engine - Get cluster summary for a campaign (lightweight endpoint for campaign list)
  app.get('/api/campaigns/:id/cluster-summary', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const universe = await db.select().from(require('@shared/schema').campaign_asset_universes)
        .where(eq(require('@shared/schema').campaign_asset_universes.campaign_id, id));
      
      // Calculate cluster summary
      const clusterMap = new Map<number, { count: number; tradable: number }>();
      let totalAssets = 0;
      let tradableAssets = 0;
      
      for (const asset of universe) {
        totalAssets++;
        if (asset.is_in_tradable_set) tradableAssets++;
        
        if (asset.cluster_number !== null) {
          const existing = clusterMap.get(asset.cluster_number) || { count: 0, tradable: 0 };
          existing.count++;
          if (asset.is_in_tradable_set) existing.tradable++;
          clusterMap.set(asset.cluster_number, existing);
        }
      }
      
      // Convert map to sorted array
      const clusters = Array.from(clusterMap.entries())
        .map(([clusterNumber, data]) => ({
          cluster: clusterNumber,
          count: data.count,
          tradable: data.tradable
        }))
        .sort((a, b) => a.cluster - b.cluster);
      
      res.json({
        totalAssets,
        tradableAssets,
        clusterCount: clusters.length,
        clusters
      });
    } catch (error: any) {
      console.error("Error fetching campaign cluster summary:", error);
      res.status(500).json({ message: "Failed to fetch cluster summary" });
    }
  });

  // Campaign Engine - Refresh cluster assignments for a campaign
  app.post('/api/campaigns/:id/refresh-clusters', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const assetSelectorService = (await import('./services/assetSelectorService')).assetSelectorService;
      const schema = require('@shared/schema');
      
      console.log(`[Routes] Refreshing clusters for campaign ${id}`);
      
      const campaign = await db.select({
        portfolio_id: schema.campaigns.portfolio_id
      })
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, id))
        .limit(1)
        .execute();
      
      if (campaign.length === 0) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      const portfolio = await db.select({
        user_id: schema.portfolios.user_id
      })
        .from(schema.portfolios)
        .where(eq(schema.portfolios.id, campaign[0].portfolio_id))
        .limit(1)
        .execute();
      
      if (portfolio.length === 0) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      
      const portfolioUserId = portfolio[0].user_id;
      
      // Get existing campaign universe symbols FIRST
      const existingUniverse = await db.select()
        .from(schema.campaign_asset_universes)
        .where(eq(schema.campaign_asset_universes.campaign_id, id));
      
      if (existingUniverse.length === 0) {
        return res.status(400).json({ message: "Campaign has no assets in universe" });
      }
      
      const existingSymbolsSet = new Set(existingUniverse.map((u: any) => u.symbol));
      
      // Run the clustering selection
      let selectionResult;
      try {
        selectionResult = await assetSelectorService.runSelection(portfolioUserId);
      } catch (selectionError) {
        console.error(`[Routes] Clustering selection failed:`, selectionError);
        // Fallback: assign all assets to cluster 0
        selectionResult = { assets: [], clusters: [] };
      }
      
      // Create map of symbol to cluster from selection results
      const symbolToCluster = new Map<string, number>();
      selectionResult.assets.forEach((asset: any) => {
        symbolToCluster.set(asset.symbol, asset.cluster_number);
      });
      
      // Track which clusters are used by campaign assets
      const usedClusters = new Map<number, string[]>();
      const unmatchedAssets: any[] = [];
      
      // First pass: assign clusters to assets that match the selection
      let updatedCount = 0;
      for (const universeAsset of existingUniverse) {
        const clusterNum = symbolToCluster.get(universeAsset.symbol);
        if (clusterNum !== undefined) {
          // Asset found in selection - use its cluster
          if (clusterNum !== universeAsset.cluster_number) {
            await db.update(schema.campaign_asset_universes)
              .set({ cluster_number: clusterNum })
              .where(eq(schema.campaign_asset_universes.id, universeAsset.id));
            updatedCount++;
          }
          // Track this cluster
          if (!usedClusters.has(clusterNum)) {
            usedClusters.set(clusterNum, []);
          }
          usedClusters.get(clusterNum)!.push(universeAsset.symbol);
        } else {
          // Asset not in selection - will assign to misc cluster
          unmatchedAssets.push(universeAsset);
        }
      }
      
      // For unmatched assets, assign to cluster 0 (misc cluster)
      // This GUARANTEES ALL assets have a cluster_number
      const miscCluster = 0;
      if (unmatchedAssets.length > 0) {
        for (const asset of unmatchedAssets) {
          if (asset.cluster_number !== miscCluster) {
            await db.update(schema.campaign_asset_universes)
              .set({ cluster_number: miscCluster })
              .where(eq(schema.campaign_asset_universes.id, asset.id));
            updatedCount++;
          }
        }
        // Add misc cluster to used clusters
        usedClusters.set(miscCluster, unmatchedAssets.map(a => a.symbol));
        console.log(`[Routes] Assigned ${unmatchedAssets.length} unmatched assets to misc cluster 0`);
      }
      
      // If no clusters exist yet, put ALL assets in misc cluster to guarantee at least one cluster
      if (usedClusters.size === 0) {
        for (const asset of existingUniverse) {
          if (asset.cluster_number !== miscCluster) {
            await db.update(schema.campaign_asset_universes)
              .set({ cluster_number: miscCluster })
              .where(eq(schema.campaign_asset_universes.id, asset.id));
            updatedCount++;
          }
        }
        usedClusters.set(miscCluster, existingUniverse.map((a: any) => a.symbol));
        console.log(`[Routes] Fallback: Assigned all ${existingUniverse.length} assets to misc cluster 0`);
      }
      
      // Delete existing cluster records for this campaign
      await db.delete(schema.clusters)
        .where(eq(schema.clusters.campaign_id, id));
      
      // Create cluster records based on actual campaign assets
      let clustersCreated = 0;
      for (const [clusterNum, assets] of Array.from(usedClusters.entries())) {
        if (assets.length > 0) {
          // Find matching cluster metrics from selection, fallback to default
          const selectionCluster = selectionResult.clusters.find((c: any) => c.cluster_number === clusterNum);
          const avgVolatility = selectionCluster?.avg_metrics?.atr?.toFixed(6) || '0.050000';
          
          await db.insert(schema.clusters).values({
            campaign_id: id,
            cluster_number: clusterNum,
            assets: assets,
            avg_volatility: avgVolatility,
            circuit_breaker_active: false,
          }).onConflictDoNothing();
          clustersCreated++;
        }
      }
      
      console.log(`[Routes] Refreshed clusters for campaign ${id}: ${updatedCount} assets updated, ${clustersCreated} clusters created`);
      
      res.json({
        success: true,
        updatedAssets: updatedCount,
        clustersCreated: clustersCreated,
        totalAssets: existingUniverse.length,
        unmatchedAssets: unmatchedAssets.length
      });
    } catch (error: any) {
      console.error("Error refreshing campaign clusters:", error);
      res.status(500).json({ message: "Failed to refresh clusters" });
    }
  });

  // Campaign Engine - Get daily reports for a campaign
  app.get('/api/campaigns/:id/daily-reports', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const reports = await db.select().from(require('@shared/schema').campaign_daily_reports)
        .where(eq(require('@shared/schema').campaign_daily_reports.campaign_id, id))
        .orderBy(desc(require('@shared/schema').campaign_daily_reports.report_date));
      
      res.json(reports);
    } catch (error: any) {
      console.error("Error fetching campaign daily reports:", error);
      res.status(500).json({ message: "Failed to fetch campaign daily reports" });
    }
  });

  // Campaign Engine - Get positions for a campaign
  app.get('/api/campaigns/:id/positions', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { state } = req.query;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const schema = require('@shared/schema');
      let whereCondition;
      
      if (state) {
        whereCondition = and(
          eq(schema.campaign_positions.campaign_id, id),
          eq(schema.campaign_positions.state, state as string)
        );
      } else {
        whereCondition = eq(schema.campaign_positions.campaign_id, id);
      }
      
      const positions = await db.select().from(schema.campaign_positions)
        .where(whereCondition)
        .orderBy(desc(schema.campaign_positions.opened_at));
      res.json(positions);
    } catch (error: any) {
      console.error("Error fetching campaign positions:", error);
      res.status(500).json({ message: "Failed to fetch campaign positions" });
    }
  });

  // Campaign Engine - Get campaign-specific orders
  app.get('/api/campaigns/:id/engine-orders', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.query;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const schema = require('@shared/schema');
      let whereCondition;
      
      if (status) {
        whereCondition = and(
          eq(schema.campaign_orders.campaign_id, id),
          eq(schema.campaign_orders.status, status as string)
        );
      } else {
        whereCondition = eq(schema.campaign_orders.campaign_id, id);
      }
      
      const orders = await db.select().from(schema.campaign_orders)
        .where(whereCondition)
        .orderBy(desc(schema.campaign_orders.created_at));
      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching campaign engine orders:", error);
      res.status(500).json({ message: "Failed to fetch campaign engine orders" });
    }
  });

  // Campaign Engine - Trigger manual circuit breaker reset for a pair
  app.post('/api/campaigns/:id/reset-pair-cb', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { symbol } = req.body;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      if (!symbol) {
        return res.status(400).json({ message: "Symbol is required" });
      }
      
      const [riskState] = await db.select().from(require('@shared/schema').campaign_risk_states)
        .where(eq(require('@shared/schema').campaign_risk_states.campaign_id, id));
      
      if (!riskState) {
        return res.status(404).json({ message: "Risk state not found" });
      }
      
      const cbPairTriggered = (riskState.cb_pair_triggered || {}) as Record<string, boolean>;
      cbPairTriggered[symbol] = false;
      
      const lossInRByPair = (riskState.loss_in_r_by_pair || {}) as Record<string, number>;
      lossInRByPair[symbol] = 0;
      
      await db.update(require('@shared/schema').campaign_risk_states)
        .set({
          cb_pair_triggered: cbPairTriggered,
          loss_in_r_by_pair: lossInRByPair,
          updated_at: new Date()
        })
        .where(eq(require('@shared/schema').campaign_risk_states.campaign_id, id));
      
      res.json({ message: `Circuit breaker reset for ${symbol}`, symbol });
    } catch (error: any) {
      console.error("Error resetting pair circuit breaker:", error);
      res.status(500).json({ message: "Failed to reset pair circuit breaker" });
    }
  });

  // Campaign Engine - Trigger manual daily CB reset
  app.post('/api/campaigns/:id/reset-daily-cb', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      await db.update(require('@shared/schema').campaign_risk_states)
        .set({
          cb_daily_triggered: false,
          daily_loss_pct: "0",
          cb_cooldown_until: null,
          updated_at: new Date()
        })
        .where(eq(require('@shared/schema').campaign_risk_states.campaign_id, id));
      
      res.json({ message: "Daily circuit breaker reset" });
    } catch (error: any) {
      console.error("Error resetting daily circuit breaker:", error);
      res.status(500).json({ message: "Failed to reset daily circuit breaker" });
    }
  });

  // Campaign Engine - Liquidate positions for liquidity
  app.post('/api/campaigns/:id/liquidate-positions', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { positionIds } = req.body; // Optional: specific positions to liquidate
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const campaign = ownershipCheck.campaign!;
      
      // Only allow liquidation for running, paused, or active campaigns
      if (!['running', 'paused', 'active'].includes(campaign.status)) {
        return res.status(400).json({ 
          message: "Can only liquidate positions for running, paused, or active campaigns" 
        });
      }
      
      const { campaignEngineService } = await import('./services/trading/campaignEngineService');
      const result = await campaignEngineService.liquidatePositionsForLiquidity(id, positionIds);
      
      res.json({
        message: result.success 
          ? `Successfully liquidated ${result.liquidatedCount} positions for ~$${result.estimatedUSD.toFixed(2)}` 
          : `Partially liquidated: ${result.liquidatedCount} success, ${result.failedCount} failed`,
        ...result
      });
    } catch (error: any) {
      console.error("Error liquidating positions:", error);
      res.status(500).json({ message: "Failed to liquidate positions" });
    }
  });

  // Liquidate orphan assets from Kraken account (assets left after campaign completion)
  // SECURITY: Requires admin authorization - uses global Kraken credentials
  app.post('/api/admin/kraken/liquidate-orphan-assets', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = parseInt(req.user.claims.sub);
      
      console.log(`[API][ADMIN] Liquidating orphan assets requested by admin ${userId}`);
      
      const { campaignEngineService } = await import('./services/trading/campaignEngineService');
      const result = await campaignEngineService.liquidateOrphanAssets(userId);
      
      res.json({
        message: result.success 
          ? `Successfully liquidated ${result.liquidatedCount} assets for ~$${result.estimatedUSD.toFixed(2)}` 
          : `Partially liquidated: ${result.liquidatedCount} success, ${result.failedCount} failed`,
        ...result
      });
    } catch (error: any) {
      console.error("Error liquidating orphan assets:", error);
      res.status(500).json({ message: "Failed to liquidate orphan assets" });
    }
  });

  // Delete campaign (only stopped/completed campaigns can be deleted)
  app.delete('/api/campaigns/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const campaign = ownershipCheck.campaign!;
      
      // Only allow deletion of stopped, completed, or paused campaigns
      if (!['stopped', 'completed', 'paused'].includes(campaign.status)) {
        return res.status(400).json({ 
          message: "Only stopped, completed, or paused campaigns can be deleted" 
        });
      }
      
      // Delete related data first (cascade)
      await db.delete(require('@shared/schema').robot_activity_logs)
        .where(eq(require('@shared/schema').robot_activity_logs.campaign_id, id));
      await db.delete(require('@shared/schema').campaign_risk_states)
        .where(eq(require('@shared/schema').campaign_risk_states.campaign_id, id));
      await db.delete(require('@shared/schema').clusters)
        .where(eq(require('@shared/schema').clusters.campaign_id, id));
      await db.delete(require('@shared/schema').campaign_orders)
        .where(eq(require('@shared/schema').campaign_orders.campaign_id, id));
      await db.delete(require('@shared/schema').campaign_positions)
        .where(eq(require('@shared/schema').campaign_positions.campaign_id, id));
      
      // Finally delete the campaign
      await db.delete(campaigns).where(eq(campaigns.id, id));
      
      res.json({ message: "Campaign deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // Robot Activity Feed - Get recent activities for a campaign
  app.get('/api/campaigns/:id/activities', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { limit = '50', sinceMinutes } = req.query;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const { robotActivityService } = await import('./services/robotActivityService');
      const activities = await robotActivityService.getRecentActivities(
        id,
        parseInt(limit as string),
        sinceMinutes ? parseInt(sinceMinutes as string) : undefined
      );
      
      res.json(activities);
    } catch (error: any) {
      console.error("Error fetching robot activities:", error);
      res.status(500).json({ message: "Failed to fetch robot activities" });
    }
  });

  // Campaign Reports - Robot Status (Estado Operacional)
  app.get('/api/campaigns/:id/robot-status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const { campaignReportService } = await import('./services/campaignReportService');
      const status = await campaignReportService.getRobotStatus(id);
      
      if (!status) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      res.json(status);
    } catch (error: any) {
      console.error("Error fetching robot status:", error);
      res.status(500).json({ message: "Failed to fetch robot status" });
    }
  });

  // Campaign Reports - 8 Hour Report
  app.get('/api/campaigns/:id/report/8h', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const { campaignReportService } = await import('./services/campaignReportService');
      const report = await campaignReportService.getReport8h(id);
      
      if (!report) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      res.json(report);
    } catch (error: any) {
      console.error("Error fetching 8h report:", error);
      res.status(500).json({ message: "Failed to fetch 8h report" });
    }
  });

  // Campaign Reports - 24 Hour Report (Daily)
  app.get('/api/campaigns/:id/report/24h', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const { campaignReportService } = await import('./services/campaignReportService');
      const report = await campaignReportService.getReport24h(id);
      
      if (!report) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      res.json(report);
    } catch (error: any) {
      console.error("Error fetching 24h report:", error);
      res.status(500).json({ message: "Failed to fetch 24h report" });
    }
  });

  // Campaign Reports - Trade History
  app.get('/api/campaigns/:id/history', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { hours = '72' } = req.query;
      const userId = req.user.claims.sub;
      
      const ownershipCheck = await verifyCampaignOwnership(id, userId);
      if (!ownershipCheck.success) {
        return res.status(ownershipCheck.statusCode!).json({ message: ownershipCheck.error });
      }
      
      const { campaignReportService } = await import('./services/campaignReportService');
      const history = await campaignReportService.getHistory(id, parseInt(hours as string));
      
      if (!history) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      res.json(history);
    } catch (error: any) {
      console.error("Error fetching trade history:", error);
      res.status(500).json({ message: "Failed to fetch trade history" });
    }
  });

  // Clusters - Get by campaign
  app.get('/api/clusters/:campaignId', isAuthenticated, async (req: any, res) => {
    try {
      const { campaignId } = req.params;
      const clusters = await storage.getClustersByCampaign(campaignId);
      res.json(clusters);
    } catch (error) {
      console.error("Error fetching clusters:", error);
      res.status(500).json({ message: "Failed to fetch clusters" });
    }
  });

  // Clusters - Create
  app.post('/api/clusters', isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body with Zod
      const validationResult = insertClusterSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid cluster data", 
          errors: validationResult.error.errors 
        });
      }

      const { campaign_id } = validationResult.data;
      
      // campaign_id is optional in clusters, but if provided must be valid
      if (campaign_id) {
        // Verify campaign exists (SECURITY: prevent cross-tenant mutations)
        const campaign = await storage.getCampaign(campaign_id);
        if (!campaign) {
          return res.status(404).json({ message: "Campaign not found" });
        }
        
        // Verify campaign's portfolio belongs to user
        const portfolio = await storage.getPortfolio(campaign.portfolio_id);
        if (!portfolio) {
          return res.status(404).json({ message: "Portfolio not found" });
        }
        
        const userId = req.user.claims.sub;
        if (portfolio.user_id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const cluster = await storage.createCluster(validationResult.data);
      res.json(cluster);
    } catch (error) {
      console.error("Error creating cluster:", error);
      res.status(500).json({ message: "Failed to create cluster" });
    }
  });

  // Clusters - Update PnL
  app.patch('/api/clusters/:id/pnl', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Validate request body with Zod
      const validationResult = updateClusterPnLSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid cluster PnL data", 
          errors: validationResult.error.errors 
        });
      }

      const { daily_pnl } = validationResult.data;

      const updated = await storage.updateClusterPnL(id, daily_pnl);
      res.json(updated);
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error updating cluster PnL:", error);
      res.status(500).json({ message: "Failed to update cluster PnL" });
    }
  });

  // ===== ASSET SELECTION ENDPOINTS =====
  
  // Run Asset Selection + Clustering
  app.post('/api/selector/run', isAuthenticated, async (req: any, res) => {
    try {
      const { assetSelectorService, clusterService } = await import('./services/market');
      
      // Parse optional filters from request body
      const filters = req.body?.filters || {};
      const topN = req.body?.topN || 100;
      
      console.log(`[INFO] Starting asset selection with filters:`, filters);
      
      // Step 1: Run asset selection with custom filters
      let selectionResult;
      try {
        selectionResult = await assetSelectorService.runSelection(topN, filters);
        console.log(`[INFO] Selected ${selectionResult.selected.length} symbols for run ${selectionResult.runId}`);
      } catch (error) {
        console.error("[ERROR] Asset selection failed:", error);
        return res.status(500).json({ 
          message: "Asset selection failed",
          stage: "selection",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
      
      // Step 2: Cluster the selected symbols
      let clusterAssignments;
      try {
        clusterAssignments = await clusterService.clusterSymbols(selectionResult.runId);
        console.log(`[INFO] Clustered into ${clusterAssignments.length} assignments`);
      } catch (error) {
        console.error("[ERROR] Clustering failed:", error);
        return res.status(500).json({ 
          message: "Clustering failed",
          stage: "clustering",
          runId: selectionResult.runId, // Still return runId so selection can be recovered
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
      
      res.json({
        runId: selectionResult.runId,
        selected: selectionResult.selected.length,
        rejected: selectionResult.rejected,
        clustered: clusterAssignments.length,
      });
    } catch (error) {
      console.error("[ERROR] Unexpected error in asset selection pipeline:", error);
      res.status(500).json({ 
        message: "Unexpected error in asset selection pipeline",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get Rankings by Run ID
  app.get('/api/symbols/rankings', isAuthenticated, async (req: any, res) => {
    try {
      const { runId, limit } = req.query;
      
      if (!runId) {
        return res.status(400).json({ message: "runId query parameter is required" });
      }
      
      const limitNum = limit ? parseInt(limit as string, 10) : 100;
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
        return res.status(400).json({ message: "limit must be between 1 and 10000" });
      }
      
      const rankings = await storage.getTopRankings(runId, limitNum);
      res.json(rankings);
    } catch (error) {
      console.error("Error fetching rankings:", error);
      res.status(500).json({ message: "Failed to fetch rankings" });
    }
  });

  // Data Retention Stats endpoint (for administrators)
  app.get('/api/admin/retention-stats', isAuthenticated, async (_req: any, res) => {
    try {
      const stats = await dataRetentionService.getRetentionStats();
      const policies = dataRetentionService.getRetentionPolicies();
      res.json({ policies, stats });
    } catch (error) {
      console.error('[ERROR] Failed to get retention stats:', error);
      res.status(500).json({ message: 'Failed to retrieve retention statistics' });
    }
  });

  // Clock Sync Status endpoint (for administrators)
  app.get('/api/admin/clock-status', isAuthenticated, async (_req: any, res) => {
    try {
      const status = await clockSyncService.checkClockSync();
      res.json(status);
    } catch (error) {
      console.error('[ERROR] Failed to check clock sync:', error);
      res.status(500).json({ message: 'Failed to check clock synchronization' });
    }
  });

  // Key Rotation Status endpoint (for administrators)
  app.get('/api/admin/key-status', isAuthenticated, async (_req: any, res) => {
    try {
      const { status, rotationSteps } = await keyRotationService.getKeyRotationRecommendations();
      res.json({ status, rotationSteps });
    } catch (error) {
      console.error('[ERROR] Failed to get key rotation status:', error);
      res.status(500).json({ message: 'Failed to retrieve key rotation status' });
    }
  });

  // ===== ADMIN MONITOR ENDPOINTS (User & Campaign Monitoring) =====

  // Get global metrics for admin dashboard
  app.get('/api/admin/monitor/global', isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const metrics = await adminMonitorService.getGlobalMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('[ERROR] Failed to get admin global metrics:', error);
      res.status(500).json({ message: 'Failed to retrieve global metrics' });
    }
  });

  // Get detailed campaign list with user info
  app.get('/api/admin/monitor/campaigns', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, mode, userId, limit, offset } = req.query;
      const campaigns = await adminMonitorService.getDetailedCampaigns({
        status: status as string | undefined,
        mode: mode as string | undefined,
        userId: userId as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      res.json(campaigns);
    } catch (error) {
      console.error('[ERROR] Failed to get admin campaign details:', error);
      res.status(500).json({ message: 'Failed to retrieve campaign details' });
    }
  });

  // Get admin alerts
  app.get('/api/admin/monitor/alerts', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { unreadOnly, limit } = req.query;
      const alerts = await adminMonitorService.getAlerts({
        unreadOnly: unreadOnly === 'true',
        limit: limit ? parseInt(limit as string) : 50,
      });
      res.json(alerts);
    } catch (error) {
      console.error('[ERROR] Failed to get admin alerts:', error);
      res.status(500).json({ message: 'Failed to retrieve alerts' });
    }
  });

  // Mark single alert as read
  app.post('/api/admin/monitor/alerts/:id/read', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const adminUserId = req.user.claims.sub;
      await adminMonitorService.markAlertAsRead(id, adminUserId);
      res.json({ success: true });
    } catch (error) {
      console.error('[ERROR] Failed to mark alert as read:', error);
      res.status(500).json({ message: 'Failed to mark alert as read' });
    }
  });

  // Mark all alerts as read
  app.post('/api/admin/monitor/alerts/mark-all-read', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminUserId = req.user.claims.sub;
      const count = await adminMonitorService.markAllAlertsAsRead(adminUserId);
      res.json({ success: true, markedCount: count });
    } catch (error) {
      console.error('[ERROR] Failed to mark all alerts as read:', error);
      res.status(500).json({ message: 'Failed to mark all alerts as read' });
    }
  });

  // Prometheus metrics endpoint (public - no authentication required)
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      const metrics = await observabilityService.getMetrics();
      res.send(metrics);
    } catch (error) {
      console.error('[ERROR] Failed to get Prometheus metrics:', error);
      res.status(500).send('Failed to retrieve metrics');
    }
  });

  // ===== BACKTEST & SIMULATION ENDPOINTS =====
  
  // Start a new backtest run
  app.post('/api/backtest/run', isAuthenticated, async (req: any, res) => {
    try {
      const { 
        BacktestEngine, 
        MonteCarloSimulator, 
        backtestMetricsService,
        extractTradeReturns,
        createDefaultStrategyParams,
        createDefaultRiskParams,
        createDefaultCostParams
      } = await import('./services/backtest');
      const { backtest_runs, insertBacktestRunSchema } = await import('@shared/schema');
      
      const userId = req.user.claims.sub;
      
      // Convert date strings to Date objects for validation
      const requestBody = {
        ...req.body,
        start_date: req.body.start_date ? new Date(req.body.start_date) : undefined,
        end_date: req.body.end_date ? new Date(req.body.end_date) : undefined,
        user_id: userId,
        status: "pending"
      };
      
      // Validate request body
      const validationResult = insertBacktestRunSchema.safeParse(requestBody);
      
      if (!validationResult.success) {
        console.error("[BacktestAPI] Validation errors:", validationResult.error.errors);
        return res.status(400).json({ 
          message: "Invalid backtest configuration", 
          errors: validationResult.error.errors 
        });
      }

      const config = validationResult.data;
      
      // Get defaults for strategy, risk, and cost params
      const defaultStrategyParams = createDefaultStrategyParams();
      const defaultRiskParams = createDefaultRiskParams();
      const defaultCostParams = createDefaultCostParams();
      
      // Merge user-provided params with defaults
      const strategyParams = config.strategy_params 
        ? { ...defaultStrategyParams, ...(config.strategy_params as object) }
        : defaultStrategyParams;
      const riskParams = config.risk_params 
        ? { ...defaultRiskParams, ...(config.risk_params as object) }
        : defaultRiskParams;
      const costParams = config.cost_params 
        ? { ...defaultCostParams, ...(config.cost_params as object) }
        : defaultCostParams;
      
      // Create backtest run record
      const [backtestRun] = await db.insert(backtest_runs).values({
        user_id: userId,
        portfolio_id: config.portfolio_id || null,
        name: config.name,
        start_date: config.start_date,
        end_date: config.end_date,
        initial_capital: config.initial_capital,
        symbols: config.symbols,
        strategy_params: strategyParams,
        risk_params: riskParams,
        cost_params: costParams,
        apply_breakers: config.apply_breakers ?? true,
        status: "running",
        started_at: new Date(),
      }).returning();

      // Run backtest asynchronously (use already computed params)
      const initialCapital = parseFloat(config.initial_capital);
      const applyBreakers = config.apply_breakers ?? true;
      
      (async () => {
        try {
          const engine = new BacktestEngine(
            strategyParams as any,
            riskParams as any,
            costParams as any,
            initialCapital,
            applyBreakers
          );

          const trades = await engine.run(
            backtestRun.id,
            config.symbols,
            new Date(config.start_date),
            new Date(config.end_date)
          );

          // Run Monte Carlo simulation
          let monteCarloResults;
          if (trades.length >= 10) {
            const tradeReturns = extractTradeReturns(trades);
            const riskConfig = riskParams as any;
            const simulator = new MonteCarloSimulator(
              initialCapital,
              applyBreakers,
              riskConfig.global_stop_daily_pct,
              riskConfig.campaign_dd_stop
            );
            monteCarloResults = await simulator.runSimulation(
              backtestRun.id,
              tradeReturns,
              500 // Number of scenarios
            );
          }

          // Calculate and save metrics
          await backtestMetricsService.calculateAndSaveMetrics(
            backtestRun.id,
            initialCapital,
            monteCarloResults
          );

          console.log(`[BacktestAPI] Backtest ${backtestRun.id} completed successfully`);
        } catch (error) {
          console.error(`[BacktestAPI] Backtest ${backtestRun.id} failed:`, error);
          await db.update(backtest_runs)
            .set({ 
              status: "failed", 
              error_message: error instanceof Error ? error.message : "Unknown error",
              completed_at: new Date()
            })
            .where(eq(backtest_runs.id, backtestRun.id));
        }
      })();

      res.json({ 
        id: backtestRun.id, 
        status: "running",
        message: "Backtest started successfully" 
      });
    } catch (error) {
      console.error("[ERROR] Failed to start backtest:", error);
      res.status(500).json({ message: "Failed to start backtest" });
    }
  });

  // Get backtest results
  app.get('/api/backtest/:id/results', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const { backtest_runs, backtest_trades, backtest_metrics } = await import('@shared/schema');

      // Get backtest run
      const [backtestRun] = await db.select()
        .from(backtest_runs)
        .where(eq(backtest_runs.id, id));

      if (!backtestRun) {
        return res.status(404).json({ message: "Backtest not found" });
      }

      // Verify ownership
      if (backtestRun.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get metrics
      const [metrics] = await db.select()
        .from(backtest_metrics)
        .where(eq(backtest_metrics.backtest_run_id, id));

      // Get trades summary (limited to prevent large responses)
      const trades = await db.select()
        .from(backtest_trades)
        .where(eq(backtest_trades.backtest_run_id, id))
        .orderBy(desc(backtest_trades.entry_time))
        .limit(100);

      res.json({
        run: backtestRun,
        metrics: metrics || null,
        trades: trades,
        tradesCount: backtestRun.total_trades
      });
    } catch (error) {
      console.error("[ERROR] Failed to get backtest results:", error);
      res.status(500).json({ message: "Failed to get backtest results" });
    }
  });

  // Get Monte Carlo scenarios
  app.get('/api/backtest/:id/montecarlo', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const { backtest_runs, monte_carlo_scenarios, backtest_metrics } = await import('@shared/schema');

      // Get backtest run
      const [backtestRun] = await db.select()
        .from(backtest_runs)
        .where(eq(backtest_runs.id, id));

      if (!backtestRun) {
        return res.status(404).json({ message: "Backtest not found" });
      }

      // Verify ownership
      if (backtestRun.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get Monte Carlo scenarios (summary stats, not all scenarios)
      const scenarios = await db.select()
        .from(monte_carlo_scenarios)
        .where(eq(monte_carlo_scenarios.backtest_run_id, id))
        .orderBy(monte_carlo_scenarios.scenario_number)
        .limit(100);

      // Get metrics for summary
      const [metrics] = await db.select()
        .from(backtest_metrics)
        .where(eq(backtest_metrics.backtest_run_id, id));

      res.json({
        scenarios,
        summary: metrics?.monte_carlo_results || null,
        totalScenarios: scenarios.length
      });
    } catch (error) {
      console.error("[ERROR] Failed to get Monte Carlo results:", error);
      res.status(500).json({ message: "Failed to get Monte Carlo results" });
    }
  });

  // Get backtest history
  app.get('/api/backtest/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { limit = "20", offset = "0" } = req.query;
      const { backtest_runs } = await import('@shared/schema');

      const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
      const offsetNum = parseInt(offset as string, 10) || 0;

      const runs = await db.select()
        .from(backtest_runs)
        .where(eq(backtest_runs.user_id, userId))
        .orderBy(desc(backtest_runs.created_at))
        .limit(limitNum)
        .offset(offsetNum);

      res.json({
        runs,
        limit: limitNum,
        offset: offsetNum
      });
    } catch (error) {
      console.error("[ERROR] Failed to get backtest history:", error);
      res.status(500).json({ message: "Failed to get backtest history" });
    }
  });

  // Delete backtest run
  app.delete('/api/backtest/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const { backtest_runs } = await import('@shared/schema');

      // Get backtest run
      const [backtestRun] = await db.select()
        .from(backtest_runs)
        .where(eq(backtest_runs.id, id));

      if (!backtestRun) {
        return res.status(404).json({ message: "Backtest not found" });
      }

      // Verify ownership
      if (backtestRun.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Delete (cascades to trades, metrics, scenarios)
      await db.delete(backtest_runs)
        .where(eq(backtest_runs.id, id));

      res.json({ message: "Backtest deleted successfully" });
    } catch (error) {
      console.error("[ERROR] Failed to delete backtest:", error);
      res.status(500).json({ message: "Failed to delete backtest" });
    }
  });

  // GitHub Integration endpoints
  // Connected via Replit GitHub Connector (connection:conn_github_01KBDPKJV0EMZ87S8YQ9J1R0D2)
  
  // Check GitHub connection status
  app.get('/api/github/status', isAuthenticated, async (req: any, res) => {
    try {
      const { githubService } = await import('./services/githubService');
      const isConnected = await githubService.isConnected();
      res.json({ connected: isConnected });
    } catch (error) {
      res.json({ connected: false });
    }
  });

  // Get authenticated GitHub user
  app.get('/api/github/me', isAuthenticated, async (req: any, res) => {
    try {
      const { githubService } = await import('./services/githubService');
      const user = await githubService.getAuthenticatedUser();
      res.json(user);
    } catch (error: any) {
      console.error("[ERROR] Failed to get GitHub user:", error);
      if (error.message === 'GitHub not connected') {
        return res.status(400).json({ message: "GitHub not connected. Please set up the GitHub integration." });
      }
      res.status(500).json({ message: "Failed to get GitHub user" });
    }
  });

  // List user repositories
  app.get('/api/github/repos', isAuthenticated, async (req: any, res) => {
    try {
      const { githubService } = await import('./services/githubService');
      const { per_page, page } = req.query;
      const repos = await githubService.listRepositories({
        per_page: per_page ? parseInt(per_page as string, 10) : undefined,
        page: page ? parseInt(page as string, 10) : undefined
      });
      res.json(repos);
    } catch (error: any) {
      console.error("[ERROR] Failed to list GitHub repos:", error);
      if (error.message === 'GitHub not connected') {
        return res.status(400).json({ message: "GitHub not connected. Please set up the GitHub integration." });
      }
      res.status(500).json({ message: "Failed to list repositories" });
    }
  });

  // Get specific repository details
  app.get('/api/github/repos/:owner/:repo', isAuthenticated, async (req: any, res) => {
    try {
      const { githubService } = await import('./services/githubService');
      const { owner, repo } = req.params;
      const repository = await githubService.getRepository(owner, repo);
      res.json(repository);
    } catch (error: any) {
      console.error("[ERROR] Failed to get GitHub repo:", error);
      if (error.message === 'GitHub not connected') {
        return res.status(400).json({ message: "GitHub not connected. Please set up the GitHub integration." });
      }
      res.status(500).json({ message: "Failed to get repository" });
    }
  });

  // Create new repository
  app.post('/api/github/repos', isAuthenticated, async (req: any, res) => {
    try {
      const { githubService } = await import('./services/githubService');
      const { name, description, isPrivate } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Repository name is required" });
      }

      const repository = await githubService.createRepository(name.trim(), {
        description: description || undefined,
        private: isPrivate !== false
      });
      
      res.status(201).json(repository);
    } catch (error: any) {
      console.error("[ERROR] Failed to create GitHub repo:", error);
      if (error.message === 'GitHub not connected') {
        return res.status(400).json({ message: "GitHub not connected. Please set up the GitHub integration." });
      }
      res.status(500).json({ message: "Failed to create repository" });
    }
  });

  // Backup project to GitHub repository
  app.post('/api/github/backup', isAuthenticated, async (req: any, res) => {
    try {
      const { githubService } = await import('./services/githubService');
      const fs = await import('fs');
      const path = await import('path');
      const { promisify } = await import('util');
      const glob = (await import('glob')).glob;
      
      const { owner, repo, message } = req.body;
      
      if (!owner || !repo) {
        return res.status(400).json({ message: "Owner and repository name are required" });
      }

      const commitMessage = message || `DELFOS Backup - ${new Date().toISOString()}`;
      
      const patterns = [
        'client/src/**/*.ts',
        'client/src/**/*.tsx',
        'client/src/**/*.css',
        'server/**/*.ts',
        'shared/**/*.ts',
        'package.json',
        'tsconfig.json',
        'vite.config.ts',
        'tailwind.config.ts',
        'drizzle.config.ts',
        'replit.md',
        'design_guidelines.md',
        '.gitignore'
      ];
      
      const files: Array<{ path: string; content: string }> = [];
      const baseDir = process.cwd();
      
      for (const pattern of patterns) {
        try {
          const matches = await glob(pattern, { 
            cwd: baseDir,
            nodir: true,
            ignore: ['node_modules/**', '.git/**', 'dist/**']
          });
          
          for (const match of matches) {
            try {
              const fullPath = path.join(baseDir, match);
              const content = fs.readFileSync(fullPath, 'utf-8');
              files.push({ path: match, content });
            } catch (readErr) {
              console.warn(`[WARN] Could not read file ${match}:`, readErr);
            }
          }
        } catch (globErr) {
          console.warn(`[WARN] Pattern ${pattern} failed:`, globErr);
        }
      }
      
      if (files.length === 0) {
        return res.status(400).json({ message: "No files found to backup" });
      }
      
      console.log(`[INFO] Starting backup of ${files.length} files to ${owner}/${repo}`);
      
      const result = await githubService.backupToRepository(owner, repo, files, commitMessage);
      
      console.log(`[INFO] Backup complete: ${result.filesUploaded} files uploaded`);
      
      res.json({
        success: result.success,
        filesUploaded: result.filesUploaded,
        totalFiles: files.length,
        errors: result.errors,
        message: result.success 
          ? `Successfully backed up ${result.filesUploaded} files to ${owner}/${repo}`
          : `Backup completed with errors: ${result.filesUploaded}/${files.length} files uploaded`
      });
    } catch (error: any) {
      console.error("[ERROR] Failed to backup to GitHub:", error);
      if (error.message === 'GitHub not connected') {
        return res.status(400).json({ message: "GitHub not connected. Please set up the GitHub integration." });
      }
      res.status(500).json({ message: `Backup failed: ${error.message}` });
    }
  });

  // ========== FRANCHISE MANAGEMENT ROUTES ==========
  
  // Get franchise plans (public for display - DYNAMIC PRICING)
  // Prices are fetched from franchise_plans table, controlled by Franchisor settings
  app.get('/api/franchise-plans', async (req, res) => {
    try {
      const plans = await db.select()
        .from(franchise_plans)
        .where(eq(franchise_plans.is_active, true))
        .orderBy(franchise_plans.display_order);
      res.json(plans);
    } catch (error) {
      console.error("Error fetching franchise plans:", error);
      res.status(500).json({ message: "Failed to fetch franchise plans" });
    }
  });

  // Create new franchise lead (Etapa 1 - Dados Pessoais)
  app.post('/api/franchise-leads', async (req, res) => {
    try {
      const { franchise_leads } = await import("@shared/schema");
      const { name, trade_name, document_type, document_number, secondary_document, birth_date, email, phone, whatsapp, address_street, address_number, address_complement, address_neighborhood, address_zip, address_city, address_country, plan_id } = req.body;
      
      if (!name || !document_number || !email || !plan_id) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // CHECK FOR DUPLICATE: Same CPF/CNPJ with active registration
      const existingLead = await db.select()
        .from(franchise_leads)
        .where(and(
          eq(franchise_leads.document_number, document_number),
          eq(franchise_leads.status, 'pending')
        ))
        .limit(1);

      if (existingLead.length > 0) {
        return res.status(409).json({ 
          message: "Duplicate registration detected",
          detail: `This CPF/CNPJ is already registered. Existing franchise code: ${existingLead[0].franchise_code}. Please use the existing registration or contact support.`,
          duplicate_franchise_code: existingLead[0].franchise_code
        });
      }

      const franchiseCode = `DELFOS-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      
      const [newLead] = await db.insert(franchise_leads).values({
        franchise_code: franchiseCode,
        name,
        trade_name,
        document_type,
        document_number,
        secondary_document,
        birth_date: birth_date ? new Date(birth_date) : undefined,
        email,
        phone,
        whatsapp,
        address_street,
        address_number,
        address_complement,
        address_neighborhood,
        address_zip,
        address_city,
        address_country,
        plan_id,
        status: "pending",
        documents_uploaded: false,
        auto_pre_approved: false,
      }).returning();
      
      res.json({ id: newLead.id, franchise_code: newLead.franchise_code });
    } catch (error: any) {
      console.error("Error creating franchise lead:", error);
      res.status(500).json({ message: error.message || "Failed to create franchise lead" });
    }
  });

  // Accept contract (Etapa 4 - Contrato)
  app.post('/api/franchise-leads/:leadId/accept-contract', async (req, res) => {
    try {
      const { leadId } = req.params;
      const { contract_version } = req.body;
      
      if (!contract_version) {
        return res.status(400).json({ message: "Contract version is required" });
      }

      // Update lead with contract acceptance
      const updateData: any = { contract_version };
      
      // Only update accepted_at if the field exists
      updateData.contract_accepted_at = new Date();
      
      const updatedLead = await db.update(franchise_leads)
        .set(updateData)
        .where(eq(franchise_leads.id, leadId))
        .returning();

      if (!updatedLead || updatedLead.length === 0) {
        return res.status(404).json({ message: "Franchise lead not found" });
      }

      res.json({ success: true, message: "Contract accepted", leadId: leadId });
    } catch (error: any) {
      console.error("Error accepting contract:", error);
      res.status(500).json({ message: error.message || "Failed to accept contract" });
    }
  });

  // Get active contract template
  app.get('/api/contract-templates/active', async (req, res) => {
    try {
      const { contract_templates } = await import("@shared/schema");
      const template = await db.select()
        .from(contract_templates)
        .where(eq(contract_templates.is_active, true))
        .orderBy(desc(contract_templates.created_at))
        .limit(1);
      
      if (!template || template.length === 0) {
        return res.status(404).json({ message: "No active contract template found" });
      }
      
      res.json(template[0]);
    } catch (error: any) {
      console.error("Error fetching contract template:", error);
      res.status(500).json({ message: error.message || "Failed to fetch contract template" });
    }
  });

  // ========== STRIPE PAYMENT ROUTES FOR FRANCHISE ONBOARDING ==========
  
  // Get Stripe publishable key (public, required for frontend)
  app.get('/api/stripe/publishable-key', async (req, res) => {
    try {
      const { getStripePublishableKey } = await import('./services/payments/stripeClient');
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error("[Stripe] Error getting publishable key:", error);
      res.status(500).json({ message: "Stripe not configured" });
    }
  });
  
  // Create Stripe Checkout Session for franchise payment
  app.post('/api/franchise-leads/:leadId/checkout', async (req, res) => {
    try {
      const { leadId } = req.params;
      const { planId } = req.body;
      
      if (!leadId || !planId) {
        return res.status(400).json({ message: "Lead ID and Plan ID are required" });
      }
      
      const { franchisePaymentService } = await import('./services/payments/franchisePaymentService');
      
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      const successUrl = `${baseUrl}/franchise/payment-success`;
      const cancelUrl = `${baseUrl}/franchise`;
      
      const session = await franchisePaymentService.createCheckoutSession(
        leadId,
        planId,
        successUrl,
        cancelUrl
      );
      
      res.json({ 
        checkoutUrl: session.url,
        sessionId: session.id 
      });
    } catch (error: any) {
      console.error("[Stripe Checkout] Error:", error);
      res.status(500).json({ message: error.message || "Failed to create checkout session" });
    }
  });
  
  // Verify payment status for a lead
  app.get('/api/franchise-leads/:leadId/payment-status', async (req, res) => {
    try {
      const { leadId } = req.params;
      
      const { franchisePaymentService } = await import('./services/payments/franchisePaymentService');
      const status = await franchisePaymentService.verifyPaymentStatus(leadId);
      
      res.json(status);
    } catch (error: any) {
      console.error("[Stripe Payment Status] Error:", error);
      res.status(500).json({ message: error.message || "Failed to get payment status" });
    }
  });
  
  // Handle payment success callback (verify and update lead)
  app.post('/api/franchise-leads/:leadId/payment-success', async (req, res) => {
    try {
      const { leadId } = req.params;
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
      }
      
      const { franchisePaymentService } = await import('./services/payments/franchisePaymentService');
      await franchisePaymentService.handlePaymentSuccess(sessionId);
      
      const status = await franchisePaymentService.verifyPaymentStatus(leadId);
      
      res.json({ 
        success: true,
        ...status 
      });
    } catch (error: any) {
      console.error("[Stripe Payment Success] Error:", error);
      res.status(500).json({ message: error.message || "Failed to verify payment" });
    }
  });

  // Get all franchises (franchisor only)
  app.get('/api/franchises', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      console.log(`[Franchise] GET /api/franchises - userId: ${userId}, email: ${userEmail}`);
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      console.log(`[Franchise] Permissions for ${userEmail}: isFranchisor=${permissions.isFranchisor}, globalRole=${permissions.globalRole}`);
      
      if (!permissions.isFranchisor) {
        console.log(`[Franchise] Access denied for ${userEmail} - not a franchisor`);
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const allFranchises = await db.select()
        .from(franchises)
        .orderBy(desc(franchises.created_at));
      
      res.json(allFranchises);
    } catch (error) {
      console.error("Error fetching franchises:", error);
      res.status(500).json({ message: "Failed to fetch franchises" });
    }
  });

  // Get user's franchise (for franchise members)
  app.get('/api/my-franchise', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      
      const franchise = await franchisePermissionService.getUserFranchise(userId, userEmail);
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      res.json({
        franchise,
        permissions,
      });
    } catch (error) {
      console.error("Error fetching user franchise:", error);
      res.status(500).json({ message: "Failed to fetch franchise" });
    }
  });

  // Create franchise (franchisor only)
  app.post('/api/franchises', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      console.log(`[Franchise] POST /api/franchises - userId: ${userId}, email: ${userEmail}`);
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      console.log(`[Franchise] Permissions for ${userEmail}: isFranchisor=${permissions.isFranchisor}`);
      
      if (!permissions.isFranchisor) {
        console.log(`[Franchise] Access denied for ${userEmail} - not a franchisor`);
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { name, cnpj, tax_id, tax_id_type, address, country, plan_id, contract_start, owner_email } = req.body;
      
      if (!name || !plan_id || !contract_start) {
        return res.status(400).json({ message: "Name, plan and contract start date are required" });
      }
      
      // Find owner user if email provided
      let owner_user_id = null;
      if (owner_email) {
        const ownerUser = await db.select()
          .from(users)
          .where(eq(users.email, owner_email))
          .limit(1);
        if (ownerUser.length > 0) {
          owner_user_id = ownerUser[0].id;
        }
      }
      
      const [newFranchise] = await db.insert(franchises).values({
        name,
        cnpj,
        tax_id,
        tax_id_type: tax_id_type || null,
        address,
        country: country || 'BRA',
        plan_id,
        contract_start: new Date(contract_start),
        owner_user_id,
        status: 'active',
      }).returning();
      
      // If owner exists, add them as master user
      if (owner_user_id) {
        await db.insert(franchise_users).values({
          franchise_id: newFranchise.id,
          user_id: owner_user_id,
          role: 'master',
          is_active: true,
          invited_by: userId,
        });
        
        // Update user's global role
        await db.update(users)
          .set({ global_role: 'franchise_owner' })
          .where(eq(users.id, owner_user_id));
      }
      
      res.json(newFranchise);
    } catch (error) {
      console.error("Error creating franchise:", error);
      res.status(500).json({ message: "Failed to create franchise" });
    }
  });

  // Get franchise details by ID (admin only)
  app.get('/api/franchises/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const franchiseId = req.params.id;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      // Allow franchisor or users linked to this franchise
      if (!permissions.isFranchisor) {
        // Check if user is linked to this franchise
        const [userFranchiseLink] = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.user_id, userId),
            eq(franchise_users.is_active, true)
          ));
        
        if (!userFranchiseLink) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      // Get franchise with plan
      const [franchise] = await db
        .select()
        .from(franchises)
        .where(eq(franchises.id, franchiseId));
      
      if (!franchise) {
        return res.status(404).json({ message: "Franchise not found" });
      }
      
      // Get plan details
      const [plan] = await db
        .select()
        .from(franchise_plans)
        .where(eq(franchise_plans.id, franchise.plan_id));
      
      // Get franchise users with user details
      const franchiseUsersData = await db
        .select({
          id: franchise_users.id,
          user_id: franchise_users.user_id,
          role: franchise_users.role,
          permissions: franchise_users.permissions,
          is_active: franchise_users.is_active,
          invited_at: franchise_users.invited_at,
          accepted_at: franchise_users.accepted_at,
          user_email: users.email,
          user_first_name: users.firstName,
          user_last_name: users.lastName,
          user_profile_image: users.profileImageUrl,
        })
        .from(franchise_users)
        .leftJoin(users, eq(franchise_users.user_id, users.id))
        .where(eq(franchise_users.franchise_id, franchiseId));
      
      // Get owner details if exists
      let owner = null;
      if (franchise.owner_user_id) {
        const [ownerData] = await db
          .select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          })
          .from(users)
          .where(eq(users.id, franchise.owner_user_id));
        owner = ownerData;
      }
      
      res.json({
        ...franchise,
        plan,
        owner,
        users: franchiseUsersData,
      });
    } catch (error) {
      console.error("Error fetching franchise details:", error);
      res.status(500).json({ message: "Failed to fetch franchise details" });
    }
  });

  // Update franchise (admin only)
  app.patch('/api/franchises/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const franchiseId = req.params.id;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisors can update franchises" });
      }
      
      const {
        name, cnpj, tax_id_type, tax_id, address, country, plan_id,
        contract_start, contract_end, custom_royalty_percentage,
        bank_name, bank_agency, bank_account, pix_key,
        // Tax Profile for Trading
        tax_country, tax_year, tax_short_term_rate, tax_long_term_rate, tax_min_taxable
      } = req.body;
      
      // Helper to normalize empty strings to null
      const normalizeString = (val: any): string | null => {
        if (val === undefined || val === null || val === '') return null;
        return String(val).trim() || null;
      };
      
      // Helper to normalize numeric values
      const normalizeNumber = (val: any): number | null => {
        if (val === undefined || val === null || val === '') return null;
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
      };
      
      // Helper to normalize dates
      const normalizeDate = (val: any): Date | null => {
        if (val === undefined || val === null || val === '') return null;
        const date = new Date(val);
        return isNaN(date.getTime()) ? null : date;
      };
      
      const updateData: any = { updated_at: new Date() };
      
      // Required string fields
      if (name !== undefined && name) updateData.name = String(name).trim();
      
      // Optional string fields
      if (cnpj !== undefined) updateData.cnpj = normalizeString(cnpj);
      if (tax_id_type !== undefined) updateData.tax_id_type = normalizeString(tax_id_type);
      if (tax_id !== undefined) updateData.tax_id = normalizeString(tax_id);
      if (address !== undefined) updateData.address = normalizeString(address);
      if (country !== undefined && country) updateData.country = String(country).trim();
      if (plan_id !== undefined && plan_id) updateData.plan_id = String(plan_id).trim();
      
      // Date fields
      if (contract_start !== undefined) {
        const parsedStart = normalizeDate(contract_start);
        if (parsedStart) updateData.contract_start = parsedStart;
      }
      if (contract_end !== undefined) updateData.contract_end = normalizeDate(contract_end);
      
      // Numeric fields
      if (custom_royalty_percentage !== undefined) updateData.custom_royalty_percentage = normalizeNumber(custom_royalty_percentage);
      
      // Banking optional string fields
      if (bank_name !== undefined) updateData.bank_name = normalizeString(bank_name);
      if (bank_agency !== undefined) updateData.bank_agency = normalizeString(bank_agency);
      if (bank_account !== undefined) updateData.bank_account = normalizeString(bank_account);
      if (pix_key !== undefined) updateData.pix_key = normalizeString(pix_key);
      
      // Tax Profile for Trading fields
      if (tax_country !== undefined) updateData.tax_country = normalizeString(tax_country);
      if (tax_year !== undefined) {
        const yearNum = parseInt(tax_year);
        updateData.tax_year = isNaN(yearNum) ? null : yearNum;
      }
      if (tax_short_term_rate !== undefined) updateData.tax_short_term_rate = normalizeNumber(tax_short_term_rate)?.toString() || null;
      if (tax_long_term_rate !== undefined) updateData.tax_long_term_rate = normalizeNumber(tax_long_term_rate)?.toString() || null;
      if (tax_min_taxable !== undefined) updateData.tax_min_taxable = normalizeNumber(tax_min_taxable)?.toString() || null;
      
      const [updated] = await db.update(franchises)
        .set(updateData)
        .where(eq(franchises.id, franchiseId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Franchise not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating franchise:", error);
      res.status(500).json({ message: "Failed to update franchise" });
    }
  });

  // Suspend franchise (franchisor only)
  app.post('/api/franchises/:id/suspend', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const franchiseId = req.params.id;
      const { reason } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisors can suspend franchises" });
      }
      
      const [updated] = await db.update(franchises)
        .set({ 
          status: 'suspended',
          suspended_reason: reason || 'Admin action',
          suspended_at: new Date(),
          updated_at: new Date()
        })
        .where(eq(franchises.id, franchiseId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Franchise not found" });
      }
      
      console.log(`[FRANCHISE] Franchise ${franchiseId} suspended by user ${userId}. Reason: ${reason}`);
      res.json(updated);
    } catch (error) {
      console.error("Error suspending franchise:", error);
      res.status(500).json({ message: "Failed to suspend franchise" });
    }
  });

  // Reactivate franchise (franchisor only)
  app.post('/api/franchises/:id/reactivate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const franchiseId = req.params.id;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisors can reactivate franchises" });
      }
      
      const [updated] = await db.update(franchises)
        .set({ 
          status: 'active',
          suspended_reason: null,
          suspended_at: null,
          updated_at: new Date()
        })
        .where(eq(franchises.id, franchiseId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Franchise not found" });
      }
      
      console.log(`[FRANCHISE] Franchise ${franchiseId} reactivated by user ${userId}`);
      res.json(updated);
    } catch (error) {
      console.error("Error reactivating franchise:", error);
      res.status(500).json({ message: "Failed to reactivate franchise" });
    }
  });

  // Add user to franchise
  app.post('/api/franchises/:id/users', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const currentUserEmail = req.user.claims.email;
      const franchiseId = req.params.id;
      const { email, role } = req.body;
      
      if (!email || !role) {
        return res.status(400).json({ message: "Email and role are required" });
      }
      
      const validRoles = ['master', 'operator', 'analyst', 'finance'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(currentUserId, currentUserEmail);
      
      // Only franchisor or franchise master can add users
      let canManageUsers = permissions.isFranchisor;
      if (!canManageUsers) {
        const [userLink] = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.user_id, currentUserId),
            eq(franchise_users.role, 'master'),
            eq(franchise_users.is_active, true)
          ));
        canManageUsers = !!userLink;
      }
      
      if (!canManageUsers) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      // Find user by email or create placeholder if not exists
      let [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()));
      
      if (!targetUser) {
        // Create placeholder user for invitation
        // They will be activated when they log in for the first time
        const [newUser] = await db.insert(users).values({
          email: email.toLowerCase(),
          is_beta_approved: true, // Auto-approve invited users
          global_role: 'user',
          preferred_language: 'pt-BR',
          notifications_enabled: true,
        }).returning();
        targetUser = newUser;
        console.log(`[FRANCHISE] Created placeholder user for invitation: ${email}`);
      }
      
      // Check if user already linked
      const [existingLink] = await db
        .select()
        .from(franchise_users)
        .where(and(
          eq(franchise_users.franchise_id, franchiseId),
          eq(franchise_users.user_id, targetUser.id)
        ));
      
      if (existingLink) {
        return res.status(400).json({ message: "User already linked to this franchise" });
      }
      
      // Add user to franchise
      const [newLink] = await db.insert(franchise_users).values({
        franchise_id: franchiseId,
        user_id: targetUser.id,
        role,
        is_active: true,
        invited_by: currentUserId,
        accepted_at: new Date(),
      }).returning();
      
      res.json({
        ...newLink,
        user_email: targetUser.email,
        user_first_name: targetUser.firstName,
        user_last_name: targetUser.lastName,
      });
    } catch (error) {
      console.error("Error adding user to franchise:", error);
      res.status(500).json({ message: "Failed to add user" });
    }
  });

  // Update user role in franchise
  app.patch('/api/franchises/:id/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const franchiseId = req.params.id;
      const targetUserId = req.params.userId;
      const { role, is_active } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(currentUserId);
      
      // Only franchisor or franchise master can update users
      let canManageUsers = permissions.isFranchisor;
      if (!canManageUsers) {
        const [userLink] = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.user_id, currentUserId),
            eq(franchise_users.role, 'master'),
            eq(franchise_users.is_active, true)
          ));
        canManageUsers = !!userLink;
      }
      
      if (!canManageUsers) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      // Find the link to update
      const [existingLink] = await db
        .select()
        .from(franchise_users)
        .where(and(
          eq(franchise_users.franchise_id, franchiseId),
          eq(franchise_users.user_id, targetUserId)
        ));
      
      if (!existingLink) {
        return res.status(404).json({ message: "User not linked to this franchise" });
      }
      
      // Build update object
      const updateData: any = { updated_at: new Date() };
      if (role !== undefined) {
        const validRoles = ['master', 'operator', 'analyst', 'finance'];
        if (!validRoles.includes(role)) {
          return res.status(400).json({ message: "Invalid role" });
        }
        updateData.role = role;
      }
      if (is_active !== undefined) {
        updateData.is_active = is_active;
      }
      
      // If demoting or deactivating a master, ensure at least one active master remains
      const wouldRemoveMaster = (
        (existingLink.role === 'master' && existingLink.is_active) && 
        ((role !== undefined && role !== 'master') || (is_active === false))
      );
      
      if (wouldRemoveMaster) {
        const activeMasters = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.role, 'master'),
            eq(franchise_users.is_active, true)
          ));
        
        if (activeMasters.length <= 1) {
          return res.status(400).json({ message: "Cannot demote or deactivate the only master of this franchise" });
        }
      }
      
      const [updated] = await db
        .update(franchise_users)
        .set(updateData)
        .where(eq(franchise_users.id, existingLink.id))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating franchise user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Remove user from franchise
  app.delete('/api/franchises/:id/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const franchiseId = req.params.id;
      const targetUserId = req.params.userId;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(currentUserId);
      
      // Only franchisor or franchise master can remove users
      let canManageUsers = permissions.isFranchisor;
      if (!canManageUsers) {
        const [userLink] = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.user_id, currentUserId),
            eq(franchise_users.role, 'master'),
            eq(franchise_users.is_active, true)
          ));
        canManageUsers = !!userLink;
      }
      
      if (!canManageUsers) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      // Prevent removing yourself if you're the only master
      const [targetLink] = await db
        .select()
        .from(franchise_users)
        .where(and(
          eq(franchise_users.franchise_id, franchiseId),
          eq(franchise_users.user_id, targetUserId)
        ));
      
      if (!targetLink) {
        return res.status(404).json({ message: "User not linked to this franchise" });
      }
      
      // If target is an active master, check if there are other active masters
      if (targetLink.role === 'master' && targetLink.is_active) {
        const activeMasters = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.role, 'master'),
            eq(franchise_users.is_active, true)
          ));
        
        if (activeMasters.length <= 1) {
          return res.status(400).json({ message: "Cannot remove the only master of this franchise" });
        }
      }
      
      await db
        .delete(franchise_users)
        .where(eq(franchise_users.id, targetLink.id));
      
      res.json({ message: "User removed successfully" });
    } catch (error) {
      console.error("Error removing franchise user:", error);
      res.status(500).json({ message: "Failed to remove user" });
    }
  });

  // ========== FRANCHISOR USERS MANAGEMENT ==========
  
  // POST /api/franchisor/users - Add user to franchisor
  app.post('/api/franchisor/users', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const currentUserEmail = req.user.claims.email;
      const { email, role } = req.body;
      
      if (!email || !role) {
        return res.status(400).json({ message: "Email and role are required" });
      }
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(currentUserId, currentUserEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      // Find or create user
      let [targetUser] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      if (!targetUser) {
        const [newUser] = await db.insert(users).values({
          email: email.toLowerCase(),
          is_beta_approved: true,
          global_role: 'user',
          preferred_language: 'pt-BR',
          notifications_enabled: true,
        }).returning();
        targetUser = newUser;
      }
      
      // Add to franchisor_users
      const [newLink] = await db.insert(franchisor_users).values({
        user_id: targetUser.id,
        role: role as 'admin' | 'manager' | 'operator',
        is_active: true,
        invited_by: currentUserId,
      }).returning();
      
      res.json({
        ...newLink,
        user_email: targetUser.email,
      });
    } catch (error) {
      console.error("Error adding franchisor user:", error);
      res.status(500).json({ message: "Failed to add user" });
    }
  });

  // PATCH /api/franchisor/users/:userId - Update franchisor user
  app.patch('/api/franchisor/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const currentUserEmail = req.user.claims.email;
      const targetUserId = req.params.userId;
      const { role, is_active } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(currentUserId, currentUserEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      const [existingLink] = await db.select().from(franchisor_users).where(eq(franchisor_users.user_id, targetUserId));
      if (!existingLink) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updateData: any = { updated_at: new Date() };
      if (role !== undefined) updateData.role = role;
      if (is_active !== undefined) updateData.is_active = is_active;
      
      const [updated] = await db.update(franchisor_users).set(updateData).where(eq(franchisor_users.id, existingLink.id)).returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating franchisor user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // DELETE /api/franchisor/users/:userId - Remove franchisor user
  app.delete('/api/franchisor/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const currentUserEmail = req.user.claims.email;
      const targetUserId = req.params.userId;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(currentUserId, currentUserEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      const [existingLink] = await db.select().from(franchisor_users).where(eq(franchisor_users.user_id, targetUserId));
      if (!existingLink) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await db.delete(franchisor_users).where(eq(franchisor_users.id, existingLink.id));
      
      res.json({ message: "User removed successfully" });
    } catch (error) {
      console.error("Error removing franchisor user:", error);
      res.status(500).json({ message: "Failed to remove user" });
    }
  });

  // ========== MASTER FRANCHISE USERS MANAGEMENT ==========
  
  // POST /api/master/users - Add user to master franchise
  app.post('/api/master/users', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const { email, role } = req.body;
      
      if (!email || !role) {
        return res.status(400).json({ message: "Email and role are required" });
      }
      
      // Check if user is master franchise user
      const [isMaster] = await db.select().from(franchise_users).where(and(
        eq(franchise_users.user_id, currentUserId),
        eq(franchise_users.role, 'master'),
        eq(franchise_users.is_active, true)
      ));
      
      if (!isMaster) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      // Find or create user
      let [targetUser] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      if (!targetUser) {
        const [newUser] = await db.insert(users).values({
          email: email.toLowerCase(),
          is_beta_approved: true,
          global_role: 'user',
          preferred_language: 'pt-BR',
          notifications_enabled: true,
        }).returning();
        targetUser = newUser;
      }
      
      // Add to master's franchise
      const [masterFranchise] = await db.select().from(franchise_users).where(eq(franchise_users.user_id, currentUserId));
      
      const [newLink] = await db.insert(franchise_users).values({
        franchise_id: masterFranchise.franchise_id,
        user_id: targetUser.id,
        role: role as any,
        is_active: true,
        invited_by: currentUserId,
      }).returning();
      
      res.json({
        ...newLink,
        user_email: targetUser.email,
      });
    } catch (error) {
      console.error("Error adding master user:", error);
      res.status(500).json({ message: "Failed to add user" });
    }
  });

  // PATCH /api/master/users/:userId - Update master franchise user
  app.patch('/api/master/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const targetUserId = req.params.userId;
      const { role, is_active } = req.body;
      
      // Check if user is master franchise user
      const [isMaster] = await db.select().from(franchise_users).where(and(
        eq(franchise_users.user_id, currentUserId),
        eq(franchise_users.role, 'master'),
        eq(franchise_users.is_active, true)
      ));
      
      if (!isMaster) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      const [existingLink] = await db.select().from(franchise_users).where(eq(franchise_users.user_id, targetUserId));
      if (!existingLink) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updateData: any = { updated_at: new Date() };
      if (role !== undefined) updateData.role = role;
      if (is_active !== undefined) updateData.is_active = is_active;
      
      const [updated] = await db.update(franchise_users).set(updateData).where(eq(franchise_users.id, existingLink.id)).returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating master user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // DELETE /api/master/users/:userId - Remove master franchise user
  app.delete('/api/master/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const targetUserId = req.params.userId;
      
      // Check if user is master franchise user
      const [isMaster] = await db.select().from(franchise_users).where(and(
        eq(franchise_users.user_id, currentUserId),
        eq(franchise_users.role, 'master'),
        eq(franchise_users.is_active, true)
      ));
      
      if (!isMaster) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      const [existingLink] = await db.select().from(franchise_users).where(eq(franchise_users.user_id, targetUserId));
      if (!existingLink) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await db.delete(franchise_users).where(eq(franchise_users.id, existingLink.id));
      
      res.json({ message: "User removed successfully" });
    } catch (error) {
      console.error("Error removing master user:", error);
      res.status(500).json({ message: "Failed to remove user" });
    }
  });

  // ========== FRANCHISE EXCHANGE ACCOUNTS ==========

  // Get exchange accounts for franchise
  app.get('/api/franchises/:id/exchange-accounts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const franchiseId = req.params.id;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId);
      
      // Check access: franchisor or franchise user
      let hasAccess = permissions.isFranchisor || permissions.isMasterFranchise;
      if (!hasAccess) {
        const [userLink] = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.user_id, userId),
            eq(franchise_users.is_active, true)
          ));
        hasAccess = !!userLink;
      }
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      const { franchiseExchangeService } = await import('./services/franchiseExchangeService');
      const accounts = await franchiseExchangeService.getAllExchangeAccounts(franchiseId);
      
      // Return accounts without encrypted credentials
      const safeAccounts = accounts.map(acc => ({
        id: acc.id,
        franchiseId: acc.franchise_id,
        exchange: acc.exchange,
        exchangeLabel: acc.exchange_label,
        canReadBalance: acc.can_read_balance,
        canTrade: acc.can_trade,
        canWithdraw: acc.can_withdraw,
        isActive: acc.is_active,
        isVerified: acc.is_verified,
        verifiedAt: acc.verified_at,
        lastUsedAt: acc.last_used_at,
        consecutiveErrors: acc.consecutive_errors,
        lastError: acc.last_error,
        createdAt: acc.created_at,
      }));
      
      res.json(safeAccounts);
    } catch (error) {
      console.error("Error fetching exchange accounts:", error);
      res.status(500).json({ message: "Failed to fetch exchange accounts" });
    }
  });

  // Create exchange account for franchise
  app.post('/api/franchises/:id/exchange-accounts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const franchiseId = req.params.id;
      const { exchange, exchangeLabel, apiKey, apiSecret, apiPassphrase, canTrade } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId);
      
      // Only franchisor or franchise master can add exchange accounts
      let canManage = permissions.isFranchisor;
      if (!canManage) {
        const [userLink] = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.user_id, userId),
            eq(franchise_users.role, 'master'),
            eq(franchise_users.is_active, true)
          ));
        canManage = !!userLink;
      }
      
      if (!canManage) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      if (!apiKey || !apiSecret) {
        return res.status(400).json({ message: "API key and secret are required" });
      }
      
      const { franchiseExchangeService } = await import('./services/franchiseExchangeService');
      const account = await franchiseExchangeService.createExchangeAccount({
        franchiseId,
        exchange: exchange || 'kraken',
        exchangeLabel,
        credentials: { apiKey, apiSecret, apiPassphrase },
        canTrade: canTrade ?? false,
        createdBy: userId,
      });
      
      res.status(201).json({
        id: account.id,
        exchange: account.exchange,
        exchangeLabel: account.exchange_label,
        isActive: account.is_active,
        isVerified: account.is_verified,
        message: "Exchange account created successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create exchange account";
      console.error("Error creating exchange account:", error);
      res.status(400).json({ message });
    }
  });

  // Update exchange account
  app.patch('/api/franchises/:id/exchange-accounts/:exchange', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const franchiseId = req.params.id;
      const exchange = req.params.exchange;
      const { exchangeLabel, apiKey, apiSecret, apiPassphrase, canTrade, isActive } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId);
      
      let canManage = permissions.isFranchisor;
      if (!canManage) {
        const [userLink] = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.user_id, userId),
            eq(franchise_users.role, 'master'),
            eq(franchise_users.is_active, true)
          ));
        canManage = !!userLink;
      }
      
      if (!canManage) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      const { franchiseExchangeService } = await import('./services/franchiseExchangeService');
      
      const updateParams: any = {};
      if (exchangeLabel !== undefined) updateParams.exchangeLabel = exchangeLabel;
      if (canTrade !== undefined) updateParams.canTrade = canTrade;
      if (isActive !== undefined) updateParams.isActive = isActive;
      if (apiKey && apiSecret) {
        updateParams.credentials = { apiKey, apiSecret, apiPassphrase };
      }
      
      const updated = await franchiseExchangeService.updateExchangeAccount(franchiseId, exchange, updateParams);
      
      if (!updated) {
        return res.status(404).json({ message: "Exchange account not found" });
      }
      
      res.json({
        id: updated.id,
        exchange: updated.exchange,
        exchangeLabel: updated.exchange_label,
        isActive: updated.is_active,
        isVerified: updated.is_verified,
        message: "Exchange account updated successfully",
      });
    } catch (error) {
      console.error("Error updating exchange account:", error);
      res.status(500).json({ message: "Failed to update exchange account" });
    }
  });

  // Verify exchange account credentials
  app.post('/api/franchises/:id/exchange-accounts/:exchange/verify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const franchiseId = req.params.id;
      const exchange = req.params.exchange;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId);
      
      let hasAccess = permissions.isFranchisor;
      if (!hasAccess) {
        const [userLink] = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.user_id, userId),
            eq(franchise_users.is_active, true)
          ));
        hasAccess = !!userLink;
      }
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      const { franchiseExchangeService } = await import('./services/franchiseExchangeService');
      const result = await franchiseExchangeService.verifyExchangeAccount(franchiseId, exchange);
      
      res.json(result);
    } catch (error) {
      console.error("Error verifying exchange account:", error);
      res.status(500).json({ message: "Failed to verify exchange account" });
    }
  });

  // Delete exchange account
  app.delete('/api/franchises/:id/exchange-accounts/:exchange', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const franchiseId = req.params.id;
      const exchange = req.params.exchange;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId);
      
      let canManage = permissions.isFranchisor;
      if (!canManage) {
        const [userLink] = await db
          .select()
          .from(franchise_users)
          .where(and(
            eq(franchise_users.franchise_id, franchiseId),
            eq(franchise_users.user_id, userId),
            eq(franchise_users.role, 'master'),
            eq(franchise_users.is_active, true)
          ));
        canManage = !!userLink;
      }
      
      if (!canManage) {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      const { franchiseExchangeService } = await import('./services/franchiseExchangeService');
      const deleted = await franchiseExchangeService.deleteExchangeAccount(franchiseId, exchange);
      
      if (!deleted) {
        return res.status(404).json({ message: "Exchange account not found" });
      }
      
      res.json({ message: "Exchange account deleted successfully" });
    } catch (error) {
      console.error("Error deleting exchange account:", error);
      res.status(500).json({ message: "Failed to delete exchange account" });
    }
  });

  // Get user permissions
  app.get('/api/user/permissions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      res.json(permissions);
    } catch (error) {
      console.error("Error fetching user permissions:", error);
      res.status(500).json({ message: "Failed to fetch permissions" });
    }
  });

  // Get allowed risk profiles for user based on their franchise plan
  app.get('/api/user/allowed-risk-profiles', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { franchisePlanService } = await import('./services/franchisePlanService');
      const result = await franchisePlanService.getAllowedRiskProfilesForUser(userId);
      
      // Map profile names to codes for frontend compatibility (extended for new profiles)
      const profileNameToCode: Record<string, string> = {
        'conservative': 'C',
        'moderate': 'M',
        'aggressive': 'A',
        'super_aggressive': 'SA',
        'full_custom': 'F'
      };
      
      // If null (no franchise), all profiles are allowed
      const allowedCodes = result.allowed === null 
        ? ['C', 'M', 'A', 'SA', 'F'] 
        : result.allowed.map(name => profileNameToCode[name] || name.toUpperCase().charAt(0));
      
      res.json({
        allowedProfiles: allowedCodes,
        allowedProfileNames: result.allowed || ['conservative', 'moderate', 'aggressive', 'super_aggressive', 'full_custom'],
        planCode: result.planCode,
        planName: result.planName,
        franchiseId: result.franchiseId,
        isUnrestricted: result.allowed === null
      });
    } catch (error) {
      console.error("Error fetching allowed risk profiles:", error);
      res.status(500).json({ message: "Failed to fetch allowed risk profiles" });
    }
  });

  // Get available risk profiles with governance status for campaign wizard
  app.get('/api/user/available-profiles', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { franchisePlanService } = await import('./services/franchisePlanService');
      const profiles = await franchisePlanService.getAvailableProfilesForUser(userId);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching available profiles:", error);
      res.status(500).json({ message: "Failed to fetch available profiles" });
    }
  });

  // Validate campaign risk profile with governance - with strict Zod validation
  const validateProfileSchema = z.object({
    investorProfile: z.string().min(1, "investorProfile is required"),
    customProfileId: z.string().uuid().optional()
  }).refine(
    (data) => {
      // FULL_CUSTOM profile requires customProfileId
      if (data.investorProfile.toUpperCase() === 'F' && !data.customProfileId) {
        return false;
      }
      return true;
    },
    { message: "customProfileId is required for Full Custom profile", path: ["customProfileId"] }
  );
  
  app.post('/api/campaigns/validate-profile', isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = validateProfileSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const userId = req.user.claims.sub;
      const { investorProfile, customProfileId } = parseResult.data;
      
      const { franchisePlanService } = await import('./services/franchisePlanService');
      const validation = await franchisePlanService.validateCampaignRiskProfile(
        userId,
        investorProfile,
        customProfileId
      );
      
      // Return 403 if governance validation fails for high-risk profiles
      if (!validation.valid) {
        return res.status(403).json({
          valid: false,
          message: "Profile validation failed",
          planValidation: validation.planValidation,
          governanceValidation: validation.governanceValidation,
          requiresDoubleConfirm: validation.requiresDoubleConfirm,
          requiresLegalAcceptance: validation.requiresLegalAcceptance
        });
      }
      
      res.json(validation);
    } catch (error) {
      console.error("Error validating campaign profile:", error);
      res.status(500).json({ message: "Failed to validate profile" });
    }
  });

  // Record double confirmation for high-risk campaigns - with validation
  const doubleConfirmSchema = z.object({
    confirmationToken: z.string().optional()
  });
  
  app.post('/api/campaigns/:id/double-confirm', isAuthenticated, async (req: any, res) => {
    try {
      // Apply Zod validation for request body
      const parseResult = doubleConfirmSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Validate campaign exists, belongs to user, and is high-risk profile
      const campaign = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
      if (campaign.length === 0) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      const campaignData = campaign[0];
      
      // SECURITY: Verify ownership - user must own this campaign
      if (campaignData.user_id !== userId) {
        return res.status(403).json({ message: "You do not have permission to confirm this campaign" });
      }
      
      if (!['SA', 'F'].includes(campaignData.investor_profile.toUpperCase())) {
        return res.status(400).json({ message: "Double confirmation only required for high-risk profiles" });
      }
      
      const { governanceService } = await import('./services/governanceService');
      const result = await governanceService.recordDoubleConfirmation(id, userId);
      
      if (!result.success) {
        return res.status(400).json({ message: "Failed to record confirmation" });
      }
      
      res.json({ success: true, hash: result.hash });
    } catch (error) {
      console.error("Error recording double confirmation:", error);
      res.status(500).json({ message: "Failed to record confirmation" });
    }
  });

  // Record legal acceptance for high-risk profiles - with strict validation
  const legalAcceptanceSchema = z.object({
    acceptanceVersion: z.string().min(1, "acceptanceVersion is required"),
    acknowledged: z.boolean().refine(val => val === true, "Must acknowledge terms")
  });
  
  app.post('/api/campaigns/:id/legal-acceptance', isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = legalAcceptanceSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const { acceptanceVersion } = parseResult.data;
      
      // Validate campaign exists, belongs to user, and requires legal acceptance
      const campaign = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
      if (campaign.length === 0) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      const campaignData = campaign[0];
      
      // SECURITY: Verify ownership - user must own this campaign
      if (campaignData.user_id !== userId) {
        return res.status(403).json({ message: "You do not have permission to accept terms for this campaign" });
      }
      
      if (!['SA', 'F'].includes(campaignData.investor_profile.toUpperCase())) {
        return res.status(400).json({ message: "Legal acceptance only required for high-risk profiles" });
      }
      
      const { governanceService } = await import('./services/governanceService');
      const result = await governanceService.recordLegalAcceptance(userId, id, acceptanceVersion);
      
      if (!result.success) {
        return res.status(400).json({ message: "Failed to record legal acceptance" });
      }
      
      res.json({ success: true, hash: result.hash });
    } catch (error) {
      console.error("Error recording legal acceptance:", error);
      res.status(500).json({ message: "Failed to record legal acceptance" });
    }
  });

  // Franchise Dashboard - aggregated data for franchise members
  app.get('/api/franchise-dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      // Check if user is a franchise member
      if (!permissions.franchiseId && !permissions.isFranchisor) {
        return res.status(404).json({ 
          message: "No franchise found",
          code: "NO_FRANCHISE"
        });
      }
      
      // Get the franchise
      const franchise = await franchisePermissionService.getUserFranchise(userId, userEmail);
      if (!franchise && !permissions.isFranchisor) {
        return res.status(404).json({ 
          message: "No franchise found",
          code: "NO_FRANCHISE"
        });
      }
      
      // For franchisors without a specific franchise, return summary
      if (permissions.isFranchisor && !franchise) {
        const allFranchises = await db.select().from(franchises);
        return res.json({
          isFranchisor: true,
          franchiseCount: allFranchises.length,
          activeCount: allFranchises.filter(f => f.status === 'active').length,
          message: "Access franchise admin for full management"
        });
      }
      
      // Get franchise plan
      const [plan] = await db
        .select()
        .from(franchise_plans)
        .where(eq(franchise_plans.id, franchise!.plan_id));
      
      // Get franchise users count
      const franchiseUsersData = await db
        .select()
        .from(franchise_users)
        .where(and(
          eq(franchise_users.franchise_id, franchise!.id),
          eq(franchise_users.is_active, true)
        ));
      
      // Get campaigns linked to this franchise
      const franchiseCampaigns = await db
        .select()
        .from(campaigns)
        .where(and(
          eq(campaigns.franchise_id, franchise!.id),
          eq(campaigns.is_deleted, false)
        ));
      
      const activeCampaigns = franchiseCampaigns.filter(c => c.status === 'running');
      const pausedCampaigns = franchiseCampaigns.filter(c => c.status === 'paused');
      const completedCampaigns = franchiseCampaigns.filter(c => c.status === 'completed' || c.status === 'stopped');
      
      // Calculate total PnL from campaigns
      let totalPnL = 0;
      let totalEquity = 0;
      for (const c of franchiseCampaigns) {
        if (c.current_equity && c.initial_capital) {
          const pnl = parseFloat(c.current_equity) - parseFloat(c.initial_capital);
          totalPnL += pnl;
          totalEquity += parseFloat(c.current_equity);
        }
      }
      
      // Get recent robot activity logs (last 20)
      const recentActivity = await db
        .select()
        .from(robot_activity_logs)
        .where(inArray(robot_activity_logs.campaign_id, franchiseCampaigns.map(c => c.id)))
        .orderBy(desc(robot_activity_logs.created_at))
        .limit(20);
      
      res.json({
        franchise: {
          id: franchise!.id,
          name: franchise!.name,
          status: franchise!.status,
          under_audit: franchise!.under_audit,
          country: franchise!.country,
          created_at: franchise!.created_at,
        },
        plan: plan ? {
          name: plan.name,
          max_campaigns: plan.max_campaigns,
          royalty_percentage: plan.royalty_percentage,
        } : null,
        role: permissions.franchiseRole,
        permissions: permissions.permissions,
        stats: {
          userCount: franchiseUsersData.length,
          totalCampaigns: franchiseCampaigns.length,
          activeCampaigns: activeCampaigns.length,
          pausedCampaigns: pausedCampaigns.length,
          completedCampaigns: completedCampaigns.length,
          totalEquity: totalEquity.toFixed(2),
          totalPnL: totalPnL.toFixed(2),
          pnlPercentage: totalEquity > 0 ? ((totalPnL / (totalEquity - totalPnL)) * 100).toFixed(2) : '0.00',
        },
        recentActivity: recentActivity.map(a => ({
          id: a.id,
          type: a.type,
          symbol: a.symbol,
          message: a.message,
          created_at: a.created_at,
        })),
        campaigns: franchiseCampaigns.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status,
          initial_capital: c.initial_capital,
          current_equity: c.current_equity,
          started_at: c.started_at,
        })).slice(0, 5), // Top 5 campaigns
      });
    } catch (error) {
      console.error("Error fetching franchise dashboard:", error);
      res.status(500).json({ message: "Failed to fetch franchise dashboard" });
    }
  });

  // Franchise Reports - Consolidated performance reports for all campaigns in a franchise
  app.get('/api/franchise-reports', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { campaignReportService } = await import('./services/campaignReportService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      // Check if user is a franchise member
      if (!permissions.franchiseId) {
        return res.status(404).json({ 
          message: "No franchise found",
          code: "NO_FRANCHISE"
        });
      }
      
      // Get the franchise
      const franchise = await franchisePermissionService.getUserFranchise(userId, userEmail);
      if (!franchise) {
        return res.status(404).json({ 
          message: "No franchise found",
          code: "NO_FRANCHISE"
        });
      }
      
      // Get all campaigns for this franchise
      const franchiseCampaigns = await db
        .select()
        .from(campaigns)
        .where(and(
          eq(campaigns.franchise_id, franchise.id),
          eq(campaigns.is_deleted, false)
        ));
      
      if (franchiseCampaigns.length === 0) {
        return res.json({
          franchise: {
            id: franchise.id,
            name: franchise.name,
          },
          operational: {
            activeCampaigns: 0,
            pausedCampaigns: 0,
            completedCampaigns: 0,
            totalOpenPositions: 0,
            totalTradesToday: 0,
            circuitBreakersActive: 0,
            campaigns: [],
          },
          report8h: {
            periodStart: new Date(Date.now() - 8 * 60 * 60 * 1000),
            periodEnd: new Date(),
            totalTrades: 0,
            wins: 0,
            losses: 0,
            netPnL: 0,
            netPnLPct: 0,
            topPerformers: [],
            worstPerformers: [],
            campaignBreakdown: [],
          },
          report24h: {
            periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
            periodEnd: new Date(),
            totalTrades: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            netPnL: 0,
            totalInitialEquity: 0,
            totalFinalEquity: 0,
            roi: 0,
            keyDecisions: [],
            summary: 'Nenhuma campanha ativa na franquia.',
            campaignBreakdown: [],
          },
          history: {
            periodStart: new Date(Date.now() - 72 * 60 * 60 * 1000),
            periodEnd: new Date(),
            trades: [],
            totalTrades: 0,
            accumulatedPnL: 0,
            totalVolume: 0,
          },
        });
      }
      
      // Fetch reports for all campaigns in parallel
      const campaignIds = franchiseCampaigns.map(c => c.id);
      
      const [robotStatuses, reports8h, reports24h, histories] = await Promise.all([
        Promise.all(campaignIds.map(id => campaignReportService.getRobotStatus(id))),
        Promise.all(campaignIds.map(id => campaignReportService.getReport8h(id))),
        Promise.all(campaignIds.map(id => campaignReportService.getReport24h(id))),
        Promise.all(campaignIds.map(id => campaignReportService.getHistory(id, 72))),
      ]);
      
      // Aggregate operational data
      let totalOpenPositions = 0;
      let totalTradesToday = 0;
      let circuitBreakersActive = 0;
      const operationalCampaigns = robotStatuses.filter(Boolean).map(status => {
        if (!status) return null;
        totalOpenPositions += status.openPositionsCount;
        totalTradesToday += status.todayTradesCount;
        if (status.circuitBreakers.campaign || status.circuitBreakers.dailyLoss || status.circuitBreakers.pair) {
          circuitBreakersActive++;
        }
        return {
          id: status.campaignId,
          name: status.campaignName,
          status: status.status,
          statusLabel: status.statusLabel,
          openPositions: status.openPositionsCount,
          tradesToday: status.todayTradesCount,
          circuitBreakers: status.circuitBreakers,
        };
      }).filter(Boolean);
      
      // Aggregate 8h report data
      const now = new Date();
      const period8hStart = new Date(now.getTime() - 8 * 60 * 60 * 1000);
      let total8hTrades = 0, total8hWins = 0, total8hLosses = 0, total8hPnL = 0;
      const pnlBySymbol8h: Record<string, number> = {};
      const campaign8hBreakdown: any[] = [];
      
      for (const report of reports8h) {
        if (!report) continue;
        total8hTrades += report.tradesCount;
        total8hWins += report.wins;
        total8hLosses += report.losses;
        total8hPnL += report.netPnL;
        
        for (const p of report.topPerformers) {
          pnlBySymbol8h[p.symbol] = (pnlBySymbol8h[p.symbol] || 0) + p.pnl;
        }
        for (const p of report.worstPerformers) {
          pnlBySymbol8h[p.symbol] = (pnlBySymbol8h[p.symbol] || 0) + p.pnl;
        }
        
        campaign8hBreakdown.push({
          campaignId: report.campaignId,
          campaignName: report.campaignName,
          trades: report.tradesCount,
          pnl: report.netPnL,
        });
      }
      
      const sorted8hSymbols = Object.entries(pnlBySymbol8h).sort((a, b) => b[1] - a[1]);
      const top8hPerformers = sorted8hSymbols.filter(([, pnl]) => pnl > 0).slice(0, 5).map(([symbol, pnl]) => ({ symbol, pnl }));
      const worst8hPerformers = sorted8hSymbols.filter(([, pnl]) => pnl < 0).slice(-5).map(([symbol, pnl]) => ({ symbol, pnl }));
      
      const totalInitialEquity = franchiseCampaigns.reduce((sum, c) => sum + parseFloat(c.initial_capital || '0'), 0);
      const total8hPnLPct = totalInitialEquity > 0 ? (total8hPnL / totalInitialEquity) * 100 : 0;
      
      // Aggregate 24h report data
      const period24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      let total24hTrades = 0, total24hWins = 0, total24hLosses = 0, total24hPnL = 0;
      let totalFinalEquity = 0;
      const allKeyDecisions: any[] = [];
      const campaign24hBreakdown: any[] = [];
      
      for (const report of reports24h) {
        if (!report) continue;
        total24hTrades += report.tradesCount;
        total24hWins += report.wins;
        total24hLosses += report.losses;
        total24hPnL += report.netPnL;
        totalFinalEquity += report.finalEquity;
        
        for (const decision of report.keyDecisions) {
          allKeyDecisions.push({
            ...decision,
            campaignName: report.campaignName,
          });
        }
        
        campaign24hBreakdown.push({
          campaignId: report.campaignId,
          campaignName: report.campaignName,
          trades: report.tradesCount,
          pnl: report.netPnL,
          winRate: report.winRate,
          roi: report.roi,
        });
      }
      
      const winRate24h = total24hTrades > 0 ? (total24hWins / total24hTrades) * 100 : 0;
      const roi24h = totalInitialEquity > 0 ? ((totalFinalEquity - totalInitialEquity) / totalInitialEquity) * 100 : 0;
      
      // Sort key decisions by time and take top 10
      allKeyDecisions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      const topKeyDecisions = allKeyDecisions.slice(0, 10);
      
      // Generate summary
      let summary24h = '';
      if (total24hTrades === 0) {
        summary24h = 'Nenhuma operação realizada nas últimas 24 horas em todas as campanhas da franquia.';
      } else if (total24hPnL > 0) {
        summary24h = `Dia positivo para a franquia com lucro total de $${total24hPnL.toFixed(2)} (${roi24h.toFixed(2)}% ROI). Taxa de acerto: ${winRate24h.toFixed(1)}%.`;
      } else {
        summary24h = `Dia com prejuízo de $${Math.abs(total24hPnL).toFixed(2)}. Taxa de acerto: ${winRate24h.toFixed(1)}%. Sistema de proteção ativo.`;
      }
      
      // Aggregate trade history
      const periodHistoryStart = new Date(now.getTime() - 72 * 60 * 60 * 1000);
      const allTrades: any[] = [];
      let totalAccumulatedPnL = 0;
      let totalVolume = 0;
      
      for (const history of histories) {
        if (!history) continue;
        totalAccumulatedPnL += history.accumulatedPnL;
        totalVolume += history.totalVolume;
        
        for (const trade of history.trades) {
          allTrades.push({
            ...trade,
            campaignName: history.campaignName,
          });
        }
      }
      
      // Sort trades by timestamp
      allTrades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      res.json({
        franchise: {
          id: franchise.id,
          name: franchise.name,
        },
        operational: {
          activeCampaigns: franchiseCampaigns.filter(c => c.status === 'running').length,
          pausedCampaigns: franchiseCampaigns.filter(c => c.status === 'paused').length,
          completedCampaigns: franchiseCampaigns.filter(c => c.status === 'completed' || c.status === 'stopped').length,
          totalOpenPositions,
          totalTradesToday,
          circuitBreakersActive,
          campaigns: operationalCampaigns,
        },
        report8h: {
          periodStart: period8hStart,
          periodEnd: now,
          totalTrades: total8hTrades,
          wins: total8hWins,
          losses: total8hLosses,
          netPnL: total8hPnL,
          netPnLPct: total8hPnLPct,
          topPerformers: top8hPerformers,
          worstPerformers: worst8hPerformers,
          campaignBreakdown: campaign8hBreakdown,
        },
        report24h: {
          periodStart: period24hStart,
          periodEnd: now,
          totalTrades: total24hTrades,
          wins: total24hWins,
          losses: total24hLosses,
          winRate: winRate24h,
          netPnL: total24hPnL,
          totalInitialEquity,
          totalFinalEquity,
          roi: roi24h,
          keyDecisions: topKeyDecisions,
          summary: summary24h,
          campaignBreakdown: campaign24hBreakdown,
        },
        history: {
          periodStart: periodHistoryStart,
          periodEnd: now,
          trades: allTrades.slice(0, 100), // Limit to 100 most recent trades
          totalTrades: allTrades.length,
          accumulatedPnL: totalAccumulatedPnL,
          totalVolume,
        },
      });
    } catch (error) {
      console.error("Error fetching franchise reports:", error);
      res.status(500).json({ message: "Failed to fetch franchise reports" });
    }
  });

  // ========== ROYALTY ENDPOINTS ==========

  // Admin: Calculate royalties for a specific franchise
  app.post('/api/admin/franchises/:id/royalties/calculate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const franchiseId = req.params.id;
      const { year, month } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseRoyaltyService } = await import('./services/franchiseRoyaltyService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.permissions.canManageRoyalties) {
        return res.status(403).json({ message: "Not authorized to manage royalties" });
      }
      
      const targetYear = year || new Date().getFullYear();
      const targetMonth = month || new Date().getMonth() + 1;
      
      const calculation = await franchiseRoyaltyService.calculateMonthlyRoyalties(franchiseId, targetYear, targetMonth);
      if (!calculation) {
        return res.status(404).json({ message: "No data to calculate royalties" });
      }
      
      const saved = await franchiseRoyaltyService.saveRoyaltyCalculation(calculation);
      res.json({ calculation, saved });
    } catch (error) {
      console.error("Error calculating royalties:", error);
      res.status(500).json({ message: "Failed to calculate royalties" });
    }
  });

  // Admin: Get royalties for a franchise
  app.get('/api/admin/franchises/:id/royalties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const franchiseId = req.params.id;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseRoyaltyService } = await import('./services/franchiseRoyaltyService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.permissions.canViewRoyalties && !permissions.isFranchisor) {
        return res.status(403).json({ message: "Not authorized to view royalties" });
      }
      
      const summary = await franchiseRoyaltyService.getRoyaltySummary(franchiseId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching royalties:", error);
      res.status(500).json({ message: "Failed to fetch royalties" });
    }
  });

  // Admin: Calculate royalties for all franchises
  app.post('/api/admin/royalties/calculate-all', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { year, month } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseRoyaltyService } = await import('./services/franchiseRoyaltyService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can calculate all royalties" });
      }
      
      const targetYear = year || new Date().getFullYear();
      const targetMonth = month || new Date().getMonth() + 1;
      
      const result = await franchiseRoyaltyService.calculateAllFranchisesRoyalties(targetYear, targetMonth);
      res.json(result);
    } catch (error) {
      console.error("Error calculating all royalties:", error);
      res.status(500).json({ message: "Failed to calculate royalties" });
    }
  });

  // Admin: Update royalty status
  app.patch('/api/admin/royalties/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const royaltyId = req.params.id;
      const { status, payment_method, payment_reference, invoice_url } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseRoyaltyService } = await import('./services/franchiseRoyaltyService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.permissions.canManageRoyalties) {
        return res.status(403).json({ message: "Not authorized to manage royalties" });
      }
      
      const validStatuses = ['pending', 'invoiced', 'paid', 'disputed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const updated = await franchiseRoyaltyService.updateRoyaltyStatus(royaltyId, status, {
        payment_method,
        payment_reference,
        invoice_url,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Royalty not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating royalty status:", error);
      res.status(500).json({ message: "Failed to update royalty status" });
    }
  });

  // Franchise member: View their royalties
  app.get('/api/franchise/royalties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseRoyaltyService } = await import('./services/franchiseRoyaltyService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.franchiseId) {
        return res.status(404).json({ message: "No franchise found", code: "NO_FRANCHISE" });
      }
      
      if (!permissions.permissions.canViewRoyalties) {
        return res.status(403).json({ message: "Not authorized to view royalties" });
      }
      
      const summary = await franchiseRoyaltyService.getRoyaltySummary(permissions.franchiseId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching franchise royalties:", error);
      res.status(500).json({ message: "Failed to fetch royalties" });
    }
  });

  // Franchisor: Get ALL royalties across all franchises (for financial panel)
  app.get('/api/franchise-royalties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can view all royalties" });
      }
      
      // Get all franchises (active and suspended, exclude terminated)
      const allFranchises = await db.select().from(franchises).where(
        sql`${franchises.status} != 'terminated'`
      );
      
      const { franchiseRoyaltyService } = await import('./services/franchiseRoyaltyService');
      
      let totalPaid = 0;
      let totalPending = 0;
      let totalDisputed = 0;
      const allRoyalties: any[] = [];
      
      for (const franchise of allFranchises) {
        const summary = await franchiseRoyaltyService.getRoyaltySummary(franchise.id);
        totalPaid += summary.totalPaid;
        totalPending += summary.totalPending;
        totalDisputed += summary.totalDisputed;
        
        for (const royalty of summary.royalties) {
          allRoyalties.push({
            ...royalty,
            franchise_name: franchise.name,
            franchise_id: franchise.id,
          });
        }
      }
      
      // Sort by period (newest first)
      allRoyalties.sort((a, b) => {
        if (a.period_year !== b.period_year) return b.period_year - a.period_year;
        return b.period_month - a.period_month;
      });
      
      res.json({
        summary: { totalPaid, totalPending, totalDisputed },
        royalties: allRoyalties,
      });
    } catch (error) {
      console.error("Error fetching all franchise royalties:", error);
      res.status(500).json({ message: "Failed to fetch royalties" });
    }
  });

  // Admin: Get ALL royalties across all franchises
  app.get('/api/admin/royalties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can view all royalties" });
      }
      
      // Get all franchises (active and suspended, exclude terminated)
      const allFranchises = await db.select().from(franchises).where(
        sql`${franchises.status} != 'terminated'`
      );
      
      const { franchiseRoyaltyService } = await import('./services/franchiseRoyaltyService');
      
      let totalPaid = 0;
      let totalPending = 0;
      let totalDisputed = 0;
      const allRoyalties: any[] = [];
      
      for (const franchise of allFranchises) {
        const summary = await franchiseRoyaltyService.getRoyaltySummary(franchise.id);
        totalPaid += summary.totalPaid;
        totalPending += summary.totalPending;
        totalDisputed += summary.totalDisputed;
        
        for (const royalty of summary.royalties) {
          allRoyalties.push({
            ...royalty,
            franchise_name: franchise.name,
          });
        }
      }
      
      // Sort by period (newest first)
      allRoyalties.sort((a, b) => {
        if (a.period_year !== b.period_year) return b.period_year - a.period_year;
        return b.period_month - a.period_month;
      });
      
      res.json({
        summary: { totalPaid, totalPending, totalDisputed },
        royalties: allRoyalties,
      });
    } catch (error) {
      console.error("Error fetching all royalties:", error);
      res.status(500).json({ message: "Failed to fetch royalties" });
    }
  });

  // ========== FRANCHISE FEES ENDPOINTS ==========

  // Franchisor: Get all fees
  app.get('/api/franchise-fees', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { status, fee_type } = req.query;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseFeeService } = await import('./services/franchiseFeeService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can view all fees" });
      }
      
      const fees = await franchiseFeeService.getAllFees({ 
        status: status as string,
        fee_type: fee_type as string 
      });
      const summary = await franchiseFeeService.getFeeSummary();
      
      res.json({ fees, summary });
    } catch (error) {
      console.error("Error fetching fees:", error);
      res.status(500).json({ message: "Failed to fetch fees" });
    }
  });

  // Franchisor: Update fee status
  app.patch('/api/franchise-fees/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const feeId = req.params.id;
      const { status, payment_method, payment_reference } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseFeeService } = await import('./services/franchiseFeeService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can update fees" });
      }
      
      const updated = await franchiseFeeService.updateFeeStatus(feeId, status, {
        payment_method,
        payment_reference,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Fee not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating fee:", error);
      res.status(500).json({ message: "Failed to update fee" });
    }
  });

  // ========== FRANCHISE INVOICES ENDPOINTS ==========

  // Franchisor: Get all invoices
  app.get('/api/franchise-invoices', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { status } = req.query;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseInvoiceService } = await import('./services/franchiseInvoiceService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can view all invoices" });
      }
      
      const invoices = await franchiseInvoiceService.getAllInvoices({ 
        status: status as string
      });
      const summary = await franchiseInvoiceService.getInvoiceSummary();
      
      res.json({ invoices, summary });
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Franchisor: Generate invoice from royalties
  app.post('/api/franchise-invoices/generate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { franchise_id, royalty_ids } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseInvoiceService } = await import('./services/franchiseInvoiceService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can generate invoices" });
      }
      
      if (!franchise_id || !royalty_ids || !Array.isArray(royalty_ids) || royalty_ids.length === 0) {
        return res.status(400).json({ message: "franchise_id and royalty_ids are required" });
      }
      
      const invoice = await franchiseInvoiceService.generateRoyaltyInvoice(franchise_id, royalty_ids);
      res.json(invoice);
    } catch (error) {
      console.error("Error generating invoice:", error);
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // Franchisor: Update invoice status
  app.patch('/api/franchise-invoices/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const invoiceId = req.params.id;
      const { status, payment_method, payment_reference } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseInvoiceService } = await import('./services/franchiseInvoiceService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can update invoices" });
      }
      
      const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const updated = await franchiseInvoiceService.updateInvoiceStatus(invoiceId, status, {
        payment_method,
        payment_reference,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  // Franchisor: Get invoice by ID
  app.get('/api/franchise-invoices/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const invoiceId = req.params.id;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseInvoiceService } = await import('./services/franchiseInvoiceService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can view invoices" });
      }
      
      const invoice = await franchiseInvoiceService.getInvoiceById(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      res.json(invoice);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  // ========== FRANCHISE REPORTS ENDPOINTS ==========

  // Get revenue by period report
  app.get('/api/franchise-reports/revenue-by-period', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const format = req.query.format as string || 'json';
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseReportService } = await import('./services/franchiseReportService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can access reports" });
      }
      
      const data = await franchiseReportService.getRevenueByPeriod();
      
      if (format === 'csv') {
        const csv = franchiseReportService.convertToCSV(data, 'revenue-by-period');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=revenue-by-period.csv');
        return res.send(csv);
      }
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  // Get revenue by plan report
  app.get('/api/franchise-reports/revenue-by-plan', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const format = req.query.format as string || 'json';
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseReportService } = await import('./services/franchiseReportService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can access reports" });
      }
      
      const data = await franchiseReportService.getRevenueByPlan();
      
      if (format === 'csv') {
        const csv = franchiseReportService.convertToCSV(data, 'revenue-by-plan');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=revenue-by-plan.csv');
        return res.send(csv);
      }
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  // Get revenue by franchise report
  app.get('/api/franchise-reports/revenue-by-franchise', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const format = req.query.format as string || 'json';
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseReportService } = await import('./services/franchiseReportService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can access reports" });
      }
      
      const data = await franchiseReportService.getRevenueByFranchise();
      
      if (format === 'csv') {
        const csv = franchiseReportService.convertToCSV(data, 'revenue-by-franchise');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=revenue-by-franchise.csv');
        return res.send(csv);
      }
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  // Get royalties by campaign report
  app.get('/api/franchise-reports/royalties-by-campaign', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const format = req.query.format as string || 'json';
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseReportService } = await import('./services/franchiseReportService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can access reports" });
      }
      
      const data = await franchiseReportService.getRoyaltiesByCampaign();
      
      if (format === 'csv') {
        const csv = franchiseReportService.convertToCSV(data, 'royalties-by-campaign');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=royalties-by-campaign.csv');
        return res.send(csv);
      }
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  // Get delinquency report
  app.get('/api/franchise-reports/delinquency', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const format = req.query.format as string || 'json';
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseReportService } = await import('./services/franchiseReportService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can access reports" });
      }
      
      const data = await franchiseReportService.getDelinquencyReport();
      
      if (format === 'csv') {
        const csv = franchiseReportService.convertToCSV(data, 'delinquency');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=delinquency-report.csv');
        return res.send(csv);
      }
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  // ========== FRANCHISE ONBOARDING ENDPOINTS ==========

  // Get available franchise plans for onboarding
  app.get('/api/franchise-onboarding/plans', isAuthenticated, async (req: any, res) => {
    try {
      const { franchiseOnboardingService } = await import('./services/franchiseOnboardingService');
      const plans = await franchiseOnboardingService.getAvailablePlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // Start franchise onboarding process
  app.post('/api/franchise-onboarding/start', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { planId, name, cnpj, tax_id, tax_id_type, address, country } = req.body;
      
      if (!planId || !name) {
        return res.status(400).json({ message: "Plan and franchise name are required" });
      }
      
      const { franchiseOnboardingService } = await import('./services/franchiseOnboardingService');
      const result = await franchiseOnboardingService.startOnboarding(userId, planId, {
        name,
        cnpj,
        tax_id,
        tax_id_type,
        address,
        country,
      });
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ franchiseId: result.franchiseId });
    } catch (error) {
      console.error("Error starting onboarding:", error);
      res.status(500).json({ message: "Failed to start onboarding" });
    }
  });

  // Get onboarding state for a franchise
  app.get('/api/franchise-onboarding/:franchiseId/state', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { franchiseId } = req.params;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseOnboardingService } = await import('./services/franchiseOnboardingService');
      
      const permissions = await franchisePermissionService.getUserFranchiseRole(userId, franchiseId);
      if (!permissions && !req.user.claims.email?.match(/(alltrendsfy|itopaiva01)@gmail\.com/)) {
        return res.status(403).json({ message: "Not authorized to view this franchise" });
      }
      
      const state = await franchiseOnboardingService.getOnboardingState(franchiseId);
      if (!state) {
        return res.status(404).json({ message: "Franchise not found" });
      }
      
      res.json(state);
    } catch (error) {
      console.error("Error fetching onboarding state:", error);
      res.status(500).json({ message: "Failed to fetch onboarding state" });
    }
  });

  // Accept franchise contract
  app.post('/api/franchise-onboarding/:franchiseId/accept-contract', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { franchiseId } = req.params;
      const { contractVersion } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseOnboardingService } = await import('./services/franchiseOnboardingService');
      
      const permissions = await franchisePermissionService.getUserFranchiseRole(userId, franchiseId);
      if (permissions?.role !== 'master') {
        return res.status(403).json({ message: "Only franchise owner can accept contract" });
      }
      
      const result = await franchiseOnboardingService.acceptContract(franchiseId, userId, contractVersion || '1.0');
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error accepting contract:", error);
      res.status(500).json({ message: "Failed to accept contract" });
    }
  });

  // Confirm payment (admin only or payment gateway callback)
  app.post('/api/franchise-onboarding/:franchiseId/confirm-payment', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { franchiseId } = req.params;
      const { payment_method, payment_reference, payment_gateway_id } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseOnboardingService } = await import('./services/franchiseOnboardingService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can confirm payments" });
      }
      
      const result = await franchiseOnboardingService.confirmPayment(franchiseId, {
        payment_method,
        payment_reference,
        payment_gateway_id,
      }, userId);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error confirming payment:", error);
      res.status(500).json({ message: "Failed to confirm payment" });
    }
  });

  // Approve franchise (franchisor only)
  app.post('/api/franchise-onboarding/:franchiseId/approve', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { franchiseId } = req.params;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseOnboardingService } = await import('./services/franchiseOnboardingService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can approve franchises" });
      }
      
      const result = await franchiseOnboardingService.approveFranchise(franchiseId, userId);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error approving franchise:", error);
      res.status(500).json({ message: "Failed to approve franchise" });
    }
  });

  // Reject franchise (franchisor only)
  app.post('/api/franchise-onboarding/:franchiseId/reject', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { franchiseId } = req.params;
      const { reason } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseOnboardingService } = await import('./services/franchiseOnboardingService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can reject franchises" });
      }
      
      const result = await franchiseOnboardingService.rejectFranchise(franchiseId, userId, reason || 'Rejected');
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error rejecting franchise:", error);
      res.status(500).json({ message: "Failed to reject franchise" });
    }
  });

  // Get pending onboarding requests (franchisor only)
  app.get('/api/franchise-onboarding/pending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const { franchiseOnboardingService } = await import('./services/franchiseOnboardingService');
      
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Only franchisor can view pending onboardings" });
      }
      
      const pending = await franchiseOnboardingService.getPendingOnboardings();
      res.json(pending);
    } catch (error) {
      console.error("Error fetching pending onboardings:", error);
      res.status(500).json({ message: "Failed to fetch pending onboardings" });
    }
  });

  // ========== FRANCHISE ANALYTICS ENDPOINTS (Admin Only) ==========

  // Admin: Get consolidated performance overview
  app.get('/api/admin/franchise-analytics/overview', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { franchiseAnalyticsService } = await import('./services/franchiseAnalyticsService');
      const overview = await franchiseAnalyticsService.getConsolidatedPerformance();
      res.json(overview);
    } catch (error) {
      console.error("Error fetching franchise analytics overview:", error);
      res.status(500).json({ message: "Failed to fetch analytics overview" });
    }
  });

  // Admin: Get franchise rankings
  app.get('/api/admin/franchise-analytics/rankings', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { franchiseAnalyticsService } = await import('./services/franchiseAnalyticsService');
      const orderBy = (req.query.orderBy as 'pnl' | 'win_rate' | 'roi' | 'trades') || 'pnl';
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const rankings = await franchiseAnalyticsService.getFranchiseRankings(orderBy, limit);
      res.json(rankings);
    } catch (error) {
      console.error("Error fetching franchise rankings:", error);
      res.status(500).json({ message: "Failed to fetch franchise rankings" });
    }
  });

  // Admin: Get symbol performance analysis
  app.get('/api/admin/franchise-analytics/symbols', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { franchiseAnalyticsService } = await import('./services/franchiseAnalyticsService');
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const symbols = await franchiseAnalyticsService.getSymbolPerformance(limit);
      res.json(symbols);
    } catch (error) {
      console.error("Error fetching symbol performance:", error);
      res.status(500).json({ message: "Failed to fetch symbol performance" });
    }
  });

  // Admin: Get cluster performance analysis
  app.get('/api/admin/franchise-analytics/clusters', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { franchiseAnalyticsService } = await import('./services/franchiseAnalyticsService');
      const clusters = await franchiseAnalyticsService.getClusterPerformance();
      res.json(clusters);
    } catch (error) {
      console.error("Error fetching cluster performance:", error);
      res.status(500).json({ message: "Failed to fetch cluster performance" });
    }
  });

  // Admin: Get trading patterns (hourly and daily)
  app.get('/api/admin/franchise-analytics/patterns', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { franchiseAnalyticsService } = await import('./services/franchiseAnalyticsService');
      const patterns = await franchiseAnalyticsService.getTradingPatterns();
      res.json(patterns);
    } catch (error) {
      console.error("Error fetching trading patterns:", error);
      res.status(500).json({ message: "Failed to fetch trading patterns" });
    }
  });

  // Admin: Get strategic insights and recommendations
  app.get('/api/admin/franchise-analytics/insights', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { franchiseAnalyticsService } = await import('./services/franchiseAnalyticsService');
      const insights = await franchiseAnalyticsService.getStrategicInsights();
      res.json(insights);
    } catch (error) {
      console.error("Error fetching strategic insights:", error);
      res.status(500).json({ message: "Failed to fetch strategic insights" });
    }
  });

  // ========== ANTI-FRAUD ENDPOINTS ==========
  
  // Admin: Get fraud alerts with filters
  app.get('/api/admin/fraud-alerts', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { antiFraudService } = await import('./services/antiFraudService');
      
      const filters = {
        franchiseId: req.query.franchiseId as string | undefined,
        campaignId: req.query.campaignId as string | undefined,
        status: req.query.status as string | undefined,
        severity: req.query.severity as string | undefined,
        type: req.query.type as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      
      const result = await antiFraudService.getAlerts(filters as any);
      res.json(result);
    } catch (error) {
      console.error("Error fetching fraud alerts:", error);
      res.status(500).json({ message: "Failed to fetch fraud alerts" });
    }
  });
  
  // Admin: Get fraud alert stats
  app.get('/api/admin/fraud-alerts/stats', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { antiFraudService } = await import('./services/antiFraudService');
      const franchiseId = req.query.franchiseId as string | undefined;
      
      const stats = await antiFraudService.getStats(franchiseId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching fraud stats:", error);
      res.status(500).json({ message: "Failed to fetch fraud stats" });
    }
  });
  
  // Admin: Get single fraud alert
  app.get('/api/admin/fraud-alerts/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { antiFraudService } = await import('./services/antiFraudService');
      const alert = await antiFraudService.getAlertById(req.params.id);
      
      if (!alert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      
      res.json(alert);
    } catch (error) {
      console.error("Error fetching fraud alert:", error);
      res.status(500).json({ message: "Failed to fetch fraud alert" });
    }
  });
  
  // Admin: Update fraud alert status
  const updateFraudAlertSchema = z.object({
    status: z.enum(['new', 'investigating', 'dismissed', 'confirmed']),
    resolution_notes: z.string().max(2000).optional(),
  });
  
  app.patch('/api/admin/fraud-alerts/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const parseResult = updateFraudAlertSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const { antiFraudService } = await import('./services/antiFraudService');
      const userId = req.user.claims.sub;
      const { status, resolution_notes } = parseResult.data;
      
      const updated = await antiFraudService.updateAlertStatus(
        req.params.id,
        status,
        userId,
        resolution_notes
      );
      
      if (!updated) {
        return res.status(404).json({ message: "Alert not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating fraud alert:", error);
      res.status(500).json({ message: "Failed to update fraud alert" });
    }
  });
  
  // Admin: Run fraud detection scan
  app.post('/api/admin/fraud-alerts/scan', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { antiFraudService } = await import('./services/antiFraudService');
      
      const result = await antiFraudService.runFullScan();
      res.json({
        message: "Fraud scan completed",
        ...result
      });
    } catch (error) {
      console.error("Error running fraud scan:", error);
      res.status(500).json({ message: "Failed to run fraud scan" });
    }
  });
  
  // Admin: Analyze specific campaign for fraud
  app.post('/api/admin/fraud-alerts/analyze/:campaignId', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { antiFraudService } = await import('./services/antiFraudService');
      const daysBack = req.body.daysBack || 7;
      
      const results = await antiFraudService.analyzeCampaign(req.params.campaignId, daysBack);
      
      // Create alerts for detected issues
      const campaignWithPortfolio = await db.select({
        campaign: campaigns,
        portfolio: portfolios
      })
        .from(campaigns)
        .innerJoin(portfolios, eq(campaigns.portfolio_id, portfolios.id))
        .where(eq(campaigns.id, req.params.campaignId))
        .limit(1);
      
      const createdAlerts = [];
      for (const result of results) {
        const alert = await antiFraudService.createAlert(result, {
          campaignId: req.params.campaignId,
          franchiseId: campaignWithPortfolio[0]?.campaign.franchise_id || undefined,
          userId: campaignWithPortfolio[0]?.portfolio.user_id,
        });
        createdAlerts.push(alert);
      }
      
      res.json({
        detected: results.length,
        alerts: createdAlerts
      });
    } catch (error) {
      console.error("Error analyzing campaign for fraud:", error);
      res.status(500).json({ message: "Failed to analyze campaign" });
    }
  });

  // =============================================================================
  // OPPORTUNITY BLUEPRINTS & TRIGGERS ROUTES
  // =============================================================================
  
  // Schemas for opportunity blueprints
  const consumeBlueprintSchema = z.object({
    portfolioId: z.string().uuid("Invalid portfolio ID"),
    allocatedCapital: z.number().positive("Capital must be positive"),
  });
  
  const createTriggerSchema = z.object({
    triggerType: z.enum(['alert', 'expiration', 'accept', 'creation', 'block', 'audit']),
    name: z.string().min(1, "Name is required").max(100),
    description: z.string().max(500).optional(),
    conditions: z.object({
      score_min: z.number().min(0).max(100).optional(),
      confidence_min: z.number().min(0).max(1).optional(),
      regimes: z.array(z.string()).optional(),
      types: z.array(z.string()).optional(),
      assets_include: z.array(z.string()).optional(),
      assets_exclude: z.array(z.string()).optional(),
    }),
    actions: z.object({
      notify_whatsapp: z.boolean().optional(),
      notify_email: z.boolean().optional(),
      auto_accept: z.boolean().optional(),
      log_to_audit: z.boolean().optional(),
      custom_webhook_url: z.string().url().optional(),
    }),
    cooldownMinutes: z.number().int().positive().optional(),
    maxTriggersPerDay: z.number().int().positive().optional(),
  });
  
  const updateTriggerSchema = createTriggerSchema.partial().extend({
    is_active: z.boolean().optional(),
  });
  
  // GET /api/opportunity-blueprints - List active blueprints
  // Supports optional franchise_id query param for franchise filtering
  app.get('/api/opportunity-blueprints', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const franchiseId = req.query.franchise_id as string | undefined;
      const { getActiveBlueprints, getUserBlueprintStats } = await import('./services/opportunityBlueprintService');
      
      const [blueprints, stats] = await Promise.all([
        getActiveBlueprints(userId, franchiseId),
        getUserBlueprintStats(userId, franchiseId)
      ]);
      
      res.json({ blueprints, stats });
    } catch (error) {
      console.error("Error fetching blueprints:", error);
      res.status(500).json({ message: "Failed to fetch blueprints" });
    }
  });
  
  // GET /api/opportunity-blueprints/history - Get blueprint history
  // Supports optional franchise_id query param for franchise filtering
  app.get('/api/opportunity-blueprints/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const franchiseId = req.query.franchise_id as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      
      const { getBlueprintHistory } = await import('./services/opportunityBlueprintService');
      const history = await getBlueprintHistory(userId, limit, offset, franchiseId);
      
      res.json({ history, limit, offset });
    } catch (error) {
      console.error("Error fetching blueprint history:", error);
      res.status(500).json({ message: "Failed to fetch blueprint history" });
    }
  });
  
  // GET /api/opportunity-blueprints/:id - Get single blueprint
  app.get('/api/opportunity-blueprints/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { getBlueprintById, validateBlueprintIntegrity } = await import('./services/opportunityBlueprintService');
      
      const blueprint = await getBlueprintById(req.params.id, userId);
      if (!blueprint) {
        return res.status(404).json({ message: "Blueprint not found" });
      }
      
      const isValid = await validateBlueprintIntegrity(blueprint.id);
      
      res.json({ blueprint, integrityValid: isValid });
    } catch (error) {
      console.error("Error fetching blueprint:", error);
      res.status(500).json({ message: "Failed to fetch blueprint" });
    }
  });
  
  // POST /api/opportunity-blueprints/:id/consume - Accept/consume a blueprint
  app.post('/api/opportunity-blueprints/:id/consume', isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = consumeBlueprintSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const userId = req.user.claims.sub;
      const { portfolioId, allocatedCapital } = parseResult.data;
      
      const { consumeBlueprint } = await import('./services/opportunityBlueprintService');
      const result = await consumeBlueprint(req.params.id, userId, portfolioId, allocatedCapital);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ 
        message: "Blueprint consumed successfully", 
        campaignId: result.campaignId 
      });
    } catch (error) {
      console.error("Error consuming blueprint:", error);
      res.status(500).json({ message: "Failed to consume blueprint" });
    }
  });
  
  // POST /api/opportunity-blueprints/:id/reject - Reject a blueprint
  app.post('/api/opportunity-blueprints/:id/reject', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const blueprintId = req.params.id;
      
      const { rejectBlueprint } = await import('./services/opportunityBlueprintService');
      const result = await rejectBlueprint(blueprintId, userId);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ message: "Blueprint rejected successfully" });
    } catch (error) {
      console.error("Error rejecting blueprint:", error);
      res.status(500).json({ message: "Failed to reject blueprint" });
    }
  });

  // Schema for generating blueprint from OE window
  const generateFromWindowSchema = z.object({
    window_id: z.string().min(1, "window_id is required"),
    franchise_id: z.string().uuid().optional(),
  });

  // POST /api/opportunity-blueprints/from-window - Generate blueprint from OpportunityEngine window
  app.post('/api/opportunity-blueprints/from-window', isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = generateFromWindowSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const userId = req.user.claims.sub;
      const { window_id, franchise_id } = parseResult.data;
      
      const { generateBlueprintFromOpportunityWindow } = await import('./services/opportunityBlueprintService');
      const result = await generateBlueprintFromOpportunityWindow(userId, window_id, franchise_id);
      
      if (!result.success) {
        const statusCode = result.rateLimited ? 429 : 400;
        return res.status(statusCode).json({ message: result.error });
      }
      
      res.json({ 
        message: "Blueprint created from opportunity window",
        blueprint: result.blueprint 
      });
    } catch (error) {
      console.error("Error generating blueprint from window:", error);
      res.status(500).json({ message: "Failed to generate blueprint" });
    }
  });
  
  // GET /api/opportunity-windows - Get persisted opportunity windows (with rate-limited detection)
  app.get('/api/opportunity-windows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { detectAndPersistOpportunityWindows, checkDetectionRateLimit } = await import('./services/opportunityBlueprintService');
      
      if (!(await checkDetectionRateLimit(userId))) {
        return res.status(429).json({ message: "Rate limit exceeded for window detection. Try again later." });
      }
      
      const windows = await detectAndPersistOpportunityWindows();
      res.json({ windows });
    } catch (error) {
      console.error("Error detecting opportunity windows:", error);
      res.status(500).json({ message: "Failed to detect windows" });
    }
  });
  
  // POST /api/opportunity-blueprints/detect - Manually trigger detection (admin/testing)
  app.post('/api/opportunity-blueprints/detect', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's market data context
      const userPortfolios = await storage.getPortfoliosByUserId(userId);
      if (userPortfolios.length === 0) {
        return res.status(400).json({ message: "No portfolios found" });
      }
      
      // Build market data from Redis/storage
      const { dataIngestionService } = await import('./services/dataIngestionService');
      const allSymbols = await storage.getAllSymbols();
      
      const marketData = [];
      for (const sym of allSymbols.slice(0, 30)) {
        const ticks = await dataIngestionService.getRecentTicks(sym.exchange_id, sym.exchange_symbol, 1);
        if (ticks.length > 0) {
          const price = parseFloat(ticks[0].price);
          marketData.push({
            symbol: sym.symbol,
            price,
            volume24h: parseFloat(sym.volume_24h || '0'),
            change24h: 0,
            volatility: 0.05,
            high24h: price * 1.02,
            low24h: price * 0.98,
          });
        }
      }
      
      // Get campaign history
      const allCampaigns = await db.select()
        .from(campaigns)
        .where(inArray(campaigns.portfolio_id, userPortfolios.map(p => p.id)))
        .limit(20);
      
      const campaignHistory = allCampaigns.map(c => ({
        id: c.id,
        name: c.name,
        roi: parseFloat(c.accumulated_roi || '0'),
        winRate: 0,
        totalTrades: c.total_trades || 0,
      }));
      
      const { detectOpportunity } = await import('./services/opportunityBlueprintService');
      const result = await detectOpportunity({
        userId,
        marketData,
        campaignHistory,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error detecting opportunities:", error);
      res.status(500).json({ message: "Failed to detect opportunities" });
    }
  });
  
  // =============================================================================
  // OPPORTUNITY TRIGGERS ROUTES
  // =============================================================================
  
  // GET /api/opportunity-triggers - List user's triggers
  app.get('/api/opportunity-triggers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { getUserTriggers, getTriggerStats } = await import('./services/opportunityTriggerService');
      
      const [triggers, stats] = await Promise.all([
        getUserTriggers(userId),
        getTriggerStats(userId)
      ]);
      
      res.json({ triggers, stats });
    } catch (error) {
      console.error("Error fetching triggers:", error);
      res.status(500).json({ message: "Failed to fetch triggers" });
    }
  });
  
  // POST /api/opportunity-triggers - Create new trigger
  app.post('/api/opportunity-triggers', isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = createTriggerSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const userId = req.user.claims.sub;
      const { createTrigger } = await import('./services/opportunityTriggerService');
      
      const trigger = await createTrigger({
        userId,
        ...parseResult.data,
      });
      
      res.status(201).json(trigger);
    } catch (error) {
      console.error("Error creating trigger:", error);
      res.status(500).json({ message: "Failed to create trigger" });
    }
  });
  
  // POST /api/opportunity-triggers/defaults - Create default triggers for user
  app.post('/api/opportunity-triggers/defaults', isAuthenticated, async (req: any, res) => {
    try {
      console.log('[Triggers] Creating default triggers for user...');
      const userId = req.user?.claims?.sub;
      
      if (!userId) {
        console.error('[Triggers] No userId found in request');
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      console.log(`[Triggers] UserId: ${userId}`);
      const { createDefaultTriggers } = await import('./services/opportunityTriggerService');
      
      const triggers = await createDefaultTriggers(userId);
      console.log(`[Triggers] Created ${triggers.length} default triggers`);
      res.status(201).json({ 
        message: "Default triggers created",
        triggers 
      });
    } catch (error) {
      console.error("[Triggers] Error creating default triggers:", error);
      res.status(500).json({ message: "Failed to create default triggers" });
    }
  });
  
  // GET /api/opportunity-triggers/events - Get trigger events history
  app.get('/api/opportunity-triggers/events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      
      const { getTriggerEvents } = await import('./services/opportunityTriggerService');
      const events = await getTriggerEvents(userId, limit, offset);
      
      res.json({ events, limit, offset });
    } catch (error) {
      console.error("Error fetching trigger events:", error);
      res.status(500).json({ message: "Failed to fetch trigger events" });
    }
  });
  
  // GET /api/opportunity-triggers/:id - Get single trigger
  app.get('/api/opportunity-triggers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { getTriggerById } = await import('./services/opportunityTriggerService');
      
      const trigger = await getTriggerById(req.params.id, userId);
      if (!trigger) {
        return res.status(404).json({ message: "Trigger not found" });
      }
      
      res.json(trigger);
    } catch (error) {
      console.error("Error fetching trigger:", error);
      res.status(500).json({ message: "Failed to fetch trigger" });
    }
  });
  
  // PATCH /api/opportunity-triggers/:id - Update trigger
  app.patch('/api/opportunity-triggers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = updateTriggerSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const userId = req.user.claims.sub;
      const { updateTrigger } = await import('./services/opportunityTriggerService');
      
      const updated = await updateTrigger(req.params.id, userId, parseResult.data);
      if (!updated) {
        return res.status(404).json({ message: "Trigger not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating trigger:", error);
      res.status(500).json({ message: "Failed to update trigger" });
    }
  });
  
  // DELETE /api/opportunity-triggers/:id - Delete trigger
  app.delete('/api/opportunity-triggers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { deleteTrigger } = await import('./services/opportunityTriggerService');
      
      const deleted = await deleteTrigger(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Trigger not found" });
      }
      
      res.json({ message: "Trigger deleted" });
    } catch (error) {
      console.error("Error deleting trigger:", error);
      res.status(500).json({ message: "Failed to delete trigger" });
    }
  });
  
  // POST /api/opportunity-triggers/:id/toggle - Toggle trigger active state
  app.post('/api/opportunity-triggers/:id/toggle', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const isActive = req.body.isActive === true;
      
      const { toggleTrigger } = await import('./services/opportunityTriggerService');
      const success = await toggleTrigger(req.params.id, userId, isActive);
      
      if (!success) {
        return res.status(404).json({ message: "Trigger not found" });
      }
      
      res.json({ message: `Trigger ${isActive ? 'activated' : 'deactivated'}` });
    } catch (error) {
      console.error("Error toggling trigger:", error);
      res.status(500).json({ message: "Failed to toggle trigger" });
    }
  });

  // =============================================================================
  // GOVERNANCE GATE V2.0+ - Opportunity Approval System
  // =============================================================================

  // Zod validation schemas for governance endpoints
  // V2.0+: portfolioId is REQUIRED to prevent cross-portfolio capital bypass
  const governanceApproveSchema = z.object({
    franchiseId: z.string().uuid().optional(),
    notes: z.string().max(1000).optional(),
    portfolioId: z.string().uuid(), // REQUIRED: prevents aggregate capital bypass
    allocatedCapital: z.number().positive().optional(),
  });

  const governanceRejectSchema = z.object({
    franchiseId: z.string().uuid().optional(),
    reason: z.enum([
      'insufficient_capital', 'active_campaigns_conflict', 'risk_limit_exceeded',
      'var_es_threshold', 'market_conditions', 'expiration', 'user_declined',
      'franchise_restriction', 'governance_block', 'manual_review', 'other'
    ]),
    notes: z.string().max(1000).optional(),
  });

  // GET /api/governance/blueprints/:id/check - Run governance check on blueprint
  // V2.0+: Pass optional portfolioId for specific portfolio capital validation
  app.get('/api/governance/blueprints/:id/check', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const blueprintId = req.params.id;
      const franchiseId = req.query.franchiseId as string | undefined;
      const portfolioId = req.query.portfolioId as string | undefined;

      const { opportunityGovernanceService } = await import('./services/governance/opportunityGovernanceService');
      // Pass portfolioId for specific portfolio validation when provided
      const check = await opportunityGovernanceService.runGovernanceCheck(blueprintId, userId, franchiseId, portfolioId);

      res.json(check);
    } catch (error) {
      console.error("Error running governance check:", error);
      res.status(500).json({ message: "Failed to run governance check" });
    }
  });

  // POST /api/governance/blueprints/:id/approve - Approve blueprint with governance validation
  // V2.0+: portfolioId is NOW REQUIRED in schema to prevent cross-portfolio capital bypass
  app.post('/api/governance/blueprints/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = governanceApproveSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "Invalid request body",
          errors: parseResult.error.flatten().fieldErrors
        });
      }

      const userId = req.user.claims.sub;
      const blueprintId = req.params.id;
      // portfolioId is REQUIRED by schema - prevents cross-portfolio capital bypass
      const { franchiseId, notes, portfolioId, allocatedCapital } = parseResult.data;

      const { opportunityGovernanceService } = await import('./services/governance/opportunityGovernanceService');
      
      // V2.0+: Pass portfolioId for specific portfolio capital validation
      // portfolioId is REQUIRED by ApproveDecisionInput interface
      const approvalResult = await opportunityGovernanceService.approveOpportunity({
        blueprintId,
        userId,
        portfolioId, // REQUIRED - validated by Zod schema and service layer
        franchiseId,
        decidedBy: 'user',
        decidedByUserId: userId,
        notes,
      });

      if (!approvalResult.success) {
        return res.status(400).json({ message: approvalResult.error });
      }

      // Optional: Create campaign if allocatedCapital is provided
      if (allocatedCapital) {
        const { consumeBlueprint } = await import('./services/opportunityBlueprintService');
        const consumeResult = await consumeBlueprint(blueprintId, userId, portfolioId, allocatedCapital);
        
        if (consumeResult.success && consumeResult.campaignId) {
          await opportunityGovernanceService.linkCampaignToDecision(
            approvalResult.decisionId!,
            consumeResult.campaignId
          );
          
          return res.json({
            message: "Blueprint approved and campaign created",
            decisionId: approvalResult.decisionId,
            campaignId: consumeResult.campaignId,
          });
        }
      }

      res.json({
        message: "Blueprint approved",
        decisionId: approvalResult.decisionId,
      });
    } catch (error) {
      console.error("Error approving blueprint:", error);
      res.status(500).json({ message: "Failed to approve blueprint" });
    }
  });

  // POST /api/governance/blueprints/:id/reject - Reject blueprint with governance logging
  app.post('/api/governance/blueprints/:id/reject', isAuthenticated, async (req: any, res) => {
    try {
      const parseResult = governanceRejectSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "Invalid request body",
          errors: parseResult.error.flatten().fieldErrors
        });
      }

      const userId = req.user.claims.sub;
      const blueprintId = req.params.id;
      const { franchiseId, reason, notes } = parseResult.data;

      const { opportunityGovernanceService } = await import('./services/governance/opportunityGovernanceService');
      
      const result = await opportunityGovernanceService.rejectOpportunity({
        blueprintId,
        userId,
        franchiseId,
        decidedBy: 'user',
        decidedByUserId: userId,
        reason,
        notes,
      });

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({
        message: "Blueprint rejected",
        decisionId: result.decisionId,
      });
    } catch (error) {
      console.error("Error rejecting blueprint:", error);
      res.status(500).json({ message: "Failed to reject blueprint" });
    }
  });

  // GET /api/governance/decisions - Get decision history for user
  app.get('/api/governance/decisions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const blueprintId = req.query.blueprintId as string | undefined;

      const { opportunityGovernanceService } = await import('./services/governance/opportunityGovernanceService');
      const decisions = await opportunityGovernanceService.getDecisionHistory(userId, limit, blueprintId);

      res.json({ decisions });
    } catch (error) {
      console.error("Error fetching governance decisions:", error);
      res.status(500).json({ message: "Failed to fetch governance decisions" });
    }
  });

  // GET /api/governance/decisions/stats - Get decision statistics
  app.get('/api/governance/decisions/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const { opportunityGovernanceService } = await import('./services/governance/opportunityGovernanceService');
      const stats = await opportunityGovernanceService.getDecisionStats(userId);

      res.json(stats);
    } catch (error) {
      console.error("Error fetching governance stats:", error);
      res.status(500).json({ message: "Failed to fetch governance stats" });
    }
  });

  // GET /api/governance/decisions/verify - Verify decision chain integrity
  app.get('/api/governance/decisions/verify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const { opportunityGovernanceService } = await import('./services/governance/opportunityGovernanceService');
      const verification = await opportunityGovernanceService.verifyDecisionChain(userId);

      res.json(verification);
    } catch (error) {
      console.error("Error verifying decision chain:", error);
      res.status(500).json({ message: "Failed to verify decision chain" });
    }
  });

  // ========== FRANCHISE PLANS API ==========
  
  // GET /api/franchise-plans - List all plans with versions
  app.get('/api/franchise-plans', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePlanService } = await import('./services/franchisePlanService');
      const plans = await franchisePlanService.getPlansWithVersions();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching franchise plans:", error);
      res.status(500).json({ message: "Failed to fetch franchise plans" });
    }
  });

  // GET /api/franchise-plans/:id - Get single plan with versions
  app.get('/api/franchise-plans/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePlanService } = await import('./services/franchisePlanService');
      const result = await franchisePlanService.getPlanWithActiveVersion(req.params.id);
      
      if (!result) {
        return res.status(404).json({ message: "Plan not found" });
      }
      
      const versions = await franchisePlanService.listVersions(req.params.id);
      res.json({ ...result, versions });
    } catch (error) {
      console.error("Error fetching franchise plan:", error);
      res.status(500).json({ message: "Failed to fetch franchise plan" });
    }
  });

  // POST /api/franchise-plans - Create new plan
  app.post('/api/franchise-plans', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { franchisePlanService } = await import('./services/franchisePlanService');
      
      const { name, code, max_campaigns, max_capital_usd, royalty_percentage, features, is_active, display_order } = req.body;
      
      if (!name || !code) {
        return res.status(400).json({ message: "Name and code are required" });
      }
      
      const plan = await franchisePlanService.createPlan({
        name,
        code,
        max_campaigns,
        max_capital_usd,
        royalty_percentage,
        features,
        is_active,
        display_order,
      }, userId);
      
      res.status(201).json(plan);
    } catch (error) {
      console.error("Error creating franchise plan:", error);
      res.status(500).json({ message: "Failed to create franchise plan" });
    }
  });

  // PATCH /api/franchise-plans/:id - Update plan metadata (not version data)
  app.patch('/api/franchise-plans/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { franchisePlanService } = await import('./services/franchisePlanService');
      
      const updated = await franchisePlanService.updatePlan(req.params.id, req.body, userId);
      if (!updated) {
        return res.status(404).json({ message: "Plan not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating franchise plan:", error);
      res.status(500).json({ message: "Failed to update franchise plan" });
    }
  });

  // GET /api/franchise-plans/:id/versions - List all versions for a plan
  app.get('/api/franchise-plans/:id/versions', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePlanService } = await import('./services/franchisePlanService');
      const versions = await franchisePlanService.listVersions(req.params.id);
      res.json(versions);
    } catch (error) {
      console.error("Error fetching plan versions:", error);
      res.status(500).json({ message: "Failed to fetch plan versions" });
    }
  });

  // POST /api/franchise-plans/:id/versions - Create new version for a plan
  app.post('/api/franchise-plans/:id/versions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { franchisePlanService } = await import('./services/franchisePlanService');
      
      const versionData = {
        plan_id: req.params.id,
        ...req.body,
      };
      
      const version = await franchisePlanService.createVersion(versionData, userId);
      res.status(201).json(version);
    } catch (error) {
      console.error("Error creating plan version:", error);
      res.status(500).json({ message: "Failed to create plan version" });
    }
  });

  // GET /api/franchise-plans/:planId/versions/:versionId - Get specific version
  app.get('/api/franchise-plans/:planId/versions/:versionId', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePlanService } = await import('./services/franchisePlanService');
      const version = await franchisePlanService.getVersionById(req.params.versionId);
      
      if (!version || version.plan_id !== req.params.planId) {
        return res.status(404).json({ message: "Version not found" });
      }
      
      res.json(version);
    } catch (error) {
      console.error("Error fetching plan version:", error);
      res.status(500).json({ message: "Failed to fetch plan version" });
    }
  });

  // POST /api/franchise-plans/:planId/versions/:versionId/activate - Activate a version
  app.post('/api/franchise-plans/:planId/versions/:versionId/activate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { franchisePlanService } = await import('./services/franchisePlanService');
      
      const activated = await franchisePlanService.activateVersion(req.params.versionId, userId);
      if (!activated) {
        return res.status(404).json({ message: "Version not found" });
      }
      
      res.json(activated);
    } catch (error) {
      console.error("Error activating plan version:", error);
      res.status(500).json({ message: "Failed to activate plan version" });
    }
  });

  // POST /api/franchise-plans/:planId/versions/:versionId/archive - Archive a version
  app.post('/api/franchise-plans/:planId/versions/:versionId/archive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { franchisePlanService } = await import('./services/franchisePlanService');
      
      const archived = await franchisePlanService.archiveVersion(req.params.versionId, userId);
      if (!archived) {
        return res.status(404).json({ message: "Version not found" });
      }
      
      res.json(archived);
    } catch (error) {
      console.error("Error archiving plan version:", error);
      res.status(500).json({ message: "Failed to archive plan version" });
    }
  });

  // POST /api/franchise-plans/:planId/versions/:versionId/duplicate - Duplicate a version
  app.post('/api/franchise-plans/:planId/versions/:versionId/duplicate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { franchisePlanService } = await import('./services/franchisePlanService');
      
      const duplicated = await franchisePlanService.duplicateVersion(
        req.params.versionId, 
        req.body.notes, 
        userId
      );
      
      if (!duplicated) {
        return res.status(404).json({ message: "Version not found" });
      }
      
      res.status(201).json(duplicated);
    } catch (error) {
      console.error("Error duplicating plan version:", error);
      res.status(500).json({ message: "Failed to duplicate plan version" });
    }
  });

  // GET /api/franchise-plans/:id/audit-logs - Get audit logs for a plan
  app.get('/api/franchise-plans/:id/audit-logs', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePlanService } = await import('./services/franchisePlanService');
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const logs = await franchisePlanService.listAuditLogs(req.params.id, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching plan audit logs:", error);
      res.status(500).json({ message: "Failed to fetch plan audit logs" });
    }
  });

  // GET /api/franchise-plans/defaults/:code - Get default version data for a plan type
  app.get('/api/franchise-plans/defaults/:code', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePlanService } = await import('./services/franchisePlanService');
      const defaults = await franchisePlanService.getDefaultVersionData(req.params.code);
      res.json(defaults);
    } catch (error) {
      console.error("Error fetching plan defaults:", error);
      res.status(500).json({ message: "Failed to fetch plan defaults" });
    }
  });

  // ========== MASTER FRANCHISE TERRITORY ROUTES ==========

  // GET /api/territories - List all territories
  app.get('/api/territories', isAuthenticated, async (req: any, res) => {
    try {
      const { territoryService } = await import('./services/franchise/territoryService');
      
      const filters: any = {};
      if (req.query.country) filters.countryCode = req.query.country;
      if (req.query.exclusivity) filters.exclusivityType = req.query.exclusivity;
      if (req.query.active !== undefined) filters.isActive = req.query.active === 'true';
      
      const territories = await territoryService.listTerritories(filters);
      res.json(territories);
    } catch (error) {
      console.error("Error fetching territories:", error);
      res.status(500).json({ message: "Failed to fetch territories" });
    }
  });

  // GET /api/territories/:id - Get single territory
  app.get('/api/territories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { territoryService } = await import('./services/franchise/territoryService');
      const territory = await territoryService.getTerritoryById(req.params.id);
      
      if (!territory) {
        return res.status(404).json({ message: "Territory not found" });
      }
      
      res.json(territory);
    } catch (error) {
      console.error("Error fetching territory:", error);
      res.status(500).json({ message: "Failed to fetch territory" });
    }
  });

  // POST /api/territories - Create new territory
  app.post('/api/territories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { territoryService } = await import('./services/franchise/territoryService');
      const result = await territoryService.createTerritory(req.body, userId);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.status(201).json(result.territory);
    } catch (error) {
      console.error("Error creating territory:", error);
      res.status(500).json({ message: "Failed to create territory" });
    }
  });

  // POST /api/territories/validate - Validate territory definition
  app.post('/api/territories/validate', isAuthenticated, async (req: any, res) => {
    try {
      const { territoryService } = await import('./services/franchise/territoryService');
      const validation = territoryService.validateTerritoryDefinition(req.body);
      res.json(validation);
    } catch (error) {
      console.error("Error validating territory:", error);
      res.status(500).json({ message: "Failed to validate territory" });
    }
  });

  // POST /api/territories/check-overlap - Check for territory overlaps
  app.post('/api/territories/check-overlap', isAuthenticated, async (req: any, res) => {
    try {
      const { territoryService } = await import('./services/franchise/territoryService');
      const { territory, excludeTerritoryId } = req.body;
      
      const overlapCheck = await territoryService.checkTerritoryOverlap(territory, excludeTerritoryId);
      res.json(overlapCheck);
    } catch (error) {
      console.error("Error checking territory overlap:", error);
      res.status(500).json({ message: "Failed to check territory overlap" });
    }
  });

  // POST /api/territories/validate-location - Validate if location is within master's territory
  app.post('/api/territories/validate-location', isAuthenticated, async (req: any, res) => {
    try {
      const { territoryService } = await import('./services/franchise/territoryService');
      const { masterId, location } = req.body;
      
      if (!masterId || !location) {
        return res.status(400).json({ message: "masterId and location are required" });
      }
      
      const result = await territoryService.validateLocationInTerritory(masterId, location);
      res.json(result);
    } catch (error) {
      console.error("Error validating location:", error);
      res.status(500).json({ message: "Failed to validate location" });
    }
  });

  // POST /api/territories/:id/audit-snapshot - Create audit snapshot
  app.post('/api/territories/:id/audit-snapshot', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { territoryService } = await import('./services/franchise/territoryService');
      const { masterId, reason, relatedFranchiseId, eventDescription } = req.body;
      
      if (!masterId || !reason) {
        return res.status(400).json({ message: "masterId and reason are required" });
      }
      
      const result = await territoryService.createAuditSnapshot(
        masterId,
        req.params.id,
        reason,
        relatedFranchiseId,
        eventDescription,
        userId
      );
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.status(201).json({ snapshotId: result.snapshotId });
    } catch (error) {
      console.error("Error creating audit snapshot:", error);
      res.status(500).json({ message: "Failed to create audit snapshot" });
    }
  });

  // GET /api/masters/:id/audit-chain - Verify audit chain integrity
  app.get('/api/masters/:id/audit-chain', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { territoryService } = await import('./services/franchise/territoryService');
      const result = await territoryService.verifyAuditChain(req.params.id);
      res.json(result);
    } catch (error) {
      console.error("Error verifying audit chain:", error);
      res.status(500).json({ message: "Failed to verify audit chain" });
    }
  });

  // GET /api/territories/:id/hash - Calculate territory hash
  app.get('/api/territories/:id/hash', isAuthenticated, async (req: any, res) => {
    try {
      const { territoryService } = await import('./services/franchise/territoryService');
      const territory = await territoryService.getTerritoryById(req.params.id);
      
      if (!territory) {
        return res.status(404).json({ message: "Territory not found" });
      }
      
      const hash = territoryService.calculateTerritoryHash({
        country_code: territory.country_code,
        states: territory.states || undefined,
        municipalities: territory.municipalities || undefined,
        micro_regions: territory.micro_regions || undefined,
        metro_regions: territory.metro_regions || undefined,
        urban_agglomerations: territory.urban_agglomerations || undefined,
        zip_code_ranges: territory.zip_code_ranges || undefined,
        zip_code_exclusions: territory.zip_code_exclusions || undefined,
        custom_economic_zone_id: territory.custom_economic_zone_id || undefined,
        excluded_states: territory.excluded_states || undefined,
        excluded_municipalities: territory.excluded_municipalities || undefined
      });
      
      res.json({ 
        territoryId: territory.id,
        storedHash: territory.territory_hash,
        calculatedHash: hash,
        isValid: territory.territory_hash === hash
      });
    } catch (error) {
      console.error("Error calculating territory hash:", error);
      res.status(500).json({ message: "Failed to calculate territory hash" });
    }
  });

  // ========== MASTER ACCOUNT MANAGEMENT ENDPOINTS ==========

  // GET /api/master-accounts - List all master accounts
  app.get('/api/master-accounts', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const { status, exclusivityStatus } = req.query;
      const masters = await masterAccountService.listMasters({ 
        status: status as string, 
        exclusivityStatus: exclusivityStatus as string 
      });
      res.json(masters);
    } catch (error) {
      console.error("Error listing master accounts:", error);
      res.status(500).json({ message: "Failed to list master accounts" });
    }
  });

  // GET /api/master-accounts/:id - Get master account by ID
  app.get('/api/master-accounts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const master = await masterAccountService.getMasterById(req.params.id);
      
      if (!master) {
        return res.status(404).json({ message: "Master account not found" });
      }
      
      // Check permission: franchisor or the master's primary user
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor && master.primary_user_id !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(master);
    } catch (error) {
      console.error("Error getting master account:", error);
      res.status(500).json({ message: "Failed to get master account" });
    }
  });

  // POST /api/master-accounts - Create new master account
  app.post('/api/master-accounts', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const result = await masterAccountService.createMasterAccount(req.body, req.user.id);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.status(201).json({ masterId: result.masterId, message: "Master account created successfully" });
    } catch (error) {
      console.error("Error creating master account:", error);
      res.status(500).json({ message: "Failed to create master account" });
    }
  });

  // POST /api/master-accounts/:id/approve - Approve pending master account
  app.post('/api/master-accounts/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const result = await masterAccountService.approveMasterAccount(req.params.id, req.user.id);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ message: "Master account approved successfully" });
    } catch (error) {
      console.error("Error approving master account:", error);
      res.status(500).json({ message: "Failed to approve master account" });
    }
  });

  // POST /api/master-accounts/:id/suspend - Suspend master account
  app.post('/api/master-accounts/:id/suspend', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { reason, violationType } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Reason is required" });
      }
      
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const result = await masterAccountService.suspendMasterAccount(req.params.id, reason, violationType);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ message: "Master account suspended successfully" });
    } catch (error) {
      console.error("Error suspending master account:", error);
      res.status(500).json({ message: "Failed to suspend master account" });
    }
  });

  // POST /api/master-accounts/:id/reactivate - Reactivate suspended master account
  app.post('/api/master-accounts/:id/reactivate', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const result = await masterAccountService.reactivateMasterAccount(req.params.id, req.user.id);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ message: "Master account reactivated successfully" });
    } catch (error) {
      console.error("Error reactivating master account:", error);
      res.status(500).json({ message: "Failed to reactivate master account" });
    }
  });

  // GET /api/master-accounts/:id/dashboard - Get master dashboard statistics
  app.get('/api/master-accounts/:id/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const master = await masterAccountService.getMasterById(req.params.id);
      
      if (!master) {
        return res.status(404).json({ message: "Master account not found" });
      }
      
      // Check permission
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor && master.primary_user_id !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const stats = await masterAccountService.getMasterDashboardStats(req.params.id);
      res.json(stats);
    } catch (error) {
      console.error("Error getting master dashboard:", error);
      res.status(500).json({ message: "Failed to get master dashboard" });
    }
  });

  // GET /api/master-accounts/:id/regional-links - Get regional franchise links
  app.get('/api/master-accounts/:id/regional-links', isAuthenticated, async (req: any, res) => {
    try {
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const master = await masterAccountService.getMasterById(req.params.id);
      
      if (!master) {
        return res.status(404).json({ message: "Master account not found" });
      }
      
      // Check permission
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor && master.primary_user_id !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const links = await masterAccountService.getMasterRegionalLinks(req.params.id);
      res.json(links);
    } catch (error) {
      console.error("Error getting regional links:", error);
      res.status(500).json({ message: "Failed to get regional links" });
    }
  });

  // POST /api/master-accounts/:id/regional-links - Create regional franchise link
  app.post('/api/master-accounts/:id/regional-links', isAuthenticated, async (req: any, res) => {
    try {
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const master = await masterAccountService.getMasterById(req.params.id);
      
      if (!master) {
        return res.status(404).json({ message: "Master account not found" });
      }
      
      // Check permission
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor && master.primary_user_id !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const result = await masterAccountService.createRegionalLink(req.params.id, req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.status(201).json({ linkId: result.linkId, message: "Regional link created successfully" });
    } catch (error) {
      console.error("Error creating regional link:", error);
      res.status(500).json({ message: "Failed to create regional link" });
    }
  });

  // GET /api/master-accounts/:id/performance-targets - Get performance targets
  app.get('/api/master-accounts/:id/performance-targets', isAuthenticated, async (req: any, res) => {
    try {
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const master = await masterAccountService.getMasterById(req.params.id);
      
      if (!master) {
        return res.status(404).json({ message: "Master account not found" });
      }
      
      // Check permission
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor && master.primary_user_id !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const targets = await masterAccountService.getMasterPerformanceTargets(req.params.id);
      res.json(targets);
    } catch (error) {
      console.error("Error getting performance targets:", error);
      res.status(500).json({ message: "Failed to get performance targets" });
    }
  });

  // POST /api/master-accounts/:id/performance-targets - Create performance target
  app.post('/api/master-accounts/:id/performance-targets', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const result = await masterAccountService.createPerformanceTarget(req.params.id, req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.status(201).json({ targetId: result.targetId, message: "Performance target created successfully" });
    } catch (error) {
      console.error("Error creating performance target:", error);
      res.status(500).json({ message: "Failed to create performance target" });
    }
  });

  // POST /api/performance-targets/:id/evaluate - Evaluate performance target
  app.post('/api/performance-targets/:id/evaluate', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const result = await masterAccountService.evaluatePerformanceTarget(req.params.id, req.user.id);
      
      if ('error' in result) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error evaluating performance target:", error);
      res.status(500).json({ message: "Failed to evaluate performance target" });
    }
  });

  // POST /api/revenue-splits/calculate - Calculate revenue split for a transaction
  app.post('/api/revenue-splits/calculate', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterId, franchiseeId, amount, splitType } = req.body;
      
      if (!masterId || !franchiseeId || !amount || !splitType) {
        return res.status(400).json({ message: "Missing required fields: masterId, franchiseeId, amount, splitType" });
      }
      
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const master = await masterAccountService.getMasterById(masterId);
      
      if (!master) {
        return res.status(404).json({ message: "Master account not found" });
      }
      
      let result;
      if (splitType === 'franchise_fee') {
        result = masterAccountService.calculateFranchiseFeeSplit(master, amount, franchiseeId);
      } else if (splitType === 'royalty') {
        result = masterAccountService.calculateRoyaltySplit(master, amount, franchiseeId);
      } else {
        return res.status(400).json({ message: "Invalid splitType - must be 'franchise_fee' or 'royalty'" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error calculating revenue split:", error);
      res.status(500).json({ message: "Failed to calculate revenue split" });
    }
  });

  // GET /api/master-accounts/find-by-location - Find master for a location
  app.get('/api/master-accounts/find-by-location', isAuthenticated, async (req: any, res) => {
    try {
      const { state, municipality, zipCode, countryCode } = req.query;
      
      const { masterAccountService } = await import('./services/franchise/masterAccountService');
      const master = await masterAccountService.findMasterForLocation({
        state: state as string,
        municipality: municipality as string,
        zipCode: zipCode as string,
        countryCode: countryCode as string,
      });
      
      if (!master) {
        return res.status(404).json({ message: "No master account covers this location" });
      }
      
      res.json({
        masterId: master.id,
        masterName: master.legal_entity_name,
        territoryId: master.territory_definition_id,
      });
    } catch (error) {
      console.error("Error finding master for location:", error);
      res.status(500).json({ message: "Failed to find master for location" });
    }
  });

  // ========== ANTIFRAUD ENDPOINTS ==========

  // GET /api/antifraud/dashboard - Get antifraud dashboard statistics
  app.get('/api/antifraud/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAntifraudService } = await import('./services/franchise/masterAntifraudService');
      const dashboard = await masterAntifraudService.getAntifraudDashboard();
      res.json(dashboard);
    } catch (error) {
      console.error("Error getting antifraud dashboard:", error);
      res.status(500).json({ message: "Failed to get antifraud dashboard" });
    }
  });

  // GET /api/antifraud/events - List fraud events
  app.get('/api/antifraud/events', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAntifraudService } = await import('./services/franchise/masterAntifraudService');
      const { masterId, fraudType, status, severity, startDate, endDate, limit, offset } = req.query;
      
      const result = await masterAntifraudService.listFraudEvents({
        masterId: masterId as string,
        fraudType: fraudType as any,
        status: status as any,
        severity: severity as any,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error listing fraud events:", error);
      res.status(500).json({ message: "Failed to list fraud events" });
    }
  });

  // GET /api/antifraud/events/:id - Get fraud event by ID
  app.get('/api/antifraud/events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAntifraudService } = await import('./services/franchise/masterAntifraudService');
      const event = await masterAntifraudService.getFraudEventById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ message: "Fraud event not found" });
      }
      
      res.json(event);
    } catch (error) {
      console.error("Error getting fraud event:", error);
      res.status(500).json({ message: "Failed to get fraud event" });
    }
  });

  // POST /api/antifraud/events/:id/status - Update fraud event status
  app.post('/api/antifraud/events/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { status, notes } = req.body;
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }
      
      const { masterAntifraudService } = await import('./services/franchise/masterAntifraudService');
      const result = await masterAntifraudService.updateFraudStatus(
        req.params.id,
        status,
        notes,
        req.user.id
      );
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ success: true, message: "Status updated successfully" });
    } catch (error) {
      console.error("Error updating fraud status:", error);
      res.status(500).json({ message: "Failed to update fraud status" });
    }
  });

  // POST /api/antifraud/events/:id/action - Record action on fraud event
  app.post('/api/antifraud/events/:id/action', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { action, actionDetails } = req.body;
      if (!action || !actionDetails) {
        return res.status(400).json({ message: "Action and actionDetails are required" });
      }
      
      const { masterAntifraudService } = await import('./services/franchise/masterAntifraudService');
      const result = await masterAntifraudService.recordAction({
        eventId: req.params.id,
        action,
        actionDetails,
        actionBy: req.user.id
      });
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ success: true, message: "Action recorded successfully" });
    } catch (error) {
      console.error("Error recording fraud action:", error);
      res.status(500).json({ message: "Failed to record fraud action" });
    }
  });

  // GET /api/antifraud/masters/:id/summary - Get fraud summary for a master
  app.get('/api/antifraud/masters/:id/summary', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAntifraudService } = await import('./services/franchise/masterAntifraudService');
      const summary = await masterAntifraudService.getMasterFraudSummary(req.params.id);
      res.json(summary);
    } catch (error) {
      console.error("Error getting master fraud summary:", error);
      res.status(500).json({ message: "Failed to get master fraud summary" });
    }
  });

  // GET /api/antifraud/alerts - Get pending alerts
  app.get('/api/antifraud/alerts', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAntifraudService } = await import('./services/franchise/masterAntifraudService');
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const alerts = await masterAntifraudService.getPendingAlerts(limit);
      res.json(alerts);
    } catch (error) {
      console.error("Error getting pending alerts:", error);
      res.status(500).json({ message: "Failed to get pending alerts" });
    }
  });

  // POST /api/antifraud/alerts/:id/acknowledge - Acknowledge an alert
  app.post('/api/antifraud/alerts/:id/acknowledge', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterAntifraudService } = await import('./services/franchise/masterAntifraudService');
      const result = await masterAntifraudService.acknowledgeAlert(req.params.id, req.user.id);
      
      if (!result.success) {
        return res.status(400).json({ message: "Failed to acknowledge alert" });
      }
      
      res.json({ success: true, message: "Alert acknowledged" });
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  // POST /api/antifraud/validate-territory - Validate territory action (prevention check)
  app.post('/api/antifraud/validate-territory', isAuthenticated, async (req: any, res) => {
    try {
      const { masterId, targetLocation, actionType } = req.body;
      
      if (!masterId || !targetLocation || !actionType) {
        return res.status(400).json({ message: "Missing required fields: masterId, targetLocation, actionType" });
      }
      
      const { masterAntifraudService } = await import('./services/franchise/masterAntifraudService');
      const result = await masterAntifraudService.validateTerritoryAction({
        masterId,
        targetLocation,
        actionType
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error validating territory action:", error);
      res.status(500).json({ message: "Failed to validate territory action" });
    }
  });

  // POST /api/antifraud/report - Manually report a fraud event
  app.post('/api/antifraud/report', isAuthenticated, async (req: any, res) => {
    try {
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { masterId, fraudType, severity, evidence, relatedTerritoryId, relatedFranchiseId, relatedAmount } = req.body;
      
      if (!masterId || !fraudType || !evidence) {
        return res.status(400).json({ message: "Missing required fields: masterId, fraudType, evidence" });
      }
      
      const { masterAntifraudService } = await import('./services/franchise/masterAntifraudService');
      const result = await masterAntifraudService.detectFraud({
        masterId,
        fraudType,
        severity: severity || 'medium',
        detectionSource: 'manual_report',
        evidence,
        relatedTerritoryId,
        relatedFranchiseId,
        relatedAmount
      });
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({
        success: true,
        eventId: result.eventId,
        autoAction: result.autoAction,
        message: "Fraud event reported successfully"
      });
    } catch (error) {
      console.error("Error reporting fraud:", error);
      res.status(500).json({ message: "Failed to report fraud" });
    }
  });

  // ==========================================
  // VRE (Volatility Regime Engine) Routes
  // ==========================================

  // GET /api/vre/regime/:symbol - Get current regime for a symbol
  app.get('/api/vre/regime/:symbol', isAuthenticated, async (req: any, res) => {
    try {
      const { symbol } = req.params;
      const { campaignId } = req.query;
      
      const { volatilityRegimeEngine } = await import('./services/trading/volatilityRegimeEngine');
      const state = await volatilityRegimeEngine.detectRegime(
        symbol, 
        campaignId ? String(campaignId) : undefined
      );
      
      res.json({
        symbol,
        regime: state.regime,
        z_score: state.z_score,
        rv_ratio: state.rv_ratio,
        rv_short: state.rv_short,
        rv_long: state.rv_long,
        confidence: state.confidence,
        confirmations: state.confirmations,
        cycles_in_regime: state.cycles_in_regime,
        cooldown_remaining: state.cooldown_remaining,
        method_used: state.method_used,
        timestamp: state.timestamp
      });
    } catch (error) {
      console.error("Error getting VRE regime:", error);
      res.status(500).json({ message: "Failed to get regime" });
    }
  });

  // GET /api/vre/aggregate - Get aggregate regime across multiple symbols
  app.get('/api/vre/aggregate', isAuthenticated, async (req: any, res) => {
    try {
      const symbolsParam = req.query.symbols as string | undefined;
      const symbols = symbolsParam ? symbolsParam.split(',') : ['BTC/USD', 'ETH/USD'];
      
      const { volatilityRegimeEngine } = await import('./services/trading/volatilityRegimeEngine');
      const result = await volatilityRegimeEngine.detectAggregateRegime(symbols);
      
      const individualStates: Record<string, any> = {};
      for (const [symbol, state] of Array.from(result.individual.entries())) {
        individualStates[symbol] = {
          regime: state.regime,
          z_score: state.z_score,
          confidence: state.confidence,
        };
      }
      
      res.json({
        aggregate_regime: result.regime,
        confidence: result.confidence,
        individual: individualStates
      });
    } catch (error) {
      console.error("Error getting aggregate regime:", error);
      res.status(500).json({ message: "Failed to get aggregate regime" });
    }
  });

  // GET /api/vre/parameters/:regime - Get adaptive parameters for a regime
  app.get('/api/vre/parameters/:regime', isAuthenticated, async (req: any, res) => {
    try {
      const regime = req.params.regime.toUpperCase();
      const { profile } = req.query;
      
      if (!['LOW', 'NORMAL', 'HIGH', 'EXTREME'].includes(regime)) {
        return res.status(400).json({ message: "Invalid regime. Must be LOW, NORMAL, HIGH, or EXTREME" });
      }
      
      const { adaptiveParameterService } = await import('./services/trading/adaptiveParameterService');
      
      let params;
      if (profile) {
        params = await adaptiveParameterService.getParametersForCampaign(
          regime as any, 
          profile.toUpperCase() as any
        );
      } else {
        params = await adaptiveParameterService.getParametersForRegime(regime as any);
      }
      
      res.json(params);
    } catch (error) {
      console.error("Error getting VRE parameters:", error);
      res.status(500).json({ message: "Failed to get parameters" });
    }
  });

  // GET /api/vre/parameters - Get all default parameters
  app.get('/api/vre/parameters', isAuthenticated, async (req: any, res) => {
    try {
      const { adaptiveParameterService } = await import('./services/trading/adaptiveParameterService');
      const defaults = adaptiveParameterService.getDefaultParameters();
      res.json(defaults);
    } catch (error) {
      console.error("Error getting all VRE parameters:", error);
      res.status(500).json({ message: "Failed to get parameters" });
    }
  });

  // POST /api/vre/seed - Seed default parameters (admin only)
  app.post('/api/vre/seed', isAuthenticated, async (req: any, res) => {
    try {
      const { adaptiveParameterService } = await import('./services/trading/adaptiveParameterService');
      await adaptiveParameterService.seedDefaultParameters();
      res.json({ success: true, message: "Default parameters seeded" });
    } catch (error) {
      console.error("Error seeding VRE parameters:", error);
      res.status(500).json({ message: "Failed to seed parameters" });
    }
  });

  // GET /api/vre/circuit-breakers - Get circuit breaker status
  app.get('/api/vre/circuit-breakers', isAuthenticated, async (req: any, res) => {
    try {
      const { vreCircuitBreakersService } = await import('./services/trading/vreCircuitBreakers');
      const state = vreCircuitBreakersService.getState();
      
      const blockedAssets = vreCircuitBreakersService.getBlockedAssets();
      
      res.json({
        extremeSpikeGuard: {
          active: state.extremeSpikeGuard.active,
          triggeredAt: state.extremeSpikeGuard.triggeredAt,
          blocksAddonsUntil: state.extremeSpikeGuard.blocksAddonsUntil
        },
        whipsawGuard: {
          active: state.whipsawGuard.active,
          blockedAssets
        }
      });
    } catch (error) {
      console.error("Error getting VRE circuit breakers:", error);
      res.status(500).json({ message: "Failed to get circuit breakers" });
    }
  });

  // POST /api/vre/circuit-breakers/check - Check all guards for a symbol
  app.post('/api/vre/circuit-breakers/check', isAuthenticated, async (req: any, res) => {
    try {
      const { symbol, zScore } = req.body;
      
      if (!symbol || zScore === undefined) {
        return res.status(400).json({ message: "Missing required fields: symbol, zScore" });
      }
      
      const { vreCircuitBreakersService } = await import('./services/trading/vreCircuitBreakers');
      const result = vreCircuitBreakersService.checkAllGuards(symbol, zScore);
      
      res.json(result);
    } catch (error) {
      console.error("Error checking VRE guards:", error);
      res.status(500).json({ message: "Failed to check guards" });
    }
  });

  // POST /api/vre/circuit-breakers/record-trade - Record trade result for whipsaw guard
  app.post('/api/vre/circuit-breakers/record-trade', isAuthenticated, async (req: any, res) => {
    try {
      const { symbol, isLoss } = req.body;
      
      if (!symbol || isLoss === undefined) {
        return res.status(400).json({ message: "Missing required fields: symbol, isLoss" });
      }
      
      const { vreCircuitBreakersService } = await import('./services/trading/vreCircuitBreakers');
      vreCircuitBreakersService.recordTradeResult(symbol, isLoss);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording trade result:", error);
      res.status(500).json({ message: "Failed to record trade" });
    }
  });

  // GET /api/vre/profile-restrictions/:profile - Get profile restrictions
  app.get('/api/vre/profile-restrictions/:profile', isAuthenticated, async (req: any, res) => {
    try {
      const profile = req.params.profile.toUpperCase();
      
      if (!['C', 'M', 'A', 'SA', 'FULL'].includes(profile)) {
        return res.status(400).json({ message: "Invalid profile. Must be C, M, A, SA, or FULL" });
      }
      
      const { adaptiveParameterService } = await import('./services/trading/adaptiveParameterService');
      const restrictions = adaptiveParameterService.getProfileRestrictions(profile as any);
      
      res.json({
        profile,
        ...restrictions
      });
    } catch (error) {
      console.error("Error getting profile restrictions:", error);
      res.status(500).json({ message: "Failed to get restrictions" });
    }
  });

  // =============================================================================
  // FEATURE STORE API - V2 Opportunity Engine Foundation
  // =============================================================================

  // GET /api/feature-store/asset/:symbol - Get feature vector for single asset
  app.get('/api/feature-store/asset/:symbol', isAuthenticated, async (req: any, res) => {
    try {
      const { symbol } = req.params;
      const { featureStoreService } = await import('./services/opportunity/featureStoreService');
      
      const features = await featureStoreService.getAssetFeatures(symbol);
      
      if (!features) {
        return res.status(404).json({ message: `No features found for ${symbol}` });
      }
      
      res.json(features);
    } catch (error) {
      console.error("Error fetching asset features:", error);
      res.status(500).json({ message: "Failed to fetch asset features" });
    }
  });

  // POST /api/feature-store/assets - Get features for multiple assets
  app.post('/api/feature-store/assets', isAuthenticated, async (req: any, res) => {
    try {
      const { symbols } = req.body;
      
      if (!symbols || !Array.isArray(symbols)) {
        return res.status(400).json({ message: "symbols array required" });
      }
      
      const { featureStoreService } = await import('./services/opportunity/featureStoreService');
      const featuresMap = await featureStoreService.getBatchAssetFeatures(symbols);
      
      res.json({
        count: featuresMap.size,
        features: Object.fromEntries(featuresMap)
      });
    } catch (error) {
      console.error("Error fetching batch features:", error);
      res.status(500).json({ message: "Failed to fetch batch features" });
    }
  });

  // GET /api/feature-store/cluster/:clusterId - Get aggregate for single cluster
  app.get('/api/feature-store/cluster/:clusterId', isAuthenticated, async (req: any, res) => {
    try {
      const clusterId = parseInt(req.params.clusterId);
      
      if (isNaN(clusterId) || clusterId < 1 || clusterId > 10) {
        return res.status(400).json({ message: "clusterId must be 1-10" });
      }
      
      const { featureStoreService } = await import('./services/opportunity/featureStoreService');
      const aggregate = await featureStoreService.getClusterAggregate(clusterId);
      
      if (!aggregate) {
        return res.status(404).json({ message: `No data for cluster ${clusterId}` });
      }
      
      res.json(aggregate);
    } catch (error) {
      console.error("Error fetching cluster aggregate:", error);
      res.status(500).json({ message: "Failed to fetch cluster aggregate" });
    }
  });

  // GET /api/feature-store/clusters - Get all cluster aggregates
  app.get('/api/feature-store/clusters', isAuthenticated, async (req: any, res) => {
    try {
      const { featureStoreService } = await import('./services/opportunity/featureStoreService');
      const aggregates = await featureStoreService.getAllClusterAggregates();
      
      res.json({
        count: aggregates.length,
        clusters: aggregates
      });
    } catch (error) {
      console.error("Error fetching all clusters:", error);
      res.status(500).json({ message: "Failed to fetch clusters" });
    }
  });

  // GET /api/feature-store/eligible - Get opportunity-eligible assets
  app.get('/api/feature-store/eligible', isAuthenticated, async (req: any, res) => {
    try {
      const minScore = parseFloat(req.query.min_score as string) || 0.6;
      
      const { featureStoreService } = await import('./services/opportunity/featureStoreService');
      const eligible = await featureStoreService.getOpportunityEligibleAssets(minScore);
      
      res.json({
        count: eligible.length,
        min_score: minScore,
        assets: eligible
      });
    } catch (error) {
      console.error("Error fetching eligible assets:", error);
      res.status(500).json({ message: "Failed to fetch eligible assets" });
    }
  });

  // GET /api/feature-store/semantic-clusters - Get cluster definitions
  app.get('/api/feature-store/semantic-clusters', isAuthenticated, async (req: any, res) => {
    try {
      const { SEMANTIC_CLUSTERS } = await import('./services/opportunity/featureStoreService');
      
      res.json({
        count: Object.keys(SEMANTIC_CLUSTERS).length,
        clusters: SEMANTIC_CLUSTERS
      });
    } catch (error) {
      console.error("Error fetching semantic clusters:", error);
      res.status(500).json({ message: "Failed to fetch semantic clusters" });
    }
  });

  // POST /api/feature-store/invalidate - Invalidate cache (admin)
  app.post('/api/feature-store/invalidate', isAuthenticated, async (req: any, res) => {
    try {
      const { symbol } = req.body;
      
      const { featureStoreService } = await import('./services/opportunity/featureStoreService');
      await featureStoreService.invalidateCache(symbol);
      
      res.json({ 
        success: true, 
        message: symbol ? `Cache invalidated for ${symbol}` : 'All cache invalidated' 
      });
    } catch (error) {
      console.error("Error invalidating cache:", error);
      res.status(500).json({ message: "Failed to invalidate cache" });
    }
  });

  // =============================================================================
  // SEMANTIC CLUSTER API - V2 Cluster Classification System
  // =============================================================================

  // GET /api/semantic-clusters/definitions - Get all cluster definitions
  app.get('/api/semantic-clusters/definitions', isAuthenticated, async (req: any, res) => {
    try {
      const { CLUSTER_DEFINITIONS } = await import('./services/opportunity/semanticClusterService');
      
      res.json({
        count: CLUSTER_DEFINITIONS.length,
        clusters: CLUSTER_DEFINITIONS
      });
    } catch (error) {
      console.error("Error fetching cluster definitions:", error);
      res.status(500).json({ message: "Failed to fetch definitions" });
    }
  });

  // GET /api/semantic-clusters/classify/:symbol - Classify single asset
  app.get('/api/semantic-clusters/classify/:symbol', isAuthenticated, async (req: any, res) => {
    try {
      const { symbol } = req.params;
      const { semanticClusterService } = await import('./services/opportunity/semanticClusterService');
      
      const result = await semanticClusterService.classifyAsset(symbol);
      const definition = semanticClusterService.getClusterDefinition(result.clusterId);
      
      res.json({
        symbol,
        cluster_id: result.clusterId,
        cluster_name: definition?.name || 'UNKNOWN',
        confidence: result.confidence,
        reason: result.reason
      });
    } catch (error) {
      console.error("Error classifying asset:", error);
      res.status(500).json({ message: "Failed to classify asset" });
    }
  });

  // POST /api/semantic-clusters/classify-all - Classify all assets (admin)
  app.post('/api/semantic-clusters/classify-all', isAuthenticated, async (req: any, res) => {
    try {
      const { semanticClusterService } = await import('./services/opportunity/semanticClusterService');
      const result = await semanticClusterService.classifyAllAssets();
      
      res.json({
        success: true,
        updated: result.updated,
        errors: result.errors
      });
    } catch (error) {
      console.error("Error classifying all assets:", error);
      res.status(500).json({ message: "Failed to classify assets" });
    }
  });

  // GET /api/semantic-clusters/distribution - Get cluster distribution
  app.get('/api/semantic-clusters/distribution', isAuthenticated, async (req: any, res) => {
    try {
      const { semanticClusterService } = await import('./services/opportunity/semanticClusterService');
      const distribution = await semanticClusterService.getClusterDistribution();
      
      res.json({
        total_clusters: Object.keys(distribution).length,
        distribution
      });
    } catch (error) {
      console.error("Error fetching distribution:", error);
      res.status(500).json({ message: "Failed to fetch distribution" });
    }
  });

  // GET /api/semantic-clusters/:clusterId/assets - Get assets in cluster
  app.get('/api/semantic-clusters/:clusterId/assets', isAuthenticated, async (req: any, res) => {
    try {
      const clusterId = parseInt(req.params.clusterId);
      
      if (isNaN(clusterId) || clusterId < 1 || clusterId > 10) {
        return res.status(400).json({ message: "clusterId must be 1-10" });
      }
      
      const { semanticClusterService } = await import('./services/opportunity/semanticClusterService');
      const assets = await semanticClusterService.getClusterAssets(clusterId);
      const definition = semanticClusterService.getClusterDefinition(clusterId);
      
      res.json({
        cluster_id: clusterId,
        cluster_name: definition?.name || 'UNKNOWN',
        description: definition?.description || '',
        asset_count: assets.length,
        assets
      });
    } catch (error) {
      console.error("Error fetching cluster assets:", error);
      res.status(500).json({ message: "Failed to fetch cluster assets" });
    }
  });

  // =============================================================================
  // OPPORTUNITY ENGINE API - V2 Window Detection & COS
  // =============================================================================

  // GET /api/opportunity/windows - Get active opportunity windows
  app.get('/api/opportunity/windows', isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngineService } = await import('./services/opportunity/opportunityEngineService');
      const windows = await opportunityEngineService.detectOpportunityWindows();
      
      res.json({
        count: windows.length,
        windows
      });
    } catch (error) {
      console.error("Error fetching opportunity windows:", error);
      res.status(500).json({ message: "Failed to fetch windows" });
    }
  });

  // GET /api/opportunity/windows/profile/:profile - Get windows for profile
  app.get('/api/opportunity/windows/profile/:profile', isAuthenticated, async (req: any, res) => {
    try {
      const profile = req.params.profile.toUpperCase() as 'C' | 'M' | 'A' | 'SA' | 'FULL';
      
      if (!['C', 'M', 'A', 'SA', 'FULL'].includes(profile)) {
        return res.status(400).json({ message: "Invalid profile" });
      }
      
      const { opportunityEngineService } = await import('./services/opportunity/opportunityEngineService');
      const windows = await opportunityEngineService.getActiveWindowsForProfile(profile);
      
      res.json({
        profile,
        count: windows.length,
        windows
      });
    } catch (error) {
      console.error("Error fetching profile windows:", error);
      res.status(500).json({ message: "Failed to fetch profile windows" });
    }
  });

  // GET /api/opportunity/top - Get top opportunities
  app.get('/api/opportunity/top', isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      
      const { opportunityEngineService } = await import('./services/opportunity/opportunityEngineService');
      const windows = await opportunityEngineService.getTopOpportunities(limit);
      
      res.json({
        count: windows.length,
        opportunities: windows
      });
    } catch (error) {
      console.error("Error fetching top opportunities:", error);
      res.status(500).json({ message: "Failed to fetch top opportunities" });
    }
  });

  // GET /api/opportunity/cos - Get all Cluster Opportunity Scores
  app.get('/api/opportunity/cos', isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngineService } = await import('./services/opportunity/opportunityEngineService');
      const cosScores = await opportunityEngineService.calculateAllCOS();
      
      res.json({
        count: cosScores.length,
        clusters: cosScores
      });
    } catch (error) {
      console.error("Error calculating COS:", error);
      res.status(500).json({ message: "Failed to calculate COS" });
    }
  });

  // GET /api/opportunity/cos/:clusterId - Get COS for specific cluster
  app.get('/api/opportunity/cos/:clusterId', isAuthenticated, async (req: any, res) => {
    try {
      const clusterId = parseInt(req.params.clusterId);
      
      if (isNaN(clusterId) || clusterId < 1 || clusterId > 10) {
        return res.status(400).json({ message: "clusterId must be 1-10" });
      }
      
      const { opportunityEngineService } = await import('./services/opportunity/opportunityEngineService');
      const cos = await opportunityEngineService.calculateClusterCOS(clusterId);
      
      if (!cos) {
        return res.status(404).json({ message: `No COS data for cluster ${clusterId}` });
      }
      
      res.json(cos);
    } catch (error) {
      console.error("Error calculating cluster COS:", error);
      res.status(500).json({ message: "Failed to calculate cluster COS" });
    }
  });

  // GET /api/opportunity/ranking - Get cluster ranking by COS
  app.get('/api/opportunity/ranking', isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngineService } = await import('./services/opportunity/opportunityEngineService');
      const ranking = await opportunityEngineService.getClusterRanking();
      
      res.json({
        ranking: ranking.map((cos, index) => ({
          rank: index + 1,
          ...cos
        }))
      });
    } catch (error) {
      console.error("Error fetching cluster ranking:", error);
      res.status(500).json({ message: "Failed to fetch ranking" });
    }
  });

  // POST /api/opportunity/invalidate - Invalidate opportunity cache
  app.post('/api/opportunity/invalidate', isAuthenticated, async (req: any, res) => {
    try {
      const { opportunityEngineService } = await import('./services/opportunity/opportunityEngineService');
      await opportunityEngineService.invalidateCache();
      
      res.json({ success: true, message: 'Opportunity cache invalidated' });
    } catch (error) {
      console.error("Error invalidating opportunity cache:", error);
      res.status(500).json({ message: "Failed to invalidate cache" });
    }
  });

  // =============================================================================
  // BASKETS 10×10 ROUTES
  // =============================================================================

  // GET /api/baskets/10x10 - Get full basket with 100 assets (10 per cluster)
  app.get('/api/baskets/10x10', isAuthenticated, async (req: any, res) => {
    try {
      const { basketsService } = await import('./services/opportunity/basketsService');
      const basket = await basketsService.generateBasket10x10();
      
      res.json({
        basket,
        summary: {
          total_assets: basket.total_assets,
          clusters_used: basket.metadata.clusters_used,
          diversification_score: basket.diversification_score,
          avg_correlation: basket.avg_correlation,
        }
      });
    } catch (error) {
      console.error("Error generating basket 10x10:", error);
      res.status(500).json({ message: "Failed to generate basket" });
    }
  });

  // GET /api/baskets/10x10/refresh - Force refresh basket
  app.get('/api/baskets/10x10/refresh', isAuthenticated, async (req: any, res) => {
    try {
      const { basketsService } = await import('./services/opportunity/basketsService');
      const basket = await basketsService.refreshBasket();
      
      res.json({
        basket,
        refreshed: true
      });
    } catch (error) {
      console.error("Error refreshing basket:", error);
      res.status(500).json({ message: "Failed to refresh basket" });
    }
  });

  // GET /api/baskets/10x10/summary - Get basket summary
  app.get('/api/baskets/10x10/summary', isAuthenticated, async (req: any, res) => {
    try {
      const { basketsService } = await import('./services/opportunity/basketsService');
      const summary = await basketsService.getBasketSummary();
      
      res.json(summary);
    } catch (error) {
      console.error("Error fetching basket summary:", error);
      res.status(500).json({ message: "Failed to fetch summary" });
    }
  });

  // GET /api/baskets/10x10/assets - Get all assets in basket
  app.get('/api/baskets/10x10/assets', isAuthenticated, async (req: any, res) => {
    try {
      const { basketsService } = await import('./services/opportunity/basketsService');
      const assets = await basketsService.getBasketAssets();
      
      res.json({
        count: assets.length,
        assets
      });
    } catch (error) {
      console.error("Error fetching basket assets:", error);
      res.status(500).json({ message: "Failed to fetch assets" });
    }
  });

  // GET /api/baskets/10x10/cluster/:clusterId - Get assets for specific cluster
  app.get('/api/baskets/10x10/cluster/:clusterId', isAuthenticated, async (req: any, res) => {
    try {
      const clusterId = parseInt(req.params.clusterId);
      if (isNaN(clusterId) || clusterId < 1 || clusterId > 10) {
        return res.status(400).json({ message: 'Invalid cluster ID (1-10)' });
      }
      
      const { basketsService } = await import('./services/opportunity/basketsService');
      const clusterBasket = await basketsService.getClusterBasket(clusterId);
      
      if (!clusterBasket) {
        return res.status(404).json({ message: 'Cluster basket not found' });
      }
      
      res.json(clusterBasket);
    } catch (error) {
      console.error("Error fetching cluster basket:", error);
      res.status(500).json({ message: "Failed to fetch cluster basket" });
    }
  });

  // GET /api/baskets/10x10/audit/:basketId - Get persisted audit trail by basket ID
  app.get('/api/baskets/10x10/audit/:basketId', isAuthenticated, async (req: any, res) => {
    try {
      const { basketId } = req.params;
      if (!basketId || typeof basketId !== 'string') {
        return res.status(400).json({ message: 'Invalid basket ID' });
      }
      
      const { basketsService } = await import('./services/opportunity/basketsService');
      const auditLog = await basketsService.getPersistedAuditTrail(basketId);
      
      if (!auditLog) {
        return res.status(404).json({ message: 'Audit trail not found for this basket' });
      }
      
      res.json({
        basket_id: auditLog.basket_id,
        generated_at: auditLog.generated_at,
        expires_at: auditLog.expires_at,
        generation_time_ms: auditLog.generation_time_ms,
        total_assets: auditLog.total_assets,
        clusters_used: auditLog.clusters_used,
        is_complete: auditLog.is_complete,
        correlation_method: auditLog.correlation_method,
        empirical_coverage_pct: auditLog.empirical_coverage_pct,
        avg_btc_correlation: parseFloat(auditLog.avg_btc_correlation),
        avg_intra_cluster_correlation: parseFloat(auditLog.avg_intra_cluster_correlation),
        assets_excluded_by_correlation: auditLog.assets_excluded_by_correlation,
        audit_hash: auditLog.audit_hash,
        correlation_matrix_snapshot: auditLog.correlation_matrix_snapshot,
        pairwise_correlations: auditLog.pairwise_correlations,
        exclusion_events: auditLog.exclusion_events,
        cluster_baskets: auditLog.cluster_baskets,
        cluster_deficits: auditLog.cluster_deficits,
      });
    } catch (error) {
      console.error("Error fetching audit trail:", error);
      res.status(500).json({ message: "Failed to fetch audit trail" });
    }
  });

  // GET /api/baskets/10x10/audit-logs - List recent basket audit logs
  app.get('/api/baskets/10x10/audit-logs', isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      
      const { basketsService } = await import('./services/opportunity/basketsService');
      const logs = await basketsService.listAuditLogs(Math.min(limit, 100));
      
      res.json({
        count: logs.length,
        logs: logs.map(log => ({
          basket_id: log.basket_id,
          generated_at: log.generated_at,
          total_assets: log.total_assets,
          is_complete: log.is_complete,
          correlation_method: log.correlation_method,
          empirical_coverage_pct: log.empirical_coverage_pct,
          audit_hash: log.audit_hash,
        }))
      });
    } catch (error) {
      console.error("Error listing audit logs:", error);
      res.status(500).json({ message: "Failed to list audit logs" });
    }
  });

  // ========== FRANCHISOR SETTINGS ROUTES ==========
  
  // GET /api/franchisor/settings - Get franchisor settings (franchisor only)
  app.get('/api/franchisor/settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const settings = await db.select().from(franchisor_settings).limit(1);
      
      if (settings.length === 0) {
        return res.json({
          exists: false,
          settings: null,
        });
      }
      
      res.json({
        exists: true,
        settings: settings[0],
      });
    } catch (error) {
      console.error("Error fetching franchisor settings:", error);
      res.status(500).json({ message: "Failed to fetch franchisor settings" });
    }
  });
  
  // PUT /api/franchisor/settings - Update franchisor settings (franchisor only)
  app.put('/api/franchisor/settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const existingSettings = await db.select().from(franchisor_settings).limit(1);
      
      const settingsData = {
        ...req.body,
        updated_at: new Date(),
        updated_by: userId,
        is_configured: true,
      };
      
      if (existingSettings.length === 0) {
        const [newSettings] = await db.insert(franchisor_settings).values(settingsData).returning();
        return res.json({
          success: true,
          settings: newSettings,
        });
      }
      
      const [updatedSettings] = await db
        .update(franchisor_settings)
        .set(settingsData)
        .where(eq(franchisor_settings.id, existingSettings[0].id))
        .returning();
      
      res.json({
        success: true,
        settings: updatedSettings,
      });
    } catch (error) {
      console.error("Error updating franchisor settings:", error);
      res.status(500).json({ message: "Failed to update franchisor settings" });
    }
  });

  // ========== EXTERNAL SERVICES CONTROL ROUTES (Franchisor Cost Control) ==========
  
  // GET /api/franchisor/external-services - List all external services and their status
  app.get('/api/franchisor/external-services', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { externalServiceToggleService } = await import('./services/externalServiceToggleService');
      const services = await externalServiceToggleService.getAllServices();
      
      res.json({ services });
    } catch (error) {
      console.error("Error fetching external services:", error);
      res.status(500).json({ message: "Failed to fetch external services" });
    }
  });

  // PUT /api/franchisor/external-services/:serviceKey - Toggle a specific external service
  app.put('/api/franchisor/external-services/:serviceKey', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { serviceKey } = req.params;
      const { enabled, reason } = req.body;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "enabled must be a boolean value" });
      }
      
      const { externalServiceToggleService } = await import('./services/externalServiceToggleService');
      const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      
      const result = await externalServiceToggleService.toggleService(
        serviceKey,
        enabled,
        userId,
        reason,
        ipAddress
      );
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      const updatedService = await externalServiceToggleService.getServiceByKey(serviceKey);
      
      res.json({ 
        success: true,
        service: updatedService 
      });
    } catch (error) {
      console.error("Error toggling external service:", error);
      res.status(500).json({ message: "Failed to toggle external service" });
    }
  });

  // GET /api/franchisor/external-services/audit-log - Get audit log of service changes
  app.get('/api/franchisor/external-services/audit-log', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { serviceKey, limit } = req.query;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { externalServiceToggleService } = await import('./services/externalServiceToggleService');
      const logs = await externalServiceToggleService.getAuditLog(
        serviceKey as any,
        parseInt(limit as string) || 50
      );
      
      res.json({ logs });
    } catch (error) {
      console.error("Error fetching audit log:", error);
      res.status(500).json({ message: "Failed to fetch audit log" });
    }
  });

  // GET /api/franchisor/external-services/status - Get simplified status of all services (for dashboard)
  app.get('/api/franchisor/external-services/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { externalServiceToggleService } = await import('./services/externalServiceToggleService');
      const status = await externalServiceToggleService.getServiceStatus();
      
      res.json({ status });
    } catch (error) {
      console.error("Error fetching service status:", error);
      res.status(500).json({ message: "Failed to fetch service status" });
    }
  });
  
  // ========== CONTRACT MANAGEMENT ROUTES ==========
  
  // GET /api/contracts/templates - List all contract templates (franchisor only)
  app.get('/api/contracts/templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const templates = await db
        .select()
        .from(contract_templates)
        .orderBy(contract_templates.type, contract_templates.name);
      
      res.json({ templates });
    } catch (error) {
      console.error("Error fetching contract templates:", error);
      res.status(500).json({ message: "Failed to fetch contract templates" });
    }
  });
  
  // POST /api/contracts/templates - Create a new contract template (franchisor only)
  app.post('/api/contracts/templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { name, code, type, content, version, requires_acceptance, is_mandatory, applies_to } = req.body;
      
      if (!name || !code || !type || !content || !applies_to) {
        return res.status(400).json({ message: "Name, code, type, content and applies_to are required" });
      }
      
      const [template] = await db.insert(contract_templates).values({
        name,
        code,
        type,
        content,
        version: version || '1.0',
        requires_acceptance: requires_acceptance !== false,
        is_mandatory: is_mandatory !== false,
        applies_to,
        is_active: true,
        created_by: userId,
        updated_by: userId,
      }).returning();
      
      res.status(201).json({ template });
    } catch (error) {
      console.error("Error creating contract template:", error);
      res.status(500).json({ message: "Failed to create contract template" });
    }
  });
  
  // GET /api/contracts/templates/:id - Get a single contract template
  app.get('/api/contracts/templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const templateId = req.params.id;
      
      const template = await db
        .select()
        .from(contract_templates)
        .where(eq(contract_templates.id, templateId))
        .limit(1);
      
      if (template.length === 0) {
        return res.status(404).json({ message: "Contract template not found" });
      }
      
      res.json({ template: template[0] });
    } catch (error) {
      console.error("Error fetching contract template:", error);
      res.status(500).json({ message: "Failed to fetch contract template" });
    }
  });
  
  // PUT /api/contracts/templates/:id - Update a contract template (franchisor only)
  app.put('/api/contracts/templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const templateId = req.params.id;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const existing = await db
        .select()
        .from(contract_templates)
        .where(eq(contract_templates.id, templateId))
        .limit(1);
      
      if (existing.length === 0) {
        return res.status(404).json({ message: "Contract template not found" });
      }
      
      const [updated] = await db
        .update(contract_templates)
        .set({
          ...req.body,
          updated_at: new Date(),
          updated_by: userId,
        })
        .where(eq(contract_templates.id, templateId))
        .returning();
      
      res.json({ template: updated });
    } catch (error) {
      console.error("Error updating contract template:", error);
      res.status(500).json({ message: "Failed to update contract template" });
    }
  });
  
  // DELETE /api/contracts/templates/:id - Delete a contract template (franchisor only)
  app.delete('/api/contracts/templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const templateId = req.params.id;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const hasAcceptances = await db
        .select()
        .from(contract_acceptances)
        .where(eq(contract_acceptances.template_id, templateId))
        .limit(1);
      
      if (hasAcceptances.length > 0) {
        return res.status(400).json({ 
          message: "Cannot delete template with existing acceptances. Deactivate it instead." 
        });
      }
      
      await db.delete(contract_templates).where(eq(contract_templates.id, templateId));
      
      res.json({ success: true, message: "Contract template deleted" });
    } catch (error) {
      console.error("Error deleting contract template:", error);
      res.status(500).json({ message: "Failed to delete contract template" });
    }
  });
  
  // GET /api/contracts/pending - Get pending contracts for current user to accept
  app.get('/api/contracts/pending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      let appliesTo = 'all';
      if (permissions.isMasterFranchise) {
        appliesTo = 'master_franchise';
      } else if (permissions.hasFranchise) {
        appliesTo = 'franchise';
      }
      
      const activeTemplates = await db
        .select()
        .from(contract_templates)
        .where(and(
          eq(contract_templates.is_active, true),
          eq(contract_templates.requires_acceptance, true),
          or(
            eq(contract_templates.applies_to, appliesTo),
            eq(contract_templates.applies_to, 'all')
          )
        ));
      
      const userAcceptances = await db
        .select()
        .from(contract_acceptances)
        .where(and(
          eq(contract_acceptances.user_id, userId),
          eq(contract_acceptances.is_valid, true)
        ));
      
      const acceptedMap = new Map(
        userAcceptances.map(a => [`${a.template_id}_${a.template_version}`, true])
      );
      
      const pendingContracts = activeTemplates.filter(
        t => !acceptedMap.has(`${t.id}_${t.version}`)
      );
      
      res.json({
        pendingCount: pendingContracts.length,
        contracts: pendingContracts.map(c => ({
          id: c.id,
          name: c.name,
          code: c.code,
          type: c.type,
          version: c.version,
          is_mandatory: c.is_mandatory,
        })),
      });
    } catch (error) {
      console.error("Error fetching pending contracts:", error);
      res.status(500).json({ message: "Failed to fetch pending contracts" });
    }
  });
  
  // POST /api/contracts/accept - Accept a contract
  app.post('/api/contracts/accept', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const { template_id, checkbox_text } = req.body;
      
      if (!template_id) {
        return res.status(400).json({ message: "Template ID is required" });
      }
      
      const template = await db
        .select()
        .from(contract_templates)
        .where(eq(contract_templates.id, template_id))
        .limit(1);
      
      if (template.length === 0) {
        return res.status(404).json({ message: "Contract template not found" });
      }
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      const existingAcceptance = await db
        .select()
        .from(contract_acceptances)
        .where(and(
          eq(contract_acceptances.user_id, userId),
          eq(contract_acceptances.template_id, template_id),
          eq(contract_acceptances.template_version, template[0].version)
        ))
        .limit(1);
      
      if (existingAcceptance.length > 0) {
        return res.status(400).json({ message: "Contract already accepted" });
      }
      
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      const [acceptance] = await db.insert(contract_acceptances).values({
        user_id: userId,
        franchise_id: permissions.franchiseId || null,
        template_id,
        template_version: template[0].version,
        template_code: template[0].code,
        ip_address: ipAddress,
        user_agent: userAgent,
        checkbox_text: checkbox_text || `I have read and accept ${template[0].name}`,
        is_valid: true,
      }).returning();
      
      res.status(201).json({
        success: true,
        acceptance: {
          id: acceptance.id,
          template_code: acceptance.template_code,
          accepted_at: acceptance.accepted_at,
        },
      });
    } catch (error) {
      console.error("Error accepting contract:", error);
      res.status(500).json({ message: "Failed to accept contract" });
    }
  });
  
  // GET /api/contracts/acceptances - Get acceptances for current user
  app.get('/api/contracts/acceptances', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const acceptances = await db
        .select({
          id: contract_acceptances.id,
          template_code: contract_acceptances.template_code,
          template_version: contract_acceptances.template_version,
          accepted_at: contract_acceptances.accepted_at,
          is_valid: contract_acceptances.is_valid,
          template_name: contract_templates.name,
          template_type: contract_templates.type,
        })
        .from(contract_acceptances)
        .leftJoin(contract_templates, eq(contract_acceptances.template_id, contract_templates.id))
        .where(eq(contract_acceptances.user_id, userId))
        .orderBy(contract_acceptances.accepted_at);
      
      res.json({ acceptances });
    } catch (error) {
      console.error("Error fetching contract acceptances:", error);
      res.status(500).json({ message: "Failed to fetch contract acceptances" });
    }
  });
  
  // GET /api/contracts/acceptances/all - Get all acceptances (franchisor only)
  app.get('/api/contracts/acceptances/all', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const acceptances = await db
        .select({
          id: contract_acceptances.id,
          user_id: contract_acceptances.user_id,
          franchise_id: contract_acceptances.franchise_id,
          template_code: contract_acceptances.template_code,
          template_version: contract_acceptances.template_version,
          accepted_at: contract_acceptances.accepted_at,
          ip_address: contract_acceptances.ip_address,
          is_valid: contract_acceptances.is_valid,
          template_name: contract_templates.name,
          template_type: contract_templates.type,
          user_email: users.email,
          user_name: users.firstName,
        })
        .from(contract_acceptances)
        .leftJoin(contract_templates, eq(contract_acceptances.template_id, contract_templates.id))
        .leftJoin(users, eq(contract_acceptances.user_id, users.id))
        .orderBy(contract_acceptances.accepted_at);
      
      res.json({ acceptances });
    } catch (error) {
      console.error("Error fetching all contract acceptances:", error);
      res.status(500).json({ message: "Failed to fetch contract acceptances" });
    }
  });

  // ========== TERRITORY MANAGEMENT ROUTES ==========
  
  // POST /api/territory/check - Check for territory conflicts
  app.post('/api/territory/check', isAuthenticated, async (req: any, res) => {
    try {
      const { country, state, city, region, exclude_franchise_id } = req.body;
      
      const { territoryConflictService } = await import('./services/territoryConflictService');
      const result = await territoryConflictService.checkTerritoryConflict(
        { country, state, city, region },
        exclude_franchise_id
      );
      
      res.json(result);
    } catch (error) {
      console.error("Error checking territory conflict:", error);
      res.status(500).json({ message: "Failed to check territory conflict" });
    }
  });
  
  // GET /api/territory/masters - Get master franchises in a territory
  app.get('/api/territory/masters', isAuthenticated, async (req: any, res) => {
    try {
      const { country, state, city } = req.query;
      
      const { territoryConflictService } = await import('./services/territoryConflictService');
      const masters = await territoryConflictService.getMasterFranchisesInTerritory({
        country: country as string,
        state: state as string,
        city: city as string,
      });
      
      res.json({ masters });
    } catch (error) {
      console.error("Error fetching master franchises:", error);
      res.status(500).json({ message: "Failed to fetch master franchises" });
    }
  });
  
  // GET /api/territory/sub-franchises/:masterId - Get sub-franchises for a master
  app.get('/api/territory/sub-franchises/:masterId', isAuthenticated, async (req: any, res) => {
    try {
      const masterId = req.params.masterId;
      
      const { territoryConflictService } = await import('./services/territoryConflictService');
      const subFranchises = await territoryConflictService.getSubFranchisesForMaster(masterId);
      
      res.json({ subFranchises });
    } catch (error) {
      console.error("Error fetching sub-franchises:", error);
      res.status(500).json({ message: "Failed to fetch sub-franchises" });
    }
  });
  
  // PUT /api/territory/assign/:franchiseId - Assign territory to a franchise
  app.put('/api/territory/assign/:franchiseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const franchiseId = req.params.franchiseId;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const { country, state, city, region, is_exclusive } = req.body;
      
      const { territoryConflictService } = await import('./services/territoryConflictService');
      const result = await territoryConflictService.assignTerritoryToFranchise(
        franchiseId,
        { country, state, city, region },
        is_exclusive || false
      );
      
      if (!result.success) {
        return res.status(400).json({ 
          message: result.error,
          conflicts: result.conflicts,
        });
      }
      
      res.json({ success: true, message: "Territory assigned successfully" });
    } catch (error) {
      console.error("Error assigning territory:", error);
      res.status(500).json({ message: "Failed to assign territory" });
    }
  });
  
  // GET /api/user/persona - Get current user persona for frontend routing
  // Apenas 3 personas: franchisor, master_franchise, franchise (que inclui traders)
  app.get('/api/user/persona', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      // Persona padrão é 'franchise' (não existe mais 'user' separado)
      // Franquia = Trader (mesma persona)
      let persona: 'franchisor' | 'master_franchise' | 'franchise' = 'franchise';
      
      if (permissions.isFranchisor) {
        persona = 'franchisor';
      } else if (permissions.isMasterFranchise) {
        persona = 'master_franchise';
      }
      // Caso contrário, permanece 'franchise' (padrão)
      
      res.json({
        persona,
        permissions,
      });
    } catch (error) {
      console.error("Error fetching user persona:", error);
      res.status(500).json({ message: "Failed to fetch user persona" });
    }
  });

  // GET /api/franchisor/network-stats - Get network statistics for franchisor dashboard
  app.get('/api/franchisor/network-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied - franchisor only" });
      }
      
      const allFranchises = await db.select().from(franchises);
      
      const total_franchises = allFranchises.length;
      const active_franchises = allFranchises.filter(f => f.status === 'active').length;
      const pending_onboarding = allFranchises.filter(f => 
        f.onboarding_status !== 'active' && f.onboarding_status !== 'rejected'
      ).length;
      const master_franchises = allFranchises.filter(f => f.is_master_franchise).length;
      
      const uniqueTerritories = new Set(
        allFranchises
          .filter(f => f.territory_country || f.territory_state)
          .map(f => `${f.territory_country}-${f.territory_state}-${f.territory_city}`)
      );
      
      const pendingContracts = allFranchises.filter(f => !f.contract_accepted).length;
      
      res.json({
        total_franchises,
        active_franchises,
        pending_onboarding,
        master_franchises,
        total_revenue: "0.00",
        pending_royalties: "0.00",
        territories_covered: uniqueTerritories.size,
        contracts_pending: pendingContracts,
      });
    } catch (error) {
      console.error("Error fetching network stats:", error);
      res.status(500).json({ message: "Failed to fetch network stats" });
    }
  });

  // POST /api/contracts/accept - Accept a contract (franchisee accepting contract)
  const contractAcceptSchema = z.object({
    template_id: z.string().min(1, "Template ID is required"),
    franchise_id: z.string().optional().nullable(),
    template_version: z.string().optional().default("1.0"),
  });
  
  app.post('/api/contracts/accept', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate input
      const validationResult = contractAcceptSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const { template_id, franchise_id, template_version } = validationResult.data;
      
      // Get client information for audit trail
      const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      const user_agent = req.headers['user-agent'] || 'unknown';
      
      // Check if already accepted
      const existingAcceptance = await db.select()
        .from(contract_acceptances)
        .where(
          and(
            eq(contract_acceptances.user_id, userId),
            eq(contract_acceptances.template_id, template_id)
          )
        )
        .limit(1);
      
      if (existingAcceptance.length > 0) {
        return res.status(400).json({ message: "Contract already accepted" });
      }
      
      // Create acceptance record
      const [acceptance] = await db.insert(contract_acceptances).values({
        user_id: userId,
        franchise_id: franchise_id || null,
        template_id,
        template_version: template_version || "1.0",
        accepted_at: new Date(),
        ip_address: String(ip_address),
        user_agent,
        acceptance_method: 'checkbox',
      }).returning();
      
      // If franchise_id provided, update franchise contract_accepted status
      if (franchise_id) {
        await db.update(franchises)
          .set({ contract_accepted: true })
          .where(eq(franchises.id, franchise_id));
      }
      
      res.json({ success: true, acceptance });
    } catch (error) {
      console.error("Error accepting contract:", error);
      res.status(500).json({ message: "Failed to accept contract" });
    }
  });

  // GET /api/contracts/pending/:franchiseId? - Get pending contracts for user/franchise
  app.get('/api/contracts/pending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const franchiseId = req.query.franchiseId;
      
      // Get all active templates
      const templates = await db.select()
        .from(contract_templates)
        .where(
          and(
            eq(contract_templates.is_active, true),
            eq(contract_templates.requires_acceptance, true)
          )
        );
      
      // Get user's accepted contracts
      const acceptedContracts = await db.select()
        .from(contract_acceptances)
        .where(eq(contract_acceptances.user_id, userId));
      
      const acceptedTemplateIds = new Set(acceptedContracts.map(a => a.template_id));
      
      // Filter to only pending (not yet accepted) contracts
      const pendingContracts = templates.filter(t => !acceptedTemplateIds.has(t.id));
      
      res.json(pendingContracts);
    } catch (error) {
      console.error("Error fetching pending contracts:", error);
      res.status(500).json({ message: "Failed to fetch pending contracts" });
    }
  });

  // ============================================================================
  // PERSONA AUTHENTICATION ROUTES - Separate login/register per persona
  // PostgreSQL-backed persistent sessions (survives server restarts)
  // ============================================================================

  // POST /api/auth/persona/login - Login for specific persona type
  app.post('/api/auth/persona/login', async (req, res) => {
    try {
      const { email, password, personaType } = req.body;
      
      if (!email || !password || !personaType) {
        return res.status(400).json({ message: "Email, password and persona type required" });
      }
      
      if (!['franchisor', 'master_franchise', 'franchise'].includes(personaType)) {
        return res.status(400).json({ message: "Invalid persona type" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const result = await personaAuthService.login(email, password, personaType);
      
      if (!result.success) {
        const errorMessages: Record<string, string> = {
          invalid_credentials: "Invalid email or password",
          account_locked: "Account temporarily locked due to failed attempts",
          account_not_activated: "Please activate your account first",
          internal_error: "An error occurred",
        };
        return res.status(401).json({ message: errorMessages[result.error!] || result.error });
      }
      
      // Create session token and store in PostgreSQL (persistent)
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      // Store session in PostgreSQL
      await db.insert(persona_sessions).values({
        session_token: sessionToken,
        credentials_id: result.credentials!.id,
        persona_type: result.credentials!.persona_type,
        email: result.credentials!.email,
        franchise_id: result.credentials!.franchise_id,
        expires_at: expiresAt,
        ip_address: req.ip || req.connection?.remoteAddress,
        user_agent: req.headers['user-agent'],
      });
      
      // Set session cookie
      res.cookie('persona_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
      
      res.json({
        success: true,
        persona: result.credentials!.persona_type,
        franchiseId: result.credentials!.franchise_id,
        sessionToken,
      });
    } catch (error) {
      console.error("Persona login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // POST /api/auth/persona/logout - Logout persona session
  app.post('/api/auth/persona/logout', async (req, res) => {
    try {
      const sessionToken = req.cookies.persona_session;
      if (sessionToken) {
        // Delete session from PostgreSQL
        await db.delete(persona_sessions).where(eq(persona_sessions.session_token, sessionToken));
      }
      res.clearCookie('persona_session');
      res.json({ success: true });
    } catch (error) {
      console.error("Persona logout error:", error);
      res.clearCookie('persona_session');
      res.json({ success: true });
    }
  });

  // GET /api/auth/persona/session - Check current persona session
  app.get('/api/auth/persona/session', async (req, res) => {
    try {
      const sessionToken = req.cookies.persona_session;
      
      if (!sessionToken) {
        return res.json({ authenticated: false });
      }
      
      // Look up session in PostgreSQL
      const [session] = await db.select()
        .from(persona_sessions)
        .where(eq(persona_sessions.session_token, sessionToken));
      
      if (!session) {
        res.clearCookie('persona_session');
        return res.json({ authenticated: false });
      }
      
      // Check if session expired
      if (new Date(session.expires_at) < new Date()) {
        await db.delete(persona_sessions).where(eq(persona_sessions.session_token, sessionToken));
        res.clearCookie('persona_session');
        return res.json({ authenticated: false });
      }
      
      // Update last accessed
      await db.update(persona_sessions)
        .set({ last_accessed_at: new Date() })
        .where(eq(persona_sessions.session_token, sessionToken));
      
      res.json({
        authenticated: true,
        personaType: session.persona_type,
        email: session.email,
        franchiseId: session.franchise_id,
      });
    } catch (error) {
      console.error("Session check error:", error);
      res.json({ authenticated: false });
    }
  });

  // POST /api/auth/persona/activate - Activate account with token and set password
  app.post('/api/auth/persona/activate', async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password required" });
      }
      
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const result = await personaAuthService.activateAccount(token, password);
      
      if (!result.success) {
        const errorMessages: Record<string, string> = {
          invalid_token: "Invalid or expired activation link",
          token_expired: "Activation link has expired",
          internal_error: "An error occurred",
        };
        return res.status(400).json({ message: errorMessages[result.error!] || result.error });
      }
      
      res.json({ success: true, message: "Account activated successfully" });
    } catch (error) {
      console.error("Activate account error:", error);
      res.status(500).json({ message: "Activation failed" });
    }
  });

  // POST /api/auth/persona/reset-password-request - Request password reset
  app.post('/api/auth/persona/reset-password-request', async (req, res) => {
    try {
      const { email, personaType } = req.body;
      
      if (!email || !personaType) {
        return res.status(400).json({ message: "Email and persona type required" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const result = await personaAuthService.requestPasswordReset(email, personaType);
      
      // Always return success to prevent email enumeration
      res.json({ success: true, message: "If the email exists, a reset link will be sent" });
    } catch (error) {
      console.error("Password reset request error:", error);
      res.status(500).json({ message: "Request failed" });
    }
  });

  // POST /api/auth/persona/reset-password - Reset password with token
  app.post('/api/auth/persona/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password required" });
      }
      
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const result = await personaAuthService.resetPassword(token, password);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error === "token_expired" ? "Reset link expired" : "Invalid reset link" });
      }
      
      res.json({ success: true, message: "Password reset successfully" });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Reset failed" });
    }
  });

  // ============================================================================
  // FRANCHISE LEADS ROUTES - Landing page registration and management
  // ============================================================================

  // GET /api/franchise-leads/plans - Get available franchise plans (public)
  app.get('/api/franchise-leads/plans', async (req, res) => {
    try {
      const { personaAuthService } = await import('./services/personaAuthService');
      const plans = await personaAuthService.getAvailablePlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // POST /api/franchise-leads/register - Register new franchise lead (public - landing page)
  app.post('/api/franchise-leads/register', async (req, res) => {
    try {
      const {
        planId, name, tradeName, documentType, documentNumber,
        secondaryDocument, birthDate, addressStreet, addressNumber,
        addressComplement, addressReference, addressNeighborhood,
        addressZip, addressCity, addressCountry, phone, whatsapp,
        email, documentsUrls
      } = req.body;
      
      if (!name || !documentType || !documentNumber || !email) {
        return res.status(400).json({ message: "Required fields missing" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const result = await personaAuthService.createLead({
        planId,
        name,
        tradeName,
        documentType,
        documentNumber,
        secondaryDocument,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        addressStreet,
        addressNumber,
        addressComplement,
        addressReference,
        addressNeighborhood,
        addressZip,
        addressCity,
        addressCountry,
        phone,
        whatsapp,
        email,
        documentsUrls,
        source: "landing_page",
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      if (!result.success) {
        return res.status(400).json({ message: result.error === "email_already_registered" ? "Email already registered" : result.error });
      }
      
      res.json({
        success: true,
        franchiseCode: result.franchiseCode,
        leadId: result.leadId,
        message: "Registration submitted successfully. Awaiting approval.",
      });
    } catch (error) {
      console.error("Lead registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // GET /api/franchise-leads - Get all leads (franchisor only)
  app.get('/api/franchise-leads', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const status = req.query.status as string | undefined;
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const leads = await personaAuthService.getLeads(status);
      
      res.json(leads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  // GET /api/franchise-leads/:id - Get lead details (franchisor only)
  app.get('/api/franchise-leads/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const lead = await personaAuthService.getLeadById(req.params.id);
      
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      res.json(lead);
    } catch (error) {
      console.error("Error fetching lead:", error);
      res.status(500).json({ message: "Failed to fetch lead" });
    }
  });

  // POST /api/franchise-leads/:id/approve - Approve a lead (franchisor only)
  app.post('/api/franchise-leads/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const result = await personaAuthService.approveLead(req.params.id, userId);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      // TODO: Send activation email with result.activationToken
      
      res.json({
        success: true,
        franchiseId: result.franchiseId,
        message: "Lead approved. Activation email will be sent.",
      });
    } catch (error) {
      console.error("Error approving lead:", error);
      res.status(500).json({ message: "Failed to approve lead" });
    }
  });

  // POST /api/franchise-leads/:id/reject - Reject a lead (franchisor only)
  app.post('/api/franchise-leads/:id/reject', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason required" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const result = await personaAuthService.rejectLead(req.params.id, userId, reason);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      // TODO: Send rejection email
      
      res.json({ success: true, message: "Lead rejected" });
    } catch (error) {
      console.error("Error rejecting lead:", error);
      res.status(500).json({ message: "Failed to reject lead" });
    }
  });

  // POST /api/franchise-leads/manual - Create franchise manually (franchisor only)
  app.post('/api/franchise-leads/manual', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      
      // Create lead first
      const leadResult = await personaAuthService.createLead({
        ...req.body,
        source: "manual",
      });
      
      if (!leadResult.success) {
        return res.status(400).json({ message: leadResult.error });
      }
      
      // Immediately approve
      const approveResult = await personaAuthService.approveLead(leadResult.leadId!, userId);
      
      if (!approveResult.success) {
        return res.status(400).json({ message: approveResult.error });
      }
      
      res.json({
        success: true,
        franchiseCode: leadResult.franchiseCode,
        franchiseId: approveResult.franchiseId,
        activationToken: approveResult.activationToken,
      });
    } catch (error) {
      console.error("Error creating franchise manually:", error);
      res.status(500).json({ message: "Failed to create franchise" });
    }
  });

  // ============================================================================
  // FRANCHISOR SETUP ROUTES - Initial admin creation
  // ============================================================================

  // GET /api/auth/franchisor/exists - Check if franchisor admin exists
  app.get('/api/auth/franchisor/exists', async (req, res) => {
    try {
      const { personaAuthService } = await import('./services/personaAuthService');
      const exists = await personaAuthService.franchisorExists();
      res.json({ exists });
    } catch (error) {
      console.error("Error checking franchisor:", error);
      res.status(500).json({ message: "Check failed" });
    }
  });

  // POST /api/auth/franchisor/setup - Create initial franchisor admin (one-time only)
  app.post('/api/auth/franchisor/setup', async (req, res) => {
    try {
      const { email, password, name, setupKey } = req.body;
      
      // Require a setup key from environment for security
      const expectedKey = process.env.FRANCHISOR_SETUP_KEY || 'DELFOS-SETUP-2024';
      if (setupKey !== expectedKey) {
        return res.status(403).json({ message: "Invalid setup key" });
      }
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }
      
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const result = await personaAuthService.createFranchisor(email, password, name || 'DELFOS Admin');
      
      if (!result.success) {
        if (result.error === 'franchisor_already_exists') {
          return res.status(400).json({ message: "Franchisor admin already exists" });
        }
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ 
        success: true, 
        message: "Franchisor admin created successfully. You can now login.",
      });
    } catch (error) {
      console.error("Franchisor setup error:", error);
      res.status(500).json({ message: "Setup failed" });
    }
  });

  // ============================================================================
  // MASTER FRANCHISE ROUTES - Regional franchise management
  // ============================================================================

  // POST /api/master-leads/register - Register as Master Franchise candidate (public)
  app.post('/api/master-leads/register', async (req, res) => {
    try {
      const { name, email, phone, territory, documentType, documentNumber, addressCity, addressCountry, notes } = req.body;
      
      if (!name || !email || !territory || !documentType || !documentNumber) {
        return res.status(400).json({ message: "Required fields missing" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const result = await personaAuthService.createMasterLead({
        name,
        email,
        phone,
        territory,
        documentType,
        documentNumber,
        addressCity,
        addressCountry,
        notes,
      });
      
      if (!result.success) {
        return res.status(400).json({ message: result.error === "email_already_registered" ? "Email already registered" : result.error });
      }
      
      res.json({
        success: true,
        masterCode: result.masterCode,
        message: "Master Franchise application submitted. Awaiting approval.",
      });
    } catch (error) {
      console.error("Master lead registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // GET /api/master-leads - Get all master leads (franchisor only)
  app.get('/api/master-leads', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const status = req.query.status as string | undefined;
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const leads = await personaAuthService.getMasterLeads(status);
      
      res.json(leads);
    } catch (error) {
      console.error("Error fetching master leads:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  // POST /api/master-leads/:id/approve - Approve a master lead (franchisor only)
  app.post('/api/master-leads/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      const { franchisePermissionService } = await import('./services/franchisePermissionService');
      const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
      
      if (!permissions.isFranchisor) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { territory } = req.body;
      if (!territory) {
        return res.status(400).json({ message: "Territory is required" });
      }
      
      const { personaAuthService } = await import('./services/personaAuthService');
      const result = await personaAuthService.approveMasterLead(req.params.id, userId, territory);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({
        success: true,
        franchiseId: result.franchiseId,
        message: "Master Franchise approved. Activation email will be sent.",
      });
    } catch (error) {
      console.error("Error approving master lead:", error);
      res.status(500).json({ message: "Failed to approve" });
    }
  });


  const httpServer = createServer(app);
  return httpServer;
}
