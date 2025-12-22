import { db } from '../../db';
import { sql } from 'drizzle-orm';

export interface VRECircuitBreakerState {
  extremeSpikeGuard: {
    active: boolean;
    triggeredAt: Date | null;
    blocksAddonsUntil: Date | null;
  };
  whipsawGuard: {
    active: boolean;
    blockedAssets: Map<string, { blockedUntil: Date; lossCount: number }>;
  };
}

export interface WhipsawEvent {
  symbol: string;
  isLoss: boolean;
  timestamp: Date;
}

export class VRECircuitBreakersService {
  private static instance: VRECircuitBreakersService;
  
  private extremeSpikeTriggeredAt: Date | null = null;
  private readonly EXTREME_SPIKE_THRESHOLD = 2.75;
  private readonly EXTREME_SPIKE_BLOCK_HOURS = 2;
  
  private assetLossHistory: Map<string, { timestamp: Date; count: number }[]> = new Map();
  private blockedAssets: Map<string, { blockedUntil: Date; reason: string }> = new Map();
  private readonly WHIPSAW_LOSS_COUNT = 3;
  private readonly WHIPSAW_WINDOW_HOURS = 6;
  private readonly WHIPSAW_BLOCK_HOURS = 12;

  private constructor() {}

  static getInstance(): VRECircuitBreakersService {
    if (!VRECircuitBreakersService.instance) {
      VRECircuitBreakersService.instance = new VRECircuitBreakersService();
    }
    return VRECircuitBreakersService.instance;
  }

  checkExtremeSpikeGuard(zScore: number): {
    blocked: boolean;
    reason: string | null;
  } {
    if (this.extremeSpikeTriggeredAt) {
      const blockUntil = new Date(this.extremeSpikeTriggeredAt.getTime() + this.EXTREME_SPIKE_BLOCK_HOURS * 60 * 60 * 1000);
      if (new Date() < blockUntil) {
        const remainingMs = blockUntil.getTime() - Date.now();
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return {
          blocked: true,
          reason: `Extreme spike cooldown active (${remainingMinutes}min remaining)`,
        };
      }
      this.extremeSpikeTriggeredAt = null;
    }

    if (zScore > this.EXTREME_SPIKE_THRESHOLD) {
      this.extremeSpikeTriggeredAt = new Date();
      console.log(`[VRE-CB] Extreme Spike Guard TRIGGERED: Z=${zScore.toFixed(2)} > ${this.EXTREME_SPIKE_THRESHOLD}`);
      return {
        blocked: true,
        reason: `Extreme spike detected (Z=${zScore.toFixed(2)}), add-ons blocked for ${this.EXTREME_SPIKE_BLOCK_HOURS}h`,
      };
    }

    return { blocked: false, reason: null };
  }

  isExtremeSpikeActive(): boolean {
    if (!this.extremeSpikeTriggeredAt) return false;
    const blockUntil = new Date(this.extremeSpikeTriggeredAt.getTime() + this.EXTREME_SPIKE_BLOCK_HOURS * 60 * 60 * 1000);
    return new Date() < blockUntil;
  }

  recordTradeResult(symbol: string, isLoss: boolean): void {
    if (!isLoss) {
      const history = this.assetLossHistory.get(symbol) || [];
      this.assetLossHistory.set(symbol, history.filter(h => !this.isWithinWindow(h.timestamp, this.WHIPSAW_WINDOW_HOURS)));
      return;
    }

    const now = new Date();
    const history = this.assetLossHistory.get(symbol) || [];
    
    const windowStart = new Date(now.getTime() - this.WHIPSAW_WINDOW_HOURS * 60 * 60 * 1000);
    const recentLosses = history.filter(h => h.timestamp >= windowStart);
    
    recentLosses.push({ timestamp: now, count: 1 });
    this.assetLossHistory.set(symbol, recentLosses);

    if (recentLosses.length >= this.WHIPSAW_LOSS_COUNT) {
      const blockedUntil = new Date(now.getTime() + this.WHIPSAW_BLOCK_HOURS * 60 * 60 * 1000);
      this.blockedAssets.set(symbol, {
        blockedUntil,
        reason: `Whipsaw Guard: ${this.WHIPSAW_LOSS_COUNT} consecutive losses in ${this.WHIPSAW_WINDOW_HOURS}h`,
      });
      console.log(`[VRE-CB] Whipsaw Guard TRIGGERED for ${symbol}: blocked until ${blockedUntil.toISOString()}`);
      
      this.assetLossHistory.delete(symbol);
    }
  }

  checkWhipsawGuard(symbol: string): {
    blocked: boolean;
    reason: string | null;
    blockedUntil: Date | null;
  } {
    const blocked = this.blockedAssets.get(symbol);
    
    if (!blocked) {
      return { blocked: false, reason: null, blockedUntil: null };
    }

    if (new Date() >= blocked.blockedUntil) {
      this.blockedAssets.delete(symbol);
      console.log(`[VRE-CB] Whipsaw block expired for ${symbol}`);
      return { blocked: false, reason: null, blockedUntil: null };
    }

    return {
      blocked: true,
      reason: blocked.reason,
      blockedUntil: blocked.blockedUntil,
    };
  }

  isAssetBlocked(symbol: string): boolean {
    return this.checkWhipsawGuard(symbol).blocked;
  }

  getBlockedAssets(): Array<{ symbol: string; blockedUntil: Date; reason: string }> {
    const result: Array<{ symbol: string; blockedUntil: Date; reason: string }> = [];
    const now = new Date();
    
    const entries = Array.from(this.blockedAssets.entries());
    for (const [symbol, data] of entries) {
      if (data.blockedUntil > now) {
        result.push({ symbol, ...data });
      }
    }
    
    return result;
  }

  getState(): VRECircuitBreakerState {
    let extremeSpikeBlocksUntil: Date | null = null;
    if (this.extremeSpikeTriggeredAt) {
      extremeSpikeBlocksUntil = new Date(this.extremeSpikeTriggeredAt.getTime() + this.EXTREME_SPIKE_BLOCK_HOURS * 60 * 60 * 1000);
    }

    const blockedAssetsMap = new Map<string, { blockedUntil: Date; lossCount: number }>();
    const blockedEntries = Array.from(this.blockedAssets.entries());
    for (const [symbol, data] of blockedEntries) {
      blockedAssetsMap.set(symbol, { blockedUntil: data.blockedUntil, lossCount: this.WHIPSAW_LOSS_COUNT });
    }

    return {
      extremeSpikeGuard: {
        active: this.isExtremeSpikeActive(),
        triggeredAt: this.extremeSpikeTriggeredAt,
        blocksAddonsUntil: extremeSpikeBlocksUntil,
      },
      whipsawGuard: {
        active: this.blockedAssets.size > 0,
        blockedAssets: blockedAssetsMap,
      },
    };
  }

  checkAllGuards(symbol: string, zScore: number): {
    canTrade: boolean;
    canAddPyramid: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let canTrade = true;
    let canAddPyramid = true;

    const spikeCheck = this.checkExtremeSpikeGuard(zScore);
    if (spikeCheck.blocked) {
      canAddPyramid = false;
      reasons.push(spikeCheck.reason!);
    }

    const whipsawCheck = this.checkWhipsawGuard(symbol);
    if (whipsawCheck.blocked) {
      canTrade = false;
      canAddPyramid = false;
      reasons.push(whipsawCheck.reason!);
    }

    return { canTrade, canAddPyramid, reasons };
  }

  clearAssetBlock(symbol: string): void {
    this.blockedAssets.delete(symbol);
    this.assetLossHistory.delete(symbol);
    console.log(`[VRE-CB] Manually cleared block for ${symbol}`);
  }

  resetExtremeSpikeGuard(): void {
    this.extremeSpikeTriggeredAt = null;
    console.log('[VRE-CB] Extreme Spike Guard reset manually');
  }

  private isWithinWindow(timestamp: Date, hours: number): boolean {
    const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000);
    return timestamp >= windowStart;
  }
}

export const vreCircuitBreakersService = VRECircuitBreakersService.getInstance();
