export { 
  BacktestEngine, 
  createDefaultStrategyParams, 
  createDefaultRiskParams, 
  createDefaultCostParams,
  type StrategyParams,
  type RiskParams,
  type CostParams
} from './backtestEngine';

export { 
  MonteCarloSimulator, 
  extractTradeReturns,
  type MonteCarloResults 
} from './monteCarloSimulator';

export { 
  BacktestMetricsService, 
  backtestMetricsService 
} from './backtestMetricsService';
