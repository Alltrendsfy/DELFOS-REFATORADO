import { Router, Request, Response } from "express";
import { isAuthenticated } from "../../replitAuth";
import { storage } from "../../storage";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { learning_runs } from "@shared/schema";
import {
    getChatCompletion,
    checkRateLimit,
    analyzeMarket,
    type MarketContext,
    type ChatMessage
} from "../../services/openaiService";
import {
    analyzeRankings,
    analyzeClusters,
    suggestTradingStrategy,
    analyzeRiskProfile,
    suggestCampaignRisk,
    type CampaignContext
} from "../../services/ai/aiAnalysisService";
import { campaignPatternLearnerService } from "../../services/ai/campaignPatternLearnerService";
import { opportunityLearnerService } from "../../services/ai/opportunityLearnerService";
import { db } from "../../db";

// Helper function to validate query limit parameters
const MAX_QUERY_LIMIT = 10000;
function validateQueryLimit(limit: unknown): number | undefined {
    if (!limit) return undefined;

    const num = Number(limit);
    if (!Number.isInteger(num) || !Number.isSafeInteger(num) || num <= 0 || num > MAX_QUERY_LIMIT) {
        throw new Error(`Invalid limit parameter (must be a positive integer ≤ ${MAX_QUERY_LIMIT})`);
    }

    return num;
}

export function registerAiRoutes(router: Router) {
    const aiChatSchema = z.object({
        message: z.string().min(1, "Message is required"),
        useAdvancedModel: z.boolean().optional().default(false),
    });

    // AI Assistant routes
    router.post('/api/ai/chat', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Validate request body with Zod
            const validationResult = aiChatSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid chat data",
                    errors: validationResult.error.errors
                });
            }

            const { message, useAdvancedModel } = validationResult.data;

            // Check rate limit
            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            // Get market context
            const marketData = await storage.getAllMarketData();
            const marketContext: MarketContext[] = marketData.slice(0, 10).map(data => ({
                symbol: data.symbol,
                price: data.current_price,
                change24h: data.change_24h_percentage,
                volume24h: data.volume_24h,
            }));

            // Get AI response
            const response = await getChatCompletion(
                [{ role: "user", content: message }],
                userId,
                marketContext,
                useAdvancedModel
            );

            // Save conversation to database
            await storage.createConversation({
                user_id: userId,
                user_message: message,
                ai_response: response,
                model_used: useAdvancedModel ? "gpt-4o" : "gpt-4o-mini",
                tokens_used: 0, // TODO: extract from OpenAI response
                market_symbols: marketContext.map(m => m.symbol),
            });

            res.json({ response, marketContext });
        } catch (error: any) {
            console.error("Error in AI chat:", error);
            res.status(500).json({ message: error.message || "Failed to get AI response" });
        }
    });

    router.get('/api/ai/analyze', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Check rate limit
            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            // Get market context
            const marketData = await storage.getAllMarketData();
            const marketContext: MarketContext[] = marketData.map(data => ({
                symbol: data.symbol,
                price: data.current_price,
                change24h: data.change_24h_percentage,
                volume24h: data.volume_24h,
            }));

            const symbols = marketContext.map(m => m.symbol);

            // Get AI analysis
            const analysis = await analyzeMarket(userId, symbols, marketContext);

            // Save to database
            await storage.createConversation({
                user_id: userId,
                user_message: "Análise automática de mercado",
                ai_response: analysis,
                model_used: "gpt-4o-mini",
                tokens_used: 0,
                market_symbols: symbols,
            });

            res.json({ analysis, marketContext });
        } catch (error: any) {
            console.error("Error in market analysis:", error);
            res.status(500).json({ message: error.message || "Failed to analyze market" });
        }
    });

    router.get('/api/ai/history', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const limit = req.query.limit ? validateQueryLimit(req.query.limit) : 20;

            const conversations = await storage.getConversationsByUserId(userId, limit);
            res.json(conversations);
        } catch (error: any) {
            if (error.message?.includes('Invalid limit')) {
                return res.status(400).json({ message: error.message });
            }
            console.error("Error fetching conversation history:", error);
            res.status(500).json({ message: "Failed to fetch conversation history" });
        }
    });

    // AI specialized analysis endpoints
    router.get('/api/ai/rankings-insight', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Check rate limit
            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            // Get latest run_id
            const runId = await storage.getLatestRunId();
            if (!runId) {
                return res.status(404).json({ message: "Nenhuma seleção de ativos encontrada. Execute a seleção primeiro." });
            }

            // Get rankings analysis
            const result = await analyzeRankings(userId, storage, runId);

            // Save to database
            await storage.createConversation({
                user_id: userId,
                user_message: "Análise automática de rankings de ativos",
                ai_response: result.analysis,
                model_used: "gpt-4o-mini",
                tokens_used: 0,
                market_symbols: result.symbols || [],
            });

            res.json(result);
        } catch (error: any) {
            console.error("Error in rankings analysis:", error);
            res.status(500).json({ message: error.message || "Failed to analyze rankings" });
        }
    });

    router.get('/api/ai/cluster-insight', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Check rate limit
            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            // Get latest run_id
            const runId = await storage.getLatestRunId();
            if (!runId) {
                return res.status(404).json({ message: "Nenhuma seleção de ativos encontrada. Execute a seleção primeiro." });
            }

            // Get cluster analysis
            const result = await analyzeClusters(userId, storage, runId);

            // Save to database
            await storage.createConversation({
                user_id: userId,
                user_message: "Análise automática de clusters K-means",
                ai_response: result.analysis,
                model_used: "gpt-4o-mini",
                tokens_used: 0,
                market_symbols: result.symbols || [],
            });

            res.json(result);
        } catch (error: any) {
            console.error("Error in cluster analysis:", error);
            res.status(500).json({ message: error.message || "Failed to analyze clusters" });
        }
    });

    router.post('/api/ai/strategy', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Validate request body
            const strategySchema = z.object({
                query: z.string().min(1, "Query is required"),
                riskProfile: z.enum(['conservative', 'moderate', 'aggressive']).optional().default('moderate'),
            });

            const validationResult = strategySchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    message: "Invalid request data",
                    errors: validationResult.error.errors
                });
            }

            const { query, riskProfile } = validationResult.data;

            // Check rate limit
            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            // Get latest run_id
            const runId = await storage.getLatestRunId();
            if (!runId) {
                return res.status(404).json({ message: "Nenhuma seleção de ativos encontrada. Execute a seleção primeiro." });
            }

            // Get strategy suggestion
            const result = await suggestTradingStrategy(userId, query, storage, runId, riskProfile);

            // Save to database
            await storage.createConversation({
                user_id: userId,
                user_message: `Sugestão de estratégia (${riskProfile}): ${query}`,
                ai_response: result.analysis,
                model_used: "gpt-4o-mini",
                tokens_used: 0,
                market_symbols: result.symbols || [],
            });

            res.json(result);
        } catch (error: any) {
            console.error("Error in strategy suggestion:", error);
            res.status(500).json({ message: error.message || "Failed to suggest strategy" });
        }
    });

    router.get('/api/ai/risk', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            // Check rate limit
            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            // Get risk analysis
            const result = await analyzeRiskProfile(userId, storage);

            // Save to database
            await storage.createConversation({
                user_id: userId,
                user_message: "Análise automática de perfil de risco",
                ai_response: result.analysis,
                model_used: "gpt-4o-mini",
                tokens_used: 0,
                market_symbols: [],
            });

            res.json(result);
        } catch (error: any) {
            console.error("Error in risk analysis:", error);
            res.status(500).json({ message: error.message || "Failed to analyze risk" });
        }
    });

    const campaignRiskSuggestionSchema = z.object({
        initialCapital: z.number().positive("Initial capital must be positive"),
        tradingMode: z.enum(['paper', 'live']),
        duration: z.number().int().min(1).max(365).optional().default(30),
        portfolioName: z.string().optional()
    });

    router.post('/api/ai/campaign-risk-suggestion', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            const parseResult = campaignRiskSuggestionSchema.safeParse(req.body);
            if (!parseResult.success) {
                return res.status(400).json({
                    message: "Invalid request parameters",
                    errors: parseResult.error.flatten().fieldErrors
                });
            }

            const { initialCapital, tradingMode, duration, portfolioName } = parseResult.data;

            const context: CampaignContext = {
                initialCapital,
                tradingMode,
                duration,
                portfolioName: portfolioName || undefined
            };

            const suggestion = await suggestCampaignRisk(userId, context);

            res.json(suggestion);
        } catch (error: any) {
            console.error("Error in campaign risk suggestion:", error);
            res.status(500).json({ message: error.message || "Failed to suggest campaign risk parameters" });
        }
    });

    // Campaign Step Advice - AI coaching for each wizard step
    const campaignStepAdviceSchema = z.object({
        step: z.enum(['market_brief', 'basics', 'mode', 'portfolio', 'assets', 'risk', 'review']),
        context: z.object({
            name: z.string().optional(),
            initialCapital: z.number().optional(),
            duration: z.number().optional(),
            tradingMode: z.enum(['paper', 'live']).optional(),
            portfolioName: z.string().optional(),
            maxDrawdown: z.number().optional(),
            marketStatus: z.string().optional(),
            volatilityLevel: z.string().optional(),
        }).optional(),
        language: z.enum(['en', 'es', 'pt-BR']).optional().default('pt-BR')
    });

    router.post('/api/ai/campaign-step-advice', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            const parseResult = campaignStepAdviceSchema.safeParse(req.body);
            if (!parseResult.success) {
                return res.status(400).json({
                    message: "Invalid request parameters",
                    errors: parseResult.error.flatten().fieldErrors
                });
            }

            const { step, context, language } = parseResult.data;

            // Build contextual prompt based on step
            const stepPrompts: Record<string, string> = {
                market_brief: `Current market conditions for starting a trading campaign. Market status: ${context?.marketStatus || 'unknown'}. Volatility: ${context?.volatilityLevel || 'moderate'}.`,
                basics: `Setting up campaign basics. Name: ${context?.name || 'not set'}. Capital: $${context?.initialCapital || 0}. Duration: ${context?.duration || 30} days.`,
                mode: `Choosing trading mode. Current selection: ${context?.tradingMode || 'paper'}. This affects real money vs simulation.`,
                portfolio: `Selecting portfolio for campaign. Portfolio: ${context?.portfolioName || 'not selected'}.`,
                assets: `Asset selection for trading. The system automatically selects best assets using K-means clustering.`,
                risk: `Configuring risk parameters. Max drawdown: ${context?.maxDrawdown || 10}%. Volatility level: ${context?.volatilityLevel || 'moderate'}.`,
                review: `Final review before launching. Capital: $${context?.initialCapital || 0}, Mode: ${context?.tradingMode || 'paper'}, Duration: ${context?.duration || 30} days, Max Drawdown: ${context?.maxDrawdown || 10}%.`
            };

            const languageInstructions: Record<string, string> = {
                'en': 'Respond in English. Use simple, clear language.',
                'es': 'Responde en espanol. Usa lenguaje simple y claro.',
                'pt-BR': 'Responda em portugues brasileiro. Use linguagem simples e clara.'
            };

            const systemPrompt = `You are DELFOS AI, a friendly trading assistant helping users set up their cryptocurrency trading campaigns. 
${languageInstructions[language]}
Keep responses under 100 words.
Be encouraging but realistic about risks.
Focus on practical advice for the current step.`;

            const userPrompt = `The user is on the "${step}" step of campaign setup.
Context: ${stepPrompts[step] || 'General campaign setup'}
Provide a brief, helpful tip for this step. Include one specific actionable suggestion.`;

            const messages: ChatMessage[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const response = await getChatCompletion(messages, userId);

            res.json({
                step,
                advice: response,
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            console.error("Error in campaign step advice:", error);
            res.status(500).json({ message: error.message || "Failed to get step advice" });
        }
    });

    // Campaign Summary - AI narrative recap with pros/cons
    const campaignSummarySchema = z.object({
        name: z.string(),
        initialCapital: z.number().positive(),
        duration: z.number().int().min(1).max(365),
        tradingMode: z.enum(['paper', 'live']),
        portfolioName: z.string(),
        maxDrawdown: z.number().min(1).max(50),
        marketStatus: z.string().optional(),
        volatilityLevel: z.string().optional(),
        totalAssets: z.number().optional(),
        clusterCount: z.number().optional(),
        language: z.enum(['en', 'es', 'pt-BR']).optional().default('pt-BR')
    });

    router.post('/api/ai/campaign-summary', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            const parseResult = campaignSummarySchema.safeParse(req.body);
            if (!parseResult.success) {
                return res.status(400).json({
                    message: "Invalid request parameters",
                    errors: parseResult.error.flatten().fieldErrors
                });
            }

            const config = parseResult.data;

            const languageInstructions: Record<string, string> = {
                'en': 'Respond in English.',
                'es': 'Responde en espanol.',
                'pt-BR': 'Responda em portugues brasileiro.'
            };

            const systemPrompt = `You are DELFOS AI, a professional trading assistant.
${languageInstructions[config.language]}
Provide a balanced, honest analysis.
Format your response as JSON with these fields:
- summary: A 2-3 sentence executive summary
- pros: Array of 3 advantages of this configuration
- cons: Array of 2-3 potential risks or considerations
- overallScore: A score from 1-10 rating this campaign setup
- recommendation: A single actionable recommendation`;

            const userPrompt = `Analyze this trading campaign configuration:
- Campaign Name: ${config.name}
- Initial Capital: $${config.initialCapital}
- Duration: ${config.duration} days
- Trading Mode: ${config.tradingMode === 'live' ? 'LIVE (real money)' : 'PAPER (simulation)'}
- Portfolio: ${config.portfolioName}
- Max Drawdown Limit: ${config.maxDrawdown}%
- Market Status: ${config.marketStatus || 'normal'}
- Volatility Level: ${config.volatilityLevel || 'moderate'}
- Assets to Trade: ${config.totalAssets || 30} across ${config.clusterCount || 5} clusters

Provide your analysis as valid JSON.`;

            const messages: ChatMessage[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const response = await getChatCompletion(messages, userId);

            // Try to parse as JSON, fallback to text if needed
            let analysis;
            try {
                // Remove markdown code blocks if present
                const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                analysis = JSON.parse(cleanResponse);
            } catch {
                analysis = {
                    summary: response,
                    pros: [],
                    cons: [],
                    overallScore: 7,
                    recommendation: 'Review the configuration and proceed when ready.'
                };
            }

            res.json({
                ...analysis,
                config: {
                    name: config.name,
                    initialCapital: config.initialCapital,
                    duration: config.duration,
                    tradingMode: config.tradingMode,
                    maxDrawdown: config.maxDrawdown,
                },
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            console.error("Error in campaign summary:", error);
            res.status(500).json({ message: error.message || "Failed to generate campaign summary" });
        }
    });

    // ============================================================================
    // AI LEARNING ENDPOINTS
    // ============================================================================

    const campaignLearningSchema = z.object({
        scope: z.enum(['global', 'portfolio', 'campaign']),
        portfolioId: z.string().optional(),
        campaignId: z.string().optional(),
        windowDays: z.number().int().min(7).max(365).optional().default(30),
    });

    router.post('/api/ai/learning/campaign/analyze', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            const parseResult = campaignLearningSchema.safeParse(req.body);
            if (!parseResult.success) {
                return res.status(400).json({
                    message: "Invalid request parameters",
                    errors: parseResult.error.flatten().fieldErrors
                });
            }

            const { scope, portfolioId, campaignId, windowDays } = parseResult.data;

            if (portfolioId) {
                const portfolio = await storage.getPortfolio(portfolioId);
                if (!portfolio) {
                    return res.status(404).json({ message: "Portfolio not found" });
                }
                if (portfolio.user_id !== userId) {
                    return res.status(403).json({ message: "Access denied" });
                }
            }

            if (campaignId) {
                const campaign = await storage.getCampaign(campaignId);
                if (!campaign) {
                    return res.status(404).json({ message: "Campaign not found" });
                }
                const portfolio = await storage.getPortfolio(campaign.portfolio_id);
                if (!portfolio || portfolio.user_id !== userId) {
                    return res.status(403).json({ message: "Access denied" });
                }
            }

            const run = await campaignPatternLearnerService.runAnalysis({
                scope,
                portfolioId,
                campaignId,
                userId,
                windowDays,
            });

            res.json({
                runId: run.id,
                status: run.status,
                patternsDiscovered: run.patterns_discovered,
                patternsUpdated: run.patterns_updated,
                message: "Analysis started successfully",
            });
        } catch (error: any) {
            console.error("Error in campaign pattern analysis:", error);
            res.status(500).json({ message: error.message || "Failed to run pattern analysis" });
        }
    });

    router.get('/api/ai/learning/campaign/patterns', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { scope, portfolioId, campaignId, patternType } = req.query;

            if (campaignId) {
                const campaign = await storage.getCampaign(campaignId as string);
                if (!campaign) {
                    return res.status(404).json({ message: "Campaign not found" });
                }
                const portfolio = await storage.getPortfolio(campaign.portfolio_id);
                if (!portfolio || portfolio.user_id !== userId) {
                    return res.status(403).json({ message: "Access denied" });
                }
            }

            if (portfolioId) {
                const portfolio = await storage.getPortfolio(portfolioId as string);
                if (!portfolio) {
                    return res.status(404).json({ message: "Portfolio not found" });
                }
                if (portfolio.user_id !== userId) {
                    return res.status(403).json({ message: "Access denied" });
                }
            }

            if (scope === 'portfolio' && !portfolioId) {
                return res.status(400).json({ message: "portfolioId required for portfolio scope" });
            }
            if (scope === 'campaign' && !campaignId) {
                return res.status(400).json({ message: "campaignId required for campaign scope" });
            }

            const patterns = await campaignPatternLearnerService.getActivePatterns({
                scope: scope as string,
                portfolioId: portfolioId as string,
                campaignId: campaignId as string,
                patternType: patternType as any,
            });

            res.json({ patterns, count: patterns.length });
        } catch (error: any) {
            console.error("Error fetching campaign patterns:", error);
            res.status(500).json({ message: error.message || "Failed to fetch patterns" });
        }
    });

    router.get('/api/ai/learning/campaign/:campaignId/recommendations', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { campaignId } = req.params;

            const campaign = await storage.getCampaign(campaignId);
            if (!campaign) {
                return res.status(404).json({ message: "Campaign not found" });
            }

            const portfolio = await storage.getPortfolio(campaign.portfolio_id);
            if (!portfolio || portfolio.user_id !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }

            const recommendations = await campaignPatternLearnerService.getRecommendations(campaignId);

            res.json(recommendations);
        } catch (error: any) {
            console.error("Error fetching recommendations:", error);
            res.status(500).json({ message: error.message || "Failed to fetch recommendations" });
        }
    });

    const opportunityLearningSchema = z.object({
        scope: z.enum(['global', 'portfolio', 'user']),
        portfolioId: z.string().optional(),
        windowDays: z.number().int().min(7).max(365).optional().default(60),
    });

    router.post('/api/ai/learning/opportunity/analyze', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            const rateLimitCheck = checkRateLimit(userId);
            if (!rateLimitCheck.allowed) {
                return res.status(429).json({ message: rateLimitCheck.message });
            }

            const parseResult = opportunityLearningSchema.safeParse(req.body);
            if (!parseResult.success) {
                return res.status(400).json({
                    message: "Invalid request parameters",
                    errors: parseResult.error.flatten().fieldErrors
                });
            }

            const { scope, portfolioId, windowDays } = parseResult.data;

            if (portfolioId) {
                const portfolio = await storage.getPortfolio(portfolioId);
                if (!portfolio) {
                    return res.status(404).json({ message: "Portfolio not found" });
                }
                if (portfolio.user_id !== userId) {
                    return res.status(403).json({ message: "Access denied" });
                }
            }

            const run = await opportunityLearnerService.runAnalysis({
                scope,
                userId,
                portfolioId,
                windowDays,
            });

            res.json({
                runId: run.id,
                status: run.status,
                patternsDiscovered: run.patterns_discovered,
                patternsUpdated: run.patterns_updated,
                message: "Analysis started successfully",
            });
        } catch (error: any) {
            console.error("Error in opportunity pattern analysis:", error);
            res.status(500).json({ message: error.message || "Failed to run pattern analysis" });
        }
    });

    router.get('/api/ai/learning/opportunity/patterns', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { scope, portfolioId, patternType } = req.query;

            if (portfolioId) {
                const portfolio = await storage.getPortfolio(portfolioId as string);
                if (!portfolio) {
                    return res.status(404).json({ message: "Portfolio not found" });
                }
                if (portfolio.user_id !== userId) {
                    return res.status(403).json({ message: "Access denied" });
                }
            }

            if (scope === 'portfolio' && !portfolioId) {
                return res.status(400).json({ message: "portfolioId required for portfolio scope" });
            }

            const effectiveUserId = scope === 'user' ? userId : undefined;

            const patterns = await opportunityLearnerService.getActivePatterns({
                scope: scope as string,
                userId: effectiveUserId,
                portfolioId: portfolioId as string,
                patternType: patternType as any,
            });

            res.json({ patterns, count: patterns.length });
        } catch (error: any) {
            console.error("Error fetching opportunity patterns:", error);
            res.status(500).json({ message: error.message || "Failed to fetch patterns" });
        }
    });

    router.get('/api/ai/learning/opportunity/calibration', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;

            const calibration = await opportunityLearnerService.getScoringCalibration(userId);

            res.json(calibration);
        } catch (error: any) {
            console.error("Error fetching scoring calibration:", error);
            res.status(500).json({ message: error.message || "Failed to fetch calibration" });
        }
    });

    router.get('/api/ai/learning/runs', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { learnerType, limit } = req.query;

            let conditions = [eq(learning_runs.user_id, userId)];

            if (learnerType) {
                conditions.push(eq(learning_runs.learner_type, learnerType as string));
            }

            const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

            const runs = await db.select()
                .from(learning_runs)
                .where(whereClause)
                .orderBy(desc(learning_runs.started_at))
                .limit(parseInt(limit as string) || 20);

            res.json({ runs, count: runs.length });
        } catch (error: any) {
            console.error("Error fetching learning runs:", error);
            res.status(500).json({ message: error.message || "Failed to fetch learning runs" });
        }
    });
}
