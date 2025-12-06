import { db } from "../../db";
import { 
  backtest_runs, 
  backtest_trades, 
  bars_1m,
  type BacktestRun,
  type InsertBacktestTrade
} from "@shared/schema";
import { eq, and, gte, lte, asc, desc } from "drizzle-orm";

export interface StrategyParams {
  ema_fast: number;
  ema_slow: number;
  atr_period: number;
  breakout_long_atr: number;
  breakout_short_atr: number;
  tp1_atr: number;
  tp2_atr: number;
  sl_atr: number;
  trailing_atr: number;
}

export interface RiskParams {
  risk_per_trade_bps: number;
  cluster_cap_pct: number;
  cluster_stop_daily_pct: number;
  global_stop_daily_pct: number;
  max_stops_per_asset_day: number;
  campaign_dd_stop: number;
}

export interface CostParams {
  fee_roundtrip_pct: number;
  slippage_roundtrip_pct: number;
  funding_daily_pct: number;
  tax_rate: number;
  min_atr_daily_pct: number;
}

interface BarData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

interface Position {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  entryTime: Date;
  quantity: number;
  notionalValue: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  trailingStop: number | null;
  tp1Hit: boolean;
  atrAtEntry: number;
  emaFastAtEntry: number;
  emaSlowAtEntry: number;
  clusterNumber?: number;
  signalStrength: number;
}

interface TradeResult {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  entryTime: Date;
  exitPrice: number;
  exitTime: Date;
  exitReason: string;
  quantity: number;
  notionalValue: number;
  grossPnl: number;
  fees: number;
  slippage: number;
  netPnl: number;
  atrAtEntry: number;
  emaFastAtEntry: number;
  emaSlowAtEntry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  breakerTriggered: boolean;
  breakerType?: string;
  clusterNumber?: number;
  signalStrength: number;
}

interface BreakerState {
  assetStopsToday: Map<string, number>;
  clusterPnL: Map<number, number>;
  globalPnL: number;
  campaignDD: number;
  peakEquity: number;
  assetsPaused: Set<string>;
  clustersPaused: Set<number>;
  globalPaused: boolean;
}

interface IndicatorState {
  emaFast: number;
  emaSlow: number;
  atr: number;
  prices: number[];
  trueRanges: number[];
}

export class BacktestEngine {
  private strategyParams: StrategyParams;
  private riskParams: RiskParams;
  private costParams: CostParams;
  private applyBreakers: boolean;
  private equity: number;
  private initialCapital: number;
  private positions: Map<string, Position> = new Map();
  private trades: TradeResult[] = [];
  private breakerState: BreakerState;
  private indicators: Map<string, IndicatorState> = new Map();
  private currentDate: Date = new Date();
  private lastResetDate: Date = new Date(0);

  constructor(
    strategyParams: StrategyParams,
    riskParams: RiskParams,
    costParams: CostParams,
    initialCapital: number,
    applyBreakers: boolean = true
  ) {
    this.strategyParams = strategyParams;
    this.riskParams = riskParams;
    this.costParams = costParams;
    this.initialCapital = initialCapital;
    this.equity = initialCapital;
    this.applyBreakers = applyBreakers;
    this.breakerState = this.initBreakerState();
  }

  private initBreakerState(): BreakerState {
    return {
      assetStopsToday: new Map(),
      clusterPnL: new Map(),
      globalPnL: 0,
      campaignDD: 0,
      peakEquity: this.equity,
      assetsPaused: new Set(),
      clustersPaused: new Set(),
      globalPaused: false,
    };
  }

  private resetDailyBreakers() {
    this.breakerState.assetStopsToday.clear();
    this.breakerState.clusterPnL.clear();
    this.breakerState.globalPnL = 0;
    this.breakerState.assetsPaused.clear();
    this.breakerState.clustersPaused.clear();
    this.breakerState.globalPaused = false;
  }

  async run(
    backtestRunId: string,
    symbols: string[],
    startDate: Date,
    endDate: Date,
    onProgress?: (percentage: number) => void
  ): Promise<TradeResult[]> {
    console.log(`[BacktestEngine] Starting backtest ${backtestRunId}`);
    console.log(`[BacktestEngine] Period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`[BacktestEngine] Symbols: ${symbols.length}`);

    this.trades = [];
    this.positions.clear();
    this.indicators.clear();
    this.equity = this.initialCapital;
    this.breakerState = this.initBreakerState();

    for (const symbol of symbols) {
      this.indicators.set(symbol, {
        emaFast: 0,
        emaSlow: 0,
        atr: 0,
        prices: [],
        trueRanges: [],
      });
    }

    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    let processedDays = 0;

    let currentDay = new Date(startDate);
    while (currentDay <= endDate) {
      this.currentDate = currentDay;

      if (currentDay.toDateString() !== this.lastResetDate.toDateString()) {
        this.resetDailyBreakers();
        this.lastResetDate = currentDay;
      }

      if (this.breakerState.campaignDD <= this.riskParams.campaign_dd_stop) {
        console.log(`[BacktestEngine] Campaign stopped: DD ${(this.breakerState.campaignDD * 100).toFixed(2)}%`);
        break;
      }

      for (const symbol of symbols) {
        await this.processSymbolDay(symbol, currentDay);
      }

      processedDays++;
      const progress = (processedDays / totalDays) * 100;
      if (onProgress) {
        onProgress(Math.min(progress, 100));
      }

      await db.update(backtest_runs)
        .set({ progress_percentage: progress.toFixed(2) })
        .where(eq(backtest_runs.id, backtestRunId));

      currentDay = new Date(currentDay.getTime() + 24 * 60 * 60 * 1000);
    }

    this.closeAllPositions(endDate, "end_of_period");

    await this.saveTrades(backtestRunId);

    console.log(`[BacktestEngine] Completed. Total trades: ${this.trades.length}`);
    return this.trades;
  }

  private async processSymbolDay(symbol: string, date: Date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const bars = await db.select()
      .from(bars_1m)
      .where(
        and(
          eq(bars_1m.symbol, symbol),
          gte(bars_1m.bar_ts, dayStart),
          lte(bars_1m.bar_ts, dayEnd)
        )
      )
      .orderBy(asc(bars_1m.bar_ts));

    if (bars.length === 0) {
      return;
    }

    for (const bar of bars) {
      const barData: BarData = {
        open: parseFloat(bar.open),
        high: parseFloat(bar.high),
        low: parseFloat(bar.low),
        close: parseFloat(bar.close),
        volume: parseFloat(bar.volume),
        timestamp: bar.bar_ts,
      };

      this.updateIndicators(symbol, barData);
      this.checkExits(symbol, barData);
      this.checkEntries(symbol, barData);
    }
  }

  private updateIndicators(symbol: string, bar: BarData) {
    const state = this.indicators.get(symbol)!;
    
    state.prices.push(bar.close);
    if (state.prices.length > Math.max(this.strategyParams.ema_slow, this.strategyParams.atr_period) + 1) {
      state.prices.shift();
    }

    if (state.prices.length >= 2) {
      const prevClose = state.prices[state.prices.length - 2];
      const trueRange = Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - prevClose),
        Math.abs(bar.low - prevClose)
      );
      state.trueRanges.push(trueRange);
      if (state.trueRanges.length > this.strategyParams.atr_period) {
        state.trueRanges.shift();
      }
    }

    if (state.prices.length >= this.strategyParams.ema_fast) {
      state.emaFast = this.calculateEMA(state.prices, this.strategyParams.ema_fast);
    }
    if (state.prices.length >= this.strategyParams.ema_slow) {
      state.emaSlow = this.calculateEMA(state.prices, this.strategyParams.ema_slow);
    }
    if (state.trueRanges.length >= this.strategyParams.atr_period) {
      state.atr = state.trueRanges.reduce((a, b) => a + b, 0) / state.trueRanges.length;
    }

    this.indicators.set(symbol, state);
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  private checkEntries(symbol: string, bar: BarData) {
    if (this.positions.has(symbol)) return;

    if (this.applyBreakers) {
      if (this.breakerState.globalPaused) return;
      if (this.breakerState.assetsPaused.has(symbol)) return;

      const stopsToday = this.breakerState.assetStopsToday.get(symbol) || 0;
      if (stopsToday >= this.riskParams.max_stops_per_asset_day) return;
    }

    const state = this.indicators.get(symbol)!;
    if (!state.emaFast || !state.emaSlow || !state.atr) return;

    if (state.atr / bar.close < this.costParams.min_atr_daily_pct) return;

    let signal: "long" | "short" | null = null;
    let signalStrength = 0;

    const priceDiff = bar.close - state.emaFast;
    const breakoutThresholdLong = this.strategyParams.breakout_long_atr * state.atr;
    const breakoutThresholdShort = this.strategyParams.breakout_short_atr * state.atr;

    if (bar.close > state.emaFast && priceDiff > breakoutThresholdLong) {
      if (state.emaFast > state.emaSlow) {
        signal = "long";
        signalStrength = priceDiff / breakoutThresholdLong;
      }
    } else if (bar.close < state.emaFast && Math.abs(priceDiff) > breakoutThresholdShort) {
      if (state.emaFast < state.emaSlow) {
        signal = "short";
        signalStrength = Math.abs(priceDiff) / breakoutThresholdShort;
      }
    }

    if (signal) {
      this.openPosition(symbol, signal, bar, state, signalStrength);
    }
  }

  private openPosition(
    symbol: string, 
    side: "long" | "short", 
    bar: BarData, 
    state: IndicatorState,
    signalStrength: number
  ) {
    const slippage = this.calculateSlippage(bar.close);
    const entryPrice = side === "long" 
      ? bar.close * (1 + slippage) 
      : bar.close * (1 - slippage);

    const slPct = (this.strategyParams.sl_atr * state.atr) / entryPrice;
    const feeAvg = this.costParams.fee_roundtrip_pct / 2;
    const slippageAvg = this.costParams.slippage_roundtrip_pct / 2;
    
    const riskBps = this.riskParams.risk_per_trade_bps / 10000;
    const notionalValue = (riskBps * this.equity) / (slPct + feeAvg + slippageAvg);
    const quantity = notionalValue / entryPrice;

    const stopLoss = side === "long"
      ? entryPrice - (this.strategyParams.sl_atr * state.atr)
      : entryPrice + (this.strategyParams.sl_atr * state.atr);

    const takeProfit1 = side === "long"
      ? entryPrice + (this.strategyParams.tp1_atr * state.atr)
      : entryPrice - (this.strategyParams.tp1_atr * state.atr);

    const takeProfit2 = side === "long"
      ? entryPrice + (this.strategyParams.tp2_atr * state.atr)
      : entryPrice - (this.strategyParams.tp2_atr * state.atr);

    const position: Position = {
      symbol,
      side,
      entryPrice,
      entryTime: bar.timestamp,
      quantity,
      notionalValue,
      stopLoss,
      takeProfit1,
      takeProfit2,
      trailingStop: null,
      tp1Hit: false,
      atrAtEntry: state.atr,
      emaFastAtEntry: state.emaFast,
      emaSlowAtEntry: state.emaSlow,
      signalStrength,
    };

    this.positions.set(symbol, position);
  }

  private checkExits(symbol: string, bar: BarData) {
    const position = this.positions.get(symbol);
    if (!position) return;

    let exitPrice: number | null = null;
    let exitReason: string | null = null;
    let partialExit = false;

    if (position.side === "long") {
      if (bar.low <= position.stopLoss) {
        exitPrice = position.stopLoss;
        exitReason = position.trailingStop ? "trailing_sl" : "sl";
      } else if (position.trailingStop && bar.low <= position.trailingStop) {
        exitPrice = position.trailingStop;
        exitReason = "trailing_sl";
      } else if (!position.tp1Hit && bar.high >= position.takeProfit1) {
        position.tp1Hit = true;
        const breakeven = position.entryPrice + (0.1 * position.atrAtEntry);
        position.trailingStop = breakeven;
        partialExit = true;
        exitPrice = position.takeProfit1;
        exitReason = "tp1";
      } else if (position.tp1Hit && bar.high >= position.takeProfit2) {
        exitPrice = position.takeProfit2;
        exitReason = "tp2";
      }

      if (position.trailingStop && bar.high > position.trailingStop + position.atrAtEntry) {
        position.trailingStop = bar.high - (this.strategyParams.trailing_atr * position.atrAtEntry);
      }
    } else {
      if (bar.high >= position.stopLoss) {
        exitPrice = position.stopLoss;
        exitReason = position.trailingStop ? "trailing_sl" : "sl";
      } else if (position.trailingStop && bar.high >= position.trailingStop) {
        exitPrice = position.trailingStop;
        exitReason = "trailing_sl";
      } else if (!position.tp1Hit && bar.low <= position.takeProfit1) {
        position.tp1Hit = true;
        const breakeven = position.entryPrice - (0.1 * position.atrAtEntry);
        position.trailingStop = breakeven;
        partialExit = true;
        exitPrice = position.takeProfit1;
        exitReason = "tp1";
      } else if (position.tp1Hit && bar.low <= position.takeProfit2) {
        exitPrice = position.takeProfit2;
        exitReason = "tp2";
      }

      if (position.trailingStop && bar.low < position.trailingStop - position.atrAtEntry) {
        position.trailingStop = bar.low + (this.strategyParams.trailing_atr * position.atrAtEntry);
      }
    }

    if (exitPrice && exitReason) {
      if (partialExit && exitReason === "tp1") {
        this.recordPartialTrade(position, exitPrice, bar.timestamp, exitReason, 0.5);
        position.quantity *= 0.5;
        position.notionalValue *= 0.5;
      } else {
        this.closePosition(symbol, exitPrice, bar.timestamp, exitReason);
      }
    }
  }

  private recordPartialTrade(
    position: Position, 
    exitPrice: number, 
    exitTime: Date, 
    exitReason: string,
    portion: number
  ) {
    const slippage = this.calculateSlippage(exitPrice);
    const actualExitPrice = position.side === "long"
      ? exitPrice * (1 - slippage)
      : exitPrice * (1 + slippage);

    const partialQuantity = position.quantity * portion;
    const partialNotional = position.notionalValue * portion;
    
    const grossPnl = position.side === "long"
      ? (actualExitPrice - position.entryPrice) * partialQuantity
      : (position.entryPrice - actualExitPrice) * partialQuantity;

    const fees = partialNotional * this.costParams.fee_roundtrip_pct;
    const slippageCost = partialNotional * this.costParams.slippage_roundtrip_pct;
    const netPnl = grossPnl - fees - slippageCost;

    this.updateBreakersOnTrade(position.symbol, netPnl, exitReason);
    this.equity += netPnl;
    this.updateCampaignDD();

    const trade: TradeResult = {
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      entryTime: position.entryTime,
      exitPrice: actualExitPrice,
      exitTime,
      exitReason,
      quantity: partialQuantity,
      notionalValue: partialNotional,
      grossPnl,
      fees,
      slippage: slippageCost,
      netPnl,
      atrAtEntry: position.atrAtEntry,
      emaFastAtEntry: position.emaFastAtEntry,
      emaSlowAtEntry: position.emaSlowAtEntry,
      stopLoss: position.stopLoss,
      takeProfit1: position.takeProfit1,
      takeProfit2: position.takeProfit2,
      breakerTriggered: false,
      clusterNumber: position.clusterNumber,
      signalStrength: position.signalStrength,
    };

    this.trades.push(trade);
  }

  private closePosition(symbol: string, exitPrice: number, exitTime: Date, exitReason: string) {
    const position = this.positions.get(symbol);
    if (!position) return;

    const slippage = this.calculateSlippage(exitPrice);
    const actualExitPrice = position.side === "long"
      ? exitPrice * (1 - slippage)
      : exitPrice * (1 + slippage);

    const grossPnl = position.side === "long"
      ? (actualExitPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - actualExitPrice) * position.quantity;

    const fees = position.notionalValue * this.costParams.fee_roundtrip_pct;
    const slippageCost = position.notionalValue * this.costParams.slippage_roundtrip_pct;
    const netPnl = grossPnl - fees - slippageCost;

    this.updateBreakersOnTrade(symbol, netPnl, exitReason);
    this.equity += netPnl;
    this.updateCampaignDD();

    const trade: TradeResult = {
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      entryTime: position.entryTime,
      exitPrice: actualExitPrice,
      exitTime,
      exitReason,
      quantity: position.quantity,
      notionalValue: position.notionalValue,
      grossPnl,
      fees,
      slippage: slippageCost,
      netPnl,
      atrAtEntry: position.atrAtEntry,
      emaFastAtEntry: position.emaFastAtEntry,
      emaSlowAtEntry: position.emaSlowAtEntry,
      stopLoss: position.stopLoss,
      takeProfit1: position.takeProfit1,
      takeProfit2: position.takeProfit2,
      breakerTriggered: this.breakerState.globalPaused || this.breakerState.assetsPaused.has(symbol),
      breakerType: this.breakerState.globalPaused ? "global" : 
                   this.breakerState.assetsPaused.has(symbol) ? "asset" : undefined,
      clusterNumber: position.clusterNumber,
      signalStrength: position.signalStrength,
    };

    this.trades.push(trade);
    this.positions.delete(symbol);
  }

  private closeAllPositions(exitTime: Date, exitReason: string) {
    const symbols = Array.from(this.positions.keys());
    for (const symbol of symbols) {
      const position = this.positions.get(symbol);
      if (!position) continue;
      const lastBar = this.indicators.get(symbol);
      const exitPrice = lastBar ? lastBar.prices[lastBar.prices.length - 1] : position.entryPrice;
      this.closePosition(symbol, exitPrice, exitTime, exitReason);
    }
  }

  private updateBreakersOnTrade(symbol: string, netPnl: number, exitReason: string) {
    if (!this.applyBreakers) return;

    if (exitReason === "sl" || exitReason === "trailing_sl") {
      const currentStops = this.breakerState.assetStopsToday.get(symbol) || 0;
      this.breakerState.assetStopsToday.set(symbol, currentStops + 1);

      if (currentStops + 1 >= this.riskParams.max_stops_per_asset_day) {
        this.breakerState.assetsPaused.add(symbol);
      }
    }

    this.breakerState.globalPnL += netPnl;
    const globalPnLPct = this.breakerState.globalPnL / this.equity;
    if (globalPnLPct <= this.riskParams.global_stop_daily_pct) {
      this.breakerState.globalPaused = true;
    }
  }

  private updateCampaignDD() {
    if (this.equity > this.breakerState.peakEquity) {
      this.breakerState.peakEquity = this.equity;
    }
    this.breakerState.campaignDD = (this.equity - this.breakerState.peakEquity) / this.breakerState.peakEquity;
  }

  private calculateSlippage(price: number): number {
    return this.costParams.slippage_roundtrip_pct / 2;
  }

  private async saveTrades(backtestRunId: string) {
    if (this.trades.length === 0) return;

    const tradesToInsert: InsertBacktestTrade[] = this.trades.map(trade => ({
      backtest_run_id: backtestRunId,
      symbol: trade.symbol,
      cluster_number: trade.clusterNumber,
      side: trade.side,
      entry_price: trade.entryPrice.toFixed(8),
      entry_time: trade.entryTime,
      entry_signal_strength: trade.signalStrength.toFixed(4),
      exit_price: trade.exitPrice.toFixed(8),
      exit_time: trade.exitTime,
      exit_reason: trade.exitReason,
      quantity: trade.quantity.toFixed(8),
      notional_value: trade.notionalValue.toFixed(2),
      gross_pnl: trade.grossPnl.toFixed(2),
      fees: trade.fees.toFixed(8),
      slippage: trade.slippage.toFixed(8),
      net_pnl: trade.netPnl.toFixed(2),
      net_pnl_percentage: ((trade.netPnl / trade.notionalValue) * 100).toFixed(4),
      atr_at_entry: trade.atrAtEntry.toFixed(8),
      ema_fast_at_entry: trade.emaFastAtEntry.toFixed(8),
      ema_slow_at_entry: trade.emaSlowAtEntry.toFixed(8),
      stop_loss: trade.stopLoss.toFixed(8),
      take_profit_1: trade.takeProfit1.toFixed(8),
      take_profit_2: trade.takeProfit2.toFixed(8),
      breaker_triggered: trade.breakerTriggered,
      breaker_type: trade.breakerType,
    }));

    const batchSize = 100;
    for (let i = 0; i < tradesToInsert.length; i += batchSize) {
      const batch = tradesToInsert.slice(i, i + batchSize);
      await db.insert(backtest_trades).values(batch);
    }

    const totalPnl = this.trades.reduce((sum, t) => sum + t.netPnl, 0);
    const totalFees = this.trades.reduce((sum, t) => sum + t.fees, 0);
    const totalSlippage = this.trades.reduce((sum, t) => sum + t.slippage, 0);
    const winningTrades = this.trades.filter(t => t.netPnl > 0).length;
    const losingTrades = this.trades.filter(t => t.netPnl < 0).length;

    await db.update(backtest_runs)
      .set({
        status: "completed",
        progress_percentage: "100",
        total_trades: this.trades.length,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        final_equity: this.equity.toFixed(2),
        total_pnl: totalPnl.toFixed(2),
        total_pnl_percentage: ((totalPnl / this.initialCapital) * 100).toFixed(4),
        total_fees: totalFees.toFixed(8),
        total_slippage: totalSlippage.toFixed(8),
        completed_at: new Date(),
      })
      .where(eq(backtest_runs.id, backtestRunId));
  }

  getEquity(): number {
    return this.equity;
  }

  getTrades(): TradeResult[] {
    return this.trades;
  }
}

export function createDefaultStrategyParams(): StrategyParams {
  return {
    ema_fast: 12,
    ema_slow: 36,
    atr_period: 14,
    breakout_long_atr: 2.0,
    breakout_short_atr: 1.5,
    tp1_atr: 1.2,
    tp2_atr: 2.5,
    sl_atr: 1.0,
    trailing_atr: 0.8,
  };
}

export function createDefaultRiskParams(): RiskParams {
  return {
    risk_per_trade_bps: 20,
    cluster_cap_pct: 0.12,
    cluster_stop_daily_pct: -0.015,
    global_stop_daily_pct: -0.024,
    max_stops_per_asset_day: 2,
    campaign_dd_stop: -0.10,
  };
}

export function createDefaultCostParams(): CostParams {
  return {
    fee_roundtrip_pct: 0.0020,
    slippage_roundtrip_pct: 0.0010,
    funding_daily_pct: 0.0,
    tax_rate: 0.15,
    min_atr_daily_pct: 0.005,
  };
}
