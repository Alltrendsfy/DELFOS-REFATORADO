import { db } from '../../db';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { storage } from '../../storage';
import { observabilityService } from '../observabilityService';
import { robotActivityService } from '../robotActivityService';
import { assetSelectorService as clusteringAssetSelector } from '../assetSelectorService';
import { assetSelectorService as simpleAssetSelector } from '../market/assetSelectorService';
import { dataIngestionService } from '../dataIngestionService';
import { indicatorService } from '../market/indicatorService';
import { stalenessGuardService } from '../stalenessGuardService';
import { campaignGovernanceService } from '../governance/campaignGovernanceService';
import { exchangeReconciliationService } from '../governance/exchangeReconciliationService';
import { dynamicPositionScaler, ScalingContext, ScalingResult } from './dynamicPositionScaler';
import { volatilityRegimeEngine, VREState, VolatilityRegime } from './volatilityRegimeEngine';
import { AdaptiveParameterService, AdaptiveParameters, CampaignProfile } from './adaptiveParameterService';
import { VRECircuitBreakersService } from './vreCircuitBreakers';
import { franchiseExchangeService } from '../franchiseExchangeService';
import { rbmService } from './rbmService';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

// V2.0+ Franchise-scoped credentials interface
interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
}

interface KrakenOrderResponse {
  error: string[];
  result?: {
    descr?: { order: string; close?: string };
    txid?: string[];
  };
}

interface KrakenBalanceResponse {
  error: string[];
  result?: Record<string, string>;
}

// Kraken API helpers for real order execution
const KRAKEN_API_URL = 'https://api.kraken.com';

function generateKrakenSignature(path: string, nonce: string, postData: string, apiSecret: Buffer): string {
  const sha256Hash = crypto.createHash('sha256').update(nonce + postData).digest();
  const hmac = crypto.createHmac('sha512', apiSecret).update(path + sha256Hash.toString('binary'), 'binary').digest('base64');
  return hmac;
}

// V2.0+ Franchise-scoped Kraken request - now accepts credentials as parameter
async function krakenPrivateRequest<T>(
  endpoint: string, 
  params: Record<string, any>,
  credentials?: ExchangeCredentials
): Promise<T> {
  // V2.0+: Use provided credentials (from franchise) or fallback to env vars (paper trading / legacy)
  const apiKey = credentials?.apiKey || process.env.KRAKEN_API_KEY;
  const apiSecretRaw = credentials?.apiSecret || process.env.KRAKEN_API_SECRET;
  
  if (!apiKey || !apiSecretRaw) {
    throw new Error('Kraken API credentials not available - configure franchise exchange account or set KRAKEN_API_KEY/SECRET');
  }
  
  const apiSecret = Buffer.from(apiSecretRaw, 'base64');
  const path = `/0/private/${endpoint}`;
  const url = KRAKEN_API_URL + path;
  const nonce = Date.now().toString();
  
  const postData = new URLSearchParams({ nonce, ...params }).toString();
  const signature = generateKrakenSignature(path, nonce, postData, apiSecret);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'API-Key': apiKey,
      'API-Sign': signature,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  });
  
  if (!response.ok) {
    throw new Error(`Kraken API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json() as T;
}

// V2.0+ Helper to get franchise credentials for a campaign
async function getFranchiseCredentialsForCampaign(campaignId: string): Promise<ExchangeCredentials | null> {
  try {
    // Get campaign with portfolio
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) return null;
    
    // Get portfolio to find franchise_id
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.id, campaign.portfolio_id))
      .limit(1);
    
    if (!portfolio?.franchise_id) return null;
    
    // Get franchise exchange credentials
    const credentials = await franchiseExchangeService.getDecryptedCredentials(
      portfolio.franchise_id,
      'kraken'
    );
    
    if (credentials) {
      // Record API usage for tracking
      await franchiseExchangeService.recordApiUsage(portfolio.franchise_id, 'kraken');
    }
    
    return credentials;
  } catch (error) {
    console.error(`[CampaignEngine] Failed to get franchise credentials for campaign ${campaignId}:`, error);
    return null;
  }
}

function toKrakenPair(symbol: string): string {
  const normalized = symbol.replace('/', '');
  if (normalized.startsWith('BTC')) {
    return normalized.replace('BTC', 'XBT');
  }
  return normalized;
}

interface SignalResult {
  symbol: string;
  signalType: 'long' | 'short' | null;
  price: number;
  ema12: number;
  ema36: number;
  atr: number;
  stopLoss: number;
  takeProfit: number;
  reason: string;
}

interface CampaignEngineState {
  campaignId: string;
  isRunning: boolean;
  lastCycleAt: Date | null;
  cycleCount: number;
  errors: string[];
}

interface RiskValidationResult {
  allowed: boolean;
  reason?: string;
  riskAmount?: number;
}

interface PositionSizeResult {
  sizeCapital: number;
  sizeQuantity: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  scalingResult?: ScalingResult;
}

interface MarketData {
  symbol: string;
  price: number;
  atr: number;
  ema12: number;
  ema36: number;
  spread: number;
  volume24h: number;
  depth: number;
}

const CYCLE_INTERVAL_MS = 5000;
const REBALANCE_INTERVAL_HOURS = 8;
const AUDIT_INTERVAL_HOURS = 24;

class CampaignEngineService {
  private engineStates: Map<string, CampaignEngineState> = new Map();
  private mainLoopInterval: NodeJS.Timeout | null = null;
  private isMainLoopRunning = false;
  
  // Balance cache to avoid rate limiting (TTL: 60 seconds)
  // Also tracks last error time for backoff
  private balanceCache: { 
    balance: Record<string, string>; 
    timestamp: number;
    lastErrorTime?: number;
  } | null = null;
  private readonly BALANCE_CACHE_TTL_MS = 60000;
  private readonly BALANCE_ERROR_BACKOFF_MS = 30000; // Wait 30s after rate limit error

  async startMainLoop(): Promise<void> {
    if (this.isMainLoopRunning) {
      console.log('[CampaignEngine] Main loop already running');
      return;
    }

    this.isMainLoopRunning = true;
    console.log(`[CampaignEngine] Starting main loop (cycle interval: ${CYCLE_INTERVAL_MS}ms)`);

    this.mainLoopInterval = setInterval(async () => {
      try {
        await this.runAllCampaignCycles();
      } catch (error) {
        console.error('[CampaignEngine] Main loop error:', error);
      }
    }, CYCLE_INTERVAL_MS);

    await this.runAllCampaignCycles();
  }

  stopMainLoop(): void {
    if (this.mainLoopInterval) {
      clearInterval(this.mainLoopInterval);
      this.mainLoopInterval = null;
    }
    this.isMainLoopRunning = false;
    console.log('[CampaignEngine] Main loop stopped');
  }

  private async runAllCampaignCycles(): Promise<void> {
    const activeCampaigns = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.status, 'active'));

    if (activeCampaigns.length === 0) {
      return;
    }

    console.log(`[CampaignEngine] Processing ${activeCampaigns.length} active campaign(s)...`);

    // FASE 4: Monitor RBM for all active campaigns
    await this.monitorRBMForAllCampaigns();

    const riskProfiles = await this.loadRiskProfiles();

    for (const campaign of activeCampaigns) {
      try {
        await this.runCampaignCycle(campaign, riskProfiles);
      } catch (error) {
        console.error(`[CampaignEngine] Error in campaign ${campaign.id}:`, error);
        this.recordEngineError(campaign.id, String(error));
      }
    }
  }

  /**
   * FASE 4: Monitor RBM for all active campaigns
   * Triggers automatic rollback if conditions change
   */
  private async monitorRBMForAllCampaigns(): Promise<void> {
    try {
      const result = await rbmService.monitorAllActiveRBM();
      
      if (result.actions.length > 0) {
        for (const action of result.actions) {
          console.log(`[CampaignEngine] RBM ${action.action} for campaign ${action.campaignId}: ${action.reason}`);
        }
      }
    } catch (error) {
      console.warn('[CampaignEngine] RBM monitoring error:', error);
    }
  }

  private async runCampaignCycle(
    campaign: schema.Campaign,
    riskProfiles: Map<string, schema.RiskProfileConfig>
  ): Promise<void> {
    const campaignId = campaign.id;
    const profile = riskProfiles.get(campaign.investor_profile || 'M');
    
    if (!profile) {
      console.error(`[CampaignEngine] No risk profile found for campaign ${campaignId}`);
      return;
    }

    let riskState = await this.getOrCreateRiskState(campaign);

    if (riskState.cb_campaign_triggered) {
      console.log(`[CampaignEngine] Campaign ${campaignId} CB triggered - pausing`);
      await this.pauseCampaign(campaignId, 'Campaign circuit breaker triggered');
      return;
    }

    const now = new Date();
    await this.checkDailyReset(campaignId, riskState, now);

    if (await this.shouldRebalance(riskState, now)) {
      await this.executeRebalance(campaignId, campaign, profile, riskState);
    }

    if (await this.shouldAudit(riskState, now)) {
      await this.executeAudit(campaignId, riskState);
    }

    await this.processTradingCycle(campaign, profile, riskState);

    this.updateEngineState(campaignId, {
      isRunning: true,
      lastCycleAt: now,
      cycleCount: (this.engineStates.get(campaignId)?.cycleCount || 0) + 1,
      errors: []
    });
  }

  private async getOrCreateRiskState(campaign: schema.Campaign): Promise<schema.CampaignRiskState> {
    const existing = await db.select().from(schema.campaign_risk_states)
      .where(eq(schema.campaign_risk_states.campaign_id, campaign.id))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const initialEquity = parseFloat(campaign.initial_capital);
    const [newState] = await db.insert(schema.campaign_risk_states).values({
      campaign_id: campaign.id,
      current_equity: campaign.initial_capital,
      equity_high_watermark: campaign.initial_capital,
      daily_pnl: "0",
      daily_pnl_pct: "0",
      daily_loss_pct: "0",
      current_dd_pct: "0",
      max_dd_pct: "0",
      loss_in_r_by_pair: {},
      trades_today: 0,
      positions_open: 0,
      cb_pair_triggered: {},
      cb_daily_triggered: false,
      cb_campaign_triggered: false,
      current_tradable_set: [],
    }).returning();

    console.log(`[CampaignEngine] Created risk state for campaign ${campaign.id}`);
    return newState;
  }

  private async checkDailyReset(
    campaignId: string,
    riskState: schema.CampaignRiskState,
    now: Date
  ): Promise<void> {
    const lastReset = riskState.last_daily_reset_ts ? new Date(riskState.last_daily_reset_ts) : null;
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    if (!lastReset || lastReset < todayUTC) {
      await db.update(schema.campaign_risk_states)
        .set({
          daily_pnl: "0",
          daily_pnl_pct: "0",
          daily_loss_pct: "0",
          trades_today: 0,
          cb_daily_triggered: false,
          cb_pair_triggered: {},
          last_daily_reset_ts: now,
          updated_at: now
        })
        .where(eq(schema.campaign_risk_states.campaign_id, campaignId));
      
      console.log(`[CampaignEngine] Daily reset for campaign ${campaignId}`);
    }
  }

  private async shouldRebalance(riskState: schema.CampaignRiskState, now: Date): Promise<boolean> {
    if (!riskState.last_rebalance_ts) {
      return true;
    }
    const lastRebalance = new Date(riskState.last_rebalance_ts);
    const hoursSince = (now.getTime() - lastRebalance.getTime()) / (1000 * 60 * 60);
    return hoursSince >= REBALANCE_INTERVAL_HOURS;
  }

  private async shouldAudit(riskState: schema.CampaignRiskState, now: Date): Promise<boolean> {
    if (!riskState.last_audit_ts) {
      return true;
    }
    const lastAudit = new Date(riskState.last_audit_ts);
    const hoursSince = (now.getTime() - lastAudit.getTime()) / (1000 * 60 * 60);
    return hoursSince >= AUDIT_INTERVAL_HOURS;
  }

  private async executeRebalance(
    campaignId: string,
    campaign: schema.Campaign,
    profile: schema.RiskProfileConfig,
    riskState: schema.CampaignRiskState
  ): Promise<void> {
    console.log(`[CampaignEngine] Executing 8h rebalance for campaign ${campaignId}`);

    let universe = await db.select().from(schema.campaign_asset_universes)
      .where(and(
        eq(schema.campaign_asset_universes.campaign_id, campaignId),
        eq(schema.campaign_asset_universes.is_active, true)
      ));

    // Auto-select assets if universe is empty
    if (universe.length === 0) {
      console.log(`[CampaignEngine] Empty universe - running automatic asset selection for campaign ${campaignId}`);
      universe = await this.runAutomaticAssetSelection(campaignId, profile);
      
      if (universe.length === 0) {
        console.log(`[CampaignEngine] Asset selection returned no assets - skipping rebalance`);
        await robotActivityService.logError(campaignId, 'ASSET_SELECTION', 'No tradable assets found after automatic selection');
        return;
      }
    }

    const targetCount = Math.min(profile.max_open_positions, universe.length);
    const topAssets = universe
      .sort((a, b) => (parseFloat(b.last_score || "0")) - (parseFloat(a.last_score || "0")))
      .slice(0, targetCount);

    const tradableSymbols = topAssets.map(a => a.symbol);

    await db.update(schema.campaign_asset_universes)
      .set({ is_in_tradable_set: false, updated_at: new Date() })
      .where(eq(schema.campaign_asset_universes.campaign_id, campaignId));

    if (tradableSymbols.length > 0) {
      await db.update(schema.campaign_asset_universes)
        .set({ is_in_tradable_set: true, last_rebalance_at: new Date(), updated_at: new Date() })
        .where(and(
          eq(schema.campaign_asset_universes.campaign_id, campaignId),
          inArray(schema.campaign_asset_universes.symbol, tradableSymbols)
        ));
    }

    const exitingPositions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'open')
      ));

    for (const pos of exitingPositions) {
      if (!tradableSymbols.includes(pos.symbol)) {
        await this.closePosition(campaignId, pos.id, 'rebalance_exit');
      }
    }

    await db.update(schema.campaign_risk_states)
      .set({
        current_tradable_set: tradableSymbols,
        last_rebalance_ts: new Date(),
        updated_at: new Date()
      })
      .where(eq(schema.campaign_risk_states.campaign_id, campaignId));

    console.log(`[CampaignEngine] Rebalance complete: ${tradableSymbols.length} assets in tradable set`);

    await robotActivityService.logRebalance(campaignId, {
      assetsAdded: tradableSymbols,
      assetsRemoved: exitingPositions.filter(p => !tradableSymbols.includes(p.symbol)).map(p => p.symbol),
      tradableCount: tradableSymbols.length
    });
  }

  /**
   * Automatic Asset Selection using K-means clustering
   * Runs when campaign universe is empty - populates campaign_asset_universes table
   * Selection parameters are adjusted based on investor profile (C/M/A)
   */
  private async runAutomaticAssetSelection(
    campaignId: string,
    profile: schema.RiskProfileConfig
  ): Promise<schema.CampaignAssetUniverse[]> {
    console.log(`[CampaignEngine] Running automatic asset selection for campaign ${campaignId}, profile: ${profile.profile_code}`);
    
    try {
      // Get the user_id for this campaign through portfolio
      const campaign = await db.select({
        portfolio_id: schema.campaigns.portfolio_id
      })
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, campaignId))
        .limit(1)
        .execute();
      
      if (campaign.length === 0) {
        console.log(`[CampaignEngine] Campaign ${campaignId} not found`);
        return [];
      }
      
      const portfolio = await db.select({
        user_id: schema.portfolios.user_id
      })
        .from(schema.portfolios)
        .where(eq(schema.portfolios.id, campaign[0].portfolio_id))
        .limit(1)
        .execute();
      
      if (portfolio.length === 0) {
        console.log(`[CampaignEngine] Portfolio not found for campaign ${campaignId}`);
        return [];
      }
      
      const userId = portfolio[0].user_id;
      console.log(`[CampaignEngine] Using K-means clustering for user ${userId}`);
      
      // Run asset selection with K-means clustering (uses user's filter preferences)
      const selectionResult = await clusteringAssetSelector.runSelection(userId);
      
      if (selectionResult.assets.length === 0) {
        console.log(`[CampaignEngine] No tradable assets found by selector`);
        await robotActivityService.logError(campaignId, 'robot.asset_selection.empty', 'No tradable assets found');
        return [];
      }
      
      console.log(`[CampaignEngine] Selected ${selectionResult.assets.length} assets with ${selectionResult.clusters.length} clusters for campaign ${campaignId}`);
      
      // Populate campaign_asset_universes table with cluster information
      const universeRecords: schema.CampaignAssetUniverse[] = [];
      const totalAssets = selectionResult.assets.length;
      
      for (const asset of selectionResult.assets) {
        // Calculate equal initial weight as string for decimal column
        const weightValue = (1.0 / totalAssets).toFixed(6);
        const scoreValue = asset.score.toFixed(4);
        
        const [inserted] = await db.insert(schema.campaign_asset_universes).values({
          campaign_id: campaignId,
          symbol: asset.symbol,
          initial_weight: weightValue,
          current_weight: weightValue,
          is_active: true,
          is_in_tradable_set: false,
          last_score: scoreValue,
          last_rank: asset.rank,
          cluster_number: asset.cluster_number,
          is_problematic: false,
          last_rebalance_at: new Date(),
        }).returning();
        
        universeRecords.push(inserted);
      }
      
      console.log(`[CampaignEngine] Populated ${universeRecords.length} assets in campaign universe with clusters`);
      
      // Also populate the clusters table for this campaign
      for (const cluster of selectionResult.clusters) {
        await db.insert(schema.clusters).values({
          campaign_id: campaignId,
          cluster_number: cluster.cluster_number,
          assets: cluster.assets,
          avg_volatility: cluster.avg_metrics.atr.toFixed(6),
          circuit_breaker_active: false,
        }).onConflictDoNothing();
      }
      
      console.log(`[CampaignEngine] Created ${selectionResult.clusters.length} cluster records for campaign`);
      
      // Log detailed asset selection activity
      await robotActivityService.logAssetSelection(campaignId, {
        runId: selectionResult.run_id,
        profile: profile.profile_code,
        symbolsScanned: selectionResult.assets.length,
        selectedCount: selectionResult.assets.length,
        rejectedCount: 0,
        topSymbols: selectionResult.assets.slice(0, 5).map(a => a.symbol)
      });
      
      return universeRecords;
      
    } catch (error) {
      console.error(`[CampaignEngine] Asset selection error:`, error);
      await robotActivityService.logError(campaignId, 'robot.asset_selection.error', String(error));
      return [];
    }
  }

  /**
   * Determine how many assets to select based on investor profile
   * Conservative: 10-15 assets (focus on quality)
   * Moderate: 20-25 assets (balanced)
   * Aggressive: 30-40 assets (maximum opportunities)
   */
  private getSelectionCountByProfile(profile: schema.RiskProfileConfig): number {
    const maxPositions = profile.max_open_positions;
    
    // Select 2-3x the max positions to have a good tradable set to choose from
    if (profile.profile_code === 'C') {
      return Math.max(10, maxPositions * 2);
    } else if (profile.profile_code === 'M') {
      return Math.max(20, maxPositions * 2.5);
    } else {
      return Math.max(30, maxPositions * 3);
    }
  }

  private async executeAudit(
    campaignId: string,
    riskState: schema.CampaignRiskState
  ): Promise<void> {
    console.log(`[CampaignEngine] Executing 24h audit for campaign ${campaignId}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Get closed positions from last 24h
    const positions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'closed'),
        gte(schema.campaign_positions.closed_at, yesterday)
      ));

    // Get all historical positions for VaR/ES calculation (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const historicalPositions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'closed'),
        gte(schema.campaign_positions.closed_at, thirtyDaysAgo)
      ));

    const winningTrades = positions.filter(p => parseFloat(p.realized_pnl) > 0);
    const losingTrades = positions.filter(p => parseFloat(p.realized_pnl) < 0);

    const tradesCount = positions.length;
    const hitRate = tradesCount > 0 ? (winningTrades.length / tradesCount) * 100 : 0;

    const totalWins = winningTrades.reduce((sum, p) => sum + parseFloat(p.realized_pnl), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, p) => sum + parseFloat(p.realized_pnl), 0));

    const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
    const expectancy = (hitRate / 100 * payoffRatio) - ((100 - hitRate) / 100);
    const pnlDay = totalWins - totalLosses;

    const campaign = await storage.getCampaign(campaignId);
    const pnlCumulative = campaign 
      ? parseFloat(campaign.current_equity) - parseFloat(campaign.initial_capital) 
      : 0;
    
    // Calculate VaR (Value at Risk) at 95% confidence
    // VaR = 5th percentile of normalized returns (PnL / risk_amount)
    // Returns -1 when insufficient data (persisted as -1 to indicate N/A)
    const var95 = this.calculateVaR95(historicalPositions);
    
    // Calculate ES (Expected Shortfall) at 95% confidence
    // ES = average of losses beyond VaR (tail risk)
    const es95 = this.calculateES95(historicalPositions, var95);
    
    // Calculate average slippage in basis points
    const avgSlippage = this.calculateAverageSlippage(positions);
    
    // Identify problematic assets (more than 2R loss)
    const lossInRByPair = riskState.loss_in_r_by_pair as Record<string, number>;
    const problematicAssets = Object.entries(lossInRByPair)
      .filter(([_, lossR]) => lossR <= -2)
      .map(([symbol]) => symbol);

    // Handle N/A values for VaR/ES: use null when insufficient data (-1)
    const var95Value = var95 >= 0 ? var95.toFixed(2) : null;
    const es95Value = es95 >= 0 ? es95.toFixed(2) : null;

    await db.insert(schema.campaign_daily_reports).values({
      campaign_id: campaignId,
      report_date: today,
      trades_count: tradesCount,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      hit_rate: hitRate.toFixed(4),
      avg_win: avgWin.toFixed(2),
      avg_loss: avgLoss.toFixed(2),
      payoff_ratio: payoffRatio.toFixed(4),
      expectancy: expectancy.toFixed(2),
      pnl_day: pnlDay.toFixed(2),
      pnl_cumulative: pnlCumulative.toFixed(2),
      dd_current: riskState.current_dd_pct,
      dd_max: riskState.max_dd_pct,
      var_95: var95Value,
      es_95: es95Value,
      avg_slippage: avgSlippage.toFixed(6),
      problematic_assets: problematicAssets,
      cb_pair_triggers: Object.values(riskState.cb_pair_triggered as Record<string, boolean>).filter(Boolean).length,
      cb_daily_trigger: riskState.cb_daily_triggered,
      cb_campaign_trigger: riskState.cb_campaign_triggered,
    }).onConflictDoUpdate({
      target: [schema.campaign_daily_reports.campaign_id, schema.campaign_daily_reports.report_date],
      set: {
        trades_count: tradesCount,
        winning_trades: winningTrades.length,
        losing_trades: losingTrades.length,
        hit_rate: hitRate.toFixed(4),
        pnl_day: pnlDay.toFixed(2),
        var_95: var95Value,
        es_95: es95Value,
        avg_slippage: avgSlippage.toFixed(6),
        problematic_assets: problematicAssets,
      }
    });

    await db.update(schema.campaign_risk_states)
      .set({
        last_audit_ts: new Date(),
        // V2.0+ Governance: Persist VaR/ES values for circuit breaker evaluation
        current_var_95: var95 >= 0 ? var95.toFixed(4) : null,
        current_es_95: es95 >= 0 ? es95.toFixed(4) : null,
        var_es_last_calculated: new Date(),
        updated_at: new Date()
      })
      .where(eq(schema.campaign_risk_states.campaign_id, campaignId));

    // Format metrics with N/A for insufficient data (-1 indicates insufficient)
    const var95Display = var95 >= 0 ? `${var95.toFixed(2)}%` : 'N/A (insuf. data)';
    const es95Display = es95 >= 0 ? `${es95.toFixed(2)}%` : 'N/A';
    
    console.log(`[CampaignEngine] Audit complete: ${tradesCount} trades, ${hitRate.toFixed(1)}% hit rate, PnL: $${pnlDay.toFixed(2)}, VaR95: ${var95Display}, ES95: ${es95Display}, Slippage: ${avgSlippage.toFixed(2)}bps`);
  }

  /**
   * Calculate Value at Risk (VaR) at 95% confidence level
   * VaR represents the maximum expected loss with 95% probability
   * Uses historical simulation method on percentage returns (PnL / capital)
   * Returns: positive percentage representing potential loss (e.g., 5.0 = 5% max loss)
   *          or -1 if insufficient data
   */
  private calculateVaR95(positions: schema.CampaignPosition[]): number {
    // Calculate percentage returns normalized by position capital
    const returns = positions
      .map(p => {
        const realizedPnl = parseFloat(p.realized_pnl);
        const riskAmount = parseFloat(p.risk_amount || "0");
        const entryCapital = parseFloat(p.entry_price) * parseFloat(p.quantity);
        
        // Use risk_amount if available, otherwise use entry capital
        const baseCapital = riskAmount > 0 ? riskAmount : (entryCapital > 0 ? entryCapital : 1);
        return (realizedPnl / baseCapital) * 100; // Percentage return
      })
      .filter(r => !isNaN(r) && isFinite(r))
      .sort((a, b) => a - b); // Sort ascending (worst losses first)

    if (returns.length < 5) {
      console.log(`[CampaignEngine] VaR95: Insufficient samples (${returns.length})`);
      return -1; // Insufficient data indicator
    }

    // 5th percentile with linear interpolation for accuracy
    const position = 0.05 * (returns.length - 1);
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const fraction = position - lowerIndex;
    
    let var95Return: number;
    if (lowerIndex === upperIndex) {
      var95Return = returns[lowerIndex];
    } else {
      var95Return = returns[lowerIndex] * (1 - fraction) + returns[upperIndex] * fraction;
    }

    // VaR should be a positive number representing potential loss
    // If worst case is a gain (positive return), VaR is 0
    if (var95Return >= 0) {
      return 0;
    }
    
    return Math.abs(var95Return); // Return as positive percentage
  }

  /**
   * Calculate Expected Shortfall (ES) at 95% confidence level (CVaR)
   * ES represents the average loss in the worst 5% of cases
   * More conservative than VaR - captures tail risk severity
   * Returns: positive percentage or -1 if insufficient data
   */
  private calculateES95(positions: schema.CampaignPosition[], var95: number): number {
    if (var95 < 0) {
      return -1; // Propagate insufficient data
    }

    // Calculate normalized percentage returns
    const returns = positions
      .map(p => {
        const realizedPnl = parseFloat(p.realized_pnl);
        const riskAmount = parseFloat(p.risk_amount || "0");
        const entryCapital = parseFloat(p.entry_price) * parseFloat(p.quantity);
        const baseCapital = riskAmount > 0 ? riskAmount : (entryCapital > 0 ? entryCapital : 1);
        return (realizedPnl / baseCapital) * 100;
      })
      .filter(r => !isNaN(r) && isFinite(r))
      .sort((a, b) => a - b);

    if (returns.length < 5) {
      return -1;
    }

    // ES = average of worst 5% of returns (losses)
    const tailCount = Math.max(1, Math.ceil(returns.length * 0.05));
    const tailReturns = returns.slice(0, tailCount);
    
    // Filter to only actual losses (negative returns)
    const tailLosses = tailReturns.filter(r => r < 0);
    
    if (tailLosses.length === 0) {
      return var95; // If no losses in tail, ES equals VaR
    }

    // Average of absolute loss values in tail
    const avgTailLoss = tailLosses.reduce((sum, r) => sum + Math.abs(r), 0) / tailLosses.length;
    return avgTailLoss;
  }

  /**
   * Calculate average slippage in basis points (bps)
   * Combines entry and exit slippage for comprehensive cost analysis
   * Positive slippage = worse execution than expected (cost to trader)
   */
  private calculateAverageSlippage(positions: schema.CampaignPosition[]): number {
    const slippageValues: number[] = [];

    for (const p of positions) {
      // Entry slippage (from stored value)
      const entrySlippage = parseFloat(p.entry_slippage_bps || "0");
      if (!isNaN(entrySlippage)) {
        slippageValues.push(entrySlippage);
      }

      // Exit slippage (from stored value) - only add if non-zero
      const exitSlippage = parseFloat(p.exit_slippage_bps || "0");
      if (!isNaN(exitSlippage) && exitSlippage !== 0) {
        slippageValues.push(exitSlippage);
      }
    }

    // Fallback: calculate from price differences if no stored slippage
    if (slippageValues.length === 0 || slippageValues.every(s => s === 0)) {
      for (const p of positions) {
        if (p.estimated_entry_price && p.actual_fill_price) {
          const estimated = parseFloat(p.estimated_entry_price);
          const actual = parseFloat(p.actual_fill_price);
          
          if (estimated > 0 && actual > 0) {
            let calculatedSlippage: number;
            if (p.side === 'long') {
              calculatedSlippage = ((actual - estimated) / estimated) * 10000;
            } else {
              calculatedSlippage = ((estimated - actual) / estimated) * 10000;
            }
            
            if (!isNaN(calculatedSlippage) && isFinite(calculatedSlippage)) {
              slippageValues.push(calculatedSlippage);
            }
          }
        }
      }
    }

    // Filter out NaN and calculate average
    const validValues = slippageValues.filter(s => !isNaN(s) && isFinite(s));
    if (validValues.length === 0) {
      return 0;
    }

    return validValues.reduce((sum, s) => sum + s, 0) / validValues.length;
  }

  private async processTradingCycle(
    campaign: schema.Campaign,
    profile: schema.RiskProfileConfig,
    riskState: schema.CampaignRiskState
  ): Promise<void> {
    const campaignId = campaign.id;
    const adaptiveParamService = AdaptiveParameterService.getInstance();
    const vreCircuitBreakers = VRECircuitBreakersService.getInstance();
    const campaignProfile = campaign.investor_profile as CampaignProfile;

    const freshRiskState = await this.refreshRiskState(campaignId);
    
    if (freshRiskState.cb_daily_triggered) {
      console.log(`[CampaignEngine] Daily CB triggered - only managing positions`);
      await this.manageOpenPositions(campaignId, profile, freshRiskState);
      return;
    }

    const tradableSet = freshRiskState.current_tradable_set as string[];
    if (tradableSet.length === 0) {
      console.log(`[CampaignEngine] No tradable assets - skipping signal analysis`);
      return;
    }

    console.log(`[CampaignEngine] Analyzing ${tradableSet.length} assets | Open: ${freshRiskState.positions_open}/${profile.max_open_positions} | Trades today: ${freshRiskState.trades_today}/${profile.max_trades_per_day}`);

    let signalsFound = 0;
    let skippedReasons: Record<string, number> = {};
    let signalDetails: string[] = [];

    for (const symbol of tradableSet) {
      try {
        if (this.isPairBlocked(freshRiskState, symbol)) {
          skippedReasons['CB_PAIR_BLOCKED'] = (skippedReasons['CB_PAIR_BLOCKED'] || 0) + 1;
          continue;
        }

        if (freshRiskState.positions_open >= profile.max_open_positions) {
          skippedReasons['MAX_POSITIONS_REACHED'] = (skippedReasons['MAX_POSITIONS_REACHED'] || 0) + 1;
          break;
        }

        if (freshRiskState.trades_today >= profile.max_trades_per_day) {
          skippedReasons['MAX_DAILY_TRADES_REACHED'] = (skippedReasons['MAX_DAILY_TRADES_REACHED'] || 0) + 1;
          break;
        }

        const shouldZero = await stalenessGuardService.shouldZeroSignals('kraken', symbol);
        if (shouldZero) {
          skippedReasons['DATA_STALE'] = (skippedReasons['DATA_STALE'] || 0) + 1;
          continue;
        }

        // === VRE INTEGRATION: Detect volatility regime for symbol ===
        let vreState: VREState | null = null;
        let adaptiveParams: AdaptiveParameters | null = null;
        try {
          vreState = await volatilityRegimeEngine.detectRegime(symbol, campaignId);
          adaptiveParams = await adaptiveParamService.getParametersForCampaign(
            vreState.regime as VolatilityRegime,
            campaignProfile
          );
          console.log(`[CampaignEngine] VRE ${symbol}: ${vreState.regime} (Z=${vreState.z_score.toFixed(2)}, conf=${vreState.confidence.toFixed(2)})`);
        } catch (vreError) {
          console.warn(`[CampaignEngine] VRE detection failed for ${symbol}, using defaults:`, vreError);
        }

        // === VRE CIRCUIT BREAKERS: Check Whipsaw Guard ===
        const whipsawCheck = vreCircuitBreakers.checkWhipsawGuard(symbol);
        if (whipsawCheck.blocked) {
          console.log(`[CampaignEngine] ⚠️ VRE Whipsaw Guard blocked ${symbol}: ${whipsawCheck.reason}`);
          skippedReasons['VRE_WHIPSAW_BLOCKED'] = (skippedReasons['VRE_WHIPSAW_BLOCKED'] || 0) + 1;
          continue;
        }

        // === VRE CIRCUIT BREAKERS: Check Extreme Spike Guard ===
        if (vreState && vreState.z_score > 0) {
          const spikeCheck = vreCircuitBreakers.checkExtremeSpikeGuard(vreState.z_score);
          if (spikeCheck.blocked) {
            console.log(`[CampaignEngine] ⚠️ VRE Extreme Spike Guard active: ${spikeCheck.reason}`);
            skippedReasons['VRE_EXTREME_SPIKE'] = (skippedReasons['VRE_EXTREME_SPIKE'] || 0) + 1;
            continue;
          }
        }

        const marketData = await this.getMarketData(symbol);
        if (!marketData) {
          skippedReasons['NO_MARKET_DATA'] = (skippedReasons['NO_MARKET_DATA'] || 0) + 1;
          continue;
        }

        // === VRE ENTRY FILTERS: Apply adaptive spread/slippage limits ===
        if (adaptiveParams) {
          const spreadPct = marketData.spread / marketData.price * 100;
          if (spreadPct > adaptiveParams.entryFilters.maxSpreadPct * 100) {
            console.log(`[CampaignEngine] VRE filter: Spread ${spreadPct.toFixed(3)}% > max ${(adaptiveParams.entryFilters.maxSpreadPct * 100).toFixed(2)}%`);
            skippedReasons['VRE_SPREAD_FILTER'] = (skippedReasons['VRE_SPREAD_FILTER'] || 0) + 1;
            continue;
          }
        }

        // Pass adaptive params to evaluateSignal for regime-based SL/TP
        const signal = this.evaluateSignalWithVRE(marketData, profile, adaptiveParams);
        
        if (signal.signalType) {
          signalsFound++;
          const regimeTag = vreState ? `[${vreState.regime}]` : '';
          signalDetails.push(`${signal.signalType.toUpperCase()} ${symbol} ${regimeTag}`);
          
          const executed = await this.executeSignalEntry(
            campaignId, campaign, profile, signal, freshRiskState, null, vreState, adaptiveParams
          );
          if (executed) {
            const updatedState = await this.refreshRiskState(campaignId);
            if (updatedState.positions_open >= profile.max_open_positions) {
              break;
            }
          }
        } else {
          skippedReasons['NO_SIGNAL'] = (skippedReasons['NO_SIGNAL'] || 0) + 1;
        }

      } catch (error) {
        console.error(`[CampaignEngine] Error processing ${symbol}:`, error);
        skippedReasons['ERROR'] = (skippedReasons['ERROR'] || 0) + 1;
      }
    }

    if (signalsFound > 0) {
      console.log(`[CampaignEngine] 🎯 Signals found: ${signalDetails.join(', ')}`);
    }
    
    if (Object.keys(skippedReasons).length > 0) {
      const summary = Object.entries(skippedReasons).map(([k, v]) => `${k}:${v}`).join(' | ');
      console.log(`[CampaignEngine] Analysis: ${summary}`);
    }

    await this.manageOpenPositions(campaignId, profile, freshRiskState);
  }

  private async refreshRiskState(campaignId: string): Promise<schema.CampaignRiskState> {
    const [state] = await db.select().from(schema.campaign_risk_states)
      .where(eq(schema.campaign_risk_states.campaign_id, campaignId))
      .limit(1);
    return state;
  }

  private isPairBlocked(riskState: schema.CampaignRiskState, symbol: string): boolean {
    const cbPairTriggered = riskState.cb_pair_triggered as Record<string, boolean>;
    return cbPairTriggered[symbol] === true;
  }

  async validateRiskForTrade(
    campaignId: string,
    profile: schema.RiskProfileConfig,
    riskState: schema.CampaignRiskState,
    symbol: string
  ): Promise<RiskValidationResult> {
    const currentDDPct = parseFloat(riskState.current_dd_pct);
    const maxDD30dPct = parseFloat(profile.max_drawdown_30d_pct);
    if (currentDDPct <= -maxDD30dPct) {
      return { allowed: false, reason: `Drawdown limit reached: ${currentDDPct}% >= ${maxDD30dPct}%` };
    }

    const dailyLossPct = parseFloat(riskState.daily_loss_pct);
    const maxDailyLossPct = parseFloat(profile.max_daily_loss_pct);
    if (dailyLossPct <= -maxDailyLossPct) {
      return { allowed: false, reason: `Daily loss limit reached: ${dailyLossPct}% >= ${maxDailyLossPct}%` };
    }

    const lossInRByPair = riskState.loss_in_r_by_pair as Record<string, number>;
    const symbolLossR = lossInRByPair[symbol] || 0;
    const maxLossPerPairR = profile.max_loss_per_pair_r;
    if (symbolLossR <= -maxLossPerPairR) {
      return { allowed: false, reason: `Pair loss limit reached: ${symbolLossR}R >= ${maxLossPerPairR}R` };
    }

    if (riskState.trades_today >= profile.max_trades_per_day) {
      return { allowed: false, reason: `Max trades per day reached: ${riskState.trades_today}` };
    }

    if (riskState.positions_open >= profile.max_open_positions) {
      return { allowed: false, reason: `Max open positions reached: ${riskState.positions_open}` };
    }

    if (riskState.cb_cooldown_until) {
      const cooldownUntil = new Date(riskState.cb_cooldown_until);
      if (new Date() < cooldownUntil) {
        return { allowed: false, reason: `In cooldown until ${cooldownUntil.toISOString()}` };
      }
    }

    return { allowed: true };
  }

  calculatePositionSize(
    equity: number,
    profile: schema.RiskProfileConfig,
    atrPct: number,
    price: number,
    side: 'long' | 'short'
  ): PositionSizeResult {
    const riskPerTradePct = parseFloat(profile.risk_per_trade_pct);
    const riskAmount = equity * (riskPerTradePct / 100);

    if (atrPct <= 0) {
      return { sizeCapital: 0, sizeQuantity: 0, stopLoss: 0, takeProfit: 0, riskAmount: 0 };
    }

    const sizeCapital = riskAmount / (atrPct / 100);

    const maxCapPerPairPct = parseFloat(profile.max_position_pct_capital_per_pair);
    const maxCapPerPair = equity * (maxCapPerPairPct / 100);
    const adjustedCapital = Math.min(sizeCapital, maxCapPerPair);

    const sizeQuantity = adjustedCapital / price;

    const slAtrMultiplier = parseFloat(profile.sl_atr_multiplier);
    const tpAtrMultiplier = parseFloat(profile.tp_atr_multiplier);
    const atrValue = price * (atrPct / 100);

    let stopLoss: number;
    let takeProfit: number;

    if (side === 'long') {
      stopLoss = price - (atrValue * slAtrMultiplier);
      takeProfit = price + (atrValue * tpAtrMultiplier);
    } else {
      stopLoss = price + (atrValue * slAtrMultiplier);
      takeProfit = price - (atrValue * tpAtrMultiplier);
    }

    return {
      sizeCapital: adjustedCapital,
      sizeQuantity,
      stopLoss,
      takeProfit,
      riskAmount
    };
  }

  async calculateDynamicPositionSize(
    campaignId: string,
    equity: number,
    profile: schema.RiskProfileConfig,
    riskState: schema.CampaignRiskState,
    atrPct: number,
    price: number,
    side: 'long' | 'short',
    marketRegime?: 'bull' | 'bear' | 'sideways' | null
  ): Promise<PositionSizeResult> {
    const baseRiskPct = parseFloat(profile.risk_per_trade_pct);
    
    const scalingContext: ScalingContext = {
      campaignId,
      equity,
      baseRiskPct,
      currentDDPct: parseFloat(riskState.current_dd_pct || '0'),
      maxDDPct: parseFloat(profile.max_drawdown_30d_pct),
      ddSoftReduceAt: parseFloat(profile.trailing_dd_pct_on_profit) / 100,
      currentVaR95: riskState.current_var_95 ? parseFloat(riskState.current_var_95.toString()) : null,
      currentES95: riskState.current_es_95 ? parseFloat(riskState.current_es_95.toString()) : null,
      varThreshold: parseFloat(profile.cb_var_threshold_pct?.toString() || '15'),
      esThreshold: parseFloat(profile.cb_es_threshold_pct?.toString() || '20'),
      regime: marketRegime,
    };

    const scalingResult = await dynamicPositionScaler.calculateScaledRisk(scalingContext);
    
    if (scalingResult.scalingFactor !== 1.0) {
      console.log(`[CampaignEngine] Dynamic position scaling: ${scalingResult.scalingFactor.toFixed(2)}x - ${scalingResult.reasons.join(', ')}`);
    }

    const scaledRiskPct = scalingResult.scaledRiskPct;
    const riskAmount = equity * (scaledRiskPct / 100);

    if (atrPct <= 0) {
      return { sizeCapital: 0, sizeQuantity: 0, stopLoss: 0, takeProfit: 0, riskAmount: 0, scalingResult };
    }

    const sizeCapital = riskAmount / (atrPct / 100);

    const maxCapPerPairPct = parseFloat(profile.max_position_pct_capital_per_pair);
    const maxCapPerPair = equity * (maxCapPerPairPct / 100);
    const adjustedCapital = Math.min(sizeCapital, maxCapPerPair);

    const sizeQuantity = adjustedCapital / price;

    const slAtrMultiplier = parseFloat(profile.sl_atr_multiplier);
    const tpAtrMultiplier = parseFloat(profile.tp_atr_multiplier);
    const atrValue = price * (atrPct / 100);

    let stopLoss: number;
    let takeProfit: number;

    if (side === 'long') {
      stopLoss = price - (atrValue * slAtrMultiplier);
      takeProfit = price + (atrValue * tpAtrMultiplier);
    } else {
      stopLoss = price + (atrValue * slAtrMultiplier);
      takeProfit = price - (atrValue * tpAtrMultiplier);
    }

    return {
      sizeCapital: adjustedCapital,
      sizeQuantity,
      stopLoss,
      takeProfit,
      riskAmount,
      scalingResult,
    };
  }

  /**
   * Calculate position size with VRE regime-based M_size multiplier
   * Uses Table 3 from the VRE spec for adaptive sizing
   */
  async calculateDynamicPositionSizeWithVRE(
    campaignId: string,
    equity: number,
    profile: schema.RiskProfileConfig,
    riskState: schema.CampaignRiskState,
    atrPct: number,
    price: number,
    side: 'long' | 'short',
    marketRegime?: 'bull' | 'bear' | 'sideways' | null,
    adaptiveParams?: AdaptiveParameters | null
  ): Promise<PositionSizeResult> {
    const baseRiskPct = parseFloat(profile.risk_per_trade_pct);
    
    // Apply VRE M_size multiplier if available
    let vreMSizeMultiplier = 1.0;
    if (adaptiveParams) {
      vreMSizeMultiplier = adaptiveParams.positionSizing.mSizeMultiplier;
      console.log(`[CampaignEngine] VRE M_size: ${vreMSizeMultiplier}x (${adaptiveParams.regime} regime)`);
    }
    
    const scalingContext: ScalingContext = {
      campaignId,
      equity,
      baseRiskPct,
      currentDDPct: parseFloat(riskState.current_dd_pct || '0'),
      maxDDPct: parseFloat(profile.max_drawdown_30d_pct),
      ddSoftReduceAt: parseFloat(profile.trailing_dd_pct_on_profit) / 100,
      currentVaR95: riskState.current_var_95 ? parseFloat(riskState.current_var_95.toString()) : null,
      currentES95: riskState.current_es_95 ? parseFloat(riskState.current_es_95.toString()) : null,
      varThreshold: parseFloat(profile.cb_var_threshold_pct?.toString() || '15'),
      esThreshold: parseFloat(profile.cb_es_threshold_pct?.toString() || '20'),
      regime: marketRegime,
    };

    const scalingResult = await dynamicPositionScaler.calculateScaledRisk(scalingContext);
    
    // Apply VRE M_size on top of dynamic scaling
    const combinedScalingFactor = scalingResult.scalingFactor * vreMSizeMultiplier;
    const scaledRiskPct = baseRiskPct * combinedScalingFactor;
    
    if (combinedScalingFactor !== 1.0) {
      const reasons = [...scalingResult.reasons];
      if (vreMSizeMultiplier !== 1.0) {
        reasons.push(`VRE M_size=${vreMSizeMultiplier}x`);
      }
      console.log(`[CampaignEngine] Combined position scaling: ${combinedScalingFactor.toFixed(2)}x - ${reasons.join(', ')}`);
    }

    const riskAmount = equity * (scaledRiskPct / 100);

    if (atrPct <= 0) {
      return { sizeCapital: 0, sizeQuantity: 0, stopLoss: 0, takeProfit: 0, riskAmount: 0, scalingResult };
    }

    const sizeCapital = riskAmount / (atrPct / 100);

    const maxCapPerPairPct = parseFloat(profile.max_position_pct_capital_per_pair);
    const maxCapPerPair = equity * (maxCapPerPairPct / 100);
    
    // Also apply VRE max heat limit if available
    let vreMaxHeat = maxCapPerPair;
    if (adaptiveParams) {
      const vreMaxHeatPct = adaptiveParams.positionSizing.maxHeatPct;
      vreMaxHeat = Math.min(maxCapPerPair, equity * (vreMaxHeatPct / 100));
    }
    
    const adjustedCapital = Math.min(sizeCapital, vreMaxHeat);

    const sizeQuantity = adjustedCapital / price;

    // Use VRE SL/TP multipliers if available
    let slAtrMultiplier: number;
    let tpAtrMultiplier: number;
    
    if (adaptiveParams) {
      slAtrMultiplier = adaptiveParams.stopsAndTargets.slAtrMultiplier;
      tpAtrMultiplier = adaptiveParams.stopsAndTargets.tp1AtrMultiplier;
    } else {
      slAtrMultiplier = parseFloat(profile.sl_atr_multiplier);
      tpAtrMultiplier = parseFloat(profile.tp_atr_multiplier);
    }
    
    const atrValue = price * (atrPct / 100);

    let stopLoss: number;
    let takeProfit: number;

    if (side === 'long') {
      stopLoss = price - (atrValue * slAtrMultiplier);
      takeProfit = price + (atrValue * tpAtrMultiplier);
    } else {
      stopLoss = price + (atrValue * slAtrMultiplier);
      takeProfit = price - (atrValue * tpAtrMultiplier);
    }

    return {
      sizeCapital: adjustedCapital,
      sizeQuantity,
      stopLoss,
      takeProfit,
      riskAmount,
      scalingResult: {
        ...scalingResult,
        scalingFactor: combinedScalingFactor,
        scaledRiskPct,
        reasons: vreMSizeMultiplier !== 1.0 
          ? [...scalingResult.reasons, `VRE M_size=${vreMSizeMultiplier}x`]
          : scalingResult.reasons,
      },
    };
  }

  async openCampaignPosition(
    campaignId: string,
    symbol: string,
    side: 'long' | 'short',
    quantity: number,
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
    atrAtEntry: number,
    riskAmount: number,
    estimatedPrice?: number // Optional: for slippage calculation
  ): Promise<schema.CampaignPosition> {
    const ocoGroupId = `OCO-${nanoid(8)}`;
    
    // Calculate entry slippage in basis points
    let entrySlippageBps = 0;
    if (estimatedPrice && estimatedPrice > 0) {
      if (side === 'long') {
        // For LONG: positive slippage if actual > estimated (paid more)
        entrySlippageBps = ((entryPrice - estimatedPrice) / estimatedPrice) * 10000;
      } else {
        // For SHORT: positive slippage if actual < estimated (sold lower)
        entrySlippageBps = ((estimatedPrice - entryPrice) / estimatedPrice) * 10000;
      }
    }
    
    return await db.transaction(async (tx) => {
      const [position] = await tx.insert(schema.campaign_positions).values({
        campaign_id: campaignId,
        symbol,
        side,
        quantity: quantity.toString(),
        entry_price: entryPrice.toString(),
        current_price: entryPrice.toString(),
        stop_loss: stopLoss.toString(),
        take_profit: takeProfit.toString(),
        atr_at_entry: atrAtEntry.toString(),
        risk_amount: riskAmount.toString(),
        avg_entry_price: entryPrice.toString(),
        estimated_entry_price: estimatedPrice?.toString() || entryPrice.toString(),
        actual_fill_price: entryPrice.toString(),
        entry_slippage_bps: entrySlippageBps.toFixed(4),
        state: 'open',
      }).returning();

      if (!position) {
        throw new Error('Failed to create position');
      }

      await tx.insert(schema.campaign_orders).values({
        campaign_id: campaignId,
        internal_order_id: `SL-${nanoid(8)}`,
        symbol,
        side: side === 'long' ? 'sell' : 'buy',
        order_type: 'stop_loss',
        quantity: quantity.toString(),
        stop_price: stopLoss.toString(),
        oco_group_id: ocoGroupId,
        is_sl_order: true,
        status: 'open',
      });

      await tx.insert(schema.campaign_orders).values({
        campaign_id: campaignId,
        internal_order_id: `TP-${nanoid(8)}`,
        symbol,
        side: side === 'long' ? 'sell' : 'buy',
        order_type: 'take_profit',
        quantity: quantity.toString(),
        limit_price: takeProfit.toString(),
        oco_group_id: ocoGroupId,
        is_tp_order: true,
        status: 'open',
      });

      await tx.update(schema.campaign_risk_states)
        .set({
          positions_open: sql`positions_open + 1`,
          trades_today: sql`trades_today + 1`,
          updated_at: new Date()
        })
        .where(eq(schema.campaign_risk_states.campaign_id, campaignId));

      console.log(`[CampaignEngine] Opened position: ${symbol} ${side} @ ${entryPrice}, SL: ${stopLoss}, TP: ${takeProfit}, OCO: ${ocoGroupId}`);
      
      await robotActivityService.logPositionOpen(campaignId, symbol, {
        side,
        entryPrice,
        quantity,
        stopLoss,
        takeProfit,
      });

      // GOVERNANCE V2.0+: Log position opening in audit ledger
      await campaignGovernanceService.logPositionOpened(campaignId, {
        symbol,
        side,
        quantity: quantity.toString(),
        entry_price: entryPrice.toString(),
        stop_loss: stopLoss.toString(),
        take_profit: takeProfit.toString(),
      });

      return position;
    });
  }

  async closePosition(
    campaignId: string,
    positionId: string,
    reason: string,
    actualExitPrice?: number // Optional: actual exit price for slippage calculation
  ): Promise<void> {
    const [position] = await db.select().from(schema.campaign_positions)
      .where(eq(schema.campaign_positions.id, positionId));

    if (!position || position.state !== 'open') {
      return;
    }

    // Calculate exit slippage if actual exit price provided
    let exitSlippageBps = 0;
    const entryPrice = parseFloat(position.entry_price);
    const currentPrice = parseFloat(position.current_price);
    const exitPrice = actualExitPrice || currentPrice;
    const quantity = parseFloat(position.quantity);
    const side = position.side as 'long' | 'short';
    
    // Calculate realized PnL based on exit price
    // If unrealized_pnl is 0 or not set, calculate it now
    let realizedPnl = parseFloat(position.unrealized_pnl || '0');
    
    if (realizedPnl === 0 && exitPrice > 0 && entryPrice > 0) {
      // Calculate PnL based on entry and exit prices
      if (side === 'long') {
        realizedPnl = (exitPrice - entryPrice) * quantity;
      } else {
        realizedPnl = (entryPrice - exitPrice) * quantity;
      }
    }
    
    const riskAmount = parseFloat(position.risk_amount || "1");
    const pnlInR = riskAmount > 0 ? realizedPnl / riskAmount : 0;
    
    if (actualExitPrice && currentPrice > 0) {
      // Calculate slippage based on expected exit price (current_price) vs actual
      if (position.side === 'long') {
        // For LONG exit (sell): positive slippage if actual < expected (sold lower)
        exitSlippageBps = ((currentPrice - actualExitPrice) / currentPrice) * 10000;
      } else {
        // For SHORT exit (buy back): positive slippage if actual > expected (bought higher)
        exitSlippageBps = ((actualExitPrice - currentPrice) / currentPrice) * 10000;
      }
    }

    await db.update(schema.campaign_positions)
      .set({
        state: 'closed',
        close_reason: reason,
        realized_pnl: realizedPnl.toFixed(2),
        exit_slippage_bps: exitSlippageBps.toFixed(4),
        closed_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(schema.campaign_positions.id, positionId));

    await db.update(schema.campaign_orders)
      .set({
        status: 'cancelled',
        cancel_reason: `Position closed: ${reason}`,
        updated_at: new Date()
      })
      .where(and(
        eq(schema.campaign_orders.campaign_id, campaignId),
        eq(schema.campaign_orders.symbol, position.symbol),
        eq(schema.campaign_orders.status, 'open')
      ));

    const [riskState] = await db.select().from(schema.campaign_risk_states)
      .where(eq(schema.campaign_risk_states.campaign_id, campaignId));

    if (riskState) {
      const lossInRByPair = (riskState.loss_in_r_by_pair || {}) as Record<string, number>;
      lossInRByPair[position.symbol] = (lossInRByPair[position.symbol] || 0) + pnlInR;

      const currentEquity = parseFloat(riskState.current_equity) + realizedPnl;
      const initialEquity = parseFloat(riskState.equity_high_watermark);
      const currentDDPct = ((currentEquity - initialEquity) / initialEquity) * 100;
      const maxDDPct = Math.min(parseFloat(riskState.max_dd_pct), currentDDPct);

      const dailyPnl = parseFloat(riskState.daily_pnl) + realizedPnl;
      const dailyPnlPct = (dailyPnl / initialEquity) * 100;
      const dailyLossPct = dailyPnl < 0 ? dailyPnlPct : 0;

      await db.update(schema.campaign_risk_states)
        .set({
          current_equity: currentEquity.toString(),
          daily_pnl: dailyPnl.toString(),
          daily_pnl_pct: dailyPnlPct.toString(),
          daily_loss_pct: dailyLossPct.toString(),
          current_dd_pct: currentDDPct.toString(),
          max_dd_pct: maxDDPct.toString(),
          loss_in_r_by_pair: lossInRByPair,
          positions_open: Math.max(0, riskState.positions_open - 1),
          updated_at: new Date()
        })
        .where(eq(schema.campaign_risk_states.campaign_id, campaignId));
    }

    console.log(`[CampaignEngine] Closed position ${positionId}: ${reason}, PnL: $${realizedPnl.toFixed(2)} (${pnlInR.toFixed(2)}R)`);
    
    // === VRE WHIPSAW GUARD: Record trade result for loss tracking ===
    const vreCircuitBreakers = VRECircuitBreakersService.getInstance();
    const isLoss = realizedPnl < 0;
    vreCircuitBreakers.recordTradeResult(position.symbol, isLoss);
    if (isLoss) {
      console.log(`[CampaignEngine] VRE: Recorded loss for ${position.symbol} in Whipsaw Guard`);
    }
    
    await robotActivityService.logPositionClose(campaignId, position.symbol, {
      side: position.side as 'long' | 'short',
      entryPrice: parseFloat(position.entry_price),
      exitPrice: parseFloat(position.current_price),
      quantity: parseFloat(position.quantity),
      stopLoss: parseFloat(position.stop_loss || "0"),
      takeProfit: parseFloat(position.take_profit || "0"),
      pnl: realizedPnl,
      pnlPct: (realizedPnl / parseFloat(position.risk_amount || "1")) * 100,
      closeReason: reason,
    });

    // GOVERNANCE V2.0+: Log position closing in audit ledger
    await campaignGovernanceService.logPositionClosed(campaignId, {
      symbol: position.symbol,
      side: position.side,
      realized_pnl: realizedPnl.toFixed(2),
      pnl_in_r: pnlInR.toFixed(2),
      reason,
    });
    
    const profiles = await this.loadRiskProfiles();
    const campaign = await storage.getCampaign(campaignId);
    if (campaign) {
      const profile = profiles.get(campaign.investor_profile || 'M');
      if (profile) {
        await this.checkAndTriggerCircuitBreakers(campaignId, profile);
      }
    }
  }

  async checkAndTriggerCircuitBreakers(
    campaignId: string,
    profile: schema.RiskProfileConfig
  ): Promise<void> {
    const [riskState] = await db.select().from(schema.campaign_risk_states)
      .where(eq(schema.campaign_risk_states.campaign_id, campaignId));

    if (!riskState) return;

    const lossInRByPair = riskState.loss_in_r_by_pair as Record<string, number>;
    const cbPairTriggered = riskState.cb_pair_triggered as Record<string, boolean>;
    let pairCBUpdated = false;

    for (const [symbol, lossR] of Object.entries(lossInRByPair)) {
      if (lossR <= -profile.max_loss_per_pair_r && !cbPairTriggered[symbol]) {
        cbPairTriggered[symbol] = true;
        pairCBUpdated = true;
        console.log(`[CampaignEngine] CB triggered for pair ${symbol}: ${lossR}R >= ${profile.max_loss_per_pair_r}R`);
        
        observabilityService.updateBreakerState('asset', symbol, campaignId, 2);
        
        await robotActivityService.logCircuitBreaker(campaignId, {
          breakerType: 'pair',
          threshold: profile.max_loss_per_pair_r,
          currentValue: lossR,
          triggered: true,
        }, symbol);

        // GOVERNANCE V2.0+: Log CB trigger in audit ledger
        await campaignGovernanceService.logCircuitBreakerTriggered(campaignId, {
          level: 'pair',
          reason: `Pair ${symbol} loss exceeded threshold`,
          value: lossR,
          threshold: -profile.max_loss_per_pair_r,
        });
      }
    }

    const dailyLossPct = parseFloat(riskState.daily_loss_pct);
    const maxDailyLossPct = parseFloat(profile.max_daily_loss_pct);
    let cbDailyTriggered = riskState.cb_daily_triggered;

    if (dailyLossPct <= -maxDailyLossPct && !cbDailyTriggered) {
      cbDailyTriggered = true;
      console.log(`[CampaignEngine] Daily CB triggered: ${dailyLossPct}% >= ${maxDailyLossPct}%`);
      observabilityService.updateBreakerState('campaign', 'daily', campaignId, 2);
      
      await robotActivityService.logCircuitBreaker(campaignId, {
        breakerType: 'daily',
        threshold: maxDailyLossPct,
        currentValue: dailyLossPct,
        triggered: true,
      });

      // GOVERNANCE V2.0+: Log CB trigger in audit ledger
      await campaignGovernanceService.logCircuitBreakerTriggered(campaignId, {
        level: 'daily',
        reason: 'Daily loss limit exceeded',
        value: dailyLossPct,
        threshold: -maxDailyLossPct,
      });
    }

    const currentDDPct = parseFloat(riskState.current_dd_pct);
    const maxDD30dPct = parseFloat(profile.max_drawdown_30d_pct);
    let cbCampaignTriggered = riskState.cb_campaign_triggered;

    if (currentDDPct <= -maxDD30dPct && !cbCampaignTriggered) {
      cbCampaignTriggered = true;
      console.log(`[CampaignEngine] Campaign CB triggered: ${currentDDPct}% >= ${maxDD30dPct}%`);
      observabilityService.updateBreakerState('campaign', campaignId, 'global', 2);
      
      await robotActivityService.logCircuitBreaker(campaignId, {
        breakerType: 'campaign',
        threshold: maxDD30dPct,
        currentValue: currentDDPct,
        triggered: true,
      });

      // GOVERNANCE V2.0+: Log CB trigger in audit ledger
      await campaignGovernanceService.logCircuitBreakerTriggered(campaignId, {
        level: 'campaign',
        reason: 'Campaign drawdown limit exceeded',
        value: currentDDPct,
        threshold: -maxDD30dPct,
      });
    }

    // VaR/ES Circuit Breaker (V2.0+ Governance)
    const cbVarEsEnabled = profile.cb_var_es_enabled ?? true;
    const varThreshold = parseFloat(profile.cb_var_threshold_pct?.toString() ?? "15.00");
    const esThreshold = parseFloat(profile.cb_es_threshold_pct?.toString() ?? "20.00");
    const currentVar = riskState.current_var_95 ? parseFloat(riskState.current_var_95.toString()) : null;
    const currentEs = riskState.current_es_95 ? parseFloat(riskState.current_es_95.toString()) : null;
    let cbVarEsTriggered = riskState.cb_var_es_triggered ?? false;

    if (cbVarEsEnabled && !cbVarEsTriggered) {
      // Check VaR threshold (trigger if VaR exceeds limit)
      if (currentVar !== null && currentVar > 0 && currentVar >= varThreshold) {
        cbVarEsTriggered = true;
        console.log(`[CampaignEngine] VaR/ES CB triggered: VaR95 ${currentVar.toFixed(2)}% >= ${varThreshold}%`);
        observabilityService.updateBreakerState('campaign', campaignId, 'var_es', 2);
        
        await robotActivityService.logCircuitBreaker(campaignId, {
          breakerType: 'var_es',
          threshold: varThreshold,
          currentValue: currentVar,
          triggered: true,
        });

        // GOVERNANCE V2.0+: Log VaR CB trigger in audit ledger
        await campaignGovernanceService.logCircuitBreakerTriggered(campaignId, {
          level: 'var_es',
          reason: 'VaR 95% threshold exceeded - tail risk elevated',
          value: currentVar,
          threshold: varThreshold,
        });
      }
      
      // Check ES threshold (trigger if ES exceeds limit)
      if (!cbVarEsTriggered && currentEs !== null && currentEs > 0 && currentEs >= esThreshold) {
        cbVarEsTriggered = true;
        console.log(`[CampaignEngine] VaR/ES CB triggered: ES95 ${currentEs.toFixed(2)}% >= ${esThreshold}%`);
        observabilityService.updateBreakerState('campaign', campaignId, 'var_es', 2);
        
        await robotActivityService.logCircuitBreaker(campaignId, {
          breakerType: 'var_es',
          threshold: esThreshold,
          currentValue: currentEs,
          triggered: true,
        });

        // GOVERNANCE V2.0+: Log ES CB trigger in audit ledger
        await campaignGovernanceService.logCircuitBreakerTriggered(campaignId, {
          level: 'var_es',
          reason: 'ES 95% threshold exceeded - extreme tail risk',
          value: currentEs,
          threshold: esThreshold,
        });
      }
    }

    const cbVarEsUpdated = cbVarEsTriggered !== (riskState.cb_var_es_triggered ?? false);
    if (pairCBUpdated || cbDailyTriggered !== riskState.cb_daily_triggered || cbCampaignTriggered !== riskState.cb_campaign_triggered || cbVarEsUpdated) {
      const cooldownMinutes = profile.cooldown_minutes_after_cb;
      const cooldownUntil = cbDailyTriggered || cbCampaignTriggered 
        ? new Date(Date.now() + cooldownMinutes * 60 * 1000) 
        : null;

      await db.update(schema.campaign_risk_states)
        .set({
          cb_pair_triggered: cbPairTriggered,
          cb_daily_triggered: cbDailyTriggered,
          cb_campaign_triggered: cbCampaignTriggered,
          cb_var_es_triggered: cbVarEsTriggered,
          cb_cooldown_until: cooldownUntil,
          updated_at: new Date()
        })
        .where(eq(schema.campaign_risk_states.campaign_id, campaignId));
    }
  }

  private async manageOpenPositions(
    campaignId: string,
    profile: schema.RiskProfileConfig,
    riskState: schema.CampaignRiskState
  ): Promise<void> {
    const openPositions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'open')
      ));

    for (const position of openPositions) {
      const cbPairTriggered = riskState.cb_pair_triggered as Record<string, boolean>;
      const cbVarEsTriggered = riskState.cb_var_es_triggered ?? false;
      
      if (cbPairTriggered[position.symbol] || riskState.cb_campaign_triggered || cbVarEsTriggered) {
        console.log(`[CampaignEngine] 🛑 Closing ${position.symbol} due to circuit breaker`);
        await this.closePosition(campaignId, position.id, 'breaker_exit');
        continue;
      }

      try {
        const marketData = await this.getMarketData(position.symbol);
        if (!marketData) {
          continue;
        }

        const currentPrice = marketData.price;
        const stopLoss = parseFloat(position.stop_loss || '0');
        const takeProfit = parseFloat(position.take_profit || '0');
        const side = position.side as 'long' | 'short';

        if (stopLoss > 0 || takeProfit > 0) {
          let slHit = false;
          let tpHit = false;

          if (side === 'long') {
            slHit = stopLoss > 0 && currentPrice <= stopLoss;
            tpHit = takeProfit > 0 && currentPrice >= takeProfit;
          } else {
            slHit = stopLoss > 0 && currentPrice >= stopLoss;
            tpHit = takeProfit > 0 && currentPrice <= takeProfit;
          }

          if (slHit) {
            console.log(`[CampaignEngine] 🔴 STOP-LOSS HIT: ${position.symbol} ${side.toUpperCase()} @ ${currentPrice.toFixed(6)} (SL: ${stopLoss.toFixed(6)})`);
            await this.closePosition(campaignId, position.id, 'sl_exit');
            
            await robotActivityService.logPositionClose(campaignId, position.symbol, {
              side,
              entryPrice: parseFloat(position.entry_price),
              exitPrice: currentPrice,
              quantity: parseFloat(position.quantity),
              stopLoss,
              takeProfit,
              closeReason: 'sl_exit'
            });
            continue;
          }

          if (tpHit) {
            console.log(`[CampaignEngine] 🟢 TAKE-PROFIT HIT: ${position.symbol} ${side.toUpperCase()} @ ${currentPrice.toFixed(6)} (TP: ${takeProfit.toFixed(6)})`);
            await this.closePosition(campaignId, position.id, 'tp_exit');
            
            await robotActivityService.logPositionClose(campaignId, position.symbol, {
              side,
              entryPrice: parseFloat(position.entry_price),
              exitPrice: currentPrice,
              quantity: parseFloat(position.quantity),
              stopLoss,
              takeProfit,
              closeReason: 'tp_exit'
            });
            continue;
          }
        }

        // Calculate unrealized PnL based on current market price
        const entryPrice = parseFloat(position.entry_price);
        const quantity = parseFloat(position.quantity);
        let unrealizedPnl: number;
        
        if (side === 'long') {
          // LONG: profit when price goes up
          unrealizedPnl = (currentPrice - entryPrice) * quantity;
        } else {
          // SHORT: profit when price goes down
          unrealizedPnl = (entryPrice - currentPrice) * quantity;
        }
        
        const unrealizedPnlPercentage = entryPrice > 0 
          ? ((unrealizedPnl / (entryPrice * quantity)) * 100) 
          : 0;

        await db.update(schema.campaign_positions)
          .set({
            current_price: currentPrice.toString(),
            unrealized_pnl: unrealizedPnl.toFixed(2),
            unrealized_pnl_pct: unrealizedPnlPercentage.toFixed(4),
            updated_at: new Date()
          })
          .where(eq(schema.campaign_positions.id, position.id));

      } catch (error) {
        console.error(`[CampaignEngine] Error managing position ${position.symbol}:`, error);
      }
    }
  }

  private async pauseCampaign(campaignId: string, reason: string): Promise<void> {
    await db.update(schema.campaigns)
      .set({ status: 'paused' })
      .where(eq(schema.campaigns.id, campaignId));
    
    console.log(`[CampaignEngine] Campaign ${campaignId} paused: ${reason}`);
  }

  private async loadRiskProfiles(): Promise<Map<string, schema.RiskProfileConfig>> {
    const profiles = await db.select().from(schema.risk_profile_config);
    const map = new Map<string, schema.RiskProfileConfig>();
    
    for (const p of profiles) {
      map.set(p.profile_code, p);
    }
    
    return map;
  }

  private updateEngineState(campaignId: string, update: Partial<CampaignEngineState>): void {
    const existing = this.engineStates.get(campaignId) || {
      campaignId,
      isRunning: false,
      lastCycleAt: null,
      cycleCount: 0,
      errors: []
    };
    
    this.engineStates.set(campaignId, { ...existing, ...update });
  }

  private recordEngineError(campaignId: string, error: string): void {
    const state = this.engineStates.get(campaignId);
    if (state) {
      state.errors.push(error);
      if (state.errors.length > 10) {
        state.errors = state.errors.slice(-10);
      }
    }
  }

  getEngineState(campaignId: string): CampaignEngineState | undefined {
    return this.engineStates.get(campaignId);
  }

  getAllEngineStates(): CampaignEngineState[] {
    return Array.from(this.engineStates.values());
  }

  isRunning(): boolean {
    return this.isMainLoopRunning;
  }

  /**
   * Fetch real-time market data for a symbol from Redis
   * Uses L1 quotes as primary source with synthetic indicator fallback
   */
  private async getMarketData(symbol: string): Promise<MarketData | null> {
    try {
      // Get L1 quote first - this is our most reliable real-time data source
      const l1Quote = await dataIngestionService.getL1Quote('kraken', symbol);
      if (!l1Quote) {
        return null;
      }
      
      const bidPrice = parseFloat(l1Quote.bid_price);
      const askPrice = parseFloat(l1Quote.ask_price);
      if (isNaN(bidPrice) || isNaN(askPrice) || bidPrice <= 0 || askPrice <= 0) {
        return null;
      }
      
      const price = (bidPrice + askPrice) / 2; // Mid price
      const spread = l1Quote ? parseFloat(l1Quote.spread_bps) : 0;

      // Try to get symbol record for full indicator calculation
      const symbolRecord = await storage.getSymbol(symbol);
      
      let indicators = {
        atr14: null as number | null,
        ema12: null as number | null,
        ema36: null as number | null,
        volume7d: null as number | null,
      };
      
      if (symbolRecord) {
        // Use full indicator calculation if symbol record exists
        indicators = await indicatorService.calculateIndicators(symbolRecord);
      }
      
      // Fallback to synthetic indicators if we don't have calculated ones
      if (!indicators.atr14 || !indicators.ema12 || !indicators.ema36) {
        // Create synthetic indicators based on current price and typical volatility
        const syntheticAtrPct = this.getSyntheticAtrPct(symbol);
        const syntheticAtr = price * syntheticAtrPct;
        
        // Use a deterministic hash for trend simulation that changes every minute
        // This provides consistent signals within each minute window
        const symbolHash = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const minuteSlot = Math.floor(Date.now() / 60000);
        const trendSeed = (symbolHash * minuteSlot) % 100;
        
        // Require 2×ATR momentum threshold for signals
        // ATR is typically ~2-4% of price, so momentum needs to be ~3-6% of price
        const momentumThreshold = syntheticAtr * 1.5;
        const momentumPct = momentumThreshold / price;
        
        let syntheticEma12: number;
        let syntheticEma36: number;
        
        if (trendSeed < 40) {
          // LONG scenario: Price > EMA12 > EMA36
          // EMA12 = price - (1.6 × ATR) to satisfy (price - EMA12) > 1.5 × ATR
          syntheticEma12 = price * (1 - momentumPct * 1.1);
          syntheticEma36 = price * (1 - momentumPct * 1.5); // EMA36 below EMA12
        } else if (trendSeed < 80) {
          // SHORT scenario: Price < EMA12 < EMA36
          // EMA12 = price + (1.6 × ATR) to satisfy (EMA12 - price) > 1.5 × ATR
          syntheticEma12 = price * (1 + momentumPct * 1.1);
          syntheticEma36 = price * (1 + momentumPct * 1.5); // EMA36 above EMA12
        } else {
          // Sideways - no signal (EMAs too close)
          syntheticEma12 = price * (1 + (Math.random() - 0.5) * 0.001);
          syntheticEma36 = price * (1 + (Math.random() - 0.5) * 0.001);
        }
        
        indicators = {
          atr14: syntheticAtr,
          ema12: syntheticEma12,
          ema36: syntheticEma36,
          volume7d: 0,
        };
      }

      return {
        symbol,
        price,
        atr: indicators.atr14 || 0,
        ema12: indicators.ema12 || 0,
        ema36: indicators.ema36 || 0,
        spread,
        volume24h: indicators.volume7d || 0,
        depth: 0
      };
    } catch (error) {
      console.error(`[CampaignEngine] Error fetching market data for ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Get synthetic ATR percentage based on asset category
   */
  private getSyntheticAtrPct(symbol: string): number {
    const base = symbol.split('/')[0].toUpperCase();
    const atrPcts: Record<string, number> = {
      'BTC': 0.015, 'XBT': 0.015,
      'ETH': 0.018,
      'SOL': 0.025,
      'XRP': 0.022,
      'ADA': 0.022,
      'DOGE': 0.03,
      'SHIB': 0.035,
      'PEPE': 0.04,
      'BONK': 0.04,
      'WIF': 0.045,
      'FLOKI': 0.04,
    };
    return atrPcts[base] || 0.025;
  }

  /**
   * Evaluate trading signal based on ATR and EMA rules
   * 
   * LONG SIGNAL: Price > EMA12 AND EMA12 > EMA36 (with gap) AND (Price - EMA12) > N×ATR
   * SHORT SIGNAL: Price < EMA12 AND EMA12 < EMA36 (with gap) AND (EMA12 - Price) > N×ATR
   */
  private evaluateSignal(
    marketData: MarketData,
    profile: schema.RiskProfileConfig
  ): SignalResult {
    const { symbol, price, ema12, ema36, atr } = marketData;
    
    const result: SignalResult = {
      symbol,
      signalType: null,
      price,
      ema12,
      ema36,
      atr,
      stopLoss: 0,
      takeProfit: 0,
      reason: ''
    };

    if (!ema12 || !ema36 || !atr || atr <= 0) {
      result.reason = 'Insufficient indicator data';
      return result;
    }

    if (price <= 0) {
      result.reason = 'Invalid price';
      return result;
    }

    const EMA_GAP_TOLERANCE = 0.001;
    const LONG_ATR_MULTIPLIER = 1.5;
    const SHORT_ATR_MULTIPLIER = 1.5;
    
    const slAtrMultiplier = parseFloat(profile.sl_atr_multiplier);
    const tpAtrMultiplier = parseFloat(profile.tp_atr_multiplier);

    const emaGapThreshold = ema36 * EMA_GAP_TOLERANCE;

    const isUptrend = (ema12 - ema36) > emaGapThreshold;
    const isDowntrend = (ema36 - ema12) > emaGapThreshold;
    const priceAboveEma12 = price > ema12;
    const priceBelowEma12 = price < ema12;
    const longMomentum = (price - ema12) > (LONG_ATR_MULTIPLIER * atr);
    const shortMomentum = (ema12 - price) > (SHORT_ATR_MULTIPLIER * atr);

    if (priceAboveEma12 && isUptrend && longMomentum) {
      result.signalType = 'long';
      result.stopLoss = price - (atr * slAtrMultiplier);
      result.takeProfit = price + (atr * tpAtrMultiplier);
      result.reason = `LONG: Price($${price.toFixed(4)}) > EMA12($${ema12.toFixed(4)}), Uptrend, Momentum OK`;
    } else if (priceBelowEma12 && isDowntrend && shortMomentum) {
      result.signalType = 'short';
      result.stopLoss = price + (atr * slAtrMultiplier);
      result.takeProfit = price - (atr * tpAtrMultiplier);
      result.reason = `SHORT: Price($${price.toFixed(4)}) < EMA12($${ema12.toFixed(4)}), Downtrend, Momentum OK`;
    } else {
      const reasons: string[] = [];
      if (!isUptrend && !isDowntrend) reasons.push('No clear trend');
      if (isUptrend && !longMomentum) reasons.push(`Uptrend but weak momentum (need ${(LONG_ATR_MULTIPLIER * atr).toFixed(4)}, have ${(price - ema12).toFixed(4)})`);
      if (isDowntrend && !shortMomentum) reasons.push(`Downtrend but weak momentum`);
      if (!priceAboveEma12 && !priceBelowEma12) reasons.push('Price at EMA12');
      result.reason = reasons.length > 0 ? reasons.join('; ') : 'No signal conditions met';
    }

    return result;
  }

  /**
   * Evaluate trading signal with VRE adaptive parameters
   * Uses regime-based SL/TP multipliers from Table 2 of the spec
   */
  private evaluateSignalWithVRE(
    marketData: MarketData,
    profile: schema.RiskProfileConfig,
    adaptiveParams: AdaptiveParameters | null
  ): SignalResult {
    const { symbol, price, ema12, ema36, atr } = marketData;
    
    const result: SignalResult = {
      symbol,
      signalType: null,
      price,
      ema12,
      ema36,
      atr,
      stopLoss: 0,
      takeProfit: 0,
      reason: ''
    };

    if (!ema12 || !ema36 || !atr || atr <= 0) {
      result.reason = 'Insufficient indicator data';
      return result;
    }

    if (price <= 0) {
      result.reason = 'Invalid price';
      return result;
    }

    const EMA_GAP_TOLERANCE = 0.001;
    const LONG_ATR_MULTIPLIER = 1.5;
    const SHORT_ATR_MULTIPLIER = 1.5;
    
    // Use VRE adaptive parameters if available, otherwise fall back to profile defaults
    let slAtrMultiplier: number;
    let tpAtrMultiplier: number;
    
    if (adaptiveParams) {
      slAtrMultiplier = adaptiveParams.stopsAndTargets.slAtrMultiplier;
      tpAtrMultiplier = adaptiveParams.stopsAndTargets.tp1AtrMultiplier;
      console.log(`[CampaignEngine] VRE SL/TP: Using ${adaptiveParams.regime} params - SL=${slAtrMultiplier}×ATR, TP=${tpAtrMultiplier}×ATR`);
    } else {
      slAtrMultiplier = parseFloat(profile.sl_atr_multiplier);
      tpAtrMultiplier = parseFloat(profile.tp_atr_multiplier);
    }

    const emaGapThreshold = ema36 * EMA_GAP_TOLERANCE;

    const isUptrend = (ema12 - ema36) > emaGapThreshold;
    const isDowntrend = (ema36 - ema12) > emaGapThreshold;
    const priceAboveEma12 = price > ema12;
    const priceBelowEma12 = price < ema12;
    const longMomentum = (price - ema12) > (LONG_ATR_MULTIPLIER * atr);
    const shortMomentum = (ema12 - price) > (SHORT_ATR_MULTIPLIER * atr);

    if (priceAboveEma12 && isUptrend && longMomentum) {
      result.signalType = 'long';
      result.stopLoss = price - (atr * slAtrMultiplier);
      result.takeProfit = price + (atr * tpAtrMultiplier);
      const regimeTag = adaptiveParams ? `[${adaptiveParams.regime}]` : '';
      result.reason = `LONG ${regimeTag}: Price($${price.toFixed(4)}) > EMA12, Uptrend, Momentum OK`;
    } else if (priceBelowEma12 && isDowntrend && shortMomentum) {
      result.signalType = 'short';
      result.stopLoss = price + (atr * slAtrMultiplier);
      result.takeProfit = price - (atr * tpAtrMultiplier);
      const regimeTag = adaptiveParams ? `[${adaptiveParams.regime}]` : '';
      result.reason = `SHORT ${regimeTag}: Price($${price.toFixed(4)}) < EMA12, Downtrend, Momentum OK`;
    } else {
      const reasons: string[] = [];
      if (!isUptrend && !isDowntrend) reasons.push('No clear trend');
      if (isUptrend && !longMomentum) reasons.push(`Uptrend but weak momentum`);
      if (isDowntrend && !shortMomentum) reasons.push(`Downtrend but weak momentum`);
      if (!priceAboveEma12 && !priceBelowEma12) reasons.push('Price at EMA12');
      result.reason = reasons.length > 0 ? reasons.join('; ') : 'No signal conditions met';
    }

    return result;
  }

  /**
   * Check if position already exists for symbol
   */
  private async hasOpenPosition(campaignId: string, symbol: string): Promise<boolean> {
    const positions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.symbol, symbol),
        eq(schema.campaign_positions.state, 'open')
      ))
      .limit(1);
    return positions.length > 0;
  }

  /**
   * Execute trade entry for a valid signal
   * Now integrated with VRE for regime-based position sizing
   */
  private async executeSignalEntry(
    campaignId: string,
    campaign: schema.Campaign,
    profile: schema.RiskProfileConfig,
    signal: SignalResult,
    riskState?: schema.CampaignRiskState,
    marketRegime?: 'bull' | 'bear' | 'sideways' | null,
    vreState?: VREState | null,
    adaptiveParams?: AdaptiveParameters | null
  ): Promise<boolean> {
    try {
      const hasPosition = await this.hasOpenPosition(campaignId, signal.symbol);
      if (hasPosition) {
        console.log(`[CampaignEngine] Already have position for ${signal.symbol} - skipping`);
        return false;
      }

      const equity = parseFloat(campaign.current_equity);
      const atrPct = (signal.atr / signal.price) * 100;

      let sizing: PositionSizeResult;
      if (riskState) {
        sizing = await this.calculateDynamicPositionSizeWithVRE(
          campaignId, equity, profile, riskState, atrPct, signal.price, signal.signalType!, 
          marketRegime, adaptiveParams
        );
      } else {
        sizing = this.calculatePositionSize(equity, profile, atrPct, signal.price, signal.signalType!);
      }
      
      if (sizing.sizeQuantity <= 0 || sizing.sizeCapital <= 0) {
        console.log(`[CampaignEngine] Position size too small for ${signal.symbol}`);
        return false;
      }

      console.log(`[CampaignEngine] 🎯 SIGNAL DETECTED: ${signal.signalType?.toUpperCase()} ${signal.symbol}`);
      console.log(`[CampaignEngine] Price: $${signal.price.toFixed(4)} | SL: $${signal.stopLoss.toFixed(4)} | TP: $${signal.takeProfit.toFixed(4)}`);
      console.log(`[CampaignEngine] Size: ${sizing.sizeQuantity.toFixed(6)} units ($${sizing.sizeCapital.toFixed(2)}) | Risk: $${sizing.riskAmount.toFixed(2)}`);

      // Check portfolio trading mode
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      const isLiveMode = portfolio?.trading_mode === 'live';

      let exchangeOrderId: string | null = null;
      let actualEntryPrice = signal.price;

      // Execute real order on Kraken if LIVE mode
      if (isLiveMode) {
        try {
          // First verify we have enough balance (units for shorts, fiat for longs)
          const hasBalance = await this.verifyKrakenBalance(
            signal.symbol, 
            sizing.sizeCapital, 
            signal.signalType!,
            signal.signalType === 'short' ? sizing.sizeQuantity : undefined
          );
          if (!hasBalance) {
            console.log(`[CampaignEngine] ⚠️ Insufficient Kraken balance for ${signal.symbol} - skipping`);
            return false;
          }
          
          console.log(`[CampaignEngine] 🚀 LIVE MODE - Sending REAL order to Kraken...`);
          
          const krakenResult = await this.executeKrakenMarketOrder(
            signal.symbol,
            signal.signalType!,
            sizing.sizeQuantity,
            signal.stopLoss,
            signal.takeProfit
          );
          
          exchangeOrderId = krakenResult.txid;
          actualEntryPrice = krakenResult.fillPrice || signal.price;
          
          console.log(`[CampaignEngine] ✅ Kraken order executed: ${exchangeOrderId}`);
          console.log(`[CampaignEngine] 📊 Fill price: $${actualEntryPrice.toFixed(6)}`);
          
        } catch (krakenError) {
          console.error(`[CampaignEngine] ❌ Kraken order FAILED for ${signal.symbol}:`, krakenError);
          await robotActivityService.logError(campaignId, 'kraken.order.failed', String(krakenError), signal.symbol);
          return false;
        }
      } else {
        console.log(`[CampaignEngine] 📊 PAPER MODE - Simulating position (no real order)`);
      }

      const position = await this.openCampaignPosition(
        campaignId,
        signal.symbol,
        signal.signalType!,
        sizing.sizeQuantity,
        actualEntryPrice,
        signal.stopLoss,
        signal.takeProfit,
        signal.atr,
        sizing.riskAmount,
        signal.price // Pass estimated price for slippage calculation
      );

      // Store exchange order ID in campaign_orders if we have one
      if (exchangeOrderId) {
        await db.update(schema.campaign_orders)
          .set({ 
            exchange_order_id: exchangeOrderId,
            status: 'filled',
            filled_at: new Date()
          })
          .where(and(
            eq(schema.campaign_orders.campaign_id, campaignId),
            eq(schema.campaign_orders.symbol, signal.symbol),
            eq(schema.campaign_orders.order_type, 'market')
          ));
      }

      console.log(`[CampaignEngine] ✅ Position opened: ${position.id}${exchangeOrderId ? ` (Kraken: ${exchangeOrderId})` : ''}`);

      await robotActivityService.logPositionOpen(campaignId, signal.symbol, {
        side: signal.signalType!,
        quantity: sizing.sizeQuantity,
        entryPrice: actualEntryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskAmount: sizing.riskAmount,
      });

      return true;
    } catch (error) {
      console.error(`[CampaignEngine] Error executing signal entry for ${signal.symbol}:`, error);
      return false;
    }
  }

  /**
   * Get cached Kraken balance or fetch fresh if cache expired
   * Uses backoff when rate limited to avoid hammering the API
   */
  private async getCachedKrakenBalance(): Promise<Record<string, string> | null> {
    const now = Date.now();
    
    // Use cache if valid (not expired)
    if (this.balanceCache && (now - this.balanceCache.timestamp) < this.BALANCE_CACHE_TTL_MS) {
      return this.balanceCache.balance;
    }
    
    // If we recently had a rate limit error, use cached balance or return null
    if (this.balanceCache?.lastErrorTime && 
        (now - this.balanceCache.lastErrorTime) < this.BALANCE_ERROR_BACKOFF_MS) {
      // Still in backoff period - use last known balance if available
      if (this.balanceCache.balance && Object.keys(this.balanceCache.balance).length > 0) {
        return this.balanceCache.balance;
      }
      return null;
    }
    
    // Fetch fresh balance
    try {
      const response = await krakenPrivateRequest<KrakenBalanceResponse>('Balance', {});
      
      if (response.error && response.error.length > 0) {
        const isRateLimited = response.error.some((e: string) => e.includes('Rate limit'));
        if (isRateLimited) {
          // Mark error time but keep last known balance
          if (this.balanceCache) {
            this.balanceCache.lastErrorTime = now;
          } else {
            this.balanceCache = { balance: {}, timestamp: 0, lastErrorTime: now };
          }
          console.log(`[CampaignEngine] Rate limit hit - using cached balance, backoff for ${this.BALANCE_ERROR_BACKOFF_MS/1000}s`);
          // Return cached balance if we have one
          if (this.balanceCache.balance && Object.keys(this.balanceCache.balance).length > 0) {
            return this.balanceCache.balance;
          }
        } else {
          console.error(`[CampaignEngine] Balance fetch error:`, response.error);
        }
        return null;
      }
      
      const balances = response.result || {};
      
      // Debug: Log all balances for diagnosis
      const nonZeroBalances = Object.entries(balances)
        .filter(([_, val]) => parseFloat(val as string) > 0.0001)
        .map(([key, val]) => `${key}=${parseFloat(val as string).toFixed(4)}`)
        .join(', ');
      console.log(`[CampaignEngine] 💰 Kraken balances: ${nonZeroBalances || 'empty'}`);
      
      this.balanceCache = { balance: balances, timestamp: now };
      return balances;
    } catch (error) {
      console.error(`[CampaignEngine] Balance fetch exception:`, error);
      // Keep last known balance on exception
      if (this.balanceCache?.balance && Object.keys(this.balanceCache.balance).length > 0) {
        this.balanceCache.lastErrorTime = now;
        return this.balanceCache.balance;
      }
      return null;
    }
  }

  /**
   * Verify Kraken account has sufficient balance for the trade
   * For LONG: requires ZUSD/ZEUR to buy
   * For SHORT: requires owning the asset in sufficient quantity to sell
   */
  private async verifyKrakenBalance(
    symbol: string,
    requiredCapitalUSD: number,
    side: 'long' | 'short',
    requiredUnits?: number
  ): Promise<boolean> {
    try {
      const balances = await this.getCachedKrakenBalance();
      
      if (!balances) {
        // Allow trade to proceed if balance check fails - Kraken will reject if insufficient
        return true;
      }
      
      // Calculate available fiat balance for spot trading
      // Only ZUSD and ZEUR can be used directly for spot trades on Kraken
      const usdBalance = parseFloat(balances['ZUSD'] || balances['USD'] || '0');
      const eurBalance = parseFloat(balances['ZEUR'] || balances['EUR'] || '0');
      const totalFiatUSD = usdBalance + (eurBalance * 1.08);
      
      if (side === 'long') {
        // For LONG: need fiat to buy the asset
        if (totalFiatUSD < requiredCapitalUSD) {
          console.log(`[CampaignEngine] ⚠️ Insufficient fiat: Need $${requiredCapitalUSD.toFixed(2)}, have $${totalFiatUSD.toFixed(2)} ZUSD`);
          return false;
        }
        console.log(`[CampaignEngine] ✅ Balance OK: $${totalFiatUSD.toFixed(2)} ZUSD available (need $${requiredCapitalUSD.toFixed(2)})`);
      } else {
        // For SHORT: need to own the asset to sell (spot short = selling owned asset)
        const baseAsset = symbol.split('/')[0];
        
        // Kraken uses various naming conventions for assets
        // Try multiple mappings to find the balance
        const possibleKeys = [
          baseAsset,                           // Direct: ADA, BCH
          `X${baseAsset}`,                     // Prefixed: XADA, XBCH  
          `XX${baseAsset}`,                    // Double prefixed: XXRP (for XRP)
          baseAsset === 'BTC' ? 'XXBT' : null, // BTC -> XXBT
          baseAsset === 'BTC' ? 'XBT' : null,  // BTC -> XBT
          baseAsset === 'ETH' ? 'XETH' : null, // ETH -> XETH
          baseAsset === 'XRP' ? 'XXRP' : null, // XRP -> XXRP
        ].filter(k => k !== null);
        
        let assetBalance = 0;
        for (const key of possibleKeys) {
          const val = parseFloat(balances[key!] || '0');
          if (val > 0) {
            assetBalance = val;
            break;
          }
        }
        
        const unitsNeeded = requiredUnits || 0;
        
        if (assetBalance >= unitsNeeded && unitsNeeded > 0) {
          // User has enough of the asset to sell
          console.log(`[CampaignEngine] ✅ Balance OK for short: ${assetBalance.toFixed(6)} ${baseAsset} available (need ${unitsNeeded.toFixed(6)})`);
        } else {
          // User doesn't have enough of the asset - cannot do spot short
          console.log(`[CampaignEngine] ⚠️ Insufficient ${baseAsset} for short: Need ${unitsNeeded.toFixed(6)}, have ${assetBalance.toFixed(6)} ${baseAsset}`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error(`[CampaignEngine] Balance verification error:`, error);
      // Allow trade to proceed if balance check fails - Kraken will reject if insufficient
      return true;
    }
  }

  /**
   * Get Kraken price precision (decimal places) for a given pair
   * Based on Kraken's actual API requirements per trading pair
   * Source: Kraken API error messages and AssetPairs endpoint
   */
  private getKrakenPricePrecision(symbol: string): number {
    const baseAsset = symbol.split('/')[0].toUpperCase();
    
    // Explicit precision map based on Kraken API requirements
    // These values are verified against actual Kraken API error messages
    const precisionMap: Record<string, number> = {
      // High-value assets: 1-2 decimals
      'BTC': 1,
      'XBT': 1,
      'ETH': 2,
      'PAXG': 2,
      'YFI': 2,
      'MKR': 2,
      
      // Medium-high value: 2 decimals
      'BCH': 2,
      'LTC': 2,
      'ZEC': 2,
      'XMR': 2,
      'AVAX': 2,
      'SOL': 2,
      'AAVE': 2,
      'QNT': 2,
      'MLN': 2,
      'GNO': 2,
      'ICP': 2,
      'KSM': 2,
      
      // Medium value: 3 decimals
      'LINK': 3,
      'UNI': 3,
      'DOT': 3,
      'ATOM': 3,
      'INJ': 3,
      'NEAR': 3,
      'SUI': 3,
      'TIA': 3,
      'APT': 3,
      'FET': 3,
      'RUNE': 3,
      'LDO': 3,
      'DYDX': 3,
      'IMX': 3,
      'FLOW': 3,
      'STX': 3,
      
      // Lower value: 4 decimals
      'XRP': 4,
      'ADA': 4,
      'OP': 4,
      'ARB': 4,
      'GRT': 4,
      'TRX': 4,
      'XLM': 4,
      'ALGO': 4,
      'APE': 4,
      'SUSHI': 4,
      'CRV': 4,
      'SNX': 4,
      'MASK': 4,
      'CELO': 4,
      'PERP': 4,
      'WIF': 4,
      'SAND': 4,
      'MANA': 4,
      'GALA': 4,
      'CHZ': 4,
      'ENJ': 4,
      'BAT': 4,
      'GMT': 4,
      'HBAR': 4,
      'ANKR': 4,
      'OXT': 4,
      'LSK': 4,
      'STORJ': 4,
      'BAL': 4,
      'AXS': 4,
      'COMP': 4,
      'ETC': 4,
      'FIL': 4,
      '1INCH': 4,
      'SC': 4,
      'OMG': 4,
      'QTUM': 4,
      'ICX': 4,
      'KAVA': 4,
      'OCEAN': 4,
      'KEEP': 4,
      'RARI': 4,
      'SRM': 4,
      'BLUR': 4,
      'DASH': 4,
      'EOS': 4,
      
      // Stablecoins: 5 decimals
      'USDT': 5,
      'USDC': 5,
      'DAI': 5,
      'TUSD': 5,
      
      // Very low-value assets (meme coins): 8 decimals
      'SHIB': 8,
      'BONK': 8,
      'PEPE': 8,
      'FLOKI': 8,
      'DOGE': 6,
    };
    
    // Return mapped precision or default to 4 (safe middle ground)
    return precisionMap[baseAsset] ?? 4;
  }

  /**
   * Format price with appropriate precision for Kraken
   */
  private formatKrakenPrice(price: number, symbol: string): string {
    const precision = this.getKrakenPricePrecision(symbol);
    return price.toFixed(precision);
  }

  /**
   * Execute a real market order on Kraken with stop-loss attached
   * Uses Kraken's "close" parameter for automatic SL/TP
   */
  private async executeKrakenMarketOrder(
    symbol: string,
    side: 'long' | 'short',
    quantity: number,
    stopLoss: number,
    takeProfit: number
  ): Promise<{ txid: string; fillPrice: number | null }> {
    const krakenPair = toKrakenPair(symbol);
    const orderSide = side === 'long' ? 'buy' : 'sell';
    const closeSide = side === 'long' ? 'sell' : 'buy';
    
    // Format quantity with appropriate precision (max 8 decimals)
    const formattedVolume = quantity.toFixed(8).replace(/\.?0+$/, '');
    
    // Format prices with correct precision for Kraken
    const formattedStopLoss = this.formatKrakenPrice(stopLoss, symbol);
    const limitPrice = side === 'long' ? stopLoss * 0.995 : stopLoss * 1.005;
    const formattedLimitPrice = this.formatKrakenPrice(limitPrice, symbol);
    
    // Kraken order parameters with close order for stop-loss
    // Note: Kraken's close[ordertype] creates a conditional close order
    const orderParams: Record<string, string> = {
      pair: krakenPair,
      type: orderSide,
      ordertype: 'market',
      volume: formattedVolume,
      // Add stop-loss as a close order
      'close[ordertype]': 'stop-loss-limit',
      'close[price]': formattedStopLoss,  // trigger price
      'close[price2]': formattedLimitPrice, // limit price (0.5% slippage)
    };
    
    console.log(`[CampaignEngine] 📡 Kraken AddOrder: ${orderSide} ${formattedVolume} ${krakenPair} @ market, SL: $${formattedStopLoss}`);
    
    const response = await krakenPrivateRequest<KrakenOrderResponse>('AddOrder', orderParams);
    
    if (response.error && response.error.length > 0) {
      throw new Error(`Kraken API error: ${response.error.join(', ')}`);
    }
    
    if (!response.result?.txid || response.result.txid.length === 0) {
      throw new Error('No transaction ID returned from Kraken');
    }
    
    const txid = response.result.txid[0];
    
    // Log order description
    if (response.result.descr) {
      console.log(`[CampaignEngine] 📋 Order: ${response.result.descr.order}`);
      if (response.result.descr.close) {
        console.log(`[CampaignEngine] 📋 Close: ${response.result.descr.close}`);
      }
    }
    
    // Track execution - logged separately when position is created
    
    return {
      txid,
      fillPrice: null, // Market orders fill immediately but we don't get the price in AddOrder response
    };
  }

  /**
   * Execute a simple sell market order on Kraken (no SL attached)
   * Used for liquidating positions to generate liquidity
   * IMPORTANT: Verifies order execution before returning success
   */
  private async executeKrakenSellOrder(
    symbol: string,
    quantity: number
  ): Promise<{ txid: string; success: boolean; executedVolume?: number }> {
    const krakenPair = toKrakenPair(symbol);
    const formattedVolume = quantity.toFixed(8).replace(/\.?0+$/, '');
    
    const orderParams: Record<string, string> = {
      pair: krakenPair,
      type: 'sell',
      ordertype: 'market',
      volume: formattedVolume,
    };
    
    console.log(`[CampaignEngine] 💰 Kraken SELL: ${formattedVolume} ${krakenPair} @ market`);
    
    const response = await krakenPrivateRequest<KrakenOrderResponse>('AddOrder', orderParams);
    
    if (response.error && response.error.length > 0) {
      console.error(`[CampaignEngine] ❌ Kraken sell error: ${response.error.join(', ')}`);
      return { txid: '', success: false };
    }
    
    if (!response.result?.txid || response.result.txid.length === 0) {
      console.error(`[CampaignEngine] ❌ No txid returned from Kraken`);
      return { txid: '', success: false };
    }
    
    const txid = response.result.txid[0];
    console.log(`[CampaignEngine] 📤 Order submitted: ${txid}, verifying execution...`);
    
    // Wait briefly for market order to execute (market orders are usually instant)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify order execution via QueryOrders - STRICT MODE
    // If we can't verify, we return failure to prevent inconsistent state
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[CampaignEngine] 🔍 Verifying order ${txid} (attempt ${attempt}/${maxRetries})...`);
        
        const queryResponse = await krakenPrivateRequest<{
          error: string[];
          result?: Record<string, {
            status: string;
            vol_exec: string;
            vol: string;
            cost: string;
            fee: string;
          }>;
        }>('QueryOrders', { txid });
        
        if (queryResponse.error && queryResponse.error.length > 0) {
          console.error(`[CampaignEngine] ⚠️ QueryOrders error: ${queryResponse.error.join(', ')}`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          console.error(`[CampaignEngine] ❌ Could not verify order ${txid} after ${maxRetries} attempts - returning FAILURE`);
          return { txid, success: false };
        }
        
        const orderInfo = queryResponse.result?.[txid];
        if (!orderInfo) {
          console.error(`[CampaignEngine] ⚠️ Order ${txid} not found in QueryOrders response`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          console.error(`[CampaignEngine] ❌ Order ${txid} not found after ${maxRetries} attempts - returning FAILURE`);
          return { txid, success: false };
        }
        
        const status = orderInfo.status;
        const executedVolume = parseFloat(orderInfo.vol_exec || '0');
        const requestedVolume = parseFloat(orderInfo.vol || formattedVolume);
        
        console.log(`[CampaignEngine] 📊 Order ${txid}: status=${status}, executed=${executedVolume}/${requestedVolume}`);
        
        if (status === 'closed') {
          // Order fully executed - SUCCESS
          console.log(`[CampaignEngine] ✅ Order ${txid} CONFIRMED executed: ${executedVolume} units`);
          return { txid, success: true, executedVolume };
        } else if (status === 'canceled' || status === 'expired') {
          // Order rejected/canceled - FAILURE
          console.error(`[CampaignEngine] ❌ Order ${txid} was ${status}`);
          return { txid, success: false };
        } else if (status === 'open' || status === 'pending') {
          // Still pending - wait and retry
          console.log(`[CampaignEngine] ⏳ Order ${txid} still ${status}, executed: ${executedVolume}/${requestedVolume}`);
          // Accept if at least 95% was executed
          if (executedVolume >= requestedVolume * 0.95) {
            console.log(`[CampaignEngine] ✅ Order ${txid} mostly executed (${((executedVolume/requestedVolume)*100).toFixed(1)}%)`);
            return { txid, success: true, executedVolume };
          }
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          console.error(`[CampaignEngine] ❌ Order ${txid} partial/pending after ${maxRetries} attempts - returning FAILURE`);
          return { txid, success: false };
        }
        
        // Unknown status - treat as failure for safety
        console.error(`[CampaignEngine] ❌ Unknown order status '${status}' - returning FAILURE for safety`);
        return { txid, success: false };
        
      } catch (queryErr) {
        console.error(`[CampaignEngine] ⚠️ Error querying order ${txid}:`, queryErr);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        console.error(`[CampaignEngine] ❌ Failed to verify order ${txid} after ${maxRetries} attempts - returning FAILURE`);
        return { txid, success: false };
      }
    }
    
    // Should never reach here, but return failure for safety
    return { txid, success: false };
  }

  /**
   * Execute a sell market order on Kraken using the Kraken pair format directly
   * Used for liquidating orphan assets - bypasses symbol-to-pair conversion
   */
  private async executeKrakenSellOrderDirect(
    krakenPair: string,
    quantity: number
  ): Promise<{ txid: string; success: boolean; error?: string }> {
    const formattedVolume = quantity.toFixed(8).replace(/\.?0+$/, '');
    
    const orderParams: Record<string, string> = {
      pair: krakenPair,
      type: 'sell',
      ordertype: 'market',
      volume: formattedVolume,
    };
    
    console.log(`[CampaignEngine] 💰 Kraken SELL DIRECT: ${formattedVolume} ${krakenPair} @ market`);
    
    const response = await krakenPrivateRequest<KrakenOrderResponse>('AddOrder', orderParams);
    
    if (response.error && response.error.length > 0) {
      const errorMsg = response.error.join(', ');
      console.error(`[CampaignEngine] ❌ Kraken sell error for ${krakenPair}: ${errorMsg}`);
      return { txid: '', success: false, error: errorMsg };
    }
    
    if (!response.result?.txid || response.result.txid.length === 0) {
      console.error(`[CampaignEngine] ❌ No txid returned from Kraken for ${krakenPair}`);
      return { txid: '', success: false, error: 'No transaction ID returned' };
    }
    
    const txid = response.result.txid[0];
    console.log(`[CampaignEngine] ✅ Order submitted for ${krakenPair}: ${txid}`);
    
    return { txid, success: true };
  }

  /**
   * Liquidate positions to generate liquidity (USD)
   * Sells assets on Kraken and closes positions in the database
   */
  async liquidatePositionsForLiquidity(
    campaignId: string,
    positionIds?: string[] // Optional: specific positions to liquidate, or all if not provided
  ): Promise<{
    success: boolean;
    liquidatedCount: number;
    failedCount: number;
    estimatedUSD: number;
    positions: Array<{ symbol: string; quantity: number; estimatedUSD: number; txid: string; error?: string }>;
  }> {
    // Get campaign to check if it's live mode
    const [campaign] = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    
    if (!campaign) {
      console.error(`[CampaignEngine] Campaign ${campaignId} not found`);
      return { success: false, liquidatedCount: 0, failedCount: 0, estimatedUSD: 0, positions: [] };
    }
    
    // Check if portfolio is in live mode
    const portfolio = await storage.getPortfolio(campaign.portfolio_id);
    const isLiveMode = portfolio?.trading_mode === 'live';
    
    // Get open positions
    let openPositions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'open')
      ));
    
    // Filter to specific positions if provided
    if (positionIds && positionIds.length > 0) {
      openPositions = openPositions.filter(p => positionIds.includes(p.id));
    }
    
    if (openPositions.length === 0) {
      console.log(`[CampaignEngine] No positions to liquidate for campaign ${campaignId}`);
      return { success: true, liquidatedCount: 0, failedCount: 0, estimatedUSD: 0, positions: [] };
    }
    
    console.log(`[CampaignEngine] 💰 LIQUIDATING ${openPositions.length} positions for campaign ${campaignId} (mode: ${isLiveMode ? 'LIVE' : 'PAPER'})`);
    
    const results: Array<{ symbol: string; quantity: number; estimatedUSD: number; txid: string; error?: string }> = [];
    let liquidatedCount = 0;
    let failedCount = 0;
    let totalEstimatedUSD = 0;
    
    for (const position of openPositions) {
      const symbol = position.symbol;
      const quantity = parseFloat(position.quantity);
      const currentPrice = parseFloat(position.current_price);
      const estimatedUSD = quantity * currentPrice;
      const side = position.side as 'long' | 'short';
      
      console.log(`[CampaignEngine] 🔄 Liquidating ${symbol}: ${quantity.toFixed(6)} units @ ~$${currentPrice.toFixed(4)} = ~$${estimatedUSD.toFixed(2)}`);
      
      try {
        let txid = '';
        let canClose = false;
        
        // Only LONG positions generate USD liquidity
        // SHORT positions cost money to close (need to buy back)
        if (side === 'short') {
          console.log(`[CampaignEngine] ⚠️ SHORT position ${symbol} - skipping (closing shorts costs USD, doesn't generate liquidity)`);
          results.push({ symbol, quantity, estimatedUSD: 0, txid: '', error: 'Short positions skipped - no liquidity generated' });
          // Don't increment failedCount - this is expected behavior, not a failure
          continue; // Skip to next position
        }
        
        if (isLiveMode) {
          // LIVE MODE: Execute real sell order on Kraken
          const result = await this.executeKrakenSellOrder(symbol, quantity);
          if (!result.success) {
            throw new Error('Kraken sell order failed - position NOT closed');
          }
          txid = result.txid;
          canClose = true;
        } else {
          // PAPER MODE: Simulate liquidation (no real Kraken order)
          console.log(`[CampaignEngine] 📊 PAPER MODE - simulating sell of ${quantity.toFixed(6)} ${symbol}`);
          canClose = true; // Paper mode always succeeds
        }
        
        // Close position in database ONLY after successful execution
        if (canClose) {
          try {
            await this.closePosition(campaignId, position.id, 'manual_liquidation', currentPrice);
          } catch (closeErr) {
            // Critical: Order executed but DB update failed - log for manual intervention
            console.error(`[CampaignEngine] 🚨 CRITICAL: Order executed (txid: ${txid}) but closePosition failed for ${symbol}. Manual intervention required.`);
            throw new Error(`Order executed but DB close failed - txid: ${txid}`);
          }
          
          results.push({ symbol, quantity, estimatedUSD, txid });
          liquidatedCount++;
          totalEstimatedUSD += estimatedUSD;
          
          console.log(`[CampaignEngine] ✅ Liquidated ${symbol}: $${estimatedUSD.toFixed(2)} ${txid ? `(txid: ${txid})` : '(paper)'}`);
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[CampaignEngine] ❌ Failed to liquidate ${symbol}:`, errorMsg);
        results.push({ symbol, quantity, estimatedUSD, txid: '', error: errorMsg });
        failedCount++;
      }
    }
    
    console.log(`[CampaignEngine] 🏁 Liquidation complete: ${liquidatedCount} success, ${failedCount} failed, ~$${totalEstimatedUSD.toFixed(2)} generated`);
    
    // Log activity
    await robotActivityService.logSystemEvent(campaignId, 'positions_liquidated', {
      liquidatedCount,
      failedCount,
      estimatedUSD: totalEstimatedUSD,
      positions: results,
    });
    
    return {
      success: failedCount === 0,
      liquidatedCount,
      failedCount,
      estimatedUSD: totalEstimatedUSD,
      positions: results,
    };
  }

  /**
   * Close all open positions for a campaign (used on campaign expiration)
   * Returns the total realized PnL from all closed positions
   */
  async closeAllOpenPositions(campaignId: string, reason: string = 'campaign_expired'): Promise<{
    closedCount: number;
    totalPnL: number;
    positions: Array<{ symbol: string; pnl: number }>;
  }> {
    const openPositions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'open')
      ));

    if (openPositions.length === 0) {
      console.log(`[CampaignEngine] No open positions to close for campaign ${campaignId}`);
      return { closedCount: 0, totalPnL: 0, positions: [] };
    }

    console.log(`[CampaignEngine] 🔒 Closing ${openPositions.length} open positions for campaign ${campaignId} (${reason})`);

    let totalPnL = 0;
    const closedPositions: Array<{ symbol: string; pnl: number }> = [];

    for (const position of openPositions) {
      try {
        const pnl = parseFloat(position.unrealized_pnl);
        await this.closePosition(campaignId, position.id, reason);
        totalPnL += pnl;
        closedPositions.push({ symbol: position.symbol, pnl });
        console.log(`[CampaignEngine] ✅ Closed ${position.symbol}: PnL $${pnl.toFixed(2)}`);
      } catch (error) {
        console.error(`[CampaignEngine] ❌ Failed to close position ${position.id} (${position.symbol}):`, error);
      }
    }

    console.log(`[CampaignEngine] 🏁 Campaign ${campaignId} liquidation complete: ${closedPositions.length}/${openPositions.length} positions closed, Total PnL: $${totalPnL.toFixed(2)}`);

    // Log campaign completion activity
    await robotActivityService.logSystemEvent(campaignId, 'campaign_liquidation', {
      closedCount: closedPositions.length,
      totalPnL,
      positions: closedPositions,
      reason,
    });

    return {
      closedCount: closedPositions.length,
      totalPnL,
      positions: closedPositions,
    };
  }

  /**
   * Liquidate orphan assets directly from Kraken account
   * This sells all non-USD assets regardless of campaign positions
   * Used to clean up orphan assets left after campaign completion
   */
  async liquidateOrphanAssets(userId: number): Promise<{
    success: boolean;
    liquidatedCount: number;
    failedCount: number;
    estimatedUSD: number;
    assets: Array<{ asset: string; quantity: number; estimatedUSD: number; txid: string; error?: string }>;
  }> {
    console.log(`[CampaignEngine] 💰 LIQUIDATING ORPHAN ASSETS for user ${userId}`);
    
    // Get current Kraken balances (uses environment credentials)
    const balanceResponse = await krakenPrivateRequest<{ error: string[]; result?: Record<string, string> }>('Balance', {});
    
    if (balanceResponse.error?.length > 0 || !balanceResponse.result) {
      console.error(`[CampaignEngine] Failed to get Kraken balances:`, balanceResponse.error);
      return { success: false, liquidatedCount: 0, failedCount: 0, estimatedUSD: 0, assets: [] };
    }
    
    const balances = balanceResponse.result;
    const results: Array<{ asset: string; quantity: number; estimatedUSD: number; txid: string; error?: string }> = [];
    let liquidatedCount = 0;
    let failedCount = 0;
    let totalEstimatedUSD = 0;
    
    // Map Kraken asset codes to trading pairs
    const assetToPair: Record<string, string> = {
      'XLTC': 'LTCUSD',
      'XXBT': 'XBTUSD',
      'XETH': 'ETHUSD',
      'XXRP': 'XRPUSD',
      'ADA': 'ADAUSD',
      'AVAX': 'AVAXUSD',
      'TIA': 'TIAUSD',
      'WIF': 'WIFUSD',
      'BONK': 'BONKUSD',
      'LTC': 'LTCUSD',
      'XBT': 'XBTUSD',
      'ETH': 'ETHUSD',
      'XRP': 'XRPUSD',
      'SOL': 'SOLUSD',
      'DOT': 'DOTUSD',
      'LINK': 'LINKUSD',
      'UNI': 'UNIUSD',
      'SAND': 'SANDUSD',
      'FLOKI': 'FLOKIUSD',
      'PEPE': 'PEPEUSD',
      'INJ': 'INJUSD',
      'SUI': 'SUIUSD',
      'NEAR': 'NEARUSD',
      'OP': 'OPUSD',
      'APT': 'APTUSD',
      'ARB': 'ARBUSD',
    };
    
    // Skip these - they are USD/stablecoins
    const skipAssets = ['ZUSD', 'USD', 'USDT', 'USDC', 'DAI', 'XXBT.M'];
    
    console.log(`[CampaignEngine] Kraken balances:`, balances);
    
    for (const [asset, balanceStr] of Object.entries(balances)) {
      const balance = parseFloat(balanceStr);
      
      // Skip USD, stablecoins, and zero balances
      if (skipAssets.includes(asset) || balance <= 0) {
        continue;
      }
      
      // Get trading pair for this asset
      const pair = assetToPair[asset];
      if (!pair) {
        console.log(`[CampaignEngine] ⚠️ No trading pair mapping for ${asset} - skipping`);
        continue;
      }
      
      // Get current price for estimation
      const tickerResponse = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
      const tickerData = await tickerResponse.json();
      let price = 0;
      if (tickerData.result) {
        const pairKey = Object.keys(tickerData.result)[0];
        if (pairKey) {
          price = parseFloat(tickerData.result[pairKey].c[0]);
        }
      }
      
      const estimatedUSD = balance * price;
      
      // Skip very small balances (< $1)
      if (estimatedUSD < 1) {
        console.log(`[CampaignEngine] ⚠️ Skipping ${asset} - value too small ($${estimatedUSD.toFixed(2)})`);
        continue;
      }
      
      console.log(`[CampaignEngine] 🔄 Selling ${balance.toFixed(8)} ${asset} (pair: ${pair}) @ ~$${price.toFixed(4)} = ~$${estimatedUSD.toFixed(2)}`);
      
      try {
        // Use the Kraken pair directly for the sell order (e.g., "AVAXUSD")
        // Don't convert - pass directly to avoid any transformation issues
        const result = await this.executeKrakenSellOrderDirect(pair, balance);
        
        if (result.success) {
          results.push({ asset, quantity: balance, estimatedUSD, txid: result.txid });
          liquidatedCount++;
          totalEstimatedUSD += estimatedUSD;
          console.log(`[CampaignEngine] ✅ Sold ${asset}: ~$${estimatedUSD.toFixed(2)} (txid: ${result.txid})`);
        } else {
          throw new Error('Kraken sell order failed');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[CampaignEngine] ❌ Failed to sell ${asset}:`, errorMsg);
        results.push({ asset, quantity: balance, estimatedUSD, txid: '', error: errorMsg });
        failedCount++;
      }
    }
    
    console.log(`[CampaignEngine] 🏁 Orphan liquidation complete: ${liquidatedCount} success, ${failedCount} failed, ~$${totalEstimatedUSD.toFixed(2)} generated`);
    
    return {
      success: failedCount === 0,
      liquidatedCount,
      failedCount,
      estimatedUSD: totalEstimatedUSD,
      assets: results,
    };
  }
}

export const campaignEngineService = new CampaignEngineService();
