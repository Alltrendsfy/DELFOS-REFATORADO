import { IStorage } from "../storage";
import type { RiskParameters, InsertRiskParameters } from "@shared/schema";
import { observabilityService } from "./observabilityService";

interface UpdateRiskParametersInput {
  portfolioId: string;
  max_position_size_percentage?: string;
  max_daily_loss_percentage?: string;
  max_portfolio_heat_percentage?: string;
  circuit_breaker_enabled?: boolean;
}

interface PositionRiskCheck {
  allowed: boolean;
  reason?: string;
  currentHeat?: number;
  maxHeat?: number;
}

export class RiskService {
  constructor(private storage: IStorage) {}

  async getRiskParameters(portfolioId: string): Promise<RiskParameters | undefined> {
    return await this.storage.getRiskParametersByPortfolioId(portfolioId);
  }

  async getOrCreateRiskParameters(portfolioId: string): Promise<RiskParameters> {
    let params = await this.storage.getRiskParametersByPortfolioId(portfolioId);
    
    if (!params) {
      // Create default risk parameters
      const newParams: InsertRiskParameters = {
        portfolio_id: portfolioId,
        max_position_size_percentage: "10",
        max_daily_loss_percentage: "5",
        max_portfolio_heat_percentage: "20",
        circuit_breaker_enabled: true,
        circuit_breaker_triggered: false,
      };
      params = await this.storage.createRiskParameters(newParams);
    }
    
    return params;
  }

  async updateRiskParameters(input: UpdateRiskParametersInput): Promise<RiskParameters | undefined> {
    await this.getOrCreateRiskParameters(input.portfolioId);
    
    const updates: Partial<InsertRiskParameters> = {};
    if (input.max_position_size_percentage !== undefined) {
      updates.max_position_size_percentage = input.max_position_size_percentage;
    }
    if (input.max_daily_loss_percentage !== undefined) {
      updates.max_daily_loss_percentage = input.max_daily_loss_percentage;
    }
    if (input.max_portfolio_heat_percentage !== undefined) {
      updates.max_portfolio_heat_percentage = input.max_portfolio_heat_percentage;
    }
    if (input.circuit_breaker_enabled !== undefined) {
      updates.circuit_breaker_enabled = input.circuit_breaker_enabled;
    }

    return await this.storage.updateRiskParameters(input.portfolioId, updates);
  }

  async checkCircuitBreaker(portfolioId: string): Promise<boolean> {
    const params = await this.getOrCreateRiskParameters(portfolioId);
    const portfolio = await this.storage.getPortfolio(portfolioId);
    
    if (!params.circuit_breaker_enabled) {
      return false; // Circuit breaker disabled
    }

    if (params.circuit_breaker_triggered) {
      return true; // Already triggered
    }

    // Check if daily loss exceeds limit
    if (!portfolio) return false;
    
    const dailyPnlPercentage = parseFloat(portfolio.daily_pnl_percentage);
    const maxDailyLoss = -Math.abs(parseFloat(params.max_daily_loss_percentage));
    
    if (dailyPnlPercentage <= maxDailyLoss) {
      // Trigger circuit breaker
      await this.storage.updateRiskParameters(portfolioId, {
        circuit_breaker_triggered: true,
      });
      return true;
    }

    return false;
  }

  async resetCircuitBreaker(portfolioId: string): Promise<void> {
    await this.getOrCreateRiskParameters(portfolioId);
    await this.storage.updateRiskParameters(portfolioId, {
      circuit_breaker_triggered: false,
    });
  }

  async canOpenPosition(
    portfolioId: string,
    positionValueUsd: number,
    entryPrice: number,
    quantity: number,
    stopLoss: number | null,
  ): Promise<PositionRiskCheck> {
    const params = await this.getOrCreateRiskParameters(portfolioId);
    const portfolio = await this.storage.getPortfolio(portfolioId);
    
    if (!portfolio) {
      return { allowed: false, reason: "Portfolio not found" };
    }

    // Check circuit breaker
    if (params.circuit_breaker_triggered) {
      return { 
        allowed: false, 
        reason: "Circuit breaker triggered - daily loss limit exceeded"
      };
    }

    const portfolioValue = parseFloat(portfolio.total_value_usd);
    
    // Check max position size
    const maxPositionValue = (portfolioValue * parseFloat(params.max_position_size_percentage)) / 100;
    if (positionValueUsd > maxPositionValue) {
      return {
        allowed: false,
        reason: `Position size ($${positionValueUsd.toFixed(2)}) exceeds max allowed ($${maxPositionValue.toFixed(2)})`,
      };
    }

    // Calculate portfolio heat (total risk exposure)
    const positions = await this.storage.getPositionsByPortfolioId(portfolioId);
    let currentHeat = 0;
    
    for (const pos of positions) {
      const posValue = parseFloat(pos.entry_price) * parseFloat(pos.quantity);
      if (pos.stop_loss) {
        // Risk is distance to stop loss
        const stopPrice = parseFloat(pos.stop_loss);
        const entryPrice = parseFloat(pos.entry_price);
        const riskPerUnit = Math.abs(entryPrice - stopPrice);
        const positionRisk = riskPerUnit * parseFloat(pos.quantity);
        currentHeat += positionRisk;
      } else {
        // No stop loss = assume 100% risk on position
        currentHeat += posValue;
      }
    }

    // Add new position risk using actual stop loss distance
    let newPositionRisk = positionValueUsd; // Default: assume 100% risk if no stop loss
    if (stopLoss !== null) {
      // Calculate actual risk based on distance to stop loss
      const riskPerUnit = Math.abs(entryPrice - stopLoss);
      newPositionRisk = riskPerUnit * quantity;
    }
    
    const totalHeat = currentHeat + newPositionRisk;
    const heatPercentage = (totalHeat / portfolioValue) * 100;
    const maxHeat = parseFloat(params.max_portfolio_heat_percentage);

    if (heatPercentage > maxHeat) {
      return {
        allowed: false,
        reason: `Portfolio heat (${heatPercentage.toFixed(1)}%) would exceed max allowed (${maxHeat}%)`,
        currentHeat: heatPercentage,
        maxHeat: maxHeat,
      };
    }

    return { 
      allowed: true,
      currentHeat: heatPercentage,
      maxHeat: maxHeat,
    };
  }

  async getPortfolioRiskMetrics(portfolioId: string) {
    const params = await this.getOrCreateRiskParameters(portfolioId);
    const portfolio = await this.storage.getPortfolio(portfolioId);
    const positions = await this.storage.getPositionsByPortfolioId(portfolioId);
    
    if (!portfolio) {
      return null;
    }

    const portfolioValue = parseFloat(portfolio.total_value_usd);
    
    // Calculate total exposure
    let totalExposure = 0;
    let totalRisk = 0;
    
    for (const pos of positions) {
      const posValue = parseFloat(pos.entry_price) * parseFloat(pos.quantity);
      totalExposure += posValue;
      
      if (pos.stop_loss) {
        const stopPrice = parseFloat(pos.stop_loss);
        const entryPrice = parseFloat(pos.entry_price);
        const riskPerUnit = Math.abs(entryPrice - stopPrice);
        const positionRisk = riskPerUnit * parseFloat(pos.quantity);
        totalRisk += positionRisk;
      } else {
        // No stop loss = assume 100% risk
        totalRisk += posValue;
      }
    }

    return {
      circuit_breaker_triggered: params.circuit_breaker_triggered,
      circuit_breaker_enabled: params.circuit_breaker_enabled,
      daily_pnl_percentage: parseFloat(portfolio.daily_pnl_percentage),
      max_daily_loss_percentage: parseFloat(params.max_daily_loss_percentage),
      max_position_size_percentage: parseFloat(params.max_position_size_percentage),
      max_portfolio_heat_percentage: parseFloat(params.max_portfolio_heat_percentage),
      current_portfolio_heat_percentage: portfolioValue > 0 ? (totalRisk / portfolioValue) * 100 : 0,
      total_exposure_usd: totalExposure,
      total_risk_usd: totalRisk,
      portfolio_value_usd: portfolioValue,
      open_positions_count: positions.length,
    };
  }

  /**
   * Calculate and update risk metrics (VaR, ES, Drawdown) for Prometheus monitoring
   * Should be called periodically or after significant portfolio changes
   */
  async updateRiskMetrics(portfolioId: string): Promise<void> {
    try {
      const portfolio = await this.storage.getPortfolio(portfolioId);
      if (!portfolio) return;

      // Get recent trades for VaR/ES calculation (last 100 trades)
      const recentTrades = await this.storage.getTradesByPortfolioId(portfolioId);
      
      if (recentTrades.length > 0) {
        // Calculate VaR 95% (95th percentile of losses)
        const pnlValues = recentTrades
          .map(t => parseFloat(t.realized_pnl))
          .sort((a, b) => a - b); // Sort ascending (worst losses first)
        
        const var95Index = Math.floor(pnlValues.length * 0.05); // 5% worst
        const var95 = pnlValues[var95Index] || 0;
        
        // Calculate ES 95% (Expected Shortfall - average of losses worse than VaR)
        const tailLosses = pnlValues.slice(0, var95Index + 1);
        const es95 = tailLosses.length > 0 
          ? tailLosses.reduce((sum, val) => sum + val, 0) / tailLosses.length 
          : 0;
        
        // Update metrics
        observabilityService.updateVaR95(portfolioId, Math.abs(var95));
        observabilityService.updateES95(portfolioId, Math.abs(es95));
      }

      // Calculate intraday drawdown
      const currentValue = parseFloat(portfolio.total_value_usd);
      const dailyPnl = parseFloat(portfolio.daily_pnl);
      
      // Intraday starting value = current value - daily PnL
      const startOfDayValue = currentValue - dailyPnl;
      
      // Intraday peak = max(starting value, current value)
      const intradayPeak = Math.max(startOfDayValue, currentValue);
      
      // Drawdown from peak
      const drawdown = intradayPeak > 0 ? ((intradayPeak - currentValue) / intradayPeak) * 100 : 0;
      
      observabilityService.updateDrawdown(portfolioId, Math.max(0, drawdown));
      
    } catch (error) {
      console.error('[RiskService] Failed to update risk metrics:', error);
    }
  }
}
