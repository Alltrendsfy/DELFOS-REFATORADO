import crypto from 'crypto';
import type { IStorage } from '../storage';
import type { InsertOrder, Order } from '@shared/schema';
import { observabilityService } from './observabilityService';

interface KrakenOrderResponse {
  error: string[];
  result?: {
    descr?: {
      order: string;
    };
    txid?: string[];
  };
}

interface KrakenCancelResponse {
  error: string[];
  result?: {
    count: number;
  };
}

interface KrakenQueryOrdersResponse {
  error: string[];
  result?: {
    [txid: string]: {
      status: string;
      opentm: number;
      vol: string;
      vol_exec: string;
      cost: string;
      fee: string;
      price: string;
      stopprice?: string;
      limitprice?: string;
      descr: {
        pair: string;
        type: string;
        ordertype: string;
        price: string;
        price2?: string;
      };
    };
  };
}

export class OrderExecutionService {
  private readonly API_URL = 'https://api.kraken.com';
  private apiKey: string | null = null;
  private apiSecret: Buffer | null = null;
  private initialized = false;

  constructor(private storage: IStorage) {
    // Lazy initialization - don't throw if secrets are missing
    // This allows the service to be instantiated even without Kraken credentials
  }

  /**
   * Initialize Kraken credentials (lazy init pattern)
   * Throws error only when actually needed
   */
  private ensureInitialized(): void {
    if (this.initialized) return;

    const key = process.env.KRAKEN_API_KEY;
    const secret = process.env.KRAKEN_API_SECRET;

    if (!key || !secret) {
      throw new Error('KRAKEN_API_KEY and KRAKEN_API_SECRET must be set in environment');
    }

    this.apiKey = key;
    this.apiSecret = Buffer.from(secret, 'base64');
    this.initialized = true;
  }

  /**
   * Generate HMAC-SHA512 signature for Kraken private endpoints
   */
  private generateSignature(path: string, nonce: string, postData: string): string {
    this.ensureInitialized();
    
    if (!this.apiSecret) {
      throw new Error('API secret not initialized');
    }
    // Step 1: SHA256(nonce + POST data)
    const sha256Hash = crypto
      .createHash('sha256')
      .update(nonce + postData)
      .digest();

    // Step 2: HMAC-SHA512(path + hash, secret)
    const hmac = crypto
      .createHmac('sha512', this.apiSecret)
      .update(path + sha256Hash.toString('binary'), 'binary')
      .digest('base64');

    return hmac;
  }

  /**
   * Make authenticated request to Kraken private API
   */
  private async krakenPrivateRequest<T>(
    endpoint: string,
    params: Record<string, any>
  ): Promise<T> {
    this.ensureInitialized();
    
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Kraken API credentials not initialized');
    }

    const path = `/0/private/${endpoint}`;
    const url = this.API_URL + path;

    // Nonce must be increasing (use milliseconds)
    const nonce = Date.now().toString();

    // Build POST data
    const postData = new URLSearchParams({
      nonce,
      ...params,
    }).toString();

    // Generate signature
    const signature = this.generateSignature(path, nonce, postData);

    // Make request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'API-Key': this.apiKey,
        'API-Sign': signature,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: postData,
    });

    if (!response.ok) {
      // Track HTTP-level rate limiting (429 status code)
      if (response.status === 429) {
        observabilityService.restRateLimitHits.inc({ exchange: 'kraken', endpoint });
      }
      throw new Error(`Kraken API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as T;
    
    // Check for API-level rate limiting errors in response
    const anyData = data as any;
    if (anyData?.error && Array.isArray(anyData.error)) {
      const rateLimitErrors = anyData.error.filter((err: string) => 
        err.includes('Rate limit') || 
        err.includes('EAPI:Rate') ||
        err.includes('rate limit') ||
        err.startsWith('EAPI:')
      );
      
      if (rateLimitErrors.length > 0) {
        observabilityService.restRateLimitHits.inc({ exchange: 'kraken', endpoint });
        console.warn(`[WARNING] Kraken rate limit hit on ${endpoint}:`, rateLimitErrors);
      }
    }
    
    return data;
  }

  /**
   * Convert DELFOS symbol format (BTC/USD) to Kraken format (XBTUSD)
   */
  private toKrakenPair(symbol: string): string {
    // Remove slash and handle special cases
    const normalized = symbol.replace('/', '');
    
    // BTC -> XBT on Kraken
    if (normalized.startsWith('BTC')) {
      return normalized.replace('BTC', 'XBT');
    }
    
    return normalized;
  }

  /**
   * Convert Kraken pair format (XBTUSD) back to DELFOS format (BTC/USD)
   */
  private fromKrakenPair(krakenPair: string): string {
    // XBT -> BTC
    let pair = krakenPair.replace('XBT', 'BTC');
    
    // Add slash before last 3-4 chars (USD, USDT, EUR, etc.)
    if (pair.endsWith('USDT')) {
      return pair.slice(0, -4) + '/' + pair.slice(-4);
    } else if (pair.endsWith('USD') || pair.endsWith('EUR')) {
      return pair.slice(0, -3) + '/' + pair.slice(-3);
    }
    
    return pair;
  }

  /**
   * Place a new order on Kraken
   */
  async placeOrder(orderData: {
    portfolioId: string;
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit' | 'stop_loss' | 'take_profit';
    quantity: string;
    price?: string;
    stopPrice?: string;
  }): Promise<Order> {
    // Convert to Kraken pair format
    const krakenPair = this.toKrakenPair(orderData.symbol);

    // Build Kraken order parameters
    const krakenParams: Record<string, any> = {
      pair: krakenPair,
      type: orderData.side,
      ordertype: orderData.type === 'stop_loss' ? 'stop-loss' : orderData.type,
      volume: orderData.quantity,
    };

    // Add price for limit orders
    if (orderData.type === 'limit' && orderData.price) {
      krakenParams.price = orderData.price;
    }

    // Add stop price for stop orders
    if (orderData.type === 'stop_loss' && orderData.stopPrice) {
      krakenParams.price = orderData.stopPrice;
    }

    // Call Kraken API
    console.log(`[INFO] Placing ${orderData.type} ${orderData.side} order for ${orderData.quantity} ${orderData.symbol}`);
    
    const response = await this.krakenPrivateRequest<KrakenOrderResponse>(
      'AddOrder',
      krakenParams
    );

    // Check for errors
    if (response.error && response.error.length > 0) {
      console.error('[ERROR] Kraken order error:', response.error);
      throw new Error(`Kraken API error: ${response.error.join(', ')}`);
    }

    if (!response.result?.txid || response.result.txid.length === 0) {
      throw new Error('No transaction ID returned from Kraken');
    }

    const exchangeOrderId = response.result.txid[0];
    console.log(`[INFO] Order placed successfully: ${exchangeOrderId}`);

    // Save order to database via storage abstraction
    const order = await this.storage.createOrder({
      portfolio_id: orderData.portfolioId,
      symbol: orderData.symbol,
      side: orderData.side,
      type: orderData.type,
      quantity: orderData.quantity,
      price: orderData.price || null,
      stop_price: orderData.stopPrice || null,
      status: 'pending',
      filled_quantity: '0',
      exchange_order_id: exchangeOrderId,
    });

    return order;
  }

  /**
   * Cancel an existing order on Kraken
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    // Get order from database via storage abstraction
    const order = await this.storage.getOrder(orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (!order.exchange_order_id) {
      throw new Error(`Order has no exchange ID: ${orderId}`);
    }

    if (order.status === 'filled' || order.status === 'cancelled') {
      throw new Error(`Order already ${order.status}: ${orderId}`);
    }

    console.log(`[INFO] Cancelling order: ${order.exchange_order_id}`);

    // Call Kraken API
    const response = await this.krakenPrivateRequest<KrakenCancelResponse>(
      'CancelOrder',
      { txid: order.exchange_order_id }
    );

    // Check for errors
    if (response.error && response.error.length > 0) {
      console.error('[ERROR] Kraken cancel error:', response.error);
      throw new Error(`Kraken API error: ${response.error.join(', ')}`);
    }

    if (!response.result || response.result.count === 0) {
      throw new Error('Order cancellation failed');
    }

    console.log(`[INFO] Order cancelled successfully`);

    // Update order status in database via storage abstraction
    await this.storage.updateOrderStatus(orderId, 'cancelled');

    return true;
  }

  /**
   * Query order status from Kraken and update database
   */
  async queryAndUpdateOrder(orderId: string): Promise<Order> {
    // Get order from database via storage abstraction
    const order = await this.storage.getOrder(orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (!order.exchange_order_id) {
      throw new Error(`Order has no exchange ID: ${orderId}`);
    }

    console.log(`[INFO] Querying order status: ${order.exchange_order_id}`);

    // Call Kraken API
    const response = await this.krakenPrivateRequest<KrakenQueryOrdersResponse>(
      'QueryOrders',
      { txid: order.exchange_order_id }
    );

    // Check for errors
    if (response.error && response.error.length > 0) {
      console.error('[ERROR] Kraken query error:', response.error);
      throw new Error(`Kraken API error: ${response.error.join(', ')}`);
    }

    if (!response.result) {
      throw new Error('No result returned from Kraken');
    }

    const krakenOrder = response.result[order.exchange_order_id];
    if (!krakenOrder) {
      throw new Error(`Order not found on Kraken: ${order.exchange_order_id}`);
    }

    // Map Kraken status to our status
    let status: string = order.status;
    if (krakenOrder.status === 'closed') {
      status = 'filled';
    } else if (krakenOrder.status === 'canceled') {
      status = 'cancelled';
    } else if (krakenOrder.status === 'open') {
      const volExec = parseFloat(krakenOrder.vol_exec);
      if (volExec > 0 && volExec < parseFloat(krakenOrder.vol)) {
        status = 'partially_filled';
      } else {
        status = 'pending';
      }
    }

    // Calculate average fill price
    let avgFillPrice = order.average_fill_price;
    const volExec = parseFloat(krakenOrder.vol_exec);
    if (volExec > 0 && krakenOrder.cost) {
      const cost = parseFloat(krakenOrder.cost);
      avgFillPrice = (cost / volExec).toString();
    }

    // Update order in database via storage abstraction
    const updatedOrder = await this.storage.updateOrderStatus(
      orderId,
      status,
      krakenOrder.vol_exec,
      avgFillPrice || undefined
    );

    console.log(`[INFO] Order status updated: ${status}`);

    // Update execution metrics
    try {
      const portfolio = await this.storage.getPortfolio(order.portfolio_id);
      if (portfolio) {
        // Calculate fill rate (0-100%)
        const requestedVolume = parseFloat(order.quantity);
        const filledVolume = parseFloat(krakenOrder.vol_exec);
        const fillRatePercent = requestedVolume > 0 ? (filledVolume / requestedVolume) * 100 : 0;
        
        // Update portfolio-level fill rate metric
        observabilityService.updatePerformanceMetrics(order.portfolio_id, {
          fillRate: fillRatePercent
        });

        // Calculate slippage in basis points
        if (avgFillPrice && order.price && filledVolume > 0) {
          const expectedPrice = parseFloat(order.price);
          const actualPrice = parseFloat(avgFillPrice);
          
          // Slippage = (actual - expected) / expected * 10000 basis points
          // Positive slippage means worse execution (higher for buy, lower for sell)
          let slippageBp = 0;
          if (order.side === 'buy') {
            slippageBp = ((actualPrice - expectedPrice) / expectedPrice) * 10000;
          } else {
            slippageBp = ((expectedPrice - actualPrice) / expectedPrice) * 10000;
          }
          
          // Record slippage histogram
          observabilityService.recordSlippage(order.symbol, order.side, Math.abs(slippageBp));
        }
      }
    } catch (error) {
      console.error('[OrderExecutionService] Failed to update execution metrics:', error);
    }

    return updatedOrder;
  }

  /**
   * Query all open orders from Kraken
   */
  async queryOpenOrders(): Promise<KrakenQueryOrdersResponse['result']> {
    console.log(`[INFO] Querying all open orders`);

    const response = await this.krakenPrivateRequest<KrakenQueryOrdersResponse>(
      'OpenOrders',
      {}
    );

    if (response.error && response.error.length > 0) {
      console.error('[ERROR] Kraken query error:', response.error);
      throw new Error(`Kraken API error: ${response.error.join(', ')}`);
    }

    return response.result || {};
  }
}
