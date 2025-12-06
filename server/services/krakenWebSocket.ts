import type { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { KRAKEN_WS_URL, getKrakenPairsForWebSocket } from "./krakenService";
import { DataIngestionService } from "./dataIngestionService";
import { observabilityService } from "./observabilityService";

interface KrakenMessage {
  event?: string;
  pair?: string[];
  subscription?: {
    name: string;
  };
  channelName?: string;
  data?: any;
}

interface L2Level {
  price: string;
  quantity: string;
}

interface OrderBookCache {
  bids: Map<string, string>; // price -> quantity
  asks: Map<string, string>; // price -> quantity
  lastUpdate: number;
}

export class KrakenWebSocketManager {
  private krakenWS: WebSocket | null = null;
  private clientSockets: Set<WebSocket> = new Set();
  private wss: WebSocketServer;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private dataIngestion: DataIngestionService;
  private tickSequence: number = 0;
  private orderBookCache: Map<string, OrderBookCache> = new Map(); // symbol -> OrderBookCache
  private fallbackRestInterval: NodeJS.Timeout | null = null;
  private isFallbackMode: boolean = false;

  constructor(httpServer: HTTPServer) {
    this.dataIngestion = new DataIngestionService();
    // Create WebSocket server for clients
    this.wss = new WebSocketServer({ 
      server: httpServer,
      path: '/ws/market-data'
    });

    this.wss.on('connection', (clientSocket) => {
      console.log('Client connected to market data WebSocket');
      this.clientSockets.add(clientSocket);

      clientSocket.on('close', () => {
        console.log('Client disconnected from market data WebSocket');
        this.clientSockets.delete(clientSocket);
      });

      clientSocket.on('error', (error) => {
        console.error('Client WebSocket error:', error);
        this.clientSockets.delete(clientSocket);
      });

      // Send current connection status
      this.sendToClient(clientSocket, {
        type: 'status',
        connected: this.krakenWS?.readyState === WebSocket.OPEN
      });
    });

    // Connect to Kraken WebSocket
    this.connectToKraken();
  }

  private connectToKraken() {
    if (this.krakenWS) {
      this.krakenWS.close();
    }

    // Clear order book cache on reconnect
    this.orderBookCache.clear();
    console.log('🔄 Cleared L2 order book cache (reconnecting)');

    console.log('Connecting to Kraken WebSocket...');
    this.krakenWS = new WebSocket(KRAKEN_WS_URL);

    this.krakenWS.on('open', () => {
      console.log('Connected to Kraken WebSocket');
      this.broadcastToClients({
        type: 'status',
        connected: true
      });

      // Stop fallback REST polling if it was active
      this.stopFallbackRestPolling();

      // Subscribe to ticker updates for tracked pairs
      this.subscribeToTickers();

      // Subscribe to L2 order book updates for tracked pairs
      this.subscribeToOrderBooks();

      // Set up ping interval
      this.setupPingInterval();
    });

    this.krakenWS.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleKrakenMessage(message);
      } catch (error) {
        console.error('Error parsing Kraken message:', error);
      }
    });

    this.krakenWS.on('error', (error) => {
      console.error('Kraken WebSocket error:', error);
      this.broadcastToClients({
        type: 'status',
        connected: false,
        error: 'Connection error'
      });
    });

    this.krakenWS.on('close', () => {
      console.log('Disconnected from Kraken WebSocket');
      this.broadcastToClients({
        type: 'status',
        connected: false
      });

      // Clear ping interval
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }

      // Start fallback REST polling immediately
      this.startFallbackRestPolling();

      // Attempt to reconnect after 5 seconds
      this.reconnectTimeout = setTimeout(() => {
        console.log('Attempting to reconnect to Kraken...');
        this.connectToKraken();
      }, 5000);
    });
  }

  private async subscribeToTickers() {
    if (this.krakenWS?.readyState !== WebSocket.OPEN) {
      return;
    }

    const pairs = await getKrakenPairsForWebSocket();
    
    if (pairs.length === 0) {
      console.warn('⚠️  No Kraken pairs found for WebSocket subscription');
      return;
    }

    // Kraken limits: max 20 pairs per subscription message, min 1s between messages
    const BATCH_SIZE = 20;
    const BATCH_DELAY_MS = 1000;
    
    const batches = [];
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      batches.push(pairs.slice(i, i + BATCH_SIZE));
    }

    console.log(`📡 Subscribing to ${pairs.length} ticker pairs in ${batches.length} batches...`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      if (this.krakenWS?.readyState === WebSocket.OPEN) {
        const subscription = {
          event: 'subscribe',
          pair: batch,
          subscription: {
            name: 'ticker'
          }
        };
        
        this.krakenWS.send(JSON.stringify(subscription));
        console.log(`✅ Ticker batch ${i + 1}/${batches.length}: subscribed to ${batch.length} pairs`);
        
        // Wait before sending next batch (except for last batch)
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      } else {
        console.error('❌ WebSocket closed during batch subscription');
        break;
      }
    }
    
    console.log(`✅ Ticker subscription complete: ${pairs.length} total pairs`);
  }

  private async subscribeToOrderBooks() {
    if (this.krakenWS?.readyState !== WebSocket.OPEN) {
      return;
    }

    const pairs = await getKrakenPairsForWebSocket();
    
    if (pairs.length === 0) {
      console.warn('⚠️  No Kraken pairs found for order book subscription');
      return;
    }

    // Kraken limits: max 20 pairs per subscription message, min 1s between messages
    const BATCH_SIZE = 20;
    const BATCH_DELAY_MS = 1000;
    
    const batches = [];
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      batches.push(pairs.slice(i, i + BATCH_SIZE));
    }

    console.log(`📚 Subscribing to ${pairs.length} order book pairs in ${batches.length} batches (depth=10)...`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      if (this.krakenWS?.readyState === WebSocket.OPEN) {
        const subscription = {
          event: 'subscribe',
          pair: batch,
          subscription: {
            name: 'book',
            depth: 10  // Top 10 bids and asks
          }
        };
        
        this.krakenWS.send(JSON.stringify(subscription));
        console.log(`✅ Order book batch ${i + 1}/${batches.length}: subscribed to ${batch.length} pairs`);
        
        // Wait before sending next batch (except for last batch)
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      } else {
        console.error('❌ WebSocket closed during order book subscription');
        break;
      }
    }
    
    console.log(`✅ Order book subscription complete: ${pairs.length} total pairs`);
  }

  private setupPingInterval() {
    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.krakenWS?.readyState === WebSocket.OPEN) {
        this.krakenWS.send(JSON.stringify({ event: 'ping' }));
      }
    }, 30000);
  }

  private handleKrakenMessage(message: any) {
    // Handle system events
    if (message.event) {
      if (message.event === 'heartbeat') {
        // Heartbeat received, connection is healthy
        return;
      }
      if (message.event === 'pong') {
        // Pong received in response to ping
        return;
      }
      if (message.event === 'systemStatus') {
        console.log('Kraken system status:', message.status);
        return;
      }
      if (message.event === 'subscriptionStatus') {
        if (message.status === 'subscribed') {
          console.log('Successfully subscribed to', message.channelName, 'for', message.pair);
        } else {
          console.log('Subscription status:', message);
          
          // Detect unsupported pairs and mark them
          if (message.status === 'error' && message.errorMessage?.includes('Currency pair not supported') && message.pair) {
            const symbol = message.pair;
            console.warn(`🚫 Detected unsupported pair: ${symbol}`);
            
            // Import and mark as unsupported (lazy load to avoid circular dependency)
            import('./stalenessGuardService').then(({ stalenessGuardService }) => {
              stalenessGuardService.markAsUnsupported(symbol);
            }).catch(err => console.error('Failed to mark unsupported symbol:', err));
          }
        }
        return;
      }
    }

    // Handle ticker data updates
    if (Array.isArray(message) && message.length > 0) {
      const channelID = message[0];
      const data = message[1];
      const channelName = message[2];
      const pair = message[3];

      if (channelName === 'ticker' && data) {
        const now = Date.now();
        const price = data.c ? data.c[0] : null;
        const bid = data.b ? data.b[0] : null;
        const ask = data.a ? data.a[0] : null;

        // Store tick in Redis (last trade)
        if (price) {
          this.tickSequence++;
          this.dataIngestion.storeTick('kraken', pair, {
            price,
            quantity: data.c && data.c[1] ? data.c[1] : '0',
            side: 'buy', // We don't know the actual side from ticker
            exchange_ts: now,
            ingest_ts: now,
            seq_id: `${pair}-${this.tickSequence}`,
          }).catch(err => console.error('Error storing tick:', err));

          // Update current price
          this.dataIngestion.setCurrentPrice('kraken', pair, price)
            .catch(err => console.error('Error setting current price:', err));
          
          // Record WebSocket latency (assume exchange_ts is now since we don't have server time)
          observabilityService.recordWebSocketLatency('kraken', 'ticker', 0);
          
          // Update staleness (ticker data is real-time, so age is 0)
          observabilityService.updateStaleness('ticker', pair, 0);
        }

        // Store L1 quote in Redis
        if (bid && ask) {
          const bidQty = data.b && data.b[1] ? data.b[1] : '0';
          const askQty = data.a && data.a[1] ? data.a[1] : '0';
          
          const bidPrice = parseFloat(bid);
          const askPrice = parseFloat(ask);
          const spreadBps = ((askPrice - bidPrice) / bidPrice * 10000).toFixed(2);

          this.dataIngestion.updateL1Quote('kraken', pair, {
            bid_price: bid,
            bid_quantity: bidQty,
            ask_price: ask,
            ask_quantity: askQty,
            spread_bps: spreadBps,
            exchange_ts: now.toString(),
            ingest_ts: now.toString(),
          }).catch(err => console.error('Error updating L1 quote:', err));
        }

        // Format ticker data for clients
        const formattedTicker = {
          type: 'ticker',
          symbol: pair,
          price,
          volume: data.v ? data.v[1] : null, // 24h volume
          high: data.h ? data.h[1] : null, // 24h high
          low: data.l ? data.l[1] : null, // 24h low
          bid,
          ask,
          timestamp: now
        };

        // Broadcast to all connected clients
        this.broadcastToClients(formattedTicker);
      }

      // Handle order book (L2) data updates
      if (typeof channelName === 'string' && channelName.startsWith('book-') && data) {
        this.handleOrderBookUpdate(pair, data);
      }
    }
  }

  private handleOrderBookUpdate(pair: string, data: any) {
    try {
      // Kraken order book format:
      // Snapshot: { as: [[price, volume, timestamp], ...], bs: [[price, volume, timestamp], ...] }
      // Delta: { a: [[price, volume, timestamp]], b: [[price, volume, timestamp]] }
      
      const isSnapshot = !!(data.bs || data.as);
      const bidUpdates = data.bs || data.b || [];
      const askUpdates = data.as || data.a || [];

      if (bidUpdates.length === 0 && askUpdates.length === 0) {
        return; // Empty update
      }

      // Get or initialize cache for this pair
      let cache = this.orderBookCache.get(pair);
      
      if (!cache || isSnapshot) {
        // Initialize/reset cache with snapshot
        cache = {
          bids: new Map<string, string>(),
          asks: new Map<string, string>(),
          lastUpdate: Date.now()
        };
        this.orderBookCache.set(pair, cache);
        
        console.log(`📸 L2 snapshot for ${pair}: ${bidUpdates.length} bids, ${askUpdates.length} asks`);
      }

      // Apply updates to cache
      const applyLevels = (levels: any[], targetMap: Map<string, string>) => {
        for (const level of levels) {
          const price = level[0];
          const quantity = level[1];
          
          if (parseFloat(quantity) === 0) {
            // Remove level when quantity is zero
            targetMap.delete(price);
          } else {
            // Update or insert level
            targetMap.set(price, quantity);
          }
        }
      };

      applyLevels(bidUpdates, cache.bids);
      applyLevels(askUpdates, cache.asks);
      cache.lastUpdate = Date.now();

      // Trim cache to max 100 levels per side to prevent unbounded growth
      const MAX_CACHE_DEPTH = 100;
      const trimMap = (map: Map<string, string>, sortDesc: boolean) => {
        if (map.size > MAX_CACHE_DEPTH) {
          const sorted = Array.from(map.entries())
            .sort((a, b) => sortDesc 
              ? parseFloat(b[0]) - parseFloat(a[0])  // Descending (bids)
              : parseFloat(a[0]) - parseFloat(b[0])   // Ascending (asks)
            );
          map.clear();
          sorted.slice(0, MAX_CACHE_DEPTH).forEach(([price, qty]) => map.set(price, qty));
        }
      };

      trimMap(cache.bids, true);  // Bids: highest first
      trimMap(cache.asks, false); // Asks: lowest first

      // Extract top 10 levels and convert to sorted arrays
      const getTopLevels = (map: Map<string, string>, sortDesc: boolean, limit: number = 10): L2Level[] => {
        return Array.from(map.entries())
          .sort((a, b) => sortDesc 
            ? parseFloat(b[0]) - parseFloat(a[0])  // Descending (bids)
            : parseFloat(a[0]) - parseFloat(b[0])   // Ascending (asks)
          )
          .slice(0, limit)
          .map(([price, quantity]) => ({ price, quantity }));
      };

      const top10Bids = getTopLevels(cache.bids, true, 10);
      const top10Asks = getTopLevels(cache.asks, false, 10);

      // Persist to Redis with write coalescing to prevent memory leak
      if (top10Bids.length > 0 || top10Asks.length > 0) {
        this.dataIngestion.updateL2OrderBook('kraken', pair, top10Bids, top10Asks, cache.lastUpdate)
          .catch(err => console.error(`❌ L2 Redis write FAIL for ${pair}:`, err));
        
        // Record metrics only if cache exists
        if (cache) {
          observabilityService.recordWebSocketLatency('kraken', 'book', 0);
          const ageSeconds = (Date.now() - cache.lastUpdate) / 1000;
          observabilityService.updateStaleness('book', pair, ageSeconds);
        }
      }

    } catch (error) {
      console.error(`Error handling order book update for ${pair}:`, error);
    }
  }

  private sendToClient(socket: WebSocket, data: any) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  private broadcastToClients(data: any) {
    const message = JSON.stringify(data);
    this.clientSockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    });
  }

  public getL2OrderBook(symbol: string): { bids: L2Level[]; asks: L2Level[] } {
    const cache = this.orderBookCache.get(symbol);
    if (!cache) {
      return { bids: [], asks: [] };
    }

    // Extract top 10 levels from cache
    const getTopLevels = (map: Map<string, string>, sortDesc: boolean, limit: number = 10): L2Level[] => {
      return Array.from(map.entries())
        .sort((a, b) => sortDesc 
          ? parseFloat(b[0]) - parseFloat(a[0])  // Descending (bids)
          : parseFloat(a[0]) - parseFloat(b[0])   // Ascending (asks)
        )
        .slice(0, limit)
        .map(([price, quantity]) => ({ price, quantity }));
    };

    return {
      bids: getTopLevels(cache.bids, true, 10),
      asks: getTopLevels(cache.asks, false, 10)
    };
  }

  private startFallbackRestPolling() {
    if (this.fallbackRestInterval) {
      return; // Already running
    }

    console.log('🚨 WebSocket down - starting fallback REST polling (2s interval)...');
    this.isFallbackMode = true;
    
    // Record metrics
    observabilityService.updateFallbackMode(true);
    observabilityService.fallbackPollingActive.set({ exchange: 'kraken' }, 1);

    // Poll immediately, then every 2 seconds
    this.fetchMarketDataViaREST();
    this.fallbackRestInterval = setInterval(() => {
      this.fetchMarketDataViaREST();
    }, 2000);
  }

  private stopFallbackRestPolling() {
    if (!this.fallbackRestInterval) {
      return; // Not running
    }

    console.log('✅ WebSocket restored - stopping fallback REST polling');
    clearInterval(this.fallbackRestInterval);
    this.fallbackRestInterval = null;
    this.isFallbackMode = false;
    
    // Record metrics
    observabilityService.updateFallbackMode(false);
    observabilityService.fallbackPollingActive.set({ exchange: 'kraken' }, 0);
  }

  private async fetchMarketDataViaREST() {
    try {
      // Fetch ALL tracked symbols (same as WebSocket subscriptions)
      const pairs = await getKrakenPairsForWebSocket();
      
      if (pairs.length === 0) {
        console.warn('⚠️  No pairs found for REST fallback');
        return;
      }

      // PARALLEL BATCHING STRATEGY to meet <2s refresh requirement
      // Kraken public endpoints: ~15-20 req/sec limit
      // Strategy: Batch Ticker (L1) + parallel Depth/Trades with controlled concurrency
      
      const TICKER_BATCH_SIZE = 20; // Ticker can handle multiple pairs
      const PARALLEL_DEPTH_TRADES = 10; // Max concurrent depth/trades requests
      
      const start = Date.now();

      // STEP 1: Fetch ALL Ticker (L1) data in batches (fast - multi-pair endpoint)
      const tickerBatches: string[][] = [];
      for (let i = 0; i < pairs.length; i += TICKER_BATCH_SIZE) {
        tickerBatches.push(pairs.slice(i, i + TICKER_BATCH_SIZE));
      }

      await Promise.all(tickerBatches.map(batch => this.fetchTickerBatch(batch)));

      // STEP 2: Fetch Depth + Trades for ALL pairs with controlled batching
      // Kraken rate limit: ~15-20 req/sec
      // Strategy: Batches of 8 pairs (8×2=16 requests within limit)
      // Expected time: ~3.5s for 100 pairs (within WARN threshold of 4s)
      const DEPTH_TRADES_BATCH_SIZE = 8;
      const depthTradesBatches: string[][] = [];
      for (let i = 0; i < pairs.length; i += DEPTH_TRADES_BATCH_SIZE) {
        depthTradesBatches.push(pairs.slice(i, i + DEPTH_TRADES_BATCH_SIZE));
      }

      // Process batches sequentially to respect rate limits
      for (const batch of depthTradesBatches) {
        await Promise.all(batch.map(pair => this.fetchDepthAndTrades(pair)));
      }

      const elapsed = Date.now() - start;
      
      // Record polling interval metric
      observabilityService.pollingIntervalMs.observe(elapsed);
      
      console.log(`📡 REST fallback: Updated ${pairs.length} symbols (L1+L2+ticks) in ${elapsed}ms (${depthTradesBatches.length} batches)`);
    } catch (error) {
      console.error('❌ REST fallback error:', error);
    }
  }

  private async fetchTickerBatch(pairs: string[]) {
    try {
      const now = Date.now();
      
      const tickerResponse = await fetch('https://api.kraken.com/0/public/Ticker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          pair: pairs.join(',')
        })
      });

      if (!tickerResponse.ok) {
        return;
      }

      const tickerData = await tickerResponse.json();
      
      if (tickerData.error?.length > 0) {
        return;
      }

      const tickerResults = tickerData.result || {};
      
      for (const [krakenPairName, ticker] of Object.entries(tickerResults)) {
        if (!ticker || typeof ticker !== 'object') {
          continue;
        }

        const symbol = pairs.find(p => p === krakenPairName || p.replace('/', '') === krakenPairName) || krakenPairName;

        const bid = (ticker as any).b?.[0];
        const ask = (ticker as any).a?.[0];
        
        if (bid && ask) {
          const bidQty = (ticker as any).b?.[1] || '0';
          const askQty = (ticker as any).a?.[1] || '0';
          
          const bidPrice = parseFloat(bid);
          const askPrice = parseFloat(ask);
          const spreadBps = ((askPrice - bidPrice) / bidPrice) * 10000;

          await this.dataIngestion.updateL1Quote('kraken', symbol, {
            bid_price: bid,
            bid_quantity: bidQty,
            ask_price: ask,
            ask_quantity: askQty,
            spread_bps: spreadBps.toFixed(2),
            exchange_ts: now.toString(),
            ingest_ts: now.toString(),
          });

          const lastPrice = (ticker as any).c?.[0];
          if (lastPrice) {
            await this.dataIngestion.setCurrentPrice('kraken', symbol, lastPrice);
          }
        }
      }
    } catch (error) {
      // Silent fail - individual batch errors shouldn't stop other batches
    }
  }

  // Public method to refresh a single symbol via REST (called by staleness guard)
  public async refreshSymbolViaREST(symbol: string): Promise<boolean> {
    const { observabilityService } = await import('./observabilityService');
    try {
      // Fetch L1 (ticker) data
      await this.fetchTickerBatch([symbol]);
      
      // Fetch L2 (depth) + ticks (trades) data
      await this.fetchDepthAndTrades(symbol);
      
      // Record successful refresh
      observabilityService.recordRestRefresh(symbol, true);
      return true;
    } catch (error) {
      console.error(`❌ Failed to refresh ${symbol} via REST:`, error);
      
      // Record failed refresh
      observabilityService.recordRestRefresh(symbol, false);
      return false;
    }
  }

  private async fetchDepthAndTrades(pair: string) {
    try {
      const now = Date.now();
      
      // Fetch Depth and Trades in parallel for this pair
      const [depthResponse, tradesResponse] = await Promise.all([
        fetch('https://api.kraken.com/0/public/Depth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            pair: pair,
            count: '10'
          })
        }),
        fetch('https://api.kraken.com/0/public/Trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            pair: pair
          })
        })
      ]);

      // Process Depth (L2)
      if (depthResponse.ok) {
        const depthData = await depthResponse.json();
        if (!depthData.error || depthData.error.length === 0) {
          const depthResult = depthData.result?.[pair] || depthData.result?.[Object.keys(depthData.result || {})[0]];
          
          if (depthResult?.bids && depthResult?.asks) {
            await this.dataIngestion.updateL2OrderBook(
              'kraken',
              pair,
              depthResult.bids.slice(0, 10),
              depthResult.asks.slice(0, 10),
              now
            );
          }
        }
      }

      // Process Trades (ticks)
      if (tradesResponse.ok) {
        const tradesData = await tradesResponse.json();
        if (!tradesData.error || tradesData.error.length === 0) {
          const tradesResult = tradesData.result?.[pair] || tradesData.result?.[Object.keys(tradesData.result || {})[0]];
          
          if (Array.isArray(tradesResult) && tradesResult.length > 0) {
            for (const trade of tradesResult.slice(0, 5)) {
              const [price, volume, time, side] = trade;
              await this.dataIngestion.storeTick('kraken', pair, {
                price: price.toString(),
                quantity: volume.toString(),
                side: side === 'b' ? 'buy' : 'sell',
                exchange_ts: Math.floor(time * 1000),
                ingest_ts: now,
                seq_id: `${pair}_${this.tickSequence++}`,
              });
            }
          }
        }
      }
    } catch (error) {
      // Silent fail - individual pair errors shouldn't stop other pairs
    }
  }

  public close() {
    this.stopFallbackRestPolling();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.krakenWS) {
      this.krakenWS.close();
    }
    this.wss.close();
  }
}
