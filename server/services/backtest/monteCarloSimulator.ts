import { db } from "../../db";
import { monte_carlo_scenarios, type InsertMonteCarloScenario } from "@shared/schema";

interface TradeReturns {
  symbol: string;
  clusterNumber?: number;
  returns: number[];
}

interface ScenarioConfig {
  scenarioType: "normal" | "stress_intra_corr" | "stress_inter_corr" | "black_swan";
  intraClusterCorrelation: number;
  interClusterCorrelation: number;
}

interface ScenarioResult {
  scenarioNumber: number;
  scenarioType: string;
  intraClusterCorrelation: number;
  interClusterCorrelation: number;
  finalEquity: number;
  totalPnl: number;
  maxDrawdown: number;
  var95: number;
  es95: number;
  breakersActivated: number;
}

export interface MonteCarloResults {
  scenarios: ScenarioResult[];
  summary: {
    meanFinalEquity: number;
    stdFinalEquity: number;
    var95_mean: number;
    var99_mean: number;
    es95_mean: number;
    es99_mean: number;
    maxDrawdown_p5: number;
    maxDrawdown_p50: number;
    maxDrawdown_p95: number;
    probability_positive_pnl: number;
    probability_exceed_10pct_dd: number;
  };
  confidenceIntervals: {
    finalEquity_95: [number, number];
    pnl_95: [number, number];
    maxDD_95: [number, number];
  };
}

export class MonteCarloSimulator {
  private initialCapital: number;
  private applyBreakers: boolean;
  private globalStopPct: number;
  private campaignDDStop: number;

  constructor(
    initialCapital: number,
    applyBreakers: boolean = true,
    globalStopPct: number = -0.024,
    campaignDDStop: number = -0.10
  ) {
    this.initialCapital = initialCapital;
    this.applyBreakers = applyBreakers;
    this.globalStopPct = globalStopPct;
    this.campaignDDStop = campaignDDStop;
  }

  async runSimulation(
    backtestRunId: string,
    tradeReturns: TradeReturns[],
    numScenarios: number = 1000,
    onProgress?: (percentage: number) => void
  ): Promise<MonteCarloResults> {
    console.log(`[MonteCarloSimulator] Starting with ${numScenarios} scenarios`);

    const scenarios: ScenarioResult[] = [];
    const configs = this.generateScenarioConfigs(numScenarios);

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      const result = this.runSingleScenario(i + 1, config, tradeReturns);
      scenarios.push(result);

      if (onProgress && i % 100 === 0) {
        onProgress((i / configs.length) * 100);
      }
    }

    await this.saveScenarios(backtestRunId, scenarios);

    const summary = this.calculateSummary(scenarios);
    const confidenceIntervals = this.calculateConfidenceIntervals(scenarios);

    console.log(`[MonteCarloSimulator] Completed. Mean final equity: ${summary.meanFinalEquity.toFixed(2)}`);

    return {
      scenarios,
      summary,
      confidenceIntervals,
    };
  }

  private generateScenarioConfigs(numScenarios: number): ScenarioConfig[] {
    const configs: ScenarioConfig[] = [];
    
    const normalCount = Math.floor(numScenarios * 0.5);
    for (let i = 0; i < normalCount; i++) {
      configs.push({
        scenarioType: "normal",
        intraClusterCorrelation: 0.30 + Math.random() * 0.30,
        interClusterCorrelation: 0.10 + Math.random() * 0.10,
      });
    }

    const stressIntraCount = Math.floor(numScenarios * 0.2);
    for (let i = 0; i < stressIntraCount; i++) {
      configs.push({
        scenarioType: "stress_intra_corr",
        intraClusterCorrelation: 0.60 + Math.random() * 0.25,
        interClusterCorrelation: 0.15 + Math.random() * 0.15,
      });
    }

    const stressInterCount = Math.floor(numScenarios * 0.2);
    for (let i = 0; i < stressInterCount; i++) {
      configs.push({
        scenarioType: "stress_inter_corr",
        intraClusterCorrelation: 0.50 + Math.random() * 0.30,
        interClusterCorrelation: 0.20 + Math.random() * 0.30,
      });
    }

    const blackSwanCount = numScenarios - normalCount - stressIntraCount - stressInterCount;
    for (let i = 0; i < blackSwanCount; i++) {
      configs.push({
        scenarioType: "black_swan",
        intraClusterCorrelation: 0.75 + Math.random() * 0.10,
        interClusterCorrelation: 0.40 + Math.random() * 0.10,
      });
    }

    return this.shuffleArray(configs);
  }

  private runSingleScenario(
    scenarioNumber: number,
    config: ScenarioConfig,
    tradeReturns: TradeReturns[]
  ): ScenarioResult {
    let equity = this.initialCapital;
    let peakEquity = equity;
    let maxDrawdown = 0;
    let breakersActivated = 0;
    const dailyReturns: number[] = [];

    const correlatedReturns = this.applyCorrelations(tradeReturns, config);
    const shuffledReturns = this.shuffleReturns(correlatedReturns);

    let globalPaused = false;
    let dailyPnL = 0;

    for (const ret of shuffledReturns) {
      if (this.applyBreakers && globalPaused) {
        breakersActivated++;
        continue;
      }

      const pnl = equity * ret;
      equity += pnl;
      dailyPnL += pnl;

      if (this.applyBreakers) {
        const dailyPnLPct = dailyPnL / this.initialCapital;
        if (dailyPnLPct <= this.globalStopPct) {
          globalPaused = true;
          breakersActivated++;
        }
      }

      if (equity > peakEquity) {
        peakEquity = equity;
      }
      const dd = (equity - peakEquity) / peakEquity;
      if (dd < maxDrawdown) {
        maxDrawdown = dd;
      }

      if (this.applyBreakers && dd <= this.campaignDDStop) {
        break;
      }

      dailyReturns.push(ret);

      if (Math.random() < 0.05) {
        dailyPnL = 0;
        globalPaused = false;
      }
    }

    const { var95, es95 } = this.calculateVaRES(dailyReturns);

    return {
      scenarioNumber,
      scenarioType: config.scenarioType,
      intraClusterCorrelation: config.intraClusterCorrelation,
      interClusterCorrelation: config.interClusterCorrelation,
      finalEquity: equity,
      totalPnl: equity - this.initialCapital,
      maxDrawdown: Math.abs(maxDrawdown),
      var95,
      es95,
      breakersActivated,
    };
  }

  private applyCorrelations(
    tradeReturns: TradeReturns[],
    config: ScenarioConfig
  ): number[] {
    const allReturns: number[] = [];
    const clusterMap = new Map<number, TradeReturns[]>();

    for (const tr of tradeReturns) {
      const cluster = tr.clusterNumber || 0;
      if (!clusterMap.has(cluster)) {
        clusterMap.set(cluster, []);
      }
      clusterMap.get(cluster)!.push(tr);
    }

    const marketShock = (Math.random() - 0.5) * 0.02;

    const clusterKeys = Array.from(clusterMap.keys());
    for (const cluster of clusterKeys) {
      const clusterTrades = clusterMap.get(cluster) || [];
      const clusterShock = (Math.random() - 0.5) * 0.01;

      for (const trade of clusterTrades) {
        for (const ret of trade.returns) {
          const idiosyncraticWeight = 1 - config.intraClusterCorrelation - config.interClusterCorrelation;
          const adjustedReturn = 
            ret * idiosyncraticWeight +
            clusterShock * config.intraClusterCorrelation +
            marketShock * config.interClusterCorrelation;
          
          allReturns.push(adjustedReturn);
        }
      }
    }

    return allReturns;
  }

  private shuffleReturns(returns: number[]): number[] {
    const shuffled = [...returns];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private calculateVaRES(returns: number[]): { var95: number; es95: number } {
    if (returns.length === 0) {
      return { var95: 0, es95: 0 };
    }

    const sorted = [...returns].sort((a, b) => a - b);
    const index95 = Math.floor(sorted.length * 0.05);
    const var95 = Math.abs(sorted[index95] || 0);

    const tail = sorted.slice(0, index95 + 1);
    const es95 = tail.length > 0 
      ? Math.abs(tail.reduce((a, b) => a + b, 0) / tail.length)
      : 0;

    return { var95, es95 };
  }

  private calculateSummary(scenarios: ScenarioResult[]): MonteCarloResults["summary"] {
    const finalEquities = scenarios.map(s => s.finalEquity);
    const pnls = scenarios.map(s => s.totalPnl);
    const maxDrawdowns = scenarios.map(s => s.maxDrawdown);
    const var95s = scenarios.map(s => s.var95);
    const es95s = scenarios.map(s => s.es95);

    const meanFinalEquity = this.mean(finalEquities);
    const stdFinalEquity = this.std(finalEquities);

    const sortedDD = [...maxDrawdowns].sort((a, b) => a - b);
    const maxDrawdown_p5 = sortedDD[Math.floor(sortedDD.length * 0.05)];
    const maxDrawdown_p50 = sortedDD[Math.floor(sortedDD.length * 0.50)];
    const maxDrawdown_p95 = sortedDD[Math.floor(sortedDD.length * 0.95)];

    const positivePnlCount = pnls.filter(p => p > 0).length;
    const exceed10pctDDCount = maxDrawdowns.filter(dd => dd > 0.10).length;

    return {
      meanFinalEquity,
      stdFinalEquity,
      var95_mean: this.mean(var95s),
      var99_mean: this.percentile(var95s, 0.99),
      es95_mean: this.mean(es95s),
      es99_mean: this.percentile(es95s, 0.99),
      maxDrawdown_p5,
      maxDrawdown_p50,
      maxDrawdown_p95,
      probability_positive_pnl: positivePnlCount / scenarios.length,
      probability_exceed_10pct_dd: exceed10pctDDCount / scenarios.length,
    };
  }

  private calculateConfidenceIntervals(scenarios: ScenarioResult[]): MonteCarloResults["confidenceIntervals"] {
    const finalEquities = scenarios.map(s => s.finalEquity).sort((a, b) => a - b);
    const pnls = scenarios.map(s => s.totalPnl).sort((a, b) => a - b);
    const maxDDs = scenarios.map(s => s.maxDrawdown).sort((a, b) => a - b);

    return {
      finalEquity_95: [
        finalEquities[Math.floor(finalEquities.length * 0.025)],
        finalEquities[Math.floor(finalEquities.length * 0.975)],
      ],
      pnl_95: [
        pnls[Math.floor(pnls.length * 0.025)],
        pnls[Math.floor(pnls.length * 0.975)],
      ],
      maxDD_95: [
        maxDDs[Math.floor(maxDDs.length * 0.025)],
        maxDDs[Math.floor(maxDDs.length * 0.975)],
      ],
    };
  }

  private mean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private std(arr: number[]): number {
    const m = this.mean(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * p);
    return sorted[index] || 0;
  }

  private async saveScenarios(backtestRunId: string, scenarios: ScenarioResult[]) {
    const toInsert: InsertMonteCarloScenario[] = scenarios.map(s => ({
      backtest_run_id: backtestRunId,
      scenario_number: s.scenarioNumber,
      scenario_type: s.scenarioType,
      intra_cluster_correlation: s.intraClusterCorrelation.toFixed(4),
      inter_cluster_correlation: s.interClusterCorrelation.toFixed(4),
      final_equity: s.finalEquity.toFixed(2),
      total_pnl: s.totalPnl.toFixed(2),
      max_drawdown: s.maxDrawdown.toFixed(2),
      var_95: s.var95.toFixed(8),
      es_95: s.es95.toFixed(8),
      breakers_activated: s.breakersActivated,
    }));

    const batchSize = 100;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      await db.insert(monte_carlo_scenarios).values(batch);
    }
  }
}

export function extractTradeReturns(trades: any[]): { symbol: string; clusterNumber?: number; returns: number[] }[] {
  const bySymbol = new Map<string, { clusterNumber?: number; returns: number[] }>();

  for (const trade of trades) {
    const symbol = trade.symbol;
    if (!bySymbol.has(symbol)) {
      bySymbol.set(symbol, { clusterNumber: trade.clusterNumber, returns: [] });
    }
    const entry = bySymbol.get(symbol)!;
    const ret = trade.netPnl / trade.notionalValue;
    entry.returns.push(ret);
  }

  return Array.from(bySymbol.entries()).map(([symbol, data]) => ({
    symbol,
    clusterNumber: data.clusterNumber,
    returns: data.returns,
  }));
}
