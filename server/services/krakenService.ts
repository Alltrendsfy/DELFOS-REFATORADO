import crypto from "crypto";
import { storage } from "../storage";

// Kraken REST API base URL
const KRAKEN_API_URL = "https://api.kraken.com";

// Kraken WebSocket URL
export const KRAKEN_WS_URL = "wss://ws.kraken.com";

interface KrakenTickerData {
  symbol: string;
  price: string;
  volume24h: string;
  change24h: string;
  high24h: string;
  low24h: string;
}

// Generate Kraken API signature
function getKrakenSignature(path: string, data: Record<string, any>, secret: string): string {
  const message = data.nonce + new URLSearchParams(data).toString();
  const hashDigest = crypto.createHash('sha256').update(message).digest();
  const hmacDigest = crypto.createHmac('sha512', Buffer.from(secret, 'base64'))
    .update(path + hashDigest.toString('binary'), 'binary')
    .digest('base64');
  return hmacDigest;
}

// Fetch ticker data from Kraken REST API
export async function fetchKrakenTicker(pairs: string[]): Promise<KrakenTickerData[]> {
  try {
    const pairParam = pairs.join(',');
    const response = await fetch(`${KRAKEN_API_URL}/0/public/Ticker?pair=${pairParam}`);
    const data = await response.json();

    if (data.error && data.error.length > 0) {
      console.error("Kraken API error:", data.error);
      return [];
    }

    const tickers: KrakenTickerData[] = [];
    for (const [symbol, tickerData] of Object.entries(data.result)) {
      const ticker = tickerData as any;
      tickers.push({
        symbol: symbol,
        price: ticker.c[0], // Current price
        volume24h: ticker.v[1], // 24h volume
        change24h: ticker.p[1], // 24h percentage change
        high24h: ticker.h[1], // 24h high
        low24h: ticker.l[1], // 24h low
      });
    }

    return tickers;
  } catch (error) {
    console.error("Error fetching Kraken ticker:", error);
    return [];
  }
}

// Fetch OHLC (candlestick) data from Kraken
export async function fetchKrakenOHLC(pair: string, interval: number = 60): Promise<any[]> {
  try {
    const response = await fetch(
      `${KRAKEN_API_URL}/0/public/OHLC?pair=${pair}&interval=${interval}`
    );
    const data = await response.json();

    if (data.error && data.error.length > 0) {
      console.error("Kraken OHLC API error:", data.error);
      return [];
    }

    const pairKey = Object.keys(data.result)[0];
    return data.result[pairKey] || [];
  } catch (error) {
    console.error("Error fetching Kraken OHLC:", error);
    return [];
  }
}

// Fetch order book (depth) data
export async function fetchKrakenOrderBook(pair: string, count: number = 10): Promise<any> {
  try {
    const response = await fetch(
      `${KRAKEN_API_URL}/0/public/Depth?pair=${pair}&count=${count}`
    );
    const data = await response.json();

    if (data.error && data.error.length > 0) {
      console.error("Kraken Depth API error:", data.error);
      return null;
    }

    const pairKey = Object.keys(data.result)[0];
    return data.result[pairKey];
  } catch (error) {
    console.error("Error fetching Kraken order book:", error);
    return null;
  }
}

// Update market data cache in database
export async function updateMarketDataCache(tickers: KrakenTickerData[]): Promise<void> {
  for (const ticker of tickers) {
    try {
      await storage.upsertMarketData({
        symbol: ticker.symbol,
        current_price: ticker.price,
        volume_24h: ticker.volume24h,
        change_24h_percentage: ticker.change24h,
        high_24h: ticker.high24h,
        low_24h: ticker.low24h,
      });
    } catch (error) {
      console.error(`Error updating market data for ${ticker.symbol}:`, error);
    }
  }
}

// Get all Kraken symbol pairs from database for WebSocket subscription
export async function getKrakenPairsForWebSocket(): Promise<string[]> {
  try {
    const exchanges = await storage.getAllExchanges();
    const krakenExchange = exchanges.find(e => e.name.toLowerCase() === 'kraken');
    
    if (!krakenExchange) {
      console.warn('[WARNING] Kraken exchange not found in database');
      return [];
    }
    
    const dbSymbols = await storage.getAllSymbols();
    const krakenSymbols = dbSymbols.filter(s => s.exchange_id === krakenExchange.id);
    
    return krakenSymbols.map(s => s.symbol);
  } catch (error) {
    console.error('Error loading Kraken pairs:', error);
    return [];
  }
}

// Default pairs for REST API (kept for backward compatibility)
export const TRACKED_PAIRS_REST = [
  'XBTUSD',    // BTC/USD
  'ETHUSD',    // ETH/USD
  'SOLUSD',    // SOL/USD
  'ADAUSD',    // ADA/USD
];

// Start periodic market data updates with error handling and backoff
export function startMarketDataUpdates(intervalMs: number = 30000): NodeJS.Timeout {
  let failureCount = 0;
  const maxFailures = 5;
  
  const updateData = async () => {
    try {
      console.log("Fetching market data from Kraken...");
      const tickers = await fetchKrakenTicker(TRACKED_PAIRS_REST);
      
      if (tickers.length > 0) {
        await updateMarketDataCache(tickers);
        console.log(`[INFO] Updated ${tickers.length} market data entries`);
        failureCount = 0; // Reset on success
      } else {
        failureCount++;
        console.warn(`[WARNING] No market data received (failure ${failureCount}/${maxFailures})`);
      }
    } catch (error) {
      failureCount++;
      console.error(`[ERROR] Error updating market data (failure ${failureCount}/${maxFailures}):`, error);
      
      if (failureCount >= maxFailures) {
        console.error(`[ERROR] Market data updates failed ${maxFailures} times consecutively. Check Kraken API connectivity.`);
        // Optionally notify administrators here
      }
    }
  };

  // Initial fetch
  updateData();

  // Periodic updates
  return setInterval(updateData, intervalMs);
}
