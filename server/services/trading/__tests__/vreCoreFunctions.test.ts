import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateLogReturns,
  calculateRealizedVolatility,
  calculateMean,
  calculateStd,
  classifyRegime,
  isWithinHysteresisBand,
  applyHysteresisAndCooldown,
  createDefaultContext,
  isExtremeSpike,
  getRegimePermissions,
  checkSpreadLimit,
  checkSlippageLimit,
  checkEntryAllowed,
  SPREAD_LIMITS,
  SLIPPAGE_LIMITS,
  DEFAULT_VRE_CONFIG,
  type SymbolContext,
  type VolatilityRegime,
} from '../vreCoreFunctions';

const DETERMINISTIC_PRICES = [
  100.00, 100.50, 99.80, 100.20, 100.10, 
  101.00, 100.70, 100.90, 101.50, 101.20,
  102.00, 101.80, 102.50, 102.30, 103.00,
  102.80, 103.20, 103.50, 103.00, 104.00,
];

describe('VRE Phase 5 - Core Functions QA Tests', () => {
  describe('1. Flip-Flop Prevention (Hysteresis + Cooldown)', () => {
    let context: SymbolContext;

    beforeEach(() => {
      context = createDefaultContext();
    });

    it('should require K=3 confirmations before regime change', () => {
      expect(DEFAULT_VRE_CONFIG.K_confirmations).toBe(3);

      const r1 = applyHysteresisAndCooldown(context, 'HIGH', 1.0);
      expect(r1.regimeChanged).toBe(false);
      expect(r1.confirmationsCount).toBe(1);
      expect(r1.finalRegime).toBe('NORMAL');

      const r2 = applyHysteresisAndCooldown(context, 'HIGH', 1.0);
      expect(r2.regimeChanged).toBe(false);
      expect(r2.confirmationsCount).toBe(2);
      expect(r2.finalRegime).toBe('NORMAL');

      const r3 = applyHysteresisAndCooldown(context, 'HIGH', 1.0);
      expect(r3.regimeChanged).toBe(true);
      expect(r3.confirmationsCount).toBe(3);
      expect(r3.finalRegime).toBe('HIGH');
    });

    it('should reset confirmations when different regime detected mid-sequence', () => {
      applyHysteresisAndCooldown(context, 'HIGH', 1.0);
      applyHysteresisAndCooldown(context, 'HIGH', 1.0);
      expect(context.confirmations).toBe(2);

      applyHysteresisAndCooldown(context, 'LOW', -1.0);
      expect(context.pending_regime).toBe('LOW');
      expect(context.confirmations).toBe(1);
    });

    it('should apply 8-cycle cooldown after regime change', () => {
      expect(DEFAULT_VRE_CONFIG.cooldown_cycles).toBe(8);

      for (let i = 0; i < 3; i++) {
        applyHysteresisAndCooldown(context, 'HIGH', 1.0);
      }
      expect(context.current_regime).toBe('HIGH');
      expect(context.cooldown_remaining).toBe(8);

      const blocked = applyHysteresisAndCooldown(context, 'EXTREME', 2.0);
      expect(blocked.blockedByCooldown).toBe(true);
      expect(blocked.regimeChanged).toBe(false);
      expect(blocked.finalRegime).toBe('HIGH');
      expect(context.cooldown_remaining).toBe(7);
    });

    it('should decrement cooldown each cycle until zero', () => {
      for (let i = 0; i < 3; i++) {
        applyHysteresisAndCooldown(context, 'HIGH', 1.0);
      }
      expect(context.cooldown_remaining).toBe(8);

      for (let cycle = 1; cycle <= 8; cycle++) {
        const r = applyHysteresisAndCooldown(context, 'EXTREME', 2.0);
        expect(r.blockedByCooldown).toBe(true);
        expect(context.cooldown_remaining).toBe(8 - cycle);
      }

      expect(context.cooldown_remaining).toBe(0);

      const afterCooldown = applyHysteresisAndCooldown(context, 'EXTREME', 2.0);
      expect(afterCooldown.blockedByCooldown).toBe(false);
    });

    it('should block EXTREME->HIGH transition when Z >= 1.40 (hysteresis)', () => {
      context.current_regime = 'EXTREME';
      context.cooldown_remaining = 0;

      const blocked = applyHysteresisAndCooldown(context, 'HIGH', 1.60);
      expect(blocked.blockedByHysteresis).toBe(true);
      expect(blocked.finalRegime).toBe('EXTREME');
    });

    it('should allow EXTREME->HIGH transition when Z < 1.40', () => {
      context.current_regime = 'EXTREME';
      context.cooldown_remaining = 0;

      const allowed = applyHysteresisAndCooldown(context, 'HIGH', 1.30);
      expect(allowed.blockedByHysteresis).toBe(false);
      expect(allowed.confirmationsCount).toBe(1);
    });

    it('should block HIGH->NORMAL transition when Z >= 0.55 (hysteresis)', () => {
      context.current_regime = 'HIGH';
      context.cooldown_remaining = 0;

      const blocked = applyHysteresisAndCooldown(context, 'NORMAL', 0.60);
      expect(blocked.blockedByHysteresis).toBe(true);
      expect(blocked.finalRegime).toBe('HIGH');
    });

    it('should allow HIGH->NORMAL transition when Z < 0.55', () => {
      context.current_regime = 'HIGH';
      context.cooldown_remaining = 0;

      const allowed = applyHysteresisAndCooldown(context, 'NORMAL', 0.40);
      expect(allowed.blockedByHysteresis).toBe(false);
    });

    it('should block LOW->NORMAL transition when Z <= -0.55 (hysteresis)', () => {
      context.current_regime = 'LOW';
      context.cooldown_remaining = 0;

      const blocked = applyHysteresisAndCooldown(context, 'NORMAL', -0.60);
      expect(blocked.blockedByHysteresis).toBe(true);
      expect(blocked.finalRegime).toBe('LOW');
    });

    it('should allow LOW->NORMAL transition when Z > -0.55', () => {
      context.current_regime = 'LOW';
      context.cooldown_remaining = 0;

      const allowed = applyHysteresisAndCooldown(context, 'NORMAL', -0.40);
      expect(allowed.blockedByHysteresis).toBe(false);
    });
  });

  describe('2. Deterministic Replay', () => {
    it('should calculate identical log returns from same price data', () => {
      const returns1 = calculateLogReturns(DETERMINISTIC_PRICES);
      const returns2 = calculateLogReturns(DETERMINISTIC_PRICES);

      expect(returns1).toEqual(returns2);
      expect(returns1.length).toBe(DETERMINISTIC_PRICES.length - 1);
    });

    it('should calculate log returns correctly', () => {
      const prices = [100, 110]; // 10% increase
      const returns = calculateLogReturns(prices);
      expect(returns[0]).toBeCloseTo(Math.log(110 / 100), 10);
    });

    it('should calculate realized volatility deterministically', () => {
      const returns = calculateLogReturns(DETERMINISTIC_PRICES);
      const rv1 = calculateRealizedVolatility(returns, returns.length);
      const rv2 = calculateRealizedVolatility(returns, returns.length);

      expect(rv1).toBe(rv2);
      expect(rv1).toBeGreaterThan(0);
    });

    it('should classify same z-score to same regime consistently', () => {
      const testCases: Array<{ z: number; expected: VolatilityRegime }> = [
        { z: -1.0, expected: 'LOW' },
        { z: -0.76, expected: 'LOW' },
        { z: -0.75, expected: 'NORMAL' },
        { z: 0.0, expected: 'NORMAL' },
        { z: 0.74, expected: 'NORMAL' },
        { z: 0.75, expected: 'HIGH' },
        { z: 1.0, expected: 'HIGH' },
        { z: 1.74, expected: 'HIGH' },
        { z: 1.75, expected: 'EXTREME' },
        { z: 2.0, expected: 'EXTREME' },
      ];

      for (const { z, expected } of testCases) {
        const result1 = classifyRegime(z, 1.0, 'z_score');
        const result2 = classifyRegime(z, 1.0, 'z_score');
        expect(result1).toBe(expected);
        expect(result2).toBe(expected);
      }
    });

    it('should produce identical regime sequence from same z-score data', () => {
      const zScores = [0.0, 0.5, 0.8, 0.9, 1.0, 1.2, 1.8, 2.0, 1.5, 1.0];

      const simulate = (scores: number[]): VolatilityRegime[] => {
        const ctx = createDefaultContext();
        return scores.map(z => {
          const raw = classifyRegime(z, 1.0, 'z_score');
          const result = applyHysteresisAndCooldown(ctx, raw, z);
          return result.finalRegime;
        });
      };

      const sequence1 = simulate(zScores);
      const sequence2 = simulate(zScores);

      expect(sequence1).toEqual(sequence2);
    });

    it('should use rv_ratio fallback correctly', () => {
      expect(classifyRegime(0, 0.5, 'rv_ratio')).toBe('LOW');
      expect(classifyRegime(0, 1.0, 'rv_ratio')).toBe('NORMAL');
      expect(classifyRegime(0, 1.5, 'rv_ratio')).toBe('HIGH');
      expect(classifyRegime(0, 2.0, 'rv_ratio')).toBe('EXTREME');
    });
  });

  describe('3. Risk Engine Precedence (Circuit Breakers)', () => {
    it('should identify extreme spike when Z > 2.75', () => {
      expect(isExtremeSpike(2.5)).toBe(false);
      expect(isExtremeSpike(2.74)).toBe(false);
      expect(isExtremeSpike(2.75)).toBe(false);
      expect(isExtremeSpike(2.76)).toBe(true);
      expect(isExtremeSpike(3.0)).toBe(true);
      expect(isExtremeSpike(5.0)).toBe(true);
    });

    it('should enforce profile C restrictions - only LOW/NORMAL allowed', () => {
      expect(getRegimePermissions('LOW', 'C').trading_allowed).toBe(true);
      expect(getRegimePermissions('NORMAL', 'C').trading_allowed).toBe(true);
      expect(getRegimePermissions('HIGH', 'C').trading_allowed).toBe(false);
      expect(getRegimePermissions('EXTREME', 'C').trading_allowed).toBe(false);
      expect(getRegimePermissions('NORMAL', 'C').pyramiding_allowed).toBe(false);
      expect(getRegimePermissions('NORMAL', 'C').max_position_multiplier).toBe(0.80);
    });

    it('should enforce profile M restrictions - EXTREME blocked', () => {
      expect(getRegimePermissions('LOW', 'M').trading_allowed).toBe(true);
      expect(getRegimePermissions('NORMAL', 'M').trading_allowed).toBe(true);
      expect(getRegimePermissions('HIGH', 'M').trading_allowed).toBe(true);
      expect(getRegimePermissions('EXTREME', 'M').trading_allowed).toBe(false);
      expect(getRegimePermissions('HIGH', 'M').max_position_multiplier).toBe(1.00);
    });

    it('should enforce profile A restrictions - all regimes, no pyramiding', () => {
      expect(getRegimePermissions('EXTREME', 'A').trading_allowed).toBe(true);
      expect(getRegimePermissions('EXTREME', 'A').pyramiding_allowed).toBe(false);
      expect(getRegimePermissions('EXTREME', 'A').max_position_multiplier).toBe(1.10);
    });

    it('should allow pyramiding for SA only in HIGH/EXTREME', () => {
      expect(getRegimePermissions('LOW', 'SA').pyramiding_allowed).toBe(false);
      expect(getRegimePermissions('NORMAL', 'SA').pyramiding_allowed).toBe(false);
      expect(getRegimePermissions('HIGH', 'SA').pyramiding_allowed).toBe(true);
      expect(getRegimePermissions('EXTREME', 'SA').pyramiding_allowed).toBe(true);
      expect(getRegimePermissions('EXTREME', 'SA').max_position_multiplier).toBe(1.25);
    });

    it('should allow pyramiding for FULL only in HIGH/EXTREME', () => {
      expect(getRegimePermissions('LOW', 'FULL').pyramiding_allowed).toBe(false);
      expect(getRegimePermissions('NORMAL', 'FULL').pyramiding_allowed).toBe(false);
      expect(getRegimePermissions('HIGH', 'FULL').pyramiding_allowed).toBe(true);
      expect(getRegimePermissions('EXTREME', 'FULL').pyramiding_allowed).toBe(true);
      expect(getRegimePermissions('EXTREME', 'FULL').max_position_multiplier).toBe(1.25);
    });
  });

  describe('4. Slippage/Spread Guard Tests', () => {
    it('should have correct spread limits per VRE Table 1', () => {
      expect(SPREAD_LIMITS.LOW).toBe(0.0012);
      expect(SPREAD_LIMITS.NORMAL).toBe(0.0010);
      expect(SPREAD_LIMITS.HIGH).toBe(0.0008);
      expect(SPREAD_LIMITS.EXTREME).toBe(0.0006);
    });

    it('should have correct slippage limits per VRE Table 1', () => {
      expect(SLIPPAGE_LIMITS.LOW).toBe(0.0008);
      expect(SLIPPAGE_LIMITS.NORMAL).toBe(0.0006);
      expect(SLIPPAGE_LIMITS.HIGH).toBe(0.0005);
      expect(SLIPPAGE_LIMITS.EXTREME).toBe(0.0004);
    });

    it('should enforce spread limits by regime', () => {
      expect(checkSpreadLimit('LOW', 0.0010)).toBe(true);
      expect(checkSpreadLimit('LOW', 0.0012)).toBe(true);
      expect(checkSpreadLimit('LOW', 0.0013)).toBe(false);

      expect(checkSpreadLimit('EXTREME', 0.0005)).toBe(true);
      expect(checkSpreadLimit('EXTREME', 0.0006)).toBe(true);
      expect(checkSpreadLimit('EXTREME', 0.0007)).toBe(false);
    });

    it('should enforce slippage limits by regime', () => {
      expect(checkSlippageLimit('LOW', 0.0006)).toBe(true);
      expect(checkSlippageLimit('LOW', 0.0008)).toBe(true);
      expect(checkSlippageLimit('LOW', 0.0009)).toBe(false);

      expect(checkSlippageLimit('EXTREME', 0.0003)).toBe(true);
      expect(checkSlippageLimit('EXTREME', 0.0004)).toBe(true);
      expect(checkSlippageLimit('EXTREME', 0.0005)).toBe(false);
    });

    it('should block entry when spread exceeds limit', () => {
      const result = checkEntryAllowed('HIGH', 0.0010, 0.0003);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('spread_exceeded');
    });

    it('should block entry when slippage exceeds limit', () => {
      const result = checkEntryAllowed('HIGH', 0.0005, 0.0010);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('slippage_exceeded');
    });

    it('should allow entry when both spread and slippage within limits', () => {
      const result = checkEntryAllowed('HIGH', 0.0005, 0.0003);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should have stricter limits for higher volatility regimes', () => {
      expect(SPREAD_LIMITS.LOW).toBeGreaterThan(SPREAD_LIMITS.NORMAL);
      expect(SPREAD_LIMITS.NORMAL).toBeGreaterThan(SPREAD_LIMITS.HIGH);
      expect(SPREAD_LIMITS.HIGH).toBeGreaterThan(SPREAD_LIMITS.EXTREME);

      expect(SLIPPAGE_LIMITS.LOW).toBeGreaterThan(SLIPPAGE_LIMITS.NORMAL);
      expect(SLIPPAGE_LIMITS.NORMAL).toBeGreaterThan(SLIPPAGE_LIMITS.HIGH);
      expect(SLIPPAGE_LIMITS.HIGH).toBeGreaterThan(SLIPPAGE_LIMITS.EXTREME);
    });
  });

  describe('5. Mathematical Calculations', () => {
    it('should calculate mean correctly', () => {
      expect(calculateMean([1, 2, 3, 4, 5])).toBe(3);
      expect(calculateMean([10])).toBe(10);
      expect(calculateMean([])).toBe(0);
      expect(calculateMean([2, 4, 6, 8])).toBe(5);
    });

    it('should calculate standard deviation correctly', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const mean = calculateMean(values);
      const stdDev = calculateStd(values, mean);
      expect(stdDev).toBeCloseTo(2.138, 2);
    });

    it('should return 0 for std with less than 2 values', () => {
      expect(calculateStd([5], 5)).toBe(0);
      expect(calculateStd([], 0)).toBe(0);
    });

    it('should return 0 for volatility with insufficient data', () => {
      const returns = [0.01, 0.02];
      expect(calculateRealizedVolatility(returns, 10)).toBe(0);
    });

    it('should calculate realized volatility correctly', () => {
      const returns = [0.01, -0.01, 0.02, -0.02];
      const rv = calculateRealizedVolatility(returns, 4);
      expect(rv).toBeGreaterThan(0);
      
      const expectedRV = Math.sqrt((0.01**2 + 0.01**2 + 0.02**2 + 0.02**2) / 4);
      expect(rv).toBeCloseTo(expectedRV, 10);
    });
  });

  describe('6. VRE Configuration Verification', () => {
    it('should have W_short = 96 bars (24h at 15m)', () => {
      expect(DEFAULT_VRE_CONFIG.W_short).toBe(96);
    });

    it('should have W_long = 672 bars (7 days at 15m)', () => {
      expect(DEFAULT_VRE_CONFIG.W_long).toBe(672);
    });

    it('should have correct z-score thresholds', () => {
      expect(DEFAULT_VRE_CONFIG.z_thresholds.low_normal).toBe(-0.75);
      expect(DEFAULT_VRE_CONFIG.z_thresholds.normal_high).toBe(0.75);
      expect(DEFAULT_VRE_CONFIG.z_thresholds.high_extreme).toBe(1.75);
    });

    it('should have correct hysteresis exit thresholds', () => {
      expect(DEFAULT_VRE_CONFIG.z_exit_thresholds.extreme_to_high).toBe(1.40);
      expect(DEFAULT_VRE_CONFIG.z_exit_thresholds.high_to_normal).toBe(0.55);
      expect(DEFAULT_VRE_CONFIG.z_exit_thresholds.normal_to_low).toBe(-0.55);
    });

    it('should have correct rv_ratio fallback thresholds', () => {
      expect(DEFAULT_VRE_CONFIG.rv_ratio_fallback.low).toBe(0.7);
      expect(DEFAULT_VRE_CONFIG.rv_ratio_fallback.high).toBe(1.3);
      expect(DEFAULT_VRE_CONFIG.rv_ratio_fallback.extreme).toBe(1.8);
    });
  });
});
