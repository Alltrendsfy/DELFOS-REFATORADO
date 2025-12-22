import { volatilityRegimeEngine, VREState } from './trading/volatilityRegimeEngine';
import { marketRegimeDetector, RegimeAnalysis, MarketRegime } from './trading/marketRegimeDetector';
import { semanticClusterService } from './opportunity/semanticClusterService';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, isNotNull } from 'drizzle-orm';
import { getRedisClient } from '../redis';

interface AnalyticsState {
  vre: Map<string, VREState>;
  marketRegime: MarketRegime;
  lastVreRun: Date | null;
  lastMarketRegimeRun: Date | null;
  lastClusterRun: Date | null;
  isRunning: boolean;
}

class AnalyticsSchedulerService {
  private state: AnalyticsState = {
    vre: new Map(),
    marketRegime: 'sideways',
    lastVreRun: null,
    lastMarketRegimeRun: null,
    lastClusterRun: null,
    isRunning: false,
  };

  private vreInterval: NodeJS.Timeout | null = null;
  private marketRegimeInterval: NodeJS.Timeout | null = null;
  private clusterInterval: NodeJS.Timeout | null = null;

  private readonly VRE_INTERVAL_MS = 30000;
  private readonly MARKET_REGIME_INTERVAL_MS = 60000;
  private readonly CLUSTER_INTERVAL_MS = 300000;

  private readonly TOP_SYMBOLS = [
    'BTC/USD', 'ETH/USD', 'SOL/USD', 'ADA/USD', 'DOT/USD',
    'AVAX/USD', 'LINK/USD', 'XRP/USD', 'ATOM/USD', 'NEAR/USD'
  ];

  async start(): Promise<void> {
    if (this.state.isRunning) {
      console.log('[AnalyticsScheduler] Already running');
      return;
    }

    console.log('[AnalyticsScheduler] Starting analytics scheduler...');
    this.state.isRunning = true;

    await this.runVRECycle();
    await this.runMarketRegimeCycle();

    this.vreInterval = setInterval(() => this.runVRECycle(), this.VRE_INTERVAL_MS);
    this.marketRegimeInterval = setInterval(() => this.runMarketRegimeCycle(), this.MARKET_REGIME_INTERVAL_MS);
    this.clusterInterval = setInterval(() => this.runClusterCycle(), this.CLUSTER_INTERVAL_MS);

    console.log(`[AnalyticsScheduler] ✅ Started - VRE: ${this.VRE_INTERVAL_MS/1000}s, Market: ${this.MARKET_REGIME_INTERVAL_MS/1000}s, Clusters: ${this.CLUSTER_INTERVAL_MS/1000}s`);
  }

  stop(): void {
    if (this.vreInterval) {
      clearInterval(this.vreInterval);
      this.vreInterval = null;
    }
    if (this.marketRegimeInterval) {
      clearInterval(this.marketRegimeInterval);
      this.marketRegimeInterval = null;
    }
    if (this.clusterInterval) {
      clearInterval(this.clusterInterval);
      this.clusterInterval = null;
    }
    this.state.isRunning = false;
    console.log('[AnalyticsScheduler] Stopped');
  }

  private async runVRECycle(): Promise<void> {
    try {
      const activeSymbols = await this.getActiveSymbols();
      const symbolsToProcess = activeSymbols.length > 0 ? activeSymbols : this.TOP_SYMBOLS;

      let processed = 0;
      let errors = 0;

      for (const symbol of symbolsToProcess) {
        try {
          const vreState = await volatilityRegimeEngine.detectRegime(symbol);
          this.state.vre.set(symbol, vreState);
          processed++;

          await this.cacheVREState(symbol, vreState);
        } catch (error) {
          errors++;
          console.error(`[AnalyticsScheduler] VRE error for ${symbol}:`, error);
        }
      }

      this.state.lastVreRun = new Date();

      if (processed > 0) {
        const regimeSummary = this.getVRERegimeSummary();
        console.log(`[AnalyticsScheduler] VRE cycle complete: ${processed} symbols | ${regimeSummary}`);
      }
    } catch (error) {
      console.error('[AnalyticsScheduler] VRE cycle failed:', error);
    }
  }

  private async runMarketRegimeCycle(): Promise<void> {
    try {
      const aggregateRegime = await marketRegimeDetector.detectAggregateRegime(['BTC/USD', 'ETH/USD']);
      this.state.marketRegime = aggregateRegime;
      this.state.lastMarketRegimeRun = new Date();

      await this.cacheMarketRegime(aggregateRegime);

      console.log(`[AnalyticsScheduler] Market regime: ${aggregateRegime.toUpperCase()}`);
    } catch (error) {
      console.error('[AnalyticsScheduler] Market regime cycle failed:', error);
    }
  }

  private async runClusterCycle(): Promise<void> {
    try {
      const result = await semanticClusterService.classifyAllAssets();
      this.state.lastClusterRun = new Date();
      console.log(`[AnalyticsScheduler] Cluster classification: ${result.updated} updated, ${result.errors} errors`);
    } catch (error) {
      console.error('[AnalyticsScheduler] Cluster cycle failed:', error);
    }
  }

  private async getActiveSymbols(): Promise<string[]> {
    try {
      const symbols = await db.select({ symbol: schema.symbols.symbol })
        .from(schema.symbols)
        .where(eq(schema.symbols.is_active, true));
      
      return symbols.map(s => s.symbol).slice(0, 30);
    } catch (error) {
      return this.TOP_SYMBOLS;
    }
  }

  private async cacheVREState(symbol: string, state: VREState): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) return;

      const key = `analytics:vre:${symbol}`;
      await redis.set(key, {
        regime: state.regime,
        z_score: state.z_score,
        rv_ratio: state.rv_ratio,
        confidence: state.confidence,
        timestamp: state.timestamp.toISOString(),
      }, { ex: 120 });
    } catch (error) {
    }
  }

  private async cacheMarketRegime(regime: MarketRegime): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) return;

      await redis.set('analytics:market_regime', {
        regime,
        timestamp: new Date().toISOString(),
      }, { ex: 120 });
    } catch (error) {
    }
  }

  private getVRERegimeSummary(): string {
    const counts = { LOW: 0, NORMAL: 0, HIGH: 0, EXTREME: 0 };
    for (const state of this.state.vre.values()) {
      counts[state.regime]++;
    }
    return `LOW:${counts.LOW} NORMAL:${counts.NORMAL} HIGH:${counts.HIGH} EXTREME:${counts.EXTREME}`;
  }

  getState(): AnalyticsState {
    return { ...this.state };
  }

  getVREForSymbol(symbol: string): VREState | undefined {
    return this.state.vre.get(symbol);
  }

  getMarketRegime(): MarketRegime {
    return this.state.marketRegime;
  }

  async getAnalyticsSummary(): Promise<{
    vre: { total: number; byRegime: Record<string, number>; lastRun: string | null };
    marketRegime: { current: MarketRegime; lastRun: string | null };
    clusters: { lastRun: string | null };
    isRunning: boolean;
  }> {
    const byRegime: Record<string, number> = { LOW: 0, NORMAL: 0, HIGH: 0, EXTREME: 0 };
    for (const state of this.state.vre.values()) {
      byRegime[state.regime]++;
    }

    return {
      vre: {
        total: this.state.vre.size,
        byRegime,
        lastRun: this.state.lastVreRun?.toISOString() || null,
      },
      marketRegime: {
        current: this.state.marketRegime,
        lastRun: this.state.lastMarketRegimeRun?.toISOString() || null,
      },
      clusters: {
        lastRun: this.state.lastClusterRun?.toISOString() || null,
      },
      isRunning: this.state.isRunning,
    };
  }

  async getVREHistory(symbol: string, limit: number = 20): Promise<schema.VreDecisionLog[]> {
    try {
      return await db
        .select()
        .from(schema.vre_decision_logs)
        .where(eq(schema.vre_decision_logs.symbol, symbol))
        .orderBy(desc(schema.vre_decision_logs.created_at))
        .limit(limit);
    } catch (error) {
      console.error('[AnalyticsScheduler] Failed to get VRE history:', error);
      return [];
    }
  }

  async getRecentRegimeChanges(limit: number = 10): Promise<schema.VreDecisionLog[]> {
    try {
      return await db
        .select()
        .from(schema.vre_decision_logs)
        .where(eq(schema.vre_decision_logs.regime_changed, true))
        .orderBy(desc(schema.vre_decision_logs.created_at))
        .limit(limit);
    } catch (error) {
      console.error('[AnalyticsScheduler] Failed to get regime changes:', error);
      return [];
    }
  }
}

export const analyticsSchedulerService = new AnalyticsSchedulerService();
