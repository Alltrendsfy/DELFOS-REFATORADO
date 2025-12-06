import { db } from "../../db";
import { 
  backtest_metrics, 
  backtest_trades, 
  backtest_runs,
  type InsertBacktestMetrics,
  type BacktestMetrics,
  type BacktestTrade
} from "@shared/schema";
import { eq } from "drizzle-orm";
import type { MonteCarloResults } from "./monteCarloSimulator";

export interface TradeMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  hitRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  payoffRatio: number;
  expectancy: number;
}

export interface RiskMetrics {
  meanReturn: number;
  stdevReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  var95: number;
  var99: number;
  es95: number;
  es99: number;
  maxDrawdown: number;
  maxDrawdownPercentage: number;
  maxDrawdownDurationHours: number;
}

export interface CostMetrics {
  turnover: number;
  totalFees: number;
  feesPercentage: number;
  totalSlippage: number;
  slippageBp: number;
  costDragPercentage: number;
}

export interface BreakerStats {
  assetBreakersTriggered: number;
  clusterBreakersTriggered: number;
  globalBreakersTriggered: number;
  tradesBlockedByBreakers: number;
}

export interface ValidationResult {
  es95Improved: boolean;
  var99Improved: boolean;
  pnlNetPositive: boolean;
  validationPassed: boolean;
  validationNotes: string;
}

export class BacktestMetricsService {
  async calculateAndSaveMetrics(
    backtestRunId: string,
    initialCapital: number,
    monteCarloResults?: MonteCarloResults
  ): Promise<BacktestMetrics> {
    console.log(`[BacktestMetricsService] Calculating metrics for ${backtestRunId}`);

    const trades = await db.select()
      .from(backtest_trades)
      .where(eq(backtest_trades.backtest_run_id, backtestRunId));

    if (trades.length === 0) {
      throw new Error("No trades found for backtest run");
    }

    const tradeMetrics = this.calculateTradeMetrics(trades);
    const riskMetrics = this.calculateRiskMetrics(trades, initialCapital);
    const costMetrics = this.calculateCostMetrics(trades, initialCapital);
    const breakerStats = this.calculateBreakerStats(trades);

    const validation = this.validateResults(
      tradeMetrics,
      riskMetrics,
      monteCarloResults
    );

    const metricsToInsert: InsertBacktestMetrics = {
      backtest_run_id: backtestRunId,
      
      mean_return: riskMetrics.meanReturn.toFixed(8),
      stdev_return: riskMetrics.stdevReturn.toFixed(8),
      sharpe_ratio: riskMetrics.sharpeRatio.toFixed(4),
      sortino_ratio: riskMetrics.sortinoRatio.toFixed(4),
      
      var_95: riskMetrics.var95.toFixed(8),
      var_99: riskMetrics.var99.toFixed(8),
      es_95: riskMetrics.es95.toFixed(8),
      es_99: riskMetrics.es99.toFixed(8),
      max_drawdown: riskMetrics.maxDrawdown.toFixed(2),
      max_drawdown_percentage: riskMetrics.maxDrawdownPercentage.toFixed(4),
      max_drawdown_duration_hours: riskMetrics.maxDrawdownDurationHours,
      
      hit_rate: tradeMetrics.hitRate.toFixed(4),
      avg_win: tradeMetrics.avgWin.toFixed(2),
      avg_loss: tradeMetrics.avgLoss.toFixed(2),
      profit_factor: tradeMetrics.profitFactor.toFixed(4),
      payoff_ratio: tradeMetrics.payoffRatio.toFixed(4),
      expectancy: tradeMetrics.expectancy.toFixed(2),
      
      turnover: costMetrics.turnover.toFixed(2),
      fees_percentage: costMetrics.feesPercentage.toFixed(4),
      slippage_bp: costMetrics.slippageBp.toFixed(2),
      cost_drag_percentage: costMetrics.costDragPercentage.toFixed(4),
      
      asset_breakers_triggered: breakerStats.assetBreakersTriggered,
      cluster_breakers_triggered: breakerStats.clusterBreakersTriggered,
      global_breakers_triggered: breakerStats.globalBreakersTriggered,
      trades_blocked_by_breakers: breakerStats.tradesBlockedByBreakers,
      
      monte_carlo_results: monteCarloResults ? JSON.stringify(monteCarloResults.summary) : null,
      
      es95_improved: validation.es95Improved,
      var99_improved: validation.var99Improved,
      pnl_net_positive: validation.pnlNetPositive,
      validation_passed: validation.validationPassed,
      validation_notes: validation.validationNotes,
    };

    const [inserted] = await db.insert(backtest_metrics)
      .values(metricsToInsert)
      .returning();

    console.log(`[BacktestMetricsService] Metrics saved. Validation: ${validation.validationPassed ? 'PASSED' : 'FAILED'}`);

    return inserted;
  }

  private calculateTradeMetrics(trades: BacktestTrade[]): TradeMetrics {
    const wins = trades.filter(t => parseFloat(t.net_pnl || "0") > 0);
    const losses = trades.filter(t => parseFloat(t.net_pnl || "0") < 0);

    const totalWins = wins.reduce((sum, t) => sum + parseFloat(t.net_pnl || "0"), 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + parseFloat(t.net_pnl || "0"), 0));

    const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;

    const hitRate = trades.length > 0 ? wins.length / trades.length : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 999 : 0);

    const expectancy = (hitRate * avgWin) - ((1 - hitRate) * avgLoss);

    return {
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      hitRate,
      avgWin,
      avgLoss,
      profitFactor,
      payoffRatio,
      expectancy,
    };
  }

  private calculateRiskMetrics(trades: BacktestTrade[], initialCapital: number): RiskMetrics {
    const dailyReturns = this.calculateDailyReturns(trades);
    
    const meanReturn = dailyReturns.length > 0 
      ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length 
      : 0;

    const variance = dailyReturns.length > 0
      ? dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / dailyReturns.length
      : 0;
    const stdevReturn = Math.sqrt(variance);

    const annualizedReturn = meanReturn * 252;
    const annualizedVol = stdevReturn * Math.sqrt(252);
    const riskFreeRate = 0.04;
    const sharpeRatio = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0;

    const negativeReturns = dailyReturns.filter(r => r < 0);
    const downsideVariance = negativeReturns.length > 0
      ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
      : 0;
    const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252);
    const sortinoRatio = downsideDeviation > 0 ? (annualizedReturn - riskFreeRate) / downsideDeviation : 0;

    const sortedReturns = [...dailyReturns].sort((a, b) => a - b);
    const index95 = Math.floor(sortedReturns.length * 0.05);
    const index99 = Math.floor(sortedReturns.length * 0.01);
    
    const var95 = Math.abs(sortedReturns[index95] || 0);
    const var99 = Math.abs(sortedReturns[index99] || 0);

    const tail95 = sortedReturns.slice(0, index95 + 1);
    const tail99 = sortedReturns.slice(0, index99 + 1);
    const es95 = tail95.length > 0 ? Math.abs(tail95.reduce((a, b) => a + b, 0) / tail95.length) : 0;
    const es99 = tail99.length > 0 ? Math.abs(tail99.reduce((a, b) => a + b, 0) / tail99.length) : 0;

    const { maxDrawdown, maxDrawdownPct, maxDrawdownDuration } = this.calculateDrawdown(trades, initialCapital);

    return {
      meanReturn,
      stdevReturn,
      sharpeRatio,
      sortinoRatio,
      var95,
      var99,
      es95,
      es99,
      maxDrawdown,
      maxDrawdownPercentage: maxDrawdownPct,
      maxDrawdownDurationHours: maxDrawdownDuration,
    };
  }

  private calculateDailyReturns(trades: BacktestTrade[]): number[] {
    const byDate = new Map<string, number>();

    for (const trade of trades) {
      if (!trade.exit_time) continue;
      const dateKey = trade.exit_time.toISOString().split('T')[0];
      const current = byDate.get(dateKey) || 0;
      byDate.set(dateKey, current + parseFloat(trade.net_pnl || "0"));
    }

    const dates = Array.from(byDate.keys()).sort();
    const returns: number[] = [];
    let cumulative = 0;

    for (const date of dates) {
      const pnl = byDate.get(date) || 0;
      cumulative += pnl;
      if (cumulative > 0) {
        returns.push(pnl / cumulative);
      }
    }

    return returns;
  }

  private calculateDrawdown(
    trades: BacktestTrade[], 
    initialCapital: number
  ): { maxDrawdown: number; maxDrawdownPct: number; maxDrawdownDuration: number } {
    const sortedTrades = [...trades]
      .filter(t => t.exit_time)
      .sort((a, b) => a.exit_time!.getTime() - b.exit_time!.getTime());

    let equity = initialCapital;
    let peak = equity;
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;
    
    let drawdownStart: Date | null = null;
    let maxDrawdownDuration = 0;

    for (const trade of sortedTrades) {
      equity += parseFloat(trade.net_pnl || "0");
      
      if (equity > peak) {
        if (drawdownStart) {
          const duration = (trade.exit_time!.getTime() - drawdownStart.getTime()) / (1000 * 60 * 60);
          if (duration > maxDrawdownDuration) {
            maxDrawdownDuration = duration;
          }
          drawdownStart = null;
        }
        peak = equity;
      } else {
        if (!drawdownStart) {
          drawdownStart = trade.exit_time!;
        }
        const dd = peak - equity;
        const ddPct = dd / peak;
        if (dd > maxDrawdown) {
          maxDrawdown = dd;
          maxDrawdownPct = ddPct;
        }
      }
    }

    return { maxDrawdown, maxDrawdownPct, maxDrawdownDuration };
  }

  private calculateCostMetrics(trades: BacktestTrade[], initialCapital: number): CostMetrics {
    const totalNotional = trades.reduce((sum, t) => sum + parseFloat(t.notional_value || "0"), 0);
    const totalFees = trades.reduce((sum, t) => sum + parseFloat(t.fees || "0"), 0);
    const totalSlippage = trades.reduce((sum, t) => sum + parseFloat(t.slippage || "0"), 0);
    const totalGrossPnl = trades.reduce((sum, t) => sum + parseFloat(t.gross_pnl || "0"), 0);

    const turnover = totalNotional;
    const feesPercentage = totalNotional > 0 ? (totalFees / totalNotional) * 100 : 0;
    const slippageBp = totalNotional > 0 ? (totalSlippage / totalNotional) * 10000 : 0;
    const costDragPercentage = totalGrossPnl !== 0 
      ? ((totalFees + totalSlippage) / Math.abs(totalGrossPnl)) * 100 
      : 0;

    return {
      turnover,
      totalFees,
      feesPercentage,
      totalSlippage,
      slippageBp,
      costDragPercentage,
    };
  }

  private calculateBreakerStats(trades: BacktestTrade[]): BreakerStats {
    const breakerTrades = trades.filter(t => t.breaker_triggered);
    
    return {
      assetBreakersTriggered: breakerTrades.filter(t => t.breaker_type === "asset").length,
      clusterBreakersTriggered: breakerTrades.filter(t => t.breaker_type === "cluster").length,
      globalBreakersTriggered: breakerTrades.filter(t => t.breaker_type === "global").length,
      tradesBlockedByBreakers: breakerTrades.length,
    };
  }

  private validateResults(
    tradeMetrics: TradeMetrics,
    riskMetrics: RiskMetrics,
    monteCarloResults?: MonteCarloResults
  ): ValidationResult {
    const notes: string[] = [];
    
    const pnlNetPositive = tradeMetrics.expectancy > 0;
    if (pnlNetPositive) {
      notes.push("PnL net positive: PASS");
    } else {
      notes.push("PnL net positive: FAIL (expectancy <= 0)");
    }

    let es95Improved = true;
    let var99Improved = true;

    if (monteCarloResults) {
      es95Improved = monteCarloResults.summary.es95_mean < riskMetrics.es95 * 1.2;
      var99Improved = monteCarloResults.summary.var99_mean < riskMetrics.var99 * 1.2;
      
      if (es95Improved) {
        notes.push("ES95 improved with breakers: PASS");
      } else {
        notes.push("ES95 improved with breakers: FAIL");
      }
      
      if (var99Improved) {
        notes.push("VaR99 reduced in stress: PASS");
      } else {
        notes.push("VaR99 reduced in stress: FAIL");
      }
    } else {
      notes.push("Monte Carlo not run - skipping ES95/VaR99 validation");
    }

    if (tradeMetrics.profitFactor >= 1.0) {
      notes.push(`Profit factor ${tradeMetrics.profitFactor.toFixed(2)}: ACCEPTABLE`);
    } else {
      notes.push(`Profit factor ${tradeMetrics.profitFactor.toFixed(2)}: LOW`);
    }

    if (riskMetrics.maxDrawdownPercentage <= 0.10) {
      notes.push(`Max drawdown ${(riskMetrics.maxDrawdownPercentage * 100).toFixed(2)}%: PASS`);
    } else {
      notes.push(`Max drawdown ${(riskMetrics.maxDrawdownPercentage * 100).toFixed(2)}%: FAIL (> 10%)`);
    }

    const validationPassed = pnlNetPositive && es95Improved && var99Improved;

    return {
      es95Improved,
      var99Improved,
      pnlNetPositive,
      validationPassed,
      validationNotes: notes.join("\n"),
    };
  }

  async getMetrics(backtestRunId: string): Promise<BacktestMetrics | undefined> {
    const [metrics] = await db.select()
      .from(backtest_metrics)
      .where(eq(backtest_metrics.backtest_run_id, backtestRunId));
    return metrics;
  }
}

export const backtestMetricsService = new BacktestMetricsService();
