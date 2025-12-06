import { storage } from "../storage";
import type { Trade, Position, PerformanceSnapshot } from "@shared/schema";
import { observabilityService } from "./observabilityService";

export interface PerformanceOverview {
  totalPnL: number;
  totalPnLPercentage: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  bestTrade: {
    pnl: number;
    symbol: string;
    date: Date;
  } | null;
  worstTrade: {
    pnl: number;
    symbol: string;
    date: Date;
  } | null;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
}

export interface DrawdownMetrics {
  currentDrawdown: number;
  currentDrawdownPercentage: number;
  maxDrawdown: number;
  maxDrawdownPercentage: number;
  recoveryPercentage: number;
  peakEquity: number;
  currentEquity: number;
}

export interface PerformanceChartData {
  date: Date;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  cumulativeFees: number;
}

export class PerformanceService {
  async getOverview(portfolioId: string): Promise<PerformanceOverview> {
    const trades = await storage.getTradesByPortfolioId(portfolioId);
    
    if (trades.length === 0) {
      return {
        totalPnL: 0,
        totalPnLPercentage: 0,
        winRate: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        bestTrade: null,
        worstTrade: null,
        averageWin: 0,
        averageLoss: 0,
        profitFactor: 0,
      };
    }

    const totalPnL = trades.reduce((sum, trade) => sum + Number(trade.realized_pnl), 0);
    const winningTrades = trades.filter(t => Number(t.realized_pnl) > 0);
    const losingTrades = trades.filter(t => Number(t.realized_pnl) < 0);
    
    const totalWins = winningTrades.reduce((sum, t) => sum + Number(t.realized_pnl), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + Number(t.realized_pnl), 0));
    
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    const averageWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;

    // Find best and worst trades
    let bestTrade = null;
    let worstTrade = null;

    if (trades.length > 0) {
      const sortedByPnL = [...trades].sort((a, b) => Number(b.realized_pnl) - Number(a.realized_pnl));
      const best = sortedByPnL[0];
      const worst = sortedByPnL[sortedByPnL.length - 1];

      bestTrade = {
        pnl: Number(best.realized_pnl),
        symbol: best.symbol,
        date: best.closed_at,
      };

      worstTrade = {
        pnl: Number(worst.realized_pnl),
        symbol: worst.symbol,
        date: worst.closed_at,
      };
    }

    // Calculate total PnL percentage (average of all trade percentages)
    const totalPnLPercentage = trades.length > 0 
      ? trades.reduce((sum, t) => sum + Number(t.realized_pnl_percentage), 0) / trades.length
      : 0;

    const result = {
      totalPnL,
      totalPnLPercentage,
      winRate,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      bestTrade,
      worstTrade,
      averageWin,
      averageLoss,
      profitFactor,
    };
    
    // Update Prometheus metrics
    observabilityService.updatePerformanceMetrics(portfolioId, {
      hitRate: winRate,
      avgWin: averageWin,
      avgLoss: averageLoss,
      profitFactor: profitFactor,
    });
    
    return result;
  }

  async getDrawdownMetrics(portfolioId: string): Promise<DrawdownMetrics> {
    const snapshots = await storage.getSnapshotsByPortfolioId(portfolioId, 1000);
    
    if (snapshots.length === 0) {
      // No historical data, return zeros
      return {
        currentDrawdown: 0,
        currentDrawdownPercentage: 0,
        maxDrawdown: 0,
        maxDrawdownPercentage: 0,
        recoveryPercentage: 0,
        peakEquity: 0,
        currentEquity: 0,
      };
    }

    // Reverse to get chronological order (oldest first)
    const chronological = [...snapshots].reverse();
    
    let peakEquity = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercentage = 0;

    // Calculate max drawdown
    for (const snapshot of chronological) {
      const equity = Number(snapshot.equity_usd);
      
      if (equity > peakEquity) {
        peakEquity = equity;
      }

      const drawdown = peakEquity - equity;
      const drawdownPercentage = peakEquity > 0 ? (drawdown / peakEquity) * 100 : 0;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercentage = drawdownPercentage;
      }
    }

    // Current metrics
    const latestSnapshot = snapshots[0]; // Most recent
    const currentEquity = Number(latestSnapshot.equity_usd);
    const currentDrawdown = peakEquity - currentEquity;
    const currentDrawdownPercentage = peakEquity > 0 ? (currentDrawdown / peakEquity) * 100 : 0;
    const recoveryPercentage = maxDrawdown > 0 && currentDrawdown > 0 
      ? ((maxDrawdown - currentDrawdown) / maxDrawdown) * 100 
      : currentDrawdown === 0 ? 100 : 0;

    return {
      currentDrawdown,
      currentDrawdownPercentage,
      maxDrawdown,
      maxDrawdownPercentage,
      recoveryPercentage,
      peakEquity,
      currentEquity,
    };
  }

  async getChartData(portfolioId: string, limit: number = 100): Promise<PerformanceChartData[]> {
    const snapshots = await storage.getSnapshotsByPortfolioId(portfolioId, limit);
    
    if (snapshots.length === 0) {
      return [];
    }

    // Reverse to get chronological order
    return [...snapshots].reverse().map(snapshot => ({
      date: snapshot.snapshot_at,
      equity: Number(snapshot.equity_usd),
      realizedPnL: Number(snapshot.realized_pnl),
      unrealizedPnL: Number(snapshot.unrealized_pnl),
      cumulativeFees: Number(snapshot.cumulative_fees),
    }));
  }

  async createPerformanceSnapshot(portfolioId: string): Promise<PerformanceSnapshot> {
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error("Portfolio not found");
    }

    const trades = await storage.getTradesByPortfolioId(portfolioId);
    const positions = await storage.getPositionsByPortfolioId(portfolioId);

    const realizedPnL = trades.reduce((sum, trade) => sum + Number(trade.realized_pnl), 0);
    const unrealizedPnL = positions.reduce((sum, pos) => sum + Number(pos.unrealized_pnl), 0);
    const cumulativeFees = trades.reduce((sum, trade) => sum + Number(trade.fees), 0);
    const equityUsd = Number(portfolio.total_value_usd);

    return await storage.createSnapshot({
      portfolio_id: portfolioId,
      equity_usd: equityUsd.toFixed(2),
      realized_pnl: realizedPnL.toFixed(2),
      unrealized_pnl: unrealizedPnL.toFixed(2),
      cumulative_fees: cumulativeFees.toFixed(8),
    });
  }
}

export const performanceService = new PerformanceService();
