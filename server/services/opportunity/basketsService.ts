import { getRedisClient } from '../../redis';
import type { Redis } from '@upstash/redis';
import { featureStoreService, SEMANTIC_CLUSTERS } from './featureStoreService';
import { semanticClusterService, CLUSTER_DEFINITIONS } from './semanticClusterService';
import { opportunityEngineService } from './opportunityEngineService';
import { db } from '../../db';
import { basket_audit_logs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

export interface BasketAsset {
  symbol: string;
  cluster_id: number;
  cluster_name: string;
  composite_score: number;
  momentum_trend_strength: number;
  volume_24h_usd: number;
  spread_bps: number;
  volatility_30d: number;
  correlation_btc: number;
  vre_regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  correlation_to_basket: number;
  weight: number;
}

export interface ClusterBasket {
  cluster_id: number;
  cluster_name: string;
  cluster_strategy: string;
  assets: BasketAsset[];
  avg_cos_score: number;
  avg_momentum: number;
  avg_liquidity: number;
  total_weight: number;
}

export interface ClusterDeficit {
  cluster_id: number;
  target: number;
  actual: number;
  deficit: number;
  reason: string;
}

export interface PairwiseCorrelation {
  asset_a: string;
  asset_b: string;
  correlation: number;
  method: 'empirical' | 'fallback';
  data_points: number;
  btc_correlation_a: number;
  btc_correlation_b: number;
}

export interface CorrelationExclusionEvent {
  symbol: string;
  conflict_with: string;
  computed_correlation: number;
  correlation_method: 'empirical' | 'fallback';
  data_points: number;
  tier_attempted: number;
  btc_correlation_a: number;
  btc_correlation_b: number;
}

export interface CorrelationMatrixEntry {
  pair: string;
  correlation: number;
  method: 'empirical' | 'fallback';
  data_points: number;
}

export interface CorrelationAudit {
  avg_btc_correlation: number;
  min_btc_correlation: number;
  max_btc_correlation: number;
  avg_intra_cluster_correlation: number;
  pairwise_correlations: PairwiseCorrelation[];
  exclusion_events: CorrelationExclusionEvent[];
  correlation_method: 'empirical' | 'fallback' | 'mixed';
  empirical_coverage_pct: number;
  correlation_matrix_snapshot: CorrelationMatrixEntry[];
  snapshot_timestamp: string;
}

export interface Basket10x10 {
  id: string;
  created_at: Date;
  expires_at: Date;
  total_assets: number;
  cluster_baskets: ClusterBasket[];
  total_cos_score: number;
  avg_correlation: number;
  diversification_score: number;
  max_correlation_threshold: number;
  is_complete: boolean;
  metadata: {
    generation_time_ms: number;
    clusters_used: number;
    assets_excluded_by_correlation: number;
    cluster_deficits: ClusterDeficit[];
    correlation_audit: CorrelationAudit;
  };
}

const BASKET_CACHE_KEY = 'basket:10x10:current';
const BASKET_CACHE_TTL = 300;
const MAX_ASSETS_PER_CLUSTER = 10;
const TOTAL_CLUSTERS = 10;
const MAX_CORRELATION_THRESHOLD = 0.75;
const MIN_FEATURE_SCORE = 0.3;

const FALLBACK_ASSET_POOL: Record<number, string[]> = {
  1: ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'ADAUSD', 'AVAXUSD', 'DOTUSD', 'MATICUSD', 'LINKUSD', 'UNIUSD'],
  2: ['SOLUSD', 'ADAUSD', 'DOTUSD', 'AVAXUSD', 'ATOMUSD', 'NEARUSD', 'ICPUSD', 'FILUSD', 'APTUSD', 'ARBUSD'],
  3: ['PEPEUSD', 'FLOKIUSD', 'BONKUSD', 'WIFUSD', 'NOTCUSD', 'MEWUSD', 'TURBUSD', 'GIGAUSD', 'BRETTUSD', 'PONKEUSD'],
  4: ['LINKUSD', 'UNIUSD', 'AAVEUSD', 'MKRUSD', 'SNXUSD', 'COMPUSD', 'CRVUSD', 'YEARN', 'SUSHIUSD', 'ONEINCH'],
  5: ['LTCUSD', 'BCHUSD', 'ETCUSD', 'ZECUSD', 'DASHUSD', 'XMRUSD', 'KAVAUSD', 'QTUMUSD', 'DCRUSD', 'SCUSD'],
  6: ['DOGEUSD', 'SHIBUSD', 'WIFUSD', 'MOOGUSD', 'CATOUSD', 'SPXUSD', 'TREEPUSD', 'POPEUSD', 'HAMUSD', 'NEIRUSD'],
  7: ['XRPUSD', 'ATOMUSD', 'NEARUSD', 'ALGOUSD', 'XLMUSD', 'XTZUSD', 'EGLDUSD', 'ROSEUSD', 'FLOWUSD', 'IOTAUSD'],
  8: ['XLMUSD', 'ALGOUSD', 'VETUSD', 'ENJUSD', 'ANKRUSD', 'STORJUSD', 'OXTUSD', 'CTSIUSD', 'RLCUSD', 'NKNUSD'],
  9: ['GRTUSD', 'FILUSD', 'SANDUSD', 'MANAUSD', 'GALAUSD', 'AXSUSD', 'ENJUSD', 'IMXUSD', 'RONUSD', 'APEUSD'],
  10: ['FETUSD', 'RNDRUSD', 'OCEANUSD', 'AGIXUSD', 'ARKMUSD', 'TAOUSD', 'WLDUSD', 'AKTUSD', 'PHAUSD', 'NMRUSD'],
};

class BasketsService {
  private redis: Redis;

  constructor() {
    this.redis = getRedisClient();
  }

  async generateBasket10x10(forceRefresh: boolean = false): Promise<Basket10x10> {
    const startTime = Date.now();

    if (!forceRefresh) {
      try {
        const cached = await this.redis.get(BASKET_CACHE_KEY);
        if (cached) {
          return typeof cached === 'string' ? JSON.parse(cached) : cached as Basket10x10;
        }
      } catch {
        console.warn('[BasketsService] Cache read failed');
      }
    }

    const clusterBaskets: ClusterBasket[] = [];
    let totalAssetsExcluded = 0;
    const allExclusionEvents: CorrelationExclusionEvent[] = [];

    const cosScores = await opportunityEngineService.calculateAllCOS();
    const cosMap = new Map(cosScores.map(c => [c.cluster_id, c]));

    for (let clusterId = 1; clusterId <= TOTAL_CLUSTERS; clusterId++) {
      const clusterDef = SEMANTIC_CLUSTERS[clusterId];
      const clusterCOS = cosMap.get(clusterId);

      const eligibleAssets = await this.getEligibleAssetsForCluster(clusterId);

      const sortedAssets = eligibleAssets.sort((a, b) => {
        const scoreA = this.calculateAssetScore(a, clusterCOS);
        const scoreB = this.calculateAssetScore(b, clusterCOS);
        return scoreB - scoreA;
      });

      const candidateSymbols = sortedAssets.map(a => a.symbol);
      const correlationMatrix = await this.precomputeCorrelationMatrix(candidateSymbols);

      const { selected, excluded, correlation_overrides, exclusion_events } = await this.selectWithCorrelationControlAsync(
        sortedAssets,
        MAX_ASSETS_PER_CLUSTER,
        correlationMatrix
      );

      totalAssetsExcluded += excluded;
      allExclusionEvents.push(...exclusion_events);
      if (correlation_overrides.length > 0) {
        console.log(`[BasketsService] Cluster ${clusterId}: ${correlation_overrides.length} correlation overrides applied`);
      }

      const weights = this.calculateWeights(selected);
      const basketAssets: BasketAsset[] = selected.map((asset, idx) => ({
        ...asset,
        weight: weights[idx],
      }));

      const avgCos = basketAssets.length > 0
        ? basketAssets.reduce((sum, a) => sum + a.composite_score, 0) / basketAssets.length
        : 0;
      const avgMomentum = basketAssets.length > 0
        ? basketAssets.reduce((sum, a) => sum + a.momentum_trend_strength, 0) / basketAssets.length
        : 0;
      const avgLiquidity = basketAssets.length > 0
        ? basketAssets.reduce((sum, a) => sum + a.volume_24h_usd, 0) / basketAssets.length
        : 0;

      const clusterDefFull = CLUSTER_DEFINITIONS.find(c => c.id === clusterId);
      clusterBaskets.push({
        cluster_id: clusterId,
        cluster_name: clusterDef?.name || `Cluster ${clusterId}`,
        cluster_strategy: clusterDefFull?.description || 'N/A',
        assets: basketAssets,
        avg_cos_score: avgCos,
        avg_momentum: avgMomentum,
        avg_liquidity: avgLiquidity,
        total_weight: weights.reduce((a, b) => a + b, 0),
      });
    }

    const allAssets = clusterBaskets.flatMap(cb => cb.assets);
    const totalCOS = clusterBaskets.reduce((sum, cb) => sum + cb.avg_cos_score, 0) / clusterBaskets.length;
    const avgCorrelation = this.calculateAverageCorrelation(allAssets);
    const diversificationScore = this.calculateDiversificationScore(clusterBaskets);

    const clusterDeficits: ClusterDeficit[] = clusterBaskets
      .filter(cb => cb.assets.length < MAX_ASSETS_PER_CLUSTER)
      .map(cb => ({
        cluster_id: cb.cluster_id,
        target: MAX_ASSETS_PER_CLUSTER,
        actual: cb.assets.length,
        deficit: MAX_ASSETS_PER_CLUSTER - cb.assets.length,
        reason: cb.assets.length === 0 
          ? 'No eligible assets found' 
          : `Insufficient eligible assets (found ${cb.assets.length})`,
      }));

    const correlationAudit = await this.computeCorrelationAudit(allAssets, allExclusionEvents);
    const isComplete = allAssets.length === TOTAL_CLUSTERS * MAX_ASSETS_PER_CLUSTER && clusterDeficits.length === 0;

    const now = new Date();
    const basket: Basket10x10 = {
      id: `basket-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      created_at: now,
      expires_at: new Date(now.getTime() + BASKET_CACHE_TTL * 1000),
      total_assets: allAssets.length,
      cluster_baskets: clusterBaskets,
      total_cos_score: totalCOS,
      avg_correlation: avgCorrelation,
      diversification_score: diversificationScore,
      max_correlation_threshold: MAX_CORRELATION_THRESHOLD,
      is_complete: isComplete,
      metadata: {
        generation_time_ms: Date.now() - startTime,
        clusters_used: clusterBaskets.filter(cb => cb.assets.length > 0).length,
        assets_excluded_by_correlation: totalAssetsExcluded,
        cluster_deficits: clusterDeficits,
        correlation_audit: correlationAudit,
      },
    };

    // CRITICAL: Persist durable audit trail BEFORE ephemeral cache
    await this.persistAuditTrail(basket);

    if (isComplete) {
      try {
        await this.redis.setex(BASKET_CACHE_KEY, BASKET_CACHE_TTL, JSON.stringify(basket));
      } catch {
        console.warn('[BasketsService] Cache write failed');
      }
    } else {
      console.warn(`[BasketsService] Basket incomplete (${allAssets.length}/100 assets), not caching`);
    }

    console.log(`[BasketsService] Generated Basket 10x10: ${basket.total_assets} assets, diversification: ${diversificationScore.toFixed(2)}`);
    return basket;
  }

  /**
   * Persist basket audit trail to durable PostgreSQL storage.
   * This ensures audit data survives Redis cache eviction.
   */
  private async persistAuditTrail(basket: Basket10x10): Promise<void> {
    try {
      const { correlation_audit, cluster_deficits } = basket.metadata;
      
      // Compute integrity hash for tamper detection
      const auditPayload = JSON.stringify({
        basket_id: basket.id,
        generated_at: basket.created_at,
        correlation_matrix_snapshot: correlation_audit.correlation_matrix_snapshot,
        pairwise_correlations: correlation_audit.pairwise_correlations,
        exclusion_events: correlation_audit.exclusion_events,
        cluster_baskets: basket.cluster_baskets,
      });
      const auditHash = createHash('sha256').update(auditPayload).digest('hex');
      
      // Upsert to prevent duplicates on retry
      await db.insert(basket_audit_logs).values({
        basket_id: basket.id,
        generated_at: basket.created_at,
        expires_at: basket.expires_at,
        generation_time_ms: basket.metadata.generation_time_ms,
        total_assets: basket.total_assets,
        clusters_used: basket.metadata.clusters_used,
        is_complete: basket.is_complete,
        correlation_method: correlation_audit.correlation_method,
        empirical_coverage_pct: correlation_audit.empirical_coverage_pct,
        avg_btc_correlation: correlation_audit.avg_btc_correlation.toFixed(6),
        avg_intra_cluster_correlation: correlation_audit.avg_intra_cluster_correlation.toFixed(6),
        assets_excluded_by_correlation: basket.metadata.assets_excluded_by_correlation,
        correlation_matrix_snapshot: correlation_audit.correlation_matrix_snapshot,
        pairwise_correlations: correlation_audit.pairwise_correlations,
        exclusion_events: correlation_audit.exclusion_events,
        cluster_baskets: basket.cluster_baskets,
        cluster_deficits: cluster_deficits,
        audit_hash: auditHash,
      }).onConflictDoNothing();
      
      console.log(`[BasketsService] Audit trail persisted for basket ${basket.id} (hash: ${auditHash.slice(0, 12)}...)`);
    } catch (error) {
      console.error('[BasketsService] Failed to persist audit trail:', error);
      // Don't throw - audit persistence failure should not block basket generation
    }
  }

  async getClusterBasket(clusterId: number): Promise<ClusterBasket | null> {
    const basket = await this.generateBasket10x10();
    return basket.cluster_baskets.find(cb => cb.cluster_id === clusterId) || null;
  }

  async getBasketAssets(): Promise<BasketAsset[]> {
    const basket = await this.generateBasket10x10();
    return basket.cluster_baskets.flatMap(cb => cb.assets);
  }

  async getBasketSummary(): Promise<{
    total_assets: number;
    clusters_with_assets: number;
    avg_cos_score: number;
    diversification_score: number;
    top_clusters: { cluster_id: number; cluster_name: string; asset_count: number; avg_score: number }[];
  }> {
    const basket = await this.generateBasket10x10();

    const topClusters = basket.cluster_baskets
      .filter(cb => cb.assets.length > 0)
      .sort((a, b) => b.avg_cos_score - a.avg_cos_score)
      .slice(0, 5)
      .map(cb => ({
        cluster_id: cb.cluster_id,
        cluster_name: cb.cluster_name,
        asset_count: cb.assets.length,
        avg_score: cb.avg_cos_score,
      }));

    return {
      total_assets: basket.total_assets,
      clusters_with_assets: basket.cluster_baskets.filter(cb => cb.assets.length > 0).length,
      avg_cos_score: basket.total_cos_score,
      diversification_score: basket.diversification_score,
      top_clusters: topClusters,
    };
  }

  async refreshBasket(): Promise<Basket10x10> {
    return this.generateBasket10x10(true);
  }

  /**
   * Retrieve persisted audit trail from database by basket ID.
   * Returns complete audit data that survives Redis cache eviction.
   */
  async getPersistedAuditTrail(basketId: string): Promise<typeof basket_audit_logs.$inferSelect | null> {
    try {
      const [auditLog] = await db.select()
        .from(basket_audit_logs)
        .where(eq(basket_audit_logs.basket_id, basketId))
        .limit(1);
      
      return auditLog || null;
    } catch (error) {
      console.error('[BasketsService] Failed to retrieve audit trail:', error);
      return null;
    }
  }

  /**
   * List recent basket audit logs with optional limit.
   */
  async listAuditLogs(limit: number = 20): Promise<typeof basket_audit_logs.$inferSelect[]> {
    try {
      return await db.select()
        .from(basket_audit_logs)
        .orderBy(basket_audit_logs.generated_at)
        .limit(limit);
    } catch (error) {
      console.error('[BasketsService] Failed to list audit logs:', error);
      return [];
    }
  }

  private async getEligibleAssetsForCluster(clusterId: number): Promise<Omit<BasketAsset, 'weight'>[]> {
    const assets: Omit<BasketAsset, 'weight'>[] = [];
    const addedSymbols = new Set<string>();
    const CANDIDATE_POOL_SIZE = MAX_ASSETS_PER_CLUSTER * 3;

    const addAsset = (asset: Omit<BasketAsset, 'weight'>) => {
      if (!addedSymbols.has(asset.symbol)) {
        assets.push(asset);
        addedSymbols.add(asset.symbol);
      }
    };

    try {
      const clusterDef = CLUSTER_DEFINITIONS.find(c => c.id === clusterId);
      const semanticDef = SEMANTIC_CLUSTERS[clusterId];
      if (!clusterDef) return assets;

      const clusterName = semanticDef?.name || clusterDef.name;

      for (const symbol of clusterDef.typical_assets) {
        const feature = await featureStoreService.getAssetFeatures(symbol);
        if (!feature) continue;
        if (feature.composite_score < MIN_FEATURE_SCORE) continue;
        addAsset(this.mapFeatureToBasketAsset(feature, clusterId, clusterName));
      }

      const eligibleAssets = await featureStoreService.getOpportunityEligibleAssets(MIN_FEATURE_SCORE);
      for (const feature of eligibleAssets) {
        if (assets.length >= CANDIDATE_POOL_SIZE) break;
        if (addedSymbols.has(feature.symbol)) continue;
        const classification = await semanticClusterService.classifyAsset(feature.symbol);
        if (classification.clusterId !== clusterId) continue;
        addAsset(this.mapFeatureToBasketAsset(feature, clusterId, clusterName));
      }

      if (assets.length < CANDIDATE_POOL_SIZE) {
        const allEligible = await featureStoreService.getOpportunityEligibleAssets(MIN_FEATURE_SCORE * 0.5);
        for (const feature of allEligible) {
          if (assets.length >= CANDIDATE_POOL_SIZE) break;
          if (addedSymbols.has(feature.symbol)) continue;
          if (feature.cluster_id === clusterId) {
            addAsset(this.mapFeatureToBasketAsset(feature, clusterId, clusterName));
          }
        }
      }

      const fallbackPool = FALLBACK_ASSET_POOL[clusterId] || [];
      for (const symbol of fallbackPool) {
        if (addedSymbols.has(symbol)) continue;
        const feature = await featureStoreService.getAssetFeatures(symbol);
        if (feature) {
          addAsset(this.mapFeatureToBasketAsset(feature, clusterId, clusterName));
        } else {
          addAsset(this.createFallbackAsset(symbol, clusterId, clusterName));
        }
      }
    } catch (error) {
      console.warn(`[BasketsService] Error getting eligible assets for cluster ${clusterId}:`, error);
    }

    return assets;
  }

  private createFallbackAsset(symbol: string, clusterId: number, clusterName: string): Omit<BasketAsset, 'weight'> {
    return {
      symbol,
      cluster_id: clusterId,
      cluster_name: clusterName,
      composite_score: MIN_FEATURE_SCORE * 0.8,
      momentum_trend_strength: 0,
      volume_24h_usd: 0,
      spread_bps: 100,
      volatility_30d: 0.5,
      correlation_btc: 0.5,
      vre_regime: 'NORMAL',
      correlation_to_basket: 0,
    };
  }

  private mapFeatureToBasketAsset(
    feature: { 
      symbol: string; 
      composite_score: number; 
      momentum?: { roc_1h: number; trend_strength: number }; 
      liquidity?: { volume_24h_usd: number; spread_bps: number }; 
      risk?: { volatility_30d: number; correlation_btc: number };
      vre?: { regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' };
    },
    clusterId: number,
    clusterName: string
  ): Omit<BasketAsset, 'weight'> {
    return {
      symbol: feature.symbol,
      cluster_id: clusterId,
      cluster_name: clusterName,
      composite_score: feature.composite_score,
      momentum_trend_strength: feature.momentum?.trend_strength ?? 0,
      volume_24h_usd: feature.liquidity?.volume_24h_usd ?? 0,
      spread_bps: feature.liquidity?.spread_bps ?? 0,
      volatility_30d: feature.risk?.volatility_30d ?? 0,
      correlation_btc: feature.risk?.correlation_btc ?? 0.5,
      vre_regime: feature.vre?.regime || 'NORMAL',
      correlation_to_basket: 0,
    };
  }

  private calculateAssetScore(
    asset: Omit<BasketAsset, 'weight'>,
    clusterCOS: { cos_score: number; momentum_contribution: number } | undefined
  ): number {
    const baseScore = asset.composite_score;
    const momentumBonus = asset.momentum_trend_strength > 0.3 ? 0.1 : 0;
    const liquidityBonus = asset.volume_24h_usd > 1000000 ? 0.05 : 0;
    const spreadPenalty = asset.spread_bps > 50 ? -0.05 : 0;
    const cosBonus = clusterCOS ? clusterCOS.cos_score * 0.15 : 0;

    return baseScore + momentumBonus + liquidityBonus + spreadPenalty + cosBonus;
  }

  private async precomputeCorrelationMatrix(symbols: string[]): Promise<Map<string, Map<string, { correlation: number; method: 'empirical' | 'fallback'; data_points: number }>>> {
    const matrix = new Map<string, Map<string, { correlation: number; method: 'empirical' | 'fallback'; data_points: number }>>();
    
    for (const s of symbols) {
      const row = new Map<string, { correlation: number; method: 'empirical' | 'fallback'; data_points: number }>();
      row.set(s, { correlation: 1.0, method: 'empirical', data_points: 168 });
      matrix.set(s, row);
    }

    const pairs: [string, string][] = [];
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        pairs.push([symbols[i], symbols[j]]);
      }
    }

    const batchSize = 20;
    for (let i = 0; i < pairs.length; i += batchSize) {
      const batch = pairs.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(([a, b]) => featureStoreService.computePairwiseCorrelation(a, b))
      );

      for (let j = 0; j < batch.length; j++) {
        const [a, b] = batch[j];
        const result = results[j];
        matrix.get(a)?.set(b, result);
        matrix.get(b)?.set(a, result);
      }
    }

    return matrix;
  }

  private getCorrelationFromMatrix(
    matrix: Map<string, Map<string, { correlation: number; method: 'empirical' | 'fallback'; data_points: number }>>,
    symbolA: string,
    symbolB: string
  ): { correlation: number; method: 'empirical' | 'fallback'; data_points: number } {
    const row = matrix.get(symbolA);
    if (row) {
      const entry = row.get(symbolB);
      if (entry) return entry;
    }
    return { correlation: 0.5, method: 'fallback', data_points: 0 };
  }

  private async selectWithCorrelationControlAsync(
    candidates: Omit<BasketAsset, 'weight'>[],
    targetAssets: number,
    correlationMatrix: Map<string, Map<string, { correlation: number; method: 'empirical' | 'fallback'; data_points: number }>>
  ): Promise<{ 
    selected: Omit<BasketAsset, 'weight'>[]; 
    excluded: number; 
    correlation_overrides: { symbol: string; max_correlation: number; threshold_used: number }[];
    exclusion_events: CorrelationExclusionEvent[];
  }> {
    const selected: Omit<BasketAsset, 'weight'>[] = [];
    const skipped: { asset: Omit<BasketAsset, 'weight'>; maxCorr: number; maxCorrData: { method: 'empirical' | 'fallback'; data_points: number }; conflictWith: Omit<BasketAsset, 'weight'> | null }[] = [];
    const correlation_overrides: { symbol: string; max_correlation: number; threshold_used: number }[] = [];
    const exclusion_events: CorrelationExclusionEvent[] = [];

    const CORRELATION_TIERS = [
      MAX_CORRELATION_THRESHOLD,
      MAX_CORRELATION_THRESHOLD + 0.10,
      MAX_CORRELATION_THRESHOLD + 0.20,
      1.0
    ];

    for (const candidate of candidates) {
      if (selected.length >= targetAssets) break;

      let maxCorrelation = 0;
      let maxCorrData: { method: 'empirical' | 'fallback'; data_points: number } = { method: 'fallback', data_points: 0 };
      let conflictAsset: Omit<BasketAsset, 'weight'> | null = null;
      
      for (const s of selected) {
        const corrData = this.getCorrelationFromMatrix(correlationMatrix, candidate.symbol, s.symbol);
        if (corrData.correlation > maxCorrelation) {
          maxCorrelation = corrData.correlation;
          maxCorrData = { method: corrData.method, data_points: corrData.data_points };
          conflictAsset = s;
        }
      }

      if (maxCorrelation <= MAX_CORRELATION_THRESHOLD) {
        let avgCorrelation = 0;
        if (selected.length > 0) {
          avgCorrelation = selected.reduce((sum, s) => {
            return sum + this.getCorrelationFromMatrix(correlationMatrix, candidate.symbol, s.symbol).correlation;
          }, 0) / selected.length;
        }
        selected.push({
          ...candidate,
          correlation_to_basket: avgCorrelation,
        });
      } else {
        skipped.push({ asset: candidate, maxCorr: maxCorrelation, maxCorrData, conflictWith: conflictAsset });
        if (conflictAsset) {
          exclusion_events.push({
            symbol: candidate.symbol,
            conflict_with: conflictAsset.symbol,
            computed_correlation: maxCorrelation,
            correlation_method: maxCorrData.method,
            data_points: maxCorrData.data_points,
            tier_attempted: 0,
            btc_correlation_a: candidate.correlation_btc,
            btc_correlation_b: conflictAsset.correlation_btc,
          });
        }
      }
    }

    if (selected.length < targetAssets && skipped.length > 0) {
      const sortedSkipped = skipped.sort((a, b) => a.maxCorr - b.maxCorr);

      for (let tierIdx = 1; tierIdx < CORRELATION_TIERS.length && selected.length < targetAssets; tierIdx++) {
        const tierThreshold = CORRELATION_TIERS[tierIdx];
        
        for (const { asset } of sortedSkipped) {
          if (selected.length >= targetAssets) break;
          if (selected.some(s => s.symbol === asset.symbol)) continue;
          
          let currentMaxCorr = 0;
          let currentCorrData: { method: 'empirical' | 'fallback'; data_points: number } = { method: 'fallback', data_points: 0 };
          let currentConflict: Omit<BasketAsset, 'weight'> | null = null;
          
          for (const s of selected) {
            const corrData = this.getCorrelationFromMatrix(correlationMatrix, asset.symbol, s.symbol);
            if (corrData.correlation > currentMaxCorr) {
              currentMaxCorr = corrData.correlation;
              currentCorrData = { method: corrData.method, data_points: corrData.data_points };
              currentConflict = s;
            }
          }
          
          if (currentMaxCorr <= tierThreshold) {
            let avgCorrelation = 0;
            if (selected.length > 0) {
              avgCorrelation = selected.reduce((sum, s) => {
                return sum + this.getCorrelationFromMatrix(correlationMatrix, asset.symbol, s.symbol).correlation;
              }, 0) / selected.length;
            }
            selected.push({
              ...asset,
              correlation_to_basket: avgCorrelation,
            });
            
            if (tierThreshold > MAX_CORRELATION_THRESHOLD) {
              correlation_overrides.push({
                symbol: asset.symbol,
                max_correlation: currentMaxCorr,
                threshold_used: tierThreshold,
              });
            }
          } else if (currentConflict) {
            exclusion_events.push({
              symbol: asset.symbol,
              conflict_with: currentConflict.symbol,
              computed_correlation: currentMaxCorr,
              correlation_method: currentCorrData.method,
              data_points: currentCorrData.data_points,
              tier_attempted: tierIdx,
              btc_correlation_a: asset.correlation_btc,
              btc_correlation_b: currentConflict.correlation_btc,
            });
          }
        }
      }
    }

    const selectedSymbols = new Set(selected.map(s => s.symbol));
    const finalExcluded = skipped.filter(s => !selectedSymbols.has(s.asset.symbol)).length;

    return { selected, excluded: finalExcluded, correlation_overrides, exclusion_events };
  }

  private calculateWeights(assets: Omit<BasketAsset, 'weight'>[]): number[] {
    if (assets.length === 0) return [];

    const totalScore = assets.reduce((sum, a) => sum + a.composite_score, 0);
    if (totalScore === 0) return assets.map(() => 1 / assets.length);

    return assets.map(a => a.composite_score / totalScore);
  }

  private calculateAverageCorrelation(assets: BasketAsset[]): number {
    if (assets.length === 0) return 0;
    const total = assets.reduce((sum, a) => sum + a.correlation_to_basket, 0);
    return total / assets.length;
  }

  private calculateDiversificationScore(clusterBaskets: ClusterBasket[]): number {
    const clustersWithAssets = clusterBaskets.filter(cb => cb.assets.length > 0).length;
    const clusterCoverage = clustersWithAssets / TOTAL_CLUSTERS;

    const assetCounts = clusterBaskets.map(cb => cb.assets.length);
    const avgAssets = assetCounts.reduce((a, b) => a + b, 0) / TOTAL_CLUSTERS;
    const variance = assetCounts.reduce((sum, count) => sum + Math.pow(count - avgAssets, 2), 0) / TOTAL_CLUSTERS;
    const balanceScore = 1 - Math.min(1, Math.sqrt(variance) / MAX_ASSETS_PER_CLUSTER);

    return clusterCoverage * 0.5 + balanceScore * 0.5;
  }

  private async computeCorrelationAudit(
    assets: BasketAsset[], 
    exclusion_events: CorrelationExclusionEvent[]
  ): Promise<CorrelationAudit> {
    const pairwise_correlations: PairwiseCorrelation[] = [];

    if (assets.length === 0) {
      return {
        avg_btc_correlation: 0,
        min_btc_correlation: 0,
        max_btc_correlation: 0,
        avg_intra_cluster_correlation: 0,
        pairwise_correlations: [],
        exclusion_events: [],
        correlation_method: 'empirical',
        empirical_coverage_pct: 100,
        correlation_matrix_snapshot: [],
        snapshot_timestamp: new Date().toISOString(),
      };
    }

    const btcCorrelations = assets.map(a => a.correlation_btc);
    const avg_btc_correlation = btcCorrelations.reduce((a, b) => a + b, 0) / btcCorrelations.length;
    const min_btc_correlation = Math.min(...btcCorrelations);
    const max_btc_correlation = Math.max(...btcCorrelations);
    const avg_intra_cluster_correlation = assets.reduce((sum, a) => sum + a.correlation_to_basket, 0) / assets.length;

    const auditSymbols = assets.map(a => a.symbol);
    const auditMatrix = await this.precomputeCorrelationMatrix(auditSymbols);

    for (let i = 0; i < assets.length; i++) {
      for (let j = i + 1; j < assets.length; j++) {
        const corrData = this.getCorrelationFromMatrix(auditMatrix, assets[i].symbol, assets[j].symbol);
        pairwise_correlations.push({
          asset_a: assets[i].symbol,
          asset_b: assets[j].symbol,
          correlation: corrData.correlation,
          method: corrData.method,
          data_points: corrData.data_points,
          btc_correlation_a: assets[i].correlation_btc,
          btc_correlation_b: assets[j].correlation_btc,
        });
      }
    }

    const empiricalCount = pairwise_correlations.filter(p => p.method === 'empirical').length;
    const exclusionEmpiricalCount = exclusion_events.filter(e => e.correlation_method === 'empirical').length;
    const totalPairwise = pairwise_correlations.length;
    const totalExclusions = exclusion_events.length;
    const totalCorrelations = totalPairwise + totalExclusions;
    const totalEmpirical = empiricalCount + exclusionEmpiricalCount;
    
    const empiricalCoveragePct = totalCorrelations > 0 
      ? Math.round((totalEmpirical / totalCorrelations) * 100) 
      : 100;

    let dominantMethod: 'empirical' | 'fallback' | 'mixed';
    if (empiricalCoveragePct >= 90) {
      dominantMethod = 'empirical';
    } else if (empiricalCoveragePct <= 10) {
      dominantMethod = 'fallback';
    } else {
      dominantMethod = 'mixed';
    }

    const correlation_matrix_snapshot: CorrelationMatrixEntry[] = [];
    for (const [symbolA, row] of auditMatrix) {
      for (const [symbolB, data] of row) {
        if (symbolA < symbolB) {
          correlation_matrix_snapshot.push({
            pair: `${symbolA}:${symbolB}`,
            correlation: data.correlation,
            method: data.method,
            data_points: data.data_points,
          });
        }
      }
    }

    return {
      avg_btc_correlation,
      min_btc_correlation,
      max_btc_correlation,
      avg_intra_cluster_correlation,
      pairwise_correlations,
      exclusion_events,
      correlation_method: dominantMethod,
      empirical_coverage_pct: empiricalCoveragePct,
      correlation_matrix_snapshot,
      snapshot_timestamp: new Date().toISOString(),
    };
  }
}

export const basketsService = new BasketsService();
