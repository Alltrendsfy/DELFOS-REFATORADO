import { db } from "../db";
import { bars_1m, bars_1h } from "@shared/schema";
import { dataIngestionService, type TickData } from "./dataIngestionService";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export interface OHLCVBar {
  exchange: string;
  symbol: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades_count: number;
  vwap: string;
  bar_ts: Date;
}

class BarsBuilderService {
  private activeIntervals: Map<string, NodeJS.Timeout> = new Map();

  async start() {
    console.log('📊 Starting Bars Builder Service...');
    
    // Configurar símbolos para monitorar
    const symbols = [
      { exchange: 'kraken', symbol: 'BTC/USD' },
      { exchange: 'kraken', symbol: 'ETH/USD' },
      { exchange: 'kraken', symbol: 'SOL/USD' },
      { exchange: 'kraken', symbol: 'ADA/USD' },
    ];

    // Iniciar agregação de 1m para cada símbolo
    for (const { exchange, symbol } of symbols) {
      this.start1mAggregation(exchange, symbol);
    }

    // Iniciar agregação de 1h (a cada hora)
    this.start1hAggregation();

    console.log('✅ Bars Builder Service started');
  }

  stop() {
    console.log('🛑 Stopping Bars Builder Service...');
    Array.from(this.activeIntervals.entries()).forEach(([key, interval]) => {
      clearInterval(interval);
      this.activeIntervals.delete(key);
    });
    console.log('✅ Bars Builder Service stopped');
  }

  private start1mAggregation(exchange: string, symbol: string) {
    const key = `1m:${exchange}:${symbol}`;
    
    // Calcular próxima janela de 1 minuto alinhada
    const now = Date.now();
    const nextMinute = Math.ceil(now / 60000) * 60000;
    const delayToNextMinute = nextMinute - now;

    // Agendar primeira execução no início do próximo minuto
    setTimeout(() => {
      this.aggregate1mBar(exchange, symbol);
      
      // Depois executar a cada minuto
      const interval = setInterval(() => {
        this.aggregate1mBar(exchange, symbol);
      }, 60000); // 1 minuto
      
      this.activeIntervals.set(key, interval);
    }, delayToNextMinute);

    console.log(`⏰ Scheduled 1m aggregation for ${symbol} in ${(delayToNextMinute / 1000).toFixed(1)}s`);
  }

  private start1hAggregation() {
    const key = '1h:global';
    
    // Calcular próxima janela de 1 hora alinhada + 5s delay
    // Delay de 5s garante que todas as barras de 1m foram escritas antes da agregação 1h
    const HOUR_DELAY_MS = 5000; // 5 segundos após o topo da hora
    
    const now = Date.now();
    const nextHour = Math.ceil(now / 3600000) * 3600000;
    const delayToNextHour = nextHour - now + HOUR_DELAY_MS;

    // Agendar primeira execução 5s após o início da próxima hora
    setTimeout(() => {
      this.aggregate1hBars();
      
      // Depois executar a cada hora (mantém delay de 5s)
      const interval = setInterval(() => {
        this.aggregate1hBars();
      }, 3600000); // 1 hora
      
      this.activeIntervals.set(key, interval);
    }, delayToNextHour);

    console.log(`⏰ Scheduled 1h aggregation in ${(delayToNextHour / 1000 / 60).toFixed(1)}m`);
  }

  private async aggregate1mBar(exchange: string, symbol: string) {
    try {
      // Calcular timestamp do período sendo agregado (minuto anterior ao atual)
      const now = Date.now();
      const currentMinuteStart = Math.floor(now / 60000) * 60000;
      const previousMinuteStart = currentMinuteStart - 60000;
      const previousMinuteEnd = currentMinuteStart;
      
      // Pegar ticks do Redis
      const ticks = await dataIngestionService.getRecentTicks(exchange, symbol, 1000);
      
      if (ticks.length === 0) {
        console.log(`⚠️ No ticks for ${symbol} 1m bar - skipping`);
        return;
      }

      // Filtrar ticks do minuto anterior
      // IMPORTANTE: Redis LPUSH armazena newest-first, então ticks[0] é o mais recente
      const periodTicks = ticks.filter(tick => 
        tick.exchange_ts >= previousMinuteStart && tick.exchange_ts < previousMinuteEnd
      );

      if (periodTicks.length === 0) {
        console.log(`⚠️ No ticks for ${symbol} 1m bar - skipping`);
        return;
      }

      // Reverter array para ordem cronológica (oldest-first)
      const chronologicalTicks = [...periodTicks].reverse();
      
      // Calcular OHLCV com ordem cronológica correta
      const prices = chronologicalTicks.map((t: TickData) => parseFloat(t.price));
      const open = prices[0]; // Primeiro tick do período (mais antigo)
      const high = Math.max(...prices);
      const low = Math.min(...prices);
      const close = prices[prices.length - 1]; // Último tick do período (mais recente)
      
      // Volume e VWAP
      let totalVolume = 0;
      let totalValue = 0;
      for (const tick of chronologicalTicks) {
        const price = parseFloat(tick.price as string);
        const qty = parseFloat(tick.quantity as string);
        totalVolume += qty;
        totalValue += price * qty;
      }
      const vwap = totalVolume > 0 ? (totalValue / totalVolume).toString() : close.toString();

      // Timestamp do início do minuto sendo agregado
      const barTs = new Date(previousMinuteStart);

      // Salvar no PostgreSQL
      await db.insert(bars_1m).values({
        exchange,
        symbol,
        open: open.toString(),
        high: high.toString(),
        low: low.toString(),
        close: close.toString(),
        volume: totalVolume.toString(),
        trades_count: chronologicalTicks.length,
        vwap,
        bar_ts: barTs,
      });

      console.log(`✅ Created 1m bar for ${symbol} at ${barTs.toISOString()}: O=${open} H=${high} L=${low} C=${close} V=${totalVolume.toFixed(4)}`);
    } catch (error) {
      console.error(`❌ Error aggregating 1m bar for ${symbol}:`, error);
    }
  }

  private async wait1mBarsReady(
    exchange: string,
    symbol: string,
    startTs: Date,
    endTs: Date,
    maxRetries: number = 3,
    delayMs: number = 2000
  ): Promise<typeof bars_1m.$inferSelect[]> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const bars = await db
        .select()
        .from(bars_1m)
        .where(
          and(
            eq(bars_1m.exchange, exchange),
            eq(bars_1m.symbol, symbol),
            gte(bars_1m.bar_ts, startTs),
            lte(bars_1m.bar_ts, endTs)
          )
        )
        .orderBy(bars_1m.bar_ts);

      // Se encontrou 60 barras (hora completa), sucesso!
      if (bars.length === 60) {
        return bars;
      }

      // Se é última tentativa, retornar o que temos
      if (attempt === maxRetries) {
        console.log(`⚠️ Only ${bars.length}/60 bars for ${symbol} after ${maxRetries} retries`);
        return bars;
      }

      // Aguardar antes de tentar novamente
      console.log(`⏳ Waiting for 1m bars to complete (attempt ${attempt}/${maxRetries}): ${symbol} has ${bars.length}/60 bars`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return [];
  }

  private async aggregate1hBars() {
    try {
      console.log('📊 Aggregating 1h bars from 1m bars...');
      
      const symbols = [
        { exchange: 'kraken', symbol: 'BTC/USD' },
        { exchange: 'kraken', symbol: 'ETH/USD' },
        { exchange: 'kraken', symbol: 'SOL/USD' },
        { exchange: 'kraken', symbol: 'ADA/USD' },
      ];

      // Calcular hora anterior alinhada
      const now = Date.now();
      const currentHourStart = Math.floor(now / 3600000) * 3600000;
      const previousHourStart = new Date(currentHourStart - 3600000);
      const lastMinuteOfPreviousHour = new Date(currentHourStart - 60000);

      for (const { exchange, symbol } of symbols) {
        // Buscar barras com retry para garantir que todas foram escritas
        const bars1m = await this.wait1mBarsReady(
          exchange,
          symbol,
          previousHourStart,
          lastMinuteOfPreviousHour,
          3,    // 3 tentativas
          2000  // 2s entre tentativas
        );

        // ✅ HARD REQUIREMENT: Exigir exatamente 60 barras para criar barra de 1h
        if (bars1m.length !== 60) {
          console.log(`❌ Skipping 1h aggregation for ${symbol}: Only ${bars1m.length}/60 bars found after retries`);
          continue;
        }
        
        console.log(`✅ Found 60/60 bars for ${symbol} - proceeding with 1h aggregation`);

        // Calcular OHLCV da hora
        const open = bars1m[0].open;
        const close = bars1m[bars1m.length - 1].close;
        
        const highs = bars1m.map(b => parseFloat(b.high));
        const lows = bars1m.map(b => parseFloat(b.low));
        const high = Math.max(...highs).toString();
        const low = Math.min(...lows).toString();

        // Volume e VWAP
        let totalVolume = 0;
        let totalValue = 0;
        let totalTrades = 0;
        
        for (const bar of bars1m) {
          const vol = parseFloat(bar.volume);
          const vwap = bar.vwap ? parseFloat(bar.vwap) : parseFloat(bar.close);
          totalVolume += vol;
          totalValue += vwap * vol;
          totalTrades += bar.trades_count;
        }

        const vwap = totalVolume > 0 ? (totalValue / totalVolume).toString() : close;

        // Salvar no PostgreSQL
        await db.insert(bars_1h).values({
          exchange,
          symbol,
          open,
          high,
          low,
          close,
          volume: totalVolume.toString(),
          trades_count: totalTrades,
          vwap,
          bar_ts: previousHourStart,
        });

        console.log(`✅ Created 1h bar for ${symbol} at ${previousHourStart.toISOString()}: O=${open} H=${high} L=${low} C=${close} V=${totalVolume.toFixed(4)}`);
      }
    } catch (error) {
      console.error('❌ Error aggregating 1h bars:', error);
    }
  }

  // Método auxiliar para buscar barras 1m (usado por API)
  async get1mBars(
    exchange: string,
    symbol: string,
    startTs: Date,
    endTs: Date,
    limit: number = 1000
  ) {
    return db
      .select()
      .from(bars_1m)
      .where(
        and(
          eq(bars_1m.exchange, exchange),
          eq(bars_1m.symbol, symbol),
          gte(bars_1m.bar_ts, startTs),
          lte(bars_1m.bar_ts, endTs)
        )
      )
      .orderBy(desc(bars_1m.bar_ts))
      .limit(limit);
  }

  // Método auxiliar para buscar barras 1h (usado por API)
  async get1hBars(
    exchange: string,
    symbol: string,
    startTs: Date,
    endTs: Date,
    limit: number = 1000
  ) {
    return db
      .select()
      .from(bars_1h)
      .where(
        and(
          eq(bars_1h.exchange, exchange),
          eq(bars_1h.symbol, symbol),
          gte(bars_1h.bar_ts, startTs),
          lte(bars_1h.bar_ts, endTs)
        )
      )
      .orderBy(desc(bars_1h.bar_ts))
      .limit(limit);
  }
}

export const barsBuilderService = new BarsBuilderService();
