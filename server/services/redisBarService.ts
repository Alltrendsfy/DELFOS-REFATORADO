import { getRedisClient } from '../redis';
import type { Redis } from '@upstash/redis';
import { dataIngestionService, type TickData } from './dataIngestionService';
import { storage } from '../storage';

export interface Bar1s {
  exchange: string;
  symbol: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades_count: number;
  vwap: string;
  bar_ts: number;
}

export class RedisBarService {
  private redis: Redis;
  private activeIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly TTL_24H = 86400;
  private readonly MAX_BARS_PER_SYMBOL = 3600;

  private readonly TOP_20_SYMBOLS = [
    'BTC/USD',
    'ETH/USD',
    'SOL/USD',
    'XRP/USD',
    'ADA/USD',
    'DOGE/USD',
    'TRX/USD',
    'DOT/USD',
    'LINK/USD',
    'MATIC/USD',
    'UNI/USD',
    'AVAX/USD',
    'ATOM/USD',
    'XLM/USD',
    'LTC/USD',
    'ALGO/USD',
    'VET/USD',
    'FIL/USD',
    'NEAR/USD',
    'HBAR/USD',
  ];

  constructor() {
    this.redis = getRedisClient();
  }

  async start() {
    console.log('📊 Starting Redis Bar Service (configurable cadence)...');
    
    console.log('⏳ Waiting 3s for Kraken WebSocket to connect and populate initial ticks...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const exchanges = await storage.getAllExchanges();
    const krakenExchange = exchanges.find(e => e.name.toLowerCase() === 'kraken');
    
    if (!krakenExchange) {
      console.warn('⚠️  Kraken exchange not found in database - skipping bar aggregation');
      return;
    }
    
    const dbSymbols = await storage.getAllSymbols();
    const krakenSymbols = dbSymbols.filter(s => s.exchange_id === krakenExchange.id);
    
    if (krakenSymbols.length === 0) {
      console.warn('⚠️  No Kraken symbols found in database - skipping bar aggregation');
      return;
    }

    for (const dbSymbol of krakenSymbols) {
      const isTop20 = this.TOP_20_SYMBOLS.includes(dbSymbol.symbol);
      const intervalMs = isTop20 ? 1000 : 5000;
      const intervalName = isTop20 ? '1s' : '5s';
      
      this.startAggregation('kraken', dbSymbol.symbol, intervalMs, intervalName);
    }

    const top20Count = krakenSymbols.filter(s => this.TOP_20_SYMBOLS.includes(s.symbol)).length;
    const top80Count = krakenSymbols.length - top20Count;
    
    console.log(`✅ Redis Bar Service started: ${top20Count} symbols @1s, ${top80Count} symbols @5s (total: ${krakenSymbols.length})`);
  }

  stop() {
    console.log('🛑 Stopping Redis Bar Service...');
    const intervalCount = this.activeIntervals.size;
    Array.from(this.activeIntervals.entries()).forEach(([key, interval]) => {
      clearInterval(interval);
      this.activeIntervals.delete(key);
    });
    console.log(`✅ Redis Bar Service stopped (cleared ${intervalCount} intervals)`);
  }

  private startAggregation(exchange: string, symbol: string, intervalMs: number, intervalName: string) {
    const key = `${intervalName}:${exchange}:${symbol}`;
    
    const now = Date.now();
    const nextInterval = Math.ceil(now / intervalMs) * intervalMs;
    const delayToNextInterval = nextInterval - now;

    setTimeout(() => {
      this.aggregateBar(exchange, symbol, intervalMs);
      
      const interval = setInterval(() => {
        this.aggregateBar(exchange, symbol, intervalMs);
      }, intervalMs);
      
      this.activeIntervals.set(key, interval);
    }, delayToNextInterval);

    console.log(`⏰ Scheduled ${intervalName} aggregation for ${symbol} in ${(delayToNextInterval).toFixed(0)}ms`);
  }

  private async aggregateBar(exchange: string, symbol: string, intervalMs: number) {
    try {
      const now = Date.now();
      const currentIntervalStart = Math.floor(now / intervalMs) * intervalMs;
      const previousIntervalStart = currentIntervalStart - intervalMs;
      const previousIntervalEnd = currentIntervalStart;
      
      const ticks = await dataIngestionService.getRecentTicks(exchange, symbol, 500);
      
      if (ticks.length === 0) {
        return;
      }

      const periodTicks = ticks.filter(tick => 
        tick.exchange_ts >= previousIntervalStart && tick.exchange_ts < previousIntervalEnd
      );

      if (periodTicks.length === 0) {
        return;
      }

      const chronologicalTicks = [...periodTicks].reverse();
      
      const prices = chronologicalTicks.map((t: TickData) => parseFloat(t.price));
      const open = prices[0];
      const high = Math.max(...prices);
      const low = Math.min(...prices);
      const close = prices[prices.length - 1];
      
      let totalVolume = 0;
      let totalValue = 0;
      for (const tick of chronologicalTicks) {
        const price = parseFloat(tick.price as string);
        const qty = parseFloat(tick.quantity as string);
        totalVolume += qty;
        totalValue += price * qty;
      }
      const vwap = totalVolume > 0 ? (totalValue / totalVolume).toString() : close.toString();

      const bar: Bar1s = {
        exchange,
        symbol,
        open: open.toString(),
        high: high.toString(),
        low: low.toString(),
        close: close.toString(),
        volume: totalVolume.toString(),
        trades_count: chronologicalTicks.length,
        vwap,
        bar_ts: previousIntervalStart,
      };

      if (intervalMs === 1000) {
        await this.storeBars1s(exchange, symbol, bar);
      } else if (intervalMs === 5000) {
        await this.storeBars5s(exchange, symbol, bar);
      }
      
      const intervalSec = intervalMs / 1000;
      console.log(`✅ ${intervalSec}s bar: ${symbol} ${new Date(previousIntervalStart).toISOString().substring(11, 19)} O=${open.toFixed(2)} H=${high.toFixed(2)} L=${low.toFixed(2)} C=${close.toFixed(2)} V=${totalVolume.toFixed(4)} T=${chronologicalTicks.length}`);
    } catch (error) {
      console.error(`❌ Error aggregating bar for ${symbol}:`, error);
    }
  }

  async storeBars1s(exchange: string, symbol: string, bar: Bar1s): Promise<void> {
    const barKey = `bars:1s:${exchange}:${symbol}:${bar.bar_ts}`;
    const indexKey = `bars:1s:${exchange}:${symbol}:index`;
    const barJson = JSON.stringify(bar);

    const cutoffTs = Date.now() - (this.TTL_24H * 1000);

    const pipeline = this.redis.pipeline();
    pipeline.set(barKey, barJson);
    pipeline.expire(barKey, this.TTL_24H);
    pipeline.zadd(indexKey, { score: bar.bar_ts, member: bar.bar_ts.toString() });
    pipeline.zremrangebyscore(indexKey, 0, cutoffTs);
    pipeline.expire(indexKey, this.TTL_24H);
    await pipeline.exec();
  }

  async storeBars5s(exchange: string, symbol: string, bar: Bar1s): Promise<void> {
    const barKey = `bars:5s:${exchange}:${symbol}:${bar.bar_ts}`;
    const indexKey = `bars:5s:${exchange}:${symbol}:index`;
    const barJson = JSON.stringify(bar);

    const cutoffTs = Date.now() - (this.TTL_24H * 1000);

    const pipeline = this.redis.pipeline();
    pipeline.set(barKey, barJson);
    pipeline.expire(barKey, this.TTL_24H);
    pipeline.zadd(indexKey, { score: bar.bar_ts, member: bar.bar_ts.toString() });
    pipeline.zremrangebyscore(indexKey, 0, cutoffTs);
    pipeline.expire(indexKey, this.TTL_24H);
    await pipeline.exec();
  }

  async getBars1s(
    exchange: string,
    symbol: string,
    limit: number = 3600
  ): Promise<Bar1s[]> {
    const indexKey = `bars:1s:${exchange}:${symbol}:index`;
    
    const timestamps = await this.redis.zrange(indexKey, 0, limit - 1, { rev: true }) as string[];
    
    if (timestamps.length === 0) {
      return [];
    }

    const barKeys = timestamps.map(ts => `bars:1s:${exchange}:${symbol}:${ts}`);
    const barsData = await this.redis.mget(...barKeys) as (string | null)[];
    
    const bars: Bar1s[] = [];
    for (const barData of barsData) {
      if (barData) {
        bars.push(typeof barData === 'string' ? JSON.parse(barData) : barData);
      }
    }
    
    return bars.sort((a, b) => a.bar_ts - b.bar_ts);
  }

  async getBars1sInRange(
    exchange: string,
    symbol: string,
    startTs: number,
    endTs: number
  ): Promise<Bar1s[]> {
    const indexKey = `bars:1s:${exchange}:${symbol}:index`;
    
    const timestamps = await this.redis.zrange(indexKey, startTs, endTs, { byScore: true }) as string[];
    
    if (timestamps.length === 0) {
      return [];
    }

    const barKeys = timestamps.map(ts => `bars:1s:${exchange}:${symbol}:${ts}`);
    const barsData = await this.redis.mget(...barKeys) as (string | null)[];
    
    const bars: Bar1s[] = [];
    for (const barData of barsData) {
      if (barData) {
        bars.push(typeof barData === 'string' ? JSON.parse(barData) : barData);
      }
    }
    
    return bars.sort((a, b) => a.bar_ts - b.bar_ts);
  }

  async getBars5s(
    exchange: string,
    symbol: string,
    limit: number = 720
  ): Promise<Bar1s[]> {
    const indexKey = `bars:5s:${exchange}:${symbol}:index`;
    
    const timestamps = await this.redis.zrange(indexKey, 0, limit - 1, { rev: true }) as string[];
    
    if (timestamps.length === 0) {
      return [];
    }

    const barKeys = timestamps.map(ts => `bars:5s:${exchange}:${symbol}:${ts}`);
    const barsData = await this.redis.mget(...barKeys) as (string | null)[];
    
    const bars: Bar1s[] = [];
    for (const barData of barsData) {
      if (barData) {
        bars.push(typeof barData === 'string' ? JSON.parse(barData) : barData);
      }
    }
    
    return bars.sort((a, b) => a.bar_ts - b.bar_ts);
  }

  async getBars5sInRange(
    exchange: string,
    symbol: string,
    startTs: number,
    endTs: number
  ): Promise<Bar1s[]> {
    const indexKey = `bars:5s:${exchange}:${symbol}:index`;
    
    const timestamps = await this.redis.zrange(indexKey, startTs, endTs, { byScore: true }) as string[];
    
    if (timestamps.length === 0) {
      return [];
    }

    const barKeys = timestamps.map(ts => `bars:5s:${exchange}:${symbol}:${ts}`);
    const barsData = await this.redis.mget(...barKeys) as (string | null)[];
    
    const bars: Bar1s[] = [];
    for (const barData of barsData) {
      if (barData) {
        bars.push(typeof barData === 'string' ? JSON.parse(barData) : barData);
      }
    }
    
    return bars.sort((a, b) => a.bar_ts - b.bar_ts);
  }
}

export const redisBarService = new RedisBarService();
