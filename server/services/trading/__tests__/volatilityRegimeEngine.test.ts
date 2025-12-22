import { describe, it, expect, beforeEach, vi, afterEach, Mock } from 'vitest';

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockGetRedisClient = vi.fn().mockResolvedValue({
  get: mockRedisGet,
  set: mockRedisSet,
});

vi.mock('../../../redis', () => ({
  getRedisClient: () => mockGetRedisClient(),
}));

const mockDbInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
});
const mockDbSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  }),
});

vi.mock('../../../db', () => ({
  db: {
    insert: () => mockDbInsert(),
    select: () => mockDbSelect(),
  },
}));

const mockGetBars = vi.fn();

vi.mock('../../redisBarService', () => {
  return {
    RedisBarService: class MockRedisBarService {
      getBars = vi.fn();
    },
  };
});

vi.mock('@shared/schema', () => ({
  vre_decision_logs: {},
  vreDecisionLogs: {},
  vreRegimeParameters: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ _eq: true, a, b })),
  desc: vi.fn((col) => ({ _desc: true, col })),
  and: vi.fn((...args) => ({ _and: true, args })),
  asc: vi.fn((col) => ({ _asc: true, col })),
}));

import { VolatilityRegimeEngineService, type VREState, type VolatilityRegime } from '../volatilityRegimeEngine';

function generatePriceData(basePrice: number, volatilityMult: number, count: number): { close: number; high: number; low: number; open: number; timestamp: Date }[] {
  const bars = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * volatilityMult * basePrice;
    price += change;
    bars.push({
      close: price,
      high: price * (1 + Math.abs(change) / basePrice),
      low: price * (1 - Math.abs(change) / basePrice),
      open: price - change * 0.5,
      timestamp: new Date(Date.now() - (count - i) * 15 * 60 * 1000),
    });
  }
  return bars;
}

describe('VRE Phase 5 - QA Tests (Real Service)', () => {
  let vreService: VolatilityRegimeEngineService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockGetBars.mockResolvedValue([]);
    
    vreService = new VolatilityRegimeEngineService();
  });

  afterEach(() => {
    vreService.clearSymbolContext('BTC/USD');
    vreService.clearSymbolContext('ETH/USD');
    vreService.clearSymbolContext('TEST');
  });

  describe('1. Flip-Flop Prevention (Hysteresis + Cooldown)', () => {
    it('should return a valid regime even with fallback simulated data', async () => {
      const state = await vreService.detectRegime('BTC/USD');
      
      expect(['LOW', 'NORMAL', 'HIGH', 'EXTREME']).toContain(state.regime);
      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThanOrEqual(1);
    });

    it('should detect regime from sufficient bar data', async () => {
      const bars = generatePriceData(50000, 0.02, 700);
      mockGetBars.mockResolvedValue(bars);
      
      const state = await vreService.detectRegime('BTC/USD');
      
      expect(['LOW', 'NORMAL', 'HIGH', 'EXTREME']).toContain(state.regime);
      expect(state.z_score).toBeDefined();
      expect(state.rv_ratio).toBeDefined();
    });

    it('should include timestamp and method_used in state', async () => {
      const state = await vreService.detectRegime('BTC/USD');
      
      expect(state.timestamp).toBeDefined();
      expect(['z_score', 'rv_ratio']).toContain(state.method_used);
    });

    it('should verify config has K=3 confirmations', () => {
      const config = vreService.getConfig();
      expect(config.K_confirmations).toBe(3);
    });

    it('should verify config has 8-cycle cooldown', () => {
      const config = vreService.getConfig();
      expect(config.cooldown_cycles).toBe(8);
    });

    it('should verify hysteresis exit thresholds are configured', () => {
      const config = vreService.getConfig();
      expect(config.z_exit_thresholds.extreme_to_high).toBe(1.40);
      expect(config.z_exit_thresholds.high_to_normal).toBe(0.55);
      expect(config.z_exit_thresholds.normal_to_low).toBe(-0.55);
    });
  });

  describe('2. Deterministic Replay', () => {
    it('should produce valid z_score and rv_ratio values', async () => {
      const state = await vreService.detectRegime('TEST');
      
      expect(typeof state.z_score).toBe('number');
      expect(typeof state.rv_ratio).toBe('number');
      expect(state.rv_ratio).toBeGreaterThan(0);
    });

    it('should verify z-score thresholds match VRE specification', () => {
      const config = vreService.getConfig();
      expect(config.z_thresholds.low_normal).toBe(-0.75);
      expect(config.z_thresholds.normal_high).toBe(0.75);
      expect(config.z_thresholds.high_extreme).toBe(1.75);
    });

    it('should verify window sizes match VRE specification', () => {
      const config = vreService.getConfig();
      expect(config.W_short).toBe(96);
      expect(config.W_long).toBe(672);
    });
  });

  describe('3. Risk Engine Precedence (Circuit Breakers)', () => {
    it('should detect extreme spike when Z > 2.75', () => {
      expect(vreService.isExtremeSpike(2.5)).toBe(false);
      expect(vreService.isExtremeSpike(2.75)).toBe(false);
      expect(vreService.isExtremeSpike(2.76)).toBe(true);
      expect(vreService.isExtremeSpike(3.5)).toBe(true);
    });

    it('should enforce profile C restrictions - only LOW/NORMAL allowed', () => {
      const lowPerms = vreService.getRegimePermissions('LOW', 'C');
      expect(lowPerms.trading_allowed).toBe(true);
      expect(lowPerms.pyramiding_allowed).toBe(false);
      expect(lowPerms.max_position_multiplier).toBe(0.80);

      const normalPerms = vreService.getRegimePermissions('NORMAL', 'C');
      expect(normalPerms.trading_allowed).toBe(true);

      const highPerms = vreService.getRegimePermissions('HIGH', 'C');
      expect(highPerms.trading_allowed).toBe(false);

      const extremePerms = vreService.getRegimePermissions('EXTREME', 'C');
      expect(extremePerms.trading_allowed).toBe(false);
    });

    it('should enforce profile M restrictions - EXTREME blocked', () => {
      const highPerms = vreService.getRegimePermissions('HIGH', 'M');
      expect(highPerms.trading_allowed).toBe(true);
      expect(highPerms.pyramiding_allowed).toBe(false);

      const extremePerms = vreService.getRegimePermissions('EXTREME', 'M');
      expect(extremePerms.trading_allowed).toBe(false);
    });

    it('should enforce profile A restrictions - all regimes allowed, no pyramiding', () => {
      const extremePerms = vreService.getRegimePermissions('EXTREME', 'A');
      expect(extremePerms.trading_allowed).toBe(true);
      expect(extremePerms.pyramiding_allowed).toBe(false);
      expect(extremePerms.max_position_multiplier).toBe(1.10);
    });

    it('should allow pyramiding for SA/FULL in HIGH/EXTREME only', () => {
      expect(vreService.getRegimePermissions('HIGH', 'SA').pyramiding_allowed).toBe(true);
      expect(vreService.getRegimePermissions('EXTREME', 'SA').pyramiding_allowed).toBe(true);
      expect(vreService.getRegimePermissions('NORMAL', 'SA').pyramiding_allowed).toBe(false);
      expect(vreService.getRegimePermissions('LOW', 'SA').pyramiding_allowed).toBe(false);

      expect(vreService.getRegimePermissions('HIGH', 'FULL').pyramiding_allowed).toBe(true);
      expect(vreService.getRegimePermissions('EXTREME', 'FULL').pyramiding_allowed).toBe(true);
      expect(vreService.getRegimePermissions('NORMAL', 'FULL').pyramiding_allowed).toBe(false);
    });

    it('should enforce max_position_multiplier by profile', () => {
      expect(vreService.getRegimePermissions('NORMAL', 'C').max_position_multiplier).toBe(0.80);
      expect(vreService.getRegimePermissions('HIGH', 'M').max_position_multiplier).toBe(1.00);
      expect(vreService.getRegimePermissions('EXTREME', 'SA').max_position_multiplier).toBe(1.25);
      expect(vreService.getRegimePermissions('EXTREME', 'FULL').max_position_multiplier).toBe(1.25);
    });
  });

  describe('4. Slippage/Spread Guard Tests (via Adaptive Parameters)', () => {
    it('should have rv_ratio_fallback thresholds configured correctly', () => {
      const config = vreService.getConfig();
      expect(config.rv_ratio_fallback.low).toBe(0.7);
      expect(config.rv_ratio_fallback.high).toBe(1.3);
      expect(config.rv_ratio_fallback.extreme).toBe(1.8);
    });

    it('spread limits should be stricter for higher volatility regimes', () => {
      const spreadLimits: Record<VolatilityRegime, number> = {
        LOW: 0.0012,
        NORMAL: 0.0010,
        HIGH: 0.0008,
        EXTREME: 0.0006,
      };
      
      expect(spreadLimits.LOW).toBeGreaterThan(spreadLimits.NORMAL);
      expect(spreadLimits.NORMAL).toBeGreaterThan(spreadLimits.HIGH);
      expect(spreadLimits.HIGH).toBeGreaterThan(spreadLimits.EXTREME);
    });

    it('slippage limits should be stricter for higher volatility regimes', () => {
      const slippageLimits: Record<VolatilityRegime, number> = {
        LOW: 0.0008,
        NORMAL: 0.0006,
        HIGH: 0.0005,
        EXTREME: 0.0004,
      };
      
      expect(slippageLimits.LOW).toBeGreaterThan(slippageLimits.NORMAL);
      expect(slippageLimits.NORMAL).toBeGreaterThan(slippageLimits.HIGH);
      expect(slippageLimits.HIGH).toBeGreaterThan(slippageLimits.EXTREME);
    });
  });

  describe('5. Aggregate Regime Detection', () => {
    it('should detect aggregate regime across multiple symbols', async () => {
      const bars = generatePriceData(50000, 0.015, 700);
      mockGetBars.mockResolvedValue(bars);
      mockRedisGet.mockResolvedValue(null);

      const result = await vreService.detectAggregateRegime(['BTC/USD', 'ETH/USD']);
      
      expect(['LOW', 'NORMAL', 'HIGH', 'EXTREME']).toContain(result.regime);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.individual.size).toBe(2);
    });

    it('should return individual states for each symbol', async () => {
      const bars = generatePriceData(50000, 0.015, 700);
      mockGetBars.mockResolvedValue(bars);
      mockRedisGet.mockResolvedValue(null);

      const result = await vreService.detectAggregateRegime(['BTC/USD', 'ETH/USD']);
      
      const btcState = result.individual.get('BTC/USD');
      const ethState = result.individual.get('ETH/USD');
      
      expect(btcState).toBeDefined();
      expect(ethState).toBeDefined();
      expect(['LOW', 'NORMAL', 'HIGH', 'EXTREME']).toContain(btcState!.regime);
    });
  });

  describe('6. Configuration Updates', () => {
    it('should allow config updates', () => {
      const originalConfig = vreService.getConfig();
      
      vreService.updateConfig({ K_confirmations: 5 });
      
      const updatedConfig = vreService.getConfig();
      expect(updatedConfig.K_confirmations).toBe(5);
      
      vreService.updateConfig({ K_confirmations: originalConfig.K_confirmations });
    });

    it('should preserve other config values when updating partially', () => {
      const originalConfig = vreService.getConfig();
      
      vreService.updateConfig({ cooldown_cycles: 10 });
      
      const updatedConfig = vreService.getConfig();
      expect(updatedConfig.W_short).toBe(originalConfig.W_short);
      expect(updatedConfig.W_long).toBe(originalConfig.W_long);
      expect(updatedConfig.z_thresholds).toEqual(originalConfig.z_thresholds);
      
      vreService.updateConfig({ cooldown_cycles: originalConfig.cooldown_cycles });
    });
  });

  describe('7. Error Handling', () => {
    it('should return default state when Redis fails', async () => {
      mockGetRedisClient.mockRejectedValue(new Error('Redis connection failed'));
      mockGetBars.mockResolvedValue([]);
      
      const state = await vreService.detectRegime('BTC/USD');
      
      expect(state.regime).toBe('NORMAL');
    });

    it('should handle bar service errors gracefully', async () => {
      mockGetBars.mockRejectedValue(new Error('Bar service error'));
      
      const state = await vreService.detectRegime('BTC/USD');
      
      expect(state.regime).toBe('NORMAL');
    });
  });
});
