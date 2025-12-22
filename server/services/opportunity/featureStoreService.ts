import { getRedisClient } from '../../redis';
import type { Redis } from '@upstash/redis';
import { dataIngestionService } from '../dataIngestionService';
import { volatilityRegimeEngine, VREState, VolatilityRegime } from '../trading/volatilityRegimeEngine';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';

export interface LiquidityFeatures {
  volume_24h_usd: number;
  spread_bps: number;
  depth_top10_usd: number;
  slippage_estimate_bps: number;
}

export interface MomentumFeatures {
  roc_1h: number;
  roc_24h: number;
  roc_7d: number;
  ema_trend: 'bullish' | 'bearish' | 'neutral';
  trend_strength: number;
}

export interface RiskFeatures {
  atr_14: number;
  volatility_30d: number;
  max_drawdown_7d: number;
  sharpe_estimate: number;
  correlation_btc: number;
}

export interface AssetFeatureVector {
  symbol: string;
  cluster_id: number;
  cluster_name: string;
  timestamp: Date;
  
  vre: {
    regime: VolatilityRegime;
    z_score: number;
    rv_ratio: number;
    confidence: number;
  };
  
  liquidity: LiquidityFeatures;
  momentum: MomentumFeatures;
  risk: RiskFeatures;
  
  composite_score: number;
  opportunity_eligible: boolean;
}

export interface ClusterFeatureAggregate {
  cluster_id: number;
  cluster_name: string;
  asset_count: number;
  
  avg_vre_zscore: number;
  dominant_regime: VolatilityRegime;
  regime_distribution: Record<VolatilityRegime, number>;
  
  total_volume_usd: number;
  avg_spread_bps: number;
  avg_depth_usd: number;
  
  avg_momentum: number;
  bullish_ratio: number;
  
  avg_volatility: number;
  avg_correlation_btc: number;
  
  cluster_opportunity_score: number;
}

export const SEMANTIC_CLUSTERS: Record<number, { name: string; description: string }> = {
  1: { name: 'LIQUIDITY_ULTRA', description: 'Altíssima liquidez - BTC, ETH e majors' },
  2: { name: 'VOL_MODERATE', description: 'Volatilidade moderada - Large caps estáveis' },
  3: { name: 'EXPLOSIVE', description: 'Explosividade - Movimentos bruscos potenciais' },
  4: { name: 'MOMENTUM_STRONG', description: 'Momentum forte - Tendências definidas' },
  5: { name: 'SCALPING', description: 'Reversões curtas - Ideal para scalping' },
  6: { name: 'NARRATIVE_HOT', description: 'Narrativas quentes - Hype e atenção' },
  7: { name: 'TREND_DEFINED', description: 'Tendência definida - Direção clara' },
  8: { name: 'SIDEWAYS', description: 'Sideways direcional - Range trading' },
  9: { name: 'ALTCOIN_MID', description: 'Altcoins intermediárias - Médio porte' },
  10: { name: 'HYBRID', description: 'Comportamento híbrido - Características mistas' },
};

class FeatureStoreService {
  private redis: Redis;
  private readonly CACHE_PREFIX = 'feature_store:';
  private readonly ASSET_TTL = 60;
  private readonly CLUSTER_TTL = 120;
  
  constructor() {
    this.redis = getRedisClient();
  }

  async getAssetFeatures(symbol: string): Promise<AssetFeatureVector | null> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}asset:${symbol}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached as AssetFeatureVector;
      }

      const features = await this.computeAssetFeatures(symbol);
      if (features) {
        await this.redis.setex(cacheKey, this.ASSET_TTL, JSON.stringify(features));
      }
      return features;
    } catch (error) {
      console.error(`[FeatureStore] Error getting features for ${symbol}:`, error);
      return null;
    }
  }

  async getBatchAssetFeatures(symbols: string[]): Promise<Map<string, AssetFeatureVector>> {
    const results = new Map<string, AssetFeatureVector>();
    
    const promises = symbols.map(async (symbol) => {
      const features = await this.getAssetFeatures(symbol);
      if (features) {
        results.set(symbol, features);
      }
    });
    
    await Promise.all(promises);
    return results;
  }

  async getClusterAggregate(clusterId: number): Promise<ClusterFeatureAggregate | null> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}cluster:${clusterId}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached as ClusterFeatureAggregate;
      }

      const aggregate = await this.computeClusterAggregate(clusterId);
      if (aggregate) {
        await this.redis.setex(cacheKey, this.CLUSTER_TTL, JSON.stringify(aggregate));
      }
      return aggregate;
    } catch (error) {
      console.error(`[FeatureStore] Error getting cluster ${clusterId} aggregate:`, error);
      return null;
    }
  }

  async getAllClusterAggregates(): Promise<ClusterFeatureAggregate[]> {
    const aggregates: ClusterFeatureAggregate[] = [];
    
    for (let i = 1; i <= 10; i++) {
      const agg = await this.getClusterAggregate(i);
      if (agg) {
        aggregates.push(agg);
      }
    }
    
    return aggregates.sort((a, b) => b.cluster_opportunity_score - a.cluster_opportunity_score);
  }

  async getOpportunityEligibleAssets(minScore: number = 0.6): Promise<AssetFeatureVector[]> {
    const allSymbols = await this.getAllActiveSymbols();
    const features = await this.getBatchAssetFeatures(allSymbols);
    
    return Array.from(features.values())
      .filter(f => f.opportunity_eligible && f.composite_score >= minScore)
      .sort((a, b) => b.composite_score - a.composite_score);
  }

  private async computeAssetFeatures(symbol: string): Promise<AssetFeatureVector | null> {
    try {
      const [vreState, l1Quote, l2Book, ticks, symbolInfo] = await Promise.all([
        volatilityRegimeEngine.detectRegime(symbol).catch(() => null),
        dataIngestionService.getL1Quote('kraken', symbol),
        dataIngestionService.getL2OrderBook('kraken', symbol),
        dataIngestionService.getRecentTicks('kraken', symbol, 500),
        this.getSymbolInfo(symbol),
      ]);

      if (!l1Quote || !symbolInfo) {
        return null;
      }

      const clusterId = symbolInfo.cluster_id || this.assignDefaultCluster(symbol);
      const clusterInfo = SEMANTIC_CLUSTERS[clusterId] || SEMANTIC_CLUSTERS[10];

      const liquidity = this.computeLiquidityFeatures(l1Quote, l2Book, ticks);
      const momentum = this.computeMomentumFeatures(ticks);
      const risk = this.computeRiskFeatures(ticks, vreState);

      const vre = vreState ? {
        regime: vreState.regime,
        z_score: vreState.z_score,
        rv_ratio: vreState.rv_ratio,
        confidence: vreState.confidence,
      } : {
        regime: 'NORMAL' as VolatilityRegime,
        z_score: 0,
        rv_ratio: 1,
        confidence: 0.5,
      };

      const composite_score = this.calculateCompositeScore(vre, liquidity, momentum, risk);
      const opportunity_eligible = this.checkOpportunityEligibility(vre, liquidity, risk);

      return {
        symbol,
        cluster_id: clusterId,
        cluster_name: clusterInfo.name,
        timestamp: new Date(),
        vre,
        liquidity,
        momentum,
        risk,
        composite_score,
        opportunity_eligible,
      };
    } catch (error) {
      console.error(`[FeatureStore] Error computing features for ${symbol}:`, error);
      return null;
    }
  }

  private async computeClusterAggregate(clusterId: number): Promise<ClusterFeatureAggregate | null> {
    try {
      const clusterAssets = await this.getClusterAssets(clusterId);
      if (clusterAssets.length === 0) {
        return null;
      }

      const features = await this.getBatchAssetFeatures(clusterAssets);
      const featureList = Array.from(features.values());

      if (featureList.length === 0) {
        return null;
      }

      const clusterInfo = SEMANTIC_CLUSTERS[clusterId] || SEMANTIC_CLUSTERS[10];

      const regimeDistribution: Record<VolatilityRegime, number> = {
        LOW: 0, NORMAL: 0, HIGH: 0, EXTREME: 0
      };
      featureList.forEach(f => regimeDistribution[f.vre.regime]++);

      const dominantRegime = (Object.entries(regimeDistribution) as [VolatilityRegime, number][])
        .sort((a, b) => b[1] - a[1])[0][0];

      const avgVreZscore = featureList.reduce((sum, f) => sum + f.vre.z_score, 0) / featureList.length;
      const totalVolume = featureList.reduce((sum, f) => sum + f.liquidity.volume_24h_usd, 0);
      const avgSpread = featureList.reduce((sum, f) => sum + f.liquidity.spread_bps, 0) / featureList.length;
      const avgDepth = featureList.reduce((sum, f) => sum + f.liquidity.depth_top10_usd, 0) / featureList.length;
      const avgMomentum = featureList.reduce((sum, f) => sum + f.momentum.roc_24h, 0) / featureList.length;
      const bullishCount = featureList.filter(f => f.momentum.ema_trend === 'bullish').length;
      const avgVolatility = featureList.reduce((sum, f) => sum + f.risk.volatility_30d, 0) / featureList.length;
      const avgCorrelation = featureList.reduce((sum, f) => sum + f.risk.correlation_btc, 0) / featureList.length;

      const cos = this.calculateClusterOpportunityScore({
        avgVreZscore,
        dominantRegime,
        totalVolume,
        avgSpread,
        avgMomentum,
        bullishRatio: bullishCount / featureList.length,
        avgVolatility,
      });

      return {
        cluster_id: clusterId,
        cluster_name: clusterInfo.name,
        asset_count: featureList.length,
        avg_vre_zscore: avgVreZscore,
        dominant_regime: dominantRegime,
        regime_distribution: regimeDistribution,
        total_volume_usd: totalVolume,
        avg_spread_bps: avgSpread,
        avg_depth_usd: avgDepth,
        avg_momentum: avgMomentum,
        bullish_ratio: bullishCount / featureList.length,
        avg_volatility: avgVolatility,
        avg_correlation_btc: avgCorrelation,
        cluster_opportunity_score: cos,
      };
    } catch (error) {
      console.error(`[FeatureStore] Error computing cluster ${clusterId} aggregate:`, error);
      return null;
    }
  }

  private computeLiquidityFeatures(l1: any, l2: any, ticks: any[]): LiquidityFeatures {
    const bidPrice = parseFloat(l1.bid_price || '0');
    const askPrice = parseFloat(l1.ask_price || '0');
    const midPrice = (bidPrice + askPrice) / 2;
    
    const spread_bps = midPrice > 0 ? ((askPrice - bidPrice) / midPrice) * 10000 : 9999;
    
    const volume_24h_usd = ticks.reduce((sum, t) => {
      return sum + (parseFloat(t.price || '0') * parseFloat(t.quantity || t.volume || '0'));
    }, 0);

    let depth_top10_usd = 0;
    if (l2 && l2.bids && l2.asks) {
      const bidDepth = l2.bids.slice(0, 10).reduce((sum: number, b: any) => 
        sum + (parseFloat(b.price || '0') * parseFloat(b.quantity || b.volume || '0')), 0);
      const askDepth = l2.asks.slice(0, 10).reduce((sum: number, a: any) => 
        sum + (parseFloat(a.price || '0') * parseFloat(a.quantity || a.volume || '0')), 0);
      depth_top10_usd = bidDepth + askDepth;
    }

    const slippage_estimate_bps = this.estimateSlippage(depth_top10_usd, volume_24h_usd);

    return { volume_24h_usd, spread_bps, depth_top10_usd, slippage_estimate_bps };
  }

  private computeMomentumFeatures(ticks: any[]): MomentumFeatures {
    if (ticks.length < 10) {
      return { roc_1h: 0, roc_24h: 0, roc_7d: 0, ema_trend: 'neutral', trend_strength: 0 };
    }

    const prices = ticks.map(t => parseFloat(t.price || '0')).filter(p => p > 0);
    if (prices.length < 10) {
      return { roc_1h: 0, roc_24h: 0, roc_7d: 0, ema_trend: 'neutral', trend_strength: 0 };
    }

    const currentPrice = prices[0];
    const roc_1h = prices.length > 60 ? (currentPrice - prices[60]) / prices[60] : 0;
    const roc_24h = prices.length > 288 ? (currentPrice - prices[288]) / prices[288] : 0;
    const roc_7d = prices.length > 500 ? (currentPrice - prices[prices.length - 1]) / prices[prices.length - 1] : 0;

    const ema12 = this.calculateEMA(prices, 12);
    const ema36 = this.calculateEMA(prices, 36);
    
    let ema_trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    const emaDiff = (ema12 - ema36) / ema36;
    if (emaDiff > 0.002) ema_trend = 'bullish';
    else if (emaDiff < -0.002) ema_trend = 'bearish';

    const trend_strength = Math.abs(emaDiff) * 100;

    return { roc_1h, roc_24h, roc_7d, ema_trend, trend_strength };
  }

  private computeRiskFeatures(ticks: any[], vreState: VREState | null): RiskFeatures {
    const prices = ticks.map(t => parseFloat(t.price || '0')).filter(p => p > 0);
    
    const atr_14 = this.calculateATR(prices, 14);
    const volatility_30d = vreState?.rv_short || this.calculateVolatility(prices);
    const max_drawdown_7d = this.calculateMaxDrawdown(prices);
    const sharpe_estimate = this.estimateSharpe(prices);
    const correlation_btc = 0.5;

    return { atr_14, volatility_30d, max_drawdown_7d, sharpe_estimate, correlation_btc };
  }

  private calculateCompositeScore(
    vre: { regime: VolatilityRegime; z_score: number; confidence: number },
    liquidity: LiquidityFeatures,
    momentum: MomentumFeatures,
    risk: RiskFeatures
  ): number {
    let score = 0.5;

    if (vre.regime === 'HIGH') score += 0.15;
    if (vre.regime === 'EXTREME') score += 0.10;
    if (vre.confidence > 0.7) score += 0.05;

    if (liquidity.volume_24h_usd > 100000) score += 0.10;
    if (liquidity.spread_bps < 20) score += 0.05;
    if (liquidity.depth_top10_usd > 50000) score += 0.05;

    if (momentum.ema_trend === 'bullish') score += 0.10;
    if (Math.abs(momentum.roc_24h) > 0.02) score += 0.05;
    if (momentum.trend_strength > 1) score += 0.05;

    if (risk.sharpe_estimate > 1) score += 0.05;
    if (risk.max_drawdown_7d < 0.10) score += 0.05;

    return Math.min(1, Math.max(0, score));
  }

  private checkOpportunityEligibility(
    vre: { regime: VolatilityRegime; z_score: number },
    liquidity: LiquidityFeatures,
    risk: RiskFeatures
  ): boolean {
    if (vre.regime !== 'HIGH' && vre.regime !== 'EXTREME') {
      return false;
    }

    if (liquidity.volume_24h_usd < 10000) return false;
    if (liquidity.spread_bps > 100) return false;
    if (liquidity.slippage_estimate_bps > 50) return false;

    if (risk.max_drawdown_7d > 0.30) return false;

    return true;
  }

  private calculateClusterOpportunityScore(params: {
    avgVreZscore: number;
    dominantRegime: VolatilityRegime;
    totalVolume: number;
    avgSpread: number;
    avgMomentum: number;
    bullishRatio: number;
    avgVolatility: number;
  }): number {
    let score = 0.5;

    if (params.dominantRegime === 'HIGH') score += 0.20;
    if (params.dominantRegime === 'EXTREME') score += 0.15;
    
    if (params.avgVreZscore > 0.75) score += 0.10;
    if (params.totalVolume > 1000000) score += 0.10;
    if (params.avgSpread < 30) score += 0.05;
    if (params.bullishRatio > 0.6) score += 0.10;
    if (params.avgMomentum > 0.01) score += 0.05;

    return Math.min(1, Math.max(0, score));
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[0] || 0;
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  private calculateATR(prices: number[], period: number): number {
    if (prices.length < period + 1) return 0;
    let trSum = 0;
    for (let i = 1; i <= period && i < prices.length; i++) {
      const tr = Math.abs(prices[i - 1] - prices[i]);
      trSum += tr;
    }
    return trSum / period;
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push(Math.log(prices[i] / prices[i - 1]));
      }
    }
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(365);
  }

  private calculateMaxDrawdown(prices: number[]): number {
    if (prices.length < 2) return 0;
    let peak = prices[prices.length - 1];
    let maxDD = 0;
    for (let i = prices.length - 2; i >= 0; i--) {
      if (prices[i] > peak) peak = prices[i];
      const dd = (peak - prices[i]) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }

  private estimateSharpe(prices: number[]): number {
    if (prices.length < 30) return 0;
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
    }
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length);
    if (std === 0) return 0;
    return (mean * 365) / (std * Math.sqrt(365));
  }

  private estimateSlippage(depth: number, volume: number): number {
    if (depth === 0) return 100;
    const ratio = volume / depth;
    return Math.min(100, ratio * 10);
  }

  private assignDefaultCluster(symbol: string): number {
    const upperSymbol = symbol.toUpperCase();
    if (upperSymbol.includes('BTC') || upperSymbol.includes('ETH')) return 1;
    if (upperSymbol.includes('SOL') || upperSymbol.includes('ADA') || upperSymbol.includes('DOT')) return 2;
    if (upperSymbol.includes('DOGE') || upperSymbol.includes('SHIB')) return 6;
    return 10;
  }

  private async getSymbolInfo(symbol: string): Promise<{ cluster_id: number | null } | null> {
    try {
      const result = await db.select()
        .from(schema.symbols)
        .where(eq(schema.symbols.symbol, symbol))
        .limit(1);
      
      if (result.length === 0) return null;
      return { cluster_id: (result[0] as any).cluster_id || null };
    } catch {
      return null;
    }
  }

  private async getClusterAssets(clusterId: number): Promise<string[]> {
    try {
      const results = await db.select({ symbol: schema.symbols.symbol })
        .from(schema.symbols)
        .where(eq((schema.symbols as any).cluster_id, clusterId))
        .limit(100);
      
      return results.map(r => r.symbol);
    } catch {
      return [];
    }
  }

  private async getAllActiveSymbols(): Promise<string[]> {
    try {
      const results = await db.select({ symbol: schema.symbols.symbol })
        .from(schema.symbols)
        .where(eq(schema.symbols.exchange_id, 'kraken'))
        .limit(200);
      
      return results.map(r => r.symbol);
    } catch {
      return [];
    }
  }

  async invalidateCache(symbol?: string): Promise<void> {
    if (symbol) {
      await this.redis.del(`${this.CACHE_PREFIX}asset:${symbol}`);
    } else {
      const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await Promise.all(keys.map(k => this.redis.del(k)));
      }
    }
  }

  async computePairwiseCorrelation(symbolA: string, symbolB: string): Promise<{ correlation: number; method: 'empirical' | 'fallback'; data_points: number }> {
    const CORRELATION_CACHE_KEY = `${this.CACHE_PREFIX}corr:${[symbolA, symbolB].sort().join(':')}`;
    const CORRELATION_TTL = 3600;

    try {
      const cached = await this.redis.get(CORRELATION_CACHE_KEY);
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }
    } catch {
    }

    const [returnsA, returnsB] = await Promise.all([
      this.getAssetReturns(symbolA, 168),
      this.getAssetReturns(symbolB, 168),
    ]);

    if (returnsA.length >= 24 && returnsB.length >= 24) {
      const minLen = Math.min(returnsA.length, returnsB.length);
      const rA = returnsA.slice(0, minLen);
      const rB = returnsB.slice(0, minLen);

      const meanA = rA.reduce((a, b) => a + b, 0) / minLen;
      const meanB = rB.reduce((a, b) => a + b, 0) / minLen;

      let cov = 0, varA = 0, varB = 0;
      for (let i = 0; i < minLen; i++) {
        const dA = rA[i] - meanA;
        const dB = rB[i] - meanB;
        cov += dA * dB;
        varA += dA * dA;
        varB += dB * dB;
      }

      const stdA = Math.sqrt(varA / minLen);
      const stdB = Math.sqrt(varB / minLen);

      if (stdA > 0 && stdB > 0) {
        const correlation = cov / (minLen * stdA * stdB);
        const result = { correlation: Math.max(-1, Math.min(1, correlation)), method: 'empirical' as const, data_points: minLen };
        
        try {
          await this.redis.setex(CORRELATION_CACHE_KEY, CORRELATION_TTL, JSON.stringify(result));
        } catch {}
        
        return result;
      }
    }

    const [featuresA, featuresB] = await Promise.all([
      this.getAssetFeatures(symbolA),
      this.getAssetFeatures(symbolB),
    ]);

    const btcCorrA = featuresA?.risk?.correlation_btc ?? 0.5;
    const btcCorrB = featuresB?.risk?.correlation_btc ?? 0.5;
    const fallbackCorrelation = btcCorrA * btcCorrB + (1 - btcCorrA) * (1 - btcCorrB) * 0.3;
    const fallbackResult = { correlation: fallbackCorrelation, method: 'fallback' as const, data_points: 0 };

    try {
      await this.redis.setex(CORRELATION_CACHE_KEY, CORRELATION_TTL, JSON.stringify(fallbackResult));
    } catch {}

    return fallbackResult;
  }

  private async getAssetReturns(symbol: string, hours: number): Promise<number[]> {
    try {
      const bars = await dataIngestionService.getStoredBars(symbol, hours);
      if (!bars || bars.length < 2) return [];

      const returns: number[] = [];
      for (let i = 1; i < bars.length; i++) {
        if (bars[i - 1].close > 0) {
          returns.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
        }
      }
      return returns;
    } catch {
      return [];
    }
  }

  async getCorrelationMatrix(symbols: string[]): Promise<Map<string, Map<string, number>>> {
    const matrix = new Map<string, Map<string, number>>();
    
    for (const symbolA of symbols) {
      const row = new Map<string, number>();
      row.set(symbolA, 1.0);
      matrix.set(symbolA, row);
    }

    const pairs: [string, string][] = [];
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        pairs.push([symbols[i], symbols[j]]);
      }
    }

    const batchSize = 10;
    for (let i = 0; i < pairs.length; i += batchSize) {
      const batch = pairs.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(([a, b]) => this.computePairwiseCorrelation(a, b))
      );

      for (let j = 0; j < batch.length; j++) {
        const [a, b] = batch[j];
        const corr = results[j].correlation;
        matrix.get(a)?.set(b, corr);
        matrix.get(b)?.set(a, corr);
      }
    }

    return matrix;
  }
}

export const featureStoreService = new FeatureStoreService();
