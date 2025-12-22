import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { featureStoreService, ClusterFeatureAggregate, AssetFeatureVector } from './featureStoreService';
import { semanticClusterService, CLUSTER_DEFINITIONS } from './semanticClusterService';
import { volatilityRegimeEngine, VolatilityRegime } from '../trading/volatilityRegimeEngine';
import { adaptiveParameterService } from '../trading/adaptiveParameterService';
import { getRedisClient } from '../../redis';
import type { Redis } from '@upstash/redis';

export type OpportunityWindowType = 
  | 'REGIME_TRANSITION'
  | 'CLUSTER_MOMENTUM'
  | 'VOLATILITY_EXPANSION'
  | 'LIQUIDITY_SURGE'
  | 'NARRATIVE_PEAK'
  | 'CORRELATION_BREAKDOWN';

export type OpportunityStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'EXCEPTIONAL';

export interface OpportunityWindow {
  id: string;
  type: OpportunityWindowType;
  cluster_id: number;
  cluster_name: string;
  strength: OpportunityStrength;
  score: number;
  detected_at: Date;
  expires_at: Date;
  thesis: string;
  recommended_assets: string[];
  cos_score: number;
  vre_regime: VolatilityRegime;
  risk_level: number;
  expected_duration_hours: number;
  metadata: Record<string, any>;
}

export interface ClusterOpportunityScore {
  cluster_id: number;
  cluster_name: string;
  cos_score: number;
  vre_contribution: number;
  momentum_contribution: number;
  liquidity_contribution: number;
  volatility_contribution: number;
  risk_contribution: number;
  asset_count: number;
  top_assets: string[];
  regime: VolatilityRegime;
  previous_regime?: VolatilityRegime;
  strength: OpportunityStrength;
  correlation_divergence: number;
}

const COS_CACHE_KEY = 'opportunity:cos:all';
const COS_CACHE_TTL = 120;
const WINDOWS_CACHE_KEY = 'opportunity:windows:active';
const WINDOWS_CACHE_TTL = 60;
const PREVIOUS_REGIME_CACHE_KEY = 'opportunity:prev_regimes';
const PREVIOUS_REGIME_TTL = 3600;

class OpportunityEngineService {
  private redis: Redis;
  private previousRegimes: Map<number, VolatilityRegime> = new Map();
  private previousRegimesLoaded: boolean = false;
  
  constructor() {
    this.redis = getRedisClient();
  }

  private async loadPreviousRegimes(): Promise<void> {
    if (this.previousRegimesLoaded) return;
    
    try {
      const cached = await this.redis.get(PREVIOUS_REGIME_CACHE_KEY);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        if (data && typeof data === 'object') {
          for (const [key, value] of Object.entries(data)) {
            this.previousRegimes.set(parseInt(key), value as VolatilityRegime);
          }
        }
      }
      this.previousRegimesLoaded = true;
    } catch {
      this.previousRegimesLoaded = true;
    }
  }

  private async savePreviousRegimes(): Promise<void> {
    try {
      const data: Record<number, VolatilityRegime> = {};
      this.previousRegimes.forEach((value, key) => {
        data[key] = value;
      });
      await this.redis.setex(PREVIOUS_REGIME_CACHE_KEY, PREVIOUS_REGIME_TTL, JSON.stringify(data));
    } catch {
      console.warn('[OpportunityEngine] Failed to persist previous regimes');
    }
  }
  
  async detectOpportunityWindows(): Promise<OpportunityWindow[]> {
    try {
      const cached = await this.redis.get(WINDOWS_CACHE_KEY);
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached as OpportunityWindow[];
      }

      const cosScores = await this.calculateAllCOS();
      const windows: OpportunityWindow[] = [];

      for (const cos of cosScores) {
        const clusterWindows = await this.detectWindowsForCluster(cos);
        windows.push(...clusterWindows);
      }

      windows.sort((a, b) => b.score - a.score);
      const topWindows = windows.slice(0, 20);

      try {
        await this.redis.setex(WINDOWS_CACHE_KEY, WINDOWS_CACHE_TTL, JSON.stringify(topWindows));
      } catch (cacheErr) {
        console.warn('[OpportunityEngine] Cache write failed, continuing without cache');
      }
      return topWindows;
    } catch (error) {
      console.error('[OpportunityEngine] Error detecting windows:', error);
      return [];
    }
  }

  async calculateAllCOS(): Promise<ClusterOpportunityScore[]> {
    try {
      await this.loadPreviousRegimes();
      
      let cached: string | ClusterOpportunityScore[] | null = null;
      try {
        cached = await this.redis.get(COS_CACHE_KEY);
      } catch {
        console.warn('[OpportunityEngine] Redis unavailable, computing without cache');
      }
      
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached as ClusterOpportunityScore[];
      }

      const aggregates = await featureStoreService.getAllClusterAggregates();
      const cosScores: ClusterOpportunityScore[] = [];

      for (const agg of aggregates) {
        const cos = await this.calculateCOS(agg);
        cosScores.push(cos);
      }

      await this.savePreviousRegimes();

      cosScores.sort((a, b) => b.cos_score - a.cos_score);
      
      try {
        await this.redis.setex(COS_CACHE_KEY, COS_CACHE_TTL, JSON.stringify(cosScores));
      } catch {
        console.warn('[OpportunityEngine] Cache write failed');
      }
      
      return cosScores;
    } catch (error) {
      console.error('[OpportunityEngine] Error calculating COS:', error);
      return [];
    }
  }

  async calculateClusterCOS(clusterId: number): Promise<ClusterOpportunityScore | null> {
    try {
      const aggregate = await featureStoreService.getClusterAggregate(clusterId);
      if (!aggregate) return null;

      return this.calculateCOS(aggregate);
    } catch (error) {
      console.error(`[OpportunityEngine] Error calculating COS for cluster ${clusterId}:`, error);
      return null;
    }
  }

  private async calculateCOS(aggregate: ClusterFeatureAggregate): Promise<ClusterOpportunityScore> {
    const def = CLUSTER_DEFINITIONS.find(d => d.id === aggregate.cluster_id);
    const clusterName = def?.name || aggregate.cluster_name || 'UNKNOWN';

    const liquidityScore = this.normalizeLiquidity(aggregate.total_volume_usd, aggregate.avg_spread_bps);
    const momentumScore = Math.min(1, Math.max(0, aggregate.avg_momentum));
    const volatilityScore = Math.min(1, Math.max(0, aggregate.avg_volatility));
    const correlationDivergence = this.calculateCorrelationDivergence(aggregate);
    const riskScore = Math.min(1, Math.max(0, 1 - aggregate.avg_correlation_btc));

    const vreWeight = this.getVREWeight(aggregate.dominant_regime);
    const momentumWeight = this.getMomentumWeight(momentumScore);
    const liquidityWeight = this.getLiquidityWeight(liquidityScore);
    const volatilityWeight = this.getVolatilityWeight(volatilityScore, aggregate.dominant_regime);
    const riskWeight = this.getRiskWeight(riskScore);

    const vreContribution = vreWeight * 0.25;
    const momentumContribution = momentumWeight * momentumScore * 0.25;
    const liquidityContribution = liquidityWeight * liquidityScore * 0.20;
    const volatilityContribution = volatilityWeight * volatilityScore * 0.15;
    const riskContribution = riskWeight * riskScore * 0.15;

    const cosScore = Math.min(1, Math.max(0,
      vreContribution + momentumContribution + liquidityContribution + volatilityContribution + riskContribution
    ));

    const strength = this.determineStrength(cosScore);

    const topAssets = await this.getTopAssetsFromFeatureStore(aggregate.cluster_id);

    const previousRegime = this.previousRegimes.get(aggregate.cluster_id);
    this.previousRegimes.set(aggregate.cluster_id, aggregate.dominant_regime);

    return {
      cluster_id: aggregate.cluster_id,
      cluster_name: clusterName,
      cos_score: Math.round(cosScore * 1000) / 1000,
      vre_contribution: Math.round(vreContribution * 1000) / 1000,
      momentum_contribution: Math.round(momentumContribution * 1000) / 1000,
      liquidity_contribution: Math.round(liquidityContribution * 1000) / 1000,
      volatility_contribution: Math.round(volatilityContribution * 1000) / 1000,
      risk_contribution: Math.round(riskContribution * 1000) / 1000,
      asset_count: aggregate.asset_count,
      top_assets: topAssets,
      regime: aggregate.dominant_regime,
      previous_regime: previousRegime,
      strength,
      correlation_divergence: Math.round(correlationDivergence * 1000) / 1000,
    };
  }

  private calculateCorrelationDivergence(aggregate: ClusterFeatureAggregate): number {
    const avgCorr = aggregate.avg_correlation_btc;
    const bullishRatio = aggregate.bullish_ratio;
    
    const divergence = Math.abs(0.5 - bullishRatio) * 2 * (1 - avgCorr);
    return Math.min(1, Math.max(0, divergence));
  }

  private normalizeLiquidity(totalVolume: number, avgSpread: number): number {
    const volumeScore = Math.min(1, totalVolume / 100000000);
    const spreadScore = Math.max(0, 1 - (avgSpread / 100));
    return Math.min(1, Math.max(0, volumeScore * 0.6 + spreadScore * 0.4));
  }

  private async getTopAssetsFromFeatureStore(clusterId: number): Promise<string[]> {
    try {
      const eligible = await featureStoreService.getOpportunityEligibleAssets(0.4);
      const clusterAssets = eligible.filter(a => a.cluster_id === clusterId);
      
      if (clusterAssets.length > 0) {
        clusterAssets.sort((a, b) => b.composite_score - a.composite_score);
        return clusterAssets.slice(0, 5).map(a => a.symbol);
      }
      
      const def = CLUSTER_DEFINITIONS.find(d => d.id === clusterId);
      return def?.typical_assets.slice(0, 5) || [];
    } catch {
      const def = CLUSTER_DEFINITIONS.find(d => d.id === clusterId);
      return def?.typical_assets.slice(0, 5) || [];
    }
  }

  private getVREWeight(regime: VolatilityRegime): number {
    switch (regime) {
      case 'LOW': return 0.6;
      case 'NORMAL': return 1.0;
      case 'HIGH': return 0.8;
      case 'EXTREME': return 0.3;
      default: return 0.5;
    }
  }

  private getMomentumWeight(score: number): number {
    if (score > 0.8) return 1.2;
    if (score > 0.6) return 1.0;
    if (score > 0.4) return 0.8;
    return 0.5;
  }

  private getLiquidityWeight(score: number): number {
    if (score > 0.8) return 1.1;
    if (score > 0.6) return 1.0;
    return 0.8;
  }

  private getVolatilityWeight(score: number, regime: VolatilityRegime): number {
    if (regime === 'EXTREME') return 0.3;
    if (regime === 'HIGH' && score > 0.8) return 0.6;
    if (score > 0.5 && score < 0.8) return 1.0;
    return 0.7;
  }

  private getRiskWeight(score: number): number {
    if (score < 0.3) return 1.2;
    if (score < 0.5) return 1.0;
    if (score < 0.7) return 0.8;
    return 0.5;
  }

  private determineStrength(score: number): OpportunityStrength {
    if (score >= 0.8) return 'EXCEPTIONAL';
    if (score >= 0.65) return 'STRONG';
    if (score >= 0.5) return 'MODERATE';
    return 'WEAK';
  }

  private async detectWindowsForCluster(cos: ClusterOpportunityScore): Promise<OpportunityWindow[]> {
    const windows: OpportunityWindow[] = [];
    const now = new Date();

    if (cos.cos_score >= 0.4) {
      const windowTypes = this.determineAllWindowTypes(cos);
      
      for (const windowType of windowTypes) {
        const duration = this.estimateDuration(cos, windowType);
        const riskLevel = this.calculateNormalizedRiskLevel(cos);

        windows.push({
          id: `${cos.cluster_id}-${windowType}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          type: windowType,
          cluster_id: cos.cluster_id,
          cluster_name: cos.cluster_name,
          strength: cos.strength,
          score: cos.cos_score,
          detected_at: now,
          expires_at: new Date(now.getTime() + duration * 60 * 60 * 1000),
          thesis: this.generateThesis(cos, windowType),
          recommended_assets: cos.top_assets,
          cos_score: cos.cos_score,
          vre_regime: cos.regime,
          risk_level: riskLevel,
          expected_duration_hours: duration,
          metadata: {
            contributions: {
              vre: cos.vre_contribution,
              momentum: cos.momentum_contribution,
              liquidity: cos.liquidity_contribution,
              volatility: cos.volatility_contribution,
              risk: cos.risk_contribution,
            },
            correlation_divergence: cos.correlation_divergence,
            previous_regime: cos.previous_regime,
          },
        });
      }
    }

    return windows;
  }

  private calculateNormalizedRiskLevel(cos: ClusterOpportunityScore): number {
    const volatilityRisk = cos.volatility_contribution > 0.12 ? 0.25 : 0.1;
    const regimeRisk = cos.regime === 'EXTREME' ? 0.35 : cos.regime === 'HIGH' ? 0.2 : 0.05;
    const correlationRisk = cos.correlation_divergence * 0.2;
    const inverseRiskContribution = (0.15 - cos.risk_contribution) / 0.15 * 0.2;
    
    const rawRisk = volatilityRisk + regimeRisk + correlationRisk + inverseRiskContribution;
    return Math.min(1, Math.max(0, rawRisk));
  }

  private determineAllWindowTypes(cos: ClusterOpportunityScore): OpportunityWindowType[] {
    const types: OpportunityWindowType[] = [];

    if (cos.previous_regime && cos.previous_regime !== cos.regime) {
      types.push('REGIME_TRANSITION');
    }

    if (cos.correlation_divergence > 0.4) {
      types.push('CORRELATION_BREAKDOWN');
    }

    if (cos.regime === 'HIGH' || cos.regime === 'EXTREME') {
      if (!types.includes('VOLATILITY_EXPANSION')) {
        types.push('VOLATILITY_EXPANSION');
      }
    }

    if (cos.cluster_id === 6 && cos.momentum_contribution > 0.15) {
      types.push('NARRATIVE_PEAK');
    }

    if (cos.momentum_contribution > 0.18 && !types.includes('NARRATIVE_PEAK')) {
      types.push('CLUSTER_MOMENTUM');
    }

    if (cos.liquidity_contribution > 0.15) {
      types.push('LIQUIDITY_SURGE');
    }

    if (types.length === 0 && cos.cos_score >= 0.5) {
      const contributions = [
        { type: 'CLUSTER_MOMENTUM' as OpportunityWindowType, value: cos.momentum_contribution },
        { type: 'LIQUIDITY_SURGE' as OpportunityWindowType, value: cos.liquidity_contribution },
        { type: 'VOLATILITY_EXPANSION' as OpportunityWindowType, value: cos.volatility_contribution },
      ];
      contributions.sort((a, b) => b.value - a.value);
      types.push(contributions[0].type);
    }

    return types.length > 0 ? types : [];
  }

  private estimateDuration(cos: ClusterOpportunityScore, type: OpportunityWindowType): number {
    const baseDuration: Record<OpportunityWindowType, number> = {
      REGIME_TRANSITION: 4,
      CLUSTER_MOMENTUM: 8,
      VOLATILITY_EXPANSION: 2,
      LIQUIDITY_SURGE: 6,
      NARRATIVE_PEAK: 12,
      CORRELATION_BREAKDOWN: 3,
    };

    const strengthMultiplier: Record<OpportunityStrength, number> = {
      WEAK: 0.5,
      MODERATE: 1.0,
      STRONG: 1.5,
      EXCEPTIONAL: 2.0,
    };

    return Math.round(baseDuration[type] * strengthMultiplier[cos.strength]);
  }

  private generateThesis(cos: ClusterOpportunityScore, type: OpportunityWindowType): string {
    const clusterDef = CLUSTER_DEFINITIONS.find(d => d.id === cos.cluster_id);
    const clusterDesc = clusterDef?.description || '';
    
    const theses: Record<OpportunityWindowType, string> = {
      REGIME_TRANSITION: `Regime transition detected in ${cos.cluster_name}: ${cos.previous_regime || 'unknown'} -> ${cos.regime}. VRE confirms volatility shift. Optimal window for strategy adjustment and repositioning.`,
      CLUSTER_MOMENTUM: `Strong momentum signals in ${cos.cluster_name} cluster (${clusterDesc}). Sustained directional movement across top performers. Consider trend-following entries.`,
      VOLATILITY_EXPANSION: `Volatility expansion in ${cos.cluster_name}. VRE regime: ${cos.regime}. Enhanced ATR signals create wider profit targets. Adjust stops accordingly.`,
      LIQUIDITY_SURGE: `Liquidity surge detected in ${cos.cluster_name}. Volume up, spreads tightening. Favorable conditions for larger position entry with minimal slippage.`,
      NARRATIVE_PEAK: `${cos.cluster_name} showing narrative-driven momentum. Social/market attention creating price action in hype-sensitive assets. Monitor for exhaustion signals.`,
      CORRELATION_BREAKDOWN: `Correlation breakdown in ${cos.cluster_name} (divergence: ${(cos.correlation_divergence * 100).toFixed(1)}%). Assets decoupling from BTC correlation. Alpha generation opportunity through asset selection.`,
    };

    return theses[type];
  }

  async getActiveWindowsForProfile(profile: 'C' | 'M' | 'A' | 'SA' | 'FULL'): Promise<OpportunityWindow[]> {
    const allWindows = await this.detectOpportunityWindows();
    const restrictions = adaptiveParameterService.getProfileRestrictions(profile);

    return allWindows.filter(window => {
      if (!restrictions.allowedRegimes.includes(window.vre_regime)) {
        return false;
      }
      
      const profileRiskLimits: Record<string, number> = {
        'C': 0.4,
        'M': 0.6,
        'A': 0.8,
        'SA': 0.9,
        'FULL': 1.0,
      };
      
      if (window.risk_level > profileRiskLimits[profile]) {
        return false;
      }
      return true;
    });
  }

  async getTopOpportunities(limit: number = 5): Promise<OpportunityWindow[]> {
    const windows = await this.detectOpportunityWindows();
    return windows.slice(0, limit);
  }

  async getClusterRanking(): Promise<ClusterOpportunityScore[]> {
    return this.calculateAllCOS();
  }

  async invalidateCache(): Promise<void> {
    try {
      await this.redis.del(COS_CACHE_KEY);
      await this.redis.del(WINDOWS_CACHE_KEY);
    } catch {
      console.warn('[OpportunityEngine] Cache invalidation failed');
    }
  }
}

export const opportunityEngineService = new OpportunityEngineService();
