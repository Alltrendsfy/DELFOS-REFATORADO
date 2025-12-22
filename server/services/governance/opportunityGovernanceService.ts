import crypto from 'crypto';
import { db } from '../../db';
import { eq, desc, and, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { opportunityLearnerService } from '../ai/opportunityLearnerService';

interface GovernanceCheckResult {
  allowed: boolean;
  var_ok: boolean;
  es_ok: boolean;
  capital_ok: boolean;
  conflict_ok: boolean;
  franchise_ok: boolean;
  reasons: string[];
}

interface RiskSnapshot {
  var_95?: number;
  es_95?: number;
  current_exposure?: number;
  active_campaigns: number;
  total_capital_in_use: number;
  available_capital: number;
}

interface MarketSnapshot {
  btc_price?: number;
  volatility?: number;
  regime?: string;
  timestamp: string;
}

interface ApproveDecisionInput {
  blueprintId: string;
  userId: string;
  portfolioId: string; // V2.0+: REQUIRED for capital validation - prevents cross-portfolio bypass
  franchiseId?: string;
  decidedBy: 'user' | 'system' | 'governance_engine' | 'admin';
  decidedByUserId?: string;
  notes?: string;
  riskSnapshot?: RiskSnapshot;
  marketSnapshot?: MarketSnapshot;
}

interface RejectDecisionInput {
  blueprintId: string;
  userId: string;
  franchiseId?: string;
  decidedBy: 'user' | 'system' | 'governance_engine' | 'admin';
  decidedByUserId?: string;
  reason: schema.CORejectionReason;
  notes?: string;
  riskSnapshot?: RiskSnapshot;
  marketSnapshot?: MarketSnapshot;
}

const SIGNING_KEY = process.env.ENCRYPTION_KEY || 'delfos-governance-signing-key';

const VAR_THRESHOLD = -0.05; // -5% VaR threshold for auto-rejection
const ES_THRESHOLD = -0.08; // -8% ES threshold for auto-rejection

class OpportunityGovernanceService {

  async runGovernanceCheck(
    blueprintId: string,
    userId: string,
    franchiseId?: string,
    targetPortfolioId?: string // V2.0+: Specific portfolio for capital validation
  ): Promise<GovernanceCheckResult> {
    const result: GovernanceCheckResult = {
      allowed: true,
      var_ok: true,
      es_ok: true,
      capital_ok: true,
      conflict_ok: true,
      franchise_ok: true,
      reasons: [],
    };

    const [blueprint] = await db.select()
      .from(schema.opportunity_blueprints)
      .where(eq(schema.opportunity_blueprints.id, blueprintId));

    if (!blueprint) {
      result.allowed = false;
      result.reasons.push('Blueprint not found');
      return result;
    }

    if (blueprint.status !== 'ACTIVE') {
      result.allowed = false;
      result.reasons.push(`Blueprint status is ${blueprint.status}, not ACTIVE`);
      return result;
    }

    if (new Date() > blueprint.expires_at) {
      result.allowed = false;
      result.reasons.push('Blueprint has expired');
      return result;
    }

    const userPortfolios = await db.select({ id: schema.portfolios.id })
      .from(schema.portfolios)
      .where(eq(schema.portfolios.user_id, userId));

    const portfolioIds = userPortfolios.map(p => p.id);

    let activeCount = 0;
    if (portfolioIds.length > 0) {
      const activeCampaigns = await db.select({ count: sql<number>`count(*)` })
        .from(schema.campaigns)
        .where(sql`${schema.campaigns.portfolio_id} IN (${sql.join(portfolioIds.map(id => sql`${id}`), sql`, `)}) AND ${schema.campaigns.status} IN ('active', 'paused')`);
      activeCount = activeCampaigns[0]?.count || 0;
    }

    if (activeCount >= 5) {
      result.conflict_ok = false;
      result.allowed = false;
      result.reasons.push(`Too many active campaigns (${activeCount}/5)`);
    }

    const activeCOs = await db.select({ count: sql<number>`count(*)` })
      .from(schema.opportunity_campaigns)
      .where(and(
        eq(schema.opportunity_campaigns.user_id, userId),
        eq(schema.opportunity_campaigns.status, 'active')
      ));

    const coCount = activeCOs[0]?.count || 0;
    if (coCount >= 3) {
      result.conflict_ok = false;
      result.allowed = false;
      result.reasons.push(`Too many active opportunity campaigns (${coCount}/3)`);
    }

    if (franchiseId) {
      const franchiseCheck = await this.checkFranchiseRestrictions(franchiseId, blueprint);
      if (!franchiseCheck.allowed) {
        result.franchise_ok = false;
        result.allowed = false;
        result.reasons.push(...franchiseCheck.reasons);
      }
    }

    // VaR/ES Governance Check - evaluate user's current risk exposure
    const riskCheck = await this.evaluateVarEsRisk(userId, portfolioIds);
    if (!riskCheck.var_ok) {
      result.var_ok = false;
      result.allowed = false;
      result.reasons.push(riskCheck.var_reason || 'VaR threshold exceeded');
    }
    if (!riskCheck.es_ok) {
      result.es_ok = false;
      result.allowed = false;
      result.reasons.push(riskCheck.es_reason || 'ES threshold exceeded');
    }

    // Capital Availability Check - uses targetPortfolioId if provided for specific validation
    const capitalCheck = await this.evaluateCapitalAvailability(userId, portfolioIds, blueprint, targetPortfolioId);
    if (!capitalCheck.capital_ok) {
      result.capital_ok = false;
      result.allowed = false;
      result.reasons.push(capitalCheck.reason || 'Insufficient capital');
    }

    console.log(`[OpportunityGovernance] Check for blueprint ${blueprintId}: ${result.allowed ? 'ALLOWED' : 'BLOCKED'}`);
    if (!result.allowed) {
      console.log(`[OpportunityGovernance] Reasons: ${result.reasons.join(', ')}`);
    }

    return result;
  }

  private async evaluateVarEsRisk(
    userId: string,
    portfolioIds: string[]
  ): Promise<{ var_ok: boolean; es_ok: boolean; var_reason?: string; es_reason?: string; var_95?: number; es_95?: number }> {
    const result = { var_ok: true, es_ok: true, var_95: undefined as number | undefined, es_95: undefined as number | undefined };

    if (portfolioIds.length === 0) {
      return result; // No portfolios, no risk to evaluate
    }

    try {
      // Get active campaigns for user's portfolios
      const activeCampaigns = await db.select({
        campaign_id: schema.campaigns.id,
      }).from(schema.campaigns)
        .where(sql`${schema.campaigns.portfolio_id} IN (${sql.join(portfolioIds.map(id => sql`${id}`), sql`, `)}) AND ${schema.campaigns.status} = 'active'`);

      if (activeCampaigns.length === 0) {
        return result; // No active campaigns, no risk to evaluate
      }

      const campaignIds = activeCampaigns.map(c => c.campaign_id);

      // Get risk states for active campaigns
      const riskStates = await db.select()
        .from(schema.campaign_risk_states)
        .where(sql`${schema.campaign_risk_states.campaign_id} IN (${sql.join(campaignIds.map(id => sql`${id}`), sql`, `)})`);

      // Calculate aggregate VaR and ES across campaigns
      let maxVar = 0;
      let maxEs = 0;
      for (const state of riskStates) {
        const var95 = state.current_var_95 ? parseFloat(state.current_var_95.toString()) : 0;
        const es95 = state.current_es_95 ? parseFloat(state.current_es_95.toString()) : 0;
        if (var95 > maxVar) maxVar = var95;
        if (es95 > maxEs) maxEs = es95;
      }

      result.var_95 = maxVar;
      result.es_95 = maxEs;

      // Use profile-based thresholds (default 15% VaR, 20% ES)
      const VAR_GOVERNANCE_THRESHOLD = 15; // 15% max VaR for new opportunities
      const ES_GOVERNANCE_THRESHOLD = 20; // 20% max ES for new opportunities

      if (maxVar > 0 && maxVar >= VAR_GOVERNANCE_THRESHOLD) {
        result.var_ok = false;
        result.var_reason = `Aggregate VaR95 (${maxVar.toFixed(2)}%) exceeds governance threshold (${VAR_GOVERNANCE_THRESHOLD}%)`;
      }

      if (maxEs > 0 && maxEs >= ES_GOVERNANCE_THRESHOLD) {
        result.es_ok = false;
        result.es_reason = `Aggregate ES95 (${maxEs.toFixed(2)}%) exceeds governance threshold (${ES_GOVERNANCE_THRESHOLD}%)`;
      }

    } catch (error) {
      console.error('[OpportunityGovernance] Error evaluating VaR/ES risk:', error);
      // Default to OK if evaluation fails (fail-open for governance checks)
    }

    return result;
  }

  private async evaluateCapitalAvailability(
    userId: string,
    portfolioIds: string[],
    blueprint: schema.OpportunityBlueprint,
    targetPortfolioId?: string // V2.0+: Specific portfolio for validation
  ): Promise<{ capital_ok: boolean; reason?: string; available_capital?: number }> {
    const result = { capital_ok: true, available_capital: 0 };

    // User must have at least one portfolio to approve opportunities
    if (portfolioIds.length === 0) {
      result.capital_ok = false;
      result.reason = 'No portfolios found for user - create a portfolio first';
      return result;
    }

    try {
      // Count active campaigns - limit total concurrent campaigns
      const activeCampaigns = await db.select({
        id: schema.campaigns.id,
      }).from(schema.campaigns)
        .where(sql`${schema.campaigns.portfolio_id} IN (${sql.join(portfolioIds.map(id => sql`${id}`), sql`, `)}) AND ${schema.campaigns.status} = 'active'`);

      const MAX_CONCURRENT_CAMPAIGNS = 5;
      if (activeCampaigns.length >= MAX_CONCURRENT_CAMPAIGNS) {
        result.capital_ok = false;
        result.reason = `Maximum concurrent campaigns reached (${activeCampaigns.length}/${MAX_CONCURRENT_CAMPAIGNS})`;
        return result;
      }

      // V2.0+: If targetPortfolioId is provided, validate only that specific portfolio
      // This prevents approving with capital from other portfolios
      if (targetPortfolioId) {
        // Verify target portfolio belongs to user
        if (!portfolioIds.includes(targetPortfolioId)) {
          result.capital_ok = false;
          result.reason = 'Target portfolio does not belong to user';
          return result;
        }

        const [targetPortfolio] = await db.select()
          .from(schema.portfolios)
          .where(eq(schema.portfolios.id, targetPortfolioId));

        if (!targetPortfolio) {
          result.capital_ok = false;
          result.reason = 'Target portfolio not found';
          return result;
        }

        const portfolioAvailableCash = parseFloat(targetPortfolio.available_cash || '0');
        result.available_capital = portfolioAvailableCash;

        const minCapitalRequired = blueprint.min_capital_usd ? parseFloat(blueprint.min_capital_usd.toString()) : 0;
        
        if (minCapitalRequired > 0 && portfolioAvailableCash < minCapitalRequired) {
          result.capital_ok = false;
          result.reason = `Portfolio ${targetPortfolioId} has insufficient available cash ($${portfolioAvailableCash.toFixed(2)}) for blueprint minimum ($${minCapitalRequired.toFixed(2)})`;
          return result;
        }

        // Check exposure limit for specific portfolio
        const portfolioValue = parseFloat(targetPortfolio.total_value_usd || '0');
        const allocatedCapital = portfolioValue - portfolioAvailableCash;
        const MAX_EXPOSURE_RATIO = 0.8;
        
        if (portfolioValue > 0 && allocatedCapital >= portfolioValue * MAX_EXPOSURE_RATIO) {
          result.capital_ok = false;
          result.reason = `Portfolio ${targetPortfolioId} exposure limit reached (${((allocatedCapital / portfolioValue) * 100).toFixed(1)}% allocated, max ${MAX_EXPOSURE_RATIO * 100}%)`;
          return result;
        }

        console.log(`[OpportunityGovernance] Portfolio ${targetPortfolioId} capital check: $${portfolioAvailableCash.toFixed(2)} available`);
        return result;
      }

      // Fallback: Aggregate check across all portfolios (for governance pre-check without specific portfolio)
      const portfolios = await db.select()
        .from(schema.portfolios)
        .where(eq(schema.portfolios.user_id, userId));

      let totalAvailableCash = 0;
      for (const p of portfolios) {
        totalAvailableCash += parseFloat(p.available_cash || '0');
      }
      result.available_capital = totalAvailableCash;

      const minCapitalRequired = blueprint.min_capital_usd ? parseFloat(blueprint.min_capital_usd.toString()) : 0;
      
      if (minCapitalRequired > 0 && totalAvailableCash < minCapitalRequired) {
        result.capital_ok = false;
        result.reason = `Insufficient total available cash ($${totalAvailableCash.toFixed(2)}) for blueprint minimum ($${minCapitalRequired.toFixed(2)})`;
        return result;
      }

      // Check maximum exposure limit across all portfolios
      let totalPortfolioValue = 0;
      for (const p of portfolios) {
        totalPortfolioValue += parseFloat(p.total_value_usd || '0');
      }

      const MAX_EXPOSURE_RATIO = 0.8;
      const allocatedCapital = totalPortfolioValue - totalAvailableCash;
      if (totalPortfolioValue > 0 && allocatedCapital >= totalPortfolioValue * MAX_EXPOSURE_RATIO) {
        result.capital_ok = false;
        result.reason = `Capital exposure limit reached (${((allocatedCapital / totalPortfolioValue) * 100).toFixed(1)}% allocated, max ${MAX_EXPOSURE_RATIO * 100}%)`;
        return result;
      }

    } catch (error) {
      console.error('[OpportunityGovernance] Error evaluating capital availability:', error);
      result.capital_ok = false;
      result.reason = 'Failed to evaluate capital availability';
    }

    return result;
  }

  private async checkFranchiseRestrictions(
    franchiseId: string,
    blueprint: schema.OpportunityBlueprint
  ): Promise<{ allowed: boolean; reasons: string[] }> {
    const result = { allowed: true, reasons: [] as string[] };

    try {
      const [franchise] = await db.select()
        .from(schema.franchises)
        .where(eq(schema.franchises.id, franchiseId));

      if (!franchise) {
        result.allowed = false;
        result.reasons.push('Franchise not found');
        return result;
      }

      if (franchise.status !== 'active') {
        result.allowed = false;
        result.reasons.push(`Franchise status is ${franchise.status}`);
        return result;
      }

    } catch (error) {
      console.error('[OpportunityGovernance] Error checking franchise:', error);
    }

    return result;
  }

  async approveOpportunity(input: ApproveDecisionInput): Promise<{
    success: boolean;
    decisionId?: string;
    error?: string;
  }> {
    // V2.0+: Service-level validation - require portfolioId when blueprint has capital requirements
    // This prevents non-HTTP callers (automation, batch jobs) from bypassing portfolio-specific validation
    const [blueprint] = await db.select()
      .from(schema.opportunity_blueprints)
      .where(eq(schema.opportunity_blueprints.id, input.blueprintId));

    if (!blueprint) {
      return { success: false, error: 'Blueprint not found' };
    }

    // V2.0+: Check ALL capital-related fields to cover all scenarios
    const requiredCapital = Number(blueprint.capital_required_usd || 0) ||
                           Number(blueprint.recommended_capital_usd || 0) ||
                           Number(blueprint.min_capital_usd || 0);
    if (requiredCapital > 0 && !input.portfolioId) {
      return {
        success: false,
        error: 'portfolioId is REQUIRED when approving blueprints with capital requirements. This prevents cross-portfolio capital bypass.',
      };
    }

    // V2.0+: Pass portfolioId for specific portfolio capital validation
    const governanceCheck = await this.runGovernanceCheck(
      input.blueprintId,
      input.userId,
      input.franchiseId,
      input.portfolioId // Specific portfolio for capital validation
    );

    if (!governanceCheck.allowed) {
      return {
        success: false,
        error: `Governance check failed: ${governanceCheck.reasons.join(', ')}`,
      };
    }

    const [lastDecision] = await db.select()
      .from(schema.co_decision_history)
      .where(eq(schema.co_decision_history.user_id, input.userId))
      .orderBy(desc(schema.co_decision_history.created_at))
      .limit(1);

    const previousHash = lastDecision?.entry_hash || null;

    const entryData = {
      blueprint_id: input.blueprintId,
      user_id: input.userId,
      franchise_id: input.franchiseId,
      decision: 'approved' as const,
      decided_by: input.decidedBy,
      governance_check: governanceCheck,
      risk_snapshot: input.riskSnapshot,
      market_snapshot: input.marketSnapshot,
      previous_hash: previousHash,
      timestamp: new Date().toISOString(),
    };

    const entryHash = this.generateHash(entryData);
    const signature = this.signEntry(entryHash);

    const [decision] = await db.insert(schema.co_decision_history).values({
      blueprint_id: input.blueprintId,
      user_id: input.userId,
      franchise_id: input.franchiseId || null,
      decision: 'approved',
      decision_notes: input.notes,
      decided_by: input.decidedBy,
      decided_by_user_id: input.decidedByUserId,
      governance_check: governanceCheck,
      risk_snapshot: input.riskSnapshot,
      market_snapshot: input.marketSnapshot,
      entry_hash: entryHash,
      previous_hash: previousHash,
      signature,
      signature_algorithm: 'HMAC-SHA256',
    }).returning();

    await db.update(schema.opportunity_blueprints)
      .set({
        status: 'CONSUMED',
        consumed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.opportunity_blueprints.id, input.blueprintId));

    console.log(`[OpportunityGovernance] Blueprint ${input.blueprintId} APPROVED by ${input.decidedBy}`);

    return {
      success: true,
      decisionId: decision.id,
    };
  }

  async rejectOpportunity(input: RejectDecisionInput): Promise<{
    success: boolean;
    decisionId?: string;
    error?: string;
  }> {
    const [blueprint] = await db.select()
      .from(schema.opportunity_blueprints)
      .where(eq(schema.opportunity_blueprints.id, input.blueprintId));

    if (!blueprint) {
      return { success: false, error: 'Blueprint not found' };
    }

    if (blueprint.status !== 'ACTIVE') {
      return { success: false, error: `Blueprint is not active (${blueprint.status})` };
    }

    const [lastDecision] = await db.select()
      .from(schema.co_decision_history)
      .where(eq(schema.co_decision_history.user_id, input.userId))
      .orderBy(desc(schema.co_decision_history.created_at))
      .limit(1);

    const previousHash = lastDecision?.entry_hash || null;

    const governanceCheck: GovernanceCheckResult = {
      allowed: false,
      var_ok: input.reason !== 'var_es_threshold',
      es_ok: input.reason !== 'var_es_threshold',
      capital_ok: input.reason !== 'insufficient_capital',
      conflict_ok: input.reason !== 'active_campaigns_conflict',
      franchise_ok: input.reason !== 'franchise_restriction',
      reasons: [input.reason],
    };

    const entryData = {
      blueprint_id: input.blueprintId,
      user_id: input.userId,
      franchise_id: input.franchiseId,
      decision: 'rejected' as const,
      decision_reason: input.reason,
      decided_by: input.decidedBy,
      governance_check: governanceCheck,
      previous_hash: previousHash,
      timestamp: new Date().toISOString(),
    };

    const entryHash = this.generateHash(entryData);
    const signature = this.signEntry(entryHash);

    const [decision] = await db.insert(schema.co_decision_history).values({
      blueprint_id: input.blueprintId,
      user_id: input.userId,
      franchise_id: input.franchiseId || null,
      decision: 'rejected',
      decision_reason: input.reason,
      decision_notes: input.notes,
      decided_by: input.decidedBy,
      decided_by_user_id: input.decidedByUserId,
      governance_check: governanceCheck,
      risk_snapshot: input.riskSnapshot,
      market_snapshot: input.marketSnapshot,
      entry_hash: entryHash,
      previous_hash: previousHash,
      signature,
      signature_algorithm: 'HMAC-SHA256',
    }).returning();

    await db.update(schema.opportunity_blueprints)
      .set({
        status: 'EXPIRED',
        updated_at: new Date(),
      })
      .where(eq(schema.opportunity_blueprints.id, input.blueprintId));

    console.log(`[OpportunityGovernance] Blueprint ${input.blueprintId} REJECTED (${input.reason}) by ${input.decidedBy}`);

    return {
      success: true,
      decisionId: decision.id,
    };
  }

  async linkCampaignToDecision(decisionId: string, campaignId: string): Promise<boolean> {
    try {
      await db.update(schema.co_decision_history)
        .set({ resulting_campaign_id: campaignId })
        .where(eq(schema.co_decision_history.id, decisionId));
      return true;
    } catch (error) {
      console.error('[OpportunityGovernance] Error linking campaign:', error);
      return false;
    }
  }

  async getDecisionHistory(
    userId: string,
    limit: number = 50,
    blueprintId?: string
  ): Promise<schema.CODecisionHistory[]> {
    let query = db.select()
      .from(schema.co_decision_history)
      .where(eq(schema.co_decision_history.user_id, userId))
      .orderBy(desc(schema.co_decision_history.created_at))
      .limit(limit);

    if (blueprintId) {
      query = db.select()
        .from(schema.co_decision_history)
        .where(and(
          eq(schema.co_decision_history.user_id, userId),
          eq(schema.co_decision_history.blueprint_id, blueprintId)
        ))
        .orderBy(desc(schema.co_decision_history.created_at))
        .limit(limit);
    }

    return query;
  }

  async verifyDecisionChain(userId: string): Promise<{
    valid: boolean;
    errors: string[];
    checkedEntries: number;
  }> {
    const decisions = await db.select()
      .from(schema.co_decision_history)
      .where(eq(schema.co_decision_history.user_id, userId))
      .orderBy(schema.co_decision_history.created_at);

    const result = {
      valid: true,
      errors: [] as string[],
      checkedEntries: decisions.length,
    };

    if (decisions.length === 0) {
      return result;
    }

    if (decisions[0].previous_hash !== null) {
      result.valid = false;
      result.errors.push('First decision should have null previous_hash');
    }

    for (let i = 1; i < decisions.length; i++) {
      const current = decisions[i];
      const previous = decisions[i - 1];

      if (current.previous_hash !== previous.entry_hash) {
        result.valid = false;
        result.errors.push(
          `Chain broken at decision ${current.id}: ` +
          `expected previous_hash ${previous.entry_hash?.substring(0, 16)}...`
        );
        break;
      }
    }

    return result;
  }

  async getDecisionStats(userId: string): Promise<{
    totalDecisions: number;
    approved: number;
    rejected: number;
    autoApproved: number;
    autoRejected: number;
    expired: number;
  }> {
    const decisions = await db.select({
      decision: schema.co_decision_history.decision,
    })
      .from(schema.co_decision_history)
      .where(eq(schema.co_decision_history.user_id, userId));

    return {
      totalDecisions: decisions.length,
      approved: decisions.filter(d => d.decision === 'approved').length,
      rejected: decisions.filter(d => d.decision === 'rejected').length,
      autoApproved: decisions.filter(d => d.decision === 'auto_approved').length,
      autoRejected: decisions.filter(d => d.decision === 'auto_rejected').length,
      expired: decisions.filter(d => d.decision === 'expired').length,
    };
  }

  /**
   * Generate SHA-256 hash with canonical JSON serialization (sorted keys)
   * to ensure deterministic hashing regardless of object key order
   */
  private generateHash(data: Record<string, any>): string {
    const hashInput = this.canonicalSerialize(data);
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Canonical JSON serialization with sorted keys for deterministic hashing
   */
  private canonicalSerialize(obj: any): string {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj === 'string') return JSON.stringify(obj);
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => this.canonicalSerialize(item)).join(',') + ']';
    }
    if (typeof obj === 'object') {
      const sortedKeys = Object.keys(obj).sort();
      const entries = sortedKeys.map(key => 
        `${JSON.stringify(key)}:${this.canonicalSerialize(obj[key])}`
      );
      return '{' + entries.join(',') + '}';
    }
    return String(obj);
  }

  private signEntry(entryHash: string): string {
    return crypto
      .createHmac('sha256', SIGNING_KEY)
      .update(entryHash)
      .digest('hex');
  }

  verifySignature(entryHash: string, signature: string): boolean {
    const expectedSignature = this.signEntry(entryHash);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Get AI-learned insights for opportunity evaluation
   * Integrates learned patterns to enhance decision-making
   */
  async getLearnedInsights(userId: string, blueprintId: string): Promise<{
    hasInsights: boolean;
    patterns: schema.OpportunityPattern[];
    recommendations: string[];
    scoringAdjustment: number;
    confidenceBoost: number;
  }> {
    const result = {
      hasInsights: false,
      patterns: [] as schema.OpportunityPattern[],
      recommendations: [] as string[],
      scoringAdjustment: 0,
      confidenceBoost: 0,
    };

    try {
      const [blueprint] = await db.select()
        .from(schema.opportunity_blueprints)
        .where(eq(schema.opportunity_blueprints.id, blueprintId));

      if (!blueprint) return result;

      const globalPatterns = await opportunityLearnerService.getActivePatterns({
        scope: 'global',
      });

      const userPatterns = await opportunityLearnerService.getActivePatterns({
        scope: 'user',
        userId,
      });

      result.patterns = [...userPatterns, ...globalPatterns].filter((p, i, arr) => 
        arr.findIndex(x => x.pattern_type === p.pattern_type && x.pattern_name === p.pattern_name) === i
      );

      if (result.patterns.length === 0) return result;

      result.hasInsights = true;

      for (const pattern of result.patterns) {
        if (pattern.ai_recommendation) {
          result.recommendations.push(pattern.ai_recommendation);
        }

        const patternData = pattern.pattern_data as any;
        
        if (pattern.pattern_type === 'scoring_calibration' && patternData.thesis === blueprint.thesis_type) {
          result.scoringAdjustment += patternData.suggestedScoreAdjustment || 0;
        }

        if (pattern.pattern_type === 'thesis_performance') {
          const confidenceScore = pattern.confidence_score ? parseFloat(pattern.confidence_score) : 0;
          if (confidenceScore > 0.8) {
            result.confidenceBoost += 0.05;
          } else if (confidenceScore > 0.7) {
            result.confidenceBoost += 0.02;
          }
        }
      }

      return result;
    } catch (error) {
      console.error('Error fetching learned insights:', error);
      return result;
    }
  }
}

export const opportunityGovernanceService = new OpportunityGovernanceService();
