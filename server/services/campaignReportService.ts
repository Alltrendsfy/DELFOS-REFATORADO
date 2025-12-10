import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

export interface RobotStatus {
  campaignId: string;
  campaignName: string;
  status: 'waiting_entry' | 'monitoring' | 'in_position' | 'paused' | 'stopped';
  statusLabel: string;
  tradableAssets: string[];
  currentlyMonitoring: string[];
  entryCondition: string;
  lastSignalCheck: Date | null;
  openPositionsCount: number;
  todayTradesCount: number;
  maxOpenPositions: number;
  maxDailyTrades: number;
  nextActionPlan: string;
  circuitBreakers: {
    campaign: boolean;
    dailyLoss: boolean;
    pair: boolean;
  };
}

export interface Report8h {
  campaignId: string;
  campaignName: string;
  periodStart: Date;
  periodEnd: Date;
  tradesCount: number;
  wins: number;
  losses: number;
  netPnL: number;
  netPnLPct: number;
  openPositions: Array<{
    symbol: string;
    side: string;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    unrealizedPnLPct: number;
  }>;
  topPerformers: Array<{ symbol: string; pnl: number }>;
  worstPerformers: Array<{ symbol: string; pnl: number }>;
  nextAction: string;
}

export interface Report24h {
  campaignId: string;
  campaignName: string;
  periodStart: Date;
  periodEnd: Date;
  tradesCount: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnL: number;
  roi: number;
  initialEquity: number;
  finalEquity: number;
  benchmarks: {
    btc24h: number;
    eth24h: number;
  };
  keyDecisions: Array<{
    time: Date;
    action: string;
    symbol: string;
    result: number;
  }>;
  summary: string;
}

export interface TradeHistory {
  id: string;
  timestamp: Date;
  action: 'buy' | 'sell' | 'close';
  symbol: string;
  price: number;
  quantity: number;
  side: string;
  pnl: number | null;
  closeReason: string | null;
}

export interface HistoryReport {
  campaignId: string;
  campaignName: string;
  periodStart: Date;
  periodEnd: Date;
  trades: TradeHistory[];
  totalTrades: number;
  accumulatedPnL: number;
  totalVolume: number;
}

class CampaignReportService {
  async getRobotStatus(campaignId: string): Promise<RobotStatus | null> {
    const [campaign] = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);

    if (!campaign) return null;

    const [riskState] = await db.select().from(schema.campaign_risk_states)
      .where(eq(schema.campaign_risk_states.campaign_id, campaignId))
      .limit(1);

    const [profile] = await db.select().from(schema.risk_profile_config)
      .where(eq(schema.risk_profile_config.profile_code, campaign.investor_profile || 'M'))
      .limit(1);

    const tradableSet = (riskState?.current_tradable_set as string[]) || [];
    const positionsOpen = riskState?.positions_open || 0;
    const tradesToday = riskState?.trades_today || 0;
    const maxPositions = profile?.max_open_positions || 3;
    const maxTrades = profile?.max_trades_per_day || 10;

    const cbCampaign = riskState?.cb_campaign_triggered || false;
    const cbDaily = riskState?.cb_daily_triggered || false;
    const cbPair = Object.values(riskState?.cb_pair_triggered as Record<string, boolean> || {}).some(v => v);

    let status: RobotStatus['status'] = 'monitoring';
    let statusLabel = 'Monitorando mercado';
    let nextActionPlan = 'Analisando sinais de entrada para ativos no universo de trading.';

    if (campaign.status !== 'active') {
      status = campaign.status === 'paused' ? 'paused' : 'stopped';
      statusLabel = campaign.status === 'paused' ? 'Pausado' : 'Parado';
      nextActionPlan = 'Campanha não está ativa. Aguardando ativação.';
    } else if (cbCampaign || cbDaily || cbPair) {
      status = 'paused';
      statusLabel = 'Circuit Breaker ativo';
      nextActionPlan = 'Sistema de proteção ativado. Operações pausadas temporariamente.';
    } else if (positionsOpen > 0) {
      status = 'in_position';
      statusLabel = `Em posição (${positionsOpen} aberta${positionsOpen > 1 ? 's' : ''})`;
      nextActionPlan = 'Monitorando posições abertas e buscando sinais de saída ou novas entradas.';
    } else {
      status = 'waiting_entry';
      statusLabel = 'Aguardando entrada';
      nextActionPlan = `Monitorando ${tradableSet.length} ativos. Condição de entrada: Preço > EMA12, tendência de alta (EMA12 > EMA36), momentum confirmado (Preço - EMA12 > 1.5×ATR).`;
    }

    const entryCondition = `Critérios ATR/EMA: Preço acima de EMA12 + tendência de alta + momentum > 1.5×ATR para LONG. Preço abaixo de EMA12 + tendência de baixa + momentum para SHORT.`;

    const lastActivity = await db.select().from(schema.robot_activity_logs)
      .where(eq(schema.robot_activity_logs.campaign_id, campaignId))
      .orderBy(desc(schema.robot_activity_logs.created_at))
      .limit(1);

    return {
      campaignId,
      campaignName: campaign.name,
      status,
      statusLabel,
      tradableAssets: tradableSet,
      currentlyMonitoring: tradableSet.slice(0, 10),
      entryCondition,
      lastSignalCheck: lastActivity[0]?.created_at || null,
      openPositionsCount: positionsOpen,
      todayTradesCount: tradesToday,
      maxOpenPositions: maxPositions,
      maxDailyTrades: maxTrades,
      nextActionPlan,
      circuitBreakers: {
        campaign: cbCampaign,
        dailyLoss: cbDaily,
        pair: cbPair,
      },
    };
  }

  async getReport8h(campaignId: string): Promise<Report8h | null> {
    const [campaign] = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);

    if (!campaign) return null;

    const now = new Date();
    const periodStart = new Date(now.getTime() - 8 * 60 * 60 * 1000);

    const closedPositions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'closed'),
        gte(schema.campaign_positions.closed_at, periodStart)
      ));

    const openPositions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'open')
      ));

    let wins = 0, losses = 0, netPnL = 0;
    const pnlBySymbol: Record<string, number> = {};

    for (const pos of closedPositions) {
      const pnl = parseFloat(pos.realized_pnl || '0');
      netPnL += pnl;
      if (pnl >= 0) wins++;
      else losses++;
      pnlBySymbol[pos.symbol] = (pnlBySymbol[pos.symbol] || 0) + pnl;
    }

    const sortedSymbols = Object.entries(pnlBySymbol).sort((a, b) => b[1] - a[1]);
    const topPerformers = sortedSymbols.filter(([, pnl]) => pnl > 0).slice(0, 3).map(([symbol, pnl]) => ({ symbol, pnl }));
    const worstPerformers = sortedSymbols.filter(([, pnl]) => pnl < 0).slice(-3).map(([symbol, pnl]) => ({ symbol, pnl }));

    const initialEquity = parseFloat(campaign.initial_capital);
    const netPnLPct = initialEquity > 0 ? (netPnL / initialEquity) * 100 : 0;

    const openPositionsData = openPositions.map(pos => ({
      symbol: pos.symbol,
      side: pos.side,
      entryPrice: parseFloat(pos.entry_price),
      currentPrice: parseFloat(pos.current_price || pos.entry_price),
      unrealizedPnL: parseFloat(pos.unrealized_pnl || '0'),
      unrealizedPnLPct: 0,
    }));

    let nextAction = 'Continuar monitorando ativos para sinais de entrada/saída.';
    if (openPositions.length > 0) {
      nextAction = `Monitorando ${openPositions.length} posição(ões) aberta(s). Verificando níveis de Stop Loss e Take Profit.`;
    }

    return {
      campaignId,
      campaignName: campaign.name,
      periodStart,
      periodEnd: now,
      tradesCount: closedPositions.length,
      wins,
      losses,
      netPnL,
      netPnLPct,
      openPositions: openPositionsData,
      topPerformers,
      worstPerformers,
      nextAction,
    };
  }

  async getReport24h(campaignId: string): Promise<Report24h | null> {
    const [campaign] = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);

    if (!campaign) return null;

    const now = new Date();
    const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const closedPositions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'closed'),
        gte(schema.campaign_positions.closed_at, periodStart)
      ));

    let wins = 0, losses = 0, netPnL = 0;
    for (const pos of closedPositions) {
      const pnl = parseFloat(pos.realized_pnl || '0');
      netPnL += pnl;
      if (pnl >= 0) wins++;
      else losses++;
    }

    const tradesCount = closedPositions.length;
    const winRate = tradesCount > 0 ? (wins / tradesCount) * 100 : 0;
    const initialEquity = parseFloat(campaign.initial_capital);
    const finalEquity = parseFloat(campaign.current_equity);
    const roi = initialEquity > 0 ? ((finalEquity - initialEquity) / initialEquity) * 100 : 0;

    const keyDecisions = closedPositions.slice(0, 5).map(pos => ({
      time: pos.closed_at || pos.opened_at,
      action: pos.side === 'long' ? 'Compra' : 'Venda',
      symbol: pos.symbol,
      result: parseFloat(pos.realized_pnl || '0'),
    }));

    let summary = '';
    if (tradesCount === 0) {
      summary = 'Nenhuma operação realizada nas últimas 24 horas. O robô está monitorando condições de mercado.';
    } else if (netPnL > 0) {
      summary = `Dia positivo com lucro de $${netPnL.toFixed(2)} (${roi.toFixed(2)}% ROI). Taxa de acerto: ${winRate.toFixed(1)}%.`;
    } else {
      summary = `Dia com prejuízo de $${Math.abs(netPnL).toFixed(2)}. Taxa de acerto: ${winRate.toFixed(1)}%. Sistema de proteção ativo.`;
    }

    return {
      campaignId,
      campaignName: campaign.name,
      periodStart,
      periodEnd: now,
      tradesCount,
      wins,
      losses,
      winRate,
      netPnL,
      roi,
      initialEquity,
      finalEquity,
      benchmarks: {
        btc24h: 0,
        eth24h: 0,
      },
      keyDecisions,
      summary,
    };
  }

  async getHistory(campaignId: string, periodHours: number = 72): Promise<HistoryReport | null> {
    const [campaign] = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);

    if (!campaign) return null;

    const now = new Date();
    const periodStart = new Date(now.getTime() - periodHours * 60 * 60 * 1000);

    const positions = await db.select().from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        gte(schema.campaign_positions.opened_at, periodStart)
      ))
      .orderBy(desc(schema.campaign_positions.opened_at));

    let accumulatedPnL = 0;
    let totalVolume = 0;

    const trades: TradeHistory[] = positions.map(pos => {
      const pnl = parseFloat(pos.realized_pnl || '0');
      const qty = parseFloat(pos.quantity);
      const price = parseFloat(pos.entry_price);
      accumulatedPnL += pnl;
      totalVolume += qty * price;

      return {
        id: pos.id,
        timestamp: pos.opened_at,
        action: pos.state === 'closed' ? 'close' : (pos.side === 'long' ? 'buy' : 'sell'),
        symbol: pos.symbol,
        price: parseFloat(pos.entry_price),
        quantity: qty,
        side: pos.side,
        pnl: pos.state === 'closed' ? pnl : null,
        closeReason: pos.close_reason || null,
      };
    });

    return {
      campaignId,
      campaignName: campaign.name,
      periodStart,
      periodEnd: now,
      trades,
      totalTrades: trades.length,
      accumulatedPnL,
      totalVolume,
    };
  }
}

export const campaignReportService = new CampaignReportService();
