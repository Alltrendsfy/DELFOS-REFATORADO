import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { dataIngestionService } from "../../services/dataIngestionService";
import { indicatorService } from "../../services/market/indicatorService";
import { isAuthenticated } from "../../replitAuth";
import { TwitterService } from "../../services/twitterService";
import type { Symbol } from "@shared/schema";

// Maximum allowed limit for query results
const MAX_QUERY_LIMIT = 10000;

// Market metrics schemas
const marketMetricsSchema = z.object({
    symbols: z.array(
        z.string()
            .min(1, "Symbol cannot be empty")
            .transform((s: string) => s.trim().toUpperCase())
            .refine((s: string) => /^([A-Z]+:)?[A-Z0-9\/\-_]+$/.test(s), "Invalid symbol format")
    )
        .min(1, "At least one symbol required")
        .max(MAX_QUERY_LIMIT, `Maximum ${MAX_QUERY_LIMIT} symbols allowed`)
        .transform((symbols: string[]) => Array.from(new Set(symbols))) // Deduplicate
});

const marketMetricItemSchema = z.object({
    symbol: z.string(),
    price: z.number().nullable(),
    ema12: z.number().nullable(),
    ema36: z.number().nullable(),
    atr: z.number().nullable(),
    updatedAt: z.string(),
});

export type MarketMetricItem = z.infer<typeof marketMetricItemSchema>;

// Symbol cache for fast lookups
let symbolsCache: Map<string, Symbol> | null = null;

// Add slash to exchange symbol format (e.g., "XBTUSD" -> "XBT/USD")
function addSlashToExchangeSymbol(exchangeSymbol: string): string | null {
    if (exchangeSymbol.includes('/')) {
        return exchangeSymbol;
    }

    const quoteCurrencies = ['USD', 'EUR', 'USDT', 'BTC', 'ETH', 'USDC', 'GBP', 'JPY'];

    for (const quote of quoteCurrencies) {
        if (exchangeSymbol.endsWith(quote)) {
            const base = exchangeSymbol.slice(0, -quote.length);
            if (base.length > 0) {
                return `${base}/${quote}`;
            }
        }
    }

    console.warn(`[Market Metrics] Could not parse exchange symbol: ${exchangeSymbol}`);
    return null;
}

async function getSymbolsCache(): Promise<Map<string, Symbol>> {
    if (!symbolsCache) {
        const symbols = await storage.getAllSymbols();
        symbolsCache = new Map();

        for (const s of symbols) {
            symbolsCache.set(s.symbol, s);

            if (s.exchange_symbol) {
                const withSlash = addSlashToExchangeSymbol(s.exchange_symbol);
                if (withSlash && withSlash !== s.symbol) {
                    symbolsCache.set(withSlash, s);
                }
            }
        }

        console.log(`[Market Metrics] Loaded ${symbols.length} symbols, ${symbolsCache.size} cache entries`);
    }
    return symbolsCache;
}

async function fetchMarketMetrics(symbolStrings: string[]): Promise<{ metrics: MarketMetricItem[]; unknownSymbols: string[] }> {
    const cache = await getSymbolsCache();
    console.log(`[Market Metrics] Processing ${symbolStrings.length} symbols, cache has ${cache.size} entries`);

    const symbolMap = new Map<string, { normalized: string; symbolObj: Symbol | null }>();

    for (const originalSymbol of symbolStrings) {
        const symbolObj = cache.get(originalSymbol);
        console.log(`[Market Metrics] Lookup: "${originalSymbol}" -> ${symbolObj ? 'FOUND' : 'NOT FOUND'}`);

        if (symbolObj && typeof symbolObj.exchange_id !== 'string') {
            console.error(`[Market Metrics] Invalid exchange_id type for ${originalSymbol}: ${typeof symbolObj.exchange_id}`);
        }

        symbolMap.set(originalSymbol, { normalized: originalSymbol, symbolObj: symbolObj || null });
    }

    const unknownSymbols: string[] = [];
    const validEntries: Array<{ original: string; symbolObj: Symbol }> = [];

    for (const [originalSymbol, { symbolObj }] of Array.from(symbolMap.entries())) {
        if (!symbolObj) {
            unknownSymbols.push(originalSymbol);
        } else {
            validEntries.push({ original: originalSymbol, symbolObj });
        }
    }

    if (unknownSymbols.length > 0) {
        symbolsCache = null;
        const refreshedCache = await getSymbolsCache();

        const stillUnknown: string[] = [];
        for (const originalSymbol of unknownSymbols) {
            const symbolObj = refreshedCache.get(originalSymbol);

            if (!symbolObj) {
                stillUnknown.push(originalSymbol);
            } else {
                symbolMap.set(originalSymbol, { normalized: originalSymbol, symbolObj });
                validEntries.push({ original: originalSymbol, symbolObj });
            }
        }

        unknownSymbols.length = 0;
        unknownSymbols.push(...stillUnknown);

        if (unknownSymbols.length > 0) {
            console.warn(`[Market Metrics] Unknown symbols: ${unknownSymbols.join(', ')}`);
        }
    }

    const metricsPromises = validEntries.map(async ({ original, symbolObj }) => {
        try {
            const [recentTicks, indicators] = await Promise.all([
                dataIngestionService.getRecentTicks(symbolObj.exchange_id, symbolObj.exchange_symbol, 1),
                indicatorService.calculateIndicators(symbolObj)
            ]);

            let price: number | null = null;

            if (recentTicks && recentTicks.length > 0) {
                price = typeof recentTicks[0].price === 'string'
                    ? parseFloat(recentTicks[0].price)
                    : recentTicks[0].price;
            } else {
                const now = new Date();
                const startTime = new Date(now.getTime() - 60000);
                const bars = await storage.getBars1m(symbolObj.exchange_id, symbolObj.exchange_symbol, startTime, now, 1);
                if (bars && bars.length > 0) {
                    price = parseFloat(bars[0].close);
                } else {
                    console.warn(`[Market Metrics] No tick or bar data for ${symbolObj.symbol}`);
                }
            }

            return {
                symbol: original,
                price,
                ema12: indicators.ema12,
                ema36: indicators.ema36,
                atr: indicators.atr14,
                updatedAt: new Date().toISOString(),
            };
        } catch (error) {
            console.error(`[Market Metrics] Error fetching data for ${symbolObj.symbol}:`, error);
            return {
                symbol: original,
                price: null,
                ema12: null,
                ema36: null,
                atr: null,
                updatedAt: new Date().toISOString(),
            };
        }
    });

    const metrics = await Promise.all(metricsPromises);

    return { metrics, unknownSymbols };
}

function validateQueryLimit(limit: unknown): number | undefined {
    if (!limit) return undefined;

    const num = Number(limit);
    if (!Number.isInteger(num) || !Number.isSafeInteger(num) || num <= 0 || num > MAX_QUERY_LIMIT) {
        throw new Error(`Invalid limit parameter (must be a positive integer <= ${MAX_QUERY_LIMIT})`);
    }

    return num;
}

export function registerMarketRoutes(app: Router) {
    app.get('/api/orderbook/l2/*', async (req: Request, res: Response) => {
        try {
            const params = req.params as { '0': string };
            console.log('[L2 Endpoint] Request received:', params[0]);
            const pathParts = params[0].split('/');
            if (pathParts.length !== 2) {
                console.log('[L2 Endpoint] Invalid format:', pathParts);
                return res.status(400).json({
                    message: "Invalid symbol format. Use: /api/orderbook/l2/BASE/QUOTE (e.g., /api/orderbook/l2/ETH/USD)"
                });
            }

            const [base, quote] = pathParts;
            const userSymbol = `${base}/${quote}`;
            const krakenSymbol = userSymbol.replace('BTC/', 'XBT/');
            console.log(`[L2 Endpoint] Querying Redis: user="${userSymbol}", kraken="${krakenSymbol}"`);

            const orderBook = await dataIngestionService.getL2OrderBook('kraken', krakenSymbol);

            console.log(`[L2 Endpoint] Redis result: ${orderBook.bids.length} bids, ${orderBook.asks.length} asks`);

            if (!orderBook.bids.length && !orderBook.asks.length) {
                console.log(`[L2 Endpoint] 404: No data for ${krakenSymbol}`);
                return res.status(404).json({
                    message: "No order book data available",
                    symbol: userSymbol,
                    krakenSymbol,
                    hint: "Data may not be available yet or symbol might be unsupported"
                });
            }

            console.log(`[L2 Endpoint] 200: Returning ${orderBook.bids.length} bids, ${orderBook.asks.length} asks`);
            res.json({
                symbol: userSymbol,
                krakenSymbol,
                exchange: 'kraken',
                depth: 10,
                bids: orderBook.bids,
                asks: orderBook.asks,
                timestamp: Date.now(),
                source: 'redis'
            });
        } catch (error) {
            console.error("[L2 Endpoint] Error:", error);
            res.status(500).json({ message: "Failed to fetch L2 order book", error: String(error) });
        }
    });

    // Market metrics endpoint
    app.post('/api/market/metrics', async (req: Request, res: Response) => {
        try {
            const parseResult = marketMetricsSchema.safeParse(req.body);
            if (!parseResult.success) {
                return res.status(400).json({
                    message: "Invalid request body",
                    errors: parseResult.error.flatten().fieldErrors
                });
            }

            const { symbols } = parseResult.data;
            const result = await fetchMarketMetrics(symbols);
            res.json(result);
        } catch (error) {
            console.error("Error fetching market metrics:", error);
            res.status(500).json({ message: "Failed to fetch market metrics" });
        }
    });

    // News feed routes
    const twitterService = new TwitterService(storage);

    app.get('/api/news', isAuthenticated, async (req: any, res: Response) => {
        try {
            const limit = req.query.limit ? validateQueryLimit(req.query.limit) : 50;
            const news = await storage.getNewsFeed(limit);
            res.json(news);
        } catch (error: any) {
            if (error.message?.includes('Invalid limit')) {
                return res.status(400).json({ message: error.message });
            }
            console.error("Error fetching news:", error);
            res.status(500).json({ message: "Failed to fetch news" });
        }
    });

    app.post('/api/news/refresh', isAuthenticated, async (req: any, res: Response) => {
        try {
            await twitterService.fetchCryptoNews();
            const news = await storage.getNewsFeed(50);
            res.json({ message: "News feed refreshed successfully", count: news.length, news });
        } catch (error: any) {
            console.error("Error refreshing news feed:", error);
            res.status(500).json({ message: error.message || "Failed to refresh news feed" });
        }
    });
}
