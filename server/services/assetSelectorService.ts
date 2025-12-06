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
}

export interface ClusteredAsset extends AssetMetrics {
  cluster_number: number;
  rank: number;
  score: number;
}

export interface SelectionResult {
  run_id: string;
  assets: ClusteredAsset[];
  clusters: {
    cluster_number: number;
    assets: string[];
    avg_metrics: {
      volume: number;
      spread: number;
      depth: number;
      atr: number;
    };
  }[];
}

class AssetSelectorService {
  async calculateMetrics(): Promise<AssetMetrics[]> {
    console.log("[AssetSelector] Calculating metrics for all symbols...");
    
    const allSymbols = await db.select().from(symbols)
      .where(eq(symbols.exchange_id, "kraken"))
      .execute();

    console.log(`[AssetSelector] Found ${allSymbols.length} Kraken symbols in database`);

    const metricsPromises = allSymbols.map(async (sym: typeof symbols.$inferSelect) => {
      try {
        // Use exchange_symbol for Kraken API calls (e.g., "XBT/USD" instead of "BTC/USD")
        const l1 = await dataIngestionService.getL1Quote("kraken", sym.exchange_symbol);
        const l2 = await dataIngestionService.getL2OrderBook("kraken", sym.exchange_symbol);
        const ticks = await dataIngestionService.getRecentTicks("kraken", sym.exchange_symbol, 100);

        if (!l1 || !l2 || !ticks || ticks.length === 0) {
          return null;
        }

        const volume_24h_usd = ticks.reduce((sum: number, tick: any) => 
          sum + (parseFloat(tick.price) * parseFloat(tick.volume)), 0
        );

        const midPrice = (parseFloat(l1.bid_price) + parseFloat(l1.ask_price)) / 2;
        const spread_mid_pct = ((parseFloat(l1.ask_price) - parseFloat(l1.bid_price)) / midPrice);

        const depth_top10_usd = l2.bids.slice(0, 10).reduce((sum: number, bid: any) => 
          sum + (parseFloat(bid.price) * parseFloat(bid.volume)), 0
        ) + l2.asks.slice(0, 10).reduce((sum: number, ask: any) => 
          sum + (parseFloat(ask.price) * parseFloat(ask.volume)), 0
        );

        const prices = ticks.map((t: any) => parseFloat(t.price));
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        const atr_daily_pct = (high - low) / midPrice;

        return {
          symbol: sym.symbol,
          exchange_symbol: sym.exchange_symbol,
          volume_24h_usd,
          spread_mid_pct,
          depth_top10_usd,
          atr_daily_pct,
        };
      } catch (error) {
        console.warn(`[AssetSelector] Failed to calculate metrics for ${sym.symbol}:`, error);
        return null;
      }
    });

    const results = await Promise.all(metricsPromises);
    const validMetrics = results.filter((m: AssetMetrics | null): m is AssetMetrics => m !== null);
    
    console.log(`[AssetSelector] Calculated metrics for ${validMetrics.length}/${allSymbols.length} symbols`);
    
    return validMetrics;
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
      target_assets_count: 30,
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

    return filtered.slice(0, parseInt(filter.target_assets_count?.toString() || "30"));
  }

  async runKMeansClustering(assets: AssetMetrics[], numClusters: number = 5): Promise<ClusteredAsset[]> {
    if (assets.length === 0) {
      console.warn("[AssetSelector] No assets to cluster");
      return [];
    }

    console.log(`[AssetSelector] Running K-means clustering with ${numClusters} clusters for ${assets.length} assets`);

    const features = assets.map(a => [
      Math.log(a.volume_24h_usd + 1),
      Math.log(a.spread_mid_pct * 10000 + 1),
      Math.log(a.depth_top10_usd + 1),
      a.atr_daily_pct * 100,
    ]);

    const normalized = this.normalizeFeatures(features);

    let clusterResult;
    try {
      clusterResult = kmeans(normalized, numClusters, {
        initialization: 'kmeans++',
        maxIterations: 100,
      });
    } catch (error) {
      console.error("[AssetSelector] K-means failed:", error);
      return assets.map((a, i) => ({
        ...a,
        cluster_number: i % numClusters,
        rank: i + 1,
        score: 100 - i,
      }));
    }

    const clusteredAssets = assets.map((asset, i) => ({
      ...asset,
      cluster_number: clusterResult.clusters[i],
      rank: i + 1,
      score: 100 - (i * (100 / assets.length)),
    }));

    clusteredAssets.sort((a, b) => a.cluster_number - b.cluster_number);

    console.log(`[AssetSelector] Clustering complete. Distribution:`, 
      clusterResult.clusters.reduce((acc: Record<number, number>, c: number) => {
        acc[c] = (acc[c] || 0) + 1;
        return acc;
      }, {} as Record<number, number>)
    );

    return clusteredAssets;
  }

  private normalizeFeatures(features: number[][]): number[][] {
    const numFeatures = features[0].length;
    const means = new Array(numFeatures).fill(0);
    const stds = new Array(numFeatures).fill(0);

    for (let i = 0; i < numFeatures; i++) {
      const values = features.map(f => f[i]);
      means[i] = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - means[i], 2), 0) / values.length;
      stds[i] = Math.sqrt(variance);
    }

    return features.map(feature => 
      feature.map((val, i) => 
        stds[i] === 0 ? 0 : (val - means[i]) / stds[i]
      )
    );
  }

  async runSelection(userId: string): Promise<SelectionResult> {
    console.log(`[AssetSelector] Running asset selection for user ${userId}`);
    
    const metrics = await this.calculateMetrics();
    const filtered = await this.applyFilters(metrics, userId);
    
    const userFilters = await db.select().from(asset_selection_filters)
      .where(and(
        eq(asset_selection_filters.user_id, userId),
        eq(asset_selection_filters.is_default, true)
      ))
      .limit(1)
      .execute();
    
    const numClusters = userFilters[0]?.num_clusters || 5;
    const clustered = await this.runKMeansClustering(filtered, numClusters);

    const run_id = nanoid();

    const clusterStats = new Map<number, {
      assets: string[];
      volume: number[];
      spread: number[];
      depth: number[];
      atr: number[];
    }>();

    clustered.forEach(asset => {
      if (!clusterStats.has(asset.cluster_number)) {
        clusterStats.set(asset.cluster_number, {
          assets: [],
          volume: [],
          spread: [],
          depth: [],
          atr: [],
        });
      }
      const stats = clusterStats.get(asset.cluster_number)!;
      stats.assets.push(asset.symbol);
      stats.volume.push(asset.volume_24h_usd);
      stats.spread.push(asset.spread_mid_pct);
      stats.depth.push(asset.depth_top10_usd);
      stats.atr.push(asset.atr_daily_pct);
    });

    const clusters = Array.from(clusterStats.entries()).map(([cluster_number, stats]) => ({
      cluster_number,
      assets: stats.assets,
      avg_metrics: {
        volume: stats.volume.reduce((a, b) => a + b, 0) / stats.volume.length,
        spread: stats.spread.reduce((a, b) => a + b, 0) / stats.spread.length,
        depth: stats.depth.reduce((a, b) => a + b, 0) / stats.depth.length,
        atr: stats.atr.reduce((a, b) => a + b, 0) / stats.atr.length,
      },
    }));

    console.log(`[AssetSelector] Selection complete. Run ID: ${run_id}, Assets: ${clustered.length}, Clusters: ${clusters.length}`);

    return {
      run_id,
      assets: clustered,
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
        num_clusters: 5,
        target_assets_count: 30,
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
