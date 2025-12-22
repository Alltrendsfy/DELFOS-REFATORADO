import { db } from "../../db";
import * as schema from "@shared/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import OpenAI from "openai";
import crypto from "crypto";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONFIG = {
  MODEL: "gpt-4o",
  MAX_TOKENS: 4000,
  TEMPERATURE: 0.2,
  MIN_SAMPLE_SIZE: 20,
  MIN_CONFIDENCE_SCORE: 0.65,
  ANALYSIS_WINDOW_DAYS: 30,
};

interface TradeAnalysisData {
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  holdingTimeHours: number;
  closeReason: string;
  entryHour: number;
  entryDayOfWeek: number;
  entrySlippageBps: number;
  exitSlippageBps: number;
  atrAtEntry: number | null;
}

interface PatternDiscovery {
  patternType: schema.CampaignPatternType;
  patternName: string;
  patternDescription: string;
  patternData: Record<string, unknown>;
  confidenceScore: number;
  confidenceLevel: schema.PatternConfidenceLevel;
  expectedImprovementPct: number;
  aiReasoning: string;
  aiRecommendation: string;
}

class CampaignPatternLearnerService {
  private static instance: CampaignPatternLearnerService;

  static getInstance(): CampaignPatternLearnerService {
    if (!CampaignPatternLearnerService.instance) {
      CampaignPatternLearnerService.instance = new CampaignPatternLearnerService();
    }
    return CampaignPatternLearnerService.instance;
  }

  async runAnalysis(params: {
    scope: 'global' | 'portfolio' | 'campaign';
    portfolioId?: string;
    campaignId?: string;
    userId: string;
    windowDays?: number;
  }): Promise<schema.LearningRun> {
    const startTime = Date.now();
    const windowDays = params.windowDays || CONFIG.ANALYSIS_WINDOW_DAYS;
    const windowEnd = new Date();
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [run] = await db.insert(schema.learning_runs).values({
      learner_type: 'campaign',
      run_trigger: 'manual',
      scope: params.scope,
      portfolio_id: params.portfolioId || null,
      campaign_id: params.campaignId || null,
      user_id: params.userId,
      analysis_window_start: windowStart,
      analysis_window_end: windowEnd,
      min_sample_size: CONFIG.MIN_SAMPLE_SIZE,
      status: 'running',
    }).returning();

    try {
      const trades = await this.fetchClosedPositions(params, windowStart, windowEnd);
      
      if (trades.length < CONFIG.MIN_SAMPLE_SIZE) {
        await this.updateRunStatus(run.id, 'completed', {
          duration_ms: Date.now() - startTime,
          run_summary: { 
            message: `Insufficient data: ${trades.length} trades (minimum: ${CONFIG.MIN_SAMPLE_SIZE})`,
            trades_analyzed: trades.length,
          },
        });
        return run;
      }

      const patterns = await this.discoverPatterns(trades, params);
      
      let patternsDiscovered = 0;
      let patternsUpdated = 0;

      for (const pattern of patterns) {
        const existing = await this.findExistingPattern(
          params.scope,
          pattern.patternType,
          pattern.patternName,
          params.portfolioId,
          params.campaignId
        );

        if (existing) {
          await db.update(schema.campaign_patterns)
            .set({
              pattern_data: pattern.patternData,
              sample_size: trades.length,
              confidence_level: pattern.confidenceLevel,
              confidence_score: pattern.confidenceScore.toString(),
              expected_improvement_pct: pattern.expectedImprovementPct.toString(),
              ai_reasoning: pattern.aiReasoning,
              ai_recommendation: pattern.aiRecommendation,
              last_validated_at: new Date(),
              updated_at: new Date(),
            })
            .where(eq(schema.campaign_patterns.id, existing.id));
          patternsUpdated++;
        } else {
          await db.insert(schema.campaign_patterns).values({
            scope: params.scope,
            portfolio_id: params.portfolioId || null,
            campaign_id: params.campaignId || null,
            pattern_type: pattern.patternType,
            pattern_name: pattern.patternName,
            pattern_description: pattern.patternDescription,
            pattern_data: pattern.patternData,
            sample_size: trades.length,
            confidence_level: pattern.confidenceLevel,
            confidence_score: pattern.confidenceScore.toString(),
            expected_improvement_pct: pattern.expectedImprovementPct.toString(),
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
          trades_analyzed: trades.length,
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

  private async fetchClosedPositions(
    params: { scope: string; portfolioId?: string; campaignId?: string },
    windowStart: Date,
    windowEnd: Date
  ): Promise<TradeAnalysisData[]> {
    let conditions = [
      eq(schema.campaign_positions.state, 'closed'),
      gte(schema.campaign_positions.closed_at, windowStart),
      lte(schema.campaign_positions.closed_at, windowEnd),
    ];

    if (params.campaignId) {
      conditions.push(eq(schema.campaign_positions.campaign_id, params.campaignId));
    } else if (params.portfolioId) {
      const campaigns = await db.select({ id: schema.campaigns.id })
        .from(schema.campaigns)
        .where(eq(schema.campaigns.portfolio_id, params.portfolioId));
      
      if (campaigns.length === 0) return [];
      
      conditions.push(
        sql`${schema.campaign_positions.campaign_id} IN (${sql.join(campaigns.map(c => sql`${c.id}`), sql`, `)})`
      );
    }

    const positions = await db.select()
      .from(schema.campaign_positions)
      .where(and(...conditions))
      .orderBy(desc(schema.campaign_positions.closed_at));

    return positions.map(p => {
      const openedAt = new Date(p.opened_at);
      const closedAt = p.closed_at ? new Date(p.closed_at) : new Date();
      const holdingTimeHours = (closedAt.getTime() - openedAt.getTime()) / (1000 * 60 * 60);
      
      return {
        symbol: p.symbol,
        side: p.side,
        entryPrice: parseFloat(p.entry_price),
        exitPrice: parseFloat(p.current_price),
        pnl: parseFloat(p.realized_pnl),
        pnlPct: p.unrealized_pnl_pct ? parseFloat(p.unrealized_pnl_pct) : 0,
        holdingTimeHours,
        closeReason: p.close_reason || 'unknown',
        entryHour: openedAt.getUTCHours(),
        entryDayOfWeek: openedAt.getUTCDay(),
        entrySlippageBps: p.entry_slippage_bps ? parseFloat(p.entry_slippage_bps) : 0,
        exitSlippageBps: p.exit_slippage_bps ? parseFloat(p.exit_slippage_bps) : 0,
        atrAtEntry: p.atr_at_entry ? parseFloat(p.atr_at_entry) : null,
      };
    });
  }

  private async discoverPatterns(
    trades: TradeAnalysisData[],
    params: { scope: string }
  ): Promise<PatternDiscovery[]> {
    const statistics = this.calculateTradeStatistics(trades);
    
    const prompt = this.buildAnalysisPrompt(trades, statistics);
    
    const response = await openai.chat.completions.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE,
      messages: [
        {
          role: "system",
          content: `You are an expert quantitative trading analyst for DELFOS cryptocurrency trading platform. Analyze trade data to discover actionable patterns that can improve trading performance.

You must respond with a JSON array of pattern discoveries. Each pattern must have:
- patternType: one of "entry_timing", "exit_optimization", "symbol_performance", "risk_sizing", "circuit_breaker", "regime_adaptation", "slippage_impact"
- patternName: short descriptive name (max 100 chars)
- patternDescription: detailed explanation
- patternData: structured data specific to the pattern type
- confidenceScore: 0.0 to 1.0 based on statistical significance
- expectedImprovementPct: estimated performance improvement percentage
- aiReasoning: your analysis reasoning
- aiRecommendation: actionable recommendation for traders

Focus on statistically significant patterns with practical trading implications.`
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
        patternType: p.patternType as schema.CampaignPatternType,
        patternName: p.patternName,
        patternDescription: p.patternDescription,
        patternData: p.patternData || {},
        confidenceScore: p.confidenceScore,
        confidenceLevel: this.getConfidenceLevel(p.confidenceScore),
        expectedImprovementPct: p.expectedImprovementPct || 0,
        aiReasoning: p.aiReasoning,
        aiRecommendation: p.aiRecommendation,
      }));
  }

  private calculateTradeStatistics(trades: TradeAnalysisData[]) {
    const winners = trades.filter(t => t.pnl > 0);
    const losers = trades.filter(t => t.pnl <= 0);
    
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnl = totalPnl / trades.length;
    const hitRate = winners.length / trades.length;
    
    const avgWin = winners.length > 0 
      ? winners.reduce((sum, t) => sum + t.pnl, 0) / winners.length 
      : 0;
    const avgLoss = losers.length > 0 
      ? Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0) / losers.length)
      : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    const bySymbol = this.groupBy(trades, 'symbol');
    const symbolStats = Object.entries(bySymbol).map(([symbol, symbolTrades]) => ({
      symbol,
      count: symbolTrades.length,
      winRate: symbolTrades.filter(t => t.pnl > 0).length / symbolTrades.length,
      totalPnl: symbolTrades.reduce((sum, t) => sum + t.pnl, 0),
      avgSlippage: symbolTrades.reduce((sum, t) => sum + t.entrySlippageBps + t.exitSlippageBps, 0) / symbolTrades.length,
    }));

    const byHour = this.groupBy(trades, 'entryHour');
    const hourStats = Object.entries(byHour).map(([hour, hourTrades]) => ({
      hour: parseInt(hour),
      count: hourTrades.length,
      winRate: hourTrades.filter(t => t.pnl > 0).length / hourTrades.length,
      totalPnl: hourTrades.reduce((sum, t) => sum + t.pnl, 0),
    }));

    const byCloseReason = this.groupBy(trades, 'closeReason');
    const closeReasonStats = Object.entries(byCloseReason).map(([reason, reasonTrades]) => ({
      reason,
      count: reasonTrades.length,
      avgPnl: reasonTrades.reduce((sum, t) => sum + t.pnl, 0) / reasonTrades.length,
      avgHoldingHours: reasonTrades.reduce((sum, t) => sum + t.holdingTimeHours, 0) / reasonTrades.length,
    }));

    return {
      totalTrades: trades.length,
      winners: winners.length,
      losers: losers.length,
      hitRate,
      totalPnl,
      avgPnl,
      avgWin,
      avgLoss,
      payoffRatio,
      symbolStats: symbolStats.sort((a, b) => b.totalPnl - a.totalPnl),
      hourStats: hourStats.sort((a, b) => b.winRate - a.winRate),
      closeReasonStats,
    };
  }

  private buildAnalysisPrompt(trades: TradeAnalysisData[], statistics: any): string {
    return `Analyze these ${trades.length} cryptocurrency trades and discover actionable patterns:

## TRADE STATISTICS
- Total Trades: ${statistics.totalTrades}
- Win Rate: ${(statistics.hitRate * 100).toFixed(1)}%
- Total PnL: $${statistics.totalPnl.toFixed(2)}
- Average PnL: $${statistics.avgPnl.toFixed(2)}
- Avg Win: $${statistics.avgWin.toFixed(2)}
- Avg Loss: $${statistics.avgLoss.toFixed(2)}
- Payoff Ratio: ${statistics.payoffRatio.toFixed(2)}

## SYMBOL PERFORMANCE (Top 10)
${statistics.symbolStats.slice(0, 10).map((s: any) => 
  `- ${s.symbol}: ${s.count} trades, ${(s.winRate * 100).toFixed(1)}% win rate, $${s.totalPnl.toFixed(2)} total PnL, ${s.avgSlippage.toFixed(2)} bps avg slippage`
).join('\n')}

## HOURLY PERFORMANCE (Top 5)
${statistics.hourStats.slice(0, 5).map((h: any) =>
  `- Hour ${h.hour}:00 UTC: ${h.count} trades, ${(h.winRate * 100).toFixed(1)}% win rate, $${h.totalPnl.toFixed(2)} total PnL`
).join('\n')}

## EXIT REASONS
${statistics.closeReasonStats.map((r: any) =>
  `- ${r.reason}: ${r.count} trades, $${r.avgPnl.toFixed(2)} avg PnL, ${r.avgHoldingHours.toFixed(1)}h avg hold`
).join('\n')}

## RAW TRADES SAMPLE (First 20)
${JSON.stringify(trades.slice(0, 20), null, 2)}

Respond with JSON: {"patterns": [...]}`;
  }

  private groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
    return arr.reduce((acc, item) => {
      const groupKey = String(item[key]);
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
    portfolioId?: string,
    campaignId?: string
  ): Promise<schema.CampaignPattern | null> {
    const conditions = [
      eq(schema.campaign_patterns.scope, scope),
      eq(schema.campaign_patterns.pattern_type, patternType),
      eq(schema.campaign_patterns.pattern_name, patternName),
      eq(schema.campaign_patterns.is_active, true),
    ];

    if (portfolioId) {
      conditions.push(eq(schema.campaign_patterns.portfolio_id, portfolioId));
    }
    if (campaignId) {
      conditions.push(eq(schema.campaign_patterns.campaign_id, campaignId));
    }

    const [existing] = await db.select()
      .from(schema.campaign_patterns)
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
    portfolioId?: string;
    campaignId?: string;
    patternType?: schema.CampaignPatternType;
  }): Promise<schema.CampaignPattern[]> {
    let conditions = [eq(schema.campaign_patterns.is_active, true)];

    if (params.scope) {
      conditions.push(eq(schema.campaign_patterns.scope, params.scope));
    }
    if (params.portfolioId) {
      conditions.push(eq(schema.campaign_patterns.portfolio_id, params.portfolioId));
    }
    if (params.campaignId) {
      conditions.push(eq(schema.campaign_patterns.campaign_id, params.campaignId));
    }
    if (params.patternType) {
      conditions.push(eq(schema.campaign_patterns.pattern_type, params.patternType));
    }

    return db.select()
      .from(schema.campaign_patterns)
      .where(and(...conditions))
      .orderBy(desc(schema.campaign_patterns.confidence_score));
  }

  async getRecommendations(campaignId: string): Promise<{
    patterns: schema.CampaignPattern[];
    summary: string;
  }> {
    const [campaign] = await db.select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return { patterns: [], summary: "Campaign not found" };
    }

    const portfolioPatterns = await this.getActivePatterns({
      portfolioId: campaign.portfolio_id,
    });
    const globalPatterns = await this.getActivePatterns({ scope: 'global' });
    const campaignPatterns = await this.getActivePatterns({ campaignId });

    const allPatterns = [...campaignPatterns, ...portfolioPatterns, ...globalPatterns];
    const uniquePatterns = allPatterns.filter((p, i, arr) => 
      arr.findIndex(x => x.pattern_type === p.pattern_type && x.pattern_name === p.pattern_name) === i
    );

    const summary = uniquePatterns.length > 0
      ? `Found ${uniquePatterns.length} active patterns. Key recommendations: ${uniquePatterns.slice(0, 3).map(p => p.pattern_name).join(', ')}`
      : "No learned patterns available. Run pattern analysis to discover insights.";

    return { patterns: uniquePatterns, summary };
  }
}

export const campaignPatternLearnerService = CampaignPatternLearnerService.getInstance();
