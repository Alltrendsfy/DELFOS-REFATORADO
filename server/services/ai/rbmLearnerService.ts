import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { nanoid } from 'nanoid';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONFIG = {
  MODEL: 'gpt-4o',
  MAX_TOKENS: 2000,
  TEMPERATURE: 0.3,
  MIN_EVENTS_FOR_ANALYSIS: 10,
  MIN_CONFIDENCE_SCORE: 0.6,
};

interface RBMAnalysisData {
  campaignId: string;
  campaignName: string;
  investorProfile: string;
  multiplier: number;
  eventType: string;
  pnlBeforeRBM: number;
  pnlAfterRBM: number;
  holdingTimeHours: number;
  vreRegime: string;
  rollbackReason?: string;
  timestamp: Date;
}

interface RBMPatternDiscovery {
  patternName: string;
  patternDescription: string;
  optimalMultiplierRange: { min: number; max: number };
  recommendedConditions: string[];
  riskWarnings: string[];
  confidenceScore: number;
  expectedImprovementPct: number;
  aiReasoning: string;
  aiRecommendation: string;
}

class RBMLearnerService {
  private static instance: RBMLearnerService;

  static getInstance(): RBMLearnerService {
    if (!RBMLearnerService.instance) {
      RBMLearnerService.instance = new RBMLearnerService();
    }
    return RBMLearnerService.instance;
  }

  async runRBMAnalysis(params: {
    scope: 'global' | 'portfolio' | 'campaign';
    portfolioId?: string;
    campaignId?: string;
    userId: string;
    windowDays?: number;
  }): Promise<{ success: boolean; patternsFound: number; summary: string }> {
    const windowDays = params.windowDays || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - windowDays);

    try {
      const rbmEvents = await this.fetchRBMEvents(params.campaignId, startDate);

      if (rbmEvents.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
        return {
          success: false,
          patternsFound: 0,
          summary: `Insufficient RBM events for analysis. Found ${rbmEvents.length}, need at least ${CONFIG.MIN_EVENTS_FOR_ANALYSIS}.`,
        };
      }

      const analysisData = await this.buildAnalysisData(rbmEvents);
      const patterns = await this.discoverRBMPatterns(analysisData);

      let patternsCreated = 0;
      for (const pattern of patterns) {
        await this.savePattern(pattern, params);
        patternsCreated++;
      }

      return {
        success: true,
        patternsFound: patternsCreated,
        summary: `Analyzed ${rbmEvents.length} RBM events. Found ${patternsCreated} optimization patterns.`,
      };
    } catch (error) {
      console.error('[RBMLearner] Analysis failed:', error);
      return {
        success: false,
        patternsFound: 0,
        summary: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async fetchRBMEvents(campaignId: string | undefined, startDate: Date) {
    const conditions = [gte(schema.rbm_events.created_at, startDate)];
    
    if (campaignId) {
      conditions.push(eq(schema.rbm_events.campaign_id, campaignId));
    }

    return db.select()
      .from(schema.rbm_events)
      .where(and(...conditions))
      .orderBy(desc(schema.rbm_events.created_at))
      .limit(500);
  }

  private async buildAnalysisData(events: schema.RbmEvent[]): Promise<RBMAnalysisData[]> {
    const analysisData: RBMAnalysisData[] = [];

    for (const event of events) {
      const [campaign] = await db.select()
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, event.campaign_id))
        .limit(1);

      if (!campaign) continue;

      analysisData.push({
        campaignId: event.campaign_id,
        campaignName: campaign.name,
        investorProfile: campaign.investor_profile || 'M',
        multiplier: parseFloat(event.new_value || '1.0'),
        eventType: event.event_type,
        pnlBeforeRBM: 0,
        pnlAfterRBM: 0,
        holdingTimeHours: 0,
        vreRegime: (event.quality_gate_snapshot as any)?.vreRegime || 'NORMAL',
        rollbackReason: event.reason || undefined,
        timestamp: event.created_at ? new Date(event.created_at) : new Date(),
      });
    }

    return analysisData;
  }

  private async discoverRBMPatterns(data: RBMAnalysisData[]): Promise<RBMPatternDiscovery[]> {
    const statistics = this.calculateRBMStatistics(data);
    const prompt = this.buildRBMPrompt(data, statistics);

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.MODEL,
        max_tokens: CONFIG.MAX_TOKENS,
        temperature: CONFIG.TEMPERATURE,
        messages: [
          {
            role: 'system',
            content: `You are an expert quantitative trading analyst specializing in risk management for DELFOS cryptocurrency trading platform. Analyze RBM (Risk-Based Multiplier) usage patterns to discover optimal multiplier strategies.

You must respond with a JSON object containing a "patterns" array. Each pattern must have:
- patternName: short descriptive name (max 100 chars)
- patternDescription: detailed explanation
- optimalMultiplierRange: { min: number, max: number }
- recommendedConditions: array of conditions when to use higher multipliers
- riskWarnings: array of warnings about multiplier usage
- confidenceScore: 0.0 to 1.0 based on data quality
- expectedImprovementPct: estimated risk-adjusted return improvement
- aiReasoning: your analysis reasoning
- aiRecommendation: actionable recommendation

Focus on patterns that balance risk amplification with capital protection.`,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content || '{"patterns":[]}';
      const parsed = JSON.parse(content);
      const rawPatterns = parsed.patterns || [];

      return rawPatterns
        .filter((p: any) => p.confidenceScore >= CONFIG.MIN_CONFIDENCE_SCORE)
        .map((p: any) => ({
          patternName: p.patternName,
          patternDescription: p.patternDescription,
          optimalMultiplierRange: p.optimalMultiplierRange || { min: 1.0, max: 2.0 },
          recommendedConditions: p.recommendedConditions || [],
          riskWarnings: p.riskWarnings || [],
          confidenceScore: p.confidenceScore,
          expectedImprovementPct: p.expectedImprovementPct || 0,
          aiReasoning: p.aiReasoning,
          aiRecommendation: p.aiRecommendation,
        }));
    } catch (error) {
      console.error('[RBMLearner] OpenAI API error:', error);
      return [];
    }
  }

  private calculateRBMStatistics(data: RBMAnalysisData[]) {
    const approvals = data.filter(d => d.eventType === 'APPROVE');
    const rollbacks = data.filter(d => d.eventType === 'REDUCE' || d.eventType === 'DENY');
    const restores = data.filter(d => d.eventType === 'RESTORE');

    const multiplierByProfile: Record<string, number[]> = {};
    for (const d of approvals) {
      if (!multiplierByProfile[d.investorProfile]) {
        multiplierByProfile[d.investorProfile] = [];
      }
      multiplierByProfile[d.investorProfile].push(d.multiplier);
    }

    const profileStats = Object.entries(multiplierByProfile).map(([profile, multipliers]) => ({
      profile,
      avgMultiplier: multipliers.reduce((a, b) => a + b, 0) / multipliers.length,
      maxMultiplier: Math.max(...multipliers),
      count: multipliers.length,
    }));

    const rollbackReasons: Record<string, number> = {};
    for (const r of rollbacks) {
      const reason = r.rollbackReason || 'unknown';
      rollbackReasons[reason] = (rollbackReasons[reason] || 0) + 1;
    }

    const vreRegimeStats: Record<string, { approvals: number; rollbacks: number }> = {};
    for (const d of data) {
      if (!vreRegimeStats[d.vreRegime]) {
        vreRegimeStats[d.vreRegime] = { approvals: 0, rollbacks: 0 };
      }
      if (d.eventType === 'APPROVE') {
        vreRegimeStats[d.vreRegime].approvals++;
      } else if (d.eventType === 'REDUCE' || d.eventType === 'DENY') {
        vreRegimeStats[d.vreRegime].rollbacks++;
      }
    }

    return {
      totalEvents: data.length,
      approvals: approvals.length,
      rollbacks: rollbacks.length,
      restores: restores.length,
      rollbackRate: rollbacks.length / (approvals.length || 1),
      profileStats,
      rollbackReasons,
      vreRegimeStats,
    };
  }

  private buildRBMPrompt(data: RBMAnalysisData[], statistics: any): string {
    return `Analyze these ${data.length} RBM (Risk-Based Multiplier) events and discover optimal usage patterns:

## RBM STATISTICS
- Total Events: ${statistics.totalEvents}
- Approvals: ${statistics.approvals}
- Rollbacks: ${statistics.rollbacks} (${(statistics.rollbackRate * 100).toFixed(1)}% rollback rate)
- Restores: ${statistics.restores}

## PERFORMANCE BY INVESTOR PROFILE
${statistics.profileStats.map((p: any) => 
  `- ${p.profile}: ${p.count} activations, avg ${p.avgMultiplier.toFixed(2)}x, max ${p.maxMultiplier.toFixed(1)}x`
).join('\n')}

## ROLLBACK REASONS
${Object.entries(statistics.rollbackReasons).map(([reason, count]) => 
  `- ${reason}: ${count} occurrences`
).join('\n')}

## VRE REGIME PERFORMANCE
${Object.entries(statistics.vreRegimeStats).map(([regime, stats]: [string, any]) => 
  `- ${regime}: ${stats.approvals} approvals, ${stats.rollbacks} rollbacks (${(stats.rollbacks / (stats.approvals || 1) * 100).toFixed(1)}% rollback rate)`
).join('\n')}

## SAMPLE EVENTS (First 20)
${JSON.stringify(data.slice(0, 20).map(d => ({
  profile: d.investorProfile,
  multiplier: d.multiplier,
  eventType: d.eventType,
  vreRegime: d.vreRegime,
  reason: d.rollbackReason,
})), null, 2)}

Respond with JSON: {"patterns": [...]}`;
  }

  private async savePattern(pattern: RBMPatternDiscovery, params: {
    scope: 'global' | 'portfolio' | 'campaign';
    portfolioId?: string;
    campaignId?: string;
  }) {
    const existing = await db.select()
      .from(schema.campaign_patterns)
      .where(and(
        eq(schema.campaign_patterns.pattern_type, 'rbm_optimization'),
        eq(schema.campaign_patterns.pattern_name, pattern.patternName),
        eq(schema.campaign_patterns.scope, params.scope),
      ))
      .limit(1);

    const patternData = {
      optimalMultiplierRange: pattern.optimalMultiplierRange,
      recommendedConditions: pattern.recommendedConditions,
      riskWarnings: pattern.riskWarnings,
    };

    if (existing.length > 0) {
      await db.update(schema.campaign_patterns)
        .set({
          pattern_data: patternData,
          confidence_score: pattern.confidenceScore.toString(),
          expected_improvement_pct: pattern.expectedImprovementPct.toString(),
          ai_reasoning: pattern.aiReasoning,
          ai_recommendation: pattern.aiRecommendation,
          last_validated_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(schema.campaign_patterns.id, existing[0].id));
    } else {
      await db.insert(schema.campaign_patterns).values({
        scope: params.scope,
        portfolio_id: params.portfolioId || null,
        campaign_id: params.campaignId || null,
        pattern_type: 'rbm_optimization',
        pattern_name: pattern.patternName,
        pattern_description: pattern.patternDescription,
        pattern_data: patternData,
        sample_size: 0,
        confidence_level: this.getConfidenceLevel(pattern.confidenceScore),
        confidence_score: pattern.confidenceScore.toString(),
        expected_improvement_pct: pattern.expectedImprovementPct.toString(),
        ai_reasoning: pattern.aiReasoning,
        ai_recommendation: pattern.aiRecommendation,
        is_active: true,
      });
    }
  }

  private getConfidenceLevel(score: number): schema.PatternConfidenceLevel {
    if (score >= 0.85) return 'very_high';
    if (score >= 0.70) return 'high';
    if (score >= 0.50) return 'medium';
    return 'low';
  }

  async getRBMRecommendations(campaignId: string): Promise<{
    patterns: schema.CampaignPattern[];
    recommendedMultiplier: number;
    riskLevel: string;
  }> {
    const patterns = await db.select()
      .from(schema.campaign_patterns)
      .where(and(
        eq(schema.campaign_patterns.pattern_type, 'rbm_optimization'),
        eq(schema.campaign_patterns.is_active, true),
      ))
      .orderBy(desc(schema.campaign_patterns.confidence_score))
      .limit(5);

    let recommendedMultiplier = 1.0;
    let riskLevel = 'low';

    if (patterns.length > 0) {
      const topPattern = patterns[0];
      const patternData = topPattern.pattern_data as any;
      if (patternData?.optimalMultiplierRange) {
        recommendedMultiplier = (patternData.optimalMultiplierRange.min + patternData.optimalMultiplierRange.max) / 2;
        riskLevel = recommendedMultiplier > 2.5 ? 'high' : recommendedMultiplier > 1.5 ? 'moderate' : 'low';
      }
    }

    return {
      patterns,
      recommendedMultiplier,
      riskLevel,
    };
  }
}

export const rbmLearnerService = RBMLearnerService.getInstance();
