import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { db } from "./db";
import * as schema from "@shared/schema";
import type {
  User, UpsertUser,
  Portfolio, InsertPortfolio,
  Position, InsertPosition,
  Trade, InsertTrade,
  Alert, InsertAlert,
  RiskParameters, InsertRiskParameters,
  MarketDataCache, InsertMarketDataCache,
  NewsFeed, InsertNewsFeed,
  AIConversation, InsertAIConversation,
  PerformanceSnapshot, InsertPerformanceSnapshot,
  Order, InsertOrder,
  Bars1m, InsertBars1m,
  Bars1h, InsertBars1h,
  DecisionLog, InsertDecisionLog,
  StalenessLog, InsertStalenessLog,
  SlippageEstimate, InsertSlippageEstimate,
  AuditTrail, InsertAuditTrail,
  Campaign, InsertCampaign,
  Cluster, InsertCluster,
  Exchange, InsertExchange,
  Symbol, InsertSymbol,
  SymbolRanking, InsertSymbolRanking,
  AssetBreaker, InsertAssetBreaker,
  ClusterBreaker, InsertClusterBreaker,
  CircuitBreakerEvent, InsertCircuitBreakerEvent,
  FeesTables, InsertFeesTables,
  RebalanceLog, InsertRebalanceLog,
  BetaCode, InsertBetaCode,
  TaxProfile, InsertTaxProfile,
  TradeCost, InsertTradeCost,
  AuthorizedEmail, InsertAuthorizedEmail,
  ApiToken, InsertApiToken
} from "@shared/schema";

export interface IStorage {
  // Users (Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserKrakenCredentials(userId: string, apiKey: string | null, apiSecret: string | null): Promise<void>;
  updateUserBetaStatus(userId: string, isApproved: boolean, codeUsed: string | null): Promise<void>;
  
  // Beta Codes
  getBetaCodeByCode(code: string): Promise<BetaCode | undefined>;
  getAllBetaCodes(): Promise<BetaCode[]>;
  createBetaCode(code: InsertBetaCode): Promise<BetaCode>;
  useBetaCode(code: string): Promise<boolean>;
  deactivateBetaCode(code: string): Promise<boolean>;
  
  // Authorized Emails (Admin whitelist)
  getAuthorizedEmailByEmail(email: string): Promise<AuthorizedEmail | undefined>;
  getAllAuthorizedEmails(): Promise<AuthorizedEmail[]>;
  createAuthorizedEmail(email: InsertAuthorizedEmail): Promise<AuthorizedEmail>;
  updateAuthorizedEmail(id: string, updates: Partial<InsertAuthorizedEmail>): Promise<AuthorizedEmail | undefined>;
  deleteAuthorizedEmail(id: string): Promise<void>;
  isEmailAuthorized(email: string): Promise<boolean>;
  
  // Admin Operations
  setUserAdminStatus(userId: string, isAdmin: boolean): Promise<void>;
  getAllUsers(): Promise<User[]>;
  getUserStats(): Promise<{ total: number; beta_approved: number; admins: number }>;
  
  // Portfolios
  getPortfoliosByUserId(userId: string): Promise<Portfolio[]>;
  getPortfolio(id: string): Promise<Portfolio | undefined>;
  createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(id: string, updates: Partial<InsertPortfolio>): Promise<Portfolio | undefined>;
  deletePortfolio(id: string): Promise<void>;
  
  // Positions
  getPositionsByPortfolioId(portfolioId: string): Promise<Position[]>;
  getPosition(id: string): Promise<Position | undefined>;
  createPosition(position: InsertPosition): Promise<Position>;
  updatePosition(id: string, updates: Partial<InsertPosition>): Promise<Position | undefined>;
  closePosition(id: string): Promise<void>;
  
  // Trades
  getTradesByPortfolioId(portfolioId: string): Promise<Trade[]>;
  getTrade(id: string): Promise<Trade | undefined>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  getRecentTradesBySymbol(portfolioId: string, symbol: string, limit: number, offset?: number): Promise<Trade[]>;
  getTradesBySymbolSince(portfolioId: string, symbol: string, since: Date): Promise<Trade[]>;
  
  // Alerts
  getAlertsByUserId(userId: string): Promise<Alert[]>;
  getActiveAlerts(): Promise<Alert[]>;
  getAlert(id: string): Promise<Alert | undefined>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  updateAlert(id: string, updates: Partial<InsertAlert>): Promise<Alert | undefined>;
  deleteAlert(id: string): Promise<void>;
  triggerAlert(id: string): Promise<void>;
  
  // Risk Parameters
  getRiskParametersByPortfolioId(portfolioId: string): Promise<RiskParameters | undefined>;
  createRiskParameters(params: InsertRiskParameters): Promise<RiskParameters>;
  updateRiskParameters(portfolioId: string, updates: Partial<InsertRiskParameters>): Promise<RiskParameters | undefined>;
  
  // Market Data Cache
  getMarketDataBySymbol(symbol: string): Promise<MarketDataCache | undefined>;
  getAllMarketData(): Promise<MarketDataCache[]>;
  upsertMarketData(data: InsertMarketDataCache): Promise<MarketDataCache>;
  
  // News Feed
  getNewsFeed(limit?: number): Promise<NewsFeed[]>;
  createNewsFeedItem(item: InsertNewsFeed): Promise<NewsFeed>;
  
  // AI Conversations
  getConversationsByUserId(userId: string, limit?: number): Promise<AIConversation[]>;
  createConversation(conversation: InsertAIConversation): Promise<AIConversation>;
  
  // Performance Snapshots
  getSnapshotsByPortfolioId(portfolioId: string, limit?: number): Promise<PerformanceSnapshot[]>;
  createSnapshot(snapshot: InsertPerformanceSnapshot): Promise<PerformanceSnapshot>;
  getLatestSnapshot(portfolioId: string): Promise<PerformanceSnapshot | undefined>;
  
  // Orders
  getOrder(id: string): Promise<Order | undefined>;
  getOrdersByPortfolioId(portfolioId: string): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: string, status: string, filledQuantity?: string, averageFillPrice?: string): Promise<Order>;
  
  // Bars (Time-Series Data)
  insertBars1m(bars: InsertBars1m | InsertBars1m[]): Promise<Bars1m[]>;
  getBars1m(exchange: string, symbol: string, startTime: Date, endTime: Date, limit?: number): Promise<Bars1m[]>;
  insertBars1h(bars: InsertBars1h | InsertBars1h[]): Promise<Bars1h[]>;
  getBars1h(exchange: string, symbol: string, startTime: Date, endTime: Date, limit?: number): Promise<Bars1h[]>;
  
  // Decision Log
  createDecisionLog(log: InsertDecisionLog): Promise<DecisionLog>;
  getDecisionLogsByPortfolio(portfolioId: string, limit?: number): Promise<DecisionLog[]>;
  
  // Staleness Log
  createStalenessLog(log: InsertStalenessLog): Promise<StalenessLog>;
  getRecentStalenessLogs(hours?: number): Promise<StalenessLog[]>;
  
  // Slippage Estimates
  upsertSlippageEstimate(estimate: InsertSlippageEstimate): Promise<SlippageEstimate>;
  getSlippageEstimate(symbol: string): Promise<SlippageEstimate | undefined>;
  
  // Audit Trail
  createAuditLog(log: InsertAuditTrail): Promise<AuditTrail>;
  getAuditTrailByUser(userId: string, limit?: number): Promise<AuditTrail[]>;
  
  // Campaigns
  getCampaignsByPortfolio(portfolioId: string): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaignEquity(id: string, currentEquity: string): Promise<Campaign>;
  completeCampaign(id: string): Promise<Campaign>;
  
  // Clusters
  getClustersByCampaign(campaignId: string): Promise<Cluster[]>;
  createCluster(cluster: InsertCluster): Promise<Cluster>;
  updateClusterPnL(id: string, dailyPnl: string): Promise<Cluster>;
  
  // Exchanges
  getAllExchanges(): Promise<Exchange[]>;
  getExchange(id: string): Promise<Exchange | undefined>;
  createExchange(exchange: InsertExchange): Promise<Exchange>;
  
  // Symbols
  getAllSymbols(): Promise<Symbol[]>;
  getSymbol(id: string): Promise<Symbol | undefined>;
  getSymbolByName(symbol: string, exchangeId: string): Promise<Symbol | undefined>;
  createSymbol(symbol: InsertSymbol): Promise<Symbol>;
  updateSymbolMetrics(id: string, metrics: Partial<InsertSymbol>): Promise<Symbol>;
  
  // Symbol Rankings
  getRankingsByRunId(runId: string): Promise<SymbolRanking[]>;
  createRanking(ranking: InsertSymbolRanking): Promise<SymbolRanking>;
  getTopRankings(runId: string, limit: number): Promise<any[]>; // Returns rankings with joined symbol data
  getLatestRunId(): Promise<string | null>; // Get most recent run_id
  updateRankingCluster(runId: string, symbolId: string, clusterNumber: number): Promise<void>;
  getClusterNumberForSymbol(symbol: string): Promise<number | null>;
  
  // Circuit Breakers - Asset Level
  getAssetBreaker(portfolioId: string, symbol: string): Promise<AssetBreaker | undefined>;
  getAssetBreakersByPortfolioId(portfolioId: string): Promise<AssetBreaker[]>;
  createAssetBreaker(breaker: InsertAssetBreaker): Promise<AssetBreaker>;
  updateAssetBreaker(id: string, updates: Partial<InsertAssetBreaker>): Promise<AssetBreaker | undefined>;
  getAssetBreakersForAutoReset(before: Date): Promise<AssetBreaker[]>;
  
  // Circuit Breakers - Cluster Level
  getClusterBreaker(portfolioId: string, clusterNumber: number): Promise<ClusterBreaker | undefined>;
  getClusterBreakersByPortfolioId(portfolioId: string): Promise<ClusterBreaker[]>;
  createClusterBreaker(breaker: InsertClusterBreaker): Promise<ClusterBreaker>;
  updateClusterBreaker(id: string, updates: Partial<InsertClusterBreaker>): Promise<ClusterBreaker | undefined>;
  getClusterBreakersForAutoReset(before: Date): Promise<ClusterBreaker[]>;
  
  // Circuit Breaker Events
  createCircuitBreakerEvent(event: InsertCircuitBreakerEvent): Promise<CircuitBreakerEvent>;
  getCircuitBreakerEventsByPortfolio(portfolioId: string, limit?: number): Promise<CircuitBreakerEvent[]>;
  
  // Symbol Rankings & Clusters
  getSymbolsInCluster(clusterNumber: number): Promise<string[]>;
  getClusterNumberForSymbol(symbol: string): Promise<number | null>;
  
  // Fees Tables
  getFeesByExchangeAndSymbol(exchangeId: string, symbol: string | null): Promise<FeesTables | undefined>;
  upsertFee(fee: InsertFeesTables): Promise<FeesTables>;
  
  // Rebalance Logs
  createRebalanceLog(log: InsertRebalanceLog): Promise<RebalanceLog>;
  getRebalanceLogsByCampaignId(campaignId: string, limit?: number): Promise<RebalanceLog[]>;
  getRebalanceLogsByPortfolioId(portfolioId: string, limit?: number): Promise<RebalanceLog[]>;
  
  // Tax Profiles
  getActiveTaxProfile(userId: string, taxYear: number): Promise<TaxProfile | null>;
  getTaxProfilesByUserId(userId: string): Promise<TaxProfile[]>;
  createTaxProfile(profile: InsertTaxProfile): Promise<TaxProfile>;
  deactivateTaxProfiles(userId: string, taxYear: number): Promise<void>;
  
  // Trade Costs
  createTradeCost(cost: InsertTradeCost): Promise<TradeCost>;
  getTradeCostsByPortfolio(portfolioId: string, startDate?: Date, endDate?: Date): Promise<TradeCost[]>;
  getTradeCostByTradeId(tradeId: string): Promise<TradeCost | undefined>;
  
  // API Tokens (for external agents)
  getApiTokenByHash(tokenHash: string): Promise<ApiToken | undefined>;
  getAllApiTokens(): Promise<ApiToken[]>;
  createApiToken(token: InsertApiToken): Promise<ApiToken>;
  updateApiTokenLastUsed(id: string): Promise<void>;
  deactivateApiToken(id: string): Promise<void>;
  deleteApiToken(id: string): Promise<void>;
}

export class DbStorage implements IStorage {
  // ===== USERS (Replit Auth) =====
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.getUser(id);
  }

  async updateUserKrakenCredentials(userId: string, apiKey: string | null, apiSecret: string | null): Promise<void> {
    await db
      .update(schema.users)
      .set({
        kraken_api_key: apiKey,
        kraken_api_secret: apiSecret,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(schema.users)
      .values(userData)
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserBetaStatus(userId: string, isApproved: boolean, codeUsed: string | null): Promise<void> {
    await db
      .update(schema.users)
      .set({
        is_beta_approved: isApproved,
        beta_code_used: codeUsed,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));
  }

  // ===== BETA CODES =====
  async getBetaCodeByCode(code: string): Promise<BetaCode | undefined> {
    const [betaCode] = await db.select().from(schema.betaCodes).where(eq(schema.betaCodes.code, code));
    return betaCode;
  }

  async getAllBetaCodes(): Promise<BetaCode[]> {
    return await db.select().from(schema.betaCodes).orderBy(desc(schema.betaCodes.created_at));
  }

  async createBetaCode(insertCode: InsertBetaCode): Promise<BetaCode> {
    const [code] = await db.insert(schema.betaCodes).values(insertCode).returning();
    return code;
  }

  async useBetaCode(code: string): Promise<boolean> {
    const betaCode = await this.getBetaCodeByCode(code);
    if (!betaCode) return false;
    if (!betaCode.is_active) return false;
    if (betaCode.current_uses >= betaCode.max_uses) return false;
    if (betaCode.expires_at && new Date() > betaCode.expires_at) return false;
    
    await db
      .update(schema.betaCodes)
      .set({ current_uses: betaCode.current_uses + 1 })
      .where(eq(schema.betaCodes.code, code));
    return true;
  }

  async deactivateBetaCode(code: string): Promise<boolean> {
    const result = await db
      .update(schema.betaCodes)
      .set({ is_active: false })
      .where(eq(schema.betaCodes.code, code))
      .returning();
    return result.length > 0;
  }

  // ===== AUTHORIZED EMAILS =====
  async getAuthorizedEmailByEmail(email: string): Promise<AuthorizedEmail | undefined> {
    const [authorized] = await db.select().from(schema.authorizedEmails)
      .where(eq(schema.authorizedEmails.email, email.toLowerCase()))
      .limit(1);
    return authorized;
  }

  async getAllAuthorizedEmails(): Promise<AuthorizedEmail[]> {
    return await db.select().from(schema.authorizedEmails)
      .orderBy(desc(schema.authorizedEmails.created_at));
  }

  async createAuthorizedEmail(insertEmail: InsertAuthorizedEmail): Promise<AuthorizedEmail> {
    const [authorized] = await db.insert(schema.authorizedEmails)
      .values({ ...insertEmail, email: insertEmail.email.toLowerCase() })
      .returning();
    return authorized;
  }

  async updateAuthorizedEmail(id: string, updates: Partial<InsertAuthorizedEmail>): Promise<AuthorizedEmail | undefined> {
    const [updated] = await db.update(schema.authorizedEmails)
      .set(updates)
      .where(eq(schema.authorizedEmails.id, id))
      .returning();
    return updated;
  }

  async deleteAuthorizedEmail(id: string): Promise<void> {
    await db.delete(schema.authorizedEmails).where(eq(schema.authorizedEmails.id, id));
  }

  async isEmailAuthorized(email: string): Promise<boolean> {
    const authorized = await this.getAuthorizedEmailByEmail(email.toLowerCase());
    return authorized !== undefined && authorized.is_active;
  }

  // ===== ADMIN OPERATIONS =====
  async setUserAdminStatus(userId: string, isAdmin: boolean): Promise<void> {
    await db.update(schema.users)
      .set({ is_admin: isAdmin, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
  }

  async getUserStats(): Promise<{ total: number; beta_approved: number; admins: number }> {
    const users = await this.getAllUsers();
    return {
      total: users.length,
      beta_approved: users.filter(u => u.is_beta_approved).length,
      admins: users.filter(u => u.is_admin).length
    };
  }

  // ===== PORTFOLIOS =====
  async getPortfoliosByUserId(userId: string): Promise<Portfolio[]> {
    return await db.select().from(schema.portfolios).where(eq(schema.portfolios.user_id, userId));
  }

  async getPortfolio(id: string): Promise<Portfolio | undefined> {
    const [portfolio] = await db.select().from(schema.portfolios).where(eq(schema.portfolios.id, id));
    return portfolio;
  }

  async createPortfolio(insertPortfolio: InsertPortfolio): Promise<Portfolio> {
    const [portfolio] = await db.insert(schema.portfolios).values(insertPortfolio).returning();
    return portfolio;
  }

  async updatePortfolio(id: string, updates: Partial<InsertPortfolio>): Promise<Portfolio | undefined> {
    const [portfolio] = await db.update(schema.portfolios)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(schema.portfolios.id, id))
      .returning();
    return portfolio;
  }

  async deletePortfolio(id: string): Promise<void> {
    await db.delete(schema.portfolios).where(eq(schema.portfolios.id, id));
  }

  // ===== POSITIONS =====
  async getPositionsByPortfolioId(portfolioId: string): Promise<Position[]> {
    return await db.select().from(schema.positions)
      .where(eq(schema.positions.portfolio_id, portfolioId))
      .orderBy(desc(schema.positions.opened_at));
  }

  async getPosition(id: string): Promise<Position | undefined> {
    const [position] = await db.select().from(schema.positions).where(eq(schema.positions.id, id));
    return position;
  }

  async createPosition(insertPosition: InsertPosition): Promise<Position> {
    const [position] = await db.insert(schema.positions).values(insertPosition).returning();
    return position;
  }

  async updatePosition(id: string, updates: Partial<InsertPosition>): Promise<Position | undefined> {
    const [position] = await db.update(schema.positions)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(schema.positions.id, id))
      .returning();
    return position;
  }

  async closePosition(id: string): Promise<void> {
    await db.delete(schema.positions).where(eq(schema.positions.id, id));
  }

  // ===== TRADES =====
  async getTradesByPortfolioId(portfolioId: string): Promise<Trade[]> {
    return await db.select().from(schema.trades)
      .where(eq(schema.trades.portfolio_id, portfolioId))
      .orderBy(desc(schema.trades.closed_at));
  }

  async getTrade(id: string): Promise<Trade | undefined> {
    const [trade] = await db.select().from(schema.trades).where(eq(schema.trades.id, id));
    return trade;
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    const [trade] = await db.insert(schema.trades).values(insertTrade).returning();
    return trade;
  }

  async getRecentTradesBySymbol(portfolioId: string, symbol: string, limit: number, offset: number = 0): Promise<Trade[]> {
    return await db.select().from(schema.trades)
      .where(
        and(
          eq(schema.trades.portfolio_id, portfolioId),
          eq(schema.trades.symbol, symbol)
        )
      )
      .orderBy(desc(schema.trades.closed_at))
      .limit(limit)
      .offset(offset);
  }

  async getTradesBySymbolSince(portfolioId: string, symbol: string, since: Date): Promise<Trade[]> {
    return await db.select().from(schema.trades)
      .where(
        and(
          eq(schema.trades.portfolio_id, portfolioId),
          eq(schema.trades.symbol, symbol),
          gte(schema.trades.closed_at, since)
        )
      )
      .orderBy(desc(schema.trades.closed_at));
  }

  // ===== ALERTS =====
  async getAlertsByUserId(userId: string): Promise<Alert[]> {
    return await db.select().from(schema.alerts)
      .where(eq(schema.alerts.user_id, userId))
      .orderBy(desc(schema.alerts.created_at));
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return await db.select().from(schema.alerts)
      .where(eq(schema.alerts.is_active, true));
  }

  async getAlert(id: string): Promise<Alert | undefined> {
    const [alert] = await db.select().from(schema.alerts).where(eq(schema.alerts.id, id));
    return alert;
  }

  async createAlert(insertAlert: InsertAlert): Promise<Alert> {
    const [alert] = await db.insert(schema.alerts).values(insertAlert).returning();
    return alert;
  }

  async updateAlert(id: string, updates: Partial<InsertAlert>): Promise<Alert | undefined> {
    const [alert] = await db.update(schema.alerts)
      .set(updates)
      .where(eq(schema.alerts.id, id))
      .returning();
    return alert;
  }

  async deleteAlert(id: string): Promise<void> {
    await db.delete(schema.alerts).where(eq(schema.alerts.id, id));
  }

  async triggerAlert(id: string): Promise<void> {
    await db.update(schema.alerts)
      .set({ is_active: false, triggered_at: new Date() })
      .where(eq(schema.alerts.id, id));
  }

  // ===== RISK PARAMETERS =====
  async getRiskParametersByPortfolioId(portfolioId: string): Promise<RiskParameters | undefined> {
    const [params] = await db.select().from(schema.risk_parameters)
      .where(eq(schema.risk_parameters.portfolio_id, portfolioId));
    return params;
  }

  async createRiskParameters(insertParams: InsertRiskParameters): Promise<RiskParameters> {
    const [params] = await db.insert(schema.risk_parameters).values(insertParams).returning();
    return params;
  }

  async updateRiskParameters(portfolioId: string, updates: Partial<InsertRiskParameters>): Promise<RiskParameters | undefined> {
    const [params] = await db.update(schema.risk_parameters)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(schema.risk_parameters.portfolio_id, portfolioId))
      .returning();
    return params;
  }

  // ===== MARKET DATA CACHE =====
  async getMarketDataBySymbol(symbol: string): Promise<MarketDataCache | undefined> {
    const [data] = await db.select().from(schema.market_data_cache)
      .where(eq(schema.market_data_cache.symbol, symbol));
    return data;
  }

  async getAllMarketData(): Promise<MarketDataCache[]> {
    return await db.select().from(schema.market_data_cache);
  }

  async upsertMarketData(insertData: InsertMarketDataCache): Promise<MarketDataCache> {
    const [data] = await db.insert(schema.market_data_cache)
      .values(insertData)
      .onConflictDoUpdate({
        target: schema.market_data_cache.symbol,
        set: { ...insertData, updated_at: new Date() }
      })
      .returning();
    return data;
  }

  // ===== NEWS FEED =====
  async getNewsFeed(limit: number = 50): Promise<NewsFeed[]> {
    return await db.select().from(schema.news_feed)
      .orderBy(desc(schema.news_feed.created_at))
      .limit(limit);
  }

  async createNewsFeedItem(insertItem: InsertNewsFeed): Promise<NewsFeed> {
    const [item] = await db.insert(schema.news_feed)
      .values(insertItem)
      .onConflictDoNothing()
      .returning();
    return item;
  }

  // ===== AI CONVERSATIONS =====
  async getConversationsByUserId(userId: string, limit: number = 50): Promise<AIConversation[]> {
    return await db.select().from(schema.ai_conversations)
      .where(eq(schema.ai_conversations.user_id, userId))
      .orderBy(desc(schema.ai_conversations.created_at))
      .limit(limit);
  }

  async createConversation(insertConv: InsertAIConversation): Promise<AIConversation> {
    const [conversation] = await db.insert(schema.ai_conversations)
      .values(insertConv)
      .returning();
    return conversation;
  }

  // ===== PERFORMANCE SNAPSHOTS =====
  async getSnapshotsByPortfolioId(portfolioId: string, limit: number = 100): Promise<PerformanceSnapshot[]> {
    return await db.select().from(schema.performance_snapshots)
      .where(eq(schema.performance_snapshots.portfolio_id, portfolioId))
      .orderBy(desc(schema.performance_snapshots.snapshot_at))
      .limit(limit);
  }

  async createSnapshot(insertSnapshot: InsertPerformanceSnapshot): Promise<PerformanceSnapshot> {
    const [snapshot] = await db.insert(schema.performance_snapshots)
      .values(insertSnapshot)
      .returning();
    return snapshot;
  }

  async getLatestSnapshot(portfolioId: string): Promise<PerformanceSnapshot | undefined> {
    const [snapshot] = await db.select().from(schema.performance_snapshots)
      .where(eq(schema.performance_snapshots.portfolio_id, portfolioId))
      .orderBy(desc(schema.performance_snapshots.snapshot_at))
      .limit(1);
    return snapshot;
  }

  // ===== ORDERS =====
  async getOrder(id: string): Promise<Order | undefined> {
    return await db.query.orders.findFirst({
      where: (orders, { eq }) => eq(orders.id, id),
    });
  }

  async getOrdersByPortfolioId(portfolioId: string): Promise<Order[]> {
    return await db.select().from(schema.orders)
      .where(eq(schema.orders.portfolio_id, portfolioId))
      .orderBy(desc(schema.orders.created_at));
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const [order] = await db.insert(schema.orders)
      .values(insertOrder)
      .returning();
    return order;
  }

  async updateOrderStatus(id: string, status: string, filledQuantity?: string, averageFillPrice?: string): Promise<Order> {
    const updates: any = { status, updated_at: new Date() };
    if (filledQuantity !== undefined) updates.filled_quantity = filledQuantity;
    if (averageFillPrice !== undefined) updates.average_fill_price = averageFillPrice;
    if (status === 'filled') updates.filled_at = new Date();
    
    const [updated] = await db.update(schema.orders)
      .set(updates)
      .where(eq(schema.orders.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Order with id ${id} not found`);
    }
    return updated;
  }

  // ===== BARS (TIME-SERIES DATA) =====
  async insertBars1m(input: InsertBars1m | InsertBars1m[]): Promise<Bars1m[]> {
    const barsArray = Array.isArray(input) ? input : [input];
    
    const inserted = await db.insert(schema.bars_1m)
      .values(barsArray)
      .onConflictDoUpdate({
        target: [schema.bars_1m.exchange, schema.bars_1m.symbol, schema.bars_1m.bar_ts],
        set: {
          open: sql.raw('EXCLUDED.open'),
          high: sql.raw('EXCLUDED.high'),
          low: sql.raw('EXCLUDED.low'),
          close: sql.raw('EXCLUDED.close'),
          volume: sql.raw('EXCLUDED.volume'),
          trades_count: sql.raw('EXCLUDED.trades_count'),
          vwap: sql.raw('EXCLUDED.vwap'),
          processing_ts: new Date()
        }
      })
      .returning();
    return inserted;
  }

  async getBars1m(exchange: string, symbol: string, startTime: Date, endTime: Date, limit: number = 1440): Promise<Bars1m[]> {
    return await db.select().from(schema.bars_1m)
      .where(and(
        eq(schema.bars_1m.exchange, exchange),
        eq(schema.bars_1m.symbol, symbol),
        sql`${schema.bars_1m.bar_ts} >= ${startTime}`,
        sql`${schema.bars_1m.bar_ts} <= ${endTime}`
      ))
      .orderBy(schema.bars_1m.bar_ts)
      .limit(limit);
  }

  async insertBars1h(input: InsertBars1h | InsertBars1h[]): Promise<Bars1h[]> {
    const barsArray = Array.isArray(input) ? input : [input];
    
    const inserted = await db.insert(schema.bars_1h)
      .values(barsArray)
      .onConflictDoUpdate({
        target: [schema.bars_1h.exchange, schema.bars_1h.symbol, schema.bars_1h.bar_ts],
        set: {
          open: sql.raw('EXCLUDED.open'),
          high: sql.raw('EXCLUDED.high'),
          low: sql.raw('EXCLUDED.low'),
          close: sql.raw('EXCLUDED.close'),
          volume: sql.raw('EXCLUDED.volume'),
          trades_count: sql.raw('EXCLUDED.trades_count'),
          vwap: sql.raw('EXCLUDED.vwap'),
          processing_ts: new Date()
        }
      })
      .returning();
    return inserted;
  }

  async getBars1h(exchange: string, symbol: string, startTime: Date, endTime: Date, limit: number = 720): Promise<Bars1h[]> {
    return await db.select().from(schema.bars_1h)
      .where(and(
        eq(schema.bars_1h.exchange, exchange),
        eq(schema.bars_1h.symbol, symbol),
        sql`${schema.bars_1h.bar_ts} >= ${startTime}`,
        sql`${schema.bars_1h.bar_ts} <= ${endTime}`
      ))
      .orderBy(schema.bars_1h.bar_ts)
      .limit(limit);
  }

  // ===== DECISION LOG =====
  async createDecisionLog(insertLog: InsertDecisionLog): Promise<DecisionLog> {
    const [log] = await db.insert(schema.decision_log)
      .values(insertLog)
      .returning();
    return log;
  }

  async getDecisionLogsByPortfolio(portfolioId: string, limit: number = 100): Promise<DecisionLog[]> {
    return await db.select().from(schema.decision_log)
      .where(eq(schema.decision_log.portfolio_id, portfolioId))
      .orderBy(desc(schema.decision_log.created_at))
      .limit(limit);
  }

  // ===== STALENESS LOG =====
  async createStalenessLog(insertLog: InsertStalenessLog): Promise<StalenessLog> {
    const [log] = await db.insert(schema.staleness_log)
      .values(insertLog)
      .returning();
    return log;
  }

  async getRecentStalenessLogs(hours: number = 24): Promise<StalenessLog[]> {
    const hoursAgo = new Date();
    hoursAgo.setHours(hoursAgo.getHours() - hours);
    
    return await db.select().from(schema.staleness_log)
      .where(sql`${schema.staleness_log.detected_at} >= ${hoursAgo}`)
      .orderBy(desc(schema.staleness_log.detected_at));
  }

  // ===== SLIPPAGE ESTIMATES =====
  async upsertSlippageEstimate(insertEstimate: InsertSlippageEstimate): Promise<SlippageEstimate> {
    const [estimate] = await db.insert(schema.slippage_estimates)
      .values(insertEstimate)
      .onConflictDoUpdate({
        target: schema.slippage_estimates.symbol,
        set: { ...insertEstimate, updated_at: new Date() }
      })
      .returning();
    return estimate;
  }

  async getSlippageEstimate(symbol: string): Promise<SlippageEstimate | undefined> {
    const [estimate] = await db.select().from(schema.slippage_estimates)
      .where(eq(schema.slippage_estimates.symbol, symbol));
    return estimate;
  }

  // ===== AUDIT TRAIL =====
  async createAuditLog(insertLog: InsertAuditTrail): Promise<AuditTrail> {
    const [log] = await db.insert(schema.audit_trail)
      .values(insertLog)
      .returning();
    return log;
  }

  async getAuditTrailByUser(userId: string, limit: number = 100): Promise<AuditTrail[]> {
    return await db.select().from(schema.audit_trail)
      .where(eq(schema.audit_trail.user_id, userId))
      .orderBy(desc(schema.audit_trail.created_at))
      .limit(limit);
  }

  // ===== CAMPAIGNS =====
  async getCampaignsByPortfolio(portfolioId: string): Promise<Campaign[]> {
    return await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.portfolio_id, portfolioId))
      .orderBy(desc(schema.campaigns.start_date));
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.id, id));
    return campaign;
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db.insert(schema.campaigns)
      .values(insertCampaign)
      .returning();
    return campaign;
  }

  async updateCampaignEquity(id: string, currentEquity: string): Promise<Campaign> {
    const [updated] = await db.update(schema.campaigns)
      .set({ current_equity: currentEquity })
      .where(eq(schema.campaigns.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Campaign with id ${id} not found`);
    }
    return updated;
  }

  async completeCampaign(id: string): Promise<Campaign> {
    const [updated] = await db.update(schema.campaigns)
      .set({ 
        status: 'completed',
        end_date: new Date()
      })
      .where(eq(schema.campaigns.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Campaign with id ${id} not found`);
    }
    return updated;
  }

  // ===== CLUSTERS =====
  async getClustersByCampaign(campaignId: string): Promise<Cluster[]> {
    return await db.select().from(schema.clusters)
      .where(eq(schema.clusters.campaign_id, campaignId));
  }

  async createCluster(insertCluster: InsertCluster): Promise<Cluster> {
    const [cluster] = await db.insert(schema.clusters)
      .values(insertCluster)
      .returning();
    return cluster;
  }

  async updateClusterPnL(id: string, dailyPnl: string): Promise<Cluster> {
    const [updated] = await db.update(schema.clusters)
      .set({ daily_pnl: dailyPnl })
      .where(eq(schema.clusters.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Cluster with id ${id} not found`);
    }
    return updated;
  }

  // ===== EXCHANGES =====
  async getAllExchanges(): Promise<Exchange[]> {
    return await db.select().from(schema.exchanges);
  }

  async getExchange(id: string): Promise<Exchange | undefined> {
    const [exchange] = await db.select().from(schema.exchanges).where(eq(schema.exchanges.id, id));
    return exchange;
  }

  async createExchange(exchange: InsertExchange): Promise<Exchange> {
    const [created] = await db.insert(schema.exchanges).values(exchange).returning();
    return created;
  }

  // ===== SYMBOLS =====
  async getAllSymbols(): Promise<Symbol[]> {
    return await db.select().from(schema.symbols);
  }

  async getSymbol(id: string): Promise<Symbol | undefined> {
    const [symbol] = await db.select().from(schema.symbols).where(eq(schema.symbols.id, id));
    return symbol;
  }

  async getSymbolByName(symbol: string, exchangeId: string): Promise<Symbol | undefined> {
    const [found] = await db.select().from(schema.symbols).where(
      and(eq(schema.symbols.symbol, symbol), eq(schema.symbols.exchange_id, exchangeId))
    );
    return found;
  }

  async createSymbol(insertSymbol: InsertSymbol): Promise<Symbol> {
    const [symbol] = await db.insert(schema.symbols).values(insertSymbol).returning();
    return symbol;
  }

  async updateSymbolMetrics(id: string, metrics: Partial<InsertSymbol>): Promise<Symbol> {
    const [symbol] = await db.update(schema.symbols)
      .set({ ...metrics, updated_at: new Date() })
      .where(eq(schema.symbols.id, id))
      .returning();
    
    if (!symbol) {
      throw new Error(`Symbol with id ${id} not found`);
    }
    return symbol;
  }

  // ===== SYMBOL RANKINGS =====
  async getRankingsByRunId(runId: string): Promise<SymbolRanking[]> {
    return await db.select().from(schema.symbol_rankings)
      .where(eq(schema.symbol_rankings.run_id, runId))
      .orderBy(schema.symbol_rankings.rank);
  }

  async createRanking(ranking: InsertSymbolRanking): Promise<SymbolRanking> {
    const [created] = await db.insert(schema.symbol_rankings).values(ranking).returning();
    return created;
  }

  async getTopRankings(runId: string, limit: number): Promise<any[]> {
    const results = await db
      .select({
        id: schema.symbol_rankings.id,
        run_id: schema.symbol_rankings.run_id,
        symbol_id: schema.symbol_rankings.symbol_id, // CRITICAL: needed for cluster analysis
        rank: schema.symbol_rankings.rank,
        score: schema.symbol_rankings.score,
        cluster_number: schema.symbol_rankings.cluster_number,
        created_at: schema.symbol_rankings.created_at,
        symbol: schema.symbols.symbol,
        exchange_symbol: schema.symbols.exchange_symbol,
        // Added for AI analysis - mapped to camelCase for convenience
        volume24hUsd: schema.symbols.volume_24h_usd,
        atrPct: schema.symbols.atr_daily_pct,
        spreadPct: schema.symbols.spread_mid_pct,
      })
      .from(schema.symbol_rankings)
      .leftJoin(schema.symbols, eq(schema.symbol_rankings.symbol_id, schema.symbols.id))
      .where(eq(schema.symbol_rankings.run_id, runId))
      .orderBy(schema.symbol_rankings.rank)
      .limit(limit);
    
    return results;
  }

  async getLatestRunId(): Promise<string | null> {
    const [result] = await db
      .select({ run_id: schema.symbol_rankings.run_id })
      .from(schema.symbol_rankings)
      .orderBy(desc(schema.symbol_rankings.created_at))
      .limit(1);
    
    return result?.run_id || null;
  }

  async updateRankingCluster(runId: string, symbolId: string, clusterNumber: number): Promise<void> {
    await db.update(schema.symbol_rankings)
      .set({ cluster_number: clusterNumber })
      .where(
        and(
          eq(schema.symbol_rankings.run_id, runId),
          eq(schema.symbol_rankings.symbol_id, symbolId)
        )
      );
  }

  async getClusterNumberForSymbol(symbol: string): Promise<number | null> {
    const latestRunId = await this.getLatestRunId();
    if (!latestRunId) return null;

    const symbolRecord = await db.select().from(schema.symbols)
      .where(eq(schema.symbols.symbol, symbol))
      .limit(1);
    
    if (symbolRecord.length === 0) return null;

    const [ranking] = await db.select()
      .from(schema.symbol_rankings)
      .where(
        and(
          eq(schema.symbol_rankings.run_id, latestRunId),
          eq(schema.symbol_rankings.symbol_id, symbolRecord[0].id)
        )
      )
      .limit(1);
    
    return ranking?.cluster_number || null;
  }

  async getSymbolsInCluster(clusterNumber: number): Promise<string[]> {
    const latestRunId = await this.getLatestRunId();
    if (!latestRunId) return [];

    const rankings = await db.select({
      symbol_id: schema.symbol_rankings.symbol_id,
    })
      .from(schema.symbol_rankings)
      .where(
        and(
          eq(schema.symbol_rankings.run_id, latestRunId),
          eq(schema.symbol_rankings.cluster_number, clusterNumber)
        )
      );

    const symbolIds = rankings.map(r => r.symbol_id);
    if (symbolIds.length === 0) return [];

    const symbols = await db.select({ symbol: schema.symbols.symbol })
      .from(schema.symbols)
      .where(
        sql`${schema.symbols.id} = ANY(${symbolIds})`
      );

    return symbols.map(s => s.symbol);
  }

  // ===== CIRCUIT BREAKERS - ASSET LEVEL =====
  async getAssetBreaker(portfolioId: string, symbol: string): Promise<schema.AssetBreaker | undefined> {
    const [breaker] = await db.select().from(schema.asset_breakers)
      .where(
        and(
          eq(schema.asset_breakers.portfolio_id, portfolioId),
          eq(schema.asset_breakers.symbol, symbol)
        )
      );
    return breaker;
  }

  async getAssetBreakersByPortfolioId(portfolioId: string): Promise<schema.AssetBreaker[]> {
    return await db.select().from(schema.asset_breakers)
      .where(eq(schema.asset_breakers.portfolio_id, portfolioId))
      .orderBy(desc(schema.asset_breakers.triggered_at));
  }

  async createAssetBreaker(breaker: schema.InsertAssetBreaker): Promise<schema.AssetBreaker> {
    const [created] = await db.insert(schema.asset_breakers).values(breaker).returning();
    return created;
  }

  async updateAssetBreaker(id: string, updates: Partial<schema.InsertAssetBreaker>): Promise<schema.AssetBreaker | undefined> {
    const [updated] = await db.update(schema.asset_breakers)
      .set(updates)
      .where(eq(schema.asset_breakers.id, id))
      .returning();
    return updated;
  }

  async getAssetBreakersForAutoReset(before: Date): Promise<schema.AssetBreaker[]> {
    return await db.select().from(schema.asset_breakers)
      .where(
        and(
          eq(schema.asset_breakers.is_triggered, true),
          lte(schema.asset_breakers.auto_reset_at, before)
        )
      );
  }

  // ===== CIRCUIT BREAKERS - CLUSTER LEVEL =====
  async getClusterBreaker(portfolioId: string, clusterNumber: number): Promise<schema.ClusterBreaker | undefined> {
    const [breaker] = await db.select().from(schema.cluster_breakers)
      .where(
        and(
          eq(schema.cluster_breakers.portfolio_id, portfolioId),
          eq(schema.cluster_breakers.cluster_number, clusterNumber)
        )
      );
    return breaker;
  }

  async getClusterBreakersByPortfolioId(portfolioId: string): Promise<schema.ClusterBreaker[]> {
    return await db.select().from(schema.cluster_breakers)
      .where(eq(schema.cluster_breakers.portfolio_id, portfolioId))
      .orderBy(desc(schema.cluster_breakers.triggered_at));
  }

  async createClusterBreaker(breaker: schema.InsertClusterBreaker): Promise<schema.ClusterBreaker> {
    const [created] = await db.insert(schema.cluster_breakers).values(breaker).returning();
    return created;
  }

  async updateClusterBreaker(id: string, updates: Partial<schema.InsertClusterBreaker>): Promise<schema.ClusterBreaker | undefined> {
    const [updated] = await db.update(schema.cluster_breakers)
      .set(updates)
      .where(eq(schema.cluster_breakers.id, id))
      .returning();
    return updated;
  }

  async getClusterBreakersForAutoReset(before: Date): Promise<schema.ClusterBreaker[]> {
    return await db.select().from(schema.cluster_breakers)
      .where(
        and(
          eq(schema.cluster_breakers.is_triggered, true),
          lte(schema.cluster_breakers.auto_reset_at, before)
        )
      );
  }

  // ===== CIRCUIT BREAKER EVENTS =====
  async createCircuitBreakerEvent(event: schema.InsertCircuitBreakerEvent): Promise<schema.CircuitBreakerEvent> {
    const [created] = await db.insert(schema.circuit_breaker_events).values(event).returning();
    return created;
  }

  async getCircuitBreakerEventsByPortfolio(portfolioId: string, limit: number = 50): Promise<schema.CircuitBreakerEvent[]> {
    return await db.select().from(schema.circuit_breaker_events)
      .where(eq(schema.circuit_breaker_events.portfolio_id, portfolioId))
      .orderBy(desc(schema.circuit_breaker_events.created_at))
      .limit(limit);
  }

  // ===== FEES TABLES =====
  async getFeesByExchangeAndSymbol(exchangeId: string, symbol: string | null): Promise<schema.FeesTables | undefined> {
    const [fee] = await db.select().from(schema.fees_tables)
      .where(
        and(
          eq(schema.fees_tables.exchange_id, exchangeId),
          symbol === null 
            ? sql`${schema.fees_tables.symbol} IS NULL`
            : eq(schema.fees_tables.symbol, symbol)
        )
      );
    return fee;
  }

  async upsertFee(fee: schema.InsertFeesTables): Promise<schema.FeesTables> {
    const [upserted] = await db
      .insert(schema.fees_tables)
      .values(fee)
      .onConflictDoUpdate({
        target: [schema.fees_tables.exchange_id, schema.fees_tables.symbol],
        set: {
          maker_fee_pct: fee.maker_fee_pct,
          taker_fee_pct: fee.taker_fee_pct,
          avg_slippage_pct: fee.avg_slippage_pct,
          updated_at: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  // ===== REBALANCE LOGS =====
  async createRebalanceLog(log: schema.InsertRebalanceLog): Promise<schema.RebalanceLog> {
    const [created] = await db.insert(schema.rebalance_logs).values(log).returning();
    return created;
  }

  async getRebalanceLogsByCampaignId(campaignId: string, limit: number = 50): Promise<schema.RebalanceLog[]> {
    return await db.select().from(schema.rebalance_logs)
      .where(eq(schema.rebalance_logs.campaign_id, campaignId))
      .orderBy(desc(schema.rebalance_logs.created_at))
      .limit(limit);
  }

  async getRebalanceLogsByPortfolioId(portfolioId: string, limit: number = 50): Promise<schema.RebalanceLog[]> {
    return await db.select().from(schema.rebalance_logs)
      .where(eq(schema.rebalance_logs.portfolio_id, portfolioId))
      .orderBy(desc(schema.rebalance_logs.created_at))
      .limit(limit);
  }

  // ===== TAX PROFILES =====
  async getActiveTaxProfile(userId: string, taxYear: number): Promise<schema.TaxProfile | null> {
    const [profile] = await db.select().from(schema.tax_profiles)
      .where(
        and(
          eq(schema.tax_profiles.user_id, userId),
          eq(schema.tax_profiles.tax_year, taxYear),
          eq(schema.tax_profiles.is_active, true)
        )
      )
      .limit(1);
    return profile || null;
  }

  async getTaxProfilesByUserId(userId: string): Promise<schema.TaxProfile[]> {
    return await db.select().from(schema.tax_profiles)
      .where(eq(schema.tax_profiles.user_id, userId))
      .orderBy(desc(schema.tax_profiles.tax_year), desc(schema.tax_profiles.created_at));
  }

  async createTaxProfile(profile: schema.InsertTaxProfile): Promise<schema.TaxProfile> {
    const [created] = await db.insert(schema.tax_profiles).values(profile).returning();
    return created;
  }

  async deactivateTaxProfiles(userId: string, taxYear: number): Promise<void> {
    await db.update(schema.tax_profiles)
      .set({ is_active: false, updated_at: new Date() })
      .where(
        and(
          eq(schema.tax_profiles.user_id, userId),
          eq(schema.tax_profiles.tax_year, taxYear)
        )
      );
  }

  // ===== TRADE COSTS =====
  async createTradeCost(cost: schema.InsertTradeCost): Promise<schema.TradeCost> {
    const [created] = await db.insert(schema.trade_costs).values(cost).returning();
    return created;
  }

  async getTradeCostsByPortfolio(portfolioId: string, startDate?: Date, endDate?: Date): Promise<schema.TradeCost[]> {
    if (startDate && endDate) {
      return await db.select().from(schema.trade_costs)
        .where(
          and(
            eq(schema.trade_costs.portfolio_id, portfolioId),
            gte(schema.trade_costs.created_at, startDate),
            lte(schema.trade_costs.created_at, endDate)
          )
        )
        .orderBy(desc(schema.trade_costs.created_at));
    }

    return await db.select().from(schema.trade_costs)
      .where(eq(schema.trade_costs.portfolio_id, portfolioId))
      .orderBy(desc(schema.trade_costs.created_at));
  }

  async getTradeCostByTradeId(tradeId: string): Promise<schema.TradeCost | undefined> {
    const [cost] = await db.select().from(schema.trade_costs)
      .where(eq(schema.trade_costs.trade_id, tradeId))
      .limit(1);
    return cost;
  }

  // ===== API TOKENS (External Agents) =====
  async getApiTokenByHash(tokenHash: string): Promise<ApiToken | undefined> {
    const [token] = await db.select().from(schema.apiTokens)
      .where(eq(schema.apiTokens.token_hash, tokenHash))
      .limit(1);
    return token;
  }

  async getAllApiTokens(): Promise<ApiToken[]> {
    return await db.select().from(schema.apiTokens)
      .orderBy(desc(schema.apiTokens.created_at));
  }

  async createApiToken(token: InsertApiToken): Promise<ApiToken> {
    const [created] = await db.insert(schema.apiTokens).values(token).returning();
    return created;
  }

  async updateApiTokenLastUsed(id: string): Promise<void> {
    await db.update(schema.apiTokens)
      .set({ last_used_at: new Date() })
      .where(eq(schema.apiTokens.id, id));
  }

  async deactivateApiToken(id: string): Promise<void> {
    await db.update(schema.apiTokens)
      .set({ is_active: false })
      .where(eq(schema.apiTokens.id, id));
  }

  async deleteApiToken(id: string): Promise<void> {
    await db.delete(schema.apiTokens)
      .where(eq(schema.apiTokens.id, id));
  }
}

export const storage = new DbStorage();
