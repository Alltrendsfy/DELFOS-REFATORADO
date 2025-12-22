import { db } from '../../db';
import { 
  master_fraud_events, 
  master_fraud_alerts,
  master_accounts,
  territory_definitions,
  regional_franchise_links,
  InsertMasterFraudEvent,
  MasterFraudEvent
} from '@shared/schema';
import { eq, desc, and, gte, lte, sql, or, count } from 'drizzle-orm';
import territoryService from './territoryService';

// Fraud types matching replit.md definitions
export const FRAUD_TYPES = {
  TERRITORY_OVERREACH: 'MASTER_TERRITORY_OVERREACH',
  UNAUTHORIZED_SALE: 'MASTER_UNAUTHORIZED_SALE', 
  OVERLAP_BREACH: 'MASTER_OVERLAP_BREACH',
  SELF_SPLIT_ATTEMPT: 'MASTER_SELF_SPLIT_ATTEMPT',
  DATA_MANIPULATION: 'MASTER_DATA_MANIPULATION',
  PRIVILEGE_ESCALATION: 'MASTER_PRIVILEGE_ESCALATION'
} as const;

export type FraudType = typeof FRAUD_TYPES[keyof typeof FRAUD_TYPES];

export const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

export type SeverityLevel = typeof SEVERITY_LEVELS[keyof typeof SEVERITY_LEVELS];

export const FRAUD_STATUS = {
  DETECTED: 'detected',
  INVESTIGATING: 'investigating',
  CONFIRMED: 'confirmed',
  FALSE_POSITIVE: 'false_positive',
  RESOLVED: 'resolved',
  ESCALATED: 'escalated'
} as const;

export type FraudStatus = typeof FRAUD_STATUS[keyof typeof FRAUD_STATUS];

export const ACTION_TYPES = {
  BLOCKED: 'blocked',
  WARNED: 'warned',
  SUSPENDED: 'suspended',
  REPORTED_TO_HQ: 'reported_to_hq',
  NONE: 'none'
} as const;

export type ActionType = typeof ACTION_TYPES[keyof typeof ACTION_TYPES];

interface FraudDetectionContext {
  masterId: string;
  fraudType: FraudType;
  severity: SeverityLevel;
  detectionSource: 'automatic' | 'manual_report' | 'audit' | 'system_check';
  evidence: Record<string, any>;
  relatedTerritoryId?: string;
  relatedFranchiseId?: string;
  relatedAmount?: number;
  ipAddress?: string;
  userAgent?: string;
}

interface FraudActionContext {
  eventId: string;
  action: ActionType;
  actionDetails: string;
  actionBy: string;
}

interface TerritoryCheckContext {
  masterId: string;
  targetLocation: {
    country?: string;
    state?: string;
    municipality?: string;
    zipCode?: string;
  };
  actionType: 'franchise_sale' | 'operation' | 'data_access';
}

class MasterAntifraudService {
  
  // ========== FRAUD DETECTION ==========
  
  async detectFraud(context: FraudDetectionContext): Promise<{ 
    success: boolean; 
    eventId?: string; 
    autoAction?: ActionType;
    error?: string 
  }> {
    try {
      // Verify master exists
      const master = await db.select()
        .from(master_accounts)
        .where(eq(master_accounts.id, context.masterId))
        .limit(1);
      
      if (master.length === 0) {
        return { success: false, error: 'Master account not found' };
      }

      // Check for duplicate recent events (within 5 minutes)
      const recentDuplicate = await db.select()
        .from(master_fraud_events)
        .where(and(
          eq(master_fraud_events.master_id, context.masterId),
          eq(master_fraud_events.fraud_type, context.fraudType),
          gte(master_fraud_events.detection_timestamp, new Date(Date.now() - 5 * 60 * 1000))
        ))
        .limit(1);
      
      if (recentDuplicate.length > 0) {
        return { 
          success: true, 
          eventId: recentDuplicate[0].id,
          autoAction: ACTION_TYPES.NONE 
        };
      }

      // Determine automatic action based on severity and fraud type
      const autoAction = this.determineAutoAction(context.fraudType, context.severity);

      // Create fraud event
      const [newEvent] = await db.insert(master_fraud_events).values({
        master_id: context.masterId,
        fraud_type: context.fraudType,
        severity: context.severity,
        status: FRAUD_STATUS.DETECTED,
        detection_source: context.detectionSource,
        evidence_snapshot: context.evidence,
        related_territory_id: context.relatedTerritoryId,
        related_franchise_id: context.relatedFranchiseId,
        related_transaction_amount: context.relatedAmount?.toString(),
        ip_address: context.ipAddress,
        user_agent: context.userAgent,
        action_taken: autoAction,
        action_details: autoAction !== ACTION_TYPES.NONE 
          ? `Automatic action: ${autoAction}` 
          : undefined,
        action_timestamp: autoAction !== ACTION_TYPES.NONE 
          ? new Date() 
          : undefined,
      }).returning();

      // Execute automatic action if needed
      if (autoAction === ACTION_TYPES.SUSPENDED) {
        await this.autoSuspendMaster(context.masterId, newEvent.id, context.fraudType);
      }

      // Create alerts for critical/high severity
      if (context.severity === SEVERITY_LEVELS.CRITICAL || context.severity === SEVERITY_LEVELS.HIGH) {
        await this.createFraudAlerts(newEvent.id, context);
      }

      return { 
        success: true, 
        eventId: newEvent.id,
        autoAction 
      };
    } catch (error) {
      console.error('Error detecting fraud:', error);
      return { success: false, error: 'Failed to record fraud event' };
    }
  }

  private determineAutoAction(fraudType: FraudType, severity: SeverityLevel): ActionType {
    // Critical severity always suspends
    if (severity === SEVERITY_LEVELS.CRITICAL) {
      return ACTION_TYPES.SUSPENDED;
    }

    // High severity for certain fraud types
    if (severity === SEVERITY_LEVELS.HIGH) {
      const criticalFraudTypes: string[] = [
        FRAUD_TYPES.PRIVILEGE_ESCALATION,
        FRAUD_TYPES.DATA_MANIPULATION,
        FRAUD_TYPES.SELF_SPLIT_ATTEMPT
      ];
      if (criticalFraudTypes.includes(fraudType)) {
        return ACTION_TYPES.SUSPENDED;
      }
      return ACTION_TYPES.REPORTED_TO_HQ;
    }

    // Medium severity gets warning
    if (severity === SEVERITY_LEVELS.MEDIUM) {
      return ACTION_TYPES.WARNED;
    }

    // Low severity - no automatic action
    return ACTION_TYPES.NONE;
  }

  private async autoSuspendMaster(masterId: string, eventId: string, fraudType: FraudType): Promise<void> {
    try {
      await db.update(master_accounts)
        .set({ 
          status: 'suspended',
          updated_at: new Date()
        })
        .where(eq(master_accounts.id, masterId));
      
      console.log(`[ANTIFRAUD] Master ${masterId} auto-suspended due to ${fraudType} (Event: ${eventId})`);
    } catch (error) {
      console.error('Error auto-suspending master:', error);
    }
  }

  private async createFraudAlerts(eventId: string, context: FraudDetectionContext): Promise<void> {
    try {
      const priority = context.severity === SEVERITY_LEVELS.CRITICAL ? 'urgent' : 'high';
      
      // Create in-app alert for HQ
      await db.insert(master_fraud_alerts).values({
        fraud_event_id: eventId,
        alert_type: 'in_app',
        alert_title: `[${context.severity.toUpperCase()}] Fraud Detected: ${context.fraudType}`,
        alert_message: `A ${context.severity} severity fraud event was detected for Master ID: ${context.masterId}. Type: ${context.fraudType}. Immediate review required.`,
        alert_priority: priority,
        status: 'pending'
      });

      console.log(`[ANTIFRAUD] Alert created for fraud event ${eventId}`);
    } catch (error) {
      console.error('Error creating fraud alerts:', error);
    }
  }

  // ========== TERRITORY VALIDATION (Prevention) ==========

  async validateTerritoryAction(context: TerritoryCheckContext): Promise<{
    allowed: boolean;
    fraudDetected: boolean;
    fraudEventId?: string;
    reason?: string;
  }> {
    try {
      // Get master and their territory
      const master = await db.select()
        .from(master_accounts)
        .where(eq(master_accounts.id, context.masterId))
        .limit(1);
      
      if (master.length === 0) {
        return { 
          allowed: false, 
          fraudDetected: false, 
          reason: 'Master account not found' 
        };
      }

      // Check if master is active
      if (master[0].status !== 'active') {
        return { 
          allowed: false, 
          fraudDetected: false, 
          reason: `Master account is ${master[0].status}` 
        };
      }

      // Get territory definition
      const territory = await db.select()
        .from(territory_definitions)
        .where(eq(territory_definitions.id, master[0].territory_definition_id))
        .limit(1);
      
      if (territory.length === 0) {
        return { 
          allowed: false, 
          fraudDetected: false, 
          reason: 'Territory not found' 
        };
      }

      // Validate location is within territory
      const locationValid = await territoryService.validateLocationInTerritory(
        territory[0].id,
        context.targetLocation
      );

      if (!locationValid) {
        // FRAUD DETECTED: Territory Overreach
        const fraudResult = await this.detectFraud({
          masterId: context.masterId,
          fraudType: FRAUD_TYPES.TERRITORY_OVERREACH,
          severity: context.actionType === 'franchise_sale' 
            ? SEVERITY_LEVELS.HIGH 
            : SEVERITY_LEVELS.MEDIUM,
          detectionSource: 'automatic',
          evidence: {
            action_type: context.actionType,
            target_location: context.targetLocation,
            territory_id: territory[0].id,
            territory_name: territory[0].name,
            timestamp: new Date().toISOString()
          },
          relatedTerritoryId: territory[0].id
        });

        return {
          allowed: false,
          fraudDetected: true,
          fraudEventId: fraudResult.eventId,
          reason: 'Location is outside authorized territory'
        };
      }

      return { 
        allowed: true, 
        fraudDetected: false 
      };
    } catch (error) {
      console.error('Error validating territory action:', error);
      return { 
        allowed: false, 
        fraudDetected: false, 
        reason: 'Validation error' 
      };
    }
  }

  // ========== SELF-ROYALTY PREVENTION ==========

  async checkSelfRoyaltyAttempt(
    masterId: string, 
    franchiseeAccountId: string,
    transactionAmount: number
  ): Promise<{
    isSelfRoyalty: boolean;
    fraudEventId?: string;
  }> {
    try {
      // Get master's own franchise account
      const master = await db.select()
        .from(master_accounts)
        .where(eq(master_accounts.id, masterId))
        .limit(1);
      
      if (master.length === 0) {
        return { isSelfRoyalty: false };
      }

      // Check if franchisee is the master's own operating account
      if (master[0].franchisee_account_id === franchiseeAccountId) {
        // FRAUD DETECTED: Self Split Attempt
        const fraudResult = await this.detectFraud({
          masterId,
          fraudType: FRAUD_TYPES.SELF_SPLIT_ATTEMPT,
          severity: SEVERITY_LEVELS.HIGH,
          detectionSource: 'automatic',
          evidence: {
            franchisee_account_id: franchiseeAccountId,
            transaction_amount: transactionAmount,
            master_franchisee_account: master[0].franchisee_account_id,
            timestamp: new Date().toISOString()
          },
          relatedFranchiseId: franchiseeAccountId,
          relatedAmount: transactionAmount
        });

        return {
          isSelfRoyalty: true,
          fraudEventId: fraudResult.eventId
        };
      }

      return { isSelfRoyalty: false };
    } catch (error) {
      console.error('Error checking self-royalty:', error);
      return { isSelfRoyalty: false };
    }
  }

  // ========== PRIVILEGE ESCALATION DETECTION ==========

  async detectPrivilegeEscalation(
    masterId: string,
    attemptedAction: string,
    resourceType: string,
    ipAddress?: string
  ): Promise<{
    blocked: boolean;
    fraudEventId?: string;
  }> {
    // List of privileged actions Masters should NOT have access to
    const privilegedActions = [
      'modify_system_config',
      'access_other_master_data',
      'modify_franchise_plan_core',
      'access_global_financial_data',
      'modify_territory_engine_rules',
      'access_audit_logs_all',
      'modify_antifraud_rules'
    ];

    if (privilegedActions.includes(attemptedAction)) {
      const fraudResult = await this.detectFraud({
        masterId,
        fraudType: FRAUD_TYPES.PRIVILEGE_ESCALATION,
        severity: SEVERITY_LEVELS.CRITICAL,
        detectionSource: 'automatic',
        evidence: {
          attempted_action: attemptedAction,
          resource_type: resourceType,
          timestamp: new Date().toISOString()
        },
        ipAddress
      });

      return {
        blocked: true,
        fraudEventId: fraudResult.eventId
      };
    }

    return { blocked: false };
  }

  // ========== DATA MANIPULATION DETECTION ==========

  async detectDataManipulation(
    masterId: string,
    dataType: string,
    operation: 'read' | 'write' | 'delete',
    affectedRecords: number,
    ipAddress?: string
  ): Promise<{
    suspicious: boolean;
    fraudEventId?: string;
  }> {
    // Thresholds for suspicious activity
    const thresholds = {
      bulk_read: 100,
      bulk_write: 50,
      bulk_delete: 10
    };

    const threshold = thresholds[`bulk_${operation}` as keyof typeof thresholds];
    
    if (threshold && affectedRecords > threshold) {
      const fraudResult = await this.detectFraud({
        masterId,
        fraudType: FRAUD_TYPES.DATA_MANIPULATION,
        severity: operation === 'delete' 
          ? SEVERITY_LEVELS.CRITICAL 
          : SEVERITY_LEVELS.HIGH,
        detectionSource: 'automatic',
        evidence: {
          data_type: dataType,
          operation,
          affected_records: affectedRecords,
          threshold_exceeded: threshold,
          timestamp: new Date().toISOString()
        },
        ipAddress
      });

      return {
        suspicious: true,
        fraudEventId: fraudResult.eventId
      };
    }

    return { suspicious: false };
  }

  // ========== FRAUD EVENT MANAGEMENT ==========

  async updateFraudStatus(
    eventId: string,
    newStatus: FraudStatus,
    notes?: string,
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: Record<string, any> = {
        status: newStatus,
        updated_at: new Date()
      };

      if (newStatus === FRAUD_STATUS.RESOLVED) {
        updateData.resolved_at = new Date();
        updateData.resolved_by = userId;
        updateData.resolution_notes = notes;
      }

      if (newStatus === FRAUD_STATUS.ESCALATED) {
        updateData.escalated_to_hq = true;
        updateData.escalation_timestamp = new Date();
        updateData.escalation_reference = `ESC-${Date.now()}`;
      }

      await db.update(master_fraud_events)
        .set(updateData)
        .where(eq(master_fraud_events.id, eventId));

      return { success: true };
    } catch (error) {
      console.error('Error updating fraud status:', error);
      return { success: false, error: 'Failed to update fraud status' };
    }
  }

  async recordAction(context: FraudActionContext): Promise<{ success: boolean; error?: string }> {
    try {
      await db.update(master_fraud_events)
        .set({
          action_taken: context.action,
          action_details: context.actionDetails,
          action_timestamp: new Date(),
          action_by: context.actionBy,
          updated_at: new Date()
        })
        .where(eq(master_fraud_events.id, context.eventId));

      return { success: true };
    } catch (error) {
      console.error('Error recording fraud action:', error);
      return { success: false, error: 'Failed to record action' };
    }
  }

  // ========== FRAUD QUERIES ==========

  async getFraudEventById(eventId: string): Promise<MasterFraudEvent | null> {
    const result = await db.select()
      .from(master_fraud_events)
      .where(eq(master_fraud_events.id, eventId))
      .limit(1);
    
    return result[0] || null;
  }

  async listFraudEvents(filters: {
    masterId?: string;
    fraudType?: FraudType;
    status?: FraudStatus;
    severity?: SeverityLevel;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ events: MasterFraudEvent[]; total: number }> {
    const conditions = [];
    
    if (filters.masterId) {
      conditions.push(eq(master_fraud_events.master_id, filters.masterId));
    }
    if (filters.fraudType) {
      conditions.push(eq(master_fraud_events.fraud_type, filters.fraudType));
    }
    if (filters.status) {
      conditions.push(eq(master_fraud_events.status, filters.status));
    }
    if (filters.severity) {
      conditions.push(eq(master_fraud_events.severity, filters.severity));
    }
    if (filters.startDate) {
      conditions.push(gte(master_fraud_events.detection_timestamp, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(master_fraud_events.detection_timestamp, filters.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [events, totalResult] = await Promise.all([
      db.select()
        .from(master_fraud_events)
        .where(whereClause)
        .orderBy(desc(master_fraud_events.detection_timestamp))
        .limit(filters.limit || 50)
        .offset(filters.offset || 0),
      db.select({ count: count() })
        .from(master_fraud_events)
        .where(whereClause)
    ]);

    return {
      events,
      total: totalResult[0]?.count || 0
    };
  }

  async getMasterFraudSummary(masterId: string): Promise<{
    totalEvents: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    recentEvents: MasterFraudEvent[];
  }> {
    const [events, statusCounts, severityCounts, typeCounts] = await Promise.all([
      db.select()
        .from(master_fraud_events)
        .where(eq(master_fraud_events.master_id, masterId))
        .orderBy(desc(master_fraud_events.detection_timestamp))
        .limit(10),
      
      db.select({
        status: master_fraud_events.status,
        count: count()
      })
        .from(master_fraud_events)
        .where(eq(master_fraud_events.master_id, masterId))
        .groupBy(master_fraud_events.status),
      
      db.select({
        severity: master_fraud_events.severity,
        count: count()
      })
        .from(master_fraud_events)
        .where(eq(master_fraud_events.master_id, masterId))
        .groupBy(master_fraud_events.severity),
      
      db.select({
        type: master_fraud_events.fraud_type,
        count: count()
      })
        .from(master_fraud_events)
        .where(eq(master_fraud_events.master_id, masterId))
        .groupBy(master_fraud_events.fraud_type)
    ]);

    const byStatus: Record<string, number> = {};
    statusCounts.forEach(s => { byStatus[s.status] = s.count; });

    const bySeverity: Record<string, number> = {};
    severityCounts.forEach(s => { bySeverity[s.severity] = s.count; });

    const byType: Record<string, number> = {};
    typeCounts.forEach(t => { byType[t.type] = t.count; });

    const totalEvents = Object.values(byStatus).reduce((a, b) => a + b, 0);

    return {
      totalEvents,
      byStatus,
      bySeverity,
      byType,
      recentEvents: events
    };
  }

  // ========== ALERT MANAGEMENT ==========

  async acknowledgeAlert(alertId: string, userId: string): Promise<{ success: boolean }> {
    try {
      await db.update(master_fraud_alerts)
        .set({
          status: 'acknowledged',
          acknowledged_at: new Date(),
          acknowledged_by: userId
        })
        .where(eq(master_fraud_alerts.id, alertId));
      
      return { success: true };
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      return { success: false };
    }
  }

  async getPendingAlerts(limit: number = 50): Promise<any[]> {
    return db.select()
      .from(master_fraud_alerts)
      .where(or(
        eq(master_fraud_alerts.status, 'pending'),
        eq(master_fraud_alerts.status, 'sent')
      ))
      .orderBy(
        sql`CASE WHEN ${master_fraud_alerts.alert_priority} = 'urgent' THEN 1 
            WHEN ${master_fraud_alerts.alert_priority} = 'high' THEN 2 
            WHEN ${master_fraud_alerts.alert_priority} = 'normal' THEN 3 
            ELSE 4 END`,
        desc(master_fraud_alerts.created_at)
      )
      .limit(limit);
  }

  // ========== DASHBOARD STATISTICS ==========

  async getAntifraudDashboard(): Promise<{
    last24Hours: {
      detected: number;
      confirmed: number;
      resolved: number;
      escalated: number;
    };
    last7Days: {
      byType: Record<string, number>;
      bySeverity: Record<string, number>;
    };
    activeMastersWithFraud: number;
    pendingAlerts: number;
  }> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      detected24h,
      confirmed24h,
      resolved24h,
      escalated24h,
      byType7d,
      bySeverity7d,
      activeMasters,
      pendingAlertCount
    ] = await Promise.all([
      db.select({ count: count() })
        .from(master_fraud_events)
        .where(and(
          eq(master_fraud_events.status, 'detected'),
          gte(master_fraud_events.detection_timestamp, last24h)
        )),
      db.select({ count: count() })
        .from(master_fraud_events)
        .where(and(
          eq(master_fraud_events.status, 'confirmed'),
          gte(master_fraud_events.detection_timestamp, last24h)
        )),
      db.select({ count: count() })
        .from(master_fraud_events)
        .where(and(
          eq(master_fraud_events.status, 'resolved'),
          gte(master_fraud_events.resolved_at, last24h)
        )),
      db.select({ count: count() })
        .from(master_fraud_events)
        .where(and(
          eq(master_fraud_events.status, 'escalated'),
          gte(master_fraud_events.detection_timestamp, last24h)
        )),
      db.select({
        type: master_fraud_events.fraud_type,
        count: count()
      })
        .from(master_fraud_events)
        .where(gte(master_fraud_events.detection_timestamp, last7d))
        .groupBy(master_fraud_events.fraud_type),
      db.select({
        severity: master_fraud_events.severity,
        count: count()
      })
        .from(master_fraud_events)
        .where(gte(master_fraud_events.detection_timestamp, last7d))
        .groupBy(master_fraud_events.severity),
      db.selectDistinct({ master_id: master_fraud_events.master_id })
        .from(master_fraud_events)
        .where(and(
          gte(master_fraud_events.detection_timestamp, last7d),
          or(
            eq(master_fraud_events.status, 'detected'),
            eq(master_fraud_events.status, 'investigating'),
            eq(master_fraud_events.status, 'confirmed')
          )
        )),
      db.select({ count: count() })
        .from(master_fraud_alerts)
        .where(eq(master_fraud_alerts.status, 'pending'))
    ]);

    const byType: Record<string, number> = {};
    byType7d.forEach(t => { byType[t.type] = t.count; });

    const bySeverity: Record<string, number> = {};
    bySeverity7d.forEach(s => { bySeverity[s.severity] = s.count; });

    return {
      last24Hours: {
        detected: detected24h[0]?.count || 0,
        confirmed: confirmed24h[0]?.count || 0,
        resolved: resolved24h[0]?.count || 0,
        escalated: escalated24h[0]?.count || 0
      },
      last7Days: {
        byType,
        bySeverity
      },
      activeMastersWithFraud: activeMasters.length,
      pendingAlerts: pendingAlertCount[0]?.count || 0
    };
  }
}

export const masterAntifraudService = new MasterAntifraudService();
