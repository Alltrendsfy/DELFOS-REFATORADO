import { IStorage } from "../storage";
import { getCircuitBreakerService } from "./circuitBreakerService";
import type { Trade } from "@shared/schema";

interface MonitoringResult {
  assetBreakerTriggered: boolean;
  clusterBreakerTriggered: boolean;
  consecutiveLosses: number;
  clusterAggregatePnl: number;
  clusterAggregatePnlPercentage: number;
}

export class TradeMonitoringService {
  private circuitBreakerService: CircuitBreakerService;

  constructor(private storage: IStorage) {
    this.circuitBreakerService = getCircuitBreakerService(storage);
  }

  async monitorTradeAndTriggerBreakers(trade: Trade): Promise<MonitoringResult> {
    const result: MonitoringResult = {
      assetBreakerTriggered: false,
      clusterBreakerTriggered: false,
      consecutiveLosses: 0,
      clusterAggregatePnl: 0,
      clusterAggregatePnlPercentage: 0,
    };

    const portfolioId = trade.portfolio_id;
    const symbol = trade.symbol;
    const isLoss = parseFloat(trade.realized_pnl) < 0;

    let assetBreaker = await this.storage.getAssetBreaker(portfolioId, symbol);
    if (!assetBreaker) {
      await this.circuitBreakerService.createAssetBreakerIfNotExists(portfolioId, symbol);
      assetBreaker = await this.storage.getAssetBreaker(portfolioId, symbol);
    }

    if (!isLoss) {
      await this.resetConsecutiveLosses(portfolioId, symbol);
      return result;
    }

    const consecutiveLosses = await this.checkConsecutiveLosses(portfolioId, symbol);
    result.consecutiveLosses = consecutiveLosses;

    const maxConsecutiveLosses = assetBreaker?.max_consecutive_losses ?? 2;
    const maxTotalLossUsd = assetBreaker?.max_total_loss_usd 
      ? parseFloat(assetBreaker.max_total_loss_usd) 
      : 500;

    const totalLossAmount = await this.calculateTotalLossAmount(portfolioId, symbol, maxTotalLossUsd);
    
    if (assetBreaker) {
      await this.storage.updateAssetBreaker(assetBreaker.id, {
        consecutive_losses: consecutiveLosses,
        total_loss_amount: totalLossAmount.toFixed(2),
      });
    }

    if (consecutiveLosses >= maxConsecutiveLosses && totalLossAmount >= maxTotalLossUsd) {
      await this.circuitBreakerService.triggerAssetBreaker(
        portfolioId,
        symbol,
        `${consecutiveLosses} consecutive losses AND $${totalLossAmount.toFixed(2)} total loss (thresholds: ${maxConsecutiveLosses} losses, $${maxTotalLossUsd} USD)`,
        consecutiveLosses,
        totalLossAmount
      );

      result.assetBreakerTriggered = true;
      
      console.log(`[TradeMonitoring] Asset breaker triggered for ${symbol}: ${consecutiveLosses} consecutive losses AND $${totalLossAmount.toFixed(2)} total loss (both thresholds met)`);
    }

    const clusterNumber = await this.storage.getClusterNumberForSymbol(symbol);
    if (clusterNumber !== null) {
      const clusterPnl = await this.checkClusterAggregatePnl(portfolioId, clusterNumber, symbol);
      result.clusterAggregatePnl = clusterPnl.totalPnl;
      result.clusterAggregatePnlPercentage = clusterPnl.percentageOfCapital;

      const clusterBreaker = await this.storage.getClusterBreaker(portfolioId, clusterNumber);
      const clusterLossThreshold = clusterBreaker?.max_aggregate_loss_percentage 
        ? parseFloat(clusterBreaker.max_aggregate_loss_percentage) 
        : -1.5;

      if (clusterPnl.percentageOfCapital <= clusterLossThreshold) {
        const symbolsInCluster = await this.storage.getSymbolsInCluster(clusterNumber);
        
        await this.circuitBreakerService.triggerClusterBreaker(
          portfolioId,
          clusterNumber,
          `Aggregate cluster PnL ${clusterPnl.percentageOfCapital.toFixed(2)}% (threshold: ${clusterLossThreshold}%)`,
          clusterPnl.percentageOfCapital,
          symbolsInCluster.length
        );

        result.clusterBreakerTriggered = true;
        
        console.log(`[TradeMonitoring] Cluster breaker triggered for cluster ${clusterNumber}: ${clusterPnl.percentageOfCapital.toFixed(2)}% loss`);
      }
    }

    return result;
  }

  private async checkConsecutiveLosses(portfolioId: string, symbol: string): Promise<number> {
    let consecutiveLosses = 0;
    let offset = 0;
    const batchSize = 50;
    let foundWin = false;

    while (!foundWin) {
      const batch = await this.storage.getRecentTradesBySymbol(portfolioId, symbol, batchSize, offset);
      
      if (batch.length === 0) {
        break;
      }

      for (const trade of batch) {
        const pnl = parseFloat(trade.realized_pnl);
        if (pnl < 0) {
          consecutiveLosses++;
        } else {
          foundWin = true;
          break;
        }
      }

      if (batch.length < batchSize) {
        break;
      }

      offset += batchSize;
    }

    return consecutiveLosses;
  }

  private async resetConsecutiveLosses(portfolioId: string, symbol: string): Promise<void> {
    const breaker = await this.storage.getAssetBreaker(portfolioId, symbol);
    if (breaker && breaker.consecutive_losses > 0 && !breaker.is_triggered) {
      await this.storage.updateAssetBreaker(breaker.id, {
        consecutive_losses: 0,
      });
      
      console.log(`[TradeMonitoring] Reset consecutive losses for ${symbol} after winning trade (total_loss_amount preserved for USD threshold)`);
    }
  }

  private async calculateTotalLossAmount(portfolioId: string, symbol: string, maxThresholdUsd: number): Promise<number> {
    let totalLoss = 0;
    let offset = 0;
    const batchSize = 50;

    while (true) {
      const batch = await this.storage.getRecentTradesBySymbol(portfolioId, symbol, batchSize, offset);
      
      if (batch.length === 0) {
        break;
      }

      for (const trade of batch) {
        const pnl = parseFloat(trade.realized_pnl);
        if (pnl < 0) {
          totalLoss += Math.abs(pnl);
          
          if (totalLoss >= maxThresholdUsd) {
            return totalLoss;
          }
        }
      }

      if (batch.length < batchSize) {
        break;
      }

      offset += batchSize;
    }

    return totalLoss;
  }

  private async checkClusterAggregatePnl(
    portfolioId: string,
    clusterNumber: number,
    currentSymbol: string
  ): Promise<{ totalPnl: number; percentageOfCapital: number }> {
    let symbolsInCluster = await this.storage.getSymbolsInCluster(clusterNumber);
    
    if (symbolsInCluster.length === 0) {
      symbolsInCluster = [currentSymbol];
    }
    
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let totalPnl = 0;
    for (const symbol of symbolsInCluster) {
      const trades = await this.storage.getTradesBySymbolSince(portfolioId, symbol, last24Hours);
      for (const trade of trades) {
        totalPnl += parseFloat(trade.realized_pnl);
      }
    }

    const portfolio = await this.storage.getPortfolio(portfolioId);
    const capital = portfolio ? parseFloat(portfolio.total_value_usd) : 100000;
    const percentageOfCapital = (totalPnl / capital) * 100;

    return { totalPnl, percentageOfCapital };
  }
}
