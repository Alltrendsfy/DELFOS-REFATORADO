import { db } from '../../db';
import { vre_regime_parameters, VreRegimeParameters } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { VolatilityRegime } from './volatilityRegimeEngine';

export type CampaignProfile = 'C' | 'M' | 'A' | 'SA' | 'FULL';

export interface AdaptiveParameters {
  regime: VolatilityRegime;
  
  entryFilters: {
    minLiquidityPercentile: number;
    maxSpreadPct: number;
    maxSlippagePct: number;
    volumeFilterMultiplier: number;
    maxCorrelationLimit: number;
  };
  
  stopsAndTargets: {
    slAtrMultiplier: number;
    tp1AtrMultiplier: number;
    tp2AtrMultiplier: number;
    trailingAtrMultiplier: number;
    partialExit1Pct: number;
    partialExit2Pct: number;
  };
  
  positionSizing: {
    mSizeMultiplier: number;
    maxHeatPct: number;
  };
  
  tradeFrequency: {
    maxTradesPer6h: number;
    cooldownAfterLossMinutes: number;
    cooldownAfterWinMinutes: number;
  };
  
  pyramiding: {
    allowed: boolean;
    maxAdds: number;
    distanceAtr: number;
    sizeReductionPct: number;
  };
}

const DEFAULT_REGIME_PARAMETERS: Record<VolatilityRegime, Omit<AdaptiveParameters, 'regime'>> = {
  LOW: {
    entryFilters: {
      minLiquidityPercentile: 50,
      maxSpreadPct: 0.12,
      maxSlippagePct: 0.08,
      volumeFilterMultiplier: 0.9,
      maxCorrelationLimit: 0.75,
    },
    stopsAndTargets: {
      slAtrMultiplier: 0.90,
      tp1AtrMultiplier: 0.90,
      tp2AtrMultiplier: 1.50,
      trailingAtrMultiplier: 0.70,
      partialExit1Pct: 70,
      partialExit2Pct: 0,
    },
    positionSizing: {
      mSizeMultiplier: 0.80,
      maxHeatPct: 1.5,
    },
    tradeFrequency: {
      maxTradesPer6h: 2,
      cooldownAfterLossMinutes: 60,
      cooldownAfterWinMinutes: 15,
    },
    pyramiding: {
      allowed: false,
      maxAdds: 0,
      distanceAtr: 0,
      sizeReductionPct: 0,
    },
  },
  NORMAL: {
    entryFilters: {
      minLiquidityPercentile: 60,
      maxSpreadPct: 0.10,
      maxSlippagePct: 0.06,
      volumeFilterMultiplier: 1.0,
      maxCorrelationLimit: 0.70,
    },
    stopsAndTargets: {
      slAtrMultiplier: 1.10,
      tp1AtrMultiplier: 1.20,
      tp2AtrMultiplier: 2.00,
      trailingAtrMultiplier: 0.90,
      partialExit1Pct: 50,
      partialExit2Pct: 20,
    },
    positionSizing: {
      mSizeMultiplier: 1.00,
      maxHeatPct: 2.0,
    },
    tradeFrequency: {
      maxTradesPer6h: 3,
      cooldownAfterLossMinutes: 45,
      cooldownAfterWinMinutes: 10,
    },
    pyramiding: {
      allowed: false,
      maxAdds: 0,
      distanceAtr: 0,
      sizeReductionPct: 0,
    },
  },
  HIGH: {
    entryFilters: {
      minLiquidityPercentile: 70,
      maxSpreadPct: 0.08,
      maxSlippagePct: 0.05,
      volumeFilterMultiplier: 1.2,
      maxCorrelationLimit: 0.60,
    },
    stopsAndTargets: {
      slAtrMultiplier: 1.40,
      tp1AtrMultiplier: 1.80,
      tp2AtrMultiplier: 3.00,
      trailingAtrMultiplier: 1.10,
      partialExit1Pct: 35,
      partialExit2Pct: 25,
    },
    positionSizing: {
      mSizeMultiplier: 1.15,
      maxHeatPct: 2.5,
    },
    tradeFrequency: {
      maxTradesPer6h: 4,
      cooldownAfterLossMinutes: 30,
      cooldownAfterWinMinutes: 8,
    },
    pyramiding: {
      allowed: true,
      maxAdds: 1,
      distanceAtr: 1.0,
      sizeReductionPct: 40,
    },
  },
  EXTREME: {
    entryFilters: {
      minLiquidityPercentile: 80,
      maxSpreadPct: 0.06,
      maxSlippagePct: 0.04,
      volumeFilterMultiplier: 1.5,
      maxCorrelationLimit: 0.50,
    },
    stopsAndTargets: {
      slAtrMultiplier: 1.80,
      tp1AtrMultiplier: 2.40,
      tp2AtrMultiplier: 4.00,
      trailingAtrMultiplier: 1.40,
      partialExit1Pct: 25,
      partialExit2Pct: 20,
    },
    positionSizing: {
      mSizeMultiplier: 1.25,
      maxHeatPct: 3.0,
    },
    tradeFrequency: {
      maxTradesPer6h: 5,
      cooldownAfterLossMinutes: 20,
      cooldownAfterWinMinutes: 5,
    },
    pyramiding: {
      allowed: true,
      maxAdds: 2,
      distanceAtr: 0.8,
      sizeReductionPct: 35,
    },
  },
};

const PROFILE_REGIME_RESTRICTIONS: Record<CampaignProfile, {
  allowedRegimes: VolatilityRegime[];
  allowPyramiding: boolean;
  maxMSizeMultiplier: number;
}> = {
  C: {
    allowedRegimes: ['LOW', 'NORMAL'],
    allowPyramiding: false,
    maxMSizeMultiplier: 0.80,
  },
  M: {
    allowedRegimes: ['LOW', 'NORMAL', 'HIGH'],
    allowPyramiding: false,
    maxMSizeMultiplier: 1.00,
  },
  A: {
    allowedRegimes: ['LOW', 'NORMAL', 'HIGH', 'EXTREME'],
    allowPyramiding: false,
    maxMSizeMultiplier: 1.15,
  },
  SA: {
    allowedRegimes: ['LOW', 'NORMAL', 'HIGH', 'EXTREME'],
    allowPyramiding: true,
    maxMSizeMultiplier: 1.25,
  },
  FULL: {
    allowedRegimes: ['LOW', 'NORMAL', 'HIGH', 'EXTREME'],
    allowPyramiding: true,
    maxMSizeMultiplier: 1.25,
  },
};

export class AdaptiveParameterService {
  private static instance: AdaptiveParameterService;
  private parametersCache: Map<VolatilityRegime, AdaptiveParameters> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  private constructor() {}

  static getInstance(): AdaptiveParameterService {
    if (!AdaptiveParameterService.instance) {
      AdaptiveParameterService.instance = new AdaptiveParameterService();
    }
    return AdaptiveParameterService.instance;
  }

  async getParametersForRegime(regime: VolatilityRegime): Promise<AdaptiveParameters> {
    if (Date.now() < this.cacheExpiry && this.parametersCache.has(regime)) {
      return this.parametersCache.get(regime)!;
    }

    try {
      const dbParams = await db.select()
        .from(vre_regime_parameters)
        .where(and(
          eq(vre_regime_parameters.regime, regime),
          eq(vre_regime_parameters.is_default, true)
        ))
        .limit(1);

      if (dbParams.length > 0) {
        const params = this.mapDbToAdaptiveParams(dbParams[0]);
        this.parametersCache.set(regime, params);
        this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;
        return params;
      }
    } catch (error) {
      console.error(`[AdaptiveParams] DB error for ${regime}, using defaults:`, error);
    }

    const defaults = DEFAULT_REGIME_PARAMETERS[regime];
    const params: AdaptiveParameters = {
      regime,
      ...defaults,
    };
    this.parametersCache.set(regime, params);
    return params;
  }

  async getParametersForCampaign(
    regime: VolatilityRegime,
    profile: CampaignProfile
  ): Promise<AdaptiveParameters> {
    const baseParams = await this.getParametersForRegime(regime);
    const restrictions = PROFILE_REGIME_RESTRICTIONS[profile];

    if (!restrictions.allowedRegimes.includes(regime)) {
      const fallbackRegime = this.getFallbackRegime(regime, restrictions.allowedRegimes);
      console.log(`[AdaptiveParams] Profile ${profile} doesn't allow ${regime}, falling back to ${fallbackRegime}`);
      return this.getParametersForCampaign(fallbackRegime, profile);
    }

    const clampedParams: AdaptiveParameters = {
      ...baseParams,
      positionSizing: {
        ...baseParams.positionSizing,
        mSizeMultiplier: Math.min(baseParams.positionSizing.mSizeMultiplier, restrictions.maxMSizeMultiplier),
      },
      pyramiding: restrictions.allowPyramiding 
        ? baseParams.pyramiding 
        : { allowed: false, maxAdds: 0, distanceAtr: 0, sizeReductionPct: 0 },
    };

    return clampedParams;
  }

  private getFallbackRegime(current: VolatilityRegime, allowed: VolatilityRegime[]): VolatilityRegime {
    const order: VolatilityRegime[] = ['LOW', 'NORMAL', 'HIGH', 'EXTREME'];
    const currentIdx = order.indexOf(current);
    
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (allowed.includes(order[i])) {
        return order[i];
      }
    }
    
    return allowed[allowed.length - 1] || 'NORMAL';
  }

  isRegimeAllowedForProfile(regime: VolatilityRegime, profile: CampaignProfile): boolean {
    return PROFILE_REGIME_RESTRICTIONS[profile].allowedRegimes.includes(regime);
  }

  getProfileRestrictions(profile: CampaignProfile) {
    return PROFILE_REGIME_RESTRICTIONS[profile];
  }

  private mapDbToAdaptiveParams(dbRow: VreRegimeParameters): AdaptiveParameters {
    return {
      regime: dbRow.regime as VolatilityRegime,
      entryFilters: {
        minLiquidityPercentile: parseFloat(dbRow.min_liquidity_percentile) || 50,
        maxSpreadPct: parseFloat(dbRow.max_spread_pct) || 0.10,
        maxSlippagePct: parseFloat(dbRow.max_slippage_pct) || 0.06,
        volumeFilterMultiplier: parseFloat(dbRow.volume_filter_multiplier || '1.0'),
        maxCorrelationLimit: parseFloat(dbRow.max_correlation_limit || '0.70'),
      },
      stopsAndTargets: {
        slAtrMultiplier: parseFloat(dbRow.sl_atr_multiplier) || 1.10,
        tp1AtrMultiplier: parseFloat(dbRow.tp1_atr_multiplier) || 1.20,
        tp2AtrMultiplier: parseFloat(dbRow.tp2_atr_multiplier) || 2.00,
        trailingAtrMultiplier: parseFloat(dbRow.trailing_atr_multiplier || '0.90'),
        partialExit1Pct: dbRow.partial_exit_1_pct || 50,
        partialExit2Pct: dbRow.partial_exit_2_pct || 20,
      },
      positionSizing: {
        mSizeMultiplier: parseFloat(dbRow.m_size_multiplier) || 1.00,
        maxHeatPct: parseFloat(dbRow.max_heat_pct) || 2.0,
      },
      tradeFrequency: {
        maxTradesPer6h: dbRow.max_trades_per_6h || 3,
        cooldownAfterLossMinutes: dbRow.cooldown_after_loss_minutes || 45,
        cooldownAfterWinMinutes: dbRow.cooldown_after_win_minutes || 10,
      },
      pyramiding: {
        allowed: dbRow.pyramiding_allowed || false,
        maxAdds: dbRow.max_pyramid_adds || 0,
        distanceAtr: parseFloat(dbRow.pyramid_distance_atr || '0'),
        sizeReductionPct: dbRow.pyramid_size_reduction_pct || 0,
      },
    };
  }

  async seedDefaultParameters(): Promise<void> {
    const existing = await db.select().from(vre_regime_parameters).limit(1);
    if (existing.length > 0) {
      console.log('[AdaptiveParams] Default parameters already exist, skipping seed');
      return;
    }

    console.log('[AdaptiveParams] Seeding default regime parameters...');

    for (const regime of ['LOW', 'NORMAL', 'HIGH', 'EXTREME'] as VolatilityRegime[]) {
      const defaults = DEFAULT_REGIME_PARAMETERS[regime];
      
      await db.insert(vre_regime_parameters).values({
        regime,
        min_liquidity_percentile: defaults.entryFilters.minLiquidityPercentile.toString(),
        max_spread_pct: defaults.entryFilters.maxSpreadPct.toString(),
        max_slippage_pct: defaults.entryFilters.maxSlippagePct.toString(),
        volume_filter_multiplier: defaults.entryFilters.volumeFilterMultiplier.toString(),
        max_correlation_limit: defaults.entryFilters.maxCorrelationLimit.toString(),
        sl_atr_multiplier: defaults.stopsAndTargets.slAtrMultiplier.toString(),
        tp1_atr_multiplier: defaults.stopsAndTargets.tp1AtrMultiplier.toString(),
        tp2_atr_multiplier: defaults.stopsAndTargets.tp2AtrMultiplier.toString(),
        trailing_atr_multiplier: defaults.stopsAndTargets.trailingAtrMultiplier.toString(),
        partial_exit_1_pct: defaults.stopsAndTargets.partialExit1Pct,
        partial_exit_2_pct: defaults.stopsAndTargets.partialExit2Pct,
        m_size_multiplier: defaults.positionSizing.mSizeMultiplier.toString(),
        max_heat_pct: defaults.positionSizing.maxHeatPct.toString(),
        max_trades_per_6h: defaults.tradeFrequency.maxTradesPer6h,
        cooldown_after_loss_minutes: defaults.tradeFrequency.cooldownAfterLossMinutes,
        cooldown_after_win_minutes: defaults.tradeFrequency.cooldownAfterWinMinutes,
        pyramiding_allowed: defaults.pyramiding.allowed,
        max_pyramid_adds: defaults.pyramiding.maxAdds,
        pyramid_distance_atr: defaults.pyramiding.distanceAtr.toString(),
        pyramid_size_reduction_pct: defaults.pyramiding.sizeReductionPct,
        is_default: true,
      });
    }

    console.log('[AdaptiveParams] Default parameters seeded successfully');
  }

  clearCache(): void {
    this.parametersCache.clear();
    this.cacheExpiry = 0;
  }

  getDefaultParameters(): typeof DEFAULT_REGIME_PARAMETERS {
    return DEFAULT_REGIME_PARAMETERS;
  }
}

export const adaptiveParameterService = AdaptiveParameterService.getInstance();
