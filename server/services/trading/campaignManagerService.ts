import { db } from '../../db';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { storage } from '../../storage';
import { observabilityService } from '../observabilityService';
import { rebalanceService } from '../rebalance/rebalanceService';
import { campaignEngineService } from './campaignEngineService';
import { campaignGovernanceService } from '../governance/campaignGovernanceService';
import { exchangeReconciliationService } from '../governance/exchangeReconciliationService';

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

    // Capture risk snapshot BEFORE governance validation to get the resolved config
    const portfolioRiskConfig = await this.captureRiskSnapshot(portfolioId);
    const finalRiskConfig = riskConfig || portfolioRiskConfig;

    // SECURITY: Validate governance for high-risk profiles at service layer
    // Check the RESOLVED config (after snapshot resolution) to prevent bypass
    // Extract investor_profile from multiple sources for robustness
    const resolvedInvestorProfile = finalRiskConfig?.investor_profile || 
                                    finalRiskConfig?.investorProfile ||
                                    portfolioRiskConfig?.investor_profile ||
                                    portfolioRiskConfig?.investorProfile;
    
    // SECURITY: New campaigns with riskConfig MUST have explicit investor_profile
    // This prevents bypass via submitting aggressive params without declaring SA/F
    // Only legacy campaigns (no riskConfig provided) can use default 'M'
    if (riskConfig && !resolvedInvestorProfile) {
      console.error(`[CampaignManager] SECURITY: riskConfig provided but investor_profile is missing`);
      throw new Error('investor_profile is required when providing risk configuration');
    }
    
    // For legacy campaigns (no riskConfig), use default 'M'
    const investorProfile = (resolvedInvestorProfile || 'M').toUpperCase();
    
    // SECURITY: Use authoritative SA/F parameter specification to detect bypass attempts
    // If any parameter exceeds standard profile limits, SA/F profile is REQUIRED
    const { checkExceedsStandardLimits } = await import('../../../shared/schema');
    const exceededParams = checkExceedsStandardLimits(finalRiskConfig);
    
    if (exceededParams.length > 0 && !['SA', 'F'].includes(investorProfile)) {
      console.error(`[CampaignManager] SECURITY: Parameters exceed standard limits but profile is ${investorProfile}. Exceeded: ${exceededParams.join(', ')}`);
      throw new Error(`Parameters (${exceededParams.join(', ')}) exceed standard profile limits and require SA or F investor profile with governance approval`);
    }
    
    // SECURITY: For SA/F profiles, governance MUST be validated - no silent bypass
    if (['SA', 'F'].includes(investorProfile)) {
      const { franchisePlanService } = await import('../franchisePlanService');
      const customProfileId = finalRiskConfig?.custom_profile_id || finalRiskConfig?.customProfileId;
      
      const validation = await franchisePlanService.validateCampaignRiskProfile(
        portfolio.user_id,
        investorProfile,
        customProfileId
      );
      
      if (!validation.valid) {
        const errors = validation.governanceValidation?.errors?.map((e: any) => e.message) || [];
        const planError = validation.planValidation?.reason;
        const allErrors = planError ? [planError, ...errors] : errors;
        throw new Error(`Governance validation failed: ${allErrors.join('; ')}`);
      }
      
      console.log(`[CampaignManager] ✓ Governance validated for ${investorProfile} profile | User: ${portfolio.user_id}`);
    }

    // V2.0+ Governance: Atomic capital reservation with conditional update and compensating rollback
    // This prevents race conditions where concurrent approvals could overdraw available_cash
    // The UPDATE only succeeds if available_cash >= initialCapital (atomic check-and-decrement)
    const [updatedPortfolio] = await db.update(schema.portfolios)
      .set({
        available_cash: sql`GREATEST(0, CAST(${schema.portfolios.available_cash} AS DECIMAL) - ${initialCapital})`,
        updated_at: new Date()
      })
      .where(and(
        eq(schema.portfolios.id, portfolioId),
        sql`CAST(${schema.portfolios.available_cash} AS DECIMAL) >= ${initialCapital}`
      ))
      .returning();
    
    if (!updatedPortfolio) {
      // Re-fetch to get current balance for error message
      const [currentPortfolio] = await db.select({ available_cash: schema.portfolios.available_cash })
        .from(schema.portfolios)
        .where(eq(schema.portfolios.id, portfolioId));
      const currentCash = parseFloat(currentPortfolio?.available_cash || '0');
      throw new Error(`Insufficient available cash ($${currentCash.toFixed(2)}) for campaign capital ($${initialCapital.toFixed(2)})`);
    }
    
    const previousCash = parseFloat(portfolio.available_cash || '0');
    const newCash = parseFloat(updatedPortfolio.available_cash || '0');
    console.log(`[CampaignManager] Portfolio ${portfolioId} available_cash: $${previousCash.toFixed(2)} -> $${newCash.toFixed(2)} (atomic reservation)`);

    // Create campaign with compensating rollback if any step fails
    let campaign: schema.Campaign;
    try {
      campaign = await storage.createCampaign({
        portfolio_id: portfolioId,
        name,
        start_date: startDate,
        end_date: endDate,
        initial_capital: initialCapital.toString(),
        current_equity: initialCapital.toString(),
        max_drawdown_percentage: maxDrawdownPercentage.toString(),
        status: 'active',
        risk_config: finalRiskConfig,
        selection_config: selectionConfig || {},
        investor_profile: investorProfile
      });
    } catch (error) {
      // COMPENSATING ROLLBACK: Restore available_cash if campaign creation fails
      console.error(`[CampaignManager] Campaign creation failed, rolling back capital reservation...`);
      await db.update(schema.portfolios)
        .set({
          available_cash: sql`CAST(${schema.portfolios.available_cash} AS DECIMAL) + ${initialCapital}`,
          updated_at: new Date()
        })
        .where(eq(schema.portfolios.id, portfolioId));
      console.log(`[CampaignManager] Capital rollback complete: $${initialCapital} restored to portfolio ${portfolioId}`);
      throw error;
    }

    // ========== GOVERNANCE V2.0+: Immutable Campaign Lock ==========
    // Log campaign creation in audit ledger
    await campaignGovernanceService.logCampaignCreated(campaign.id, campaign, portfolio.user_id);
    
    // Lock campaign immediately after creation (immutable parameters)
    await campaignGovernanceService.lockCampaign(campaign.id, portfolio.user_id);
    
    console.log(`[CampaignManager] ✓ Campaign ${campaign.id} created and LOCKED (immutable)`);

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
        end_date: endDate.toISOString(),
        governance_locked: true
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

    console.log(`[CampaignManager] Stopping campaign ${campaignId} (${reason}) - initiating liquidation...`);
    
    // CRITICAL: Close all open positions BEFORE marking campaign as stopped (same as expiration)
    const liquidationResult = await campaignEngineService.closeAllOpenPositions(
      campaignId, 
      `campaign_stopped_${reason}`
    );
    
    console.log(`[CampaignManager] Liquidation complete: ${liquidationResult.closedCount} positions closed, PnL: $${liquidationResult.totalPnL.toFixed(2)}`);
    
    // V2.0+ Governance: Verify all positions are actually closed before crediting cash
    const remainingPositions = await db.select({ id: schema.campaign_positions.id })
      .from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'open')
      ));
    
    if (remainingPositions.length > 0) {
      console.error(`[CampaignManager] CRITICAL: ${remainingPositions.length} positions still open after liquidation for campaign ${campaignId}`);
      throw new Error(`Liquidation incomplete: ${remainingPositions.length} positions still open. Cannot stop campaign safely.`);
    }
    
    // Get updated equity after liquidation
    const [updatedRiskState] = await db.select()
      .from(schema.campaign_risk_states)
      .where(eq(schema.campaign_risk_states.campaign_id, campaignId));
    
    const finalEquity = updatedRiskState 
      ? parseFloat(updatedRiskState.current_equity)
      : parseFloat(campaign.current_equity);
    
    // Update campaign equity with liquidation results
    await storage.updateCampaignEquity(campaignId, finalEquity.toFixed(2));

    const [updated] = await db.update(schema.campaigns)
      .set({
        status: 'stopped',
        completed_at: new Date()
      })
      .where(eq(schema.campaigns.id, campaignId))
      .returning();

    const portfolio = await storage.getPortfolio(campaign.portfolio_id);
    if (portfolio) {
      // V2.0+ Governance: Return capital + PnL to available_cash on campaign stop
      const currentAvailableCash = parseFloat(portfolio.available_cash || '0');
      const newAvailableCash = currentAvailableCash + finalEquity;
      
      await db.update(schema.portfolios)
        .set({
          available_cash: newAvailableCash.toString(),
          updated_at: new Date()
        })
        .where(eq(schema.portfolios.id, campaign.portfolio_id));
      
      console.log(`[CampaignManager] Portfolio ${campaign.portfolio_id} available_cash: $${currentAvailableCash.toFixed(2)} -> $${newAvailableCash.toFixed(2)} (stopped campaign returned $${finalEquity.toFixed(2)})`);
      
      await storage.createAuditLog({
        user_id: portfolio.user_id,
        action_type: 'campaign_stopped',
        entity_type: 'campaign',
        entity_id: campaignId,
        details: {
          reason,
          final_equity: finalEquity.toFixed(2),
          initial_capital: campaign.initial_capital,
          capital_returned_to_portfolio: finalEquity.toFixed(2),
          pnl_percentage: ((finalEquity - parseFloat(campaign.initial_capital)) / parseFloat(campaign.initial_capital) * 100).toFixed(2),
          liquidation: {
            positions_closed: liquidationResult.closedCount,
            liquidation_pnl: liquidationResult.totalPnL.toFixed(2),
            positions: liquidationResult.positions
          }
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

    // SECURITY: Re-validate governance for high-risk profiles before resuming
    // Extract investor_profile from multiple sources for backward compatibility
    const riskConfig = campaign.risk_config as Record<string, any> || {};
    const investorProfile = campaign.investor_profile || 
                            riskConfig?.investor_profile || 
                            riskConfig?.investorProfile;
    
    // SECURITY: For SA/F campaigns, investor_profile MUST be present - no fallback to avoid bypass
    if (investorProfile && ['SA', 'F'].includes(investorProfile.toUpperCase())) {
      // Get user_id from portfolio since campaign doesn't have it directly
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      if (!portfolio) {
        throw new Error(`Portfolio ${campaign.portfolio_id} not found for campaign ${campaignId}`);
      }
      
      const { franchisePlanService } = await import('../franchisePlanService');
      const customProfileId = riskConfig?.custom_profile_id || riskConfig?.customProfileId;
      
      const validation = await franchisePlanService.validateCampaignRiskProfile(
        portfolio.user_id,
        investorProfile,
        customProfileId
      );
      
      if (!validation.valid) {
        const errors = validation.governanceValidation?.errors?.map((e: any) => e.message) || [];
        const planError = validation.planValidation?.reason;
        const allErrors = planError ? [planError, ...errors] : errors;
        throw new Error(`Cannot resume: governance validation failed: ${allErrors.join('; ')}`);
      }
      
      console.log(`[CampaignManager] ✓ Governance re-validated for ${investorProfile} profile on resume | Campaign: ${campaignId}`);
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
      console.log(`[CampaignManager] Campaign ${campaignId} has reached end date - initiating liquidation...`);
      
      // CRITICAL: Close all open positions BEFORE marking campaign as completed
      const liquidationResult = await campaignEngineService.closeAllOpenPositions(
        campaignId, 
        'campaign_expired'
      );
      
      console.log(`[CampaignManager] Liquidation complete: ${liquidationResult.closedCount} positions closed, PnL: $${liquidationResult.totalPnL.toFixed(2)}`);
      
      // Get updated equity after liquidation
      const [updatedRiskState] = await db.select()
        .from(schema.campaign_risk_states)
        .where(eq(schema.campaign_risk_states.campaign_id, campaignId));
      
      const finalEquity = updatedRiskState 
        ? parseFloat(updatedRiskState.current_equity)
        : parseFloat(campaign.current_equity);
      
      // Update campaign equity with liquidation results
      await storage.updateCampaignEquity(campaignId, finalEquity.toFixed(2));
      
      // Now mark campaign as completed
      await storage.completeCampaign(campaignId);
      
      const portfolio = await storage.getPortfolio(campaign.portfolio_id);
      if (portfolio) {
        const initialCapital = parseFloat(campaign.initial_capital);
        const pnlPercentage = ((finalEquity - initialCapital) / initialCapital * 100);
        
        // V2.0+ Governance: Return capital + PnL to available_cash
        const currentAvailableCash = parseFloat(portfolio.available_cash || '0');
        const newAvailableCash = currentAvailableCash + finalEquity;
        
        await db.update(schema.portfolios)
          .set({
            available_cash: newAvailableCash.toString(),
            updated_at: new Date()
          })
          .where(eq(schema.portfolios.id, campaign.portfolio_id));
        
        console.log(`[CampaignManager] Portfolio ${campaign.portfolio_id} available_cash: $${currentAvailableCash.toFixed(2)} -> $${newAvailableCash.toFixed(2)} (campaign returned $${finalEquity.toFixed(2)})`);
        
        await storage.createAuditLog({
          user_id: portfolio.user_id,
          action_type: 'campaign_completed',
          entity_type: 'campaign',
          entity_id: campaignId,
          details: {
            final_equity: finalEquity.toFixed(2),
            initial_capital: campaign.initial_capital,
            duration_days: CAMPAIGN_DURATION_DAYS,
            pnl_percentage: pnlPercentage.toFixed(2),
            capital_returned_to_portfolio: finalEquity.toFixed(2),
            liquidation: {
              positions_closed: liquidationResult.closedCount,
              liquidation_pnl: liquidationResult.totalPnL.toFixed(2),
              positions: liquidationResult.positions
            }
          }
        });
      }

      console.log(`[CampaignManager] Campaign ${campaignId} completed - Final equity: $${finalEquity.toFixed(2)}`);
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
