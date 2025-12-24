import { Router } from "express";
import { isAuthenticated } from "../../replitAuth";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import {
    backtest_runs,
    backtest_trades,
    backtest_metrics,
    monte_carlo_scenarios,
    insertBacktestRunSchema
} from "@shared/schema";
import {
    BacktestEngine,
    MonteCarloSimulator,
    backtestMetricsService,
    extractTradeReturns,
    createDefaultStrategyParams,
    createDefaultRiskParams,
    createDefaultCostParams
} from "../../services/backtest";

export function registerBacktestRoutes(router: Router) {
    // Start a new backtest run
    router.post('/api/backtest/run', isAuthenticated, async (req: any, res) => {
        try {
            const userId = req.user.claims.sub;

            // Convert date strings to Date objects for validation
            const requestBody = {
                ...req.body,
                start_date: req.body.start_date ? new Date(req.body.start_date) : undefined,
                end_date: req.body.end_date ? new Date(req.body.end_date) : undefined,
                user_id: userId,
                status: "pending"
            };

            // Validate request body
            const validationResult = insertBacktestRunSchema.safeParse(requestBody);

            if (!validationResult.success) {
                console.error("[BacktestAPI] Validation errors:", validationResult.error.errors);
                return res.status(400).json({
                    message: "Invalid backtest configuration",
                    errors: validationResult.error.errors
                });
            }

            const config = validationResult.data;

            // Get defaults for strategy, risk, and cost params
            const defaultStrategyParams = createDefaultStrategyParams();
            const defaultRiskParams = createDefaultRiskParams();
            const defaultCostParams = createDefaultCostParams();

            // Merge user-provided params with defaults
            const strategyParams = config.strategy_params
                ? { ...defaultStrategyParams, ...(config.strategy_params as object) }
                : defaultStrategyParams;
            const riskParams = config.risk_params
                ? { ...defaultRiskParams, ...(config.risk_params as object) }
                : defaultRiskParams;
            const costParams = config.cost_params
                ? { ...defaultCostParams, ...(config.cost_params as object) }
                : defaultCostParams;

            // Create backtest run record
            const [backtestRun] = await db.insert(backtest_runs).values({
                user_id: userId,
                portfolio_id: config.portfolio_id || null,
                name: config.name,
                start_date: config.start_date,
                end_date: config.end_date,
                initial_capital: config.initial_capital,
                symbols: config.symbols,
                strategy_params: strategyParams,
                risk_params: riskParams,
                cost_params: costParams,
                apply_breakers: config.apply_breakers ?? true,
                status: "running",
                started_at: new Date(),
            }).returning();

            // Run backtest asynchronously (use already computed params)
            const initialCapital = parseFloat(config.initial_capital);
            const applyBreakers = config.apply_breakers ?? true;

            (async () => {
                try {
                    const engine = new BacktestEngine(
                        strategyParams as any,
                        riskParams as any,
                        costParams as any,
                        initialCapital,
                        applyBreakers
                    );

                    const trades = await engine.run(
                        backtestRun.id,
                        config.symbols,
                        new Date(config.start_date),
                        new Date(config.end_date)
                    );

                    // Run Monte Carlo simulation
                    let monteCarloResults;
                    if (trades.length >= 10) {
                        const tradeReturns = extractTradeReturns(trades);
                        const riskConfig = riskParams as any;
                        const simulator = new MonteCarloSimulator(
                            initialCapital,
                            applyBreakers,
                            riskConfig.global_stop_daily_pct,
                            riskConfig.campaign_dd_stop
                        );
                        monteCarloResults = await simulator.runSimulation(
                            backtestRun.id,
                            tradeReturns,
                            500 // Number of scenarios
                        );
                    }

                    // Calculate and save metrics
                    await backtestMetricsService.calculateAndSaveMetrics(
                        backtestRun.id,
                        initialCapital,
                        monteCarloResults
                    );

                    console.log(`[BacktestAPI] Backtest ${backtestRun.id} completed successfully`);
                } catch (error) {
                    console.error(`[BacktestAPI] Backtest ${backtestRun.id} failed:`, error);
                    await db.update(backtest_runs)
                        .set({
                            status: "failed",
                            error_message: error instanceof Error ? error.message : "Unknown error",
                            completed_at: new Date()
                        })
                        .where(eq(backtest_runs.id, backtestRun.id));
                }
            })();

            res.json({
                id: backtestRun.id,
                status: "running",
                message: "Backtest started successfully"
            });
        } catch (error) {
            console.error("[ERROR] Failed to start backtest:", error);
            res.status(500).json({ message: "Failed to start backtest" });
        }
    });

    // Get backtest results
    router.get('/api/backtest/:id/results', isAuthenticated, async (req: any, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.claims.sub;

            // Get backtest run
            const [backtestRun] = await db.select()
                .from(backtest_runs)
                .where(eq(backtest_runs.id, id));

            if (!backtestRun) {
                return res.status(404).json({ message: "Backtest not found" });
            }

            // Verify ownership
            if (backtestRun.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            // Get metrics
            const [metrics] = await db.select()
                .from(backtest_metrics)
                .where(eq(backtest_metrics.backtest_run_id, id));

            // Get trades summary (limited to prevent large responses)
            const trades = await db.select()
                .from(backtest_trades)
                .where(eq(backtest_trades.backtest_run_id, id))
                .orderBy(desc(backtest_trades.entry_time))
                .limit(100);

            res.json({
                run: backtestRun,
                metrics: metrics || null,
                trades: trades,
                tradesCount: backtestRun.total_trades
            });
        } catch (error) {
            console.error("[ERROR] Failed to get backtest results:", error);
            res.status(500).json({ message: "Failed to get backtest results" });
        }
    });

    // Get Monte Carlo scenarios
    router.get('/api/backtest/:id/montecarlo', isAuthenticated, async (req: any, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.claims.sub;

            // Get backtest run
            const [backtestRun] = await db.select()
                .from(backtest_runs)
                .where(eq(backtest_runs.id, id));

            if (!backtestRun) {
                return res.status(404).json({ message: "Backtest not found" });
            }

            // Verify ownership
            if (backtestRun.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            // Get Monte Carlo scenarios (summary stats, not all scenarios)
            const scenarios = await db.select()
                .from(monte_carlo_scenarios)
                .where(eq(monte_carlo_scenarios.backtest_run_id, id))
                .orderBy(monte_carlo_scenarios.scenario_number)
                .limit(100);

            // Get metrics for summary
            const [metrics] = await db.select()
                .from(backtest_metrics)
                .where(eq(backtest_metrics.backtest_run_id, id));

            res.json({
                scenarios,
                summary: metrics?.monte_carlo_results || null,
                totalScenarios: scenarios.length
            });
        } catch (error) {
            console.error("[ERROR] Failed to get Monte Carlo results:", error);
            res.status(500).json({ message: "Failed to get Monte Carlo results" });
        }
    });

    // Get backtest history
    router.get('/api/backtest/history', isAuthenticated, async (req: any, res) => {
        try {
            const userId = req.user.claims.sub;
            const { limit = "20", offset = "0" } = req.query;

            const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
            const offsetNum = parseInt(offset as string, 10) || 0;

            const runs = await db.select()
                .from(backtest_runs)
                .where(eq(backtest_runs.user_id, userId))
                .orderBy(desc(backtest_runs.created_at))
                .limit(limitNum)
                .offset(offsetNum);

            res.json({
                runs,
                limit: limitNum,
                offset: offsetNum
            });
        } catch (error) {
            console.error("[ERROR] Failed to get backtest history:", error);
            res.status(500).json({ message: "Failed to get backtest history" });
        }
    });

    // Delete backtest run
    router.delete('/api/backtest/:id', isAuthenticated, async (req: any, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.claims.sub;

            // Get backtest run
            const [backtestRun] = await db.select()
                .from(backtest_runs)
                .where(eq(backtest_runs.id, id));

            if (!backtestRun) {
                return res.status(404).json({ message: "Backtest not found" });
            }

            // Verify ownership
            if (backtestRun.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            // Delete (cascades to trades, metrics, scenarios)
            await db.delete(backtest_runs)
                .where(eq(backtest_runs.id, id));

            res.json({ message: "Backtest deleted successfully" });
        } catch (error) {
            console.error("[ERROR] Failed to delete backtest:", error);
            res.status(500).json({ message: "Failed to delete backtest" });
        }
    });
}
