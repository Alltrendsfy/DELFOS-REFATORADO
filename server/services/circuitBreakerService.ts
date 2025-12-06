import { IStorage } from "../storage";
import type { AssetBreaker, ClusterBreaker, CircuitBreakerEvent, InsertAssetBreaker, InsertClusterBreaker, InsertCircuitBreakerEvent } from "@shared/schema";
import { observabilityService } from "./observabilityService";

interface BreakerCheckResult {
  allowed: boolean;
  level?: "asset" | "cluster" | "global" | "data_stale_warn" | "data_stale_hard" | "data_stale_kill";
  reason?: string;
  breakerId?: string;
}

interface DataStalenessBreaker {
  level: "warn" | "hard" | "kill";
  triggeredAt: number;
  reason: string;
  affectedSymbolsCount: number;
}

export class CircuitBreakerService {
  // In-memory staleness breakers (not persisted to DB)
  private stalenessBreakers: Map<string, DataStalenessBreaker> = new Map(); // portfolioId -> breaker

  constructor(private storage: IStorage) {}

  async canTradeSymbol(portfolioId: string, symbol: string): Promise<BreakerCheckResult> {
    // Check staleness breakers first (data quality is critical)
    const stalenessCheck = this.checkStalenessBreaker(portfolioId);
    if (!stalenessCheck.allowed) {
      return stalenessCheck;
    }

    const assetCheck = await this.checkAssetBreaker(portfolioId, symbol);
    if (!assetCheck.allowed) {
      return assetCheck;
    }

    const clusterNumber = await this.storage.getClusterNumberForSymbol(symbol);
    if (clusterNumber !== null) {
      const clusterCheck = await this.checkClusterBreaker(portfolioId, clusterNumber);
      if (!clusterCheck.allowed) {
        return clusterCheck;
      }
    }

    const globalCheck = await this.checkGlobalBreaker(portfolioId);
    if (!globalCheck.allowed) {
      return globalCheck;
    }

    return { allowed: true };
  }

  // === Data Staleness Circuit Breakers ===

  checkStalenessBreaker(portfolioId: string): BreakerCheckResult {
    const breaker = this.stalenessBreakers.get(portfolioId);
    
    if (!breaker) {
      return { allowed: true };
    }

    // KILL level: pause all trading
    if (breaker.level === "kill") {
      observabilityService.updateBreakerState('data_quality', 'global_staleness', portfolioId, 2);
      return {
        allowed: false,
        level: "data_stale_kill",
        reason: `Data staleness kill switch active: ${breaker.reason}`,
        breakerId: `staleness_${portfolioId}`,
      };
    }

    // HARD level: zero signals, block new positions
    if (breaker.level === "hard") {
      observabilityService.updateBreakerState('data_quality', 'global_staleness', portfolioId, 2);
      return {
        allowed: false,
        level: "data_stale_hard",
        reason: `Data staleness hard limit: ${breaker.reason}`,
        breakerId: `staleness_${portfolioId}`,
      };
    }

    // WARN level: block new positions only
    if (breaker.level === "warn") {
      observabilityService.updateBreakerState('data_quality', 'global_staleness', portfolioId, 1);
      return {
        allowed: false,
        level: "data_stale_warn",
        reason: `Data staleness warning: ${breaker.reason}`,
        breakerId: `staleness_${portfolioId}`,
      };
    }

    return { allowed: true };
  }

  triggerStalenessBreaker(
    portfolioId: string,
    level: "warn" | "hard" | "kill",
    reason: string,
    affectedSymbolsCount: number = 0
  ): void {
    const breaker: DataStalenessBreaker = {
      level,
      triggeredAt: Date.now(),
      reason,
      affectedSymbolsCount,
    };

    this.stalenessBreakers.set(portfolioId, breaker);

    const levelLabel = level === "warn" ? "WARN (>3s)" : level === "hard" ? "HARD (>10s)" : "KILL (>60s)";
    console.warn(`⚠️  Staleness Circuit Breaker ${levelLabel} triggered for portfolio ${portfolioId}: ${reason}`);
    
    // Update Prometheus metric
    observabilityService.updateBreakerState('data_quality', 'global_staleness', portfolioId, level === "warn" ? 1 : 2);
  }

  resetStalenessBreaker(portfolioId: string): void {
    const breaker = this.stalenessBreakers.get(portfolioId);
    
    if (breaker) {
      console.log(`✅ Staleness Circuit Breaker reset for portfolio ${portfolioId} (was: ${breaker.level})`);
      this.stalenessBreakers.delete(portfolioId);
      
      // Update Prometheus metric
      observabilityService.updateBreakerState('data_quality', 'global_staleness', portfolioId, 0);
    }
  }

  getStalenessBreaker(portfolioId: string): DataStalenessBreaker | undefined {
    return this.stalenessBreakers.get(portfolioId);
  }

  async checkAssetBreaker(portfolioId: string, symbol: string): Promise<BreakerCheckResult> {
    const breaker = await this.storage.getAssetBreaker(portfolioId, symbol);
    
    if (!breaker) {
      return { allowed: true };
    }

    if (breaker.is_triggered) {
      // Update metric: 2 = triggered
      observabilityService.updateBreakerState('asset', symbol, portfolioId, 2);
      return {
        allowed: false,
        level: "asset",
        reason: `Asset ${symbol} blocked: ${breaker.trigger_reason}`,
        breakerId: breaker.id,
      };
    }

    // Update metric: 0 = normal
    observabilityService.updateBreakerState('asset', symbol, portfolioId, 0);
    return { allowed: true };
  }

  async checkClusterBreaker(portfolioId: string, clusterNumber: number): Promise<BreakerCheckResult> {
    const breaker = await this.storage.getClusterBreaker(portfolioId, clusterNumber);
    
    if (!breaker) {
      return { allowed: true };
    }

    if (breaker.is_triggered) {
      // Update metric: 2 = triggered
      observabilityService.updateBreakerState('cluster', `c${clusterNumber}`, portfolioId, 2);
      return {
        allowed: false,
        level: "cluster",
        reason: `Cluster ${clusterNumber} blocked: ${breaker.trigger_reason}`,
        breakerId: breaker.id,
      };
    }

    // Update metric: 0 = normal
    observabilityService.updateBreakerState('cluster', `c${clusterNumber}`, portfolioId, 0);
    return { allowed: true };
  }

  async checkGlobalBreaker(portfolioId: string): Promise<BreakerCheckResult> {
    const riskParams = await this.storage.getRiskParametersByPortfolioId(portfolioId);
    
    if (!riskParams) {
      return { allowed: true };
    }

    if (riskParams.circuit_breaker_triggered) {
      // Update metric: 2 = triggered
      observabilityService.updateBreakerState('global', portfolioId, portfolioId, 2);
      return {
        allowed: false,
        level: "global",
        reason: "Global circuit breaker triggered - daily loss limit exceeded",
        breakerId: riskParams.id,
      };
    }

    // Update metric: 0 = normal
    observabilityService.updateBreakerState('global', portfolioId, portfolioId, 0);
    return { allowed: true };
  }

  async createAssetBreakerIfNotExists(portfolioId: string, symbol: string): Promise<void> {
    const existing = await this.storage.getAssetBreaker(portfolioId, symbol);
    if (!existing) {
      const newBreaker: InsertAssetBreaker = {
        portfolio_id: portfolioId,
        symbol,
        is_triggered: false,
        consecutive_losses: 0,
        total_loss_amount: "0",
        max_consecutive_losses: 2,
        max_total_loss_usd: "500",
        auto_reset_hours: 24,
      };
      await this.storage.createAssetBreaker(newBreaker);
    }
  }

  async triggerAssetBreaker(
    portfolioId: string,
    symbol: string,
    reason: string,
    consecutiveLosses: number,
    totalLossAmount: number,
  ): Promise<void> {
    let breaker = await this.storage.getAssetBreaker(portfolioId, symbol);
    
    if (!breaker) {
      const newBreaker: InsertAssetBreaker = {
        portfolio_id: portfolioId,
        symbol,
        is_triggered: true,
        trigger_reason: reason,
        consecutive_losses: consecutiveLosses,
        total_loss_amount: totalLossAmount.toFixed(2),
        triggered_at: new Date(),
        auto_reset_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // +24h
      };
      breaker = await this.storage.createAssetBreaker(newBreaker);
    } else {
      const updated = await this.storage.updateAssetBreaker(breaker.id, {
        is_triggered: true,
        trigger_reason: reason,
        consecutive_losses: consecutiveLosses,
        total_loss_amount: totalLossAmount.toFixed(2),
        triggered_at: new Date(),
        auto_reset_at: new Date(Date.now() + Number(breaker.auto_reset_hours) * 60 * 60 * 1000),
      });
      if (!updated) {
        throw new Error(`Failed to update asset breaker for ${symbol}`);
      }
      breaker = updated;
    }

    // Update metric: 2 = triggered
    observabilityService.updateBreakerState('asset', symbol, portfolioId, 2);
    
    await this.logEvent({
      portfolio_id: portfolioId,
      breaker_level: "asset",
      breaker_id: breaker.id,
      event_type: "triggered",
      symbol,
      reason,
      metadata: { consecutiveLosses, totalLossAmount },
    });
  }

  async resetAssetBreaker(portfolioId: string, symbol: string): Promise<void> {
    const breaker = await this.storage.getAssetBreaker(portfolioId, symbol);
    
    if (!breaker) {
      return;
    }

    await this.storage.updateAssetBreaker(breaker.id, {
      is_triggered: false,
      trigger_reason: null,
      consecutive_losses: 0,
      total_loss_amount: "0",
      triggered_at: null,
      auto_reset_at: null,
    });

    // Update metric: 0 = normal
    observabilityService.updateBreakerState('asset', symbol, portfolioId, 0);

    await this.logEvent({
      portfolio_id: portfolioId,
      breaker_level: "asset",
      breaker_id: breaker.id,
      event_type: "reset",
      symbol,
      reason: "Manual reset",
    });
  }

  async triggerClusterBreaker(
    portfolioId: string,
    clusterNumber: number,
    reason: string,
    aggregateLossPercentage: number,
    affectedAssetsCount: number,
  ): Promise<void> {
    let breaker = await this.storage.getClusterBreaker(portfolioId, clusterNumber);
    
    if (!breaker) {
      const newBreaker: InsertClusterBreaker = {
        portfolio_id: portfolioId,
        cluster_number: clusterNumber,
        is_triggered: true,
        trigger_reason: reason,
        aggregate_loss_percentage: aggregateLossPercentage.toFixed(4),
        affected_assets_count: affectedAssetsCount,
        triggered_at: new Date(),
        auto_reset_at: new Date(Date.now() + 12 * 60 * 60 * 1000), // +12h
      };
      breaker = await this.storage.createClusterBreaker(newBreaker);
    } else {
      const updated = await this.storage.updateClusterBreaker(breaker.id, {
        is_triggered: true,
        trigger_reason: reason,
        aggregate_loss_percentage: aggregateLossPercentage.toFixed(4),
        affected_assets_count: affectedAssetsCount,
        triggered_at: new Date(),
        auto_reset_at: new Date(Date.now() + Number(breaker.auto_reset_hours) * 60 * 60 * 1000),
      });
      if (!updated) {
        throw new Error(`Failed to update cluster breaker for cluster ${clusterNumber}`);
      }
      breaker = updated;
    }

    // Update metric: 2 = triggered
    observabilityService.updateBreakerState('cluster', `c${clusterNumber}`, portfolioId, 2);
    
    await this.logEvent({
      portfolio_id: portfolioId,
      breaker_level: "cluster",
      breaker_id: breaker.id,
      event_type: "triggered",
      cluster_number: clusterNumber,
      reason,
      metadata: { aggregateLossPercentage, affectedAssetsCount },
    });
  }

  async resetClusterBreaker(portfolioId: string, clusterNumber: number): Promise<void> {
    const breaker = await this.storage.getClusterBreaker(portfolioId, clusterNumber);
    
    if (!breaker) {
      return;
    }

    await this.storage.updateClusterBreaker(breaker.id, {
      is_triggered: false,
      trigger_reason: null,
      aggregate_loss_percentage: "0",
      affected_assets_count: 0,
      triggered_at: null,
      auto_reset_at: null,
    });

    // Update metric: 0 = normal
    observabilityService.updateBreakerState('cluster', `c${clusterNumber}`, portfolioId, 0);

    await this.logEvent({
      portfolio_id: portfolioId,
      breaker_level: "cluster",
      breaker_id: breaker.id,
      event_type: "reset",
      cluster_number: clusterNumber,
      reason: "Manual reset",
    });
  }

  async resetGlobalBreaker(portfolioId: string): Promise<void> {
    const riskParams = await this.storage.getRiskParametersByPortfolioId(portfolioId);
    
    if (!riskParams) {
      return;
    }

    await this.storage.updateRiskParameters(portfolioId, {
      circuit_breaker_triggered: false,
    });

    // Update metric: 0 = normal
    observabilityService.updateBreakerState('global', portfolioId, portfolioId, 0);

    await this.logEvent({
      portfolio_id: portfolioId,
      breaker_level: "global",
      breaker_id: riskParams.id,
      event_type: "reset",
      reason: "Manual reset",
    });
  }

  async recordAssetLoss(
    portfolioId: string,
    symbol: string,
    lossAmount: number,
  ): Promise<void> {
    let breaker = await this.storage.getAssetBreaker(portfolioId, symbol);
    
    if (!breaker) {
      const newBreaker: InsertAssetBreaker = {
        portfolio_id: portfolioId,
        symbol,
        is_triggered: false,
        consecutive_losses: 1,
        total_loss_amount: Math.abs(lossAmount).toFixed(2),
      };
      breaker = await this.storage.createAssetBreaker(newBreaker);
    } else {
      const newConsecutiveLosses = breaker.consecutive_losses + 1;
      const newTotalLoss = parseFloat(breaker.total_loss_amount) + Math.abs(lossAmount);
      
      const updated = await this.storage.updateAssetBreaker(breaker.id, {
        consecutive_losses: newConsecutiveLosses,
        total_loss_amount: newTotalLoss.toFixed(2),
      });
      if (!updated) {
        throw new Error(`Failed to update asset breaker loss count for ${symbol}`);
      }
      breaker = updated;
    }

    const maxConsecutiveLosses = breaker.max_consecutive_losses;
    const maxTotalLossUsd = parseFloat(breaker.max_total_loss_usd);
    
    if (breaker.consecutive_losses >= maxConsecutiveLosses) {
      await this.triggerAssetBreaker(
        portfolioId,
        symbol,
        `${breaker.consecutive_losses} consecutive losses exceeded limit of ${maxConsecutiveLosses}`,
        breaker.consecutive_losses,
        parseFloat(breaker.total_loss_amount),
      );
    } else if (parseFloat(breaker.total_loss_amount) >= maxTotalLossUsd) {
      await this.triggerAssetBreaker(
        portfolioId,
        symbol,
        `Total loss $${breaker.total_loss_amount} exceeded limit of $${maxTotalLossUsd}`,
        breaker.consecutive_losses,
        parseFloat(breaker.total_loss_amount),
      );
    }
  }

  async resetAssetLossStreak(portfolioId: string, symbol: string): Promise<void> {
    const breaker = await this.storage.getAssetBreaker(portfolioId, symbol);
    
    if (!breaker || breaker.is_triggered) {
      return;
    }

    await this.storage.updateAssetBreaker(breaker.id, {
      consecutive_losses: 0,
    });
  }

  async processAutoResets(): Promise<void> {
    const now = new Date();
    
    const assetBreakers = await this.storage.getAssetBreakersForAutoReset(now);
    for (const breaker of assetBreakers) {
      await this.storage.updateAssetBreaker(breaker.id, {
        is_triggered: false,
        trigger_reason: null,
        consecutive_losses: 0,
        total_loss_amount: "0",
        triggered_at: null,
        auto_reset_at: null,
      });

      await this.logEvent({
        portfolio_id: breaker.portfolio_id,
        breaker_level: "asset",
        breaker_id: breaker.id,
        event_type: "auto_reset",
        symbol: breaker.symbol,
        reason: "Automatic reset after cooldown period",
      });
    }

    const clusterBreakers = await this.storage.getClusterBreakersForAutoReset(now);
    for (const breaker of clusterBreakers) {
      await this.storage.updateClusterBreaker(breaker.id, {
        is_triggered: false,
        trigger_reason: null,
        aggregate_loss_percentage: "0",
        affected_assets_count: 0,
        triggered_at: null,
        auto_reset_at: null,
      });

      await this.logEvent({
        portfolio_id: breaker.portfolio_id,
        breaker_level: "cluster",
        breaker_id: breaker.id,
        event_type: "auto_reset",
        cluster_number: breaker.cluster_number,
        reason: "Automatic reset after cooldown period",
      });
    }
  }

  async getAllBreakers(portfolioId: string) {
    const [assetBreakers, clusterBreakers, riskParams] = await Promise.all([
      this.storage.getAssetBreakersByPortfolioId(portfolioId),
      this.storage.getClusterBreakersByPortfolioId(portfolioId),
      this.storage.getRiskParametersByPortfolioId(portfolioId),
    ]);

    return {
      asset_breakers: assetBreakers,
      cluster_breakers: clusterBreakers,
      global_breaker: {
        triggered: riskParams?.circuit_breaker_triggered || false,
        enabled: riskParams?.circuit_breaker_enabled || false,
      },
    };
  }

  private async logEvent(event: InsertCircuitBreakerEvent): Promise<void> {
    await this.storage.createCircuitBreakerEvent(event);
  }
}

// Singleton instance for shared circuit breaker state across all services
let circuitBreakerServiceInstance: CircuitBreakerService | null = null;

export function getCircuitBreakerService(storage: IStorage): CircuitBreakerService {
  if (!circuitBreakerServiceInstance) {
    circuitBreakerServiceInstance = new CircuitBreakerService(storage);
  }
  return circuitBreakerServiceInstance;
}
