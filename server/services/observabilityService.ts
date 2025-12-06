import { register, Gauge, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

class ObservabilityService {
  private static instance: ObservabilityService;
  
  // PnL Metrics
  public pnlPortfolio: Gauge;
  public pnlCluster: Gauge;
  public pnlAsset: Gauge;
  
  // Risk Metrics
  public var95: Gauge;
  public es95: Gauge;
  public drawdownIntraday: Gauge;
  
  // Data Quality Metrics
  public stalenessSeconds: Gauge;
  public wsLatencyMs: Histogram;
  public restRateLimitHits: Counter;
  public fallbackModeActive: Gauge;
  public fallbackPollingActive: Gauge;
  public pollingIntervalMs: Histogram;
  public quarantineStatus: Gauge;
  public restRefreshCount: Counter;
  public invalidL2Entries: Counter;
  
  // Execution Metrics
  public tradesCount: Counter;
  public fillRate: Gauge;
  public slippageBp: Histogram;
  
  // Circuit Breaker Metrics
  public breakerState: Gauge;
  
  // Performance Metrics
  public hitRate: Gauge;
  public avgWin: Gauge;
  public avgLoss: Gauge;
  public profitFactor: Gauge;
  
  private constructor() {
    // Enable default metrics (CPU, memory, etc.)
    collectDefaultMetrics({ prefix: 'delfos_' });
    
    // PnL Metrics
    this.pnlPortfolio = new Gauge({
      name: 'delfos_pnl_portfolio',
      help: 'Portfolio-level PnL (total)',
      labelNames: ['portfolio_id', 'mode']
    });
    
    this.pnlCluster = new Gauge({
      name: 'delfos_pnl_cluster',
      help: 'Cluster-level PnL',
      labelNames: ['cluster', 'portfolio_id']
    });
    
    this.pnlAsset = new Gauge({
      name: 'delfos_pnl_asset',
      help: 'Asset-level PnL',
      labelNames: ['symbol', 'portfolio_id']
    });
    
    // Risk Metrics
    this.var95 = new Gauge({
      name: 'delfos_var_95',
      help: 'Value at Risk 95th percentile',
      labelNames: ['portfolio_id']
    });
    
    this.es95 = new Gauge({
      name: 'delfos_es_95',
      help: 'Expected Shortfall 95th percentile (CVaR)',
      labelNames: ['portfolio_id']
    });
    
    this.drawdownIntraday = new Gauge({
      name: 'delfos_dd_intraday',
      help: 'Intraday drawdown percentage',
      labelNames: ['portfolio_id']
    });
    
    // Data Quality Metrics
    this.stalenessSeconds = new Gauge({
      name: 'delfos_staleness_seconds',
      help: 'Age of latest market data in seconds',
      labelNames: ['feed', 'symbol']
    });
    
    this.wsLatencyMs = new Histogram({
      name: 'delfos_latency_ws_ms',
      help: 'WebSocket message latency in milliseconds',
      labelNames: ['exchange', 'feed_type'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
    });
    
    this.restRateLimitHits = new Counter({
      name: 'delfos_rest_rate_limit_hits',
      help: 'Number of REST API rate limit hits',
      labelNames: ['exchange', 'endpoint']
    });
    
    this.fallbackModeActive = new Gauge({
      name: 'delfos_fallback_mode_active',
      help: 'Whether fallback REST mode is active (0=WebSocket, 1=REST fallback)',
      labelNames: []
    });
    
    this.pollingIntervalMs = new Histogram({
      name: 'delfos_polling_interval_ms',
      help: 'Duration of each REST polling cycle when WebSocket is down',
      buckets: [100, 500, 1000, 2000, 3000, 5000, 10000]
    });
    
    this.fallbackPollingActive = new Gauge({
      name: 'delfos_fallback_polling_active',
      help: 'Whether REST polling fallback is currently active (0=normal, 1=polling)',
      labelNames: ['exchange']
    });
    
    this.quarantineStatus = new Gauge({
      name: 'delfos_quarantine_status',
      help: 'Symbol quarantine status (0=normal, 1=quarantined)',
      labelNames: ['symbol']
    });
    
    this.restRefreshCount = new Counter({
      name: 'delfos_rest_refresh_count',
      help: 'Number of individual REST refresh attempts per symbol',
      labelNames: ['symbol', 'success']
    });
    
    this.invalidL2Entries = new Counter({
      name: 'delfos_invalid_l2_entries',
      help: 'Number of invalid L2 order book entries filtered out',
      labelNames: ['symbol', 'side', 'reason']
    });
    
    // Execution Metrics
    this.tradesCount = new Counter({
      name: 'delfos_trades_count',
      help: 'Total number of trades executed',
      labelNames: ['asset', 'side', 'portfolio_id']
    });
    
    this.fillRate = new Gauge({
      name: 'delfos_fill_rate',
      help: 'Order fill rate (percentage)',
      labelNames: ['portfolio_id']
    });
    
    this.slippageBp = new Histogram({
      name: 'delfos_slippage_bp',
      help: 'Slippage in basis points',
      labelNames: ['symbol', 'side'],
      buckets: [0, 1, 2, 5, 10, 20, 50, 100, 200]
    });
    
    // Circuit Breaker Metrics
    this.breakerState = new Gauge({
      name: 'delfos_breaker_state',
      help: 'Circuit breaker state (0=normal, 1=warning, 2=triggered)',
      labelNames: ['level', 'entity_id', 'portfolio_id']
    });
    
    // Performance Metrics
    this.hitRate = new Gauge({
      name: 'delfos_hit_rate',
      help: 'Win rate (percentage of winning trades)',
      labelNames: ['portfolio_id']
    });
    
    this.avgWin = new Gauge({
      name: 'delfos_avg_win',
      help: 'Average win amount',
      labelNames: ['portfolio_id']
    });
    
    this.avgLoss = new Gauge({
      name: 'delfos_avg_loss',
      help: 'Average loss amount',
      labelNames: ['portfolio_id']
    });
    
    this.profitFactor = new Gauge({
      name: 'delfos_profit_factor',
      help: 'Profit factor (total wins / total losses)',
      labelNames: ['portfolio_id']
    });
  }
  
  public static getInstance(): ObservabilityService {
    if (!ObservabilityService.instance) {
      ObservabilityService.instance = new ObservabilityService();
    }
    return ObservabilityService.instance;
  }
  
  public getMetrics(): Promise<string> {
    return register.metrics();
  }
  
  public clearMetrics(): void {
    register.clear();
  }
  
  // Helper methods for common operations
  public recordWebSocketLatency(exchange: string, feedType: string, latencyMs: number): void {
    this.wsLatencyMs.observe({ exchange, feed_type: feedType }, latencyMs);
  }
  
  public updateStaleness(feed: string, symbol: string, ageSeconds: number): void {
    this.stalenessSeconds.set({ feed, symbol }, ageSeconds);
  }
  
  public recordTrade(asset: string, side: string, portfolioId: string): void {
    this.tradesCount.inc({ asset, side, portfolio_id: portfolioId });
  }
  
  public recordSlippage(symbol: string, side: string, slippageBp: number): void {
    this.slippageBp.observe({ symbol, side }, slippageBp);
  }
  
  public updatePortfolioPnL(portfolioId: string, mode: string, pnl: number): void {
    this.pnlPortfolio.set({ portfolio_id: portfolioId, mode }, pnl);
  }
  
  public updateClusterPnL(cluster: string, portfolioId: string, pnl: number): void {
    this.pnlCluster.set({ cluster, portfolio_id: portfolioId }, pnl);
  }
  
  public updateAssetPnL(symbol: string, portfolioId: string, pnl: number): void {
    this.pnlAsset.set({ symbol, portfolio_id: portfolioId }, pnl);
  }
  
  public updateVaR95(portfolioId: string, value: number): void {
    this.var95.set({ portfolio_id: portfolioId }, value);
  }
  
  public updateES95(portfolioId: string, value: number): void {
    this.es95.set({ portfolio_id: portfolioId }, value);
  }
  
  public updateDrawdown(portfolioId: string, value: number): void {
    this.drawdownIntraday.set({ portfolio_id: portfolioId }, value);
  }
  
  public updateFallbackMode(isActive: boolean): void {
    this.fallbackModeActive.set({}, isActive ? 1 : 0);
  }
  
  public updateQuarantineStatus(symbol: string, isQuarantined: boolean): void {
    this.quarantineStatus.set({ symbol }, isQuarantined ? 1 : 0);
  }
  
  public recordRestRefresh(symbol: string, success: boolean): void {
    this.restRefreshCount.inc({ symbol, success: success ? 'true' : 'false' });
  }
  
  public updateBreakerState(level: string, entityId: string, portfolioId: string, state: number): void {
    this.breakerState.set({ level, entity_id: entityId, portfolio_id: portfolioId }, state);
  }
  
  public updatePerformanceMetrics(portfolioId: string, metrics: {
    hitRate?: number;
    avgWin?: number;
    avgLoss?: number;
    profitFactor?: number;
    fillRate?: number;
  }): void {
    if (metrics.hitRate !== undefined) {
      this.hitRate.set({ portfolio_id: portfolioId }, metrics.hitRate);
    }
    if (metrics.avgWin !== undefined) {
      this.avgWin.set({ portfolio_id: portfolioId }, metrics.avgWin);
    }
    if (metrics.avgLoss !== undefined) {
      this.avgLoss.set({ portfolio_id: portfolioId }, metrics.avgLoss);
    }
    if (metrics.profitFactor !== undefined) {
      this.profitFactor.set({ portfolio_id: portfolioId }, metrics.profitFactor);
    }
    if (metrics.fillRate !== undefined) {
      this.fillRate.set({ portfolio_id: portfolioId }, metrics.fillRate);
    }
  }
}

export const observabilityService = ObservabilityService.getInstance();
