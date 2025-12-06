import { getRedisClient } from '../redis';
import type { Redis } from '@upstash/redis';
import { observabilityService } from './observabilityService';

export interface TickData {
  price: string;
  quantity: string;
  side: 'buy' | 'sell';
  exchange_ts: number;
  ingest_ts: number;
  seq_id: string;
}

export interface L1Quote {
  bid_price: string;
  bid_quantity: string;
  ask_price: string;
  ask_quantity: string;
  spread_bps: string;
  exchange_ts: string;
  ingest_ts: string;
}

export interface L2Level {
  price: string;
  quantity: string;
}

interface PendingL2Write {
  exchange: string;
  symbol: string;
  bids: L2Level[];
  asks: L2Level[];
  exchange_ts: number;
}

export class DataIngestionService {
  private redis: Redis;
  private readonly TICK_LIMIT = 1000;
  private readonly L2_LIMIT = 20;
  
  // Concurrency limiter to prevent Upstash REST client saturation
  private readonly MAX_CONCURRENT_L2_WRITES = 4;
  private activeL2Writes = 0;
  private l2WriteQueue: Array<() => void> = [];
  
  // Per-symbol write coalescing to prevent unbounded queue growth
  private pendingL2Writes: Map<string, PendingL2Write> = new Map();
  private inFlightL2Writes: Set<string> = new Set();

  constructor() {
    this.redis = getRedisClient();
  }

  private async acquireL2WriteSlot(): Promise<void> {
    if (this.activeL2Writes < this.MAX_CONCURRENT_L2_WRITES) {
      this.activeL2Writes++;
      return Promise.resolve();
    }
    
    // Wait in queue
    return new Promise((resolve) => {
      this.l2WriteQueue.push(resolve);
    });
  }

  private releaseL2WriteSlot(): void {
    this.activeL2Writes--;
    
    // Process next in queue
    const next = this.l2WriteQueue.shift();
    if (next) {
      this.activeL2Writes++;
      next();
    }
  }

  async storeTick(exchange: string, symbol: string, tick: TickData): Promise<void> {
    const key = `market:tick:${exchange}:${symbol}`;
    const tickJson = JSON.stringify(tick);

    await this.redis.lpush(key, tickJson);
    await this.redis.ltrim(key, 0, this.TICK_LIMIT - 1);
    await this.redis.expire(key, 3600);
  }

  async getRecentTicks(exchange: string, symbol: string, limit: number = 100): Promise<TickData[]> {
    const key = `market:tick:${exchange}:${symbol}`;
    const ticks = await this.redis.lrange(key, 0, limit - 1);
    
    // Upstash Redis REST API already deserializes JSON
    return ticks.map(tick => {
      if (typeof tick === 'string') {
        return JSON.parse(tick);
      }
      return tick as TickData;
    });
  }

  async updateL1Quote(exchange: string, symbol: string, quote: L1Quote): Promise<void> {
    const key = `market:l1:${exchange}:${symbol}`;
    
    await this.redis.hset(key, quote as any);
    await this.redis.expire(key, 30);
  }

  async getL1Quote(exchange: string, symbol: string): Promise<L1Quote | null> {
    const key = `market:l1:${exchange}:${symbol}`;
    const data = await this.redis.hgetall(key);
    
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    
    return data as unknown as L1Quote;
  }

  async updateL2OrderBook(
    exchange: string,
    symbol: string,
    bids: L2Level[],
    asks: L2Level[],
    exchange_ts?: number
  ): Promise<void> {
    const writeKey = `${exchange}:${symbol}`;
    const timestamp = exchange_ts || Date.now();
    
    // If write is already in-flight for this symbol, update pending data (coalescing)
    if (this.inFlightL2Writes.has(writeKey)) {
      this.pendingL2Writes.set(writeKey, { exchange, symbol, bids, asks, exchange_ts: timestamp });
      return; // Drop this write, we'll use the pending one when in-flight completes
    }
    
    // If no write in-flight, check if there's a pending write to replace
    const existing = this.pendingL2Writes.get(writeKey);
    if (existing) {
      // Update pending write with latest data
      this.pendingL2Writes.set(writeKey, { exchange, symbol, bids, asks, exchange_ts: timestamp });
      return;
    }
    
    // No write in-flight or pending, schedule this one
    this.pendingL2Writes.set(writeKey, { exchange, symbol, bids, asks, exchange_ts: timestamp });
    this.scheduleL2Write(writeKey);
  }
  
  private normalizeL2Level(level: any, symbol: string, side: 'bid' | 'ask'): L2Level | null {
    let price: any;
    let quantity: any;
    let rawPayload: string = '';
    
    try {
      // Handle object format: { price: "123.45", quantity: "1.5" }
      if (level && typeof level === 'object' && !Array.isArray(level)) {
        price = level.price;
        quantity = level.quantity || level.volume;
        rawPayload = JSON.stringify(level);
      }
      // Handle array format from Kraken REST API: ["123.45", "1.5", timestamp]
      else if (Array.isArray(level) && level.length >= 2) {
        price = level[0];
        quantity = level[1];
        rawPayload = JSON.stringify(level);
      } else {
        console.warn(`⚠️  Invalid L2 level format for ${symbol} ${side}: ${JSON.stringify(level)}`);
        observabilityService.invalidL2Entries.inc({ symbol, side, reason: 'invalid_format' });
        return null;
      }
      
      // Validate price and quantity exist
      if (!price || !quantity) {
        console.warn(`⚠️  Missing price/quantity for ${symbol} ${side}: price=${price}, qty=${quantity}`);
        observabilityService.invalidL2Entries.inc({ symbol, side, reason: 'missing_fields' });
        return null;
      }
      
      // Convert to numbers for validation
      const priceNum = parseFloat(String(price));
      const qtyNum = parseFloat(String(quantity));
      
      // Reject invalid numbers
      if (isNaN(priceNum) || !isFinite(priceNum) || isNaN(qtyNum) || !isFinite(qtyNum)) {
        console.warn(`⚠️  NaN/Infinite values for ${symbol} ${side}: price=${price}, qty=${quantity}`);
        observabilityService.invalidL2Entries.inc({ symbol, side, reason: 'nan_infinite' });
        return null;
      }
      
      // Reject negative or zero values
      if (priceNum <= 0 || qtyNum <= 0) {
        console.warn(`⚠️  Non-positive values for ${symbol} ${side}: price=${priceNum}, qty=${qtyNum}`);
        observabilityService.invalidL2Entries.inc({ symbol, side, reason: 'non_positive' });
        return null;
      }
      
      // Reject extreme magnitudes (likely data errors)
      if (priceNum > 1e12 || qtyNum > 1e12) {
        console.warn(`⚠️  Extreme magnitude for ${symbol} ${side}: price=${priceNum}, qty=${qtyNum}`);
        observabilityService.invalidL2Entries.inc({ symbol, side, reason: 'extreme_magnitude' });
        return null;
      }
      
      return { price: String(price), quantity: String(quantity) };
    } catch (error) {
      console.error(`❌ Error normalizing L2 level for ${symbol} ${side}:`, error, 'payload:', rawPayload);
      observabilityService.invalidL2Entries.inc({ symbol, side, reason: 'exception' });
      return null;
    }
  }

  private async scheduleL2Write(writeKey: string): Promise<void> {
    // Acquire semaphore slot to limit concurrent Redis operations
    await this.acquireL2WriteSlot();
    
    // Mark write as in-flight
    this.inFlightL2Writes.add(writeKey);
    
    // Get pending write data
    const write = this.pendingL2Writes.get(writeKey);
    if (!write) {
      // Race condition: write was cleared, release slot and return
      this.releaseL2WriteSlot();
      this.inFlightL2Writes.delete(writeKey);
      return;
    }
    
    // Remove from pending queue
    this.pendingL2Writes.delete(writeKey);
    
    const { exchange, symbol, bids, asks, exchange_ts } = write;
    const bidsKey = `market:l2:bids:${exchange}:${symbol}`;
    const asksKey = `market:l2:asks:${exchange}:${symbol}`;
    const timestampKey = `market:l2:ts:${exchange}:${symbol}`;

    try {
      // Normalize and validate L2 levels
      const validBids = bids
        .map(b => this.normalizeL2Level(b, symbol, 'bid'))
        .filter((b): b is L2Level => b !== null)
        .slice(0, this.L2_LIMIT);
        
      const validAsks = asks
        .map(a => this.normalizeL2Level(a, symbol, 'ask'))
        .filter((a): a is L2Level => a !== null)
        .slice(0, this.L2_LIMIT);
      
      // Skip write if no valid data
      if (validBids.length === 0 && validAsks.length === 0) {
        console.warn(`⚠️  No valid L2 data for ${symbol}, skipping write`);
        return;
      }
      
      // Build batched pipeline request to avoid sequential HTTP calls
      const pipeline = this.redis.pipeline();

      // Clear existing data
      pipeline.del(bidsKey);
      pipeline.del(asksKey);

      // Add valid bids
      for (const bid of validBids) {
        const price = parseFloat(bid.price);
        if (!isNaN(price) && isFinite(price)) {
          const member = `${bid.price}:${bid.quantity}`;
          pipeline.zadd(bidsKey, { score: price, member });
        }
      }

      // Add valid asks
      for (const ask of validAsks) {
        const price = parseFloat(ask.price);
        if (!isNaN(price) && isFinite(price)) {
          const member = `${ask.price}:${ask.quantity}`;
          pipeline.zadd(asksKey, { score: price, member });
        }
      }

      // Store timestamp for staleness checking
      pipeline.set(timestampKey, exchange_ts?.toString() || Date.now().toString());

      // Set expiration
      pipeline.expire(bidsKey, 60);
      pipeline.expire(asksKey, 60);
      pipeline.expire(timestampKey, 60);

      // Execute all operations in a single HTTP request
      await pipeline.exec();
      
      console.log(`✅ L2 Redis write OK: ${symbol}`);
    } catch (error) {
      console.error(`❌ Pipeline exec failed for ${symbol}:`, error);
    } finally {
      // Always release semaphore slot
      this.releaseL2WriteSlot();
      
      // Mark write as complete
      this.inFlightL2Writes.delete(writeKey);
      
      // Check if there's another pending write for this symbol
      if (this.pendingL2Writes.has(writeKey)) {
        // Schedule the next write (using latest coalesced data)
        this.scheduleL2Write(writeKey);
      }
    }
  }

  async getL2OrderBook(exchange: string, symbol: string): Promise<{
    bids: L2Level[];
    asks: L2Level[];
  }> {
    const bidsKey = `market:l2:bids:${exchange}:${symbol}`;
    const asksKey = `market:l2:asks:${exchange}:${symbol}`;

    const [bids, asks] = await Promise.all([
      this.redis.zrange(bidsKey, 0, -1, { rev: true, withScores: true }),
      this.redis.zrange(asksKey, 0, -1, { withScores: true }),
    ]);

    // withScores:true returns flat array [member1, score1, member2, score2, ...]
    const parseBids: L2Level[] = [];
    if (Array.isArray(bids)) {
      for (let i = 0; i < bids.length; i += 2) {
        const member = String(bids[i]);
        // Member format is "price:quantity"
        const [price, quantity] = member.split(':');
        if (price && quantity) {
          parseBids.push({ price, quantity });
        }
      }
    }

    const parseAsks: L2Level[] = [];
    if (Array.isArray(asks)) {
      for (let i = 0; i < asks.length; i += 2) {
        const member = String(asks[i]);
        // Member format is "price:quantity"
        const [price, quantity] = member.split(':');
        if (price && quantity) {
          parseAsks.push({ price, quantity });
        }
      }
    }

    return { bids: parseBids, asks: parseAsks };
  }

  async getL2Timestamp(exchange: string, symbol: string): Promise<number | null> {
    const timestampKey = `market:l2:ts:${exchange}:${symbol}`;
    const ts = await this.redis.get(timestampKey);
    return ts ? parseInt(String(ts), 10) : null;
  }

  async setIndicator(
    symbol: string,
    indicator: string,
    period: number,
    value: string | number
  ): Promise<void> {
    const key = `indicators:${indicator}:${symbol}:${period}`;
    await this.redis.setex(key, 300, value.toString());
  }

  async getIndicator(symbol: string, indicator: string, period: number): Promise<string | null> {
    const key = `indicators:${indicator}:${symbol}:${period}`;
    return await this.redis.get(key);
  }

  async setTradingSignal(
    symbol: string,
    action: 'buy' | 'sell' | 'hold',
    strength: number,
    reasoning: string,
    entryPrice?: string,
    stopLoss?: string,
    takeProfit?: string
  ): Promise<void> {
    const key = `signal:${symbol}`;
    const now = Date.now();
    
    const signalData: Record<string, string> = {
      action,
      strength: strength.toString(),
      reasoning,
      timestamp: now.toString(),
    };
    
    if (entryPrice) signalData.entry_price = entryPrice;
    if (stopLoss) signalData.stop_loss = stopLoss;
    if (takeProfit) signalData.take_profit = takeProfit;
    
    await this.redis.hset(key, signalData);
    await this.redis.expire(key, 600);
  }

  async getTradingSignal(symbol: string): Promise<{
    action: string;
    strength: string;
    reasoning: string;
    timestamp: string;
    entry_price?: string;
    stop_loss?: string;
    take_profit?: string;
  } | null> {
    const key = `signal:${symbol}`;
    const data = await this.redis.hgetall(key);
    
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    
    return data as any;
  }

  async setCircuitBreaker(
    portfolioId: string,
    isActive: boolean,
    reason?: string,
    dailyLossUsd?: string
  ): Promise<void> {
    const key = `risk:breaker:${portfolioId}`;
    const now = Date.now();
    
    if (isActive) {
      await this.redis.hset(key, {
        triggered: 'true',
        triggered_at: now.toString(),
        reason: reason || 'Daily loss exceeded limit',
        daily_loss_usd: dailyLossUsd || '0',
      });
      await this.redis.expire(key, 86400);
    } else {
      await this.redis.del(key);
    }
  }

  async getCircuitBreaker(portfolioId: string): Promise<{
    triggered: string;
    triggered_at: string;
    reason: string;
    daily_loss_usd: string;
  } | null> {
    const key = `risk:breaker:${portfolioId}`;
    const data = await this.redis.hgetall(key);
    
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    
    return data as any;
  }

  async setRiskLock(symbol: string, isLocked: boolean): Promise<boolean> {
    const key = `risk:lock:${symbol}`;
    const now = Date.now();
    
    if (isLocked) {
      const result = await this.redis.set(key, now.toString(), {
        ex: 60, // 60 seconds TTL
        nx: true, // Only set if not exists
      });
      return result === 'OK';
    } else {
      await this.redis.del(key);
      return true;
    }
  }

  async getRiskLock(symbol: string): Promise<{
    locked: boolean;
    timestamp?: number;
  }> {
    const key = `risk:lock:${symbol}`;
    const value = await this.redis.get(key);
    
    if (!value) {
      return { locked: false };
    }
    
    return {
      locked: true,
      timestamp: parseInt(String(value), 10),
    };
  }

  async setCurrentPrice(exchange: string, symbol: string, price: string): Promise<void> {
    const key = `price:current:${symbol}`;
    await this.redis.setex(key, 10, price);
  }

  async getCurrentPrice(exchange: string, symbol: string): Promise<string | null> {
    const key = `price:current:${symbol}`;
    return await this.redis.get(key);
  }

  async healthCheck(): Promise<{
    connected: boolean;
    latency: number | null;
  }> {
    try {
      const start = Date.now();
      const result = await this.redis.ping();
      const latency = Date.now() - start;
      
      return { connected: result === 'PONG', latency };
    } catch (error) {
      return { connected: false, latency: null };
    }
  }
}
// Export singleton instance
export const dataIngestionService = new DataIngestionService();
