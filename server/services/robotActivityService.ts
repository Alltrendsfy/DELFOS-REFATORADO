import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, gte } from 'drizzle-orm';

export type EventType = 'signal_analysis' | 'position_open' | 'position_close' | 'circuit_breaker' | 'rebalance' | 'error' | 'info' | 'market_scan';
export type Severity = 'info' | 'warning' | 'success' | 'error';

export interface SignalDetails {
  price: number;
  atr: number;
  atrPct?: number;
  ema12: number;
  ema36: number;
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  slAtr?: number;
  tpAtr?: number;
  sl?: number;
  tp1?: number;
  stopLoss?: number;
  takeProfit?: number;
  side?: 'long' | 'short';
  quantity?: number;
  reason?: string;
}

export interface PositionDetails {
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  pnl?: number;
  pnlPct?: number;
  closeReason?: string;
  riskAmount?: number;
}

export interface CircuitBreakerDetails {
  breakerType: 'pair' | 'daily' | 'campaign';
  threshold: number;
  currentValue: number;
  triggered: boolean;
}

export interface RebalanceDetails {
  assetsAdded: string[];
  assetsRemoved: string[];
  tradableCount: number;
}

export interface MarketScanDetails {
  symbolsScanned: number;
  signalsFound: number;
  longSignals: number;
  shortSignals: number;
}

export interface AssetSelectionDetails {
  runId: string;
  profile: string;
  symbolsScanned: number;
  selectedCount: number;
  rejectedCount: number;
  topSymbols: string[];
}

class RobotActivityService {
  async log(
    campaignId: string,
    eventType: EventType,
    severity: Severity,
    messageKey: string,
    symbol?: string,
    details?: SignalDetails | PositionDetails | CircuitBreakerDetails | RebalanceDetails | MarketScanDetails | AssetSelectionDetails | Record<string, unknown>
  ): Promise<void> {
    try {
      await db.insert(schema.robot_activity_logs).values({
        campaign_id: campaignId,
        event_type: eventType,
        severity,
        message_key: messageKey,
        symbol,
        details: details as Record<string, unknown> | undefined,
      });
    } catch (error) {
      console.error('[RobotActivity] Failed to log activity:', error);
    }
  }

  async logSignalAnalysis(
    campaignId: string,
    symbol: string,
    details: SignalDetails
  ): Promise<void> {
    const severity: Severity = details.signal === 'NEUTRAL' ? 'info' : 'success';
    await this.log(
      campaignId,
      'signal_analysis',
      severity,
      `robot.signal.${details.signal.toLowerCase()}`,
      symbol,
      details
    );
  }

  async logPositionOpen(
    campaignId: string,
    symbol: string,
    details: PositionDetails
  ): Promise<void> {
    await this.log(
      campaignId,
      'position_open',
      'success',
      `robot.position.open.${details.side}`,
      symbol,
      details
    );
  }

  async logPositionClose(
    campaignId: string,
    symbol: string,
    details: PositionDetails
  ): Promise<void> {
    const severity: Severity = (details.pnl || 0) >= 0 ? 'success' : 'warning';
    await this.log(
      campaignId,
      'position_close',
      severity,
      `robot.position.close.${details.closeReason || 'manual'}`,
      symbol,
      details
    );
  }

  async logCircuitBreaker(
    campaignId: string,
    details: CircuitBreakerDetails,
    symbol?: string
  ): Promise<void> {
    await this.log(
      campaignId,
      'circuit_breaker',
      details.triggered ? 'error' : 'warning',
      `robot.breaker.${details.breakerType}.${details.triggered ? 'triggered' : 'warning'}`,
      symbol,
      details
    );
  }

  async logRebalance(
    campaignId: string,
    details: RebalanceDetails
  ): Promise<void> {
    await this.log(
      campaignId,
      'rebalance',
      'info',
      'robot.rebalance.complete',
      undefined,
      details
    );
  }

  async logMarketScan(
    campaignId: string,
    details: MarketScanDetails
  ): Promise<void> {
    await this.log(
      campaignId,
      'market_scan',
      details.signalsFound > 0 ? 'success' : 'info',
      details.signalsFound > 0 ? 'robot.scan.signals_found' : 'robot.scan.no_signals',
      undefined,
      details
    );
  }

  async logAssetSelection(
    campaignId: string,
    details: AssetSelectionDetails
  ): Promise<void> {
    await this.log(
      campaignId,
      'info',
      'success',
      'robot.asset_selection.complete',
      undefined,
      details
    );
  }

  async logInfo(
    campaignId: string,
    messageKey: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log(campaignId, 'info', 'info', messageKey, undefined, details);
  }

  async logError(
    campaignId: string,
    messageKey: string,
    error?: string,
    symbol?: string
  ): Promise<void> {
    await this.log(campaignId, 'error', 'error', messageKey, symbol, { error });
  }

  async logSystemEvent(
    campaignId: string,
    eventType: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await this.log(
      campaignId,
      'info',
      'info',
      `robot.system.${eventType}`,
      undefined,
      details
    );
  }

  async getRecentActivities(
    campaignId: string,
    limit: number = 50,
    sinceMinutes?: number
  ): Promise<schema.RobotActivityLog[]> {
    let query = db.select()
      .from(schema.robot_activity_logs)
      .where(eq(schema.robot_activity_logs.campaign_id, campaignId))
      .orderBy(desc(schema.robot_activity_logs.created_at))
      .limit(limit);

    if (sinceMinutes) {
      const sinceDate = new Date(Date.now() - sinceMinutes * 60 * 1000);
      query = db.select()
        .from(schema.robot_activity_logs)
        .where(and(
          eq(schema.robot_activity_logs.campaign_id, campaignId),
          gte(schema.robot_activity_logs.created_at, sinceDate)
        ))
        .orderBy(desc(schema.robot_activity_logs.created_at))
        .limit(limit);
    }

    return await query;
  }

  async clearOldActivities(campaignId: string, olderThanHours: number = 48): Promise<void> {
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    await db.delete(schema.robot_activity_logs)
      .where(and(
        eq(schema.robot_activity_logs.campaign_id, campaignId),
        gte(schema.robot_activity_logs.created_at, cutoffDate)
      ));
  }
}

export const robotActivityService = new RobotActivityService();
