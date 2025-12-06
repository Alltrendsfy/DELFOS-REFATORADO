import { storage } from "../../storage.js";

export interface FeesCalculation {
  makerFeePct: number;   // e.g., 0.0016 = 0.16%
  takerFeePct: number;   // e.g., 0.0026 = 0.26%
  avgSlippagePct: number; // e.g., 0.0005 = 0.05%
  feeAvgPct: number;     // Average of maker + taker = 0.0021 = 0.21%
  roundTripCostPct: number; // feeAvg * 2 + slippage * 2 = total round-trip cost
}

/**
 * FeesService - Calculates trading fees and slippage for position sizing
 * 
 * Formula Integration:
 * Position Size = (Risk × Equity) / (Stop Loss % + Fee_avg + Slippage_avg)
 * 
 * Example:
 * - Risk: 0.20% (20 bps)
 * - Equity: $100,000
 * - Stop Loss: 1.5%
 * - Fee_avg: 0.21% (maker 0.16% + taker 0.26%) / 2
 * - Slippage_avg: 0.05%
 * 
 * Position Size = (0.002 × $100,000) / (0.015 + 0.0021 + 0.0005)
 *               = $200 / 0.0176
 *               = $11,363 notional
 */
export class FeesService {
  /**
   * Calculate fees and slippage for a given exchange and symbol
   * Falls back to exchange defaults if symbol-specific overrides don't exist
   */
  async calculateFees(exchangeId: string, symbol: string): Promise<FeesCalculation> {
    // Try to get symbol-specific fees first
    let fees = await storage.getFeesByExchangeAndSymbol(exchangeId, symbol);
    
    // Fall back to exchange default fees (symbol = NULL)
    if (!fees) {
      fees = await storage.getFeesByExchangeAndSymbol(exchangeId, null);
    }
    
    if (!fees) {
      throw new Error(`No fee configuration found for exchange ${exchangeId}`);
    }
    
    const makerFeePct = parseFloat(fees.maker_fee_pct);
    const takerFeePct = parseFloat(fees.taker_fee_pct);
    const avgSlippagePct = parseFloat(fees.avg_slippage_pct);
    
    // Calculate average fee (assumes 50/50 mix of maker/taker orders)
    const feeAvgPct = (makerFeePct + takerFeePct) / 2;
    
    // Round-trip cost: single entry/exit cycle (NOT doubled)
    // This is the cost component added to stop-loss in sizing denominator
    const roundTripCostPct = feeAvgPct + avgSlippagePct;
    
    return {
      makerFeePct,
      takerFeePct,
      avgSlippagePct,
      feeAvgPct,
      roundTripCostPct,
    };
  }
  
  /**
   * Calculate position size using cost-integrated formula
   * 
   * @param equity - Portfolio equity in USD
   * @param riskBps - Risk per trade in basis points (e.g., 20 = 0.20%)
   * @param slDecimal - Stop loss distance as DECIMAL (e.g., 0.015 = 1.5%)
   * @param exchangeId - Exchange ID for fee lookup
   * @param symbol - Trading symbol for fee lookup
   * @param volatilityScaleFactor - Optional scaling factor (default 1.0)
   * @returns Position size in USD notional
   */
  async calculatePositionSize(
    equity: number,
    riskBps: number,
    slDecimal: number,
    exchangeId: string,
    symbol: string,
    volatilityScaleFactor: number = 1.0
  ): Promise<number> {
    const fees = await this.calculateFees(exchangeId, symbol);
    
    // Convert risk from bps to decimal (20 bps = 0.0020 = 0.20%)
    const riskDecimal = riskBps / 10000;
    
    // Formula: Pos = (r × Equity) / (SL% + Fee_avg + Slippage_avg) × scalingFactor
    // Note: slDecimal is already in decimal form (0.015 = 1.5%), no conversion needed
    const numerator = riskDecimal * equity;
    const denominator = slDecimal + fees.feeAvgPct + fees.avgSlippagePct;
    
    const positionSize = (numerator / denominator) * volatilityScaleFactor;
    
    return Math.round(positionSize * 100) / 100; // Round to 2 decimals
  }
}

export const feesService = new FeesService();
