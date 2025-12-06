import type { InsertPosition, InsertTrade } from "@shared/schema";
import { DataIngestionService } from "./dataIngestionService";

interface OrderRequest {
  symbol: string;
  side: "long" | "short";
  quantity: string;
  stopLoss?: string;
  takeProfit?: string;
}

interface OrderResult {
  orderId: string;
  executionPrice: string;
  quantity: string;
  fees: string;
  timestamp: Date;
}

export class PaperTradingExecutor {
  private dataService: DataIngestionService;

  constructor() {
    this.dataService = new DataIngestionService();
  }

  async executeMarketOrder(request: OrderRequest): Promise<OrderResult> {
    const { symbol, side, quantity } = request;

    const currentPrice = await this.getCurrentPrice(symbol);
    const slippage = this.calculateSlippage(symbol, parseFloat(quantity), currentPrice);
    
    const executionPrice = side === "long" 
      ? currentPrice * (1 + slippage)
      : currentPrice * (1 - slippage);

    const notionalValue = executionPrice * parseFloat(quantity);
    const fees = this.calculateFees(notionalValue);

    const orderId = `PAPER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      orderId,
      executionPrice: executionPrice.toFixed(8),
      quantity: quantity,
      fees: fees.toFixed(8),
      timestamp: new Date(),
    };
  }

  private async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const krakenSymbol = this.toKrakenSymbol(symbol);
      const l1Data = await this.dataService.getL1Quote("kraken", krakenSymbol);
      
      if (l1Data && l1Data.bid_price && l1Data.ask_price) {
        return (parseFloat(l1Data.bid_price) + parseFloat(l1Data.ask_price)) / 2;
      }

      const recentTicks = await this.dataService.getRecentTicks("kraken", krakenSymbol, 1);
      if (recentTicks && recentTicks.length > 0 && recentTicks[0].price) {
        return parseFloat(recentTicks[0].price);
      }

      throw new Error(`No price data available for ${symbol}`);
    } catch (error) {
      console.error(`Error getting current price for ${symbol}:`, error);
      throw new Error(`Failed to get current price for ${symbol}`);
    }
  }

  private calculateSlippage(symbol: string, quantity: number, price: number): number {
    const notionalValue = quantity * price;
    
    if (notionalValue < 1000) {
      return 0.0005;
    } else if (notionalValue < 10000) {
      return 0.001;
    } else if (notionalValue < 50000) {
      return 0.0015;
    } else {
      return 0.002;
    }
  }

  private calculateFees(notionalValue: number): number {
    const takerFeeRate = 0.0026;
    return notionalValue * takerFeeRate;
  }

  private toKrakenSymbol(symbol: string): string {
    const mapping: Record<string, string> = {
      "BTC/USD": "XBT/USD",
      "BTC/EUR": "XBT/EUR",
    };
    return mapping[symbol] || symbol;
  }

  async closePosition(position: {
    symbol: string;
    side: "long" | "short";
    quantity: string;
    entry_price: string;
  }): Promise<OrderResult> {
    const closeSide = position.side === "long" ? "short" : "long";
    
    const currentPrice = await this.getCurrentPrice(position.symbol);
    const slippage = this.calculateSlippage(
      position.symbol,
      parseFloat(position.quantity),
      currentPrice
    );
    
    const executionPrice = closeSide === "long"
      ? currentPrice * (1 + slippage)
      : currentPrice * (1 - slippage);

    const notionalValue = executionPrice * parseFloat(position.quantity);
    const fees = this.calculateFees(notionalValue);

    const orderId = `PAPER_CLOSE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      orderId,
      executionPrice: executionPrice.toFixed(8),
      quantity: position.quantity,
      fees: fees.toFixed(8),
      timestamp: new Date(),
    };
  }
}
