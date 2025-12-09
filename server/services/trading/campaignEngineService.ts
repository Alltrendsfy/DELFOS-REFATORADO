import { db } from '../../db';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { storage } from '../../storage';
import { observabilityService } from '../observabilityService';
import { robotActivityService } from '../robotActivityService';
import { assetSelectorService } from '../market/assetSelectorService';
import { dataIngestionService } from '../dataIngestionService';
import { indicatorService } from '../market/indicatorService';
import { stalenessGuardService } from '../stalenessGuardService';
import { nanoid } from 'nanoid';

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
      // Determine selection count based on investor profile
      // Conservative: fewer assets (more focused), Aggressive: more assets (diversified opportunities)
      const selectionCount = this.getSelectionCountByProfile(profile);
      
      // Run asset selection with K-means clustering
      const selectionResult = await assetSelectorService.runSelection(selectionCount);
      
      if (selectionResult.selected.length === 0) {
        console.log(`[CampaignEngine] No tradable assets found by selector`);
        await robotActivityService.logError(campaignId, 'robot.asset_selection.empty', 'No tradable assets found');
        return [];
      }
      
      console.log(`[CampaignEngine] Selected ${selectionResult.selected.length} assets for campaign ${campaignId}`);
      
      // Populate campaign_asset_universes table
      const universeRecords: schema.CampaignAssetUniverse[] = [];
      const totalAssets = selectionResult.selected.length;
      
      for (const asset of selectionResult.selected) {
        // Calculate equal initial weight as string for decimal column
        const weightValue = (1.0 / totalAssets).toFixed(6);
        const scoreValue = asset.score.toFixed(4);
        
        const [inserted] = await db.insert(schema.campaign_asset_universes).values({
          campaign_id: campaignId,
          symbol: asset.symbol.symbol,
          initial_weight: weightValue,
          current_weight: weightValue,
          is_active: true,
          is_in_tradable_set: false,
          last_score: scoreValue,
          last_rank: asset.rank,
          cluster_number: null, // Will be populated by ClusterService if needed
          is_problematic: false,
          last_rebalance_at: new Date(),
        }).returning();
        
        universeRecords.push(inserted);
      }
      
      console.log(`[CampaignEngine] Populated ${universeRecords.length} assets in campaign universe`);
      
      // Log detailed asset selection activity
      await robotActivityService.logAssetSelection(campaignId, {
        runId: selectionResult.runId,
        profile: profile.profile_code,
        symbolsScanned: selectionResult.selected.length + selectionResult.rejected,
        selectedCount: selectionResult.selected.length,
        rejectedCount: selectionResult.rejected,
        topSymbols: selectionResult.selected.slice(0, 5).map(a => a.symbol.symbol)
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

    const positions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'closed'),
        gte(schema.campaign_positions.closed_at, yesterday)
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
      }
    });

    await db.update(schema.campaign_risk_states)
      .set({
        last_audit_ts: new Date(),
        updated_at: new Date()
      })
      .where(eq(schema.campaign_risk_states.campaign_id, campaignId));

    console.log(`[CampaignEngine] Audit complete: ${tradesCount} trades, ${hitRate.toFixed(1)}% hit rate, PnL: $${pnlDay.toFixed(2)}`);
  }

  private async processTradingCycle(
    campaign: schema.Campaign,
    profile: schema.RiskProfileConfig,
    riskState: schema.CampaignRiskState
  ): Promise<void> {
    const campaignId = campaign.id;

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

        const marketData = await this.getMarketData(symbol);
        if (!marketData) {
          skippedReasons['NO_MARKET_DATA'] = (skippedReasons['NO_MARKET_DATA'] || 0) + 1;
          continue;
        }

        const signal = this.evaluateSignal(marketData, profile);
        
        if (signal.signalType) {
          signalsFound++;
          signalDetails.push(`${signal.signalType.toUpperCase()} ${symbol}`);
          
          const executed = await this.executeSignalEntry(campaignId, campaign, profile, signal);
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

  async openCampaignPosition(
    campaignId: string,
    symbol: string,
    side: 'long' | 'short',
    quantity: number,
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
    atrAtEntry: number,
    riskAmount: number
  ): Promise<schema.CampaignPosition> {
    const ocoGroupId = `OCO-${nanoid(8)}`;
    
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

      return position;
    });
  }

  async closePosition(
    campaignId: string,
    positionId: string,
    reason: string
  ): Promise<void> {
    const [position] = await db.select().from(schema.campaign_positions)
      .where(eq(schema.campaign_positions.id, positionId));

    if (!position || position.state !== 'open') {
      return;
    }

    const realizedPnl = parseFloat(position.unrealized_pnl);
    const riskAmount = parseFloat(position.risk_amount || "1");
    const pnlInR = riskAmount > 0 ? realizedPnl / riskAmount : 0;

    await db.update(schema.campaign_positions)
      .set({
        state: 'closed',
        close_reason: reason,
        realized_pnl: position.unrealized_pnl,
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
    }

    if (pairCBUpdated || cbDailyTriggered !== riskState.cb_daily_triggered || cbCampaignTriggered !== riskState.cb_campaign_triggered) {
      const cooldownMinutes = profile.cooldown_minutes_after_cb;
      const cooldownUntil = cbDailyTriggered || cbCampaignTriggered 
        ? new Date(Date.now() + cooldownMinutes * 60 * 1000) 
        : null;

      await db.update(schema.campaign_risk_states)
        .set({
          cb_pair_triggered: cbPairTriggered,
          cb_daily_triggered: cbDailyTriggered,
          cb_campaign_triggered: cbCampaignTriggered,
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
      
      if (cbPairTriggered[position.symbol] || riskState.cb_campaign_triggered) {
        await this.closePosition(campaignId, position.id, 'breaker_exit');
        continue;
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
   */
  private async getMarketData(symbol: string): Promise<MarketData | null> {
    try {
      const priceStr = await dataIngestionService.getCurrentPrice('kraken', symbol);
      if (!priceStr) {
        return null;
      }
      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) {
        return null;
      }

      const symbolRecord = await storage.getSymbol(symbol);
      if (!symbolRecord) {
        return null;
      }

      const indicators = await indicatorService.calculateIndicators(symbolRecord);
      
      const l1Quote = await dataIngestionService.getL1Quote('kraken', symbol);
      const spread = l1Quote ? parseFloat(l1Quote.spread_bps) : 0;

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
   */
  private async executeSignalEntry(
    campaignId: string,
    campaign: schema.Campaign,
    profile: schema.RiskProfileConfig,
    signal: SignalResult
  ): Promise<boolean> {
    try {
      const hasPosition = await this.hasOpenPosition(campaignId, signal.symbol);
      if (hasPosition) {
        console.log(`[CampaignEngine] Already have position for ${signal.symbol} - skipping`);
        return false;
      }

      const equity = parseFloat(campaign.current_equity);
      const atrPct = (signal.atr / signal.price) * 100;

      const sizing = this.calculatePositionSize(equity, profile, atrPct, signal.price, signal.signalType!);
      
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

      if (isLiveMode) {
        console.log(`[CampaignEngine] ⚠️ LIVE MODE - Would execute real trade (disabled for safety)`);
        
        await robotActivityService.logSignalAnalysis(campaignId, signal.symbol, {
          signal: signal.signalType!.toUpperCase() as 'LONG' | 'SHORT' | 'NEUTRAL',
          price: signal.price,
          ema12: signal.ema12,
          ema36: signal.ema36,
          atr: signal.atr,
          reason: 'Live execution disabled - signal detected',
          sl: signal.stopLoss,
          tp1: signal.takeProfit,
        });
        return false;
      }

      const position = await this.openCampaignPosition(
        campaignId,
        signal.symbol,
        signal.signalType!,
        sizing.sizeQuantity,
        signal.price,
        signal.stopLoss,
        signal.takeProfit,
        signal.atr,
        sizing.riskAmount
      );

      console.log(`[CampaignEngine] ✅ Position opened: ${position.id}`);

      await robotActivityService.logPositionOpen(campaignId, signal.symbol, {
        side: signal.signalType!,
        quantity: sizing.sizeQuantity,
        entryPrice: signal.price,
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
}

export const campaignEngineService = new CampaignEngineService();
