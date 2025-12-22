import { db } from "../../db";
import * as schema from "@shared/schema";
import { eq, and, desc, gte, lte, sql, isNotNull } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONFIG = {
  MODEL: "gpt-4o",
  MAX_TOKENS: 4000,
  TEMPERATURE: 0.2,
  MIN_SAMPLE_SIZE: 10,
  MIN_CONFIDENCE_SCORE: 0.60,
  ANALYSIS_WINDOW_DAYS: 60,
};

interface OpportunityAnalysisData {
  blueprintId: string;
  opportunityThesis: string;
  opportunityScore: number;
  confidenceLevel: number;
  decision: string;
  decisionReason: string | null;
  hasCampaign: boolean;
  campaignPnl: number | null;
  campaignStatus: string | null;
  marketRegime: string | null;
  capitalRequired: number;
  createdAt: Date;
}

interface OpportunityPatternDiscovery {
  patternType: schema.OpportunityPatternType;
  patternName: string;
  patternDescription: string;
  patternData: Record<string, unknown>;
  confidenceScore: number;
  confidenceLevel: schema.PatternConfidenceLevel;
  approvalRateImpact: number;
  successRateImprovement: number;
  avgPnlImprovement: number;
  aiReasoning: string;
  aiRecommendation: string;
}

class OpportunityLearnerService {
  private static instance: OpportunityLearnerService;

  static getInstance(): OpportunityLearnerService {
    if (!OpportunityLearnerService.instance) {
      OpportunityLearnerService.instance = new OpportunityLearnerService();
    }
    return OpportunityLearnerService.instance;
  }

  async runAnalysis(params: {
    scope: 'global' | 'portfolio' | 'user';
    userId: string;
    portfolioId?: string;
    windowDays?: number;
  }): Promise<schema.LearningRun> {
    const startTime = Date.now();
    const windowDays = params.windowDays || CONFIG.ANALYSIS_WINDOW_DAYS;
    const windowEnd = new Date();
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [run] = await db.insert(schema.learning_runs).values({
      learner_type: 'opportunity',
      run_trigger: 'manual',
      scope: params.scope,
      portfolio_id: params.portfolioId || null,
      user_id: params.userId,
      analysis_window_start: windowStart,
      analysis_window_end: windowEnd,
      min_sample_size: CONFIG.MIN_SAMPLE_SIZE,
      status: 'running',
    }).returning();

    try {
      const decisions = await this.fetchDecisionHistory(params, windowStart, windowEnd);
      
      if (decisions.length < CONFIG.MIN_SAMPLE_SIZE) {
        await this.updateRunStatus(run.id, 'completed', {
          duration_ms: Date.now() - startTime,
          run_summary: { 
            message: `Insufficient data: ${decisions.length} decisions (minimum: ${CONFIG.MIN_SAMPLE_SIZE})`,
            decisions_analyzed: decisions.length,
          },
        });
        return run;
      }

      const patterns = await this.discoverPatterns(decisions, params);
      
      let patternsDiscovered = 0;
      let patternsUpdated = 0;

      for (const pattern of patterns) {
        const existing = await this.findExistingPattern(
          params.scope,
          pattern.patternType,
          pattern.patternName,
          params.userId,
          params.portfolioId
        );

        if (existing) {
          await db.update(schema.opportunity_patterns)
            .set({
              pattern_data: pattern.patternData,
              sample_size: decisions.length,
              confidence_level: pattern.confidenceLevel,
              confidence_score: pattern.confidenceScore.toString(),
              approval_rate_impact: pattern.approvalRateImpact.toString(),
              success_rate_improvement: pattern.successRateImprovement.toString(),
              avg_pnl_improvement: pattern.avgPnlImprovement.toString(),
              ai_reasoning: pattern.aiReasoning,
              ai_recommendation: pattern.aiRecommendation,
              last_validated_at: new Date(),
              updated_at: new Date(),
            })
            .where(eq(schema.opportunity_patterns.id, existing.id));
          patternsUpdated++;
        } else {
          await db.insert(schema.opportunity_patterns).values({
            scope: params.scope,
            user_id: params.scope === 'user' ? params.userId : null,
            portfolio_id: params.portfolioId || null,
            pattern_type: pattern.patternType,
            pattern_name: pattern.patternName,
            pattern_description: pattern.patternDescription,
            pattern_data: pattern.patternData,
            sample_size: decisions.length,
            confidence_level: pattern.confidenceLevel,
            confidence_score: pattern.confidenceScore.toString(),
            approval_rate_impact: pattern.approvalRateImpact.toString(),
            success_rate_improvement: pattern.successRateImprovement.toString(),
            avg_pnl_improvement: pattern.avgPnlImprovement.toString(),
            ai_reasoning: pattern.aiReasoning,
            ai_recommendation: pattern.aiRecommendation,
            is_active: true,
          });
          patternsDiscovered++;
        }
      }

      await this.updateRunStatus(run.id, 'completed', {
        duration_ms: Date.now() - startTime,
        patterns_discovered: patternsDiscovered,
        patterns_updated: patternsUpdated,
        run_summary: {
          decisions_analyzed: decisions.length,
          patterns_found: patterns.length,
          insights: patterns.map(p => p.patternName),
        },
      });

      return run;
    } catch (error: any) {
      await this.updateRunStatus(run.id, 'failed', {
        duration_ms: Date.now() - startTime,
        error_message: error.message,
      });
      throw error;
    }
  }

  private async fetchDecisionHistory(
    params: { scope: string; userId: string; portfolioId?: string },
    windowStart: Date,
    windowEnd: Date
  ): Promise<OpportunityAnalysisData[]> {
    let conditions = [
      gte(schema.co_decision_history.created_at, windowStart),
      lte(schema.co_decision_history.created_at, windowEnd),
    ];

    if (params.scope === 'user') {
      conditions.push(eq(schema.co_decision_history.user_id, params.userId));
    }

    const decisions = await db.select({
      decision: schema.co_decision_history,
      blueprint: schema.opportunity_blueprints,
      campaign: schema.campaigns,
    })
      .from(schema.co_decision_history)
      .leftJoin(
        schema.opportunity_blueprints,
        eq(schema.co_decision_history.blueprint_id, schema.opportunity_blueprints.id)
      )
      .leftJoin(
        schema.campaigns,
        eq(schema.co_decision_history.resulting_campaign_id, schema.campaigns.id)
      )
      .where(and(...conditions))
      .orderBy(desc(schema.co_decision_history.created_at));

    return decisions.map(d => {
      const marketSnapshot = d.decision.market_snapshot as any;
      const campaignParams = d.blueprint?.campaign_parameters as any;
      
      let campaignPnl: number | null = null;
      if (d.campaign) {
        const currentEquity = parseFloat(d.campaign.current_equity);
        const initialCapital = parseFloat(d.campaign.initial_capital);
        campaignPnl = currentEquity - initialCapital;
      }

      return {
        blueprintId: d.decision.blueprint_id,
        opportunityThesis: d.blueprint?.type || 'unknown',
        opportunityScore: d.blueprint?.opportunity_score || 0,
        confidenceLevel: d.blueprint?.confidence ? parseFloat(d.blueprint.confidence) : 0,
        decision: d.decision.decision,
        decisionReason: d.decision.decision_reason,
        hasCampaign: !!d.decision.resulting_campaign_id,
        campaignPnl,
        campaignStatus: d.campaign?.status || null,
        marketRegime: marketSnapshot?.regime || null,
        capitalRequired: campaignParams?.capital_allocation_usd 
          ? parseFloat(campaignParams.capital_allocation_usd) 
          : 0,
        createdAt: d.decision.created_at,
      };
    });
  }

  private async discoverPatterns(
    decisions: OpportunityAnalysisData[],
    params: { scope: string }
  ): Promise<OpportunityPatternDiscovery[]> {
    const statistics = this.calculateDecisionStatistics(decisions);
    
    const prompt = this.buildAnalysisPrompt(decisions, statistics);
    
    const response = await openai.chat.completions.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE,
      messages: [
        {
          role: "system",
          content: `You are an expert investment analyst for DELFOS cryptocurrency opportunity platform. Analyze opportunity decision data to discover patterns that can improve approval rates and campaign success.

You must respond with a JSON array of pattern discoveries. Each pattern must have:
- patternType: one of "approval_success", "rejection_avoidance", "scoring_calibration", "timing_optimization", "thesis_performance", "capital_sizing"
- patternName: short descriptive name (max 100 chars)
- patternDescription: detailed explanation
- patternData: structured data specific to the pattern type
- confidenceScore: 0.0 to 1.0 based on statistical significance
- approvalRateImpact: expected approval rate change (percentage points)
- successRateImprovement: expected success rate improvement (percentage)
- avgPnlImprovement: expected average PnL improvement (percentage)
- aiReasoning: your analysis reasoning
- aiRecommendation: actionable recommendation

Focus on patterns that can help improve opportunity detection, scoring accuracy, and campaign success rates.`
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || '{"patterns":[]}';
    const parsed = JSON.parse(content);
    const rawPatterns = parsed.patterns || [];

    return rawPatterns
      .filter((p: any) => p.confidenceScore >= CONFIG.MIN_CONFIDENCE_SCORE)
      .map((p: any) => ({
        patternType: p.patternType as schema.OpportunityPatternType,
        patternName: p.patternName,
        patternDescription: p.patternDescription,
        patternData: p.patternData || {},
        confidenceScore: p.confidenceScore,
        confidenceLevel: this.getConfidenceLevel(p.confidenceScore),
        approvalRateImpact: p.approvalRateImpact || 0,
        successRateImprovement: p.successRateImprovement || 0,
        avgPnlImprovement: p.avgPnlImprovement || 0,
        aiReasoning: p.aiReasoning,
        aiRecommendation: p.aiRecommendation,
      }));
  }

  private calculateDecisionStatistics(decisions: OpportunityAnalysisData[]) {
    const approved = decisions.filter(d => d.decision === 'approved');
    const rejected = decisions.filter(d => d.decision === 'rejected');
    const withCampaign = decisions.filter(d => d.hasCampaign);
    const successfulCampaigns = withCampaign.filter(d => d.campaignPnl !== null && d.campaignPnl > 0);
    
    const approvalRate = approved.length / decisions.length;
    const campaignSuccessRate = withCampaign.length > 0 
      ? successfulCampaigns.length / withCampaign.length 
      : 0;
    
    const avgCampaignPnl = withCampaign.length > 0
      ? withCampaign.reduce((sum, d) => sum + (d.campaignPnl || 0), 0) / withCampaign.length
      : 0;

    const byThesis = this.groupBy(decisions, 'opportunityThesis');
    const thesisStats = Object.entries(byThesis).map(([thesis, thesisDecisions]) => {
      const thesisApproved = thesisDecisions.filter(d => d.decision === 'approved');
      const thesisWithCampaign = thesisDecisions.filter(d => d.hasCampaign);
      const thesisSuccessful = thesisWithCampaign.filter(d => d.campaignPnl !== null && d.campaignPnl > 0);
      
      return {
        thesis,
        count: thesisDecisions.length,
        approvalRate: thesisApproved.length / thesisDecisions.length,
        successRate: thesisWithCampaign.length > 0 ? thesisSuccessful.length / thesisWithCampaign.length : 0,
        avgScore: thesisDecisions.reduce((sum, d) => sum + d.opportunityScore, 0) / thesisDecisions.length,
        avgPnl: thesisWithCampaign.length > 0 
          ? thesisWithCampaign.reduce((sum, d) => sum + (d.campaignPnl || 0), 0) / thesisWithCampaign.length 
          : 0,
      };
    });

    const byRejectionReason = this.groupBy(rejected, 'decisionReason');
    const rejectionStats = Object.entries(byRejectionReason).map(([reason, reasonDecisions]) => ({
      reason: reason || 'unspecified',
      count: reasonDecisions.length,
      percentage: reasonDecisions.length / rejected.length,
    }));

    const scoreRanges = [
      { min: 90, max: 100, label: '90-100' },
      { min: 80, max: 89, label: '80-89' },
      { min: 70, max: 79, label: '70-79' },
      { min: 60, max: 69, label: '60-69' },
      { min: 0, max: 59, label: '0-59' },
    ];
    
    const scoreStats = scoreRanges.map(range => {
      const rangeDecisions = decisions.filter(
        d => d.opportunityScore >= range.min && d.opportunityScore <= range.max
      );
      const rangeApproved = rangeDecisions.filter(d => d.decision === 'approved');
      const rangeSuccessful = rangeDecisions.filter(d => d.campaignPnl !== null && d.campaignPnl > 0);
      
      return {
        range: range.label,
        count: rangeDecisions.length,
        approvalRate: rangeDecisions.length > 0 ? rangeApproved.length / rangeDecisions.length : 0,
        successRate: rangeDecisions.length > 0 ? rangeSuccessful.length / rangeDecisions.length : 0,
      };
    });

    return {
      totalDecisions: decisions.length,
      approved: approved.length,
      rejected: rejected.length,
      approvalRate,
      campaignsCreated: withCampaign.length,
      successfulCampaigns: successfulCampaigns.length,
      campaignSuccessRate,
      avgCampaignPnl,
      thesisStats: thesisStats.sort((a, b) => b.successRate - a.successRate),
      rejectionStats: rejectionStats.sort((a, b) => b.count - a.count),
      scoreStats,
    };
  }

  private buildAnalysisPrompt(decisions: OpportunityAnalysisData[], statistics: any): string {
    return `Analyze these ${decisions.length} opportunity decisions and discover actionable patterns:

## DECISION STATISTICS
- Total Decisions: ${statistics.totalDecisions}
- Approved: ${statistics.approved} (${(statistics.approvalRate * 100).toFixed(1)}%)
- Rejected: ${statistics.rejected}
- Campaigns Created: ${statistics.campaignsCreated}
- Successful Campaigns: ${statistics.successfulCampaigns} (${(statistics.campaignSuccessRate * 100).toFixed(1)}%)
- Avg Campaign PnL: $${statistics.avgCampaignPnl.toFixed(2)}

## THESIS PERFORMANCE
${statistics.thesisStats.map((t: any) => 
  `- ${t.thesis}: ${t.count} decisions, ${(t.approvalRate * 100).toFixed(1)}% approval, ${(t.successRate * 100).toFixed(1)}% success, avg score ${t.avgScore.toFixed(0)}, avg PnL $${t.avgPnl.toFixed(2)}`
).join('\n')}

## REJECTION REASONS
${statistics.rejectionStats.map((r: any) =>
  `- ${r.reason}: ${r.count} rejections (${(r.percentage * 100).toFixed(1)}%)`
).join('\n')}

## SCORE PERFORMANCE
${statistics.scoreStats.map((s: any) =>
  `- Score ${s.range}: ${s.count} decisions, ${(s.approvalRate * 100).toFixed(1)}% approval, ${(s.successRate * 100).toFixed(1)}% success`
).join('\n')}

## RAW DECISIONS SAMPLE (First 15)
${JSON.stringify(decisions.slice(0, 15), null, 2)}

Respond with JSON: {"patterns": [...]}`;
  }

  private groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
    return arr.reduce((acc, item) => {
      const groupKey = String(item[key] || 'unknown');
      acc[groupKey] = acc[groupKey] || [];
      acc[groupKey].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  }

  private getConfidenceLevel(score: number): schema.PatternConfidenceLevel {
    if (score >= 0.9) return 'very_high';
    if (score >= 0.8) return 'high';
    if (score >= 0.7) return 'medium';
    return 'low';
  }

  private async findExistingPattern(
    scope: string,
    patternType: string,
    patternName: string,
    userId: string,
    portfolioId?: string
  ): Promise<schema.OpportunityPattern | null> {
    const conditions = [
      eq(schema.opportunity_patterns.scope, scope),
      eq(schema.opportunity_patterns.pattern_type, patternType),
      eq(schema.opportunity_patterns.pattern_name, patternName),
      eq(schema.opportunity_patterns.is_active, true),
    ];

    if (scope === 'user') {
      conditions.push(eq(schema.opportunity_patterns.user_id, userId));
    }
    if (portfolioId) {
      conditions.push(eq(schema.opportunity_patterns.portfolio_id, portfolioId));
    }

    const [existing] = await db.select()
      .from(schema.opportunity_patterns)
      .where(and(...conditions))
      .limit(1);

    return existing || null;
  }

  private async updateRunStatus(
    runId: string,
    status: string,
    updates: Partial<schema.LearningRun>
  ): Promise<void> {
    await db.update(schema.learning_runs)
      .set({
        status,
        completed_at: new Date(),
        ...updates,
      })
      .where(eq(schema.learning_runs.id, runId));
  }

  async getActivePatterns(params: {
    scope?: string;
    userId?: string;
    portfolioId?: string;
    patternType?: schema.OpportunityPatternType;
  }): Promise<schema.OpportunityPattern[]> {
    let conditions = [eq(schema.opportunity_patterns.is_active, true)];

    if (params.scope) {
      conditions.push(eq(schema.opportunity_patterns.scope, params.scope));
    }
    if (params.userId) {
      conditions.push(eq(schema.opportunity_patterns.user_id, params.userId));
    }
    if (params.portfolioId) {
      conditions.push(eq(schema.opportunity_patterns.portfolio_id, params.portfolioId));
    }
    if (params.patternType) {
      conditions.push(eq(schema.opportunity_patterns.pattern_type, params.patternType));
    }

    return db.select()
      .from(schema.opportunity_patterns)
      .where(and(...conditions))
      .orderBy(desc(schema.opportunity_patterns.confidence_score));
  }

  async getScoringCalibration(userId: string): Promise<{
    calibrations: Array<{
      thesis: string;
      currentAvgScore: number;
      actualSuccessRate: number;
      suggestedScoreAdjustment: number;
    }>;
    summary: string;
  }> {
    const calibrationPatterns = await this.getActivePatterns({
      userId,
      patternType: 'scoring_calibration',
    });

    if (calibrationPatterns.length === 0) {
      return {
        calibrations: [],
        summary: "No scoring calibration data available. Run opportunity learning analysis first.",
      };
    }

    const calibrations = calibrationPatterns.map(p => {
      const data = p.pattern_data as any;
      return {
        thesis: data.thesis || 'unknown',
        currentAvgScore: data.currentAvgScore || 0,
        actualSuccessRate: data.actualSuccessRate || 0,
        suggestedScoreAdjustment: data.suggestedScoreAdjustment || 0,
      };
    });

    const summary = calibrations.length > 0
      ? `Found calibration data for ${calibrations.length} thesis types. Consider adjusting scores for better accuracy.`
      : "No calibration adjustments needed.";

    return { calibrations, summary };
  }
}

export const opportunityLearnerService = OpportunityLearnerService.getInstance();
