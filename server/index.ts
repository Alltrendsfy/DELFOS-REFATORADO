import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Seed critical data BEFORE starting server (fast, essential for API)
  log('[INFO] Seeding critical data...');
  const { seedExchanges } = await import("./services/shared/seedExchanges");
  await seedExchanges();
  
  const { seedSymbols } = await import("./services/shared/seedSymbols");
  await seedSymbols();
  log('[INFO] Critical data seeded');

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Initialize non-critical background services AFTER port is open
    log('[INFO] Starting background services...');
    
    try {
      // Start market data services
      const { startMarketDataUpdates } = await import("./services/krakenService");
      const { KrakenWebSocketManager } = await import("./services/krakenWebSocket");
      const { barsBuilderService } = await import("./services/barsBuilder");
      const { redisBarService } = await import("./services/redisBarService");
      const { schedulerService } = await import("./services/scheduler");
      const { stalenessGuardService } = await import("./services/stalenessGuardService");
      const { getCircuitBreakerService } = await import("./services/circuitBreakerService");
      const { dataRetentionService } = await import("./services/dataRetentionService");
      const { clockSyncService } = await import("./services/clockSyncService");
      const { keyRotationService } = await import("./services/keyRotationService");
      const { storage } = await import("./storage");
      
      // Check clock synchronization at startup
      await clockSyncService.startupCheck();
      clockSyncService.startPeriodicCheck(3600000); // Check every hour
      
      // Check encryption key status at startup
      await keyRotationService.startupCheck();
      keyRotationService.startPeriodicCheck(86400000); // Check daily
      
      // Create shared circuit breaker service instance
      const circuitBreakerService = getCircuitBreakerService(storage);
      
      // Start Staleness Guard Service (protects against stale data)
      stalenessGuardService.setCircuitBreakerService(circuitBreakerService);
      stalenessGuardService.start();
      
      // Start periodic market data updates (every 30 seconds)
      const marketDataInterval = startMarketDataUpdates(30000);
      
      // Start Kraken WebSocket for real-time data
      const krakenWsManager = new KrakenWebSocketManager(server);
      
      // Integrate staleness guard with WebSocket manager for individual symbol refresh
      stalenessGuardService.setRefreshSymbolCallback((symbol) => 
        krakenWsManager.refreshSymbolViaREST(symbol)
      );
      
      // Start Redis Bar Service (aggregates ticks into 1s bars in Redis)
      redisBarService.start();
      
      // Start Bars Builder Service (aggregates ticks into 1m and 1h bars)
      barsBuilderService.start();
      
      // Start Scheduler Service (auto-reset circuit breakers)
      schedulerService.start();
      
      // Start Data Retention Service (cleanup old data daily)
      dataRetentionService.start();
      
      log('[INFO] Background services started successfully');
      
      // Start Campaign Engine (autonomous trading robot)
      try {
        const { campaignEngineService } = await import("./services/trading/campaignEngineService");
        await campaignEngineService.startMainLoop();
        log('[INFO] Campaign Engine started - processing active campaigns every 5 seconds');
      } catch (engineError) {
        log(`[WARN] Campaign Engine failed to start: ${engineError}`);
      }
      
      // Cleanup on shutdown
      process.on('SIGINT', async () => {
        log('[INFO] Shutting down services...');
        const { campaignEngineService } = await import("./services/trading/campaignEngineService");
        campaignEngineService.stopMainLoop();
        stalenessGuardService.stop();
        clearInterval(marketDataInterval);
        krakenWsManager.close();
        redisBarService.stop();
        barsBuilderService.stop();
        schedulerService.stop();
        dataRetentionService.stop();
        clockSyncService.stopPeriodicCheck();
        keyRotationService.stopPeriodicCheck();
        log('[INFO] All services stopped');
        process.exit(0);
      });
    } catch (error) {
      log(`[ERROR] Failed to start background services: ${error}`);
      // Server remains running but background services are offline
    }
  });
})();
