import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, sql, gte, lte, desc, asc, ne, isNotNull } from "drizzle-orm";

export interface FranchisePerformanceOverview {
  total_franchises: number;
  active_franchises: number;
  total_campaigns: number;
  active_campaigns: number;
  total_pnl: number;
  total_trades: number;
  win_rate: number;
  avg_roi: number;
  total_capital_under_management: number;
}

export interface FranchiseRanking {
  franchise_id: string;
  franchise_name: string;
  plan_name: string;
  status: string;
  total_pnl: number;
  win_rate: number;
  total_trades: number;
  active_campaigns: number;
  capital_under_management: number;
  roi_percentage: number;
  rank: number;
}

export interface SymbolPerformance {
  symbol: string;
  total_pnl: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pnl_per_trade: number;
  total_volume: number;
  franchises_trading: number;
}

export interface ClusterPerformance {
  cluster_number: number;
  cluster_label: string;
  symbols_count: number;
  total_pnl: number;
  total_trades: number;
  win_rate: number;
  avg_roi: number;
  franchises_using: number;
}

export interface TradingPattern {
  hour?: number;
  day_of_week?: number;
  total_trades: number;
  total_pnl: number;
  win_rate: number;
  avg_pnl: number;
}

export interface StrategicInsight {
  type: 'opportunity' | 'warning' | 'alert' | 'info';
  category: 'performance' | 'risk' | 'efficiency' | 'growth';
  title_key: string;
  description_key: string;
  data: Record<string, any>;
  priority: number;
}

class FranchiseAnalyticsService {
  async getConsolidatedPerformance(
    startDate?: Date,
    endDate?: Date
  ): Promise<FranchisePerformanceOverview> {
    const franchises = await db.select()
      .from(schema.franchises);

    const activeFranchises = franchises.filter(f => f.status === 'active');

    const allCampaigns = await db.select()
      .from(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.is_deleted, false),
          isNotNull(schema.campaigns.franchise_id)
        )
      );

    const activeCampaigns = allCampaigns.filter(c => c.status === 'active');

    let positionsQuery = db.select({
      realized_pnl: schema.campaign_positions.realized_pnl,
      state: schema.campaign_positions.state,
      quantity: schema.campaign_positions.quantity,
      entry_price: schema.campaign_positions.entry_price,
    })
      .from(schema.campaign_positions)
      .innerJoin(schema.campaigns, eq(schema.campaign_positions.campaign_id, schema.campaigns.id))
      .where(
        and(
          eq(schema.campaign_positions.state, 'closed'),
          eq(schema.campaigns.is_deleted, false),
          isNotNull(schema.campaigns.franchise_id)
        )
      );

    const closedPositions = await positionsQuery;

    let totalPnl = 0;
    let wins = 0;
    let losses = 0;

    for (const pos of closedPositions) {
      const pnl = parseFloat(pos.realized_pnl || '0');
      totalPnl += pnl;
      if (pnl > 0) wins++;
      else if (pnl < 0) losses++;
    }

    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    const totalCapital = allCampaigns.reduce((sum, c) => 
      sum + parseFloat(c.current_equity || '0'), 0);

    const totalInitialCapital = allCampaigns.reduce((sum, c) => 
      sum + parseFloat(c.initial_capital || '0'), 0);

    const avgRoi = totalInitialCapital > 0 
      ? ((totalCapital - totalInitialCapital) / totalInitialCapital) * 100 
      : 0;

    return {
      total_franchises: franchises.length,
      active_franchises: activeFranchises.length,
      total_campaigns: allCampaigns.length,
      active_campaigns: activeCampaigns.length,
      total_pnl: totalPnl,
      total_trades: totalTrades,
      win_rate: winRate,
      avg_roi: avgRoi,
      total_capital_under_management: totalCapital,
    };
  }

  async getFranchiseRankings(
    orderBy: 'pnl' | 'win_rate' | 'roi' | 'trades' = 'pnl',
    limit: number = 50
  ): Promise<FranchiseRanking[]> {
    const franchises = await db.select({
      franchise: schema.franchises,
      plan: schema.franchise_plans,
    })
      .from(schema.franchises)
      .leftJoin(schema.franchise_plans, eq(schema.franchises.plan_id, schema.franchise_plans.id));

    const rankings: FranchiseRanking[] = [];

    for (const { franchise, plan } of franchises) {
      const campaigns = await db.select()
        .from(schema.campaigns)
        .where(
          and(
            eq(schema.campaigns.franchise_id, franchise.id),
            eq(schema.campaigns.is_deleted, false)
          )
        );

      const activeCampaigns = campaigns.filter(c => c.status === 'active');

      const campaignIds = campaigns.map(c => c.id);

      if (campaignIds.length === 0) {
        rankings.push({
          franchise_id: franchise.id,
          franchise_name: franchise.name,
          plan_name: plan?.name || 'Unknown',
          status: franchise.status,
          total_pnl: 0,
          win_rate: 0,
          total_trades: 0,
          active_campaigns: activeCampaigns.length,
          capital_under_management: 0,
          roi_percentage: 0,
          rank: 0,
        });
        continue;
      }

      const positions = await db.select()
        .from(schema.campaign_positions)
        .where(
          and(
            eq(schema.campaign_positions.state, 'closed'),
            sql`${schema.campaign_positions.campaign_id} = ANY(${campaignIds})`
          )
        );

      let totalPnl = 0;
      let wins = 0;
      let losses = 0;

      for (const pos of positions) {
        const pnl = parseFloat(pos.realized_pnl || '0');
        totalPnl += pnl;
        if (pnl > 0) wins++;
        else if (pnl < 0) losses++;
      }

      const totalTrades = wins + losses;
      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

      const capitalUnderManagement = campaigns.reduce((sum, c) => 
        sum + parseFloat(c.current_equity || '0'), 0);

      const initialCapital = campaigns.reduce((sum, c) => 
        sum + parseFloat(c.initial_capital || '0'), 0);

      const roi = initialCapital > 0 
        ? ((capitalUnderManagement - initialCapital + totalPnl) / initialCapital) * 100 
        : 0;

      rankings.push({
        franchise_id: franchise.id,
        franchise_name: franchise.name,
        plan_name: plan?.name || 'Unknown',
        status: franchise.status,
        total_pnl: totalPnl,
        win_rate: winRate,
        total_trades: totalTrades,
        active_campaigns: activeCampaigns.length,
        capital_under_management: capitalUnderManagement,
        roi_percentage: roi,
        rank: 0,
      });
    }

    rankings.sort((a, b) => {
      switch (orderBy) {
        case 'pnl': return b.total_pnl - a.total_pnl;
        case 'win_rate': return b.win_rate - a.win_rate;
        case 'roi': return b.roi_percentage - a.roi_percentage;
        case 'trades': return b.total_trades - a.total_trades;
        default: return b.total_pnl - a.total_pnl;
      }
    });

    rankings.forEach((r, idx) => { r.rank = idx + 1; });

    return rankings.slice(0, limit);
  }

  async getSymbolPerformance(limit: number = 20): Promise<SymbolPerformance[]> {
    const positions = await db.select({
      symbol: schema.campaign_positions.symbol,
      realized_pnl: schema.campaign_positions.realized_pnl,
      quantity: schema.campaign_positions.quantity,
      entry_price: schema.campaign_positions.entry_price,
      franchise_id: schema.campaigns.franchise_id,
    })
      .from(schema.campaign_positions)
      .innerJoin(schema.campaigns, eq(schema.campaign_positions.campaign_id, schema.campaigns.id))
      .where(
        and(
          eq(schema.campaign_positions.state, 'closed'),
          eq(schema.campaigns.is_deleted, false),
          isNotNull(schema.campaigns.franchise_id)
        )
      );

    const symbolMap = new Map<string, {
      total_pnl: number;
      wins: number;
      losses: number;
      total_volume: number;
      franchises: Set<string>;
    }>();

    for (const pos of positions) {
      const symbol = pos.symbol;
      const pnl = parseFloat(pos.realized_pnl || '0');
      const volume = parseFloat(pos.quantity || '0') * parseFloat(pos.entry_price || '0');

      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, {
          total_pnl: 0,
          wins: 0,
          losses: 0,
          total_volume: 0,
          franchises: new Set(),
        });
      }

      const data = symbolMap.get(symbol)!;
      data.total_pnl += pnl;
      if (pnl > 0) data.wins++;
      else if (pnl < 0) data.losses++;
      data.total_volume += volume;
      if (pos.franchise_id) data.franchises.add(pos.franchise_id);
    }

    const results: SymbolPerformance[] = [];

    Array.from(symbolMap.entries()).forEach(([symbol, data]) => {
      const totalTrades = data.wins + data.losses;
      results.push({
        symbol,
        total_pnl: data.total_pnl,
        total_trades: totalTrades,
        wins: data.wins,
        losses: data.losses,
        win_rate: totalTrades > 0 ? (data.wins / totalTrades) * 100 : 0,
        avg_pnl_per_trade: totalTrades > 0 ? data.total_pnl / totalTrades : 0,
        total_volume: data.total_volume,
        franchises_trading: data.franchises.size,
      });
    });

    results.sort((a, b) => b.total_pnl - a.total_pnl);

    return results.slice(0, limit);
  }

  async getClusterPerformance(): Promise<ClusterPerformance[]> {
    const clusters = await db.select()
      .from(schema.clusters);

    const clusterMap = new Map<number, {
      label: string;
      symbols: Set<string>;
      franchises: Set<string>;
    }>();

    for (const cluster of clusters) {
      if (!clusterMap.has(cluster.cluster_number)) {
        clusterMap.set(cluster.cluster_number, {
          label: `Cluster ${cluster.cluster_number}`,
          symbols: new Set(),
          franchises: new Set(),
        });
      }
      const data = clusterMap.get(cluster.cluster_number)!;
      if (cluster.assets) {
        cluster.assets.forEach(s => data.symbols.add(s));
      }
    }

    const results: ClusterPerformance[] = [];

    for (const [clusterNumber, clusterData] of Array.from(clusterMap.entries())) {
      const symbolsArray = Array.from(clusterData.symbols);
      
      if (symbolsArray.length === 0) {
        results.push({
          cluster_number: clusterNumber,
          cluster_label: clusterData.label,
          symbols_count: 0,
          total_pnl: 0,
          total_trades: 0,
          win_rate: 0,
          avg_roi: 0,
          franchises_using: 0,
        });
        continue;
      }

      const positions = await db.select({
        realized_pnl: schema.campaign_positions.realized_pnl,
        franchise_id: schema.campaigns.franchise_id,
      })
        .from(schema.campaign_positions)
        .innerJoin(schema.campaigns, eq(schema.campaign_positions.campaign_id, schema.campaigns.id))
        .where(
          and(
            eq(schema.campaign_positions.state, 'closed'),
            eq(schema.campaigns.is_deleted, false),
            isNotNull(schema.campaigns.franchise_id),
            sql`${schema.campaign_positions.symbol} = ANY(${symbolsArray})`
          )
        );

      let totalPnl = 0;
      let wins = 0;
      let losses = 0;
      const franchises = new Set<string>();

      for (const pos of positions) {
        const pnl = parseFloat(pos.realized_pnl || '0');
        totalPnl += pnl;
        if (pnl > 0) wins++;
        else if (pnl < 0) losses++;
        if (pos.franchise_id) franchises.add(pos.franchise_id);
      }

      const totalTrades = wins + losses;

      results.push({
        cluster_number: clusterNumber,
        cluster_label: clusterData.label,
        symbols_count: symbolsArray.length,
        total_pnl: totalPnl,
        total_trades: totalTrades,
        win_rate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
        avg_roi: totalTrades > 0 ? (totalPnl / totalTrades) : 0,
        franchises_using: franchises.size,
      });
    }

    results.sort((a, b) => b.total_pnl - a.total_pnl);

    return results;
  }

  async getTradingPatterns(): Promise<{
    hourly: TradingPattern[];
    daily: TradingPattern[];
  }> {
    const positions = await db.select({
      closed_at: schema.campaign_positions.closed_at,
      realized_pnl: schema.campaign_positions.realized_pnl,
    })
      .from(schema.campaign_positions)
      .innerJoin(schema.campaigns, eq(schema.campaign_positions.campaign_id, schema.campaigns.id))
      .where(
        and(
          eq(schema.campaign_positions.state, 'closed'),
          eq(schema.campaigns.is_deleted, false),
          isNotNull(schema.campaigns.franchise_id),
          isNotNull(schema.campaign_positions.closed_at)
        )
      );

    const hourlyMap = new Map<number, { trades: number; pnl: number; wins: number }>();
    const dailyMap = new Map<number, { trades: number; pnl: number; wins: number }>();

    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { trades: 0, pnl: 0, wins: 0 });
    }
    for (let d = 0; d < 7; d++) {
      dailyMap.set(d, { trades: 0, pnl: 0, wins: 0 });
    }

    for (const pos of positions) {
      if (!pos.closed_at) continue;
      
      const date = new Date(pos.closed_at);
      const hour = date.getUTCHours();
      const dayOfWeek = date.getUTCDay();
      const pnl = parseFloat(pos.realized_pnl || '0');

      const hourData = hourlyMap.get(hour)!;
      hourData.trades++;
      hourData.pnl += pnl;
      if (pnl > 0) hourData.wins++;

      const dayData = dailyMap.get(dayOfWeek)!;
      dayData.trades++;
      dayData.pnl += pnl;
      if (pnl > 0) dayData.wins++;
    }

    const hourly: TradingPattern[] = [];
    Array.from(hourlyMap.entries()).forEach(([hour, data]) => {
      hourly.push({
        hour,
        total_trades: data.trades,
        total_pnl: data.pnl,
        win_rate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
        avg_pnl: data.trades > 0 ? data.pnl / data.trades : 0,
      });
    });

    const daily: TradingPattern[] = [];
    Array.from(dailyMap.entries()).forEach(([day, data]) => {
      daily.push({
        day_of_week: day,
        total_trades: data.trades,
        total_pnl: data.pnl,
        win_rate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
        avg_pnl: data.trades > 0 ? data.pnl / data.trades : 0,
      });
    });

    return { hourly, daily };
  }

  async getStrategicInsights(): Promise<StrategicInsight[]> {
    const insights: StrategicInsight[] = [];

    const overview = await this.getConsolidatedPerformance();
    const rankings = await this.getFranchiseRankings('pnl', 100);
    const symbols = await this.getSymbolPerformance(50);
    const patterns = await this.getTradingPatterns();

    if (overview.win_rate < 40) {
      insights.push({
        type: 'warning',
        category: 'performance',
        title_key: 'analytics.insights.lowWinRate.title',
        description_key: 'analytics.insights.lowWinRate.description',
        data: { win_rate: overview.win_rate.toFixed(1) },
        priority: 1,
      });
    }

    const strugglingFranchises = rankings.filter(r => r.total_pnl < 0 && r.total_trades > 10);
    if (strugglingFranchises.length > 0) {
      insights.push({
        type: 'alert',
        category: 'risk',
        title_key: 'analytics.insights.strugglingFranchises.title',
        description_key: 'analytics.insights.strugglingFranchises.description',
        data: { 
          count: strugglingFranchises.length,
          franchises: strugglingFranchises.slice(0, 5).map(f => f.franchise_name),
        },
        priority: 2,
      });
    }

    const topPerformers = rankings.filter(r => r.roi_percentage > 10 && r.total_trades > 20);
    if (topPerformers.length > 0) {
      insights.push({
        type: 'info',
        category: 'performance',
        title_key: 'analytics.insights.topPerformers.title',
        description_key: 'analytics.insights.topPerformers.description',
        data: { 
          count: topPerformers.length,
          top_roi: Math.max(...topPerformers.map(f => f.roi_percentage)).toFixed(1),
        },
        priority: 5,
      });
    }

    const bestSymbols = symbols.filter(s => s.win_rate > 60 && s.total_trades > 10);
    if (bestSymbols.length > 0) {
      insights.push({
        type: 'opportunity',
        category: 'efficiency',
        title_key: 'analytics.insights.bestSymbols.title',
        description_key: 'analytics.insights.bestSymbols.description',
        data: { 
          symbols: bestSymbols.slice(0, 5).map(s => s.symbol),
          avg_win_rate: (bestSymbols.reduce((sum, s) => sum + s.win_rate, 0) / bestSymbols.length).toFixed(1),
        },
        priority: 3,
      });
    }

    const worstSymbols = symbols.filter(s => s.win_rate < 30 && s.total_trades > 10);
    if (worstSymbols.length > 0) {
      insights.push({
        type: 'warning',
        category: 'risk',
        title_key: 'analytics.insights.worstSymbols.title',
        description_key: 'analytics.insights.worstSymbols.description',
        data: { 
          symbols: worstSymbols.slice(0, 5).map(s => s.symbol),
          total_loss: worstSymbols.reduce((sum, s) => sum + s.total_pnl, 0).toFixed(2),
        },
        priority: 2,
      });
    }

    const bestHours = patterns.hourly
      .filter(h => h.total_trades > 5 && h.win_rate > 55)
      .sort((a, b) => b.win_rate - a.win_rate)
      .slice(0, 3);

    if (bestHours.length > 0) {
      insights.push({
        type: 'opportunity',
        category: 'efficiency',
        title_key: 'analytics.insights.bestTradingHours.title',
        description_key: 'analytics.insights.bestTradingHours.description',
        data: { 
          hours: bestHours.map(h => h.hour),
          avg_win_rate: (bestHours.reduce((sum, h) => sum + h.win_rate, 0) / bestHours.length).toFixed(1),
        },
        priority: 4,
      });
    }

    const growthRate = overview.active_franchises / Math.max(overview.total_franchises, 1);
    if (growthRate < 0.5) {
      insights.push({
        type: 'warning',
        category: 'growth',
        title_key: 'analytics.insights.lowActiveRate.title',
        description_key: 'analytics.insights.lowActiveRate.description',
        data: { 
          active_rate: (growthRate * 100).toFixed(1),
          inactive_count: overview.total_franchises - overview.active_franchises,
        },
        priority: 3,
      });
    }

    insights.sort((a, b) => a.priority - b.priority);

    return insights;
  }
}

export const franchiseAnalyticsService = new FranchiseAnalyticsService();
