import { db } from '../../db';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { storage } from '../../storage';
import { observabilityService } from '../observabilityService';
import { rebalanceService } from '../rebalance/rebalanceService';

interface CampaignMetrics {
  campaignId: string;
  dayNumber: number;
  totalDays: number;
  daysRemaining: number;
  initialCapital: number;
  currentEquity: number;
  totalPnL: number;
  totalPnLPercentage: number;
  currentDrawdown: number;
  maxDrawdownLimit: number;
  isDrawdownBreached: boolean;
  status: string;
  progress: number;
}

interface CampaignCreateParams {
  portfolioId: string;
  name: string;
  initialCapital: number;
  riskConfig?: Record<string, any>;
  selectionConfig?: Record<string, any>;
  durationDays?: number;
  maxDrawdownPercentage?: number;
}

interface CompoundingResult {
  previousEquity: number;
  realizedPnL: number;
  newEquity: number;
  compoundedAmount: number;
}

const CAMPAIGN_DURATION_DAYS = 30;
const DEFAULT_MAX_DRAWDOWN = -10;
const REBALANCE_INTERVAL_HOURS = 8;

class CampaignManagerService {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private rebalanceInterval: NodeJS.Timeout | null = null;

  async startCampaign(params: CampaignCreateParams): Promise<schema.Campaign> {
    const {
      portfolioId,
      name,
      initialCapital,
      riskConfig,
      selectionConfig,
      durationDays = CAMPAIGN_DURATION_DAYS,
      maxDrawdownPercentage = DEFAULT_MAX_DRAWDOWN
    } = params;

    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const activeCampaigns = await this.getActiveCampaigns(portfolioId);
    if (activeCampaigns.length > 0) {
      throw new Error(`Portfolio ${portfolioId} already has an active campaign`);
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    const portfolioRiskConfig = await this.captureRiskSnapshot(portfolioId);

    const campaign = await storage.createCampaign({
      portfolio_id: portfolioId,
      name,
      start_date: startDate,
      end_date: endDate,
      initial_capital: initialCapital.toString(),
      current_equity: initialCapital.toString(),
      max_drawdown_percentage: maxDrawdownPercentage.toString(),
      status: 'active',
      risk_config: riskConfig || portfolioRiskConfig,
      selection_config: selectionConfig || {}
    });

    await storage.createAuditLog({
      user_id: portfolio.user_id,
      action_type: 'campaign_started',
      entity_type: 'campaign',
      entity_id: campaign.id,
      details: {
        campaign_name: name,
        initial_capital: initialCapital,
        duration_days: durationDays,
        max_drawdown: maxDrawdownPercentage,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString()
      }
    });

    console.log(`[CampaignManager] Campaign ${campaign.id} started for portfolio ${portfolioId}`);
    console.log(`[CampaignManager] Duration: ${durationDays} days, Initial Capital: $${initialCapital}`);

    return campaign;
  }

  async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics | null> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return null;
    }

    const startDate = new Date(campaign.start_date);
    const endDate = new Date(campaign.end_date);
    const now = new Date();

    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const dayNumber = Math.min(
      Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      totalDays
    );
    const daysRemaining = Math.max(0, totalDays - dayNumber);

    const initialCapital = parseFloat(campaign.initial_capital);
    const currentEquity = parseFloat(campaign.current_equity);
    const totalPnL = currentEquity - initialCapital;
    const totalPnLPercentage = (totalPnL / initialCapital) * 100;

    const currentDrawdown = totalPnLPercentage < 0 ? totalPnLPercentage : 0;
    const maxDrawdownLimit = parseFloat(campaign.max_drawdown_percentage);
    const isDrawdownBreached = currentDrawdown <= maxDrawdownLimit;

    const progress = (dayNumber / totalDays) * 100;

    return {
      campaignId: campaign.id,
      dayNumber,
      totalDays,
      daysRemaining,
      initialCapital,
      currentEquity,
      totalPnL,
      totalPnLPercentage,
      currentDrawdown,
      maxDrawdownLimit,
      isDrawdownBreached,
      status: campaign.status,
      progress
    };
  }

  async checkDrawdownBreaker(campaignId: string): Promise<boolean> {
    const metrics = await this.getCampaignMetrics(campaignId);
    if (!metrics) {
      return false;
    }

    if (metrics.isDrawdownBreached && metrics.status === 'active') {
      await this.stopCampaign(campaignId, 'drawdown_limit');
      
      console.log(`[CampaignManager] CAMPAIGN STOPPED - Drawdown limit breached`);
      console.log(`[CampaignManager] Campaign: ${campaignId}, DD: ${metrics.currentDrawdown.toFixed(2)}%, Limit: ${metrics.maxDrawdownLimit}%`);
      
      observabilityService.updateBreakerState('campaign', campaignId, 'global', 2);
      
      return true;
    }

    return false;
  }

  async stopCampaign(campaignId: string, reason: string): Promise<schema.Campaign> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const [updated] = await db.update(schema.campaigns)
      .set({
        status: 'stopped',
        completed_at: new Date()
      })
      .where(eq(schema.campaigns.id, campaignId))
      .returning();

    const portfolio = await storage.getPortfolio(campaign.portfolio_id);
    if (portfolio) {
      await storage.createAuditLog({
        user_id: portfolio.user_id,
        action_type: 'campaign_stopped',
        entity_type: 'campaign',
        entity_id: campaignId,
        details: {
          reason,
          final_equity: campaign.current_equity,
          initial_capital: campaign.initial_capital,
          pnl_percentage: ((parseFloat(campaign.current_equity) - parseFloat(campaign.initial_capital)) / parseFloat(campaign.initial_capital) * 100).toFixed(2)
        }
      });
    }

    return updated;
  }

  async pauseCampaign(campaignId: string, reason: string): Promise<schema.Campaign> {
    const [updated] = await db.update(schema.campaigns)
      .set({ status: 'paused' })
      .where(eq(schema.campaigns.id, campaignId))
      .returning();

    if (!updated) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    console.log(`[CampaignManager] Campaign ${campaignId} paused: ${reason}`);
    return updated;
  }

  async resumeCampaign(campaignId: string): Promise<schema.Campaign> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    if (campaign.status !== 'paused') {
      throw new Error(`Campaign ${campaignId} is not paused (status: ${campaign.status})`);
    }

    const [updated] = await db.update(schema.campaigns)
      .set({ status: 'active' })
      .where(eq(schema.campaigns.id, campaignId))
      .returning();

    console.log(`[CampaignManager] Campaign ${campaignId} resumed`);
    return updated;
  }

  async applyCompounding(campaignId: string, realizedPnL: number): Promise<CompoundingResult> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    if (campaign.status !== 'active') {
      throw new Error(`Cannot compound on inactive campaign (status: ${campaign.status})`);
    }

    const previousEquity = parseFloat(campaign.current_equity);
    const newEquity = previousEquity + realizedPnL;
    const compoundedAmount = realizedPnL > 0 ? realizedPnL : 0;

    await storage.updateCampaignEquity(campaignId, newEquity.toFixed(2));

    console.log(`[CampaignManager] Compounding applied to campaign ${campaignId}`);
    console.log(`[CampaignManager] Previous: $${previousEquity.toFixed(2)}, PnL: $${realizedPnL.toFixed(2)}, New: $${newEquity.toFixed(2)}`);

    await this.checkDrawdownBreaker(campaignId);

    return {
      previousEquity,
      realizedPnL,
      newEquity,
      compoundedAmount
    };
  }

  async checkCampaignExpiration(campaignId: string): Promise<boolean> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign || campaign.status !== 'active') {
      return false;
    }

    const now = new Date();
    const endDate = new Date(campaign.end_date);

    if (now >= endDate) {
      await storage.completeCampaign(campaignId);
      
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      if (portfolio) {
        await storage.createAuditLog({
          user_id: portfolio.user_id,
          action_type: 'campaign_completed',
          entity_type: 'campaign',
          entity_id: campaignId,
          details: {
            final_equity: campaign.current_equity,
            initial_capital: campaign.initial_capital,
            duration_days: CAMPAIGN_DURATION_DAYS,
            pnl_percentage: ((parseFloat(campaign.current_equity) - parseFloat(campaign.initial_capital)) / parseFloat(campaign.initial_capital) * 100).toFixed(2)
          }
        });
      }

      console.log(`[CampaignManager] Campaign ${campaignId} completed - 30 day cycle ended`);
      return true;
    }

    return false;
  }

  async getActiveCampaigns(portfolioId?: string): Promise<schema.Campaign[]> {
    if (portfolioId) {
      return await db.select().from(schema.campaigns)
        .where(and(
          eq(schema.campaigns.portfolio_id, portfolioId),
          eq(schema.campaigns.status, 'active')
        ));
    }

    return await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.status, 'active'));
  }

  async getTradesForCampaign(campaignId: string): Promise<schema.Trade[]> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return [];
    }

    return await db.select().from(schema.trades)
      .where(and(
        eq(schema.trades.portfolio_id, campaign.portfolio_id),
        gte(schema.trades.opened_at, campaign.start_date),
        lte(schema.trades.closed_at, campaign.end_date)
      ))
      .orderBy(desc(schema.trades.closed_at));
  }

  async getOrdersForCampaign(campaignId: string): Promise<schema.Order[]> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return [];
    }

    return await db.select().from(schema.orders)
      .where(and(
        eq(schema.orders.portfolio_id, campaign.portfolio_id),
        gte(schema.orders.created_at, campaign.start_date),
        lte(schema.orders.created_at, campaign.end_date)
      ))
      .orderBy(desc(schema.orders.created_at));
  }

  async getPositionsForCampaign(campaignId: string): Promise<schema.Position[]> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return [];
    }

    return await db.select().from(schema.positions)
      .where(and(
        eq(schema.positions.portfolio_id, campaign.portfolio_id),
        gte(schema.positions.opened_at, campaign.start_date)
      ))
      .orderBy(desc(schema.positions.opened_at));
  }

  async getCampaignSummary(campaignId: string): Promise<{
    metrics: CampaignMetrics | null;
    tradeCount: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
  }> {
    const metrics = await this.getCampaignMetrics(campaignId);
    const trades = await this.getTradesForCampaign(campaignId);

    const closedTrades = trades.filter(t => t.realized_pnl !== null);
    const winningTrades = closedTrades.filter(t => parseFloat(t.realized_pnl!) > 0);
    const losingTrades = closedTrades.filter(t => parseFloat(t.realized_pnl!) < 0);

    const tradeCount = closedTrades.length;
    const winRate = tradeCount > 0 ? (winningTrades.length / tradeCount) * 100 : 0;

    const totalWins = winningTrades.reduce((sum, t) => sum + parseFloat(t.realized_pnl!), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + parseFloat(t.realized_pnl!), 0));

    const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    return {
      metrics,
      tradeCount,
      winRate,
      avgWin,
      avgLoss,
      profitFactor
    };
  }

  private async captureRiskSnapshot(portfolioId: string): Promise<Record<string, any>> {
    const riskParams = await storage.getRiskParametersByPortfolioId(portfolioId);
    
    if (riskParams) {
      return {
        max_position_size_percentage: riskParams.max_position_size_percentage,
        max_daily_loss_percentage: riskParams.max_daily_loss_percentage,
        max_portfolio_heat_percentage: riskParams.max_portfolio_heat_percentage,
        circuit_breaker_enabled: riskParams.circuit_breaker_enabled,
        captured_at: new Date().toISOString()
      };
    }

    return {
      max_position_size_percentage: "10",
      max_daily_loss_percentage: "5",
      max_portfolio_heat_percentage: "20",
      circuit_breaker_enabled: true,
      captured_at: new Date().toISOString()
    };
  }

  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      return;
    }

    console.log(`[CampaignManager] Starting campaign monitoring (interval: ${intervalMs}ms)`);

    this.monitoringInterval = setInterval(async () => {
      try {
        const activeCampaigns = await this.getActiveCampaigns();
        
        for (const campaign of activeCampaigns) {
          await this.checkCampaignExpiration(campaign.id);
          await this.checkDrawdownBreaker(campaign.id);
        }
      } catch (error) {
        console.error('[CampaignManager] Monitoring error:', error);
      }
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[CampaignManager] Campaign monitoring stopped');
    }
  }

  /**
   * Start automated 8-hour rebalancing for active campaigns
   */
  startRebalanceScheduler(): void {
    if (this.rebalanceInterval) {
      return;
    }

    const intervalMs = REBALANCE_INTERVAL_HOURS * 60 * 60 * 1000; // 8 hours in ms
    console.log(`[CampaignManager] Starting rebalance scheduler (interval: ${REBALANCE_INTERVAL_HOURS}h)`);

    this.rebalanceInterval = setInterval(async () => {
      try {
        await this.executeScheduledRebalance();
      } catch (error) {
        console.error('[CampaignManager] Scheduled rebalance error:', error);
      }
    }, intervalMs);

    // Run initial rebalance check on startup
    this.executeScheduledRebalance().catch(error => {
      console.error('[CampaignManager] Initial rebalance check failed:', error);
    });
  }

  /**
   * Stop rebalance scheduler
   */
  stopRebalanceScheduler(): void {
    if (this.rebalanceInterval) {
      clearInterval(this.rebalanceInterval);
      this.rebalanceInterval = null;
      console.log('[CampaignManager] Rebalance scheduler stopped');
    }
  }

  /**
   * Execute rebalancing for all active campaigns
   * Only rebalances portfolios with active campaigns
   */
  private async executeScheduledRebalance(): Promise<void> {
    console.log('[CampaignManager] Starting scheduled rebalance cycle...');
    
    const activeCampaigns = await this.getActiveCampaigns();
    
    if (activeCampaigns.length === 0) {
      console.log('[CampaignManager] No active campaigns - skipping rebalance');
      return;
    }

    console.log(`[CampaignManager] Found ${activeCampaigns.length} active campaign(s) to rebalance`);

    for (const campaign of activeCampaigns) {
      try {
        // Check if campaign is still within parameters before rebalancing
        const metrics = await this.getCampaignMetrics(campaign.id);
        if (!metrics || metrics.isDrawdownBreached) {
          console.log(`[CampaignManager] Skipping rebalance for campaign ${campaign.id} - drawdown breached`);
          continue;
        }

        // Execute rebalance for this campaign's portfolio
        console.log(`[CampaignManager] Rebalancing portfolio ${campaign.portfolio_id} (campaign: ${campaign.id})`);
        
        const result = await rebalanceService.executeRebalance(campaign.portfolio_id, false);
        
        if (result.success) {
          console.log(`[CampaignManager] Rebalance completed for campaign ${campaign.id}: ${result.tradesExecuted} trades`);
          
          // Log rebalance in campaign audit trail
          const portfolio = await storage.getPortfolio(campaign.portfolio_id);
          if (portfolio) {
            await storage.createAuditLog({
              user_id: portfolio.user_id,
              action_type: 'campaign_rebalanced',
              entity_type: 'campaign',
              entity_id: campaign.id,
              details: {
                trades_executed: result.tradesExecuted,
                total_cost: result.totalCost,
                rebalance_log_id: result.logId
              }
            });
          }

          // Update campaign equity after rebalance
          if (result.totalCost > 0) {
            const currentEquity = parseFloat(campaign.current_equity);
            const newEquity = currentEquity - result.totalCost;
            await storage.updateCampaignEquity(campaign.id, newEquity.toFixed(2));
          }
        } else {
          console.error(`[CampaignManager] Rebalance failed for campaign ${campaign.id}:`, result.errors);
        }
      } catch (error) {
        console.error(`[CampaignManager] Error rebalancing campaign ${campaign.id}:`, error);
      }
    }

    console.log('[CampaignManager] Scheduled rebalance cycle completed');
  }

  /**
   * Trigger manual rebalance for a specific campaign
   */
  async triggerManualRebalance(campaignId: string): Promise<{
    success: boolean;
    tradesExecuted: number;
    totalCost: number;
    errors: string[];
  }> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return { success: false, tradesExecuted: 0, totalCost: 0, errors: ['Campaign not found'] };
    }

    if (campaign.status !== 'active') {
      return { success: false, tradesExecuted: 0, totalCost: 0, errors: ['Campaign is not active'] };
    }

    const metrics = await this.getCampaignMetrics(campaignId);
    if (metrics?.isDrawdownBreached) {
      return { success: false, tradesExecuted: 0, totalCost: 0, errors: ['Cannot rebalance - drawdown limit breached'] };
    }

    console.log(`[CampaignManager] Manual rebalance triggered for campaign ${campaignId}`);
    
    const result = await rebalanceService.executeRebalance(campaign.portfolio_id, false);
    
    return {
      success: result.success,
      tradesExecuted: result.tradesExecuted,
      totalCost: result.totalCost,
      errors: result.errors
    };
  }

  /**
   * Start both monitoring and rebalance scheduler
   */
  startAll(monitoringIntervalMs: number = 60000): void {
    this.startMonitoring(monitoringIntervalMs);
    this.startRebalanceScheduler();
  }

  /**
   * Stop both monitoring and rebalance scheduler
   */
  stopAll(): void {
    this.stopMonitoring();
    this.stopRebalanceScheduler();
  }
}

export const campaignManagerService = new CampaignManagerService();
