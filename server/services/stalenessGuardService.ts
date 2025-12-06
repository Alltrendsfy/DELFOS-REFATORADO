import { DataIngestionService } from './dataIngestionService';
import { observabilityService } from './observabilityService';
import { getKrakenPairsForWebSocket } from './krakenService';
import { CircuitBreakerService } from './circuitBreakerService';
import type { IStorage } from '../storage';

export type StalenessLevel = 'fresh' | 'warn' | 'hard' | 'kill_switch';

export interface StalenessStatus {
  symbol: string;
  level: StalenessLevel;
  ageSeconds: number;
  lastUpdate: number;
  dataType: 'l1' | 'l2' | 'ticks';
}

export interface StalenessConfig {
  warnThresholdSeconds: number;
  hardThresholdSeconds: number;
  killSwitchSeconds: number;
}

class StalenessGuardService {
  private dataIngestion: DataIngestionService;
  private circuitBreakerService: CircuitBreakerService | null = null;
  private config: StalenessConfig;
  private killSwitchActive: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  
  // Auto-quarantine system: symbols that never receive data (>5min stale)
  // are automatically quarantined and don't count toward global kill switch
  private quarantinedSymbols: Map<string, number> = new Map(); // symbol -> quarantine timestamp
  private readonly QUARANTINE_THRESHOLD_SECONDS = 300; // 5 minutes
  private readonly RECOVERY_CHECK_SECONDS = 30; // Check quarantine recovery every 30s
  
  // REST refresh callback: allows external service to refresh individual symbols
  private refreshSymbolCallback: ((symbol: string) => Promise<boolean>) | null = null;
  
  // Track ongoing refresh attempts to prevent duplicates
  private refreshInProgress: Map<string, number> = new Map(); // symbol -> start timestamp
  private readonly REFRESH_TIMEOUT_MS = 10000; // 10 second timeout for individual refresh
  
  // Track symbols that should be permanently removed (unsupported pairs)
  private unsupportedSymbols: Set<string> = new Set();

  constructor() {
    this.dataIngestion = new DataIngestionService();
    
    // Adjusted thresholds to accommodate REST fallback batching (Item 7 modification)
    // Original: warn 3s, hard 10s, kill 60s
    // Updated: warn 4s (allows batching ~3.5s), hard 12s, kill 60s (unchanged)
    this.config = {
      warnThresholdSeconds: 4,
      hardThresholdSeconds: 12,
      killSwitchSeconds: 60,
    };
  }

  start() {
    console.log('🛡️  Starting Staleness Guard Service...');
    console.log(`   - WARN threshold: ${this.config.warnThresholdSeconds}s (block new positions)`);
    console.log(`   - HARD threshold: ${this.config.hardThresholdSeconds}s (zero signals)`);
    console.log(`   - KILL_SWITCH threshold: ${this.config.killSwitchSeconds}s (pause global)`);
    
    // Check staleness every 2 seconds
    this.checkInterval = setInterval(() => {
      this.checkGlobalStaleness();
    }, 2000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('🛑 Staleness Guard Service stopped');
  }

  updateConfig(config: Partial<StalenessConfig>) {
    this.config = { ...this.config, ...config };
    console.log('⚙️  Staleness Guard config updated:', this.config);
  }

  // Register circuit breaker service for staleness-based breakers
  setCircuitBreakerService(service: CircuitBreakerService) {
    this.circuitBreakerService = service;
    console.log('✅ Circuit Breaker Service registered for staleness guard');
  }

  // Register callback for individual symbol refresh via REST
  setRefreshSymbolCallback(callback: (symbol: string) => Promise<boolean>) {
    this.refreshSymbolCallback = callback;
    console.log('✅ REST refresh callback registered for staleness guard');
  }

  // Mark symbol as unsupported (called when Kraken rejects with "pair not supported")
  markAsUnsupported(symbol: string) {
    if (!this.unsupportedSymbols.has(symbol)) {
      this.unsupportedSymbols.add(symbol);
      console.warn(`🚫 Marked ${symbol} as unsupported - will be excluded from tracking`);
      
      // Also quarantine immediately to stop further processing
      if (!this.quarantinedSymbols.has(symbol)) {
        this.quarantinedSymbols.set(symbol, Date.now());
      }
    }
  }

  async checkDataStaleness(
    exchange: string,
    symbol: string,
    dataType: 'l1' | 'l2' | 'ticks'
  ): Promise<StalenessStatus> {
    const now = Date.now();
    let lastUpdate = 0;

    try {
      if (dataType === 'l1') {
        const l1 = await this.dataIngestion.getL1Quote(exchange, symbol);
        lastUpdate = l1?.exchange_ts ? parseInt(l1.exchange_ts) : 0;
      } else if (dataType === 'l2') {
        // Try L2 explicit timestamp first, fall back to ticks if not available
        const l2Timestamp = await this.dataIngestion.getL2Timestamp(exchange, symbol);
        if (l2Timestamp) {
          lastUpdate = l2Timestamp;
        } else {
          // Fallback: use ticks as proxy when L2 timestamp unavailable
          const ticks = await this.dataIngestion.getRecentTicks(exchange, symbol, 1);
          lastUpdate = ticks[0]?.exchange_ts || 0;
        }
      } else if (dataType === 'ticks') {
        const ticks = await this.dataIngestion.getRecentTicks(exchange, symbol, 1);
        lastUpdate = ticks[0]?.exchange_ts || 0;
      }

      const ageSeconds = lastUpdate > 0 ? (now - lastUpdate) / 1000 : 999;
      
      const level = this.determineStalenessLevel(ageSeconds);

      // Record staleness metric
      observabilityService.updateStaleness(dataType, symbol, ageSeconds);

      return {
        symbol,
        level,
        ageSeconds,
        lastUpdate,
        dataType,
      };
    } catch (error) {
      console.error(`Error checking staleness for ${symbol}:`, error);
      
      // On error, assume worst case
      return {
        symbol,
        level: 'kill_switch',
        ageSeconds: 999,
        lastUpdate: 0,
        dataType,
      };
    }
  }

  private determineStalenessLevel(ageSeconds: number): StalenessLevel {
    if (ageSeconds >= this.config.killSwitchSeconds) {
      return 'kill_switch';
    } else if (ageSeconds >= this.config.hardThresholdSeconds) {
      return 'hard';
    } else if (ageSeconds >= this.config.warnThresholdSeconds) {
      return 'warn';
    } else {
      return 'fresh';
    }
  }

  async canOpenPosition(exchange: string, symbol: string): Promise<{
    allowed: boolean;
    reason?: string;
    stalenessLevel: StalenessLevel;
    ageSeconds: number;
  }> {
    // Check kill switch first
    if (this.killSwitchActive) {
      return {
        allowed: false,
        reason: 'Global kill switch active - data staleness exceeded 60s',
        stalenessLevel: 'kill_switch',
        ageSeconds: 999,
      };
    }

    // Check L1 data staleness (most critical for trading)
    const l1Status = await this.checkDataStaleness(exchange, symbol, 'l1');

    if (l1Status.level === 'kill_switch') {
      return {
        allowed: false,
        reason: `Data too stale (${l1Status.ageSeconds.toFixed(1)}s > ${this.config.killSwitchSeconds}s) - kill switch`,
        stalenessLevel: l1Status.level,
        ageSeconds: l1Status.ageSeconds,
      };
    }

    if (l1Status.level === 'hard') {
      return {
        allowed: false,
        reason: `Data stale (${l1Status.ageSeconds.toFixed(1)}s > ${this.config.hardThresholdSeconds}s) - hard limit`,
        stalenessLevel: l1Status.level,
        ageSeconds: l1Status.ageSeconds,
      };
    }

    if (l1Status.level === 'warn') {
      return {
        allowed: false,
        reason: `Data staleness warning (${l1Status.ageSeconds.toFixed(1)}s > ${this.config.warnThresholdSeconds}s) - blocking new positions`,
        stalenessLevel: l1Status.level,
        ageSeconds: l1Status.ageSeconds,
      };
    }

    // Data is fresh, allow trading
    return {
      allowed: true,
      stalenessLevel: 'fresh',
      ageSeconds: l1Status.ageSeconds,
    };
  }

  async shouldZeroSignals(exchange: string, symbol: string): Promise<boolean> {
    const status = await this.checkDataStaleness(exchange, symbol, 'l1');
    return status.level === 'hard' || status.level === 'kill_switch';
  }

  isKillSwitchActive(): boolean {
    return this.killSwitchActive;
  }

  private async checkGlobalStaleness() {
    // This runs periodically to check if we should activate/deactivate global kill switch
    // Auto-quarantine system: symbols >5min stale are quarantined and don't count toward kill switch
    let trackedSymbols: string[];
    
    try {
      const allSymbols = await getKrakenPairsForWebSocket();
      
      // Filter out unsupported symbols
      trackedSymbols = allSymbols.filter(s => !this.unsupportedSymbols.has(s));
      
      if (trackedSymbols.length === 0) {
        console.warn('⚠️  No tracked symbols found for staleness check');
        return;
      }
      
      if (this.unsupportedSymbols.size > 0) {
        console.log(`ℹ️  Excluded ${this.unsupportedSymbols.size} unsupported symbols from staleness check`);
      }
    } catch (error) {
      console.error('❌ Failed to get tracked symbols for staleness check:', error);
      return;
    }

    let maxStaleness = 0;
    let killSwitchCount = 0;
    let newlyQuarantined: string[] = [];
    let recovered: string[] = [];
    let needsRefresh: string[] = [];
    
    // Parallelize staleness checks in chunks to reduce sweep time
    const CHUNK_SIZE = 20; // Process 20 symbols at once
    const chunks: string[][] = [];
    for (let i = 0; i < trackedSymbols.length; i += CHUNK_SIZE) {
      chunks.push(trackedSymbols.slice(i, i + CHUNK_SIZE));
    }
    
    // Process all chunks in parallel
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (symbol) => {
          // Check both L1 and L2 timestamps - use the FRESHEST data available
          const [l1Status, l2Status] = await Promise.all([
            this.checkDataStaleness('kraken', symbol, 'l1'),
            this.checkDataStaleness('kraken', symbol, 'l2'),
          ]);
          
          // Use the freshest timestamp (lowest age) to avoid false positives
          const status = l1Status.ageSeconds < l2Status.ageSeconds ? l1Status : l2Status;
          return { symbol, status };
        })
      );
      
      // Process chunk results with quarantine logic
      for (const { symbol, status } of chunkResults) {
        const isQuarantined = this.quarantinedSymbols.has(symbol);
        
        // Auto-quarantine: symbols >5min stale go to quarantine
        if (status.ageSeconds >= this.QUARANTINE_THRESHOLD_SECONDS && !isQuarantined) {
          this.quarantinedSymbols.set(symbol, Date.now());
          newlyQuarantined.push(symbol);
          
          // Record quarantine metrics
          observabilityService.updateBreakerState('symbol', 'quarantine', symbol, 1);
          observabilityService.updateQuarantineStatus(symbol, true);
          continue; // Skip this symbol from kill switch calculation
        }
        
        // Auto-recovery: if symbol in quarantine but now fresh, remove from quarantine
        if (isQuarantined && status.level === 'fresh') {
          this.quarantinedSymbols.delete(symbol);
          recovered.push(symbol);
          
          // Record recovery metrics (back to normal state)
          observabilityService.updateBreakerState('symbol', 'quarantine', symbol, 0);
          observabilityService.updateQuarantineStatus(symbol, false);
          
          // Reset staleness to 0 to ensure clean re-entry to active tracking
          observabilityService.updateStaleness('l1', symbol, 0);
          observabilityService.updateStaleness('l2', symbol, 0);
        }
        
        // Skip quarantined symbols from kill switch calculation
        if (this.quarantinedSymbols.has(symbol)) {
          continue;
        }
        
        // Individual symbol REST refresh: if symbol >WARN but not in quarantine/unsupported
        // and refresh callback is registered, try to refresh via REST
        if (status.level === 'warn' && this.refreshSymbolCallback && !needsRefresh.includes(symbol) && !this.unsupportedSymbols.has(symbol)) {
          needsRefresh.push(symbol);
        }
        
        // Only count active (non-quarantined) symbols toward kill switch
        maxStaleness = Math.max(maxStaleness, status.ageSeconds);

        if (status.level === 'kill_switch') {
          killSwitchCount++;
          
          // Activate kill switch if ANY active symbol exceeds threshold
          if (!this.killSwitchActive) {
            this.killSwitchActive = true;
            console.error(`🚨 KILL SWITCH ACTIVATED - ${symbol} data staleness: ${status.ageSeconds.toFixed(1)}s`);
            
            // Record metric (state: 2 = triggered)
            observabilityService.updateBreakerState('global', 'kill_switch_staleness', 'global', 2);
          }
        }
      }
    }

    // Trigger individual symbol refresh via REST for stale active symbols
    if (needsRefresh.length > 0 && this.refreshSymbolCallback) {
      const now = Date.now();
      
      // Filter out symbols already being refreshed or timed out
      const toRefresh = needsRefresh.filter(symbol => {
        const inProgressSince = this.refreshInProgress.get(symbol);
        if (!inProgressSince) return true; // Not in progress, can refresh
        
        // Check if timed out
        if (now - inProgressSince > this.REFRESH_TIMEOUT_MS) {
          console.warn(`⚠️  Refresh timeout for ${symbol}, retrying`);
          this.refreshInProgress.delete(symbol);
          return true;
        }
        
        return false; // Still in progress, skip
      });
      
      if (toRefresh.length > 0) {
        console.log(`🔄 Triggering REST refresh for ${toRefresh.length} stale symbols: ${toRefresh.join(', ')}`);
        
        // Fire and forget with timeout - don't await
        toRefresh.forEach(symbol => {
          this.refreshInProgress.set(symbol, now);
          
          // Race between timeout and actual refresh
          Promise.race([
            this.refreshSymbolCallback!(symbol),
            new Promise<boolean>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), this.REFRESH_TIMEOUT_MS)
            )
          ])
          .then(() => this.refreshInProgress.delete(symbol))
          .catch(err => {
            console.error(`❌ Refresh failed for ${symbol}:`, err.message);
            this.refreshInProgress.delete(symbol);
          });
        });
      }
    }

    // Log quarantine changes
    if (newlyQuarantined.length > 0) {
      console.warn(`⚠️  Quarantined ${newlyQuarantined.length} symbols (>5min stale): ${newlyQuarantined.join(', ')}`);
    }
    if (recovered.length > 0) {
      console.log(`✅ Recovered ${recovered.length} symbols from quarantine: ${recovered.join(', ')}`);
    }

    const activeSymbolsCount = trackedSymbols.length - this.quarantinedSymbols.size;
    
    // Trigger circuit breakers based on staleness levels (if circuit breaker service is available)
    if (this.circuitBreakerService) {
      const PORTFOLIO_ID = 'global'; // Use global portfolio ID for staleness breakers
      
      // Determine worst staleness level across active symbols
      if (maxStaleness >= this.config.killSwitchSeconds && killSwitchCount > 0) {
        // KILL level: pause all trading
        this.circuitBreakerService.triggerStalenessBreaker(
          PORTFOLIO_ID,
          'kill',
          `${killSwitchCount}/${activeSymbolsCount} active symbols exceeded ${this.config.killSwitchSeconds}s staleness`,
          killSwitchCount
        );
      } else if (maxStaleness >= this.config.hardThresholdSeconds) {
        // HARD level: zero signals, block new positions
        this.circuitBreakerService.triggerStalenessBreaker(
          PORTFOLIO_ID,
          'hard',
          `Max staleness ${maxStaleness.toFixed(1)}s exceeded HARD threshold of ${this.config.hardThresholdSeconds}s`,
          0
        );
      } else if (maxStaleness >= this.config.warnThresholdSeconds) {
        // WARN level: block new positions only
        this.circuitBreakerService.triggerStalenessBreaker(
          PORTFOLIO_ID,
          'warn',
          `Max staleness ${maxStaleness.toFixed(1)}s exceeded WARN threshold of ${this.config.warnThresholdSeconds}s`,
          0
        );
      } else {
        // All fresh: reset staleness breakers
        this.circuitBreakerService.resetStalenessBreaker(PORTFOLIO_ID);
      }
    }
    
    // AUTO-RECOVERY: Only deactivate if ALL ACTIVE symbols are below kill switch threshold
    if (this.killSwitchActive && killSwitchCount === 0) {
      this.killSwitchActive = false;
      console.log(`✅ Kill switch AUTO-DEACTIVATED - all ${activeSymbolsCount} active symbols fresh (${this.quarantinedSymbols.size} quarantined, max staleness: ${maxStaleness.toFixed(1)}s)`);
      
      // Record metric (state: 0 = normal)
      observabilityService.updateBreakerState('global', 'kill_switch_staleness', 'global', 0);
    } else if (this.killSwitchActive) {
      console.warn(`⚠️  Kill switch still active - ${killSwitchCount}/${activeSymbolsCount} active symbols stale (${this.quarantinedSymbols.size} quarantined, max: ${maxStaleness.toFixed(1)}s)`);
    } else if (this.quarantinedSymbols.size > 0) {
      // Log quarantine status even when kill switch is off
      console.log(`ℹ️  Status: ${activeSymbolsCount} active, ${this.quarantinedSymbols.size} quarantined symbols`);
    }
  }

  async getStatusForSymbol(exchange: string, symbol: string): Promise<{
    l1: StalenessStatus;
    l2: StalenessStatus;
    ticks: StalenessStatus;
    canTrade: boolean;
    killSwitchActive: boolean;
    isQuarantined: boolean;
  }> {
    const [l1, l2, ticks] = await Promise.all([
      this.checkDataStaleness(exchange, symbol, 'l1'),
      this.checkDataStaleness(exchange, symbol, 'l2'),
      this.checkDataStaleness(exchange, symbol, 'ticks'),
    ]);

    const canOpenResult = await this.canOpenPosition(exchange, symbol);

    return {
      l1,
      l2,
      ticks,
      canTrade: canOpenResult.allowed,
      killSwitchActive: this.killSwitchActive,
      isQuarantined: this.quarantinedSymbols.has(symbol),
    };
  }

  getQuarantineStatus(): {
    quarantinedCount: number;
    quarantinedSymbols: string[];
  } {
    return {
      quarantinedCount: this.quarantinedSymbols.size,
      quarantinedSymbols: Array.from(this.quarantinedSymbols.keys()),
    };
  }

  getGlobalStalenessLevel(): StalenessLevel {
    if (this.killSwitchActive) {
      return 'kill_switch';
    }
    return 'fresh';
  }

  getConfig(): StalenessConfig {
    return { ...this.config };
  }
}

export const stalenessGuardService = new StalenessGuardService();
