import { storage } from "../../storage";
import { dataIngestionService } from "../dataIngestionService";
import type { Symbol, Bars1m } from "@shared/schema";

interface IndicatorResult {
  atr14: number | null;
  ema12: number | null;
  ema36: number | null;
  volume7d: number | null;
  volatility30d: number | null;
}

function safeParseFloat(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

class IndicatorService {
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes (as per dataIngestionService default)

  async calculateIndicators(symbol: Symbol): Promise<IndicatorResult> {
    try {
      // Try to get from cache first
      const cached = await this.getCachedIndicators(symbol.symbol);
      if (cached) {
        return cached;
      }

      // Calculate fresh indicators
      const result = await this.computeIndicators(symbol);
      
      // Cache the result
      await this.cacheIndicators(symbol.symbol, result);
      
      return result;
    } catch (error) {
      console.warn(`⚠️ Failed to calculate indicators for ${symbol.symbol}:`, error);
      
      // Graceful fallback: return nulls instead of crashing
      return {
        atr14: null,
        ema12: null,
        ema36: null,
        volume7d: null,
        volatility30d: null,
      };
    }
  }

  async calculateBatch(symbols: Symbol[]): Promise<Map<string, IndicatorResult>> {
    const results = new Map<string, IndicatorResult>();
    
    // Process in parallel with graceful fallbacks
    const promises = symbols.map(async (symbol) => {
      const indicators = await this.calculateIndicators(symbol);
      results.set(symbol.symbol, indicators);
    });
    
    await Promise.all(promises);
    return results;
  }

  private async getCachedIndicators(symbol: string): Promise<IndicatorResult | null> {
    try {
      // Use individual indicator getters
      const [atr14, ema12, ema36, volume7d, volatility30d] = await Promise.all([
        dataIngestionService.getIndicator(symbol, 'atr', 14),
        dataIngestionService.getIndicator(symbol, 'ema', 12),
        dataIngestionService.getIndicator(symbol, 'ema', 36),
        dataIngestionService.getIndicator(symbol, 'volume7d', 1),
        dataIngestionService.getIndicator(symbol, 'volatility30d', 1),
      ]);

      // If any indicator is missing, recalculate all
      if (!atr14 || !ema12 || !ema36 || !volume7d || !volatility30d) {
        return null;
      }

      return {
        atr14: parseFloat(atr14),
        ema12: parseFloat(ema12),
        ema36: parseFloat(ema36),
        volume7d: parseFloat(volume7d),
        volatility30d: parseFloat(volatility30d),
      };
    } catch (error) {
      console.warn(`⚠️ Cache read failed for ${symbol}:`, error);
      return null;
    }
  }

  private async cacheIndicators(symbol: string, indicators: IndicatorResult): Promise<void> {
    try {
      // Store each indicator separately
      const promises = [
        indicators.atr14 !== null ? dataIngestionService.setIndicator(symbol, 'atr', 14, indicators.atr14) : Promise.resolve(),
        indicators.ema12 !== null ? dataIngestionService.setIndicator(symbol, 'ema', 12, indicators.ema12) : Promise.resolve(),
        indicators.ema36 !== null ? dataIngestionService.setIndicator(symbol, 'ema', 36, indicators.ema36) : Promise.resolve(),
        indicators.volume7d !== null ? dataIngestionService.setIndicator(symbol, 'volume7d', 1, indicators.volume7d) : Promise.resolve(),
        indicators.volatility30d !== null ? dataIngestionService.setIndicator(symbol, 'volatility30d', 1, indicators.volatility30d) : Promise.resolve(),
      ];

      await Promise.all(promises);
    } catch (error) {
      console.warn(`⚠️ Cache write failed for ${symbol}:`, error);
    }
  }

  private async computeIndicators(symbol: Symbol): Promise<IndicatorResult> {
    try {
      // Get historical 1-minute bars (last 30 days for calculations)
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const bars = await storage.getBars1m(
        symbol.exchange_id,
        symbol.symbol,
        startTime,
        endTime,
        10000 // Max limit for 30 days of 1m data
      );

      // Graceful fallback: if insufficient data, return nulls
      // ATR14 needs 15 bars, EMA36 needs 36 bars
      if (bars.length < 37) {
        console.warn(`⚠️ Insufficient bars for ${symbol.symbol}: ${bars.length} (need 37+)`);
        return {
          atr14: null,
          ema12: null,
          ema36: null,
          volume7d: null,
          volatility30d: null,
        };
      }

      // Sort bars chronologically (oldest first)
      const sortedBars = bars.sort((a, b) => 
        new Date(a.bar_ts).getTime() - new Date(b.bar_ts).getTime()
      );

      // Parse and validate prices
      const closes = sortedBars.map(b => safeParseFloat(b.close));

      // Calculate indicators with proper validation
      const atr14 = this.calculateATR(sortedBars, 14);
      const ema12 = this.calculateEMA(closes, 12);
      const ema36 = this.calculateEMA(closes, 36);
      const volume7d = this.calculateVolume7d(sortedBars);
      const volatility30d = this.calculateVolatility(sortedBars);

      return {
        atr14,
        ema12,
        ema36,
        volume7d,
        volatility30d,
      };
    } catch (error) {
      console.error(`❌ Error computing indicators for ${symbol.symbol}:`, error);
      throw error;
    }
  }

  private calculateATR(bars: Bars1m[], period: number): number | null {
    if (bars.length < period + 1) return null;

    const trueRanges: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const high = safeParseFloat(bars[i].high);
      const low = safeParseFloat(bars[i].low);
      const prevClose = safeParseFloat(bars[i - 1].close);

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // Simple moving average of True Range for last `period` values
    const recentTRs = trueRanges.slice(-period);
    const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / period;

    return atr;
  }

  private calculateEMA(prices: number[], period: number): number | null {
    if (prices.length < period) return null;

    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;

    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }

    return ema;
  }

  private calculateVolume7d(bars: Bars1m[]): number | null {
    if (bars.length === 0) return null;

    // Get timestamp of last bar (most recent)
    const lastBarTime = new Date(bars[bars.length - 1].bar_ts);
    const sevenDaysAgo = new Date(lastBarTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Filter bars from last 7 days using bar timestamps
    const recentBars = bars.filter(b => new Date(b.bar_ts) >= sevenDaysAgo);

    if (recentBars.length === 0) return null;

    const totalVolume = recentBars.reduce((sum, bar) => sum + safeParseFloat(bar.volume), 0);
    return totalVolume;
  }

  private calculateVolatility(bars: Bars1m[]): number | null {
    if (bars.length < 2) return null;

    const returns: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const currentClose = safeParseFloat(bars[i].close);
      const prevClose = safeParseFloat(bars[i - 1].close);
      const logReturn = Math.log(currentClose / prevClose);
      returns.push(logReturn);
    }

    // Standard deviation of returns
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Annualized volatility (assuming 365 days)
    return volatility * Math.sqrt(365);
  }
}

export const indicatorService = new IndicatorService();
