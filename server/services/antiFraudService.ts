import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";

export type AlertType = "abnormal_volume" | "atypical_hours" | "rapid_position_changes" | "suspicious_win_rate" | "unusual_pattern";
export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "new" | "investigating" | "dismissed" | "confirmed";

interface DetectionRule {
  type: AlertType;
  check: (data: TradingActivity) => Promise<DetectionResult | null>;
}

interface DetectionResult {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  detectionData: Record<string, unknown>;
  symbol?: string;
  activityStart?: Date;
  activityEnd?: Date;
}

interface TradingActivity {
  userId?: string;
  campaignId?: string;
  franchiseId?: string;
  positions: schema.Position[];
  trades: schema.Trade[];
  orders: schema.Order[];
  timeWindow: { start: Date; end: Date };
}

interface FraudStats {
  totalAlerts: number;
  newAlerts: number;
  investigatingAlerts: number;
  confirmedAlerts: number;
  dismissedAlerts: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
}

class AntiFraudService {
  private readonly ABNORMAL_VOLUME_THRESHOLD = 3.0;
  private readonly RAPID_POSITION_THRESHOLD = 10;
  private readonly SUSPICIOUS_WIN_RATE_THRESHOLD = 0.95;
  private readonly ATYPICAL_HOURS_START = 2;
  private readonly ATYPICAL_HOURS_END = 5;

  private detectionRules: DetectionRule[] = [
    { type: "abnormal_volume", check: this.checkAbnormalVolume.bind(this) },
    { type: "atypical_hours", check: this.checkAtypicalHours.bind(this) },
    { type: "rapid_position_changes", check: this.checkRapidPositionChanges.bind(this) },
    { type: "suspicious_win_rate", check: this.checkSuspiciousWinRate.bind(this) },
  ];

  private async checkAbnormalVolume(data: TradingActivity): Promise<DetectionResult | null> {
    if (data.trades.length < 10) return null;

    const volumes = data.trades.map(t => parseFloat(t.quantity));
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const stdDev = Math.sqrt(volumes.reduce((a, b) => a + Math.pow(b - avgVolume, 2), 0) / volumes.length);

    const abnormalTrades = data.trades.filter(t => {
      const volume = parseFloat(t.quantity);
      return Math.abs(volume - avgVolume) > this.ABNORMAL_VOLUME_THRESHOLD * stdDev;
    });

    if (abnormalTrades.length > 0) {
      const maxVolume = Math.max(...abnormalTrades.map(t => parseFloat(t.quantity)));
      const deviation = ((maxVolume - avgVolume) / stdDev).toFixed(2);

      return {
        type: "abnormal_volume",
        severity: abnormalTrades.length > 5 ? "high" : abnormalTrades.length > 2 ? "medium" : "low",
        title: "Abnormal Trading Volume Detected",
        description: `${abnormalTrades.length} trades with volume ${deviation}σ above average`,
        detectionData: {
          abnormal_trade_count: abnormalTrades.length,
          average_volume: avgVolume.toFixed(8),
          max_abnormal_volume: maxVolume.toFixed(8),
          standard_deviation: stdDev.toFixed(8),
          deviation_multiplier: parseFloat(deviation),
        },
        activityStart: data.timeWindow.start,
        activityEnd: data.timeWindow.end,
      };
    }

    return null;
  }

  private async checkAtypicalHours(data: TradingActivity): Promise<DetectionResult | null> {
    const atypicalTrades = data.trades.filter(t => {
      const hour = new Date(t.closed_at).getUTCHours();
      return hour >= this.ATYPICAL_HOURS_START && hour < this.ATYPICAL_HOURS_END;
    });

    const atypicalPercentage = atypicalTrades.length / data.trades.length;

    if (atypicalTrades.length >= 5 && atypicalPercentage > 0.3) {
      return {
        type: "atypical_hours",
        severity: atypicalPercentage > 0.7 ? "high" : atypicalPercentage > 0.5 ? "medium" : "low",
        title: "Unusual Trading Hours Pattern",
        description: `${(atypicalPercentage * 100).toFixed(1)}% of trades occurred between ${this.ATYPICAL_HOURS_START}:00-${this.ATYPICAL_HOURS_END}:00 UTC`,
        detectionData: {
          atypical_trade_count: atypicalTrades.length,
          total_trades: data.trades.length,
          percentage: (atypicalPercentage * 100).toFixed(1),
          hours_range: `${this.ATYPICAL_HOURS_START}:00-${this.ATYPICAL_HOURS_END}:00 UTC`,
        },
        activityStart: data.timeWindow.start,
        activityEnd: data.timeWindow.end,
      };
    }

    return null;
  }

  private async checkRapidPositionChanges(data: TradingActivity): Promise<DetectionResult | null> {
    if (data.trades.length < 5) return null;

    const sortedTrades = [...data.trades].sort((a, b) => 
      new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime()
    );

    let rapidSequences = 0;
    let maxTradesPerMinute = 0;

    for (let i = 0; i < sortedTrades.length - 1; i++) {
      const windowEnd = new Date(sortedTrades[i].closed_at).getTime() + 60000;
      let tradesInWindow = 1;

      for (let j = i + 1; j < sortedTrades.length; j++) {
        if (new Date(sortedTrades[j].closed_at).getTime() <= windowEnd) {
          tradesInWindow++;
        } else {
          break;
        }
      }

      if (tradesInWindow >= this.RAPID_POSITION_THRESHOLD) {
        rapidSequences++;
        maxTradesPerMinute = Math.max(maxTradesPerMinute, tradesInWindow);
      }
    }

    if (rapidSequences > 0) {
      return {
        type: "rapid_position_changes",
        severity: maxTradesPerMinute > 20 ? "critical" : maxTradesPerMinute > 15 ? "high" : "medium",
        title: "Rapid Position Changes Detected",
        description: `${maxTradesPerMinute} trades executed within 1 minute (${rapidSequences} rapid sequences found)`,
        detectionData: {
          max_trades_per_minute: maxTradesPerMinute,
          rapid_sequences: rapidSequences,
          threshold: this.RAPID_POSITION_THRESHOLD,
        },
        activityStart: data.timeWindow.start,
        activityEnd: data.timeWindow.end,
      };
    }

    return null;
  }

  private async checkSuspiciousWinRate(data: TradingActivity): Promise<DetectionResult | null> {
    if (data.trades.length < 20) return null;

    const winningTrades = data.trades.filter(t => parseFloat(t.realized_pnl) > 0);
    const winRate = winningTrades.length / data.trades.length;

    if (winRate > this.SUSPICIOUS_WIN_RATE_THRESHOLD) {
      return {
        type: "suspicious_win_rate",
        severity: winRate > 0.99 ? "critical" : winRate > 0.97 ? "high" : "medium",
        title: "Suspiciously High Win Rate",
        description: `Win rate of ${(winRate * 100).toFixed(1)}% over ${data.trades.length} trades`,
        detectionData: {
          win_rate: (winRate * 100).toFixed(2),
          winning_trades: winningTrades.length,
          total_trades: data.trades.length,
          threshold: (this.SUSPICIOUS_WIN_RATE_THRESHOLD * 100).toFixed(0),
        },
        activityStart: data.timeWindow.start,
        activityEnd: data.timeWindow.end,
      };
    }

    return null;
  }

  async analyzeCampaign(campaignId: string, daysBack: number = 7): Promise<DetectionResult[]> {
    const campaign = await db.select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);

    if (campaign.length === 0) return [];

    const timeWindow = {
      start: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
      end: new Date(),
    };

    const portfolioId = campaign[0].portfolio_id;
    const [positions, trades, orders] = await Promise.all([
      db.select().from(schema.positions)
        .where(and(
          eq(schema.positions.portfolio_id, portfolioId),
          gte(schema.positions.opened_at, timeWindow.start)
        )),
      db.select().from(schema.trades)
        .where(and(
          eq(schema.trades.portfolio_id, campaign[0].portfolio_id!),
          gte(schema.trades.closed_at, timeWindow.start),
          lte(schema.trades.closed_at, timeWindow.end)
        )),
      db.select().from(schema.orders)
        .where(and(
          eq(schema.orders.portfolio_id, campaign[0].portfolio_id!),
          gte(schema.orders.created_at, timeWindow.start)
        )),
    ]);

    const activity: TradingActivity = {
      campaignId,
      franchiseId: campaign[0].franchise_id || undefined,
      positions,
      trades,
      orders,
      timeWindow,
    };

    const results: DetectionResult[] = [];

    for (const rule of this.detectionRules) {
      const result = await rule.check(activity);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  async analyzeAllActiveCampaigns(): Promise<{ campaignId: string; alerts: DetectionResult[] }[]> {
    const activeCampaigns = await db.select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.status, "active"));

    const results: { campaignId: string; alerts: DetectionResult[] }[] = [];

    for (const campaign of activeCampaigns) {
      const alerts = await this.analyzeCampaign(campaign.id);
      if (alerts.length > 0) {
        results.push({ campaignId: campaign.id, alerts });
      }
    }

    return results;
  }

  private generateAlertSignature(
    result: DetectionResult,
    context: { campaignId?: string }
  ): string {
    // Create a unique signature from core detection attributes
    // This allows same-type alerts with different detection data to be created
    const signatureComponents = [
      result.type,
      context.campaignId || 'no-campaign',
      result.symbol || 'no-symbol',
      result.activityStart?.toISOString().split('T')[0] || 'no-date',
      result.activityEnd?.toISOString().split('T')[0] || 'no-date',
      // Include key detection data to differentiate distinct findings
      JSON.stringify(result.detectionData),
    ];
    return signatureComponents.join('|');
  }

  async createAlert(
    result: DetectionResult,
    context: { franchiseId?: string; campaignId?: string; userId?: string }
  ): Promise<schema.FraudAlert | null> {
    // Generate signature for deduplication
    const signature = this.generateAlertSignature(result, context);
    
    // Check for existing alert with same signature in detection_data
    // We store the signature in detection_data._signature field
    const existingConditions = [
      eq(schema.fraud_alerts.alert_type, result.type),
      sql`${schema.fraud_alerts.status} IN ('new', 'investigating')`,
    ];
    
    if (context.campaignId) {
      existingConditions.push(eq(schema.fraud_alerts.campaign_id, context.campaignId));
    }
    
    // Check if alert with matching signature already exists
    const existing = await db.select({ 
      id: schema.fraud_alerts.id,
      detection_data: schema.fraud_alerts.detection_data 
    })
      .from(schema.fraud_alerts)
      .where(and(...existingConditions));
    
    // Check if any existing alert has the same signature
    for (const alert of existing) {
      const existingSignature = (alert.detection_data as Record<string, unknown>)?._signature;
      if (existingSignature === signature) {
        // Exact duplicate - skip
        return null;
      }
    }
    
    // Store signature in detection_data for future dedupe checks
    const detectionDataWithSignature = {
      ...result.detectionData,
      _signature: signature,
    };
    
    const [alert] = await db.insert(schema.fraud_alerts)
      .values({
        franchise_id: context.franchiseId,
        campaign_id: context.campaignId,
        user_id: context.userId,
        alert_type: result.type,
        severity: result.severity,
        status: "new",
        title: result.title,
        description: result.description,
        detection_data: detectionDataWithSignature,
        symbol: result.symbol,
        activity_start: result.activityStart,
        activity_end: result.activityEnd,
      })
      .returning();

    return alert;
  }

  async runFullScan(): Promise<{
    scanned: number;
    alertsCreated: number;
    errors: string[];
  }> {
    let scanned = 0;
    let alertsCreated = 0;
    const errors: string[] = [];

    try {
      const campaignResults = await this.analyzeAllActiveCampaigns();
      scanned = campaignResults.length;

      for (const { campaignId, alerts } of campaignResults) {
        for (const alert of alerts) {
          try {
            const campaignWithPortfolio = await db.select({
              campaign: schema.campaigns,
              portfolio: schema.portfolios
            })
              .from(schema.campaigns)
              .innerJoin(schema.portfolios, eq(schema.campaigns.portfolio_id, schema.portfolios.id))
              .where(eq(schema.campaigns.id, campaignId))
              .limit(1);

            const created = await this.createAlert(alert, {
              campaignId,
              franchiseId: campaignWithPortfolio[0]?.campaign.franchise_id || undefined,
              userId: campaignWithPortfolio[0]?.portfolio.user_id,
            });
            if (created) alertsCreated++;
          } catch (error) {
            errors.push(`Failed to create alert for campaign ${campaignId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    } catch (error) {
      errors.push(`Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { scanned, alertsCreated, errors };
  }

  async getAlerts(filters?: {
    franchiseId?: string;
    campaignId?: string;
    status?: AlertStatus;
    severity?: AlertSeverity;
    type?: AlertType;
    limit?: number;
    offset?: number;
  }): Promise<{ alerts: schema.FraudAlert[]; total: number }> {
    const conditions = [];

    if (filters?.franchiseId) {
      conditions.push(eq(schema.fraud_alerts.franchise_id, filters.franchiseId));
    }
    if (filters?.campaignId) {
      conditions.push(eq(schema.fraud_alerts.campaign_id, filters.campaignId));
    }
    if (filters?.status) {
      conditions.push(eq(schema.fraud_alerts.status, filters.status));
    }
    if (filters?.severity) {
      conditions.push(eq(schema.fraud_alerts.severity, filters.severity));
    }
    if (filters?.type) {
      conditions.push(eq(schema.fraud_alerts.alert_type, filters.type));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [alerts, countResult] = await Promise.all([
      db.select()
        .from(schema.fraud_alerts)
        .where(whereClause)
        .orderBy(desc(schema.fraud_alerts.created_at))
        .limit(filters?.limit || 50)
        .offset(filters?.offset || 0),
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.fraud_alerts)
        .where(whereClause),
    ]);

    return { alerts, total: countResult[0]?.count || 0 };
  }

  async getAlertById(alertId: string): Promise<schema.FraudAlert | null> {
    const result = await db.select()
      .from(schema.fraud_alerts)
      .where(eq(schema.fraud_alerts.id, alertId))
      .limit(1);
    return result[0] || null;
  }

  async updateAlertStatus(
    alertId: string,
    status: AlertStatus,
    investigatedBy?: string,
    resolutionNotes?: string
  ): Promise<schema.FraudAlert | null> {
    const updateData: Partial<schema.FraudAlert> = {
      status,
      updated_at: new Date(),
    };

    if (status === "investigating" || status === "dismissed" || status === "confirmed") {
      if (investigatedBy) {
        updateData.investigated_by = investigatedBy;
        updateData.investigated_at = new Date();
      }
    }

    if (resolutionNotes) {
      updateData.resolution_notes = resolutionNotes;
    }

    const [updated] = await db.update(schema.fraud_alerts)
      .set(updateData)
      .where(eq(schema.fraud_alerts.id, alertId))
      .returning();

    return updated || null;
  }

  async getStats(franchiseId?: string): Promise<FraudStats> {
    const conditions = franchiseId 
      ? eq(schema.fraud_alerts.franchise_id, franchiseId) 
      : undefined;

    const alerts = await db.select()
      .from(schema.fraud_alerts)
      .where(conditions);

    const stats: FraudStats = {
      totalAlerts: alerts.length,
      newAlerts: 0,
      investigatingAlerts: 0,
      confirmedAlerts: 0,
      dismissedAlerts: 0,
      byType: {},
      bySeverity: {},
    };

    for (const alert of alerts) {
      switch (alert.status) {
        case "new": stats.newAlerts++; break;
        case "investigating": stats.investigatingAlerts++; break;
        case "confirmed": stats.confirmedAlerts++; break;
        case "dismissed": stats.dismissedAlerts++; break;
      }

      stats.byType[alert.alert_type] = (stats.byType[alert.alert_type] || 0) + 1;
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
    }

    return stats;
  }
}

export const antiFraudService = new AntiFraudService();
