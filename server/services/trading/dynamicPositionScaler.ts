import { db } from "../../db";
import * as schema from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { marketRegimeDetector, type MarketRegime } from "./marketRegimeDetector";

export interface ScalingContext {
  campaignId: string;
  equity: number;
  baseRiskPct: number;
  currentDDPct: number;
  maxDDPct: number;
  ddSoftReduceAt: number;
  currentVaR95: number | null;
  currentES95: number | null;
  varThreshold: number;
  esThreshold: number;
  regime?: 'bull' | 'bear' | 'sideways' | null;
}

export interface ScalingResult {
  scaledRiskPct: number;
  scalingFactor: number;
  reasons: string[];
  adjustments: {
    ddAdjustment: number;
    varEsAdjustment: number;
    winRateAdjustment: number;
    regimeAdjustment: number;
  };
}

export class DynamicPositionScaler {
  private static instance: DynamicPositionScaler;

  private constructor() {}

  static getInstance(): DynamicPositionScaler {
    if (!DynamicPositionScaler.instance) {
      DynamicPositionScaler.instance = new DynamicPositionScaler();
    }
    return DynamicPositionScaler.instance;
  }

  async calculateScaledRisk(context: ScalingContext): Promise<ScalingResult> {
    const reasons: string[] = [];
    let scalingFactor = 1.0;

    const ddAdjustment = this.calculateDDScaling(context);
    if (ddAdjustment < 1.0) {
      scalingFactor *= ddAdjustment;
      reasons.push(`DD scaling: ${(ddAdjustment * 100).toFixed(0)}% (DD at ${Math.abs(context.currentDDPct).toFixed(1)}%)`);
    }

    const varEsAdjustment = this.calculateVarEsScaling(context);
    if (varEsAdjustment < 1.0) {
      scalingFactor *= varEsAdjustment;
      reasons.push(`VaR/ES scaling: ${(varEsAdjustment * 100).toFixed(0)}%`);
    }

    const winRateAdjustment = await this.calculateWinRateScaling(context.campaignId);
    if (winRateAdjustment !== 1.0) {
      scalingFactor *= winRateAdjustment;
      reasons.push(`Win rate scaling: ${(winRateAdjustment * 100).toFixed(0)}%`);
    }

    let regime = context.regime;
    if (!regime) {
      try {
        regime = await marketRegimeDetector.detectAggregateRegime();
      } catch {
        regime = 'sideways';
      }
    }

    const regimeAdjustment = this.calculateRegimeScaling(regime);
    if (regimeAdjustment !== 1.0) {
      scalingFactor *= regimeAdjustment;
      reasons.push(`Regime scaling: ${(regimeAdjustment * 100).toFixed(0)}% (${regime})`);
    }

    scalingFactor = Math.max(0.25, Math.min(1.5, scalingFactor));

    const scaledRiskPct = context.baseRiskPct * scalingFactor;

    return {
      scaledRiskPct,
      scalingFactor,
      reasons,
      adjustments: {
        ddAdjustment,
        varEsAdjustment,
        winRateAdjustment,
        regimeAdjustment,
      },
    };
  }

  private calculateDDScaling(context: ScalingContext): number {
    const ddPct = Math.abs(context.currentDDPct);
    const maxDD = context.maxDDPct;
    const softReduceAt = context.ddSoftReduceAt;

    if (ddPct <= 0) return 1.0;

    const softThreshold = maxDD * softReduceAt;

    if (ddPct >= maxDD) {
      return 0.25;
    }

    if (ddPct >= softThreshold) {
      const progress = (ddPct - softThreshold) / (maxDD - softThreshold);
      return 1.0 - (progress * 0.75);
    }

    return 1.0;
  }

  private calculateVarEsScaling(context: ScalingContext): number {
    let varFactor = 1.0;
    let esFactor = 1.0;

    if (context.currentVaR95 !== null && context.currentVaR95 > 0) {
      const varRatio = context.currentVaR95 / context.varThreshold;
      if (varRatio >= 0.8) {
        varFactor = 1.0 - ((varRatio - 0.8) * 2.5);
        varFactor = Math.max(0.5, varFactor);
      }
    }

    if (context.currentES95 !== null && context.currentES95 > 0) {
      const esRatio = context.currentES95 / context.esThreshold;
      if (esRatio >= 0.8) {
        esFactor = 1.0 - ((esRatio - 0.8) * 2.5);
        esFactor = Math.max(0.4, esFactor);
      }
    }

    return Math.min(varFactor, esFactor);
  }

  private async calculateWinRateScaling(campaignId: string): Promise<number> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const recentPositions = await db.select()
        .from(schema.campaign_positions)
        .where(and(
          eq(schema.campaign_positions.campaign_id, campaignId),
          eq(schema.campaign_positions.state, 'closed'),
          gte(schema.campaign_positions.closed_at, thirtyDaysAgo)
        ))
        .limit(50);

      if (recentPositions.length < 10) {
        return 1.0;
      }

      const wins = recentPositions.filter(p => {
        const pnl = parseFloat(p.realized_pnl || '0');
        return pnl > 0;
      }).length;

      const winRate = wins / recentPositions.length;

      if (winRate >= 0.55) {
        return Math.min(1.2, 1.0 + (winRate - 0.55) * 0.5);
      }

      if (winRate < 0.35) {
        return Math.max(0.6, 1.0 - (0.35 - winRate) * 2);
      }

      return 1.0;
    } catch (error) {
      console.error('[DynamicPositionScaler] Error calculating win rate scaling:', error);
      return 1.0;
    }
  }

  private calculateRegimeScaling(regime: 'bull' | 'bear' | 'sideways' | null | undefined): number {
    if (!regime) return 1.0;

    switch (regime) {
      case 'bull':
        return 1.1;
      case 'bear':
        return 0.7;
      case 'sideways':
        return 0.85;
      default:
        return 1.0;
    }
  }

  async getScalingHistory(campaignId: string, limit: number = 20): Promise<any[]> {
    return [];
  }
}

export const dynamicPositionScaler = DynamicPositionScaler.getInstance();
