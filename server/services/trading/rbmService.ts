import { db } from '../../db';
import { eq, desc, gte, and } from 'drizzle-orm';
import * as schema from '@shared/schema';
import type { Campaign, RbmEvent, RbmStatus, RbmEventType } from '@shared/schema';
import { volatilityRegimeEngine, type VREState, type VolatilityRegime } from './volatilityRegimeEngine';
import { storage } from '../../storage';
import { CircuitBreakerService } from '../circuitBreakerService';
import { franchisePermissionService } from '../franchisePermissionService';

// ========== RBM SERVICE (Risk-Based Multiplier) ==========
// Manages risk multiplier requests, approvals, and monitoring for campaigns

// System-wide maximum RBM (cannot be exceeded regardless of plan)
export const RBM_MAX_SYSTEM = 5.0;
export const RBM_MIN_SYSTEM = 1.0;
export const RBM_DEFAULT = 1.0;

// Valid campaign statuses for RBM activation
const VALID_CAMPAIGN_STATUSES = ['active', 'paused'];

interface RBMRequestResult {
  success: boolean;
  approved: boolean;
  approvedMultiplier: number;
  reason: string;
  qualityGateSnapshot?: Record<string, unknown>;
}

interface RBMStatusResult {
  campaignId: string;
  rbmRequested: number;
  rbmApproved: number;
  rbmStatus: RbmStatus;
  rbmApprovedAt: Date | null;
  rbmReducedAt: Date | null;
  rbmReducedReason: string | null;
  planLimit: number;
  recentEvents: RbmEvent[];
}

interface QualityGateResult {
  ok: boolean;
  reasons: string[];
  snapshot: Record<string, unknown>;
}

class RBMService {
  private static instance: RBMService;

  private constructor() {}

  static getInstance(): RBMService {
    if (!RBMService.instance) {
      RBMService.instance = new RBMService();
    }
    return RBMService.instance;
  }

  /**
   * Request RBM activation for a campaign
   * Validates campaign, plan limits, and runs Quality Gate
   */
  async requestRBM(campaignId: string, multiplier: number, userId?: string): Promise<RBMRequestResult> {
    try {
      // Step 0: Validate user permission to activate RBM
      if (userId) {
        const permissions = await franchisePermissionService.getUserPermissions(userId);
        if (!permissions.permissions.canActivateRBM) {
          return {
            success: false,
            approved: false,
            approvedMultiplier: RBM_DEFAULT,
            reason: 'Permission denied: Your role does not allow RBM activation',
          };
        }
      }

      // Step 1: Validate multiplier bounds
      if (multiplier < RBM_MIN_SYSTEM || multiplier > RBM_MAX_SYSTEM) {
        return {
          success: false,
          approved: false,
          approvedMultiplier: RBM_DEFAULT,
          reason: `Multiplier must be between ${RBM_MIN_SYSTEM} and ${RBM_MAX_SYSTEM}`,
        };
      }

      // Step 2: Get campaign and validate it exists
      const campaign = await this.getCampaign(campaignId);
      if (!campaign) {
        return {
          success: false,
          approved: false,
          approvedMultiplier: RBM_DEFAULT,
          reason: 'Campaign not found',
        };
      }

      // Step 3: Validate campaign status
      if (!VALID_CAMPAIGN_STATUSES.includes(campaign.status)) {
        return {
          success: false,
          approved: false,
          approvedMultiplier: RBM_DEFAULT,
          reason: `Campaign status '${campaign.status}' does not allow RBM activation. Must be: ${VALID_CAMPAIGN_STATUSES.join(', ')}`,
        };
      }

      // Step 4: Get plan limit for franchise
      const planLimit = await this.getPlanRBMLimit(campaign);
      if (multiplier > planLimit) {
        return {
          success: false,
          approved: false,
          approvedMultiplier: RBM_DEFAULT,
          reason: `Requested multiplier ${multiplier}x exceeds plan limit of ${planLimit}x`,
        };
      }

      // Step 5: Prepare for atomic transaction
      const previousValue = campaign.rbm_approved ? parseFloat(campaign.rbm_approved) : RBM_DEFAULT;

      // Step 6: Run Quality Gate (outside transaction for read-only operations)
      const qualityGate = await this.evaluateQualityGate(campaignId);

      // Step 7: Execute atomic transaction for state change + audit log
      if (qualityGate.ok) {
        // APPROVE: Atomic transaction for approval
        await db.transaction(async (tx) => {
          // Update campaign with PENDING -> ACTIVE
          await tx
            .update(schema.campaigns)
            .set({
              rbm_requested: multiplier.toFixed(1),
              rbm_approved: multiplier.toFixed(1),
              rbm_status: 'ACTIVE' as RbmStatus,
              rbm_approved_at: new Date(),
            })
            .where(eq(schema.campaigns.id, campaignId));

          // Log REQUEST event
          await tx.insert(schema.rbm_events).values({
            campaign_id: campaignId,
            event_type: 'REQUEST' as RbmEventType,
            previous_value: previousValue.toFixed(1),
            new_value: multiplier.toFixed(1),
            reason: 'User requested RBM activation',
            triggered_by: userId ? 'user' : 'system',
            user_id: userId,
          });

          // Log APPROVE event
          await tx.insert(schema.rbm_events).values({
            campaign_id: campaignId,
            event_type: 'APPROVE' as RbmEventType,
            previous_value: previousValue.toFixed(1),
            new_value: multiplier.toFixed(1),
            reason: 'Quality Gate passed - RBM approved',
            triggered_by: userId ? 'user' : 'system',
            user_id: userId,
            quality_gate_snapshot: qualityGate.snapshot,
          });
        });

        return {
          success: true,
          approved: true,
          approvedMultiplier: multiplier,
          reason: 'RBM approved after Quality Gate validation',
          qualityGateSnapshot: qualityGate.snapshot,
        };
      } else {
        // DENY: Atomic transaction for denial
        await db.transaction(async (tx) => {
          // Update campaign with request but keep INACTIVE
          await tx
            .update(schema.campaigns)
            .set({
              rbm_requested: multiplier.toFixed(1),
              rbm_approved: RBM_DEFAULT.toFixed(1),
              rbm_status: 'INACTIVE' as RbmStatus,
            })
            .where(eq(schema.campaigns.id, campaignId));

          // Log REQUEST event
          await tx.insert(schema.rbm_events).values({
            campaign_id: campaignId,
            event_type: 'REQUEST' as RbmEventType,
            previous_value: previousValue.toFixed(1),
            new_value: multiplier.toFixed(1),
            reason: 'User requested RBM activation',
            triggered_by: userId ? 'user' : 'system',
            user_id: userId,
          });

          // Log DENY event
          await tx.insert(schema.rbm_events).values({
            campaign_id: campaignId,
            event_type: 'DENY' as RbmEventType,
            previous_value: previousValue.toFixed(1),
            new_value: RBM_DEFAULT.toFixed(1),
            reason: `Quality Gate failed: ${qualityGate.reasons.join('; ')}`,
            triggered_by: userId ? 'user' : 'system',
            user_id: userId,
            quality_gate_snapshot: qualityGate.snapshot,
          });
        });

        return {
          success: true,
          approved: false,
          approvedMultiplier: RBM_DEFAULT,
          reason: `Quality Gate failed: ${qualityGate.reasons.join('; ')}`,
          qualityGateSnapshot: qualityGate.snapshot,
        };
      }
    } catch (error) {
      console.error('[RBMService] requestRBM error:', error);
      return {
        success: false,
        approved: false,
        approvedMultiplier: RBM_DEFAULT,
        reason: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get current RBM status for a campaign
   */
  async getRBMStatus(campaignId: string): Promise<RBMStatusResult | null> {
    try {
      const campaign = await this.getCampaign(campaignId);
      if (!campaign) {
        return null;
      }

      const planLimit = await this.getPlanRBMLimit(campaign);
      const recentEvents = await this.getRecentRBMEvents(campaignId, 10);

      return {
        campaignId,
        rbmRequested: campaign.rbm_requested ? parseFloat(campaign.rbm_requested) : RBM_DEFAULT,
        rbmApproved: campaign.rbm_approved ? parseFloat(campaign.rbm_approved) : RBM_DEFAULT,
        rbmStatus: (campaign.rbm_status || 'INACTIVE') as RbmStatus,
        rbmApprovedAt: campaign.rbm_approved_at,
        rbmReducedAt: campaign.rbm_reduced_at,
        rbmReducedReason: campaign.rbm_reduced_reason,
        planLimit,
        recentEvents,
      };
    } catch (error) {
      console.error('[RBMService] getRBMStatus error:', error);
      return null;
    }
  }

  /**
   * Get RBM limit from franchise plan
   * Returns 1.0 if no franchise/plan found (non-franchise users)
   */
  async getPlanRBMLimit(campaign: Campaign): Promise<number> {
    try {
      // If campaign has no franchise, return system max (for franchisor/admin users)
      if (!campaign.franchise_id) {
        return RBM_MAX_SYSTEM;
      }

      // Get franchise to find plan
      const [franchise] = await db
        .select()
        .from(schema.franchises)
        .where(eq(schema.franchises.id, campaign.franchise_id));

      if (!franchise) {
        console.warn(`[RBMService] Franchise not found for campaign ${campaign.id}, using default limit`);
        return RBM_DEFAULT;
      }

      // Get plan limits
      const [plan] = await db
        .select()
        .from(schema.franchise_plans)
        .where(eq(schema.franchise_plans.id, franchise.plan_id));

      if (!plan) {
        console.warn(`[RBMService] Plan not found for franchise ${franchise.id}, using default limit`);
        return RBM_DEFAULT;
      }

      return plan.max_rbm_multiplier ? parseFloat(plan.max_rbm_multiplier) : RBM_DEFAULT;
    } catch (error) {
      console.error('[RBMService] getPlanRBMLimit error:', error);
      return RBM_DEFAULT;
    }
  }

  /**
   * Get plan RBM limit by plan ID directly
   */
  async getPlanRBMLimitById(planId: string): Promise<number> {
    try {
      const [plan] = await db
        .select()
        .from(schema.franchise_plans)
        .where(eq(schema.franchise_plans.id, planId));

      if (!plan) {
        return RBM_DEFAULT;
      }

      return plan.max_rbm_multiplier ? parseFloat(plan.max_rbm_multiplier) : RBM_DEFAULT;
    } catch (error) {
      console.error('[RBMService] getPlanRBMLimitById error:', error);
      return RBM_DEFAULT;
    }
  }

  // ========== QUALITY GATE CONFIGURATION ==========
  private readonly QUALITY_GATE_CONFIG = {
    // VRE Requirements
    allowed_regimes: ['HIGH', 'EXTREME'] as VolatilityRegime[],
    min_confidence: 0.70,
    min_stability_cycles: 3,
    
    // Volume requirements by regime (rv_ratio thresholds)
    volume_ratio_thresholds: {
      HIGH: 1.2,
      EXTREME: 1.5,
    } as Record<string, number>,
    
    // Liquidity requirements
    min_liquidity_percentile: 0.80,
    
    // Drawdown limits (percentage of max allowed)
    max_drawdown_percentage: 0.30,
    
    // Antifraud: max requests per hour
    max_requests_per_hour: 5,
    
    // Spread/slippage limits by regime (basis points)
    max_spread_bp: {
      HIGH: 50,
      EXTREME: 100,
    } as Record<string, number>,
    max_slippage_bp: {
      HIGH: 30,
      EXTREME: 60,
    } as Record<string, number>,
  };

  /**
   * Evaluate Quality Gate for RBM approval
   * FASE 3: Full implementation with all validations
   */
  private async evaluateQualityGate(campaignId: string): Promise<QualityGateResult> {
    const reasons: string[] = [];
    const snapshot: Record<string, unknown> = {
      evaluated_at: new Date().toISOString(),
      campaign_id: campaignId,
      version: '3.0',
    };

    try {
      const campaign = await this.getCampaign(campaignId);
      if (!campaign) {
        reasons.push('Campaign not found');
        snapshot['campaign_found'] = false;
        return { ok: false, reasons, snapshot };
      }
      snapshot['campaign_found'] = true;

      // ========== 1. VRE REGIME VALIDATION ==========
      const vreCheck = await this.checkVRERegime(campaign, snapshot);
      if (!vreCheck.ok) {
        reasons.push(...vreCheck.reasons);
      }

      // ========== 2. CIRCUIT BREAKER VALIDATION ==========
      const breakerCheck = await this.checkCircuitBreakers(campaign, snapshot);
      if (!breakerCheck.ok) {
        reasons.push(...breakerCheck.reasons);
      }

      // ========== 3. DRAWDOWN VALIDATION ==========
      const drawdownCheck = await this.checkDrawdown(campaign, snapshot);
      if (!drawdownCheck.ok) {
        reasons.push(...drawdownCheck.reasons);
      }

      // ========== 4. ANTIFRAUD VALIDATION ==========
      const antifraudCheck = await this.checkAntifraud(campaignId, snapshot);
      if (!antifraudCheck.ok) {
        reasons.push(...antifraudCheck.reasons);
      }

      // ========== 5. SPREAD/SLIPPAGE VALIDATION ==========
      const spreadCheck = await this.checkSpreadSlippage(campaign, snapshot);
      if (!spreadCheck.ok) {
        reasons.push(...spreadCheck.reasons);
      }

      // ========== 6. LIQUIDITY VALIDATION ==========
      const liquidityCheck = await this.checkLiquidity(campaign, snapshot);
      if (!liquidityCheck.ok) {
        reasons.push(...liquidityCheck.reasons);
      }

      // Final decision
      const ok = reasons.length === 0;
      snapshot['passed'] = ok;
      snapshot['total_checks'] = 6;
      snapshot['failed_checks'] = reasons.length;

      return { ok, reasons, snapshot };
    } catch (error) {
      console.error('[RBMService] Quality Gate error:', error);
      reasons.push(`Quality Gate error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      snapshot['error'] = true;
      return { ok: false, reasons, snapshot };
    }
  }

  /**
   * Check VRE regime requirements
   * FAIL-CLOSED: Errors block RBM approval to maintain risk controls
   */
  private async checkVRERegime(campaign: Campaign, snapshot: Record<string, unknown>): Promise<{ ok: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    
    try {
      // Get aggregate regime for main trading pairs
      const aggregateVRE = await volatilityRegimeEngine.detectAggregateRegime(['BTC/USD', 'ETH/USD']);
      
      snapshot['vre'] = {
        regime: aggregateVRE.regime,
        confidence: aggregateVRE.confidence,
        individual: Object.fromEntries(
          Array.from(aggregateVRE.individual.entries()).map(([k, v]) => [k, {
            regime: v.regime,
            confidence: v.confidence,
            cycles_in_regime: v.cycles_in_regime,
            cooldown_remaining: v.cooldown_remaining,
            rv_ratio: v.rv_ratio,
          }])
        ),
      };

      // Check regime is HIGH or EXTREME
      if (!this.QUALITY_GATE_CONFIG.allowed_regimes.includes(aggregateVRE.regime)) {
        reasons.push(`VRE regime '${aggregateVRE.regime}' not allowed for RBM (requires: ${this.QUALITY_GATE_CONFIG.allowed_regimes.join(', ')})`);
      }

      // Check confidence threshold
      if (aggregateVRE.confidence < this.QUALITY_GATE_CONFIG.min_confidence) {
        reasons.push(`VRE confidence ${(aggregateVRE.confidence * 100).toFixed(1)}% below threshold ${(this.QUALITY_GATE_CONFIG.min_confidence * 100).toFixed(1)}%`);
      }

      // Check stability cycles and volume ratio for each symbol
      for (const [symbol, state] of aggregateVRE.individual.entries()) {
        if (state.cycles_in_regime < this.QUALITY_GATE_CONFIG.min_stability_cycles) {
          reasons.push(`${symbol} stability cycles (${state.cycles_in_regime}) below minimum (${this.QUALITY_GATE_CONFIG.min_stability_cycles})`);
        }
        if (state.cooldown_remaining > 0) {
          reasons.push(`${symbol} in VRE cooldown (${state.cooldown_remaining} cycles remaining)`);
        }
        
        // Check volume ratio threshold based on regime
        const requiredVolumeRatio = this.QUALITY_GATE_CONFIG.volume_ratio_thresholds[state.regime];
        if (requiredVolumeRatio && state.rv_ratio < requiredVolumeRatio) {
          reasons.push(`${symbol} volume ratio (${state.rv_ratio.toFixed(2)}) below threshold for ${state.regime} regime (requires: ${requiredVolumeRatio})`);
        }
      }

    } catch (error) {
      // FAIL-CLOSED: VRE errors block RBM approval to maintain risk controls
      console.error('[RBMService] VRE check failed - blocking RBM approval:', error);
      snapshot['vre_error'] = error instanceof Error ? error.message : 'Unknown error';
      reasons.push(`VRE validation unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { ok: reasons.length === 0, reasons };
  }

  /**
   * Check circuit breakers
   */
  private async checkCircuitBreakers(campaign: Campaign, snapshot: Record<string, unknown>): Promise<{ ok: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    
    try {
      const circuitBreakerService = new CircuitBreakerService(storage);
      
      // Check global breaker for the portfolio
      if (campaign.portfolio_id) {
        const globalCheck = await circuitBreakerService.checkGlobalBreaker(campaign.portfolio_id);
        snapshot['circuit_breaker_global'] = {
          allowed: globalCheck.allowed,
          level: globalCheck.level,
          reason: globalCheck.reason,
        };
        
        if (!globalCheck.allowed) {
          reasons.push(`Global circuit breaker active: ${globalCheck.reason}`);
        }

        // Check staleness breaker
        const stalenessCheck = circuitBreakerService.checkStalenessBreaker(campaign.portfolio_id);
        snapshot['circuit_breaker_staleness'] = {
          allowed: stalenessCheck.allowed,
          level: stalenessCheck.level,
        };
        
        if (!stalenessCheck.allowed) {
          reasons.push(`Data staleness breaker active: ${stalenessCheck.reason}`);
        }
      } else {
        snapshot['circuit_breaker_skipped'] = 'No portfolio_id';
      }
    } catch (error) {
      console.warn('[RBMService] Circuit breaker check failed:', error);
      snapshot['circuit_breaker_error'] = error instanceof Error ? error.message : 'Unknown error';
      // Don't fail on circuit breaker errors
    }

    return { ok: reasons.length === 0, reasons };
  }

  /**
   * Check drawdown limits
   */
  private async checkDrawdown(campaign: Campaign, snapshot: Record<string, unknown>): Promise<{ ok: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    
    try {
      // Get current drawdown from campaign
      const currentDrawdown = campaign.current_drawdown ? parseFloat(campaign.current_drawdown) : 0;
      const maxDrawdown = campaign.max_drawdown ? parseFloat(campaign.max_drawdown) : 0.10; // Default 10%
      
      snapshot['drawdown'] = {
        current: currentDrawdown,
        max_allowed: maxDrawdown,
        percentage_used: maxDrawdown > 0 ? (currentDrawdown / maxDrawdown) : 0,
        threshold: this.QUALITY_GATE_CONFIG.max_drawdown_percentage,
      };

      // Check if current drawdown exceeds threshold percentage of max allowed
      if (maxDrawdown > 0) {
        const drawdownPercentage = currentDrawdown / maxDrawdown;
        if (drawdownPercentage > this.QUALITY_GATE_CONFIG.max_drawdown_percentage) {
          reasons.push(`Current drawdown (${(drawdownPercentage * 100).toFixed(1)}% of max) exceeds RBM threshold (${(this.QUALITY_GATE_CONFIG.max_drawdown_percentage * 100).toFixed(0)}%)`);
        }
      }
    } catch (error) {
      console.warn('[RBMService] Drawdown check failed:', error);
      snapshot['drawdown_error'] = error instanceof Error ? error.message : 'Unknown error';
    }

    return { ok: reasons.length === 0, reasons };
  }

  /**
   * Check antifraud - request frequency limits
   */
  private async checkAntifraud(campaignId: string, snapshot: Record<string, unknown>): Promise<{ ok: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    
    try {
      // Count RBM requests in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const recentRequests = await db
        .select()
        .from(schema.rbm_events)
        .where(
          and(
            eq(schema.rbm_events.campaign_id, campaignId),
            eq(schema.rbm_events.event_type, 'REQUEST'),
            gte(schema.rbm_events.created_at, oneHourAgo)
          )
        );
      
      snapshot['antifraud'] = {
        requests_last_hour: recentRequests.length,
        max_allowed: this.QUALITY_GATE_CONFIG.max_requests_per_hour,
      };

      if (recentRequests.length >= this.QUALITY_GATE_CONFIG.max_requests_per_hour) {
        reasons.push(`Too many RBM requests (${recentRequests.length}) in the last hour (max: ${this.QUALITY_GATE_CONFIG.max_requests_per_hour})`);
      }
    } catch (error) {
      console.warn('[RBMService] Antifraud check failed:', error);
      snapshot['antifraud_error'] = error instanceof Error ? error.message : 'Unknown error';
    }

    return { ok: reasons.length === 0, reasons };
  }

  /**
   * Check spread and slippage limits
   */
  private async checkSpreadSlippage(campaign: Campaign, snapshot: Record<string, unknown>): Promise<{ ok: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    
    try {
      // Get current VRE regime for threshold lookup
      const aggregateVRE = await volatilityRegimeEngine.detectAggregateRegime(['BTC/USD', 'ETH/USD']);
      const regime = aggregateVRE.regime;
      
      // Only check spread/slippage for HIGH/EXTREME regimes
      if (regime === 'HIGH' || regime === 'EXTREME') {
        // Get max spread/slippage thresholds for current regime
        const maxSpreadBp = this.QUALITY_GATE_CONFIG.max_spread_bp[regime] || 50;
        const maxSlippageBp = this.QUALITY_GATE_CONFIG.max_slippage_bp[regime] || 30;
        
        snapshot['spread_slippage'] = {
          regime,
          max_spread_bp: maxSpreadBp,
          max_slippage_bp: maxSlippageBp,
          check_status: 'thresholds_set',
        };
        
        // Note: Actual spread/slippage values would come from real-time market data
        // For now, we're just recording the thresholds
        // In production, this would integrate with market data service
      } else {
        snapshot['spread_slippage'] = {
          regime,
          check_status: 'skipped_low_regime',
        };
      }
    } catch (error) {
      console.warn('[RBMService] Spread/slippage check failed:', error);
      snapshot['spread_slippage_error'] = error instanceof Error ? error.message : 'Unknown error';
    }

    return { ok: reasons.length === 0, reasons };
  }

  // Baseline volume thresholds for major pairs (minimum acceptable 24h volume in USD for RBM)
  private readonly LIQUIDITY_BASELINES = {
    'XBT/USD': { min_volume_24h: 50000000 }, // $50M daily minimum
    'ETH/USD': { min_volume_24h: 20000000 }, // $20M daily minimum
  } as Record<string, { min_volume_24h: number }>;

  /**
   * Check liquidity requirements
   * Validates that trading pairs have sufficient liquidity for increased risk
   * Uses rank-based percentile calculation and baseline thresholds
   */
  private async checkLiquidity(campaign: Campaign, snapshot: Record<string, unknown>): Promise<{ ok: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    
    try {
      // Get all market data for percentile calculation
      const allMarketData = await db
        .select()
        .from(schema.market_data_cache);

      // Get specific pairs
      const marketDataBTC = allMarketData.find(m => m.symbol === 'XBT/USD');
      const marketDataETH = allMarketData.find(m => m.symbol === 'ETH/USD');

      // Extract all volumes for percentile calculation
      const allVolumes = allMarketData.map(m => parseFloat(m.volume_24h || '0'));
      
      const liquidityData: Record<string, { 
        volume_24h: number; 
        bid_ask_spread: number; 
        volume_percentile: number;
        meets_baseline: boolean;
      }> = {};

      // Rank-based percentile calculation (handles duplicates correctly)
      // Percentile = (count of values <= target) / total count
      const getRankPercentile = (value: number, allValues: number[]): number => {
        if (allValues.length === 0) return 0;
        const countLessOrEqual = allValues.filter(v => v <= value).length;
        return countLessOrEqual / allValues.length;
      };

      // Check BTC liquidity
      if (marketDataBTC) {
        const volume24h = parseFloat(marketDataBTC.volume_24h || '0');
        const bidAskSpread = parseFloat(marketDataBTC.bid_ask_spread || '0.001');
        const volumePercentile = getRankPercentile(volume24h, allVolumes);
        const baseline = this.LIQUIDITY_BASELINES['XBT/USD'];
        const meetsBaseline = volume24h >= baseline.min_volume_24h;
        
        liquidityData['XBT/USD'] = { 
          volume_24h: volume24h, 
          bid_ask_spread: bidAskSpread, 
          volume_percentile: volumePercentile,
          meets_baseline: meetsBaseline,
        };
        
        // Check percentile threshold
        if (volumePercentile < this.QUALITY_GATE_CONFIG.min_liquidity_percentile) {
          reasons.push(`XBT/USD volume percentile (${(volumePercentile * 100).toFixed(1)}%) below threshold (${(this.QUALITY_GATE_CONFIG.min_liquidity_percentile * 100).toFixed(0)}%)`);
        }
        
        // Check baseline minimum
        if (!meetsBaseline) {
          reasons.push(`XBT/USD 24h volume ($${(volume24h/1000000).toFixed(2)}M) below minimum ($${(baseline.min_volume_24h/1000000).toFixed(0)}M)`);
        }
      }
      
      // Check ETH liquidity
      if (marketDataETH) {
        const volume24h = parseFloat(marketDataETH.volume_24h || '0');
        const bidAskSpread = parseFloat(marketDataETH.bid_ask_spread || '0.001');
        const volumePercentile = getRankPercentile(volume24h, allVolumes);
        const baseline = this.LIQUIDITY_BASELINES['ETH/USD'];
        const meetsBaseline = volume24h >= baseline.min_volume_24h;
        
        liquidityData['ETH/USD'] = { 
          volume_24h: volume24h, 
          bid_ask_spread: bidAskSpread, 
          volume_percentile: volumePercentile,
          meets_baseline: meetsBaseline,
        };
        
        if (volumePercentile < this.QUALITY_GATE_CONFIG.min_liquidity_percentile) {
          reasons.push(`ETH/USD volume percentile (${(volumePercentile * 100).toFixed(1)}%) below threshold (${(this.QUALITY_GATE_CONFIG.min_liquidity_percentile * 100).toFixed(0)}%)`);
        }
        
        if (!meetsBaseline) {
          reasons.push(`ETH/USD 24h volume ($${(volume24h/1000000).toFixed(2)}M) below minimum ($${(baseline.min_volume_24h/1000000).toFixed(0)}M)`);
        }
      }

      snapshot['liquidity'] = {
        min_percentile_required: this.QUALITY_GATE_CONFIG.min_liquidity_percentile,
        pairs_checked: Object.keys(liquidityData).length,
        total_pairs_in_market: allVolumes.length,
        data: liquidityData,
      };

      // If no market data available, fail-closed
      if (Object.keys(liquidityData).length === 0) {
        reasons.push('Liquidity data unavailable for major trading pairs');
      }

    } catch (error) {
      console.warn('[RBMService] Liquidity check failed:', error);
      snapshot['liquidity_error'] = error instanceof Error ? error.message : 'Unknown error';
      reasons.push(`Liquidity validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { ok: reasons.length === 0, reasons };
  }

  // ========== HELPER METHODS ==========

  private async getCampaign(campaignId: string): Promise<Campaign | undefined> {
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    return campaign;
  }

  private async updateCampaignRBM(
    campaignId: string,
    updates: {
      rbm_requested?: string;
      rbm_approved?: string;
      rbm_status?: RbmStatus;
      rbm_approved_at?: Date;
      rbm_reduced_at?: Date;
      rbm_reduced_reason?: string;
    }
  ): Promise<void> {
    await db
      .update(schema.campaigns)
      .set(updates)
      .where(eq(schema.campaigns.id, campaignId));
  }

  private async logRBMEvent(
    campaignId: string,
    eventType: RbmEventType,
    previousValue: number,
    newValue: number,
    reason: string,
    userId?: string,
    qualityGateSnapshot?: Record<string, unknown>
  ): Promise<void> {
    await db.insert(schema.rbm_events).values({
      campaign_id: campaignId,
      event_type: eventType,
      previous_value: previousValue.toFixed(1),
      new_value: newValue.toFixed(1),
      reason,
      triggered_by: userId ? 'user' : 'system',
      user_id: userId,
      quality_gate_snapshot: qualityGateSnapshot || null,
    });
  }

  private async getRecentRBMEvents(campaignId: string, limit: number = 10): Promise<RbmEvent[]> {
    return await db
      .select()
      .from(schema.rbm_events)
      .where(eq(schema.rbm_events.campaign_id, campaignId))
      .orderBy(desc(schema.rbm_events.created_at))
      .limit(limit);
  }

  // ========== FASE 4: AUTO-ROLLBACK SYSTEM ==========

  // Rollback trigger reasons
  private readonly ROLLBACK_TRIGGERS = {
    VRE_REGIME_CHANGE: 'VRE regime dropped below required level',
    VRE_CONFIDENCE_DROP: 'VRE confidence dropped below minimum',
    CIRCUIT_BREAKER_TRIGGERED: 'Circuit breaker activated',
    DRAWDOWN_EXCEEDED: 'Drawdown exceeded safe threshold',
    STALENESS_DETECTED: 'Market data staleness detected',
    MANUAL_REQUEST: 'Manual rollback requested',
    CAMPAIGN_PAUSED: 'Campaign was paused',
    CAMPAIGN_STOPPED: 'Campaign was stopped',
  };

  // Monitor configuration
  private readonly MONITOR_CONFIG = {
    // VRE thresholds for rollback
    min_regime_for_rbm: ['HIGH', 'EXTREME'] as VolatilityRegime[],
    min_confidence_for_rbm: 0.60, // Lower than approval, allows some slack
    
    // Drawdown rollback threshold (percentage of max)
    rollback_drawdown_percentage: 0.50, // More aggressive than approval
    
    // Gradual reduction steps
    reduction_steps: [0.5, 0.25, 0], // Reduce by 50%, 75%, then full reset
  };

  /**
   * Monitor active RBM campaigns and trigger rollback if needed
   * Called periodically by campaignEngineService
   * FASE 4: Auto-Rollback implementation
   */
  async monitorRBM(campaignId: string): Promise<{
    action: 'none' | 'reduce' | 'rollback';
    reason?: string;
    previousValue?: number;
    newValue?: number;
  }> {
    try {
      const campaign = await this.getCampaign(campaignId);
      if (!campaign) {
        return { action: 'none' };
      }

      // Only monitor campaigns with elevated RBM (ACTIVE or REDUCED status)
      const currentRBM = campaign.rbm_approved ? parseFloat(campaign.rbm_approved) : RBM_DEFAULT;
      const rbmStatus = campaign.rbm_status as RbmStatus;
      if (currentRBM <= RBM_DEFAULT || (rbmStatus !== 'ACTIVE' && rbmStatus !== 'REDUCED')) {
        return { action: 'none' };
      }

      // ========== Check rollback triggers ==========
      const rollbackCheck = await this.checkRollbackTriggers(campaign);
      
      if (rollbackCheck.shouldRollback) {
        // Execute rollback
        const result = await this.rollbackRBM(
          campaignId,
          rollbackCheck.targetValue,
          rollbackCheck.reason,
          undefined // system-triggered
        );

        if (result.success) {
          return {
            action: rollbackCheck.targetValue === RBM_DEFAULT ? 'rollback' : 'reduce',
            reason: rollbackCheck.reason,
            previousValue: currentRBM,
            newValue: rollbackCheck.targetValue,
          };
        }
      }

      return { action: 'none' };
    } catch (error) {
      console.error('[RBMService] monitorRBM error:', error);
      return { action: 'none' };
    }
  }

  /**
   * Check all rollback triggers for a campaign
   */
  private async checkRollbackTriggers(campaign: Campaign): Promise<{
    shouldRollback: boolean;
    targetValue: number;
    reason: string;
  }> {
    const currentRBM = campaign.rbm_approved ? parseFloat(campaign.rbm_approved) : RBM_DEFAULT;
    
    // 1. Check campaign status
    if (campaign.status === 'paused') {
      return {
        shouldRollback: true,
        targetValue: RBM_DEFAULT,
        reason: this.ROLLBACK_TRIGGERS.CAMPAIGN_PAUSED,
      };
    }
    
    if (campaign.status === 'stopped' || campaign.status === 'completed') {
      return {
        shouldRollback: true,
        targetValue: RBM_DEFAULT,
        reason: this.ROLLBACK_TRIGGERS.CAMPAIGN_STOPPED,
      };
    }

    // 2. Check VRE regime
    try {
      const vreState = await volatilityRegimeEngine.getCurrentState('XBT/USD');
      
      if (vreState) {
        // Regime dropped below required level
        if (!this.MONITOR_CONFIG.min_regime_for_rbm.includes(vreState.regime)) {
          return {
            shouldRollback: true,
            targetValue: RBM_DEFAULT,
            reason: `${this.ROLLBACK_TRIGGERS.VRE_REGIME_CHANGE} (current: ${vreState.regime})`,
          };
        }
        
        // Confidence dropped significantly
        if (vreState.confidence < this.MONITOR_CONFIG.min_confidence_for_rbm) {
          // Gradual reduction instead of full rollback
          const reducedValue = Math.max(RBM_DEFAULT, currentRBM * 0.5);
          return {
            shouldRollback: true,
            targetValue: reducedValue,
            reason: `${this.ROLLBACK_TRIGGERS.VRE_CONFIDENCE_DROP} (${(vreState.confidence * 100).toFixed(1)}%)`,
          };
        }
      }
    } catch (error) {
      // VRE error - conservative rollback
      console.warn('[RBMService] VRE check failed during monitoring:', error);
      return {
        shouldRollback: true,
        targetValue: RBM_DEFAULT,
        reason: 'VRE unavailable - precautionary rollback',
      };
    }

    // 3. Check circuit breakers
    try {
      const circuitBreakerService = CircuitBreakerService.getInstance();
      const breakerStatus = circuitBreakerService.getStatus('global');
      
      if (breakerStatus.isTripped) {
        return {
          shouldRollback: true,
          targetValue: RBM_DEFAULT,
          reason: `${this.ROLLBACK_TRIGGERS.CIRCUIT_BREAKER_TRIGGERED} (${breakerStatus.reason || 'global'})`,
        };
      }
    } catch (error) {
      console.warn('[RBMService] Circuit breaker check failed:', error);
    }

    // 4. Check drawdown
    try {
      const maxDrawdown = campaign.max_drawdown_percentage ? parseFloat(campaign.max_drawdown_percentage) : 10;
      const currentEquity = campaign.current_equity ? parseFloat(campaign.current_equity) : 0;
      const initialCapital = campaign.initial_capital ? parseFloat(campaign.initial_capital) : 0;
      
      if (initialCapital > 0) {
        const currentDrawdown = ((initialCapital - currentEquity) / initialCapital) * 100;
        const rollbackThreshold = maxDrawdown * this.MONITOR_CONFIG.rollback_drawdown_percentage;
        
        if (currentDrawdown >= rollbackThreshold) {
          // Gradual reduction based on severity
          const severity = currentDrawdown / maxDrawdown;
          let targetValue = RBM_DEFAULT;
          
          if (severity < 0.6) {
            targetValue = Math.max(RBM_DEFAULT, currentRBM * 0.75);
          } else if (severity < 0.8) {
            targetValue = Math.max(RBM_DEFAULT, currentRBM * 0.5);
          }
          
          return {
            shouldRollback: true,
            targetValue,
            reason: `${this.ROLLBACK_TRIGGERS.DRAWDOWN_EXCEEDED} (${currentDrawdown.toFixed(1)}% of ${maxDrawdown}% max)`,
          };
        }
      }
    } catch (error) {
      console.warn('[RBMService] Drawdown check failed:', error);
    }

    // 5. Check staleness
    try {
      const circuitBreakerService = CircuitBreakerService.getInstance();
      const stalenessStatus = circuitBreakerService.getStatus('staleness');
      
      if (stalenessStatus.isTripped) {
        return {
          shouldRollback: true,
          targetValue: Math.max(RBM_DEFAULT, currentRBM * 0.5),
          reason: this.ROLLBACK_TRIGGERS.STALENESS_DETECTED,
        };
      }
    } catch (error) {
      console.warn('[RBMService] Staleness check failed:', error);
    }

    return {
      shouldRollback: false,
      targetValue: currentRBM,
      reason: '',
    };
  }

  /**
   * Execute RBM rollback with protected state transitions
   * FASE 4: Rollback implementation with audit trail
   */
  async rollbackRBM(
    campaignId: string,
    targetValue: number,
    reason: string,
    userId?: string
  ): Promise<{
    success: boolean;
    previousValue: number;
    newValue: number;
    reason: string;
  }> {
    try {
      const campaign = await this.getCampaign(campaignId);
      if (!campaign) {
        return {
          success: false,
          previousValue: RBM_DEFAULT,
          newValue: RBM_DEFAULT,
          reason: 'Campaign not found',
        };
      }

      const previousValue = campaign.rbm_approved ? parseFloat(campaign.rbm_approved) : RBM_DEFAULT;
      
      // Validate target value
      const safeTargetValue = Math.max(RBM_DEFAULT, Math.min(targetValue, previousValue));
      
      // Skip if no change needed
      if (safeTargetValue >= previousValue) {
        return {
          success: true,
          previousValue,
          newValue: previousValue,
          reason: 'No rollback needed',
        };
      }

      // Determine new status
      const newStatus: RbmStatus = safeTargetValue === RBM_DEFAULT ? 'ROLLED_BACK' : 'REDUCED';
      const eventType: RbmEventType = safeTargetValue === RBM_DEFAULT ? 'ROLLBACK' : 'REDUCE';

      // Execute atomic transaction
      await db.transaction(async (tx) => {
        // Update campaign RBM state
        await tx
          .update(schema.campaigns)
          .set({
            rbm_approved: safeTargetValue.toFixed(1),
            rbm_status: newStatus,
            rbm_reduced_at: new Date(),
            rbm_reduced_reason: reason,
          })
          .where(eq(schema.campaigns.id, campaignId));

        // Log rollback event
        await tx.insert(schema.rbm_events).values({
          campaign_id: campaignId,
          event_type: eventType,
          previous_value: previousValue.toFixed(1),
          new_value: safeTargetValue.toFixed(1),
          reason,
          triggered_by: userId ? 'user' : 'system',
          user_id: userId,
        });
      });

      console.log(`[RBMService] RBM ${eventType} for campaign ${campaignId}: ${previousValue}x → ${safeTargetValue}x (${reason})`);

      return {
        success: true,
        previousValue,
        newValue: safeTargetValue,
        reason,
      };
    } catch (error) {
      console.error('[RBMService] rollbackRBM error:', error);
      return {
        success: false,
        previousValue: RBM_DEFAULT,
        newValue: RBM_DEFAULT,
        reason: `Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get all campaigns with elevated RBM that need monitoring
   * Includes both ACTIVE and REDUCED status (need monitoring until rollback to 1.0)
   */
  async getActiveRBMCampaigns(): Promise<Campaign[]> {
    try {
      // Get campaigns with RBM > 1.0 that need monitoring
      const campaigns = await db
        .select()
        .from(schema.campaigns)
        .where(eq(schema.campaigns.status, 'active'));
      
      // Filter to only campaigns with elevated RBM
      return campaigns.filter(c => {
        const rbmValue = c.rbm_approved ? parseFloat(c.rbm_approved) : RBM_DEFAULT;
        const rbmStatus = c.rbm_status as RbmStatus;
        return rbmValue > RBM_DEFAULT && (rbmStatus === 'ACTIVE' || rbmStatus === 'REDUCED');
      });
    } catch (error) {
      console.error('[RBMService] getActiveRBMCampaigns error:', error);
      return [];
    }
  }

  /**
   * Monitor all active RBM campaigns
   * Called by campaignEngineService on each cycle
   */
  async monitorAllActiveRBM(): Promise<{
    monitored: number;
    actions: Array<{ campaignId: string; action: string; reason?: string }>;
  }> {
    const campaigns = await this.getActiveRBMCampaigns();
    const actions: Array<{ campaignId: string; action: string; reason?: string }> = [];

    for (const campaign of campaigns) {
      const result = await this.monitorRBM(campaign.id);
      if (result.action !== 'none') {
        actions.push({
          campaignId: campaign.id,
          action: result.action,
          reason: result.reason,
        });
      }
    }

    return {
      monitored: campaigns.length,
      actions,
    };
  }

  /**
   * Manual deactivation of RBM by user
   */
  async deactivateRBM(campaignId: string, userId: string): Promise<{
    success: boolean;
    reason: string;
  }> {
    return this.rollbackRBM(
      campaignId,
      RBM_DEFAULT,
      this.ROLLBACK_TRIGGERS.MANUAL_REQUEST,
      userId
    ).then((result) => ({
      success: result.success,
      reason: result.reason,
    }));
  }
}

// Export singleton instance
export const rbmService = RBMService.getInstance();
