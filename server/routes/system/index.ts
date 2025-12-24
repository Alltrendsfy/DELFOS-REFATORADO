import type { Router, Request, Response } from "express";
import { isAuthenticated } from "../../replitAuth";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq, and, desc, inArray, count } from "drizzle-orm";
import {
    campaigns,
    portfolios,
    robot_activity_logs,
    opportunity_blueprints,
} from "@shared/schema";
import { stalenessGuardService } from "../../services/stalenessGuardService";
import { krakenService } from "../../services/krakenService";
import { z } from "zod";

// Hardcoded authorized emails for beta access
const ALWAYS_AUTHORIZED_EMAILS = [
    'delfos@alltrends.com.br',
    'admin@zenith.com',
    'usuario@zenith.com'
];

export function registerSystemRoutes(router: Router) {
    // GET /api/dashboard/stats - Get basic dashboard stats
    router.get('/api/dashboard/stats', isAuthenticated, async (req: Request, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Get Kraken balance
            const krakenBalance = await krakenService.getBalance();

            // Get all user's portfolios
            const portfoliosList = await storage.getPortfoliosByUserId(userId);

            // Calculate total portfolio value
            const portfolioValue = portfoliosList.reduce((sum, p) =>
                sum + parseFloat(p.total_value_usd || '0'), 0
            );

            // Fetch positions and trades concurrently for all portfolios (performance optimization)
            const [positionsArrays, tradesArrays] = await Promise.all([
                Promise.all(portfoliosList.map(p => storage.getPositionsByPortfolioId(p.id))),
                Promise.all(portfoliosList.map(p => storage.getTradesByPortfolioId(p.id)))
            ]);

            // Calculate unrealized PnL from all positions
            const allPositions = positionsArrays.flat();
            const unrealizedPnL = allPositions.reduce((sum, pos) =>
                sum + parseFloat(pos.unrealized_pnl || '0'), 0
            );

            // Calculate realized PnL from today's trades
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const allTrades = tradesArrays.flat();
            const todayTrades = allTrades.filter(t => {
                const closedAt = new Date(t.closed_at);
                return closedAt >= today;
            });

            const realizedPnL = todayTrades.reduce((sum, trade) =>
                sum + parseFloat(trade.realized_pnl || '0'), 0
            );

            // Calculate total daily P&L
            const dailyPnL = unrealizedPnL + realizedPnL;

            // Calculate daily P&L percentage
            const dailyPnLPercentage = portfolioValue > 0
                ? (dailyPnL / portfolioValue) * 100
                : 0;

            // Get active campaigns count (exclude soft-deleted campaigns)
            const activeCampaigns = await db.select()
                .from(campaigns)
                .where(and(
                    eq(campaigns.status, 'running'),
                    eq(campaigns.is_deleted, false),
                    inArray(campaigns.portfolio_id, portfoliosList.map(p => p.id))
                ));

            // Count open positions (positions table only contains open positions)
            const openPositionsCount = allPositions.length;

            res.json({
                portfolio_value: portfolioValue.toFixed(2),
                daily_pnl: dailyPnL.toFixed(2),
                daily_pnl_percentage: dailyPnLPercentage.toFixed(2),
                unrealized_pnl: unrealizedPnL.toFixed(2),
                realized_pnl: realizedPnL.toFixed(2),
                active_campaigns: activeCampaigns.length,
                open_positions: openPositionsCount,
            });
        } catch (error) {
            console.error("Error fetching dashboard stats:", error);
            res.status(500).json({ message: "Failed to fetch dashboard stats" });
        }
    });

    // GET /api/dashboard/enhanced-stats - Enhanced dashboard stats with opportunities, system health, and Kraken balance
    router.get('/api/dashboard/enhanced-stats', isAuthenticated, async (req: Request, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Get opportunity blueprints count
            const activeBlueprints = await db.select({ count: count() })
                .from(opportunity_blueprints)
                .where(and(
                    eq(opportunity_blueprints.user_id, userId),
                    eq(opportunity_blueprints.status, 'ACTIVE')
                ));

            const pendingBlueprints = await db.select()
                .from(opportunity_blueprints)
                .where(and(
                    eq(opportunity_blueprints.user_id, userId),
                    eq(opportunity_blueprints.status, 'ACTIVE')
                ))
                .orderBy(desc(opportunity_blueprints.created_at))
                .limit(5);

            // Get staleness and system health status
            const stalenessLevel = stalenessGuardService.getGlobalStalenessLevel();
            const quarantineStatus = stalenessGuardService.getQuarantineStatus();

            // Determine system health
            let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
            let systemAlerts: string[] = [];

            if (stalenessLevel === 'kill_switch' || stalenessLevel === 'hard') {
                systemHealth = 'critical';
                systemAlerts.push('Dados de mercado atrasados - trading pausado');
            } else if (stalenessLevel === 'warn') {
                systemHealth = 'warning';
                systemAlerts.push('Alguns dados de mercado com atraso');
            }

            const quarantinedCount = quarantineStatus.quarantinedSymbols?.length || 0;
            // @ts-ignore - activeSymbols is added in stalenessGuardService but might not be picked up by types yet
            const activeSymbolsCount = quarantineStatus.activeSymbols || 0;

            if (quarantinedCount > 10) {
                if (systemHealth === 'healthy') systemHealth = 'warning';
                systemAlerts.push(`${quarantinedCount} símbolos em quarentena`);
            }

            // Get Kraken balance if user has credentials
            let krakenBalance = null;
            try {
                const user = await storage.getUser(userId);
                if (user?.kraken_api_key && user?.kraken_api_secret) {
                    // TODO: Implement getBalance in krakenService
                    // const { krakenService } = await import('../../services/krakenService');
                    // const balance = await krakenService.getBalance(userId);
                    // if (balance) {
                    //     const zusdBalance = parseFloat(balance['ZUSD'] || '0');
                    //     const usdtBalance = parseFloat(balance['USDT'] || '0');
                    //     krakenBalance = {
                    //         zusd: zusdBalance.toFixed(2),
                    //         usdt: usdtBalance.toFixed(2),
                    //         total_available: zusdBalance.toFixed(2), // ZUSD is the usable one for spot
                    //         has_credentials: true
                    //     };
                    // }
                    krakenBalance = { has_credentials: true, message: "Balance fetching temporarily disabled" };
                }
            } catch (err) {
                // Kraken balance fetch failed - not critical
                krakenBalance = { has_credentials: false };
            }

            // Get recent signals from robot activities
            const portfoliosList = await storage.getPortfoliosByUserId(userId);
            const portfolioIds = portfoliosList.map(p => p.id);

            let recentSignals: any[] = [];
            if (portfolioIds.length > 0) {
                const userCampaigns = await db.select()
                    .from(campaigns)
                    .where(and(
                        inArray(campaigns.portfolio_id, portfolioIds),
                        eq(campaigns.is_deleted, false)
                    ));

                const campaignIds = userCampaigns.map(c => c.id);

                if (campaignIds.length > 0) {
                    const signalActivities = await db.select()
                        .from(robot_activity_logs)
                        .where(and(
                            inArray(robot_activity_logs.campaign_id, campaignIds),
                            inArray(robot_activity_logs.event_type, ['signal_generated', 'position_open', 'position_close'])
                        ))
                        .orderBy(desc(robot_activity_logs.created_at))
                        .limit(5);

                    recentSignals = signalActivities.map(a => ({
                        id: a.id,
                        type: a.event_type,
                        symbol: a.symbol,
                        severity: a.severity,
                        timestamp: a.created_at
                    }));
                }
            }

            res.json({
                opportunities: {
                    active_count: activeBlueprints[0]?.count || 0,
                    recent: pendingBlueprints.map(b => ({
                        id: b.id,
                        type: b.type,
                        score: b.opportunity_score,
                        assets: b.assets,
                        expires_at: b.expires_at
                    }))
                },
                system_health: {
                    status: systemHealth,
                    staleness_level: stalenessLevel,
                    active_symbols: activeSymbolsCount,
                    quarantined_symbols: quarantinedCount,
                    alerts: systemAlerts
                },
                kraken_balance: krakenBalance,
                recent_signals: recentSignals
            });
        } catch (error) {
            console.error("Error fetching enhanced dashboard stats:", error);
            res.status(500).json({ message: "Failed to fetch enhanced dashboard stats" });
        }
    });

    // GET /api/robot-activities/recent - Recent robot activities for dashboard
    router.get('/api/robot-activities/recent', isAuthenticated, async (req: Request, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Get user portfolios to filter campaigns
            const portfoliosList = await storage.getPortfoliosByUserId(userId);
            const portfolioIds = portfoliosList.map(p => p.id);

            if (portfolioIds.length === 0) {
                return res.json([]);
            }

            // Get campaigns for user's portfolios (exclude soft-deleted)
            const userCampaigns = await db.select()
                .from(campaigns)
                .where(and(
                    inArray(campaigns.portfolio_id, portfolioIds),
                    eq(campaigns.is_deleted, false)
                ));

            const campaignIds = userCampaigns.map(c => c.id);

            if (campaignIds.length === 0) {
                return res.json([]);
            }

            // Get recent activities from user's campaigns
            const activities = await db.select()
                .from(robot_activity_logs)
                .where(inArray(robot_activity_logs.campaign_id, campaignIds))
                .orderBy(desc(robot_activity_logs.created_at))
                .limit(20);

            res.json(activities);
        } catch (error) {
            console.error("Error fetching recent activities:", error);
            res.status(500).json({ message: "Failed to fetch recent activities" });
        }
    });

    // GET /api/user/beta-status - Check user beta status
    router.get('/api/user/beta-status', isAuthenticated, async (req: Request, res: Response) => {
        try {
            const userId = req.user?.claims?.sub || 'unknown';
            const userEmail = req.user?.claims?.email;
            console.log(`[BETA-STATUS] Checking status for user ${userId} (${userEmail})`);

            const user = await storage.getUserById(userId);

            if (!user) {
                console.log(`[BETA-STATUS] User not found: ${userId}`);
                return res.status(404).json({ message: "User not found" });
            }

            console.log(`[BETA-STATUS] User ${userId}: is_beta_approved=${user.is_beta_approved}, is_admin=${user.is_admin}`);

            // If already beta approved, return immediately
            if (user.is_beta_approved) {
                console.log(`[BETA-STATUS] User ${userId} already approved`);
                return res.json({
                    isBetaApproved: true,
                    betaCodeUsed: user.beta_code_used ?? null,
                });
            }

            // Check hardcoded authorized emails first
            if (userEmail && ALWAYS_AUTHORIZED_EMAILS.includes(userEmail)) {
                console.log(`[BETA-STATUS] Auto-approving user ${userId} with hardcoded authorized email ${userEmail}`);
                await storage.updateUserBetaStatus(userId, true, 'AUTHORIZED_EMAIL');
                return res.json({
                    isBetaApproved: true,
                    betaCodeUsed: 'AUTHORIZED_EMAIL',
                });
            }

            // If not yet beta approved, check if email is in authorized list (database)
            if (userEmail) {
                const authorizedEmail = await storage.getAuthorizedEmailByEmail(userEmail);
                if (authorizedEmail && authorizedEmail.is_active) {
                    // Auto-activate user with authorized email
                    console.log(`[BETA-STATUS] Auto-activating user ${userId} with authorized email from database ${userEmail}`);
                    await storage.updateUserBetaStatus(userId, true, 'AUTHORIZED_EMAIL');
                    return res.json({
                        isBetaApproved: true,
                        betaCodeUsed: 'AUTHORIZED_EMAIL',
                    });
                }
            }

            console.log(`[BETA-STATUS] User ${userId} not approved and no authorized email found`);
            res.json({
                isBetaApproved: false,
                betaCodeUsed: null,
            });
        } catch (error) {
            console.error("[BETA-STATUS] Error fetching beta status:", error);
            res.status(500).json({ message: "Failed to fetch beta status" });
        }
    });
    // Test endpoints
    router.get('/api/test/simple', async (req: Request, res: Response) => {
        console.log('[TEST] Simple test endpoint hit');
        res.json({ status: 'ok', message: 'Simple endpoint works' });
    });

    router.get('/api/test/redis-l2', async (req: Request, res: Response) => {
        console.log('[TEST] Redis L2 diagnostic endpoint hit');
        try {
            const { Redis } = await import('@upstash/redis');
            console.log('[TEST] Redis imported, creating client');
            const redis = Redis.fromEnv();
            console.log('[TEST] Redis client created');

            const testSymbol = 'ETH/USD';
            const bidsKey = `market:l2:bids:kraken:${testSymbol}`;
            const asksKey = `market:l2:asks:kraken:${testSymbol}`;

            console.log(`[TEST] Checking Redis keys: ${bidsKey}, ${asksKey}`);
            console.log('[TEST] Calling redis.exists for bids...');
            const bidsExists = await redis.exists(bidsKey);
            console.log(`[TEST] bidsExists result: ${bidsExists}`);

            console.log('[TEST] Calling redis.exists for asks...');
            const asksExists = await redis.exists(asksKey);
            console.log(`[TEST] asksExists result: ${asksExists}`);

            console.log('[TEST] Calling zrange for bids...');
            const bidsSample = await redis.zrange(bidsKey, 0, 2, { rev: true, withScores: true });
            console.log(`[TEST] bidsSample result:`, bidsSample);

            console.log('[TEST] Calling zrange for asks...');
            const asksSample = await redis.zrange(asksKey, 0, 2, { withScores: true });
            console.log(`[TEST] asksSample result:`, asksSample);

            console.log('[TEST] Sending response...');
            res.json({
                status: 'ok',
                symbol: testSymbol,
                bidsKey,
                asksKey,
                bidsExists: bidsExists === 1,
                asksExists: asksExists === 1,
                bidsSample,
                asksSample
            });
            console.log('[TEST] Response sent successfully');
        } catch (error) {
            console.error('[TEST] Error in Redis L2 diagnostic:', error);
            res.status(500).json({ error: String(error) });
        }
    });

    // Activate beta with code
    router.post('/api/user/activate-beta', isAuthenticated, async (req: Request, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;
            console.log(`[BETA-ACTIVATE] Activation request for user ${userId} (${userEmail})`);

            // Validate request body with Zod
            const betaCodeSchema = z.object({
                code: z.string().min(1, "Code is required"),
            });

            const validationResult = betaCodeSchema.safeParse(req.body);
            if (!validationResult.success) {
                console.error(`[BETA-ACTIVATE] Validation failed:`, validationResult.error.errors);
                return res.status(400).json({
                    message: "Invalid invite code format",
                    errors: validationResult.error.errors
                });
            }

            const { code } = validationResult.data;
            const normalizedCode = code.toUpperCase().trim();
            console.log(`[BETA-ACTIVATE] Checking code: ${normalizedCode}`);

            // Check if user already has beta access
            const user = await storage.getUserById(userId);
            if (!user) {
                console.log(`[BETA-ACTIVATE] User not found: ${userId}`);
                return res.status(404).json({ message: "User not found" });
            }

            if (user.is_beta_approved) {
                console.log(`[BETA-ACTIVATE] User ${userId} already approved - redirecting`);
                return res.json({
                    success: true,
                    message: "Your account is already activated! Redirecting..."
                });
            }

            // Validate and use the beta code
            const betaCode = await storage.getBetaCodeByCode(normalizedCode);
            if (!betaCode) {
                console.log(`[BETA-ACTIVATE] Code not found: ${normalizedCode}`);
                return res.status(400).json({ message: "Invite code not found. Please check the code and try again." });
            }

            if (!betaCode.is_active) {
                console.log(`[BETA-ACTIVATE] Code inactive: ${normalizedCode}`);
                return res.status(400).json({ message: "This invite code is no longer active" });
            }

            if (betaCode.current_uses >= betaCode.max_uses) {
                console.log(`[BETA-ACTIVATE] Code exhausted: ${normalizedCode} (${betaCode.current_uses}/${betaCode.max_uses})`);
                return res.status(400).json({ message: "This invite code has reached its usage limit" });
            }

            if (betaCode.expires_at && new Date() > betaCode.expires_at) {
                console.log(`[BETA-ACTIVATE] Code expired: ${normalizedCode}`);
                return res.status(400).json({ message: "This invite code has expired" });
            }

            // Use the code and update user status
            const codeUsed = await storage.useBetaCode(normalizedCode);
            if (!codeUsed) {
                console.log(`[BETA-ACTIVATE] Failed to use code: ${normalizedCode}`);
                return res.status(400).json({ message: "Failed to activate code. Please try again." });
            }

            await storage.updateUserBetaStatus(userId, true, normalizedCode);
            console.log(`[BETA-ACTIVATE] Successfully activated user ${userId} with code ${normalizedCode}`);

            res.json({
                success: true,
                message: "Account activated successfully! Welcome to DELFOS beta."
            });
        } catch (error: any) {
            console.error("[BETA-ACTIVATE] Error activating beta code:", error?.message || error);
            res.status(500).json({ message: "Server error while activating code. Please try again." });
        }
    });
}

