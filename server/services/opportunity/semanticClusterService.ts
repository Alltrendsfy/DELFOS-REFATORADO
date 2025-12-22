import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { dataIngestionService } from '../dataIngestionService';
import { volatilityRegimeEngine, VolatilityRegime } from '../trading/volatilityRegimeEngine';

export interface ClusterCharacteristics {
  volume_weight: number;
  volatility_weight: number;
  momentum_weight: number;
  spread_weight: number;
  correlation_weight: number;
}

export interface ClusterDefinition {
  id: number;
  name: string;
  description: string;
  characteristics: ClusterCharacteristics;
  typical_assets: string[];
}

export const CLUSTER_DEFINITIONS: ClusterDefinition[] = [
  {
    id: 1,
    name: 'LIQUIDITY_ULTRA',
    description: 'Altíssima liquidez - BTC, ETH e majors',
    characteristics: { volume_weight: 1.0, volatility_weight: 0.3, momentum_weight: 0.4, spread_weight: 0.2, correlation_weight: 0.8 },
    typical_assets: ['BTC/USD', 'ETH/USD', 'USDT/USD', 'USDC/USD'],
  },
  {
    id: 2,
    name: 'VOL_MODERATE',
    description: 'Volatilidade moderada - Large caps estáveis',
    characteristics: { volume_weight: 0.7, volatility_weight: 0.5, momentum_weight: 0.5, spread_weight: 0.3, correlation_weight: 0.6 },
    typical_assets: ['SOL/USD', 'ADA/USD', 'DOT/USD', 'AVAX/USD', 'MATIC/USD'],
  },
  {
    id: 3,
    name: 'EXPLOSIVE',
    description: 'Explosividade - Movimentos bruscos potenciais',
    characteristics: { volume_weight: 0.5, volatility_weight: 1.0, momentum_weight: 0.8, spread_weight: 0.4, correlation_weight: 0.3 },
    typical_assets: ['PEPE/USD', 'FLOKI/USD', 'BONK/USD'],
  },
  {
    id: 4,
    name: 'MOMENTUM_STRONG',
    description: 'Momentum forte - Tendências definidas',
    characteristics: { volume_weight: 0.6, volatility_weight: 0.6, momentum_weight: 1.0, spread_weight: 0.4, correlation_weight: 0.5 },
    typical_assets: ['LINK/USD', 'UNI/USD', 'AAVE/USD', 'SNX/USD'],
  },
  {
    id: 5,
    name: 'SCALPING',
    description: 'Reversões curtas - Ideal para scalping',
    characteristics: { volume_weight: 0.8, volatility_weight: 0.7, momentum_weight: 0.3, spread_weight: 0.9, correlation_weight: 0.4 },
    typical_assets: ['LTC/USD', 'BCH/USD', 'ETC/USD'],
  },
  {
    id: 6,
    name: 'NARRATIVE_HOT',
    description: 'Narrativas quentes - Hype e atenção',
    characteristics: { volume_weight: 0.7, volatility_weight: 0.8, momentum_weight: 0.9, spread_weight: 0.5, correlation_weight: 0.2 },
    typical_assets: ['DOGE/USD', 'SHIB/USD', 'WIF/USD'],
  },
  {
    id: 7,
    name: 'TREND_DEFINED',
    description: 'Tendência definida - Direção clara',
    characteristics: { volume_weight: 0.6, volatility_weight: 0.5, momentum_weight: 0.8, spread_weight: 0.5, correlation_weight: 0.6 },
    typical_assets: ['XRP/USD', 'ATOM/USD', 'NEAR/USD', 'FTM/USD'],
  },
  {
    id: 8,
    name: 'SIDEWAYS',
    description: 'Sideways direcional - Range trading',
    characteristics: { volume_weight: 0.5, volatility_weight: 0.3, momentum_weight: 0.2, spread_weight: 0.6, correlation_weight: 0.7 },
    typical_assets: ['XLM/USD', 'ALGO/USD', 'VET/USD'],
  },
  {
    id: 9,
    name: 'ALTCOIN_MID',
    description: 'Altcoins intermediárias - Médio porte',
    characteristics: { volume_weight: 0.4, volatility_weight: 0.6, momentum_weight: 0.5, spread_weight: 0.7, correlation_weight: 0.4 },
    typical_assets: ['GRT/USD', 'FIL/USD', 'SAND/USD', 'MANA/USD', 'AXS/USD'],
  },
  {
    id: 10,
    name: 'HYBRID',
    description: 'Comportamento híbrido - Características mistas',
    characteristics: { volume_weight: 0.5, volatility_weight: 0.5, momentum_weight: 0.5, spread_weight: 0.5, correlation_weight: 0.5 },
    typical_assets: [],
  },
];

interface AssetMetrics {
  symbol: string;
  volume_score: number;
  volatility_score: number;
  momentum_score: number;
  spread_score: number;
  correlation_score: number;
}

class SemanticClusterService {
  
  async classifyAsset(symbol: string): Promise<{ clusterId: number; confidence: number; reason: string }> {
    const knownCluster = this.getKnownCluster(symbol);
    if (knownCluster) {
      return { clusterId: knownCluster, confidence: 1.0, reason: 'Known asset mapping' };
    }

    try {
      const metrics = await this.calculateAssetMetrics(symbol);
      if (!metrics) {
        return { clusterId: 10, confidence: 0.3, reason: 'Insufficient data - default to HYBRID' };
      }

      const { clusterId, confidence } = this.matchToCluster(metrics);
      return { clusterId, confidence, reason: `Matched based on ${this.getMatchReason(metrics, clusterId)}` };
    } catch (error) {
      console.error(`[SemanticCluster] Error classifying ${symbol}:`, error);
      return { clusterId: 10, confidence: 0.2, reason: 'Error during classification' };
    }
  }

  async classifyAllAssets(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    try {
      const allSymbols = await db.select({ id: schema.symbols.id, symbol: schema.symbols.symbol })
        .from(schema.symbols)
        .where(eq(schema.symbols.exchange_id, 'kraken'));

      for (const sym of allSymbols) {
        try {
          const classification = await this.classifyAsset(sym.symbol);
          
          await db.update(schema.symbols)
            .set({ cluster_id: classification.clusterId })
            .where(eq(schema.symbols.id, sym.id));
          
          updated++;
        } catch (err) {
          errors++;
          console.error(`[SemanticCluster] Failed to classify ${sym.symbol}:`, err);
        }
      }

      console.log(`[SemanticCluster] Classification complete: ${updated} updated, ${errors} errors`);
      return { updated, errors };
    } catch (error) {
      console.error('[SemanticCluster] Failed to classify all assets:', error);
      throw error;
    }
  }

  async getClusterAssets(clusterId: number): Promise<string[]> {
    const results = await db.select({ symbol: schema.symbols.symbol })
      .from(schema.symbols)
      .where(eq(schema.symbols.cluster_id, clusterId));
    
    return results.map(r => r.symbol);
  }

  async getClusterDistribution(): Promise<Record<number, { name: string; count: number; assets: string[] }>> {
    const distribution: Record<number, { name: string; count: number; assets: string[] }> = {};

    for (const def of CLUSTER_DEFINITIONS) {
      const assets = await this.getClusterAssets(def.id);
      distribution[def.id] = {
        name: def.name,
        count: assets.length,
        assets,
      };
    }

    return distribution;
  }

  getClusterDefinition(clusterId: number): ClusterDefinition | undefined {
    return CLUSTER_DEFINITIONS.find(d => d.id === clusterId);
  }

  private getKnownCluster(symbol: string): number | null {
    for (const def of CLUSTER_DEFINITIONS) {
      if (def.typical_assets.includes(symbol)) {
        return def.id;
      }
    }
    return null;
  }

  private async calculateAssetMetrics(symbol: string): Promise<AssetMetrics | null> {
    try {
      const [l1Quote, ticks, vreState] = await Promise.all([
        dataIngestionService.getL1Quote('kraken', symbol),
        dataIngestionService.getRecentTicks('kraken', symbol, 500),
        volatilityRegimeEngine.detectRegime(symbol).catch(() => null),
      ]);

      if (!l1Quote || !ticks || ticks.length < 50) {
        return null;
      }

      const prices = ticks.map(t => parseFloat(t.price || '0')).filter(p => p > 0);
      if (prices.length < 50) return null;

      const volume = ticks.reduce((sum, t) => sum + (parseFloat(t.price) * parseFloat(t.quantity || '0')), 0);
      const volume_score = Math.min(1, volume / 1000000);

      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push(Math.log(prices[i] / prices[i - 1]));
      }
      const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length);
      const volatility_score = Math.min(1, volatility * 100);

      const momentum = (prices[0] - prices[Math.min(prices.length - 1, 100)]) / prices[Math.min(prices.length - 1, 100)];
      const momentum_score = Math.min(1, Math.abs(momentum) * 10);

      const bidPrice = parseFloat(l1Quote.bid_price);
      const askPrice = parseFloat(l1Quote.ask_price);
      const midPrice = (bidPrice + askPrice) / 2;
      const spread = midPrice > 0 ? (askPrice - bidPrice) / midPrice : 1;
      const spread_score = 1 - Math.min(1, spread * 100);

      const correlation_score = this.estimateBTCCorrelation(symbol);

      return {
        symbol,
        volume_score,
        volatility_score,
        momentum_score,
        spread_score,
        correlation_score,
      };
    } catch (error) {
      return null;
    }
  }

  private matchToCluster(metrics: AssetMetrics): { clusterId: number; confidence: number } {
    let bestCluster = 10;
    let bestScore = 0;

    for (const def of CLUSTER_DEFINITIONS) {
      if (def.id === 10) continue;

      const score = this.calculateClusterScore(metrics, def.characteristics);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = def.id;
      }
    }

    const confidence = Math.min(1, bestScore);
    return { clusterId: bestCluster, confidence };
  }

  private calculateClusterScore(metrics: AssetMetrics, chars: ClusterCharacteristics): number {
    const volumeDiff = 1 - Math.abs(metrics.volume_score - chars.volume_weight);
    const volDiff = 1 - Math.abs(metrics.volatility_score - chars.volatility_weight);
    const momDiff = 1 - Math.abs(metrics.momentum_score - chars.momentum_weight);
    const spreadDiff = 1 - Math.abs(metrics.spread_score - chars.spread_weight);
    const corrDiff = 1 - Math.abs(metrics.correlation_score - chars.correlation_weight);

    return (volumeDiff + volDiff + momDiff + spreadDiff + corrDiff) / 5;
  }

  private estimateBTCCorrelation(symbol: string): number {
    const upperSymbol = symbol.toUpperCase();
    if (upperSymbol.includes('BTC')) return 1.0;
    if (upperSymbol.includes('ETH')) return 0.85;
    if (['SOL/USD', 'AVAX/USD', 'DOT/USD'].includes(symbol)) return 0.75;
    if (['DOGE/USD', 'SHIB/USD', 'PEPE/USD'].includes(symbol)) return 0.4;
    return 0.5;
  }

  private getMatchReason(metrics: AssetMetrics, clusterId: number): string {
    const def = this.getClusterDefinition(clusterId);
    if (!def) return 'unknown';

    const factors: string[] = [];
    if (metrics.volume_score > 0.7) factors.push('high volume');
    if (metrics.volatility_score > 0.7) factors.push('high volatility');
    if (metrics.momentum_score > 0.6) factors.push('strong momentum');
    if (metrics.spread_score > 0.8) factors.push('tight spreads');

    return factors.length > 0 ? factors.join(', ') : 'overall profile match';
  }
}

export const semanticClusterService = new SemanticClusterService();
