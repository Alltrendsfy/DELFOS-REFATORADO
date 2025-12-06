import { db } from "../db";
import { signal_configs, signals, portfolios, InsertSignal, SignalConfig } from "../../shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { CircuitBreakerService } from "./circuitBreakerService";
import { stalenessGuardService } from "./stalenessGuardService";

/**
 * SignalEngine - Generates ATR-based trading signals
 * 
 * SIGNAL RULES:
 * - Long: Price > EMA12 AND EMA12 > EMA36 AND (Price - EMA12) > N×ATR
 * - Short: Price < EMA12 AND EMA12 < EMA36 AND (EMA12 - Price) > N×ATR
 * 
 * Where N is configurable per asset via signal_configs
 * 
 * EMA_GAP_TOLERANCE: Minimum % gap required between EMA12 and EMA36
 * to avoid whipsaws during crossover (0.1% = 0.001)
 */
export class SignalEngine {
  private static readonly EMA_GAP_TOLERANCE = 0.001; // 0.1% minimum gap

  constructor(
    private circuitBreakerService: CircuitBreakerService
  ) {}

  /**
   * Scan for trading signals across all configured assets
   * @param portfolioId - Portfolio to generate signals for
   * @param marketData - Array of {symbol, price, ema12, ema36, atr}
   * @returns Array of generated signals
   */
  async scanForSignals(
    portfolioId: string,
    marketData: Array<{
      symbol: string;
      price: number;
      ema12: number;
      ema36: number;
      atr: number;
    }>
  ): Promise<InsertSignal[]> {
    // Get all active configs for this portfolio
    const configs = await db
      .select()
      .from(signal_configs)
      .where(
        and(
          eq(signal_configs.portfolio_id, portfolioId),
          eq(signal_configs.enabled, true)
        )
      );

    const generatedSignals: InsertSignal[]  = [];

    for (const data of marketData) {
      // Find config for this symbol
      let config = configs.find(c => c.symbol === data.symbol);
      
      // If no config exists for this symbol, create default config on-the-fly
      if (!config) {
        console.log(`📝 Creating default signal config for ${portfolioId}:${data.symbol}`);
        const [newConfig] = await db
          .insert(signal_configs)
          .values({
            portfolio_id: portfolioId,
            symbol: data.symbol,
            long_threshold_atr_multiplier: "2.0",
            short_threshold_atr_multiplier: "1.5",
            tp1_atr_multiplier: "1.2",
            tp2_atr_multiplier: "2.5",
            sl_atr_multiplier: "1.0",
            risk_per_trade_bps: 20, // 20 bps = 0.20%
            enabled: true,
            last_calculated_at: new Date(),
          })
          .returning();
        
        config = newConfig;
      }

      // Check staleness BEFORE generating signal - zero signals if data >10s stale
      const shouldZeroSignals = await stalenessGuardService.shouldZeroSignals('kraken', data.symbol);
      if (shouldZeroSignals) {
        console.log(`⚠️  Data stale for ${data.symbol} - skipping signal generation`);
        continue;
      }

      // Check circuit breakers BEFORE generating signal
      const canTrade = await this.circuitBreakerService.canTradeSymbol(portfolioId, data.symbol);
      if (!canTrade.allowed) {
        console.log(`🚫 Circuit breaker active for ${data.symbol}: ${canTrade.reason}`);
        continue;
      }

      // Evaluate signal conditions
      const signal = await this.evaluateSignal(portfolioId, data, config, canTrade);
      if (signal) {
        generatedSignals.push(signal);
      }
    }

    return generatedSignals;
  }

  /**
   * Evaluate if market conditions trigger a signal
   */
  private async evaluateSignal(
    portfolioId: string,
    market: { symbol: string; price: number; ema12: number; ema36: number; atr: number },
    config: SignalConfig,
    breakerCheck: { allowed: boolean; level?: string; reason?: string; breakerId?: string }
  ): Promise<InsertSignal | null> {
    const { price, ema12, ema36, atr, symbol } = market;

    // Parse thresholds from config
    const longThreshold = parseFloat(config.long_threshold_atr_multiplier);
    const shortThreshold = parseFloat(config.short_threshold_atr_multiplier);

    let signalType: 'long' | 'short' | null = null;

    // Calculate minimum EMA gap to avoid whipsaws (0.1% of EMA36)
    const emaGapThreshold = ema36 * SignalEngine.EMA_GAP_TOLERANCE;

    // LONG SIGNAL: Price > EMA12 AND EMA12 > EMA36 (with gap) AND (Price - EMA12) > N×ATR
    // Ensures we're in an uptrend (EMA12 > EMA36) with sufficient momentum
    const isUptrend = (ema12 - ema36) > emaGapThreshold;
    if (price > ema12 && isUptrend && (price - ema12) > longThreshold * atr) {
      signalType = 'long';
    }
    // SHORT SIGNAL: Price < EMA12 AND EMA12 < EMA36 (with gap) AND (EMA12 - Price) > N×ATR
    // Ensures we're in a downtrend (EMA12 < EMA36) with sufficient momentum
    const isDowntrend = (ema36 - ema12) > emaGapThreshold;
    if (price < ema12 && isDowntrend && (ema12 - price) > shortThreshold * atr) {
      signalType = 'short';
    }

    if (!signalType) {
      return null; // No signal triggered
    }

    // Calculate OCO targets based on signal type
    const tp1Multiplier = parseFloat(config.tp1_atr_multiplier);
    const tp2Multiplier = parseFloat(config.tp2_atr_multiplier);
    const slMultiplier = parseFloat(config.sl_atr_multiplier);

    let calculatedTp1: number, calculatedTp2: number, calculatedSl: number;

    if (signalType === 'long') {
      calculatedTp1 = price + (tp1Multiplier * atr);
      calculatedTp2 = price + (tp2Multiplier * atr);
      calculatedSl = price - (slMultiplier * atr);
    } else {
      // short
      calculatedTp1 = price - (tp1Multiplier * atr);
      calculatedTp2 = price - (tp2Multiplier * atr);
      calculatedSl = price + (slMultiplier * atr);
    }

    // Calculate position size via risk sizing
    const positionSize = await this.calculatePositionSize(
      portfolioId,
      price,
      calculatedSl,
      config.risk_per_trade_bps
    );

    // Create immutable config snapshot for audit trail
    const configSnapshot = {
      long_threshold_atr_multiplier: config.long_threshold_atr_multiplier,
      short_threshold_atr_multiplier: config.short_threshold_atr_multiplier,
      tp1_atr_multiplier: config.tp1_atr_multiplier,
      tp2_atr_multiplier: config.tp2_atr_multiplier,
      sl_atr_multiplier: config.sl_atr_multiplier,
      tp1_close_percentage: config.tp1_close_percentage,
      risk_per_trade_bps: config.risk_per_trade_bps,
    };

    // Capture circuit breaker state for telemetry
    const breakerStateSnapshot = {
      allowed: breakerCheck.allowed,
      level: breakerCheck.level,
      reason: breakerCheck.reason,
      breakerId: breakerCheck.breakerId,
    };

    const signal: InsertSignal = {
      portfolio_id: portfolioId,
      symbol,
      signal_type: signalType,
      price_at_signal: price.toString(),
      ema12: ema12.toString(),
      ema36: ema36.toString(),
      atr: atr.toString(),
      signal_config_id: config.id,
      config_snapshot: configSnapshot,
      calculated_tp1: calculatedTp1.toString(),
      calculated_tp2: calculatedTp2.toString(),
      calculated_sl: calculatedSl.toString(),
      calculated_position_size: positionSize.toString(),
      risk_per_trade_bps_used: config.risk_per_trade_bps,
      circuit_breaker_state: breakerStateSnapshot,
      status: 'pending',
      position_id: null,
      execution_price: null,
      execution_reason: null,
      expiration_reason: null,
    };

    console.log(`📊 Signal generated: ${signalType.toUpperCase()} ${symbol} @ ${price} | TP1: ${calculatedTp1.toFixed(2)} | TP2: ${calculatedTp2.toFixed(2)} | SL: ${calculatedSl.toFixed(2)}`);

    // Update signal_config.last_calculated_at for tracking
    await db
      .update(signal_configs)
      .set({ last_calculated_at: new Date() })
      .where(eq(signal_configs.id, config.id));

    return signal;
  }

  /**
   * Calculate position size based on risk sizing formula
   * Position = (risk × Equity) / (SL% + Fee + Slippage)
   * 
   * @param portfolioId - Portfolio ID
   * @param entryPrice - Entry price
   * @param stopLoss - Stop loss price
   * @param riskBps - Risk per trade in basis points (e.g., 20 = 0.20%)
   * @param feePercent - Trading fee (default: 0.1% = 0.001 for Kraken maker)
   * @param slippagePercent - Estimated slippage (default: 0.1% = 0.001)
   * @returns Position size in base currency
   */
  private async calculatePositionSize(
    portfolioId: string,
    entryPrice: number,
    stopLoss: number,
    riskBps: number,
    feePercent: number = 0.001,
    slippagePercent: number = 0.001
  ): Promise<number> {
    // Get portfolio equity
    const portfolio = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, portfolioId))
      .limit(1);

    if (!portfolio || portfolio.length === 0) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const equity = parseFloat(portfolio[0].total_value_usd);
    
    // Convert risk from basis points to decimal (20 bps = 0.0020 = 0.20%)
    const riskDecimal = riskBps / 10000;
    
    // Calculate risk amount in USD
    const riskAmountUsd = equity * riskDecimal;
    
    // Calculate SL distance as percentage
    const slDistancePercent = Math.abs((entryPrice - stopLoss) / entryPrice);
    
    // Total fees and slippage (configurable, defaults to Kraken maker + conservative slippage)
    const feeAndSlippagePercent = feePercent + slippagePercent;
    
    // Total risk percentage (SL distance + fees + slippage)
    const totalRiskPercent = slDistancePercent + feeAndSlippagePercent;
    
    // Position size = (Risk Amount) / (Entry Price × Total Risk %)
    const positionSize = riskAmountUsd / (entryPrice * totalRiskPercent);

    console.log(`💰 Risk sizing: Equity=${equity.toFixed(2)} | Risk=${riskAmountUsd.toFixed(2)} | SL%=${(slDistancePercent*100).toFixed(2)}% | Fee=${(feePercent*100).toFixed(2)}% | Slip=${(slippagePercent*100).toFixed(2)}% | Size=${positionSize.toFixed(4)}`);

    return positionSize;
  }

  /**
   * Persist generated signals to database
   * @param signalsData - Array of signals to save
   * @returns Array of created signal IDs
   */
  async persistSignals(signalsData: InsertSignal[]): Promise<string[]> {
    if (signalsData.length === 0) {
      return [];
    }

    const created = await db
      .insert(signals)
      .values(signalsData)
      .returning({ id: signals.id });

    console.log(`✅ Persisted ${created.length} signals to database`);
    return created.map(s => s.id);
  }

  /**
   * Get pending signals for a portfolio
   * @param portfolioId - Portfolio ID
   * @param limit - Max number of signals to return
   */
  async getPendingSignals(portfolioId: string, limit: number = 50) {
    return await db
      .select()
      .from(signals)
      .where(
        and(
          eq(signals.portfolio_id, portfolioId),
          eq(signals.status, 'pending')
        )
      )
      .orderBy(desc(signals.generated_at))
      .limit(limit);
  }

  /**
   * Update signal status (e.g., mark as executed or expired)
   * @param signalId - Signal ID
   * @param status - New status
   * @param positionId - Position ID if executed
   * @param executionPrice - Execution price if executed
   * @param reason - Reason for status change
   */
  async updateSignalStatus(
    signalId: string,
    status: 'executed' | 'expired' | 'cancelled',
    positionId?: string,
    executionPrice?: number,
    reason?: string
  ) {
    const updateData: any = { status };

    if (status === 'executed') {
      updateData.executed_at = new Date();
      updateData.execution_price = executionPrice?.toString();
      updateData.execution_reason = reason;
      updateData.position_id = positionId;
    } else if (status === 'expired') {
      updateData.expired_at = new Date();
      updateData.expiration_reason = reason;
    } else if (status === 'cancelled') {
      updateData.expired_at = new Date();
      updateData.expiration_reason = reason;
    }

    await db
      .update(signals)
      .set(updateData)
      .where(eq(signals.id, signalId));

    console.log(`✅ Signal ${signalId} status updated to ${status}`);
  }
}
