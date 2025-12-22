export type VolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

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

export const DEFAULT_VRE_CONFIG: VREConfig = {
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

export interface SymbolContext {
  pending_regime: VolatilityRegime | null;
  confirmations: number;
  current_regime: VolatilityRegime;
  cycles_in_regime: number;
  cooldown_remaining: number;
  last_regime_change: Date;
}

export function createDefaultContext(): SymbolContext {
  return {
    pending_regime: null,
    confirmations: 0,
    current_regime: 'NORMAL',
    cycles_in_regime: 0,
    cooldown_remaining: 0,
    last_regime_change: new Date(),
  };
}

export function calculateLogReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  return returns;
}

export function calculateRealizedVolatility(logReturns: number[], window: number): number {
  if (logReturns.length < window) {
    return 0;
  }
  const slice = logReturns.slice(-window);
  const sumSquared = slice.reduce((sum, r) => sum + r * r, 0);
  return Math.sqrt(sumSquared / window);
}

export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function calculateStd(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

export function classifyRegime(
  zScore: number,
  rvRatio: number,
  method: 'z_score' | 'rv_ratio',
  config: VREConfig = DEFAULT_VRE_CONFIG
): VolatilityRegime {
  if (method === 'z_score') {
    const { z_thresholds } = config;
    if (zScore < z_thresholds.low_normal) return 'LOW';
    if (zScore < z_thresholds.normal_high) return 'NORMAL';
    if (zScore < z_thresholds.high_extreme) return 'HIGH';
    return 'EXTREME';
  } else {
    const { rv_ratio_fallback } = config;
    if (rvRatio < rv_ratio_fallback.low) return 'LOW';
    if (rvRatio < rv_ratio_fallback.high) return 'NORMAL';
    if (rvRatio < rv_ratio_fallback.extreme) return 'HIGH';
    return 'EXTREME';
  }
}

export function isWithinHysteresisBand(
  currentRegime: VolatilityRegime,
  rawRegime: VolatilityRegime,
  zScore: number,
  config: VREConfig = DEFAULT_VRE_CONFIG
): boolean {
  const { z_thresholds, z_exit_thresholds } = config;

  const regimeOrder: VolatilityRegime[] = ['LOW', 'NORMAL', 'HIGH', 'EXTREME'];
  const currentIdx = regimeOrder.indexOf(currentRegime);
  const rawIdx = regimeOrder.indexOf(rawRegime);

  if (Math.abs(currentIdx - rawIdx) !== 1) {
    return false;
  }

  if (currentRegime === 'EXTREME' && rawRegime === 'HIGH') {
    return zScore > z_exit_thresholds.extreme_to_high;
  }
  if (currentRegime === 'HIGH' && rawRegime === 'EXTREME') {
    return zScore < z_thresholds.high_extreme;
  }
  if (currentRegime === 'HIGH' && rawRegime === 'NORMAL') {
    return zScore > z_exit_thresholds.high_to_normal;
  }
  if (currentRegime === 'NORMAL' && rawRegime === 'HIGH') {
    return zScore < z_thresholds.normal_high;
  }
  if (currentRegime === 'NORMAL' && rawRegime === 'LOW') {
    return zScore > z_exit_thresholds.normal_to_low;
  }
  if (currentRegime === 'LOW' && rawRegime === 'NORMAL') {
    return zScore <= z_exit_thresholds.normal_to_low;
  }

  return false;
}

export function applyHysteresisAndCooldown(
  context: SymbolContext,
  rawRegime: VolatilityRegime,
  zScore: number,
  config: VREConfig = DEFAULT_VRE_CONFIG
): {
  finalRegime: VolatilityRegime;
  regimeChanged: boolean;
  blockedByCooldown: boolean;
  blockedByHysteresis: boolean;
  confirmationsCount: number;
} {
  context.cycles_in_regime++;

  if (context.cooldown_remaining > 0) {
    context.cooldown_remaining--;
    return {
      finalRegime: context.current_regime,
      regimeChanged: false,
      blockedByCooldown: true,
      blockedByHysteresis: false,
      confirmationsCount: 0,
    };
  }

  if (rawRegime === context.current_regime) {
    context.pending_regime = null;
    context.confirmations = 0;
    return {
      finalRegime: context.current_regime,
      regimeChanged: false,
      blockedByCooldown: false,
      blockedByHysteresis: false,
      confirmationsCount: 0,
    };
  }

  const withinHysteresis = isWithinHysteresisBand(context.current_regime, rawRegime, zScore, config);
  
  if (withinHysteresis) {
    return {
      finalRegime: context.current_regime,
      regimeChanged: false,
      blockedByCooldown: false,
      blockedByHysteresis: true,
      confirmationsCount: context.confirmations,
    };
  }

  if (context.pending_regime === rawRegime) {
    context.confirmations++;
  } else {
    context.pending_regime = rawRegime;
    context.confirmations = 1;
  }

  if (context.confirmations >= config.K_confirmations) {
    context.current_regime = rawRegime;
    context.pending_regime = null;
    context.confirmations = 0;
    context.cooldown_remaining = config.cooldown_cycles;
    context.cycles_in_regime = 0;
    context.last_regime_change = new Date();

    return {
      finalRegime: rawRegime,
      regimeChanged: true,
      blockedByCooldown: false,
      blockedByHysteresis: false,
      confirmationsCount: config.K_confirmations,
    };
  }

  return {
    finalRegime: context.current_regime,
    regimeChanged: false,
    blockedByCooldown: false,
    blockedByHysteresis: false,
    confirmationsCount: context.confirmations,
  };
}

export function isExtremeSpike(zScore: number): boolean {
  return zScore > 2.75;
}

export function getRegimePermissions(
  regime: VolatilityRegime,
  investorProfile: string
): {
  trading_allowed: boolean;
  pyramiding_allowed: boolean;
  max_position_multiplier: number;
} {
  const profileUpper = investorProfile.toUpperCase();
  
  if (profileUpper === 'C') {
    return {
      trading_allowed: regime === 'LOW' || regime === 'NORMAL',
      pyramiding_allowed: false,
      max_position_multiplier: 0.80,
    };
  }
  
  if (profileUpper === 'M') {
    return {
      trading_allowed: regime !== 'EXTREME',
      pyramiding_allowed: false,
      max_position_multiplier: regime === 'HIGH' ? 1.00 : 0.90,
    };
  }
  
  if (profileUpper === 'A') {
    return {
      trading_allowed: true,
      pyramiding_allowed: false,
      max_position_multiplier: regime === 'EXTREME' ? 1.10 : 1.00,
    };
  }
  
  if (profileUpper === 'SA') {
    return {
      trading_allowed: true,
      pyramiding_allowed: regime === 'HIGH' || regime === 'EXTREME',
      max_position_multiplier: regime === 'EXTREME' ? 1.25 : 1.10,
    };
  }
  
  if (profileUpper === 'FULL') {
    return {
      trading_allowed: true,
      pyramiding_allowed: regime === 'HIGH' || regime === 'EXTREME',
      max_position_multiplier: 1.25,
    };
  }

  return {
    trading_allowed: regime !== 'EXTREME',
    pyramiding_allowed: false,
    max_position_multiplier: 1.00,
  };
}

export const SPREAD_LIMITS: Record<VolatilityRegime, number> = {
  LOW: 0.0012,
  NORMAL: 0.0010,
  HIGH: 0.0008,
  EXTREME: 0.0006,
};

export const SLIPPAGE_LIMITS: Record<VolatilityRegime, number> = {
  LOW: 0.0008,
  NORMAL: 0.0006,
  HIGH: 0.0005,
  EXTREME: 0.0004,
};

export function checkSpreadLimit(regime: VolatilityRegime, spread: number): boolean {
  return spread <= SPREAD_LIMITS[regime];
}

export function checkSlippageLimit(regime: VolatilityRegime, slippage: number): boolean {
  return slippage <= SLIPPAGE_LIMITS[regime];
}

export function checkEntryAllowed(
  regime: VolatilityRegime,
  spread: number,
  slippage: number
): { allowed: boolean; reason?: string } {
  if (!checkSpreadLimit(regime, spread)) {
    return { allowed: false, reason: 'spread_exceeded' };
  }
  if (!checkSlippageLimit(regime, slippage)) {
    return { allowed: false, reason: 'slippage_exceeded' };
  }
  return { allowed: true };
}
