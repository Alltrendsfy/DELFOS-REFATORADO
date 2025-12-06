import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { db } from "./db";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { getChatCompletion, checkRateLimit, analyzeMarket, type MarketContext } from "./services/openaiService";
import { analyzeRankings, analyzeClusters, suggestTradingStrategy, analyzeRiskProfile, suggestCampaignRisk, type CampaignContext } from "./services/ai/aiAnalysisService";
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
  symbols
} from "@shared/schema";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";

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
      
      res.json({
        portfolio_value: portfolioValue.toFixed(2),
        daily_pnl: dailyPnL.toFixed(2),
        daily_pnl_percentage: dailyPnLPercentage.toFixed(2),
        unrealized_pnl: unrealizedPnL.toFixed(2),
        realized_pnl: realizedPnL.toFixed(2),
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
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
        return res.status(400).json({ 
          message: "Invalid portfolio data", 
          errors: validationResult.error.errors 
        });
      }

      const portfolio = await storage.createPortfolio(validationResult.data);
      res.json(portfolio);
    } catch (error) {
      console.error("Error creating portfolio:", error);
      res.status(500).json({ message: "Failed to create portfolio" });
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
      
      // Get latest symbol rankings from database with symbol names
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
        .orderBy(desc(symbol_rankings.created_at))
        .limit(filters?.target_assets_count || 30)
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
      // Convert ISO date strings to Date objects before validation
      const requestBody = {
        ...req.body,
        start_date: req.body.start_date ? new Date(req.body.start_date) : undefined,
        end_date: req.body.end_date ? new Date(req.body.end_date) : undefined,
      };
      
      // Validate request body with Zod
      const validationResult = insertCampaignSchema.safeParse(requestBody);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid campaign data", 
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

      const campaign = await storage.createCampaign(validationResult.data);
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

  // Campaigns - Start new campaign with automatic capital snapshot
  app.post('/api/campaigns/start', isAuthenticated, async (req: any, res) => {
    try {
      const { portfolio_id, name, initial_capital, risk_config, selection_config, duration_days, max_drawdown_percentage } = req.body;
      
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

  // Campaigns - Resume campaign
  app.post('/api/campaigns/:id/resume', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const { campaignManagerService } = await import('./services/trading/campaignManagerService');
      const campaign = await campaignManagerService.resumeCampaign(id);
      
      res.json(campaign);
    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('not paused')) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error resuming campaign:", error);
      res.status(500).json({ message: "Failed to resume campaign" });
    }
  });

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

  const httpServer = createServer(app);
  return httpServer;
}
