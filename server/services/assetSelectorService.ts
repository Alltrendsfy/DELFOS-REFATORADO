import { db } from "../db";
import { symbols, symbol_rankings, asset_selection_filters, exchanges } from "../../shared/schema";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import { dataIngestionService } from "./dataIngestionService";
import { kmeans } from "ml-kmeans";
import { nanoid } from "nanoid";

export interface AssetMetrics {
  symbol: string;
  exchange_symbol: string;
  volume_24h_usd: number;
  spread_mid_pct: number;
  depth_top10_usd: number;
  atr_daily_pct: number;
  max_return_1h: number;
  roc_7d: number;
  price_std: number;
  dmr: number;
  health_score: number;
}

export interface ClusterFeatures {
  liquidez: number;
  volatilidade: number;
  explosividade: number;
  momentum: number;
  direcionalidade: number;
  risco: number;
}

export interface ClusteredAsset extends AssetMetrics {
  cluster_number: number;
  cluster_label: string;
  rank: number;
  score: number;
  features: ClusterFeatures;
}

export interface ClusterInfo {
  cluster_number: number;
  label: string;
  assets: string[];
  centroid: ClusterFeatures;
  avg_metrics: {
    volume: number;
    spread: number;
    depth: number;
    atr: number;
  };
}

export interface SelectionResult {
  run_id: string;
  assets: ClusteredAsset[];
  clusters: ClusterInfo[];
}

const CLUSTER_LABELS: Record<number, string> = {
  0: "Alta Liquidez",
  1: "Volatilidade Moderada",
  2: "Explosivas",
  3: "Momentum Forte",
  4: "Scalping",
  5: "Narrativas Quentes",
  6: "Tendencia Limpa",
  7: "Sideways Direcional",
  8: "Intermediarias",
  9: "Hibridas",
};

class AssetSelectorService {
  private readonly DEFAULT_CLUSTERS = 10;
  private readonly MAX_ASSETS_PER_CLUSTER = 10;

  async calculateMetrics(): Promise<AssetMetrics[]> {
    console.log("[AssetSelector] Calculating extended metrics (6 features) for all symbols...");
    
    const allSymbols = await db.select().from(symbols)
      .where(eq(symbols.exchange_id, "kraken"))
      .execute();

    console.log(`[AssetSelector] Found ${allSymbols.length} Kraken symbols in database`);

    const metricsPromises = allSymbols.map(async (sym: typeof symbols.$inferSelect) => {
      try {
        const l1 = await dataIngestionService.getL1Quote("kraken", sym.exchange_symbol);
        const l2 = await dataIngestionService.getL2OrderBook("kraken", sym.exchange_symbol);
        const ticks = await dataIngestionService.getRecentTicks("kraken", sym.exchange_symbol, 500);

        if (!l1 || !l2 || !ticks || ticks.length < 10) {
          return null;
        }

        const prices = ticks.map((t: any) => parseFloat(t.price));
        const timestamps = ticks.map((t: any) => t.exchange_ts || t.ingest_ts);
        
        const midPrice = (parseFloat(l1.bid_price) + parseFloat(l1.ask_price)) / 2;
        if (midPrice <= 0) return null;

        const volume_24h_usd = ticks.reduce((sum: number, tick: any) => 
          sum + (parseFloat(tick.price) * parseFloat(tick.quantity || tick.volume || "0")), 0
        );

        const spread_mid_pct = ((parseFloat(l1.ask_price) - parseFloat(l1.bid_price)) / midPrice);

        const depth_top10_usd = l2.bids.slice(0, 10).reduce((sum: number, bid: any) => 
          sum + (parseFloat(bid.price) * parseFloat(bid.quantity || bid.volume || "0")), 0
        ) + l2.asks.slice(0, 10).reduce((sum: number, ask: any) => 
          sum + (parseFloat(ask.price) * parseFloat(ask.quantity || ask.volume || "0")), 0
        );

        const high = Math.max(...prices);
        const low = Math.min(...prices);
        const atr_daily_pct = midPrice > 0 ? (high - low) / midPrice : 0;

        const max_return_1h = this.calculateMaxReturn1h(prices, timestamps);

        const roc_7d = this.calculateROC(prices);

        const price_std = this.calculateStdDev(prices);

        const dmr = this.calculateDMR(prices);

        const health_score = this.estimateHealthScore(volume_24h_usd, depth_top10_usd, spread_mid_pct);

        return {
          symbol: sym.symbol,
          exchange_symbol: sym.exchange_symbol,
          volume_24h_usd,
          spread_mid_pct,
          depth_top10_usd,
          atr_daily_pct,
          max_return_1h,
          roc_7d,
          price_std,
          dmr,
          health_score,
        };
      } catch (error) {
        console.warn(`[AssetSelector] Failed to calculate metrics for ${sym.symbol}:`, error);
        return null;
      }
    });

    const results = await Promise.all(metricsPromises);
    const validMetrics = results.filter((m: AssetMetrics | null): m is AssetMetrics => m !== null);
    
    console.log(`[AssetSelector] Calculated extended metrics for ${validMetrics.length}/${allSymbols.length} symbols`);
    
    return validMetrics;
  }

  private calculateMaxReturn1h(prices: number[], timestamps: number[]): number {
    if (prices.length < 2) return 0;
    
    const ONE_HOUR_MS = 60 * 60 * 1000;
    let maxReturn = 0;

    for (let i = 0; i < prices.length; i++) {
      for (let j = i + 1; j < prices.length; j++) {
        const timeDiff = Math.abs(timestamps[j] - timestamps[i]);
        if (timeDiff <= ONE_HOUR_MS && prices[i] > 0) {
          const returnPct = Math.abs((prices[j] - prices[i]) / prices[i]);
          maxReturn = Math.max(maxReturn, returnPct);
        }
      }
    }

    return maxReturn;
  }

  private calculateROC(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const oldestPrice = prices[prices.length - 1];
    const newestPrice = prices[0];
    
    if (oldestPrice <= 0) return 0;
    
    return (newestPrice - oldestPrice) / oldestPrice;
  }

  private calculateStdDev(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / prices.length;
    
    return Math.sqrt(variance);
  }

  private calculateDMR(prices: number[]): number {
    if (prices.length < 3) return 0;

    let totalDMR = 0;
    let count = 0;

    for (let i = 1; i < prices.length - 1; i++) {
      const high = Math.max(prices[i-1], prices[i], prices[i+1]);
      const low = Math.min(prices[i-1], prices[i], prices[i+1]);
      const prevClose = prices[i+1];
      
      const trueRange = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      if (trueRange > 0) {
        const directionalMove = Math.abs(prices[i] - prices[i+1]);
        totalDMR += directionalMove / trueRange;
        count++;
      }
    }

    return count > 0 ? totalDMR / count : 0;
  }

  private estimateHealthScore(volume: number, depth: number, spread: number): number {
    const volumeScore = Math.min(1, volume / 100000000);
    const depthScore = Math.min(1, depth / 10000000);
    const spreadScore = Math.max(0, 1 - (spread * 100));
    
    return (volumeScore * 0.4 + depthScore * 0.3 + spreadScore * 0.3);
  }

  calculateClusterFeatures(metrics: AssetMetrics[], maxValues: {
    volume: number;
    depth: number;
    spread: number;
    atr: number;
    maxReturn: number;
    roc: number;
    dmr: number;
    minDmr: number;
  }): ClusterFeatures[] {
    return metrics.map(m => {
      const liquidez = 
        0.5 * (maxValues.volume > 0 ? m.volume_24h_usd / maxValues.volume : 0) +
        0.3 * (maxValues.depth > 0 ? m.depth_top10_usd / maxValues.depth : 0) +
        0.2 * (1 - Math.min(1, m.spread_mid_pct));

      const volatilidade = maxValues.atr > 0 ? m.atr_daily_pct / maxValues.atr : 0;

      const explosividade = m.atr_daily_pct > 0 
        ? Math.min(1, m.max_return_1h / m.atr_daily_pct) 
        : 0;

      const momentum = m.price_std > 0 
        ? m.roc_7d / m.price_std
        : 0;

      const dmrRange = maxValues.dmr - maxValues.minDmr;
      const direcionalidade = dmrRange > 0 
        ? (m.dmr - maxValues.minDmr) / dmrRange 
        : 0;

      const risco = 1 - m.health_score;

      return {
        liquidez: Math.max(0, Math.min(1, liquidez)),
        volatilidade: Math.max(0, Math.min(1, volatilidade)),
        explosividade: Math.max(0, Math.min(1, explosividade)),
        momentum: Math.max(0, Math.min(1, (momentum + 1) / 2)),
        direcionalidade: Math.max(0, Math.min(1, direcionalidade)),
        risco: Math.max(0, Math.min(1, risco)),
      };
    });
  }

  async applyFilters(metrics: AssetMetrics[], userId: string): Promise<AssetMetrics[]> {
    const filters = await db.select().from(asset_selection_filters)
      .where(and(
        eq(asset_selection_filters.user_id, userId),
        eq(asset_selection_filters.is_default, true)
      ))
      .limit(1)
      .execute();

    const filter = filters[0] || {
      min_volume_24h_usd: "5000000",
      max_spread_mid_pct: "0.10",
      min_depth_top10_usd: "100000",
      min_atr_daily_pct: "0.01",
      max_atr_daily_pct: "0.50",
      target_assets_count: 100,
    };

    console.log(`[AssetSelector] Applying filters for user ${userId}:`, filter);

    const filtered = metrics.filter(m => 
      m.volume_24h_usd >= parseFloat(filter.min_volume_24h_usd || "0") &&
      m.spread_mid_pct <= parseFloat(filter.max_spread_mid_pct || "1") &&
      m.depth_top10_usd >= parseFloat(filter.min_depth_top10_usd || "0") &&
      m.atr_daily_pct >= parseFloat(filter.min_atr_daily_pct || "0") &&
      m.atr_daily_pct <= parseFloat(filter.max_atr_daily_pct || "1")
    );

    console.log(`[AssetSelector] Filtered to ${filtered.length} assets (target: ${filter.target_assets_count})`);

    filtered.sort((a, b) => {
      const scoreA = (a.volume_24h_usd / 1000000) * (1 / a.spread_mid_pct) * (a.depth_top10_usd / 100000) * (a.atr_daily_pct * 100);
      const scoreB = (b.volume_24h_usd / 1000000) * (1 / b.spread_mid_pct) * (b.depth_top10_usd / 100000) * (b.atr_daily_pct * 100);
      return scoreB - scoreA;
    });

    return filtered.slice(0, parseInt(filter.target_assets_count?.toString() || "100"));
  }

  async runKMeansClustering(assets: AssetMetrics[], numClusters: number = 10): Promise<{
    clusteredAssets: ClusteredAsset[];
    centroids: number[][];
  }> {
    if (assets.length === 0) {
      console.warn("[AssetSelector] No assets to cluster");
      return { clusteredAssets: [], centroids: [] };
    }

    const effectiveClusters = Math.min(numClusters, assets.length);
    console.log(`[AssetSelector] Running K-means with ${effectiveClusters} clusters for ${assets.length} assets (6 features)`);

    const maxValues = {
      volume: Math.max(...assets.map(a => a.volume_24h_usd)),
      depth: Math.max(...assets.map(a => a.depth_top10_usd)),
      spread: Math.max(...assets.map(a => a.spread_mid_pct)),
      atr: Math.max(...assets.map(a => a.atr_daily_pct)),
      maxReturn: Math.max(...assets.map(a => a.max_return_1h)),
      roc: Math.max(...assets.map(a => Math.abs(a.roc_7d))),
      dmr: Math.max(...assets.map(a => a.dmr)),
      minDmr: Math.min(...assets.map(a => a.dmr)),
    };

    const clusterFeatures = this.calculateClusterFeatures(assets, maxValues);

    const featureMatrix = clusterFeatures.map(f => [
      f.liquidez,
      f.volatilidade,
      f.explosividade,
      f.momentum,
      f.direcionalidade,
      f.risco,
    ]);

    const normalized = this.normalizeMinMax(featureMatrix);

    let clusterResult;
    try {
      clusterResult = kmeans(normalized, effectiveClusters, {
        initialization: 'kmeans++',
        maxIterations: 100,
      });
    } catch (error) {
      console.error("[AssetSelector] K-means failed:", error);
      return {
        clusteredAssets: assets.map((a, i) => ({
          ...a,
          cluster_number: i % effectiveClusters,
          cluster_label: CLUSTER_LABELS[i % effectiveClusters] || `Cluster ${i % effectiveClusters}`,
          rank: i + 1,
          score: 100 - i,
          features: clusterFeatures[i],
        })),
        centroids: [],
      };
    }

    const clusteredAssets: ClusteredAsset[] = assets.map((asset, i) => ({
      ...asset,
      cluster_number: clusterResult.clusters[i],
      cluster_label: this.assignClusterLabel(clusterResult.centroids[clusterResult.clusters[i]]),
      rank: i + 1,
      score: 100 - (i * (100 / assets.length)),
      features: clusterFeatures[i],
    }));

    clusteredAssets.sort((a, b) => a.cluster_number - b.cluster_number);

    console.log(`[AssetSelector] Clustering complete with 6 features. Distribution:`, 
      clusterResult.clusters.reduce((acc: Record<number, number>, c: number) => {
        acc[c] = (acc[c] || 0) + 1;
        return acc;
      }, {} as Record<number, number>)
    );

    return {
      clusteredAssets,
      centroids: clusterResult.centroids,
    };
  }

  private normalizeMinMax(features: number[][]): number[][] {
    if (features.length === 0) return [];
    
    const numFeatures = features[0].length;
    const mins = new Array(numFeatures).fill(Infinity);
    const maxs = new Array(numFeatures).fill(-Infinity);

    for (let i = 0; i < numFeatures; i++) {
      for (const feature of features) {
        mins[i] = Math.min(mins[i], feature[i]);
        maxs[i] = Math.max(maxs[i], feature[i]);
      }
    }

    return features.map(feature => 
      feature.map((val, i) => {
        const range = maxs[i] - mins[i];
        return range === 0 ? 0 : (val - mins[i]) / range;
      })
    );
  }

  private assignClusterLabel(centroid: number[]): string {
    if (!centroid || centroid.length < 6) {
      return "Hibridas";
    }

    const [liquidez, volatilidade, explosividade, momentum, direcionalidade, risco] = centroid;

    const dominantFeature = Math.max(liquidez, volatilidade, explosividade, momentum, direcionalidade, risco);
    
    if (liquidez === dominantFeature && liquidez > 0.6) {
      return "Alta Liquidez";
    }
    if (explosividade === dominantFeature && explosividade > 0.5) {
      return "Explosivas";
    }
    if (momentum === dominantFeature && momentum > 0.5) {
      return "Momentum Forte";
    }
    if (direcionalidade === dominantFeature && direcionalidade > 0.6) {
      return "Tendencia Limpa";
    }
    if (volatilidade > 0.3 && volatilidade < 0.6 && explosividade < 0.4) {
      return "Volatilidade Moderada";
    }
    if (volatilidade < 0.3 && direcionalidade > 0.4) {
      return "Sideways Direcional";
    }
    if (risco > 0.6) {
      return "Narrativas Quentes";
    }
    if (volatilidade < 0.3 && momentum < 0.3) {
      return "Scalping";
    }
    if (Math.max(liquidez, volatilidade, explosividade, momentum, direcionalidade) < 0.5) {
      return "Intermediarias";
    }

    return "Hibridas";
  }

  async runSelection(userId: string): Promise<SelectionResult> {
    console.log(`[AssetSelector] Running asset selection with 6-feature clustering for user ${userId}`);
    
    const metrics = await this.calculateMetrics();
    const filtered = await this.applyFilters(metrics, userId);
    
    const userFilters = await db.select().from(asset_selection_filters)
      .where(and(
        eq(asset_selection_filters.user_id, userId),
        eq(asset_selection_filters.is_default, true)
      ))
      .limit(1)
      .execute();
    
    const numClusters = userFilters[0]?.num_clusters || this.DEFAULT_CLUSTERS;
    const { clusteredAssets, centroids } = await this.runKMeansClustering(filtered, numClusters);

    const run_id = nanoid();

    const clusterStats = new Map<number, {
      assets: string[];
      volume: number[];
      spread: number[];
      depth: number[];
      atr: number[];
      features: ClusterFeatures[];
    }>();

    clusteredAssets.forEach(asset => {
      if (!clusterStats.has(asset.cluster_number)) {
        clusterStats.set(asset.cluster_number, {
          assets: [],
          volume: [],
          spread: [],
          depth: [],
          atr: [],
          features: [],
        });
      }
      const stats = clusterStats.get(asset.cluster_number)!;
      stats.assets.push(asset.symbol);
      stats.volume.push(asset.volume_24h_usd);
      stats.spread.push(asset.spread_mid_pct);
      stats.depth.push(asset.depth_top10_usd);
      stats.atr.push(asset.atr_daily_pct);
      stats.features.push(asset.features);
    });

    const clusters: ClusterInfo[] = Array.from(clusterStats.entries()).map(([cluster_number, stats]) => {
      const avgFeatures = {
        liquidez: stats.features.reduce((a, b) => a + b.liquidez, 0) / stats.features.length,
        volatilidade: stats.features.reduce((a, b) => a + b.volatilidade, 0) / stats.features.length,
        explosividade: stats.features.reduce((a, b) => a + b.explosividade, 0) / stats.features.length,
        momentum: stats.features.reduce((a, b) => a + b.momentum, 0) / stats.features.length,
        direcionalidade: stats.features.reduce((a, b) => a + b.direcionalidade, 0) / stats.features.length,
        risco: stats.features.reduce((a, b) => a + b.risco, 0) / stats.features.length,
      };

      return {
        cluster_number,
        label: this.assignClusterLabel([
          avgFeatures.liquidez,
          avgFeatures.volatilidade,
          avgFeatures.explosividade,
          avgFeatures.momentum,
          avgFeatures.direcionalidade,
          avgFeatures.risco,
        ]),
        assets: stats.assets,
        centroid: avgFeatures,
        avg_metrics: {
          volume: stats.volume.reduce((a, b) => a + b, 0) / stats.volume.length,
          spread: stats.spread.reduce((a, b) => a + b, 0) / stats.spread.length,
          depth: stats.depth.reduce((a, b) => a + b, 0) / stats.depth.length,
          atr: stats.atr.reduce((a, b) => a + b, 0) / stats.atr.length,
        },
      };
    });

    console.log(`[AssetSelector] Selection complete. Run ID: ${run_id}, Assets: ${clusteredAssets.length}, Clusters: ${clusters.length}`);
    console.log(`[AssetSelector] Cluster labels:`, clusters.map(c => `${c.cluster_number}: ${c.label} (${c.assets.length} assets)`));

    return {
      run_id,
      assets: clusteredAssets,
      clusters,
    };
  }

  async getUserFilters(userId: string) {
    const filters = await db.select().from(asset_selection_filters)
      .where(and(
        eq(asset_selection_filters.user_id, userId),
        eq(asset_selection_filters.is_default, true)
      ))
      .limit(1)
      .execute();

    if (filters.length === 0) {
      const defaultFilters = {
        user_id: userId,
        min_volume_24h_usd: "5000000",
        max_spread_mid_pct: "0.10",
        min_depth_top10_usd: "100000",
        min_atr_daily_pct: "0.01",
        max_atr_daily_pct: "0.50",
        num_clusters: this.DEFAULT_CLUSTERS,
        target_assets_count: 100,
        is_default: true,
      };

      await db.insert(asset_selection_filters).values(defaultFilters).execute();
      
      const newFilters = await db.select().from(asset_selection_filters)
        .where(and(
          eq(asset_selection_filters.user_id, userId),
          eq(asset_selection_filters.is_default, true)
        ))
        .limit(1)
        .execute();
      
      return newFilters[0];
    }

    return filters[0];
  }

  async updateUserFilters(userId: string, newFilters: Partial<typeof asset_selection_filters.$inferInsert>) {
    await db.update(asset_selection_filters)
      .set({
        ...newFilters,
        updated_at: new Date(),
      })
      .where(and(
        eq(asset_selection_filters.user_id, userId),
        eq(asset_selection_filters.is_default, true)
      ))
      .execute();

    return this.getUserFilters(userId);
  }
}

export const assetSelectorService = new AssetSelectorService();
