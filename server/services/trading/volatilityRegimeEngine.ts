import { getRedisClient } from '../../redis';
import type { Redis } from '@upstash/redis';
import { RedisBarService } from '../redisBarService';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import crypto from 'crypto';
import * as VRECore from './vreCoreFunctions';

export type VolatilityRegime = VRECore.VolatilityRegime;

export interface VREConfig {
  W_short: number;
  W_long: number;
  K_confirmations: number;
  cooldown_cycles: number;
  z_thresholds: {
    low_normal: number;
    normal_high: number;
    high_extreme: number;
  };
  z_exit_thresholds: {
    extreme_to_high: number;
    high_to_normal: number;
    normal_to_low: number;
  };
  rv_ratio_fallback: {
    low: number;
    high: number;
    extreme: number;
  };
}

export interface VREState {
  regime: VolatilityRegime;
  z_score: number;
  rv_ratio: number;
  rv_short: number;
  rv_long: number;
  rv_long_mean: number;
  rv_long_std: number;
  confidence: number;
  confirmations: number;
  cycles_in_regime: number;
  cooldown_remaining: number;
  last_regime_change: Date;
  method_used: 'z_score' | 'rv_ratio';
  timestamp: Date;
}

export interface VREDecision {
  symbol: string;
  previous_regime: VolatilityRegime | null;
  new_regime: VolatilityRegime;
  z_score: number;
  rv_ratio: number;
  rv_short: number;
  rv_long: number;
  confidence: number;
  regime_changed: boolean;
  blocked_by_cooldown: boolean;
  blocked_by_hysteresis: boolean;
  confirmations_count: number;
  method_used: 'z_score' | 'rv_ratio';
  decision_hash: string;
  timestamp: Date;
}

const DEFAULT_CONFIG: VREConfig = {
  W_short: 96,
  W_long: 672,
  K_confirmations: 3,
  cooldown_cycles: 8,
  z_thresholds: {
    low_normal: -0.75,
    normal_high: 0.75,
    high_extreme: 1.75,
  },
  z_exit_thresholds: {
    extreme_to_high: 1.40,
    high_to_normal: 0.55,
    normal_to_low: -0.55,
  },
  rv_ratio_fallback: {
    low: 0.7,
    high: 1.3,
    extreme: 1.8,
  },
};

interface SymbolVREContext {
  pending_regime: VolatilityRegime | null;
  confirmations: number;
  current_regime: VolatilityRegime;
  cycles_in_regime: number;
  cooldown_remaining: number;
  last_regime_change: Date;
}

class VolatilityRegimeEngineService {
  private config: VREConfig;
  private redisBarService: RedisBarService;
  private symbolContexts: Map<string, SymbolVREContext> = new Map();
  private readonly CACHE_KEY_PREFIX = 'vre:state:';
  private readonly CACHE_TTL_SECONDS = 300;

  constructor(config: Partial<VREConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redisBarService = new RedisBarService();
  }

  async detectRegime(symbol: string, campaignId?: string): Promise<VREState> {
    try {
      const cachedState = await this.getCachedState(symbol);
      if (cachedState) {
        return cachedState;
      }

      const bars = await this.getHistoricalBars(symbol, this.config.W_long + 10);
      
      if (bars.length < this.config.W_long) {
        console.log(`[VRE] Insufficient bars for ${symbol}: ${bars.length}/${this.config.W_long}`);
        return this.createDefaultState('NORMAL');
      }

      const logReturns = this.calculateLogReturns(bars.map(b => b.close));
      
      const rvShort = this.calculateRealizedVolatility(logReturns, this.config.W_short);
      const rvLong = this.calculateRealizedVolatility(logReturns, this.config.W_long);
      
      const rvLongSeries = this.calculateRollingRV(logReturns, this.config.W_short, this.config.W_long);
      const rvLongMean = this.mean(rvLongSeries);
      const rvLongStd = this.std(rvLongSeries, rvLongMean);
      
      let zScore: number;
      let methodUsed: 'z_score' | 'rv_ratio';
      
      if (rvLongStd > 0.0001) {
        zScore = (rvShort - rvLongMean) / rvLongStd;
        methodUsed = 'z_score';
      } else {
        zScore = 0;
        methodUsed = 'rv_ratio';
      }
      
      const rvRatio = rvLong > 0 ? rvShort / rvLong : 1.0;
      
      const rawRegime = this.classifyRegime(zScore, rvRatio, methodUsed);
      
      const contextBefore = this.getOrCreateContext(symbol);
      const previousRegime = contextBefore.current_regime;
      
      const { finalRegime, regimeChanged, blockedByCooldown, blockedByHysteresis, confirmationsCount } = 
        this.applyHysteresisAndCooldown(symbol, rawRegime, zScore);
      
      const confidence = this.calculateConfidence(zScore, rvRatio, methodUsed);
      
      const contextAfter = this.getOrCreateContext(symbol);
      
      const state: VREState = {
        regime: finalRegime,
        z_score: zScore,
        rv_ratio: rvRatio,
        rv_short: rvShort,
        rv_long: rvLong,
        rv_long_mean: rvLongMean,
        rv_long_std: rvLongStd,
        confidence,
        confirmations: confirmationsCount,
        cycles_in_regime: contextAfter.cycles_in_regime,
        cooldown_remaining: contextAfter.cooldown_remaining,
        last_regime_change: contextAfter.last_regime_change,
        method_used: methodUsed,
        timestamp: new Date(),
      };

      await this.cacheState(symbol, state);
      
      await this.logVREDecision(
        symbol, 
        campaignId || null, 
        state, 
        previousRegime,
        regimeChanged,
        blockedByCooldown,
        blockedByHysteresis
      );

      return state;
    } catch (error) {
      console.error(`[VRE] Error detecting regime for ${symbol}:`, error);
      return this.createDefaultState('NORMAL');
    }
  }

  async detectAggregateRegime(symbols: string[] = ['BTC/USD', 'ETH/USD']): Promise<{
    regime: VolatilityRegime;
    confidence: number;
    individual: Map<string, VREState>;
  }> {
    const states = new Map<string, VREState>();
    
    for (const symbol of symbols) {
      const state = await this.detectRegime(symbol);
      states.set(symbol, state);
    }

    const regimeCounts: Record<VolatilityRegime, number> = { LOW: 0, NORMAL: 0, HIGH: 0, EXTREME: 0 };
    const regimeConfidence: Record<VolatilityRegime, number> = { LOW: 0, NORMAL: 0, HIGH: 0, EXTREME: 0 };

    const statesArray = Array.from(states.values());
    for (const state of statesArray) {
      regimeCounts[state.regime]++;
      regimeConfidence[state.regime] += state.confidence;
    }

    let maxRegime: VolatilityRegime = 'NORMAL';
    let maxScore = 0;

    for (const regime of ['LOW', 'NORMAL', 'HIGH', 'EXTREME'] as VolatilityRegime[]) {
      const score = regimeCounts[regime] + regimeConfidence[regime] * 0.5;
      if (score > maxScore) {
        maxScore = score;
        maxRegime = regime;
      }
    }

    const avgConfidence = states.size > 0 
      ? regimeConfidence[maxRegime] / Math.max(1, regimeCounts[maxRegime])
      : 0.5;

    return {
      regime: maxRegime,
      confidence: avgConfidence,
      individual: states,
    };
  }

  isExtremeSpike(zScore: number): boolean {
    return VRECore.isExtremeSpike(zScore);
  }

  getRegimePermissions(regime: VolatilityRegime, investorProfile: string): {
    trading_allowed: boolean;
    pyramiding_allowed: boolean;
    max_position_multiplier: number;
  } {
    return VRECore.getRegimePermissions(regime, investorProfile);
  }

  private calculateLogReturns(closes: number[]): number[] {
    return VRECore.calculateLogReturns(closes);
  }

  private calculateRealizedVolatility(logReturns: number[], window: number): number {
    return VRECore.calculateRealizedVolatility(logReturns, window);
  }

  private calculateRollingRV(logReturns: number[], rvWindow: number, rollingWindow: number): number[] {
    const rvSeries: number[] = [];
    
    for (let i = rvWindow; i <= logReturns.length; i++) {
      const slice = logReturns.slice(i - rvWindow, i);
      const sumSquared = slice.reduce((sum, r) => sum + r * r, 0);
      rvSeries.push(Math.sqrt(sumSquared / rvWindow));
    }
    
    return rvSeries.slice(-rollingWindow);
  }

  private mean(values: number[]): number {
    return VRECore.calculateMean(values);
  }

  private std(values: number[], mean: number): number {
    return VRECore.calculateStd(values, mean);
  }

  private classifyRegime(zScore: number, rvRatio: number, method: 'z_score' | 'rv_ratio'): VolatilityRegime {
    return VRECore.classifyRegime(zScore, rvRatio, method, this.config as VRECore.VREConfig);
  }

  private applyHysteresisAndCooldown(
    symbol: string,
    rawRegime: VolatilityRegime,
    zScore: number
  ): {
    finalRegime: VolatilityRegime;
    regimeChanged: boolean;
    blockedByCooldown: boolean;
    blockedByHysteresis: boolean;
    confirmationsCount: number;
  } {
    const context = this.getOrCreateContext(symbol);
    const previousRegime = context.current_regime;
    
    const result = VRECore.applyHysteresisAndCooldown(
      context as VRECore.SymbolContext,
      rawRegime,
      zScore,
      this.config as VRECore.VREConfig
    );

    if (result.regimeChanged) {
      console.log(`[VRE] Regime changed for ${symbol}: ${previousRegime} -> ${result.finalRegime} (z=${zScore.toFixed(3)})`);
    }

    return result;
  }

  private isWithinHysteresisBand(currentRegime: VolatilityRegime, rawRegime: VolatilityRegime, zScore: number): boolean {
    return VRECore.isWithinHysteresisBand(currentRegime, rawRegime, zScore, this.config as VRECore.VREConfig);
  }

  private calculateConfidence(zScore: number, rvRatio: number, method: 'z_score' | 'rv_ratio'): number {
    if (method === 'z_score') {
      return Math.min(1.0, Math.max(0, Math.abs(zScore) / 2.0));
    } else {
      const deviation = Math.abs(rvRatio - 1.0);
      return Math.min(1.0, Math.max(0, deviation));
    }
  }

  private getOrCreateContext(symbol: string): SymbolVREContext {
    let context = this.symbolContexts.get(symbol);
    if (!context) {
      context = {
        pending_regime: null,
        confirmations: 0,
        current_regime: 'NORMAL',
        cycles_in_regime: 0,
        cooldown_remaining: 0,
        last_regime_change: new Date(),
      };
      this.symbolContexts.set(symbol, context);
    }
    return context;
  }

  private async getHistoricalBars(symbol: string, count: number): Promise<Array<{ close: number; timestamp: number }>> {
    try {
      const krakenSymbol = symbol.replace('/', '');
      const bars = await this.redisBarService.getBars1s('kraken', krakenSymbol, count);
      
      if (bars && bars.length > 0) {
        return bars
          .map(bar => ({
            close: parseFloat(bar.close),
            timestamp: bar.bar_ts,
          }))
          .sort((a, b) => a.timestamp - b.timestamp);
      }
    } catch (error) {
      console.warn(`[VRE] Redis bars unavailable for ${symbol}, using simulated data`);
    }

    return this.generateSimulatedBars(count);
  }

  private generateSimulatedBars(count: number): Array<{ close: number; timestamp: number }> {
    const bars: Array<{ close: number; timestamp: number }> = [];
    let price = 100000;
    const now = Date.now();
    
    for (let i = count - 1; i >= 0; i--) {
      const volatility = 0.005 + Math.random() * 0.01;
      const change = (Math.random() - 0.5) * 2 * volatility;
      price = price * (1 + change);
      
      bars.push({
        close: price,
        timestamp: now - i * 60000,
      });
    }
    
    return bars;
  }

  private async getCachedState(symbol: string): Promise<VREState | null> {
    try {
      const redis = await getRedisClient();
      if (!redis) return null;

      const cached = await redis.get<VREState>(`${this.CACHE_KEY_PREFIX}${symbol}`);
      if (cached && cached.timestamp) {
        const age = Date.now() - new Date(cached.timestamp).getTime();
        if (age < this.CACHE_TTL_SECONDS * 1000) {
          return cached;
        }
      }
    } catch (error) {
      console.warn('[VRE] Cache read failed:', error);
    }
    return null;
  }

  private async cacheState(symbol: string, state: VREState): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) return;

      await redis.set(`${this.CACHE_KEY_PREFIX}${symbol}`, state, { ex: this.CACHE_TTL_SECONDS });
    } catch (error) {
      console.warn('[VRE] Cache write failed:', error);
    }
  }

  private createDefaultState(regime: VolatilityRegime): VREState {
    return {
      regime,
      z_score: 0,
      rv_ratio: 1.0,
      rv_short: 0,
      rv_long: 0,
      rv_long_mean: 0,
      rv_long_std: 0,
      confidence: 0.5,
      confirmations: 0,
      cycles_in_regime: 0,
      cooldown_remaining: 0,
      last_regime_change: new Date(),
      method_used: 'z_score',
      timestamp: new Date(),
    };
  }

  private async logVREDecision(
    symbol: string,
    campaignId: string | null,
    state: VREState,
    previousRegime: VolatilityRegime,
    regimeChanged: boolean,
    blockedByCooldown: boolean,
    blockedByHysteresis: boolean
  ): Promise<void> {
    try {
      const decisionHash = this.generateDecisionHash(symbol, state);

      await db.insert(schema.vre_decision_logs).values({
        campaign_id: campaignId,
        symbol,
        previous_regime: previousRegime,
        new_regime: state.regime,
        z_score: String(state.z_score),
        rv_ratio: String(state.rv_ratio),
        rv_short: String(state.rv_short),
        rv_long: String(state.rv_long),
        rv_long_mean: String(state.rv_long_mean),
        rv_long_std: String(state.rv_long_std),
        confidence: String(state.confidence),
        regime_changed: regimeChanged,
        blocked_by_cooldown: blockedByCooldown,
        blocked_by_hysteresis: blockedByHysteresis,
        confirmations_count: state.confirmations,
        cycles_in_regime: state.cycles_in_regime,
        cooldown_remaining: state.cooldown_remaining,
        method_used: state.method_used,
        decision_hash: decisionHash,
      });

      if (regimeChanged) {
        console.log(`[VRE] Regime changed: ${symbol} ${previousRegime} -> ${state.regime} (z=${state.z_score.toFixed(3)})`);
      }
    } catch (error) {
      console.error('[VRE] Failed to log decision:', error);
    }
  }

  private generateDecisionHash(symbol: string, state: VREState): string {
    const data = {
      symbol,
      regime: state.regime,
      z_score: state.z_score.toFixed(6),
      rv_ratio: state.rv_ratio.toFixed(6),
      timestamp: state.timestamp.toISOString(),
    };
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
  }

  getConfig(): VREConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<VREConfig>): void {
    this.config = { ...this.config, ...partial };
    console.log('[VRE] Config updated:', this.config);
  }

  clearSymbolContext(symbol: string): void {
    this.symbolContexts.delete(symbol);
  }

  async getRecentDecisions(campaignId: string, limit: number = 20): Promise<schema.VreDecisionLog[]> {
    try {
      return await db
        .select()
        .from(schema.vre_decision_logs)
        .where(eq(schema.vre_decision_logs.campaign_id, campaignId))
        .orderBy(desc(schema.vre_decision_logs.created_at))
        .limit(limit);
    } catch (error) {
      console.error('[VRE] Failed to get recent decisions:', error);
      return [];
    }
  }
}

export const volatilityRegimeEngine = new VolatilityRegimeEngineService();
export { VolatilityRegimeEngineService };
