import { storage } from "../../storage";
import type { Position, Portfolio } from "../../../shared/schema";
import { getCircuitBreakerService } from "../circuitBreakerService";

export interface ClusterExposure {
  clusterNumber: number;
  currentEquity: number;
  currentPercent: number;
  targetPercent: number;
  deviationPercent: number;
  symbols: string[];
}

export interface RebalanceTrade {
  symbol: string;
  side: "buy" | "sell";
  quantityUsd: number;
  reason: string;
}

export interface RebalancePlan {
  portfolioId: string;
  totalEquity: number;
  clusterExposures: ClusterExposure[];
  trades: RebalanceTrade[];
  estimatedCost: number;
  requiresRebalance: boolean;
  reason?: string;
}

/**
 * RebalanceService - Manages portfolio rebalancing across clusters
 * 
 * Core responsibilities:
 * - Calculate current cluster exposure
 * - Determine equal-weight target allocation
 * - Generate rebalancing trades to minimize deviation
 * - Validate cluster caps (12-15% equity max)
 */
export class RebalanceService {
  // Thresholds
  private readonly REBALANCE_THRESHOLD_PCT = 0.02; // 2% deviation triggers rebalance
  private readonly MIN_CLUSTER_CAP_PCT = 0.12; // 12% minimum per cluster
  private readonly MAX_CLUSTER_CAP_PCT = 0.15; // 15% maximum per cluster
  private readonly MIN_TRADE_SIZE_USD = 10; // Skip trades smaller than $10

  /**
   * Calculate rebalancing plan for a portfolio
   */
  async calculateRebalance(portfolioId: string): Promise<RebalancePlan> {
    console.log(`📊 Calculating rebalance plan for portfolio ${portfolioId}...`);

    // 1. Get portfolio
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // 2. Get active positions (all positions in table are considered open)
    const activePositions = await storage.getPositionsByPortfolioId(portfolioId);

    if (activePositions.length === 0) {
      return {
        portfolioId,
        totalEquity: parseFloat(portfolio.total_value_usd),
        clusterExposures: [],
        trades: [],
        estimatedCost: 0,
        requiresRebalance: false,
        reason: "No active positions to rebalance",
      };
    }

    // 3. Calculate total equity (balance + unrealized PnL)
    const totalEquity = await this.calculateTotalEquity(portfolio, activePositions);

    // 4. Calculate cluster exposures
    const clusterExposures = await this.calculateClusterExposures(activePositions, totalEquity);

    if (clusterExposures.length === 0) {
      return {
        portfolioId,
        totalEquity,
        clusterExposures: [],
        trades: [],
        estimatedCost: 0,
        requiresRebalance: false,
        reason: "No cluster assignments found",
      };
    }

    // 5. Determine target allocation (equal-weight across active clusters)
    const targetPercent = 1.0 / clusterExposures.length;

    // 6. Update exposures with target and deviation
    const exposuresWithTargets = clusterExposures.map(exp => ({
      ...exp,
      targetPercent,
      deviationPercent: exp.currentPercent - targetPercent,
    }));

    // 7. Check if rebalancing is needed
    const maxDeviation = Math.max(...exposuresWithTargets.map(e => Math.abs(e.deviationPercent)));
    
    if (maxDeviation < this.REBALANCE_THRESHOLD_PCT) {
      return {
        portfolioId,
        totalEquity,
        clusterExposures: exposuresWithTargets,
        trades: [],
        estimatedCost: 0,
        requiresRebalance: false,
        reason: `All clusters within ${this.REBALANCE_THRESHOLD_PCT * 100}% threshold`,
      };
    }

    // 8. Generate rebalancing trades
    const trades = this.generateRebalanceTrades(exposuresWithTargets, totalEquity);

    // 9. Estimate cost (simplified: 0.2% round-trip cost)
    const estimatedCost = trades.reduce((sum, t) => sum + (t.quantityUsd * 0.002), 0);

    console.log(`✅ Generated ${trades.length} rebalancing trades`);

    return {
      portfolioId,
      totalEquity,
      clusterExposures: exposuresWithTargets,
      trades,
      estimatedCost,
      requiresRebalance: true,
    };
  }

  /**
   * Calculate total portfolio equity (total_value_usd + unrealized PnL)
   */
  private async calculateTotalEquity(
    portfolio: Portfolio,
    positions: Position[]
  ): Promise<number> {
    const balance = parseFloat(portfolio.total_value_usd);
    
    // Sum unrealized PnL from all open positions
    const unrealizedPnl = positions.reduce((sum, pos) => {
      const pnl = pos.unrealized_pnl ? parseFloat(pos.unrealized_pnl) : 0;
      return sum + pnl;
    }, 0);

    return balance + unrealizedPnl;
  }

  /**
   * Calculate exposure by cluster
   */
  private async calculateClusterExposures(
    positions: Position[],
    totalEquity: number
  ): Promise<ClusterExposure[]> {
    // Get latest asset selection run to get cluster assignments
    const latestRunId = await storage.getLatestRunId();
    if (!latestRunId) {
      console.warn("⚠️ No asset selection runs found");
      return [];
    }

    const rankings = await storage.getRankingsByRunId(latestRunId);

    // Build symbol -> cluster map
    const symbolClusterMap = new Map<string, number>();
    for (const ranking of rankings) {
      if (ranking.cluster_number !== null && ranking.cluster_number !== undefined) {
        const symbol = await storage.getSymbol(ranking.symbol_id);
        if (symbol) {
          symbolClusterMap.set(symbol.symbol, ranking.cluster_number);
        }
      }
    }

    // Group positions by cluster
    const clusterMap = new Map<number, { equity: number; symbols: Set<string> }>();

    for (const position of positions) {
      const positionSymbol = position.symbol; // e.g., "BTC/USD"
      
      const clusterNumber = symbolClusterMap.get(positionSymbol);
      if (clusterNumber === undefined) {
        console.warn(`⚠️ No cluster assignment for symbol ${positionSymbol}`);
        continue;
      }

      // Use current_price for mark-to-market value (not entry_price)
      const positionValue = parseFloat(position.quantity) * parseFloat(position.current_price);

      if (!clusterMap.has(clusterNumber)) {
        clusterMap.set(clusterNumber, { equity: 0, symbols: new Set() });
      }

      const cluster = clusterMap.get(clusterNumber)!;
      cluster.equity += positionValue;
      cluster.symbols.add(positionSymbol);
    }

    // Convert to ClusterExposure array
    const exposures: ClusterExposure[] = [];
    for (const [clusterNumber, data] of Array.from(clusterMap.entries())) {
      exposures.push({
        clusterNumber,
        currentEquity: data.equity,
        currentPercent: data.equity / totalEquity,
        targetPercent: 0, // Will be set later
        deviationPercent: 0, // Will be set later
        symbols: Array.from(data.symbols),
      });
    }

    return exposures.sort((a, b) => a.clusterNumber - b.clusterNumber);
  }

  /**
   * Generate rebalancing trades to bring clusters to target allocation
   */
  private generateRebalanceTrades(
    exposures: ClusterExposure[],
    totalEquity: number
  ): RebalanceTrade[] {
    const trades: RebalanceTrade[] = [];

    // Identify overweight and underweight clusters
    const overweight = exposures.filter(e => e.deviationPercent > this.REBALANCE_THRESHOLD_PCT);
    const underweight = exposures.filter(e => e.deviationPercent < -this.REBALANCE_THRESHOLD_PCT);

    // Generate sell trades for overweight clusters
    for (const cluster of overweight) {
      const excessEquity = cluster.deviationPercent * totalEquity;
      
      // Pick first symbol in cluster (can be enhanced to pick most liquid)
      const symbol = cluster.symbols[0];
      
      if (excessEquity >= this.MIN_TRADE_SIZE_USD) {
        trades.push({
          symbol,
          side: "sell",
          quantityUsd: Math.round(excessEquity * 100) / 100,
          reason: `Cluster ${cluster.clusterNumber} overweight by ${(cluster.deviationPercent * 100).toFixed(2)}%`,
        });
      }
    }

    // Generate buy trades for underweight clusters
    for (const cluster of underweight) {
      const deficitEquity = Math.abs(cluster.deviationPercent) * totalEquity;
      
      // Pick first symbol in cluster
      const symbol = cluster.symbols[0];
      
      if (deficitEquity >= this.MIN_TRADE_SIZE_USD) {
        trades.push({
          symbol,
          side: "buy",
          quantityUsd: Math.round(deficitEquity * 100) / 100,
          reason: `Cluster ${cluster.clusterNumber} underweight by ${(Math.abs(cluster.deviationPercent) * 100).toFixed(2)}%`,
        });
      }
    }

    return trades;
  }

  /**
   * Validate cluster caps before executing rebalance
   */
  validateClusterCaps(exposures: ClusterExposure[]): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const exposure of exposures) {
      if (exposure.targetPercent > this.MAX_CLUSTER_CAP_PCT) {
        violations.push(
          `Cluster ${exposure.clusterNumber}: target ${(exposure.targetPercent * 100).toFixed(1)}% exceeds max ${this.MAX_CLUSTER_CAP_PCT * 100}%`
        );
      }
      
      if (exposure.targetPercent < this.MIN_CLUSTER_CAP_PCT) {
        violations.push(
          `Cluster ${exposure.clusterNumber}: target ${(exposure.targetPercent * 100).toFixed(1)}% below min ${this.MIN_CLUSTER_CAP_PCT * 100}%`
        );
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Validate circuit breakers before executing rebalance
   */
  async validateCircuitBreakers(portfolioId: string, trades: RebalanceTrade[]): Promise<{ valid: boolean; blockedSymbols: string[] }> {
    const blockedSymbols: string[] = [];
    const circuitBreakerService = getCircuitBreakerService(storage);

    // Check each unique symbol involved in trades
    const uniqueSymbols = Array.from(new Set(trades.map(t => t.symbol)));

    for (const symbol of uniqueSymbols) {
      const canTrade = await circuitBreakerService.canTradeSymbol(portfolioId, symbol);
      if (!canTrade) {
        blockedSymbols.push(symbol);
      }
    }

    return {
      valid: blockedSymbols.length === 0,
      blockedSymbols,
    };
  }

  /**
   * Execute rebalancing plan
   * 
   * @param portfolioId - Portfolio to rebalance
   * @param dryRun - If true, don't execute trades, just log what would happen
   * @param preComputedPlan - Optional pre-computed plan (avoids recalculation and re-validation)
   */
  async executeRebalance(
    portfolioId: string, 
    dryRun: boolean = false,
    preComputedPlan?: RebalancePlan
  ): Promise<{
    success: boolean;
    tradesExecuted: number;
    totalCost: number;
    logId: string | null;
    errors: string[];
  }> {
    console.log(`🔄 Starting rebalance execution for portfolio ${portfolioId} (dryRun: ${dryRun})...`);

    try {
      // 1. Use pre-computed plan or calculate new one
      const plan = preComputedPlan || await this.calculateRebalance(portfolioId);

      if (!plan.requiresRebalance) {
        console.log(`✅ No rebalancing needed: ${plan.reason}`);
        return {
          success: true,
          tradesExecuted: 0,
          totalCost: 0,
          logId: null,
          errors: [],
        };
      }

      // 2. Validate cluster caps only if plan was not pre-validated
      if (!preComputedPlan) {
        const capsValidation = this.validateClusterCaps(plan.clusterExposures);
        if (!capsValidation.valid) {
          console.error(`❌ Cluster caps validation failed:`, capsValidation.violations);
          return {
            success: false,
            tradesExecuted: 0,
            totalCost: 0,
            logId: null,
            errors: capsValidation.violations,
          };
        }
      }

      const errors: string[] = [];
      let tradesExecuted = 0;
      let totalCost = 0;

      if (!dryRun) {
        // 3. Execute trades
        // TODO: Implement actual trade execution using TradingService
        // For MVP, we'll just log the intent
        console.log(`📊 Would execute ${plan.trades.length} trades:`);
        for (const trade of plan.trades) {
          console.log(`  ${trade.side.toUpperCase()} $${trade.quantityUsd} of ${trade.symbol} - ${trade.reason}`);
          tradesExecuted++;
        }
        
        totalCost = plan.estimatedCost;
      }

      // 4. Create rebalance log with portfolio-first schema
      const log = await storage.createRebalanceLog({
        portfolio_id: portfolioId,
        campaign_id: null, // Optional campaign tracking
        run_id: null, // Optional run tracking
        status: dryRun ? "dry_run" : "completed",
        trades_executed: tradesExecuted,
        total_cost_usd: totalCost.toString(),
        reason: `Rebalanced ${plan.clusterExposures.length} clusters`,
        metadata: {
          clusterExposures: plan.clusterExposures,
          trades: plan.trades,
          totalEquity: plan.totalEquity,
        },
      });

      console.log(`✅ Rebalance ${dryRun ? "dry-run" : "execution"} completed (log: ${log.id})`);

      return {
        success: true,
        tradesExecuted,
        totalCost,
        logId: log.id,
        errors,
      };
    } catch (error) {
      console.error(`❌ Rebalance execution failed:`, error);
      return {
        success: false,
        tradesExecuted: 0,
        totalCost: 0,
        logId: null,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}

export const rebalanceService = new RebalanceService();
