import { Router, Request, Response } from "express";
import { isAuthenticated } from "../../replitAuth";
import { db } from "../../db";
import { storage } from "../../storage";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import {
    insertOrderSchema,
    insertDecisionLogSchema,
    insertClusterSchema,
    insertPortfolioSchema,
    insertAlertSchema,
    insertRiskParametersSchema,
    insertCampaignSchema,
    checkExceedsStandardLimits,
    symbol_rankings,
    symbols,
    portfolios,
    campaigns,
    campaign_risk_states,
    campaign_asset_universes,
    campaign_daily_reports,
    campaign_positions,
    campaign_orders,
    robot_activity_logs,
    clusters,
    insertTaxProfileSchema,
} from "@shared/schema";
import { indicatorService, clusterService } from "../../services/market";
import { assetSelectorService } from "../../services/assetSelectorService";
import { stalenessGuardService } from "../../services/stalenessGuardService";
import { dataIngestionService } from "../../services/dataIngestionService";
import { getCircuitBreakerService } from "../../services/circuitBreakerService";
import { RiskService } from "../../services/riskService";
import { OrderExecutionService } from "../../services/orderExecutionService";
import { rebalanceService } from "../../services/rebalance/rebalanceService";
import { feesService } from "../../services/fees/feesService";
import { TaxService, TAX_REGIMES } from "../../services/tax/taxService";
import { campaignManagerService } from "../../services/trading/campaignManagerService";
import { franchisePlanService } from "../../services/franchisePlanService";
import { adminMonitorService } from "../../services/adminMonitorService";
import { campaignGovernanceService } from "../../services/governance/campaignGovernanceService";
import { exchangeReconciliationService } from "../../services/governance/exchangeReconciliationService";

const circuitBreakerService = getCircuitBreakerService(storage);
const riskService = new RiskService(storage);
const orderExecutionService = new OrderExecutionService(storage);
const taxService = new TaxService(storage);

// Custom Zod schemas
const openPositionSchema = z.object({
    portfolioId: z.string().uuid("Invalid portfolio ID"),
    symbol: z.string().min(1, "Symbol is required"),
    side: z.enum(["long", "short"], { errorMap: () => ({ message: "Side must be long or short" }) }),
    quantity: z.string().refine((val: string) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Quantity must be positive"),
    stopLoss: z.string().optional(),
    takeProfit: z.string().optional(),
});



const updateOrderStatusSchema = z.object({
    status: z.string().min(1, "Status is required"),
    filled_quantity: z.string().optional(),
    average_fill_price: z.string().optional(),
});

const updateCampaignEquitySchema = z.object({
    current_equity: z.string().refine((val: string) => !isNaN(parseFloat(val)), "Invalid equity value"),
});

const updateClusterPnLSchema = z.object({
    daily_pnl: z.string().refine((val: string) => !isNaN(parseFloat(val)), "Invalid PnL value"),
});

const executeOrderSchema = z.object({
    portfolioId: z.string().uuid("Invalid portfolio ID"),
    symbol: z.string().min(1, "Symbol is required"),
    side: z.enum(["buy", "sell"], { errorMap: () => ({ message: "Side must be buy or sell" }) }),
    type: z.enum(["market", "limit", "stop_loss", "take_profit"], { errorMap: () => ({ message: "Invalid order type" }) }),
    quantity: z.string().refine((val: string) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Quantity must be positive"),
    price: z.string().optional(),
    stopPrice: z.string().optional(),
});

const resetAssetBreakerSchema = z.object({
    portfolioId: z.string().uuid("Invalid portfolio ID"),
    symbol: z.string().min(1, "Symbol is required"),
});

const resetClusterBreakerSchema = z.object({
    portfolioId: z.string().uuid("Invalid portfolio ID"),
    clusterNumber: z.number().int().nonnegative("Cluster number must be non-negative"),
});

const executeRebalanceSchema = z.object({
    dryRun: z.coerce.boolean().optional().default(false),
});

const updateAssetFiltersSchema = z.object({
    min_volume_24h_usd: z.string().optional(),
    max_spread_mid_pct: z.string().optional(),
    min_depth_top10_usd: z.string().optional(),
    min_atr_daily_pct: z.string().optional(),
    max_atr_daily_pct: z.string().optional(),
    target_assets_count: z.number().int().positive().optional(),
    num_clusters: z.number().int().positive().min(2).max(10).optional(),
});

const marketDataItemSchema = z.object({
    symbol: z.string().min(1, "Symbol is required"),
    price: z.number().positive("Price must be positive"),
});

const orderEntrySchema = z.object({
    portfolioId: z.string().uuid(),
    symbol: z.string().min(1),
    side: z.enum(['buy', 'sell']),
    qty: z.string().min(1),
    entry_type: z.enum(['market', 'limit']).default('market'),
    price: z.string().optional(),
    sl_atr: z.number().positive().default(1.0),
    tp1_atr: z.number().positive().default(1.2),
    tp2_atr: z.number().positive().default(2.5),
});

const MAX_QUERY_LIMIT = 1000;

// Helper function to validate query limit parameters
function validateQueryLimit(limit: unknown): number | undefined {
    if (!limit) return undefined;

    const num = Number(limit);
    if (!Number.isInteger(num) || !Number.isSafeInteger(num) || num <= 0 || num > MAX_QUERY_LIMIT) {
        throw new Error(`Invalid limit parameter (must be a positive integer ≤ ${MAX_QUERY_LIMIT})`);
    }

    return num;
}

export function registerTradingRoutes(router: Router) {
    // Operations status endpoint for Runbook Timeline
    router.get('/api/operations/status', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Get user's portfolios to count positions and calculate PnL
            const portfolios = await storage.getPortfoliosByUserId(userId);

            // Calculate active positions across all portfolios
            const positionsArrays = await Promise.all(
                portfolios.map(p => storage.getPositionsByPortfolioId(p.id))
            );
            const allPositions = positionsArrays.flat();
            const activePositions = allPositions.length;

            // Calculate daily PnL percentage
            const portfolioValue = portfolios.reduce((sum, p) =>
                sum + parseFloat(p.total_value_usd || '0'), 0
            );
            const dailyPnL = portfolios.reduce((sum, p) =>
                sum + parseFloat(p.daily_pnl_percentage || '0'), 0
            );

            // Get staleness status from guard service
            const stalenessLevel = stalenessGuardService.getGlobalStalenessLevel();
            const quarantineStatus = stalenessGuardService.getQuarantineStatus();

            // Get asset selection info from latest rankings
            const latestRankings = await db.select()
                .from(symbol_rankings)
                .orderBy(desc(symbol_rankings.created_at))
                .limit(100);
            const assetsSelected = latestRankings.length;

            // Determine current operational phase based on time of day
            const now = new Date();
            const hourOfDay = now.getHours();
            const minuteOfDay = now.getMinutes();

            let currentPhase: 'selection' | 'distribution' | 'trading' | 'rebalance' | 'audit';

            // Selection at 00:00
            if (hourOfDay === 0 && minuteOfDay < 5) {
                currentPhase = 'selection';
            }
            // Distribution at 00:05
            else if (hourOfDay === 0 && minuteOfDay >= 5 && minuteOfDay < 15) {
                currentPhase = 'distribution';
            }
            // Rebalance every 8 hours (00:00, 08:00, 16:00)
            else if ((hourOfDay % 8 === 0 && minuteOfDay < 30)) {
                currentPhase = 'rebalance';
            }
            // Audit at 24h mark (end of day)
            else if (hourOfDay === 23 && minuteOfDay >= 50) {
                currentPhase = 'audit';
            }
            // Default to trading during the day
            else {
                currentPhase = 'trading';
            }

            // Calculate next rebalance time (every 8 hours)
            const currentHour = now.getHours();
            const nextRebalanceHour = Math.ceil((currentHour + 1) / 8) * 8;
            const nextRebalanceTime = new Date(now);
            if (nextRebalanceHour >= 24) {
                nextRebalanceTime.setDate(nextRebalanceTime.getDate() + 1);
                nextRebalanceTime.setHours(0, 0, 0, 0);
            } else {
                nextRebalanceTime.setHours(nextRebalanceHour, 0, 0, 0);
            }

            // Get the latest audit log entries for timing info
            const auditLogs = await storage.getAuditTrailByUser(userId, 20);

            const lastSelectionLog = auditLogs.find(log => log.action_type === 'asset_selection');
            const lastRebalanceLog = auditLogs.find(log => log.action_type === 'rebalance' || log.action_type === 'campaign_rebalance');
            const lastAuditLog = auditLogs.find(log => log.action_type === 'daily_audit');

            res.json({
                currentPhase,
                lastSelectionTime: lastSelectionLog?.created_at?.toISOString() || null,
                lastDistributionTime: lastSelectionLog?.created_at?.toISOString() || null,
                lastRebalanceTime: lastRebalanceLog?.created_at?.toISOString() || null,
                lastAuditTime: lastAuditLog?.created_at?.toISOString() || null,
                nextRebalanceTime: nextRebalanceTime.toISOString(),
                tradingActive: stalenessLevel === 'fresh',
                stalenessLevel,
                assetsSelected,
                activePositions,
                dailyPnL: dailyPnL.toFixed(2),
                hitRate: '0.00',
                quarantinedSymbols: quarantineStatus.quarantinedCount,
            });
        } catch (error) {
            console.error("Error fetching operations status:", error);
            res.status(500).json({ message: "Failed to fetch operations status" });
        }
    });

    // Audit dashboard endpoint - 24h consolidated metrics
    router.get('/api/operations/audit', isAuthenticated, async (req: any, res: Response) => {
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);

        try {
            // Fetch all portfolio data concurrently
            const [tradesArrays, positionsArrays, snapshotsArrays] = await Promise.all([
                Promise.all(portfolios.map((p: any) => storage.getTradesByPortfolioId(p.id))),
                Promise.all(portfolios.map((p: any) => storage.getPositionsByPortfolioId(p.id))),
                Promise.all(portfolios.map((p: any) => storage.getSnapshotsByPortfolioId(p.id, 288))), // 5-min intervals for 24h
            ]);

            const allTrades = tradesArrays.flat();
            const allPositions = positionsArrays.flat();
            const allSnapshots = snapshotsArrays.flat();

            // Filter trades from last 24 hours
            const recentTrades = allTrades.filter((trade: any) => {
                const closedAt = trade.closed_at ? new Date(trade.closed_at) : null;
                return closedAt && closedAt >= yesterday;
            });

            // Calculate performance metrics
            const winningTrades = recentTrades.filter((t: any) => parseFloat(t.realized_pnl || '0') > 0);
            const losingTrades = recentTrades.filter((t: any) => parseFloat(t.realized_pnl || '0') < 0);
            const totalTrades = recentTrades.length;

            const hitRate = totalTrades > 0
                ? (winningTrades.length / totalTrades) * 100
                : 0;

            const totalWins = winningTrades.reduce((sum: number, t: any) => sum + parseFloat(t.realized_pnl || '0'), 0);
            const totalLosses = Math.abs(losingTrades.reduce((sum: number, t: any) => sum + parseFloat(t.realized_pnl || '0'), 0));

            const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
            const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
            const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
            const payoff = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 999 : 0);

            // Calculate total PnL
            const totalPnL = recentTrades.reduce((sum: number, t: any) => sum + parseFloat(t.realized_pnl || '0'), 0);
            const unrealizedPnL = allPositions.reduce((sum: number, p: any) => sum + parseFloat(p.unrealized_pnl || '0'), 0);

            // Calculate fees and slippage
            const totalFees = recentTrades.reduce((sum: number, t: any) => sum + parseFloat(t.fees || '0'), 0);
            const totalSlippage = recentTrades.reduce((sum: number, t: any) => sum + parseFloat((t as any).slippage_usd || '0'), 0);

            // Calculate VaR and Expected Shortfall (simplified 95% confidence)
            const pnlValues = recentTrades.map((t: any) => parseFloat(t.realized_pnl || '0')).sort((a: number, b: number) => a - b);
            const varIndex = Math.floor(pnlValues.length * 0.05);
            const var95 = pnlValues.length > 0 ? Math.abs(pnlValues[varIndex] || 0) : 0;
            const tailLosses = pnlValues.slice(0, varIndex + 1);
            const expectedShortfall = tailLosses.length > 0
                ? Math.abs(tailLosses.reduce((sum: number, v: number) => sum + v, 0) / tailLosses.length)
                : 0;

            // Calculate drawdown from snapshots
            let maxDrawdown = 0;
            let peakEquity = 0;

            const sortedSnapshots = [...allSnapshots].sort((a, b) =>
                new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime()
            );

            for (const snapshot of sortedSnapshots) {
                const equity = parseFloat(snapshot.equity_usd);
                if (equity > peakEquity) peakEquity = equity;
                const drawdown = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
                if (drawdown > maxDrawdown) maxDrawdown = drawdown;
            }

            // Portfolio value
            const portfolioValue = portfolios.reduce((sum: number, p: any) =>
                sum + parseFloat(p.total_value_usd || '0'), 0
            );

            res.json({
                period: '24h',
                timestamp: now.toISOString(),
                performance: {
                    hitRate: hitRate.toFixed(2),
                    avgWin: avgWin.toFixed(2),
                    avgLoss: avgLoss.toFixed(2),
                    profitFactor: profitFactor.toFixed(2),
                    payoff: payoff.toFixed(2),
                    totalTrades,
                    winningTrades: winningTrades.length,
                    losingTrades: losingTrades.length,
                },
                pnl: {
                    realized: totalPnL.toFixed(2),
                    unrealized: unrealizedPnL.toFixed(2),
                    total: (totalPnL + unrealizedPnL).toFixed(2),
                    percentage: portfolioValue > 0
                        ? ((totalPnL + unrealizedPnL) / portfolioValue * 100).toFixed(2)
                        : '0.00',
                },
                risk: {
                    var95: var95.toFixed(2),
                    expectedShortfall: expectedShortfall.toFixed(2),
                    maxDrawdown: maxDrawdown.toFixed(2),
                    currentEquity: portfolioValue.toFixed(2),
                },
                costs: {
                    totalFees: totalFees.toFixed(4),
                    totalSlippage: totalSlippage.toFixed(4),
                    totalCosts: (totalFees + totalSlippage).toFixed(4),
                    costPerTrade: totalTrades > 0
                        ? ((totalFees + totalSlippage) / totalTrades).toFixed(4)
                        : '0.0000',
                },
            });
        } catch (error) {
            console.error("Error fetching audit metrics:", error);
            res.status(500).json({ message: "Failed to fetch audit metrics" });
        }
    });

    // Portfolio routes
    router.get('/api/portfolios', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const portfoliosList = await storage.getPortfoliosByUserId(userId);
            res.json(portfoliosList);
        } catch (error) {
            console.error("Error fetching portfolios:", error);
            res.status(500).json({ message: "Failed to fetch portfolios" });
        }
    });

    // Risk profiles route - get all predefined risk profiles (C/M/A)
    router.get('/api/risk-profiles', isAuthenticated, async (req: any, res: Response) => {
        try {
            const profiles = await storage.getRiskProfiles();
            res.json(profiles);
        } catch (error) {
            console.error("Error fetching risk profiles:", error);
            res.status(500).json({ message: "Failed to fetch risk profiles" });
        }
    });

    // POST /api/portfolios
    router.post('/api/portfolios', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email || 'unknown';

            console.log(`[PORTFOLIO] 📝 Creating portfolio | User: ${userId} (${userEmail}) | Name: ${req.body.name} | Mode: ${req.body.trading_mode || 'paper'}`);

            const portfolioData = {
                user_id: userId,
                name: req.body.name,
                total_value_usd: req.body.total_value_usd || "0",
                daily_pnl: req.body.daily_pnl || "0",
                daily_pnl_percentage: req.body.daily_pnl_percentage || "0",
                trading_mode: req.body.trading_mode || "paper",
            };

            // Validate request body with Zod
            const validationResult = insertPortfolioSchema.safeParse(portfolioData);
            if (!validationResult.success) {
                console.log(`[PORTFOLIO] ❌ Validation failed | User: ${userId} | Errors: ${JSON.stringify(validationResult.error.errors)}`);
                return res.status(400).json({
                    message: "Invalid portfolio data",
                    errors: validationResult.error.errors
                });
            }

            const portfolio = await storage.createPortfolio(validationResult.data);
            console.log(`[PORTFOLIO] ✓ Created successfully | User: ${userId} | Portfolio ID: ${portfolio.id} | Name: ${portfolio.name}`);
            res.json(portfolio);
        } catch (error) {
            console.error(`[PORTFOLIO] ❌ Error creating portfolio | User: ${req.user?.claims?.sub} |`, error);
            res.status(500).json({ message: "Failed to create portfolio" });
        }
    });

    // Delete portfolio (only if no active campaigns)
    router.delete('/api/portfolios/:id', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const portfolioId = req.params.id;

            // Verify ownership
            const portfolio = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).limit(1);
            if (!portfolio.length) {
                return res.status(404).json({ message: "Portfolio not found" });
            }
            if (portfolio[0].user_id !== userId) {
                return res.status(403).json({ message: "Not authorized to delete this portfolio" });
            }

            // Check for active campaigns
            const activeCampaigns = await db.select()
                .from(campaigns)
                .where(and(
                    eq(campaigns.portfolio_id, portfolioId),
                    eq(campaigns.status, 'active')
                ))
                .limit(1);

            if (activeCampaigns.length > 0) {
                return res.status(400).json({
                    message: "Cannot delete portfolio with active campaigns. Stop the campaigns first."
                });
            }

            // Soft-delete all non-active campaigns (ANTIFRAUDE: campaigns cannot be hard deleted)
            const portfolioCampaigns = await db.select({ id: campaigns.id })
                .from(campaigns)
                .where(and(
                    eq(campaigns.portfolio_id, portfolioId),
                    eq(campaigns.is_deleted, false)
                ));

            for (const campaign of portfolioCampaigns) {
                // Soft-delete: mark as deleted instead of removing data
                await db.update(campaigns)
                    .set({
                        is_deleted: true,
                        deleted_at: new Date(),
                        deleted_reason: 'Portfolio deletion requested by user'
                    })
                    .where(eq(campaigns.id, campaign.id));
            }

            // Delete portfolio (cascades to positions, trades, risk_parameters via onDelete: 'cascade')
            await db.delete(portfolios).where(eq(portfolios.id, portfolioId));

            res.json({ success: true, message: "Portfolio deleted successfully" });
        } catch (error) {
            console.error("Error deleting portfolio:", error);
            res.status(500).json({ message: "Failed to delete portfolio" });
        }
    });

    // Position routes
    router.get('/api/portfolios/:portfolioId/positions', isAuthenticated, async (req: any, res: Response) => {
        try {
            const positions = await storage.getPositionsByPortfolioId(req.params.portfolioId);
            res.json(positions);
        } catch (error) {
            console.error("Error fetching positions:", error);
            res.status(500).json({ message: "Failed to fetch positions" });
        }
    });

    // Trade routes
    router.get('/api/portfolios/:portfolioId/trades', isAuthenticated, async (req: any, res: Response) => {
        try {
            const trades = await storage.getTradesByPortfolioId(req.params.portfolioId);
            res.json(trades);
        } catch (error) {
            console.error("Error fetching trades:", error);
            res.status(500).json({ message: "Failed to fetch trades" });
        }
    });

    // Alert routes
    router.get('/api/alerts', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const alerts = await storage.getAlertsByUserId(userId);
            res.json(alerts);
        } catch (error) {
            console.error("Error fetching alerts:", error);
            res.status(500).json({ message: "Failed to fetch alerts" });
        }
    });

    router.post('/api/alerts', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            const alertData = {
                user_id: userId,
                symbol: req.body.symbol,
                condition: req.body.condition,
                target_price: req.body.target_price,
            };

            // Validate request body with Zod
            const validationResult = insertAlertSchema.safeParse(alertData);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid alert data",
                    errors: validationResult.error.errors
                });
            }

            const alert = await storage.createAlert(validationResult.data);
            res.json(alert);
        } catch (error) {
            console.error("Error creating alert:", error);
            res.status(500).json({ message: "Failed to create alert" });
        }
    });

    // Market data routes (public)
    router.get('/api/market-data', async (req: any, res: any) => {
        try {
            const marketData = await storage.getAllMarketData();
            res.json(marketData);
        } catch (error) {
            console.error("Error fetching market data:", error);
            res.status(500).json({ message: "Failed to fetch market data" });
        }
    });

    router.get('/api/market-data/:symbol', async (req: any, res: any) => {
        try {
            const data = await storage.getMarketDataBySymbol(req.params.symbol);
            if (!data) {
                return res.status(404).json({ message: "Market data not found" });
            }
            res.json(data);
        } catch (error) {
            console.error("Error fetching market data:", error);
            res.status(500).json({ message: "Failed to fetch market data" });
        }
    });

    // PUBLIC ENDPOINT: Get all symbols (no authentication required)
    router.get('/api/symbols', async (req: any, res: any) => {
        try {
            const allSymbols = await storage.getAllSymbols();
            res.json({
                count: allSymbols.length,
                symbols: allSymbols.map(s => ({
                    id: s.id,
                    symbol: s.symbol,
                    exchange_symbol: s.exchange_symbol,
                    is_active: s.is_active,
                }))
            });
        } catch (error: any) {
            console.error("Error fetching symbols:", error);
            res.status(500).json({ message: "Failed to fetch symbols" });
        }
    });

    // PUBLIC ENDPOINT: Get VRE status (no authentication required)
    router.get('/api/vres', async (req: any, res: any) => {
        try {
            const vreData = await db.select().from(sql`vre_states`).limit(20);
            res.json({
                count: vreData.length,
                regimes: vreData.map((item: any) => ({
                    symbol: item.symbol,
                    regime: item.regime,
                    confidence: item.confidence,
                    updated_at: item.updated_at
                }))
            });
        } catch (error: any) {
            console.error("Error fetching VRE data:", error);
            // Fallback if table doesn't exist
            res.json({
                count: 0,
                regimes: [],
                message: "VRE data not yet initialized"
            });
        }
    });

    // Bars 1s endpoint (Redis-based high-frequency bars)
    router.get('/api/bars/1s/:symbol', async (req: any, res: any) => {
        try {
            const { symbol } = req.params;
            const { limit, start, end } = req.query;

            if (!symbol || typeof symbol !== 'string') {
                return res.status(400).json({ message: "Invalid symbol parameter" });
            }

            const { redisBarService } = await import('../../services/redisBarService');

            let bars;
            if (start && end) {
                const startTs = parseInt(start as string, 10);
                const endTs = parseInt(end as string, 10);

                if (isNaN(startTs) || isNaN(endTs)) {
                    return res.status(400).json({ message: "Invalid start/end timestamp" });
                }

                bars = await redisBarService.getBars1sInRange(
                    'kraken',
                    symbol,
                    startTs,
                    endTs
                );
            } else {
                const limitNum = limit ? parseInt(limit as string, 10) : 3600;

                if (isNaN(limitNum) || limitNum < 1) {
                    return res.status(400).json({ message: "Invalid limit parameter" });
                }

                bars = await redisBarService.getBars1s(
                    'kraken',
                    symbol,
                    limitNum
                );
            }

            res.json({
                symbol,
                exchange: 'kraken',
                interval: '1s',
                bars,
                count: bars.length
            });
        } catch (error) {
            console.error("Error fetching 1s bars:", error);
            res.status(500).json({ message: "Failed to fetch 1s bars" });
        }
    });

    // Bars 5s endpoint (Redis-based medium-frequency bars)
    router.get('/api/bars/5s/:symbol', async (req: any, res: any) => {
        try {
            const { symbol } = req.params;
            const { limit, start, end } = req.query;

            if (!symbol || typeof symbol !== 'string') {
                return res.status(400).json({ message: "Invalid symbol parameter" });
            }

            const { redisBarService } = await import('../../services/redisBarService');

            let bars;
            if (start && end) {
                const startTs = parseInt(start as string, 10);
                const endTs = parseInt(end as string, 10);

                if (isNaN(startTs) || isNaN(endTs)) {
                    return res.status(400).json({ message: "Invalid start/end timestamp" });
                }

                bars = await redisBarService.getBars5sInRange(
                    'kraken',
                    symbol,
                    startTs,
                    endTs
                );
            } else {
                const limitNum = limit ? parseInt(limit as string, 10) : 720;

                if (isNaN(limitNum) || limitNum < 1) {
                    return res.status(400).json({ message: "Invalid limit parameter" });
                }

                bars = await redisBarService.getBars5s(
                    'kraken',
                    symbol,
                    limitNum
                );
            }

            res.json({
                symbol,
                exchange: 'kraken',
                interval: '5s',
                bars,
                count: bars.length
            });
        } catch (error) {
            console.error("Error fetching 5s bars:", error);
            res.status(500).json({ message: "Failed to fetch 5s bars" });
        }
    });

    // Real-time market data endpoints

    // Recent ticks endpoint
    router.get('/api/market/ticks/:symbol', async (req: any, res: any) => {
        try {
            const { symbol } = req.params;
            const { limit } = req.query;

            if (!symbol || typeof symbol !== 'string') {
                return res.status(400).json({ message: "Invalid symbol parameter" });
            }

            const limitNum = limit ? parseInt(limit as string, 10) : 100;
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
                return res.status(400).json({ message: "Invalid limit (1-1000)" });
            }

            const ticks = await dataIngestionService.getRecentTicks('kraken', symbol, limitNum);

            res.json({
                symbol,
                exchange: 'kraken',
                ticks,
                count: ticks.length
            });
        } catch (error) {
            console.error("Error fetching ticks:", error);
            res.status(500).json({ message: "Failed to fetch ticks" });
        }
    });

    // L1 quotes endpoint (best bid/ask)
    router.get('/api/market/l1/:symbol', async (req: any, res: any) => {
        try {
            const { symbol } = req.params;

            if (!symbol || typeof symbol !== 'string') {
                return res.status(400).json({ message: "Invalid symbol parameter" });
            }

            const l1Quote = await dataIngestionService.getL1Quote('kraken', symbol);

            if (!l1Quote) {
                return res.status(404).json({ message: "L1 quote not found" });
            }

            res.json({
                symbol,
                exchange: 'kraken',
                ...l1Quote
            });
        } catch (error) {
            console.error("Error fetching L1 quote:", error);
            res.status(500).json({ message: "Failed to fetch L1 quote" });
        }
    });

    // L2 order book endpoint
    router.get('/api/market/l2/:symbol', async (req: any, res: any) => {
        try {
            const { symbol } = req.params;

            if (!symbol || typeof symbol !== 'string') {
                return res.status(400).json({ message: "Invalid symbol parameter" });
            }

            const orderBook = await dataIngestionService.getL2OrderBook('kraken', symbol);

            res.json({
                symbol,
                exchange: 'kraken',
                bids: orderBook.bids,
                asks: orderBook.asks,
                bids_count: orderBook.bids.length,
                asks_count: orderBook.asks.length
            });
        } catch (error) {
            console.error("Error fetching L2 order book:", error);
            res.status(500).json({ message: "Failed to fetch L2 order book" });
        }
    });

    // Asset selection endpoints

    // Get selected assets with clusters
    router.get('/api/asset-selection/selected', isAuthenticated, async (req: any, res: any) => {
        try {
            const userId = req.user.claims.sub;

            // Get user's filter preferences
            const filters = await assetSelectorService.getUserFilters(userId);

            // First, get the most recent run_id
            const latestRun = await db.select({
                run_id: symbol_rankings.run_id,
            })
                .from(symbol_rankings)
                .orderBy(desc(symbol_rankings.created_at))
                .limit(1)
                .execute();

            if (latestRun.length === 0) {
                return res.json({ assets: [], filters: filters || null, count: 0 });
            }

            const latestRunId = latestRun[0].run_id;

            // Get all rankings from the latest run with symbol names
            const rankings = await db.select({
                id: symbol_rankings.id,
                run_id: symbol_rankings.run_id,
                symbol_id: symbol_rankings.symbol_id,
                rank: symbol_rankings.rank,
                score: symbol_rankings.score,
                cluster_number: symbol_rankings.cluster_number,
                created_at: symbol_rankings.created_at,
                symbol: symbols.symbol,
                exchange_symbol: symbols.exchange_symbol,
            })
                .from(symbol_rankings)
                .leftJoin(symbols, eq(symbol_rankings.symbol_id, symbols.id))
                .where(eq(symbol_rankings.run_id, latestRunId))
                .orderBy(symbol_rankings.rank)
                .limit(filters?.target_assets_count || 100)
                .execute();

            res.json({
                assets: rankings,
                filters: filters || null,
                count: rankings.length
            });
        } catch (error) {
            console.error("Error fetching selected assets:", error);
            res.status(500).json({ message: "Failed to fetch selected assets" });
        }
    });

    // Get user filter preferences
    router.get('/api/asset-selection/filters', isAuthenticated, async (req: any, res: any) => {
        try {
            const userId = req.user.claims.sub;
            const filters = await assetSelectorService.getUserFilters(userId);

            if (!filters) {
                // Return default filters
                return res.json({
                    min_volume_usd: 5000000,
                    max_spread_pct: 0.10,
                    min_depth_usd: 100000,
                    min_atr_pct: 0.01,
                    max_assets: 30,
                    num_clusters: 5
                });
            }

            res.json(filters);
        } catch (error) {
            console.error("Error fetching asset filters:", error);
            res.status(500).json({ message: "Failed to fetch asset filters" });
        }
    });

    // Update user filter preferences
    router.post('/api/asset-selection/filters', isAuthenticated, async (req: any, res: any) => {
        try {
            const userId = req.user.claims.sub;

            // Validate request body
            const validationResult = updateAssetFiltersSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid filter data",
                    errors: validationResult.error.errors
                });
            }

            await assetSelectorService.updateUserFilters(userId, validationResult.data);

            res.json({ message: "Filters updated successfully" });
        } catch (error) {
            console.error("Error updating asset filters:", error);
            res.status(500).json({ message: "Failed to update asset filters" });
        }
    });

    // Market brief endpoint for Dashboard
    router.get('/api/market/brief', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Get staleness status
            const stalenessLevel = stalenessGuardService.getGlobalStalenessLevel();
            const quarantineStatus = stalenessGuardService.getQuarantineStatus();
            const quarantinedCount = quarantineStatus.quarantinedCount;
            // const activeSymbolsCount = quarantineStatus.activeSymbols; // Not available

            // Get latest rankings for volatility calculation
            const latestRankings = await db.select()
                .from(symbol_rankings)
                .orderBy(desc(symbol_rankings.created_at))
                .limit(50);

            // Determine market status
            let marketStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
            let statusMessage = 'Market conditions are optimal';

            if (stalenessLevel === 'kill_switch' || stalenessLevel === 'hard') {
                marketStatus = 'critical';
                statusMessage = 'Market data is stale - Trading halted';
            } else if (stalenessLevel === 'warn') {
                marketStatus = 'warning';
                statusMessage = 'Some market data is slightly delayed - proceed with caution';
            } else if (quarantinedCount > 10) {
                marketStatus = 'warning';
                statusMessage = `${quarantinedCount} symbols are temporarily unavailable`;
            }

            // Calculate average volatility from recent rankings
            let avgVolatility = 2.5; // Default moderate volatility
            if (latestRankings.length > 0) {
                const volatilityScores = latestRankings
                    .filter((r: any) => r.score !== null)
                    .map((r: any) => parseFloat(r.score || '0'));
                if (volatilityScores.length > 0) {
                    avgVolatility = volatilityScores.reduce((a: number, b: number) => a + b, 0) / volatilityScores.length;
                }
            }

            // Determine volatility level
            let volatilityLevel: 'low' | 'moderate' | 'high' = 'moderate';
            if (avgVolatility < 1) volatilityLevel = 'low';
            else if (avgVolatility > 4) volatilityLevel = 'high';

            // Get recommended drawdown based on volatility
            let recommendedMaxDrawdown = 10;
            if (volatilityLevel === 'high') recommendedMaxDrawdown = 8;
            else if (volatilityLevel === 'low') recommendedMaxDrawdown = 12;

            res.json({
                timestamp: new Date().toISOString(),
                marketStatus,
                statusMessage,
                stalenessLevel,
                activeSymbols: 0, // activeSymbolsCount not available
                quarantinedSymbols: quarantinedCount,
                volatility: {
                    level: volatilityLevel,
                    avgScore: avgVolatility.toFixed(2),
                },
                tradingRecommendation: {
                    canStartCampaign: marketStatus !== 'critical',
                    recommendedMaxDrawdown,
                    warningMessages: marketStatus === 'warning' ? [statusMessage] : [],
                },
            });
        } catch (error) {
            console.error("Error fetching market brief:", error);
            res.status(500).json({ message: "Failed to fetch market brief" });
        }
    });

    // Risk current volatility endpoint for Campaign Wizard
    router.get('/api/risk/current-volatility', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Get user's portfolios to check circuit breaker status
            const portfolios = await storage.getPortfoliosByUserId(userId);

            // Check circuit breakers status
            let breakersActive = 0;
            let breakersTriggered: string[] = [];

            for (const portfolio of portfolios) {
                const riskParams = await storage.getRiskParametersByPortfolioId(portfolio.id);
                if (riskParams?.circuit_breaker_triggered) {
                    breakersActive++;
                    breakersTriggered.push(portfolio.name);
                }
            }

            // Get staleness status
            const stalenessLevel = stalenessGuardService.getGlobalStalenessLevel();

            // Calculate market risk level
            let riskLevel: 'low' | 'moderate' | 'high' | 'extreme' = 'moderate';
            let riskScore = 50; // 0-100 scale

            if (stalenessLevel === 'kill_switch' || stalenessLevel === 'hard') {
                riskLevel = 'extreme';
                riskScore = 95;
            } else if (breakersActive > 0) {
                riskLevel = 'high';
                riskScore = 75;
            } else if (stalenessLevel === 'warn') {
                riskLevel = 'moderate';
                riskScore = 55;
            } else {
                riskLevel = 'low';
                riskScore = 30;
            }

            // Risk-adjusted drawdown recommendations
            const recommendations = {
                conservative: { maxDrawdown: 5, description: 'Very protective - for beginners or uncertain markets' },
                moderate: { maxDrawdown: 10, description: 'Balanced approach - recommended for most traders' },
                aggressive: { maxDrawdown: 15, description: 'Higher risk tolerance - for experienced traders' },
            };

            // Adjust recommendations based on current risk
            if (riskLevel === 'high' || riskLevel === 'extreme') {
                recommendations.conservative.maxDrawdown = 3;
                recommendations.moderate.maxDrawdown = 7;
                recommendations.aggressive.maxDrawdown = 10;
            }

            res.json({
                timestamp: new Date().toISOString(),
                riskLevel,
                riskScore,
                circuitBreakers: {
                    active: breakersActive,
                    triggeredPortfolios: breakersTriggered,
                },
                stalenessLevel,
                recommendations,
                warning: riskLevel === 'extreme'
                    ? 'Market conditions are very unstable. Consider waiting before starting a new campaign.'
                    : null,
            });
        } catch (error) {
            console.error("Error fetching current volatility:", error);
            res.status(500).json({ message: "Failed to fetch volatility data" });
        }
    });

    // Recommended assets endpoint for Campaign Wizard
    router.get('/api/asset-selection/recommended', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Get latest rankings with cluster info
            const latestRankings = await db.select()
                .from(symbol_rankings)
                .orderBy(desc(symbol_rankings.created_at))
                .limit(50);

            if (latestRankings.length === 0) {
                return res.json({
                    hasSelection: false,
                    message: 'No asset selection has been run yet. The system will automatically select the best assets when you start a campaign.',
                    assets: [],
                    clusters: [],
                });
            }

            // Group by cluster
            const clusterMap = new Map<number, any[]>();
            for (const ranking of latestRankings) {
                const cluster = ranking.cluster_number || 0;
                if (!clusterMap.has(cluster)) {
                    clusterMap.set(cluster, []);
                }
                clusterMap.get(cluster)!.push(ranking);
            }

            // Get symbol details
            const symbolIds = latestRankings.map((r: any) => r.symbol_id);
            const symbolDetails = await db.select()
                .from(symbols)
                .where(sql`${symbols.id} IN (${sql.join(symbolIds.map((id: any) => sql`${id}`), sql`, `)})`);

            const symbolMap = new Map(symbolDetails.map((s: any) => [s.id, s]));

            // Build cluster summaries with simple explanations
            const clusterDescriptions = [
                'High volume, stable assets - great for consistent trading',
                'Growth potential assets - higher volatility but more opportunities',
                'Emerging assets - newer but showing promise',
                'Defensive assets - lower volatility for capital protection',
                'Speculative assets - high risk, high reward potential',
            ];

            const clusters = Array.from(clusterMap.entries()).map(([clusterNum, rankings], idx) => {
                const clusterAssets = rankings.map((r: any) => {
                    const sym = symbolMap.get(r.symbol_id);
                    return {
                        symbol: (sym as any)?.symbol || 'Unknown',
                        rank: r.rank,
                        score: parseFloat(r.score || '0').toFixed(2),
                    };
                }).sort((a: any, b: any) => a.rank - b.rank);

                return {
                    clusterNumber: clusterNum,
                    name: `Cluster ${clusterNum + 1}`,
                    description: clusterDescriptions[idx % clusterDescriptions.length],
                    assetCount: clusterAssets.length,
                    topAssets: clusterAssets.slice(0, 5),
                };
            });

            // Top assets overall
            const topAssets = latestRankings
                .slice(0, 10)
                .map((r: any) => {
                    const sym = symbolMap.get(r.symbol_id);
                    return {
                        symbol: (sym as any)?.symbol || 'Unknown',
                        exchangeSymbol: (sym as any)?.exchange_symbol || 'Unknown',
                        rank: r.rank,
                        score: parseFloat(r.score || '0').toFixed(2),
                        cluster: r.cluster_number,
                    };
                });

            res.json({
                hasSelection: true,
                lastUpdated: latestRankings[0]?.created_at || new Date().toISOString(),
                totalAssets: latestRankings.length,
                clusters,
                topAssets,
            });
        } catch (error) {
            console.error("Error fetching recommended assets:", error);
            res.status(500).json({ message: "Failed to fetch recommended assets" });
        }
    });

    // ========== TSDB / TIME-SERIES ROUTES ==========

    // Bars 1m - Get OHLCV candles (1 minute)
    router.get('/api/bars/1m/:exchange/:symbol', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { exchange, symbol } = req.params;
            const { startTime, endTime, limit } = req.query;

            if (!startTime || !endTime) {
                return res.status(400).json({
                    message: "Missing required query parameters: startTime, endTime"
                });
            }

            // Validate timestamps
            const start = new Date(startTime as string);
            const end = new Date(endTime as string);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return res.status(400).json({ message: "Invalid timestamp format" });
            }

            if (start >= end) {
                return res.status(400).json({ message: "startTime must be before endTime" });
            }

            // Validate limit using shared helper
            const parsedLimit = limit ? validateQueryLimit(limit) : undefined;

            const bars = await storage.getBars1m(exchange, symbol, start, end, parsedLimit);
            res.json(bars);
        } catch (error: any) {
            if (error.message?.includes('Invalid limit')) {
                return res.status(400).json({ message: error.message });
            }
            console.error("Error fetching 1m bars:", error);
            res.status(500).json({ message: "Failed to fetch 1m bars" });
        }
    });

    // Bars 1h - Get OHLCV candles (1 hour)
    router.get('/api/bars/1h/:exchange/:symbol', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { exchange, symbol } = req.params;
            const { startTime, endTime, limit } = req.query;

            if (!startTime || !endTime) {
                return res.status(400).json({
                    message: "Missing required query parameters: startTime, endTime"
                });
            }

            // Validate timestamps
            const start = new Date(startTime as string);
            const end = new Date(endTime as string);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return res.status(400).json({ message: "Invalid timestamp format" });
            }

            if (start >= end) {
                return res.status(400).json({ message: "startTime must be before endTime" });
            }

            // Validate limit using shared helper
            const parsedLimit = limit ? validateQueryLimit(limit) : undefined;

            const bars = await storage.getBars1h(exchange, symbol, start, end, parsedLimit);
            res.json(bars);
        } catch (error: any) {
            if (error.message?.includes('Invalid limit')) {
                return res.status(400).json({ message: error.message });
            }
            console.error("Error fetching 1h bars:", error);
            res.status(500).json({ message: "Failed to fetch 1h bars" });
        }
    });

    // Orders - Get by portfolio
    router.get('/api/orders/:portfolioId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.params;

            // Verify portfolio belongs to user
            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const orders = await storage.getOrdersByPortfolioId(portfolioId);
            res.json(orders);
        } catch (error) {
            console.error("Error fetching orders:", error);
            res.status(500).json({ message: "Failed to fetch orders" });
        }
    });

    // Orders - Create new order
    router.post('/api/orders', isAuthenticated, async (req: any, res: Response) => {
        try {
            // Validate request body with Zod
            const validationResult = insertOrderSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid order data",
                    errors: validationResult.error.errors
                });
            }

            const { portfolio_id } = validationResult.data;

            // Verify portfolio belongs to user (SECURITY: prevent cross-tenant mutations)
            const portfolio = await storage.getPortfolio(portfolio_id);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const order = await storage.createOrder(validationResult.data);
            res.json(order);
        } catch (error) {
            console.error("Error creating order:", error);
            res.status(500).json({ message: "Failed to create order" });
        }
    });

    // Orders - Update status
    router.patch('/api/orders/:id/status', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { id } = req.params;

            // Validate request body with Zod
            const validationResult = updateOrderStatusSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid order status data",
                    errors: validationResult.error.errors
                });
            }

            const { status, filled_quantity, average_fill_price } = validationResult.data;

            const updated = await storage.updateOrderStatus(
                id,
                status,
                filled_quantity,
                average_fill_price
            );
            res.json(updated);
        } catch (error: any) {
            if (error.message?.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            console.error("Error updating order status:", error);
            res.status(500).json({ message: "Failed to update order status" });
        }
    });

    // Orders - Execute order on Kraken (LIVE TRADING)
    router.post('/api/orders/execute', isAuthenticated, async (req: any, res: Response) => {
        try {

            // Validate request body with Zod
            const validationResult = executeOrderSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid order data",
                    errors: validationResult.error.errors
                });
            }

            const { portfolioId, symbol, side, type, quantity, price, stopPrice } = validationResult.data;

            // Verify portfolio belongs to user
            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            // Check circuit breaker
            const circuitBreakerTriggered = await riskService.checkCircuitBreaker(portfolioId);
            if (circuitBreakerTriggered) {
                return res.status(403).json({
                    message: "Circuit breaker triggered - daily loss limit exceeded. Trading is disabled."
                });
            }

            // For limit orders, validate risk limits
            if (type === 'limit' || type === 'market') {
                const entryPrice = price ? parseFloat(price) : 0; // Market orders use current price
                const qty = parseFloat(quantity);
                const positionValueUsd = entryPrice * qty;

                // Check risk limits
                const riskCheck = await riskService.canOpenPosition(
                    portfolioId,
                    positionValueUsd,
                    entryPrice,
                    qty,
                    stopPrice ? parseFloat(stopPrice) : null
                );

                if (!riskCheck.allowed) {
                    return res.status(403).json({
                        message: riskCheck.reason || "Order violates risk limits"
                    });
                }
            }

            // Execute order on Kraken
            const order = await orderExecutionService.placeOrder({
                portfolioId,
                symbol,
                side,
                type,
                quantity,
                price,
                stopPrice,
            });

            res.json(order);
        } catch (error: any) {
            console.error("Error executing order:", error);
            res.status(500).json({ message: error.message || "Failed to execute order" });
        }
    });

    // Orders - Cancel order on Kraken
    router.post('/api/orders/:id/cancel', isAuthenticated, async (req: any, res: Response) => {
        try {

            const { id } = req.params;

            // Get order to verify ownership
            const order = await storage.getOrder(id);
            if (!order) {
                return res.status(404).json({ message: "Order not found" });
            }

            // Verify portfolio belongs to user
            const portfolio = await storage.getPortfolio(order.portfolio_id);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            // Cancel order on Kraken
            await orderExecutionService.cancelOrder(id);

            res.json({ message: "Order cancelled successfully" });
        } catch (error: any) {
            console.error("Error cancelling order:", error);
            res.status(500).json({ message: error.message || "Failed to cancel order" });
        }
    });

    // ========== CIRCUIT BREAKERS ROUTES (3-Layer System) ==========

    router.get('/api/circuit-breakers/:portfolioId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.params;

            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const breakers = await circuitBreakerService.getAllBreakers(portfolioId);
            res.json(breakers);
        } catch (error) {
            console.error("Error fetching circuit breakers:", error);
            res.status(500).json({ message: "Failed to fetch circuit breakers" });
        }
    });

    router.get('/api/circuit-breakers/events/:portfolioId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.params;
            const { limit } = req.query;

            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const parsedLimit = limit ? validateQueryLimit(limit) : 50;
            const events = await storage.getCircuitBreakerEventsByPortfolio(portfolioId, parsedLimit);
            res.json(events);
        } catch (error: any) {
            if (error.message?.includes('Invalid limit')) {
                return res.status(400).json({ message: error.message });
            }
            console.error("Error fetching breaker events:", error);
            res.status(500).json({ message: "Failed to fetch breaker events" });
        }
    });

    router.post('/api/circuit-breakers/asset/reset', isAuthenticated, async (req: any, res: Response) => {
        try {
            const validationResult = resetAssetBreakerSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid request data",
                    errors: validationResult.error.errors
                });
            }

            const { portfolioId, symbol } = validationResult.data;

            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            await circuitBreakerService.resetAssetBreaker(portfolioId, symbol);
            res.json({ message: `Asset breaker for ${symbol} reset successfully` });
        } catch (error) {
            console.error("Error resetting asset breaker:", error);
            res.status(500).json({ message: "Failed to reset asset breaker" });
        }
    });

    router.post('/api/circuit-breakers/cluster/reset', isAuthenticated, async (req: any, res: Response) => {
        try {
            const validationResult = resetClusterBreakerSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid request data",
                    errors: validationResult.error.errors
                });
            }

            const { portfolioId, clusterNumber } = validationResult.data;

            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            await circuitBreakerService.resetClusterBreaker(portfolioId, clusterNumber);
            res.json({ message: `Cluster ${clusterNumber} breaker reset successfully` });
        } catch (error) {
            console.error("Error resetting cluster breaker:", error);
            res.status(500).json({ message: "Failed to reset cluster breaker" });
        }
    });

    router.post('/api/circuit-breakers/global/reset', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.body;

            if (!portfolioId || typeof portfolioId !== 'string') {
                return res.status(400).json({ message: "Portfolio ID required" });
            }

            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            await circuitBreakerService.resetGlobalBreaker(portfolioId);
            res.json({ message: "Global circuit breaker reset successfully" });
        } catch (error) {
            console.error("Error resetting global breaker:", error);
            res.status(500).json({ message: "Failed to reset global breaker" });
        }
    });

    // ========== REBALANCING ROUTES ==========

    // POST /api/rebalance/:portfolioId/execute - Manual rebalance trigger
    router.post('/api/rebalance/:portfolioId/execute', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.params;

            // Validate request body
            const validation = executeRebalanceSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    message: "Invalid request body",
                    errors: validation.error.errors
                });
            }
            const { dryRun } = validation.data;

            // Verify portfolio ownership
            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            // Calculate rebalance plan first
            const plan = await rebalanceService.calculateRebalance(portfolioId);

            if (!plan.requiresRebalance) {
                return res.json({
                    success: true,
                    tradesExecuted: 0,
                    totalCost: 0,
                    logId: null,
                    errors: [],
                    message: plan.reason || "No rebalancing needed",
                });
            }

            // Validate circuit breakers before execution (even for dry-run)
            const circuitValidation = await rebalanceService.validateCircuitBreakers(portfolioId, plan.trades);
            if (!circuitValidation.valid) {
                return res.status(409).json({
                    message: "Circuit breaker triggered - trading blocked for symbols",
                    blockedSymbols: circuitValidation.blockedSymbols
                });
            }

            // Validate cluster caps
            const capsValidation = rebalanceService.validateClusterCaps(plan.clusterExposures);
            if (!capsValidation.valid) {
                return res.status(409).json({
                    message: "Cluster caps violation",
                    violations: capsValidation.violations
                });
            }

            // Execute rebalance with pre-computed plan (avoids duplicate validation)
            const result = await rebalanceService.executeRebalance(portfolioId, dryRun, plan);
            res.json(result);
        } catch (error: any) {
            console.error("Error executing rebalance:", error);

            // Return 400 for validation errors, 500 for unexpected errors
            if (error.message?.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }

            res.status(500).json({ message: error.message || "Failed to execute rebalance" });
        }
    });

    // GET /api/rebalance/:portfolioId/preview - Get rebalance plan without executing
    router.get('/api/rebalance/:portfolioId/preview', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.params;

            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const plan = await rebalanceService.calculateRebalance(portfolioId);

            // If rebalancing is required, validate circuit breakers
            if (plan.requiresRebalance) {
                const circuitValidation = await rebalanceService.validateCircuitBreakers(portfolioId, plan.trades);
                if (!circuitValidation.valid) {
                    return res.status(409).json({
                        message: "Circuit breaker triggered - preview blocked",
                        blockedSymbols: circuitValidation.blockedSymbols,
                        plan
                    });
                }
            }

            res.json(plan);
        } catch (error: any) {
            console.error("Error generating rebalance preview:", error);

            if (error.message?.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }

            res.status(500).json({ message: error.message || "Failed to generate preview" });
        }
    });

    // GET /api/rebalance/:portfolioId/logs - Get rebalancing history
    router.get('/api/rebalance/:portfolioId/logs', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.params;
            const { limit } = req.query;

            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const parsedLimit = limit ? validateQueryLimit(limit) : 50;
            const logs = await storage.getRebalanceLogsByPortfolioId(portfolioId, parsedLimit);
            res.json(logs);
        } catch (error: any) {
            if (error.message?.includes('Invalid limit')) {
                return res.status(400).json({ message: error.message });
            }
            console.error("Error fetching rebalance logs:", error);
            res.status(500).json({ message: "Failed to fetch logs" });
        }
    });

    // ===== ORDER ENTRY WITH ATR-BASED OCO (Topic 14.2) =====
    // POST /api/orders/entry - Create entry order with automatic OCO protection
    router.post('/api/orders/entry', isAuthenticated, async (req: any, res: Response) => {
        try {
            const validationResult = orderEntrySchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid order entry data",
                    errors: validationResult.error.errors
                });
            }

            const { portfolioId, symbol, side, qty, entry_type, price, sl_atr, tp1_atr, tp2_atr } = validationResult.data;

            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const circuitBreakerTriggered = await riskService.checkCircuitBreaker(portfolioId);
            if (circuitBreakerTriggered) {
                return res.status(403).json({
                    message: "Circuit breaker triggered - trading is disabled"
                });
            }

            const atrValue = await dataIngestionService.getIndicator(symbol, 'atr', 14);
            if (!atrValue) {
                return res.status(400).json({
                    message: `ATR not available for ${symbol}. Please ensure market data is being collected.`
                });
            }

            const atr = parseFloat(atrValue);
            console.log(`[OrderEntry] ${symbol} ATR(14) = ${atr}`);

            let entryPrice: number;
            if (entry_type === 'limit' && price) {
                entryPrice = parseFloat(price);
            } else {
                const l1Quote = await dataIngestionService.getL1Quote('kraken', symbol);
                if (!l1Quote) {
                    return res.status(400).json({
                        message: `Current price not available for ${symbol}`
                    });
                }
                const bidPrice = parseFloat(l1Quote.bid_price);
                const askPrice = parseFloat(l1Quote.ask_price);
                entryPrice = (bidPrice + askPrice) / 2;
            }

            const isLong = side === 'buy';
            const slPrice = isLong
                ? entryPrice - (sl_atr * atr)
                : entryPrice + (sl_atr * atr);
            const tp1Price = isLong
                ? entryPrice + (tp1_atr * atr)
                : entryPrice - (tp1_atr * atr);
            const tp2Price = isLong
                ? entryPrice + (tp2_atr * atr)
                : entryPrice - (tp2_atr * atr);

            console.log(`[OrderEntry] ${symbol} ${side.toUpperCase()} @ ${entryPrice}`);
            console.log(`[OrderEntry] SL: ${slPrice.toFixed(8)} (${sl_atr}x ATR)`);
            console.log(`[OrderEntry] TP1: ${tp1Price.toFixed(8)} (${tp1_atr}x ATR)`);
            console.log(`[OrderEntry] TP2: ${tp2Price.toFixed(8)} (${tp2_atr}x ATR)`);

            const qtyNum = parseFloat(qty);
            const positionValueUsd = entryPrice * qtyNum;

            const riskCheck = await riskService.canOpenPosition(
                portfolioId,
                positionValueUsd,
                entryPrice,
                qtyNum,
                slPrice
            );

            if (!riskCheck.allowed) {
                return res.status(403).json({
                    message: riskCheck.reason || "Order violates risk limits",
                    details: {
                        entryPrice,
                        slPrice,
                        tp1Price,
                        tp2Price,
                        atr,
                        positionValueUsd
                    }
                });
            }

            const mainOrder = await orderExecutionService.placeOrder({
                portfolioId,
                symbol,
                side,
                type: entry_type,
                quantity: qty,
                price: entry_type === 'limit' ? price : undefined,
            });

            const ocoIds: string[] = [];

            try {
                const slSide = isLong ? 'sell' : 'buy';

                const slOrder = await orderExecutionService.placeOrder({
                    portfolioId,
                    symbol,
                    side: slSide,
                    type: 'stop_loss',
                    quantity: qty,
                    stopPrice: slPrice.toFixed(8),
                });
                ocoIds.push(slOrder.id);

                const tp1Qty = (qtyNum * 0.5).toFixed(8);
                const tp2Qty = (qtyNum * 0.5).toFixed(8);

                const tp1Order = await orderExecutionService.placeOrder({
                    portfolioId,
                    symbol,
                    side: slSide,
                    type: 'limit',
                    quantity: tp1Qty,
                    price: tp1Price.toFixed(8),
                });
                ocoIds.push(tp1Order.id);

                const tp2Order = await orderExecutionService.placeOrder({
                    portfolioId,
                    symbol,
                    side: slSide,
                    type: 'limit',
                    quantity: tp2Qty,
                    price: tp2Price.toFixed(8),
                });
                ocoIds.push(tp2Order.id);

                console.log(`[OrderEntry] OCO orders created: SL=${slOrder.id}, TP1=${tp1Order.id}, TP2=${tp2Order.id}`);
            } catch (ocoError) {
                console.error(`[OrderEntry] Failed to create OCO orders, main order still placed:`, ocoError);
            }

            res.json({
                order_id: mainOrder.id,
                oco_ids: ocoIds,
                status: mainOrder.status,
                details: {
                    symbol,
                    side,
                    qty,
                    entry_type,
                    entry_price: entryPrice,
                    atr,
                    sl_price: slPrice,
                    tp1_price: tp1Price,
                    tp2_price: tp2Price,
                    sl_atr_multiplier: sl_atr,
                    tp1_atr_multiplier: tp1_atr,
                    tp2_atr_multiplier: tp2_atr,
                }
            });
        } catch (error: any) {
            console.error("[OrderEntry] Error:", error);
            res.status(500).json({ message: error.message || "Failed to create entry order with OCO" });
        }
    });

    // Orders - Refresh order status from Kraken
    router.get('/api/orders/:id/refresh', isAuthenticated, async (req: any, res: Response) => {
        try {

            const { id } = req.params;

            // Get order to verify ownership
            const order = await storage.getOrder(id);
            if (!order) {
                return res.status(404).json({ message: "Order not found" });
            }

            // Verify portfolio belongs to user
            const portfolio = await storage.getPortfolio(order.portfolio_id);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            // Query and update order from Kraken
            const updatedOrder = await orderExecutionService.queryAndUpdateOrder(id);

            res.json(updatedOrder);
        } catch (error: any) {
            console.error("Error refreshing order status:", error);
            res.status(500).json({ message: error.message || "Failed to refresh order status" });
        }
    });

    // Decision Log - Get by portfolio
    router.get('/api/decisions/:portfolioId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.params;
            const { limit } = req.query;

            // Verify portfolio belongs to user
            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const logs = await storage.getDecisionLogsByPortfolio(
                portfolioId,
                limit ? validateQueryLimit(limit) : undefined
            );
            res.json(logs);
        } catch (error: any) {
            if (error.message?.includes('Invalid limit')) {
                return res.status(400).json({ message: error.message });
            }
            console.error("Error fetching decision logs:", error);
            console.error("Error fetching decision logs:", error);
            res.status(500).json({ message: "Failed to fetch decision logs" });
        }
    });

    // Orders - Refresh order status from Kraken
    router.get('/api/orders/:id/refresh', isAuthenticated, async (req: any, res: Response) => {
        try {

            const { id } = req.params;

            // Get order to verify ownership
            const order = await storage.getOrder(id);
            if (!order) {
                return res.status(404).json({ message: "Order not found" });
            }

            // Verify portfolio belongs to user
            const portfolio = await storage.getPortfolio(order.portfolio_id);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            // Query and update order from Kraken
            const updatedOrder = await orderExecutionService.queryAndUpdateOrder(id);

            res.json(updatedOrder);
        } catch (error: any) {
            console.error("Error refreshing order status:", error);
            res.status(500).json({ message: error.message || "Failed to refresh order status" });
        }
    });

    // Decision Log - Get by portfolio
    router.get('/api/decisions/:portfolioId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.params;
            const { limit } = req.query;

            // Verify portfolio belongs to user
            const portfolio = await storage.getPortfolio(portfolioId);
            if (!portfolio) {
                return res.status(404).json({ message: "Portfolio not found" });
            }

            const userId = req.user.claims.sub;
            if (portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const logs = await storage.getDecisionLogsByPortfolio(
                portfolioId,
                limit ? validateQueryLimit(limit) : undefined
            );
            res.json(logs);
        } catch (error: any) {
            if (error.message?.includes('Invalid limit')) {
                return res.status(400).json({ message: error.message });
            }
            console.error("Error fetching decision logs:", error);
            res.status(500).json({ message: "Failed to fetch decision logs" });
        }
    });

    // Decision Log - Create
    router.post('/api/decisions', async (req: any, res: Response) => {
        try {
            const validationResult = insertDecisionLogSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid decision log data",
                    errors: validationResult.error.errors
                });
            }

            const { portfolio_id } = validationResult.data;

            // portfolio_id is optional in decision_log, but if provided must be valid
            if (portfolio_id) {
                // Verify portfolio belongs to user (SECURITY: prevent cross-tenant mutations)
                const portfolio = await storage.getPortfolio(portfolio_id);
                if (!portfolio) {
                    return res.status(404).json({ message: "Portfolio not found" });
                }

                const userId = req.user.claims.sub;
                if (portfolio.user_id !== userId) {
                    return res.status(403).json({ message: "Access denied" });
                }
            }

            const log = await storage.createDecisionLog(validationResult.data);
            res.json(log);
        } catch (error) {
            console.error("Error creating decision log:", error);
            res.status(500).json({ message: "Failed to create decision log" });
        }
    });

    // Clusters - Get by campaign
    router.get('/clusters/:campaignId', async (req: any, res: Response) => {
        try {
            const { campaignId } = req.params;
            const clusters = await storage.getClustersByCampaign(campaignId);
            res.json(clusters);
        } catch (error) {
            console.error("Error fetching clusters:", error);
            res.status(500).json({ message: "Failed to fetch clusters" });
        }
    });

    // Clusters - Create
    router.post('/clusters', async (req: any, res: Response) => {
        try {
            // Validate request body with Zod
            const validationResult = insertClusterSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid cluster data",
                    errors: validationResult.error.errors
                });
            }

            const { campaign_id } = validationResult.data;

            // campaign_id is optional in clusters, but if provided must be valid
            if (campaign_id) {
                // Verify campaign exists (SECURITY: prevent cross-tenant mutations)
                const campaign = await storage.getCampaign(campaign_id);
                if (!campaign) {
                    return res.status(404).json({ message: "Campaign not found" });
                }

                // Verify campaign's portfolio belongs to user
                const portfolio = await storage.getPortfolio(campaign.portfolio_id);
                if (!portfolio) {
                    return res.status(404).json({ message: "Portfolio not found" });
                }

                const userId = req.user.claims.sub;
                if (portfolio.user_id !== userId) {
                    return res.status(403).json({ message: "Access denied" });
                }
            }

            const cluster = await storage.createCluster(validationResult.data);
            res.json(cluster);
        } catch (error) {
            console.error("Error creating cluster:", error);
            res.status(500).json({ message: "Failed to create cluster" });
        }
    });

    // Clusters - Update PnL
    router.patch('/clusters/:id/pnl', async (req: any, res: Response) => {
        try {
            const { id } = req.params;

            // Validate request body with Zod
            const validationResult = updateClusterPnLSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid cluster PnL data",
                    errors: validationResult.error.errors
                });
            }

            const { daily_pnl } = validationResult.data;

            const updated = await storage.updateClusterPnL(id, daily_pnl);
            res.json(updated);
        } catch (error: any) {
            if (error.message?.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            console.error("Error updating cluster PnL:", error);
            res.status(500).json({ message: "Failed to update cluster PnL" });
        }
    });

    // Run Asset Selection + Clustering
    router.post('/api/selector/run', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { clusterService } = await import('../../services/market');
            const { assetSelectorService } = await import('../../services/assetSelectorService');

            // Parse optional filters from request body
            const filters = req.body?.filters || {};
            const topN = req.body?.topN || 100;

            let selectionResult;
            try {
                // Root service takes userId and fetches filters from DB
                selectionResult = await assetSelectorService.runSelection(req.user.claims.sub);
                console.log(`[INFO] Selected ${selectionResult.assets.length} symbols for run ${selectionResult.run_id}`);
            } catch (error) {
                console.error("[ERROR] Asset selection failed:", error);
                return res.status(500).json({
                    message: "Asset selection failed",
                    stage: "selection",
                    error: error instanceof Error ? error.message : "Unknown error"
                });
            }

            // Step 2: Cluster the selected symbols
            let clusterAssignments;
            try {
                // Note: assetSelectorService already performs clustering, but we keep this if clusterService does additional work
                // If clusterService expects runId, we pass run_id
                clusterAssignments = await clusterService.clusterSymbols(selectionResult.run_id);
                console.log(`[INFO] Clustered into ${clusterAssignments.length} assignments`);
            } catch (error) {
                console.error("[ERROR] Clustering failed:", error);
                return res.status(500).json({
                    message: "Clustering failed",
                    stage: "clustering",
                    runId: selectionResult.run_id,
                    error: error instanceof Error ? error.message : "Unknown error"
                });
            }

            res.json({
                runId: selectionResult.run_id,
                selected: selectionResult.assets.length,
                clustered: clusterAssignments.length,
            });
        } catch (error) {
            console.error("[ERROR] Unexpected error in asset selection pipeline:", error);
            res.status(500).json({
                message: "Unexpected error in asset selection pipeline",
                error: error instanceof Error ? error.message : "Unknown error"
            });
        }
    });

    // Get Rankings by Run ID
    router.get('/symbols/rankings', async (req: any, res: Response) => {
        try {
            const { runId, limit } = req.query;

            if (!runId) {
                return res.status(400).json({ message: "runId query parameter is required" });
            }

            const limitNum = limit ? parseInt(limit as string, 10) : 100;
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
                return res.status(400).json({ message: "limit must be between 1 and 10000" });
            }

            const rankings = await storage.getTopRankings(runId as string, limitNum);
            res.json(rankings);
        } catch (error) {
            console.error("Error fetching rankings:", error);
            res.status(500).json({ message: "Failed to fetch rankings" });
        }
    });

    // ===== RISK MANAGEMENT ENDPOINTS =====

    // Get risk parameters
    router.get('/api/risk/parameters/:portfolioId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.params;
            const params = await riskService.getRiskParameters(portfolioId);
            res.json(params || {});
        } catch (error: any) {
            console.error("Error fetching risk parameters:", error);
            res.status(500).json({ message: "Failed to fetch risk parameters" });
        }
    });

    // Update risk parameters
    router.post('/api/risk/parameters', isAuthenticated, async (req: any, res: Response) => {
        try {
            const validation = insertRiskParametersSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({ errors: validation.error.errors });
            }
            const params = await riskService.updateRiskParameters(req.body);
            res.json(params);
        } catch (error: any) {
            console.error("Error updating risk parameters:", error);
            res.status(500).json({ message: "Failed to update risk parameters" });
        }
    });

    // Calculate position sizing (Risk + Fees)
    router.post('/api/risk/sizing', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { equity, riskBps, slDecimal, exchangeId, symbol, volatilityScaleFactor } = req.body;

            if (!equity || !riskBps || !slDecimal || !exchangeId || !symbol) {
                return res.status(400).json({ message: "Missing required parameters for sizing" });
            }

            const size = await feesService.calculatePositionSize(
                parseFloat(equity),
                parseFloat(riskBps),
                parseFloat(slDecimal),
                exchangeId,
                symbol,
                volatilityScaleFactor ? parseFloat(volatilityScaleFactor) : 1.0
            );

            res.json({ positionSize: size });
        } catch (error: any) {
            console.error("Error calculating position size:", error);
            res.status(500).json({ message: "Failed to calculate position size" });
        }
    });

    // ===== FEES & COSTS ENDPOINTS =====

    // Get trading fees and slippage
    router.get('/api/trade-costs/:exchangeId/:symbol', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { exchangeId, symbol } = req.params;
            const fees = await feesService.calculateFees(exchangeId, symbol);
            res.json(fees);
        } catch (error: any) {
            console.error("Error fetching trade costs:", error);
            res.status(500).json({ message: "Failed to fetch trade costs" });
        }
    });

    // ===== TAX OPTIMIZATION ENDPOINTS =====

    // Get active tax profile
    router.get('/api/tax-profiles/:userId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { userId } = req.params;
            // Security check: ensure requesting user matches userId
            if (req.user.claims.sub !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const profile = await taxService.getActiveTaxProfile(userId);
            res.json(profile || {});
        } catch (error: any) {
            console.error("Error fetching tax profile:", error);
            res.status(500).json({ message: "Failed to fetch tax profile" });
        }
    });

    // Update/Create tax profile
    router.post('/api/tax-profiles', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            // Note: Assuming body matches InsertTaxProfile structure (excluding user_id)
            // Ideally validate with insertTaxProfileSchema but it might include user_id

            const profile = await taxService.upsertTaxProfile(userId, req.body);
            res.json(profile);
        } catch (error: any) {
            console.error("Error updating tax profile:", error);
            res.status(500).json({ message: "Failed to update tax profile" });
        }
    });

    // Get tax summary
    router.get('/api/tax-summary/:portfolioId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { portfolioId } = req.params;
            const { year } = req.query;
            const taxYear = year ? parseInt(year as string) : new Date().getFullYear();

            const summary = await taxService.getPortfolioTaxSummary(portfolioId, taxYear);
            res.json(summary);
        } catch (error: any) {
            console.error("Error fetching tax summary:", error);
            res.status(500).json({ message: "Failed to fetch tax summary" });
        }
    });
}
