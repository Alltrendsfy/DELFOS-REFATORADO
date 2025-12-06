import type { IStorage } from "../storage";
import type { Position, InsertPosition, InsertTrade, MarketDataCache, InsertTradeCost } from "@shared/schema";
import { RiskService } from "./riskService";
import { getCircuitBreakerService } from "./circuitBreakerService";
import { TradeMonitoringService } from "./tradeMonitoringService";
import { PaperTradingExecutor } from "./paperTradingExecutor";
import { OrderExecutionService } from "./orderExecutionService";
import { TaxService } from "./tax/taxService";
import { observabilityService } from "./observabilityService";
import { stalenessGuardService } from "./stalenessGuardService";

interface OpenPositionInput {
  portfolioId: string;
  symbol: string;
  side: "long" | "short";
  quantity: string;
  stopLoss?: string;
  takeProfit?: string;
}

interface ClosePositionInput {
  positionId: string;
  exitPrice?: string;
  realizedPnl?: string;
}

export class TradingService {
  private riskService: RiskService;
  private circuitBreakerService;
  private tradeMonitoringService: TradeMonitoringService;
  private paperExecutor: PaperTradingExecutor;
  private orderExecutionService: OrderExecutionService;
  private taxService: TaxService;

  constructor(private storage: IStorage) {
    this.riskService = new RiskService(storage);
    this.circuitBreakerService = getCircuitBreakerService(storage);
    this.tradeMonitoringService = new TradeMonitoringService(storage);
    this.paperExecutor = new PaperTradingExecutor();
    this.orderExecutionService = new OrderExecutionService(storage);
    this.taxService = new TaxService(storage);
  }

  async openPosition(input: OpenPositionInput): Promise<Position> {
    const { portfolioId, symbol, side, quantity, stopLoss, takeProfit } = input;

    const portfolio = await this.storage.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error("Portfolio not found");
    }

    const isPaperMode = portfolio.trading_mode === "paper";

    // Check global circuit breaker and update flag if daily loss exceeded
    const circuitBreakerTriggered = await this.riskService.checkCircuitBreaker(portfolioId);
    if (circuitBreakerTriggered) {
      throw new Error("Global circuit breaker triggered - daily loss limit exceeded. Trading is disabled.");
    }

    // Check Staleness Guard - ensure data is fresh (<=3s)
    const stalenessCheck = await stalenessGuardService.canOpenPosition('kraken', symbol);
    if (!stalenessCheck.allowed) {
      throw new Error(`Trading blocked - ${stalenessCheck.reason}`);
    }

    // Check 3-Layer Circuit Breakers (Asset → Cluster → Global)
    const breakerCheck = await this.circuitBreakerService.canTradeSymbol(portfolioId, symbol);
    if (!breakerCheck.allowed) {
      throw new Error(`Trading blocked - ${breakerCheck.reason}`);
    }

    let executionPrice: string;
    let fees: string = "0";
    let exchangeOrderId: string | null = null;

    if (isPaperMode) {
      const orderResult = await this.paperExecutor.executeMarketOrder({
        symbol,
        side,
        quantity,
        stopLoss,
        takeProfit,
      });
      executionPrice = orderResult.executionPrice;
      fees = orderResult.fees;
      console.log(`[INFO] PAPER TRADE: ${side} ${quantity} ${symbol} @ ${executionPrice} (fees: ${fees})`);
    } else {
      // LIVE MODE: Execute real order on Kraken
      console.log(`[INFO] LIVE TRADE: Executing ${side} ${quantity} ${symbol} on Kraken...`);
      
      try {
        // Verify Kraken credentials are available
        if (!process.env.KRAKEN_API_KEY || !process.env.KRAKEN_API_SECRET) {
          throw new Error("Kraken API credentials not configured. Cannot execute live trades.");
        }
        
        const order = await this.orderExecutionService.placeOrder({
          portfolioId,
          symbol,
          side: side === "long" ? "buy" : "sell",
          type: "market",
          quantity,
        });
        
        exchangeOrderId = order.exchange_order_id || null;
        
        // Poll for order fill with timeout (market orders usually fill quickly)
        const maxAttempts = 10;
        const pollInterval = 500;
        let attempts = 0;
        let filledOrder = order;
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          filledOrder = await this.orderExecutionService.queryAndUpdateOrder(order.id);
          
          if (filledOrder.status === "filled") {
            break;
          }
          
          if (filledOrder.status === "cancelled" || filledOrder.status === "rejected") {
            throw new Error(`Order ${filledOrder.status}. Cannot open position.`);
          }
          
          attempts++;
        }
        
        if (filledOrder.status !== "filled") {
          // Timeout reached - attempt to cancel the order to prevent untracked fills
          console.warn(`[WARNING] Order timeout after ${maxAttempts * pollInterval}ms. Attempting to cancel order ${order.id}...`);
          
          try {
            await this.orderExecutionService.cancelOrder(order.id);
            console.log(`[INFO] Order ${order.id} cancelled successfully after timeout`);
          } catch (cancelError) {
            console.error(`[ERROR] Failed to cancel order ${order.id}:`, cancelError);
          }
          
          // Always check final status after cancellation attempt
          const finalStatus = await this.orderExecutionService.queryAndUpdateOrder(order.id);
          if (finalStatus.status === "filled" || finalStatus.status === "partially_filled") {
            console.warn(`[WARNING] Order ${finalStatus.status} after timeout. Status: ${finalStatus.status}`);
            throw new Error(`Order ${finalStatus.status} despite timeout. Manual reconciliation required - check Kraken account. Order ID: ${order.exchange_order_id}`);
          }
          
          throw new Error(`Order did not fill within timeout and was cancelled. Status: ${finalStatus.status}`);
        }
        
        executionPrice = filledOrder.average_fill_price || filledOrder.price || "0";
        // TODO: Capture fees from Kraken response - currently using placeholder
        fees = "0";
        
        console.log(`[INFO] LIVE ORDER FILLED: ${side} ${quantity} ${symbol} @ ${executionPrice} (orderId: ${exchangeOrderId})`);
      } catch (error) {
        console.error(`[ERROR] LIVE TRADE FAILED:`, error);
        throw new Error(`Failed to execute live order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const entryPrice = parseFloat(executionPrice);
    const qty = parseFloat(quantity);
    const positionValueUsd = entryPrice * qty;

    // Validate risk limits
    const riskCheck = await this.riskService.canOpenPosition(
      portfolioId,
      positionValueUsd,
      entryPrice,
      qty,
      stopLoss ? parseFloat(stopLoss) : null
    );

    if (!riskCheck.allowed) {
      throw new Error(riskCheck.reason || "Position violates risk limits");
    }

    // Create position
    const position: InsertPosition = {
      portfolio_id: portfolioId,
      symbol,
      side,
      quantity,
      entry_price: executionPrice,
      current_price: executionPrice,
      unrealized_pnl: "0",
      unrealized_pnl_percentage: "0",
      stop_loss: stopLoss,
      take_profit: takeProfit,
    };

    const createdPosition = await this.storage.createPosition(position);
    
    // Update metrics
    observabilityService.recordTrade(symbol, side, portfolioId);
    
    return createdPosition;
  }

  async closePosition(input: ClosePositionInput): Promise<void> {
    const { positionId, exitPrice: testExitPrice, realizedPnl: testRealizedPnl } = input;

    // Get the position
    const position = await this.storage.getPosition(positionId);
    if (!position) {
      throw new Error("Position not found");
    }

    const portfolio = await this.storage.getPortfolio(position.portfolio_id);
    if (!portfolio) {
      throw new Error("Portfolio not found");
    }

    const isPaperMode = portfolio.trading_mode === "paper";

    let exitPrice: string = position.entry_price;
    let realizedPnl: number = 0;
    let realizedPnlPercentage: number = 0;
    let fees: string = "0";

    // TEST/DEV MODE ONLY: Accept exitPrice/realizedPnl from API for deterministic testing
    // SECURITY: Never allow test overrides for live trading mode
    // PRODUCTION: Always uses server market data for security
    if (!isPaperMode && (testExitPrice || testRealizedPnl)) {
      throw new Error("Test price/PnL injection not allowed for live trading mode");
    }
    
    if (process.env.NODE_ENV !== 'production' && (testExitPrice || testRealizedPnl)) {
      if (testRealizedPnl) {
        // Direct PnL injection for tests
        realizedPnl = parseFloat(testRealizedPnl);
        exitPrice = testExitPrice || position.entry_price;
      } else if (testExitPrice) {
        // Calculate from test exitPrice
        exitPrice = testExitPrice;
        const entryPrice = parseFloat(position.entry_price);
        const exit = parseFloat(exitPrice);
        const qty = parseFloat(position.quantity);
        
        if (position.side === "long") {
          realizedPnl = (exit - entryPrice) * qty;
        } else {
          realizedPnl = (entryPrice - exit) * qty;
        }
      } else {
        realizedPnl = 0;
      }
      
      const entryPrice = parseFloat(position.entry_price);
      const qty = parseFloat(position.quantity);
      realizedPnlPercentage = ((realizedPnl / (entryPrice * qty)) * 100);
    } else if (isPaperMode) {
      const orderResult = await this.paperExecutor.closePosition({
        symbol: position.symbol,
        side: position.side as "long" | "short",
        quantity: position.quantity,
        entry_price: position.entry_price,
      });
      exitPrice = orderResult.executionPrice;
      fees = orderResult.fees;
      
      const entryPrice = parseFloat(position.entry_price);
      const exit = parseFloat(exitPrice);
      const qty = parseFloat(position.quantity);

      if (position.side === "long") {
        realizedPnl = (exit - entryPrice) * qty;
      } else {
        realizedPnl = (entryPrice - exit) * qty;
      }

      realizedPnlPercentage = ((realizedPnl / (entryPrice * qty)) * 100);
      console.log(`[INFO] PAPER CLOSE: ${position.side} ${position.quantity} ${position.symbol} @ ${exitPrice} (PnL: ${realizedPnl.toFixed(2)}, fees: ${fees})`);
    } else {
      // LIVE MODE: Execute reverse order on Kraken to close position
      console.log(`[INFO] LIVE CLOSE: Closing ${position.side} ${position.quantity} ${position.symbol} on Kraken...`);
      
      try {
        // Verify Kraken credentials are available
        if (!process.env.KRAKEN_API_KEY || !process.env.KRAKEN_API_SECRET) {
          throw new Error("Kraken API credentials not configured. Cannot execute live trades.");
        }
        
        // Determine reverse order side (long position → sell order, short position → buy order)
        const closeSide = position.side === "long" ? "sell" : "buy";
        
        const closeOrder = await this.orderExecutionService.placeOrder({
          portfolioId: position.portfolio_id,
          symbol: position.symbol,
          side: closeSide,
          type: "market",
          quantity: position.quantity,
        });
        
        // Poll for order fill with timeout
        const maxAttempts = 10;
        const pollInterval = 500;
        let attempts = 0;
        let filledCloseOrder = closeOrder;
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          filledCloseOrder = await this.orderExecutionService.queryAndUpdateOrder(closeOrder.id);
          
          if (filledCloseOrder.status === "filled") {
            break;
          }
          
          if (filledCloseOrder.status === "cancelled" || filledCloseOrder.status === "rejected") {
            throw new Error(`Close order ${filledCloseOrder.status}. Cannot close position.`);
          }
          
          attempts++;
        }
        
        if (filledCloseOrder.status !== "filled") {
          // Timeout reached - attempt to cancel the order to prevent untracked fills
          console.warn(`[WARNING] Close order timeout after ${maxAttempts * pollInterval}ms. Attempting to cancel order ${closeOrder.id}...`);
          
          try {
            await this.orderExecutionService.cancelOrder(closeOrder.id);
            console.log(`[INFO] Close order ${closeOrder.id} cancelled successfully after timeout`);
          } catch (cancelError) {
            console.error(`[ERROR] Failed to cancel close order ${closeOrder.id}:`, cancelError);
          }
          
          // Always check final status after cancellation attempt
          const finalStatus = await this.orderExecutionService.queryAndUpdateOrder(closeOrder.id);
          if (finalStatus.status === "filled" || finalStatus.status === "partially_filled") {
            console.warn(`[WARNING] Close order ${finalStatus.status} after timeout. Status: ${finalStatus.status}`);
            throw new Error(`Close order ${finalStatus.status} despite timeout. Manual reconciliation required - check Kraken account. Order ID: ${closeOrder.exchange_order_id}`);
          }
          
          throw new Error(`Close order did not fill within timeout and was cancelled. Status: ${finalStatus.status}`);
        }
        
        exitPrice = filledCloseOrder.average_fill_price || filledCloseOrder.price || position.entry_price;
        // TODO: Capture fees from Kraken response - currently using placeholder
        fees = "0";

        // Calculate realized PnL
        const entryPrice = parseFloat(position.entry_price);
        const exit = parseFloat(exitPrice);
        const qty = parseFloat(position.quantity);

        if (position.side === "long") {
          realizedPnl = (exit - entryPrice) * qty;
        } else {
          realizedPnl = (entryPrice - exit) * qty;
        }

        realizedPnlPercentage = ((realizedPnl / (entryPrice * qty)) * 100);
        console.log(`[INFO] LIVE CLOSE FILLED: ${position.side} ${position.quantity} ${position.symbol} @ ${exitPrice} (PnL: ${realizedPnl.toFixed(2)})`);
      } catch (error) {
        console.error(`[ERROR] LIVE CLOSE FAILED:`, error);
        throw new Error(`Failed to close live position: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Subtract fees from realized PnL for accurate accounting
    const realizedPnlAfterFees = realizedPnl - parseFloat(fees);
    const entryValue = parseFloat(position.entry_price) * parseFloat(position.quantity);
    const realizedPnlPercentageAfterFees = ((realizedPnlAfterFees / entryValue) * 100);

    // Create trade record
    const trade: InsertTrade = {
      portfolio_id: position.portfolio_id,
      symbol: position.symbol,
      side: position.side,
      entry_price: position.entry_price,
      exit_price: exitPrice,
      quantity: position.quantity,
      realized_pnl: realizedPnlAfterFees.toFixed(2),
      realized_pnl_percentage: realizedPnlPercentageAfterFees.toFixed(4),
      fees: fees,
      opened_at: position.opened_at,
    };

    const createdTrade = await this.storage.createTrade(trade);

    // Update PnL metrics (aggregate all trades for each level)
    try {
      const portfolio = await this.storage.getPortfolio(position.portfolio_id);
      if (portfolio) {
        const allTrades = await this.storage.getTradesByPortfolioId(position.portfolio_id);
        
        // Update portfolio-level PnL (aggregate all trades)
        const totalPortfolioPnl = allTrades.reduce((sum, t) => sum + parseFloat(t.realized_pnl), 0);
        observabilityService.updatePortfolioPnL(position.portfolio_id, portfolio.trading_mode, totalPortfolioPnl);
        
        // Update asset-level PnL (aggregate trades for this symbol)
        const assetTrades = allTrades.filter(t => t.symbol === position.symbol);
        const totalAssetPnl = assetTrades.reduce((sum, t) => sum + parseFloat(t.realized_pnl), 0);
        observabilityService.updateAssetPnL(position.symbol, position.portfolio_id, totalAssetPnl);
        
        // Update cluster-level PnL if cluster info exists (aggregate trades for this cluster)
        const clusterNumber = await this.storage.getClusterNumberForSymbol(position.symbol);
        if (clusterNumber !== null) {
          // Get all symbols in this cluster
          const clusterSymbols = await this.storage.getSymbolsInCluster(clusterNumber);
          const clusterTrades = allTrades.filter(t => clusterSymbols.includes(t.symbol));
          const totalClusterPnl = clusterTrades.reduce((sum, t) => sum + parseFloat(t.realized_pnl), 0);
          observabilityService.updateClusterPnL(`c${clusterNumber}`, position.portfolio_id, totalClusterPnl);
        }
      }
    } catch (error) {
      console.error('[TradingService] Failed to update PnL metrics:', error);
    }

    // Calculate and record tax/cost information
    try {
      const portfolio = await this.storage.getPortfolio(position.portfolio_id);
      if (portfolio) {
        // Calculate total costs (fees + slippage estimation)
        const totalFees = parseFloat(fees);
        const totalSlippage = 0; // TODO: Calculate actual slippage
        const totalCost = totalFees + totalSlippage;
        
        // Calculate tax based on user's active tax profile
        const taxCalculation = await this.taxService.calculateTax(
          portfolio.user_id,
          realizedPnl,
          totalCost,
          new Date().getFullYear()
        );
        
        // Record trade cost details for audit and tax reporting
        const tradeCost: InsertTradeCost = {
          trade_id: createdTrade.id,
          portfolio_id: position.portfolio_id,
          gross_pnl_usd: realizedPnl.toFixed(2),
          total_fees_usd: totalFees.toFixed(2),
          total_slippage_usd: totalSlippage.toFixed(2),
          total_cost_usd: totalCost.toFixed(2),
          net_pnl_usd: taxCalculation.netPnlBeforeTax.toFixed(2),
          tax_owed_usd: taxCalculation.taxOwed.toFixed(2),
          net_after_tax_usd: taxCalculation.netAfterTax.toFixed(2),
          tax_rate_applied_pct: taxCalculation.taxRateApplied.toFixed(2),
          tax_profile_id: taxCalculation.taxProfileId,
        };
        
        await this.taxService.recordTradeCost(tradeCost);
        
        console.log(`[TAX] Trade ${createdTrade.id}: Gross PnL=$${realizedPnl.toFixed(2)}, Tax=$${taxCalculation.taxOwed.toFixed(2)}, Net=$${taxCalculation.netAfterTax.toFixed(2)}`);
      }
    } catch (error) {
      console.error('[TradingService] Failed to calculate/record tax information:', error);
      // Non-fatal: Continue with position close even if tax calculation fails
    }

    // Delete the position
    await this.storage.closePosition(positionId);

    // Monitor trade and trigger circuit breakers if needed
    try {
      await this.tradeMonitoringService.monitorTradeAndTriggerBreakers(createdTrade);
    } catch (error) {
      console.error('[TradingService] Failed to monitor trade for circuit breakers:', error);
    }

    // Update risk metrics (VaR, ES, Drawdown) after trade closes
    try {
      await this.riskService.updateRiskMetrics(position.portfolio_id);
    } catch (error) {
      console.error('[TradingService] Failed to update risk metrics:', error);
    }
  }

  async updatePositionPrices(portfolioId: string): Promise<void> {
    const positions = await this.storage.getPositionsByPortfolioId(portfolioId);

    for (const position of positions) {
      const marketData = await this.storage.getMarketDataBySymbol(position.symbol);
      if (!marketData) continue;

      const currentPrice = marketData.current_price;
      const entryPrice = parseFloat(position.entry_price);
      const currentPriceNum = parseFloat(currentPrice);
      const qty = parseFloat(position.quantity);

      let unrealizedPnl: number;
      if (position.side === "long") {
        unrealizedPnl = (currentPriceNum - entryPrice) * qty;
      } else {
        unrealizedPnl = (entryPrice - currentPriceNum) * qty;
      }

      const unrealizedPnlPercentage = ((unrealizedPnl / (entryPrice * qty)) * 100);

      await this.storage.updatePosition(position.id, {
        current_price: currentPrice,
        unrealized_pnl: unrealizedPnl.toFixed(2),
        unrealized_pnl_percentage: unrealizedPnlPercentage.toFixed(4),
      });
    }
  }

  async getAvailableSymbols(): Promise<MarketDataCache[]> {
    return await this.storage.getAllMarketData();
  }
}
