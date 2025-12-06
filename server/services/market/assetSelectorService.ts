import { storage } from "../../storage";
import { indicatorService } from "./indicatorService";
import type { Symbol, InsertSymbolRanking } from "@shared/schema";
import { nanoid } from "nanoid";

interface TradabilityFilters {
  minVolume24hUSD: number;
  minRealVolumeRatio?: number; // Optional: minimum real vs fake volume ratio (0.0-1.0)
  maxSpreadPct: number;
  minDepthUSD: number;
  minATRPct: number;
}

interface RankingFactors {
  volumeWeight: number;
  volatilityWeight: number;
  momentumWeight: number;
  trendWeight: number;
}

interface RankedSymbol {
  symbol: Symbol;
  score: number;
  rank: number;
  factors: {
    volumeZ: number;
    volatilityNorm: number;
    momentum24h: number;
    trendStrength: number;
  };
}

// SPRINT 4: Thresholds aligned with project matrix (v1.0)
// Updated based on real market data analysis (Nov 2025)
// Testing phase: adjusted to select ~30 tradable pairs
const DEFAULT_FILTERS: TradabilityFilters = {
  minVolume24hUSD: 5_000_000, // $5MM minimum daily volume (adjusted for testing phase)
  minRealVolumeRatio: 0.70, // 70% minimum real volume ratio to filter fake volume
  maxSpreadPct: 0.10, // 10% max spread (realistic for crypto markets - BTC: 1.5%, avg: 9%)
  minDepthUSD: 100_000, // $100k minimum order book depth (adjusted for testing phase)
  minATRPct: 0.01, // 1% minimum daily ATR
};

const DEFAULT_WEIGHTS: RankingFactors = {
  volumeWeight: 0.3,
  volatilityWeight: 0.25,
  momentumWeight: 0.25,
  trendWeight: 0.2,
};

class AssetSelectorService {
  async runSelection(
    topN: number = 100,
    filters: Partial<TradabilityFilters> = {},
    weights: Partial<RankingFactors> = {}
  ): Promise<{
    runId: string;
    selected: RankedSymbol[];
    rejected: number;
  }> {
    const runId = nanoid();
    console.log(`🔍 Starting asset selection run ${runId}...`);

    // Step 1: Get all symbols from storage
    const allSymbols = await storage.getAllSymbols();
    console.log(`📊 Found ${allSymbols.length} total symbols`);

    // Step 2: Apply tradability filters
    const finalFilters = { ...DEFAULT_FILTERS, ...filters };
    const tradable = this.filterTradable(allSymbols, finalFilters);
    console.log(`✅ ${tradable.length} symbols passed tradability filters`);

    // Step 3: Calculate indicators for tradable symbols
    const withIndicators = await this.enrichWithIndicators(tradable);
    console.log(`📈 Calculated indicators for ${withIndicators.length} symbols`);

    // Step 4: Calculate multi-factor scores
    const finalWeights = { ...DEFAULT_WEIGHTS, ...weights };
    const ranked = this.calculateRankings(withIndicators, finalWeights);
    console.log(`🏆 Ranked ${ranked.length} symbols by multi-factor score`);

    // Step 5: Select top N
    const selected = ranked.slice(0, topN);
    console.log(`✨ Selected top ${selected.length} symbols`);

    // Step 6: Persist rankings to database
    await this.persistRankings(runId, selected);
    console.log(`💾 Persisted ${selected.length} rankings to database`);

    return {
      runId,
      selected,
      rejected: allSymbols.length - selected.length,
    };
  }

  private filterTradable(
    symbols: Symbol[],
    filters: TradabilityFilters
  ): Symbol[] {
    console.log(`🔍 Applying tradability filters:`, {
      minVolume24hUSD: filters.minVolume24hUSD,
      minRealVolumeRatio: filters.minRealVolumeRatio,
      maxSpreadPct: filters.maxSpreadPct,
      minDepthUSD: filters.minDepthUSD,
      minATRPct: filters.minATRPct,
    });

    const results = symbols.filter(symbol => {
      // Volume filter (required) - explicit null/undefined check
      if (symbol.volume_24h_usd === null || symbol.volume_24h_usd === undefined) return false;
      const volume = parseFloat(symbol.volume_24h_usd);
      if (isNaN(volume) || volume < filters.minVolume24hUSD) return false;

      // Real volume ratio filter (optional) - filter out fake volume
      if (filters.minRealVolumeRatio !== undefined) {
        // Only apply filter if symbol has real_volume_ratio data
        if (symbol.real_volume_ratio !== null && symbol.real_volume_ratio !== undefined) {
          const realVolumeRatio = parseFloat(symbol.real_volume_ratio);
          if (!isNaN(realVolumeRatio) && realVolumeRatio < filters.minRealVolumeRatio) {
            return false; // Reject symbols with too much fake volume
          }
        }
        // Note: If real_volume_ratio is NULL, we allow the symbol through
        // This ensures backward compatibility during backfill
      }

      // Spread filter (required) - explicit null/undefined check
      if (symbol.spread_mid_pct === null || symbol.spread_mid_pct === undefined) return false;
      const spread = parseFloat(symbol.spread_mid_pct);
      if (isNaN(spread) || spread > filters.maxSpreadPct) return false;

      // Depth filter (required) - explicit null/undefined check
      if (symbol.depth_top10_usd === null || symbol.depth_top10_usd === undefined) return false;
      const depth = parseFloat(symbol.depth_top10_usd);
      if (isNaN(depth) || depth < filters.minDepthUSD) return false;

      // ATR filter (required) - explicit null/undefined check
      if (symbol.atr_daily_pct === null || symbol.atr_daily_pct === undefined) return false;
      const atr = parseFloat(symbol.atr_daily_pct);
      if (isNaN(atr) || atr < filters.minATRPct) return false;

      return true;
    });

    console.log(`✅ ${results.length}/${symbols.length} symbols passed all filters`);
    return results;
  }

  private async enrichWithIndicators(
    symbols: Symbol[]
  ): Promise<Array<{ symbol: Symbol; indicators: any }>> {
    const results: { symbol: Symbol; indicators: any }[] = [];

    // Calculate indicators in parallel with graceful error handling
    const promises = symbols.map(async symbol => {
      try {
        const indicators = await indicatorService.calculateIndicators(symbol);
        
        // Accept symbols even without complete indicators
        // If EMAs are missing, use fallback values based on cached ATR
        const fallbackIndicators = {
          ema12: indicators.ema12 ?? parseFloat(symbol.atr_daily_pct || "2.0"), // Use ATR as fallback
          ema36: indicators.ema36 ?? parseFloat(symbol.atr_daily_pct || "2.0") * 0.8, // Slightly lower for EMA36
          volatility30d: indicators.volatility30d ?? parseFloat(symbol.atr_daily_pct || "0") * 0.5,
          atr14: indicators.atr14 ?? parseFloat(symbol.atr_daily_pct || "0"),
          rsi14: 50, // Default to neutral RSI when not available
          momentum24h: 0, // Default to zero momentum when not available
        };
        
        results.push({ symbol, indicators: fallbackIndicators });
        
        if (indicators.ema12 === null || indicators.ema36 === null) {
          console.warn(`⚠️ Using fallback indicators for ${symbol.symbol} (no Redis data)`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to calculate indicators for ${symbol.symbol}:`, error);
        // Use pure fallback based on cached metrics
        const fallbackIndicators = {
          ema12: parseFloat(symbol.atr_daily_pct || "2.0"),
          ema36: parseFloat(symbol.atr_daily_pct || "2.0") * 0.8,
          volatility30d: parseFloat(symbol.atr_daily_pct || "0") * 0.5,
          atr14: parseFloat(symbol.atr_daily_pct || "0"),
          rsi14: 50,
          momentum24h: 0,
        };
        results.push({ symbol, indicators: fallbackIndicators });
      }
    });

    await Promise.all(promises);
    return results;
  }

  private calculateRankings(
    symbolsWithIndicators: Array<{ symbol: Symbol; indicators: any }>,
    weights: RankingFactors
  ): RankedSymbol[] {
    if (symbolsWithIndicators.length === 0) {
      return [];
    }

    // Extract values for normalization with NaN validation
    // Use fallback defaults for missing indicator data
    const volumes = symbolsWithIndicators.map(s => {
      const vol = parseFloat(s.symbol.volume_24h_usd || "0");
      return isNaN(vol) ? 0 : vol;
    });
    const volatilities = symbolsWithIndicators.map(s => {
      const vol = s.indicators.volatility30d;
      // Fallback to 0 if volatility is missing
      return (vol !== null && !isNaN(vol)) ? vol : 0;
    });
    const atrs = symbolsWithIndicators.map(s => {
      const atr = s.indicators.atr14;
      // Fallback to 0 if ATR is missing
      return (atr !== null && !isNaN(atr)) ? atr : 0;
    });

    // Calculate z-scores and normalized values
    const volumeMean = this.mean(volumes);
    const volumeStd = this.stdDev(volumes);
    const volMean = this.mean(volatilities);
    const volStd = this.stdDev(volatilities);

    const ranked = symbolsWithIndicators.map((item, index) => {
      const { symbol, indicators } = item;

      // Volume z-score (higher is better)
      const volumeZ = volumeStd > 0 
        ? (volumes[index] - volumeMean) / volumeStd 
        : 0;

      // Volatility normalized (higher is better for day trading)
      const volatilityNorm = volStd > 0 
        ? (volatilities[index] - volMean) / volStd 
        : 0;

      // Momentum: 24h price change (calculated from EMA trend)
      // Guard against division by zero and NaN
      let momentum24h = 0;
      if (indicators.ema12 !== null && indicators.ema36 !== null && 
          Math.abs(indicators.ema36) > 0.0001) { // Avoid near-zero division
        momentum24h = (indicators.ema12 - indicators.ema36) / indicators.ema36;
        if (isNaN(momentum24h) || !isFinite(momentum24h)) {
          momentum24h = 0;
        }
      }

      // Trend strength: EMA12 vs EMA36 distance
      // Guard against division by zero and NaN
      let trendStrength = 0;
      if (indicators.ema12 !== null && indicators.ema36 !== null && 
          Math.abs(indicators.ema36) > 0.0001) { // Avoid near-zero division
        trendStrength = Math.abs((indicators.ema12 - indicators.ema36) / indicators.ema36);
        if (isNaN(trendStrength) || !isFinite(trendStrength)) {
          trendStrength = 0;
        }
      }

      // Calculate weighted score with final NaN guard
      let score = 
        volumeZ * weights.volumeWeight +
        volatilityNorm * weights.volatilityWeight +
        momentum24h * weights.momentumWeight +
        trendStrength * weights.trendWeight;
      
      // Final safety: if score is NaN or Infinity, default to 0
      if (isNaN(score) || !isFinite(score)) {
        console.warn(`⚠️ Invalid score for ${symbol.symbol}, defaulting to 0`);
        score = 0;
      }

      return {
        symbol,
        score,
        rank: 0, // Will be assigned after sorting
        factors: {
          volumeZ,
          volatilityNorm,
          momentum24h,
          trendStrength,
        },
      };
    });

    // Sort by score (descending) and assign ranks
    ranked.sort((a, b) => b.score - a.score);
    ranked.forEach((item, index) => {
      item.rank = index + 1;
    });

    return ranked;
  }

  private async persistRankings(
    runId: string,
    ranked: RankedSymbol[]
  ): Promise<void> {
    const promises = ranked.map(item => {
      const ranking: InsertSymbolRanking = {
        symbol_id: item.symbol.id,
        run_id: runId,
        rank: item.rank,
        score: item.score.toString(), // Schema expects string (decimal type)
        cluster_number: null, // Will be assigned by ClusterService
      };

      return storage.createRanking(ranking);
    });

    await Promise.all(promises);
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

export const assetSelectorService = new AssetSelectorService();
