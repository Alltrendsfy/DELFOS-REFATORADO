import { getRedisClient } from '../../redis';
import type { Redis } from '@upstash/redis';
import { RedisBarService } from '../redisBarService';

export type MarketRegime = 'bull' | 'bear' | 'sideways';

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number;
  indicators: {
    shortMa: number;
    longMa: number;
    momentum: number;
    volatility: number;
    trend: 'up' | 'down' | 'flat';
  };
  timestamp: Date;
}

class MarketRegimeDetectorService {
  private readonly SHORT_MA_PERIOD = 20;
  private readonly LONG_MA_PERIOD = 50;
  private readonly MOMENTUM_PERIOD = 14;
  private readonly TREND_THRESHOLD = 0.02;
  private readonly SIDEWAYS_VOLATILITY_MAX = 0.03;

  async detectRegime(symbol: string = 'BTC/USD'): Promise<RegimeAnalysis> {
    try {
      const cachedRegime = await this.getCachedRegime(symbol);
      if (cachedRegime) {
        return cachedRegime;
      }

      const candles = await this.getHistoricalCandles(symbol, 60);
      if (candles.length < this.LONG_MA_PERIOD) {
        return this.createDefaultAnalysis('sideways');
      }

      const closes = candles.map(c => c.close);
      const shortMa = this.calculateSMA(closes, this.SHORT_MA_PERIOD);
      const longMa = this.calculateSMA(closes, this.LONG_MA_PERIOD);
      const momentum = this.calculateMomentum(closes, this.MOMENTUM_PERIOD);
      const volatility = this.calculateVolatility(closes, 20);

      const analysis = this.classifyRegime(shortMa, longMa, momentum, volatility);
      
      await this.cacheRegime(symbol, analysis);
      
      return analysis;
    } catch (error) {
      console.error('[MarketRegimeDetector] Error detecting regime:', error);
      return this.createDefaultAnalysis('sideways');
    }
  }

  async detectAggregateRegime(symbols: string[] = ['BTC/USD', 'ETH/USD']): Promise<MarketRegime> {
    try {
      const analyses: RegimeAnalysis[] = [];
      
      for (const symbol of symbols) {
        const analysis = await this.detectRegime(symbol);
        analyses.push(analysis);
      }

      const regimeCounts = { bull: 0, bear: 0, sideways: 0 };
      let totalConfidence = { bull: 0, bear: 0, sideways: 0 };

      for (const analysis of analyses) {
        regimeCounts[analysis.regime]++;
        totalConfidence[analysis.regime] += analysis.confidence;
      }

      if (regimeCounts.bull > regimeCounts.bear && regimeCounts.bull > regimeCounts.sideways) {
        return 'bull';
      }
      if (regimeCounts.bear > regimeCounts.bull && regimeCounts.bear > regimeCounts.sideways) {
        return 'bear';
      }
      
      if (totalConfidence.bull > totalConfidence.bear) {
        return 'bull';
      }
      if (totalConfidence.bear > totalConfidence.bull) {
        return 'bear';
      }
      
      return 'sideways';
    } catch (error) {
      console.error('[MarketRegimeDetector] Error in aggregate detection:', error);
      return 'sideways';
    }
  }

  private classifyRegime(
    shortMa: number,
    longMa: number,
    momentum: number,
    volatility: number
  ): RegimeAnalysis {
    const maCrossover = (shortMa - longMa) / longMa;
    const trend = this.determineTrend(maCrossover, momentum);
    
    let regime: MarketRegime;
    let confidence: number;

    if (maCrossover > this.TREND_THRESHOLD && momentum > 0) {
      regime = 'bull';
      confidence = Math.min(0.95, 0.5 + Math.abs(maCrossover) * 5 + (momentum > 0 ? 0.2 : 0));
    } else if (maCrossover < -this.TREND_THRESHOLD && momentum < 0) {
      regime = 'bear';
      confidence = Math.min(0.95, 0.5 + Math.abs(maCrossover) * 5 + (momentum < 0 ? 0.2 : 0));
    } else if (volatility < this.SIDEWAYS_VOLATILITY_MAX && Math.abs(maCrossover) < this.TREND_THRESHOLD) {
      regime = 'sideways';
      confidence = Math.min(0.9, 0.6 + (this.SIDEWAYS_VOLATILITY_MAX - volatility) * 10);
    } else {
      if (maCrossover > 0 || momentum > 0) {
        regime = 'bull';
        confidence = 0.4 + Math.abs(maCrossover) * 2;
      } else if (maCrossover < 0 || momentum < 0) {
        regime = 'bear';
        confidence = 0.4 + Math.abs(maCrossover) * 2;
      } else {
        regime = 'sideways';
        confidence = 0.5;
      }
    }

    return {
      regime,
      confidence: Math.max(0.1, Math.min(1.0, confidence)),
      indicators: {
        shortMa,
        longMa,
        momentum,
        volatility,
        trend
      },
      timestamp: new Date()
    };
  }

  private determineTrend(maCrossover: number, momentum: number): 'up' | 'down' | 'flat' {
    if (maCrossover > this.TREND_THRESHOLD / 2 && momentum > 0) {
      return 'up';
    }
    if (maCrossover < -this.TREND_THRESHOLD / 2 && momentum < 0) {
      return 'down';
    }
    return 'flat';
  }

  private calculateSMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1] || 0;
    const slice = values.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }

  private calculateMomentum(values: number[], period: number): number {
    if (values.length < period + 1) return 0;
    const current = values[values.length - 1];
    const past = values[values.length - period - 1];
    return past > 0 ? (current - past) / past : 0;
  }

  private calculateVolatility(values: number[], period: number): number {
    if (values.length < period) return 0;
    const slice = values.slice(-period);
    const mean = slice.reduce((sum, val) => sum + val, 0) / period;
    const squaredDiffs = slice.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / period;
    return Math.sqrt(variance) / mean;
  }

  private async getHistoricalCandles(symbol: string, count: number): Promise<{ close: number }[]> {
    try {
      const barService = new RedisBarService();
      const bars1s = await barService.getBars1s('kraken', symbol, count * 60);
      
      if (bars1s.length > 0) {
        const candles = bars1s.map(bar => ({
          close: typeof bar.close === 'string' ? parseFloat(bar.close) : bar.close
        }));
        return candles.reverse();
      }
      
      const bars5s = await barService.getBars5s('kraken', symbol, count * 12);
      
      if (bars5s.length > 0) {
        const candles = bars5s.map(bar => ({
          close: typeof bar.close === 'string' ? parseFloat(bar.close) : bar.close
        }));
        return candles.reverse();
      }

      return this.generateSimulatedCandles(count);
    } catch (error) {
      console.error('[MarketRegimeDetector] Error fetching candles:', error);
      return this.generateSimulatedCandles(count);
    }
  }

  private generateSimulatedCandles(count: number): { close: number }[] {
    const basePrice = 40000;
    const candles: { close: number }[] = [];
    let price = basePrice;
    
    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.5) * 0.02;
      price = price * (1 + change);
      candles.push({ close: price });
    }
    
    return candles;
  }

  private async getCachedRegime(symbol: string): Promise<RegimeAnalysis | null> {
    try {
      const redis = getRedisClient();
      const key = `regime:${symbol.replace('/', '')}`;
      const cached = await redis.get(key) as string | null;
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - new Date(parsed.timestamp).getTime();
        if (age < 15 * 60 * 1000) {
          return parsed;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async cacheRegime(symbol: string, analysis: RegimeAnalysis): Promise<void> {
    try {
      const redis = getRedisClient();
      const key = `regime:${symbol.replace('/', '')}`;
      await redis.set(key, JSON.stringify(analysis), { ex: 900 });
    } catch (error) {
      console.error('[MarketRegimeDetector] Error caching regime:', error);
    }
  }

  private createDefaultAnalysis(regime: MarketRegime): RegimeAnalysis {
    return {
      regime,
      confidence: 0.5,
      indicators: {
        shortMa: 0,
        longMa: 0,
        momentum: 0,
        volatility: 0,
        trend: 'flat'
      },
      timestamp: new Date()
    };
  }
}

export const marketRegimeDetector = new MarketRegimeDetectorService();
