import crypto from 'crypto';
import { db } from '../../db';
import { eq, desc, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';

interface CampaignHashData {
  portfolio_id: string;
  name: string;
  investor_profile: string;
  initial_capital: string;
  max_drawdown_percentage: string;
  risk_config: Record<string, any> | null;
  selection_config: Record<string, any> | null;
  start_date: Date;
  end_date: Date;
}

interface LedgerEntryData {
  campaignId: string;
  eventType: string;
  severity?: 'info' | 'warning' | 'critical' | 'audit';
  eventData: Record<string, any>;
  actorType: 'system' | 'user' | 'admin' | 'robot';
  actorId?: string;
  sign?: boolean;
}

interface IntegrityCheckResult {
  valid: boolean;
  errors: string[];
  checkedEntries: number;
  brokenChainAt?: number;
}

const SIGNING_KEY = process.env.ENCRYPTION_KEY || 'delfos-governance-signing-key';

class CampaignGovernanceService {
  
  generateCampaignHash(data: CampaignHashData): string {
    const hashInput = JSON.stringify({
      portfolio_id: data.portfolio_id,
      name: data.name,
      investor_profile: data.investor_profile,
      initial_capital: data.initial_capital,
      max_drawdown_percentage: data.max_drawdown_percentage,
      risk_config: data.risk_config,
      selection_config: data.selection_config,
      start_date: data.start_date.toISOString(),
      end_date: data.end_date.toISOString(),
    });
    
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  async lockCampaign(campaignId: string, lockedBy: string = 'system'): Promise<boolean> {
    const [campaign] = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }
    
    if (campaign.is_locked) {
      console.log(`[CampaignGovernance] Campaign ${campaignId} already locked`);
      return true;
    }

    const lockHash = this.generateCampaignHash({
      portfolio_id: campaign.portfolio_id,
      name: campaign.name,
      investor_profile: campaign.investor_profile,
      initial_capital: campaign.initial_capital,
      max_drawdown_percentage: campaign.max_drawdown_percentage,
      risk_config: campaign.risk_config as Record<string, any> | null,
      selection_config: campaign.selection_config as Record<string, any> | null,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
    });

    await db.update(schema.campaigns)
      .set({
        is_locked: true,
        locked_at: new Date(),
        locked_by: lockedBy,
        lock_hash: lockHash,
        creation_hash: campaign.creation_hash || lockHash,
      })
      .where(eq(schema.campaigns.id, campaignId));

    await this.appendToLedger({
      campaignId,
      eventType: 'campaign_locked',
      severity: 'critical',
      eventData: {
        lock_hash: lockHash,
        locked_by: lockedBy,
        initial_capital: campaign.initial_capital,
        investor_profile: campaign.investor_profile,
      },
      actorType: lockedBy === 'system' ? 'system' : 'user',
      actorId: lockedBy,
      sign: true,
    });

    console.log(`[CampaignGovernance] Campaign ${campaignId} LOCKED | Hash: ${lockHash.substring(0, 16)}...`);
    return true;
  }

  async verifyIntegrity(campaignId: string): Promise<boolean> {
    const [campaign] = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    if (!campaign.is_locked || !campaign.lock_hash) {
      console.log(`[CampaignGovernance] Campaign ${campaignId} not locked, skipping verification`);
      return true;
    }

    const currentHash = this.generateCampaignHash({
      portfolio_id: campaign.portfolio_id,
      name: campaign.name,
      investor_profile: campaign.investor_profile,
      initial_capital: campaign.initial_capital,
      max_drawdown_percentage: campaign.max_drawdown_percentage,
      risk_config: campaign.risk_config as Record<string, any> | null,
      selection_config: campaign.selection_config as Record<string, any> | null,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
    });

    const isValid = currentHash === campaign.lock_hash;

    if (!isValid) {
      console.error(`[CampaignGovernance] INTEGRITY VIOLATION for campaign ${campaignId}`);
      console.error(`[CampaignGovernance] Expected: ${campaign.lock_hash}`);
      console.error(`[CampaignGovernance] Got: ${currentHash}`);

      await this.appendToLedger({
        campaignId,
        eventType: 'integrity_violation',
        severity: 'critical',
        eventData: {
          expected_hash: campaign.lock_hash,
          actual_hash: currentHash,
          violation_detected_at: new Date().toISOString(),
        },
        actorType: 'system',
        sign: true,
      });
    }

    return isValid;
  }

  async appendToLedger(entry: LedgerEntryData): Promise<schema.CampaignAuditLedger> {
    const [lastEntry] = await db.select()
      .from(schema.campaign_audit_ledger)
      .where(eq(schema.campaign_audit_ledger.campaign_id, entry.campaignId))
      .orderBy(desc(schema.campaign_audit_ledger.sequence_number))
      .limit(1);

    const sequenceNumber = (lastEntry?.sequence_number || 0) + 1;
    const previousHash = lastEntry?.entry_hash || null;

    const entryData = {
      campaign_id: entry.campaignId,
      sequence_number: sequenceNumber,
      event_type: entry.eventType,
      severity: entry.severity || 'info',
      event_data: entry.eventData,
      previous_hash: previousHash,
      actor_type: entry.actorType,
      actor_id: entry.actorId,
    };

    const entryHash = this.generateEntryHash(entryData);

    let signature: string | undefined;
    let signatureAlgorithm: string | undefined;
    let signedBy: string | undefined;

    if (entry.sign) {
      signature = this.signEntry(entryHash);
      signatureAlgorithm = 'HMAC-SHA256';
      signedBy = 'system';
    }

    const [insertedEntry] = await db.insert(schema.campaign_audit_ledger).values({
      ...entryData,
      entry_hash: entryHash,
      signature,
      signature_algorithm: signatureAlgorithm,
      signed_by: signedBy,
    }).returning();

    console.log(`[CampaignGovernance] Ledger entry #${sequenceNumber} for campaign ${entry.campaignId} | Type: ${entry.eventType}`);
    
    return insertedEntry;
  }

  private generateEntryHash(data: Record<string, any>): string {
    const hashInput = JSON.stringify({
      ...data,
      timestamp: new Date().toISOString(),
    });
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  private signEntry(entryHash: string): string {
    return crypto
      .createHmac('sha256', SIGNING_KEY)
      .update(entryHash)
      .digest('hex');
  }

  verifySignature(entryHash: string, signature: string): boolean {
    const expectedSignature = this.signEntry(entryHash);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  async verifyLedgerChain(campaignId: string): Promise<IntegrityCheckResult> {
    const entries = await db.select()
      .from(schema.campaign_audit_ledger)
      .where(eq(schema.campaign_audit_ledger.campaign_id, campaignId))
      .orderBy(schema.campaign_audit_ledger.sequence_number);

    const result: IntegrityCheckResult = {
      valid: true,
      errors: [],
      checkedEntries: entries.length,
    };

    if (entries.length === 0) {
      return result;
    }

    if (entries[0].previous_hash !== null) {
      result.valid = false;
      result.errors.push('First entry should have null previous_hash');
      result.brokenChainAt = 1;
    }

    for (let i = 1; i < entries.length; i++) {
      const currentEntry = entries[i];
      const previousEntry = entries[i - 1];

      if (currentEntry.previous_hash !== previousEntry.entry_hash) {
        result.valid = false;
        result.errors.push(
          `Chain broken at entry #${currentEntry.sequence_number}: ` +
          `previous_hash mismatch (expected: ${previousEntry.entry_hash?.substring(0, 16)}..., ` +
          `got: ${currentEntry.previous_hash?.substring(0, 16)}...)`
        );
        result.brokenChainAt = currentEntry.sequence_number;
        break;
      }

      if (currentEntry.signature && currentEntry.entry_hash) {
        if (!this.verifySignature(currentEntry.entry_hash, currentEntry.signature)) {
          result.valid = false;
          result.errors.push(
            `Invalid signature at entry #${currentEntry.sequence_number}`
          );
        }
      }
    }

    if (result.valid) {
      console.log(`[CampaignGovernance] Ledger chain VALID for campaign ${campaignId} (${entries.length} entries)`);
    } else {
      console.error(`[CampaignGovernance] Ledger chain INVALID for campaign ${campaignId}:`, result.errors);
    }

    return result;
  }

  async getLedgerHistory(campaignId: string, limit: number = 100): Promise<schema.CampaignAuditLedger[]> {
    return db.select()
      .from(schema.campaign_audit_ledger)
      .where(eq(schema.campaign_audit_ledger.campaign_id, campaignId))
      .orderBy(desc(schema.campaign_audit_ledger.sequence_number))
      .limit(limit);
  }

  async canModifyCampaign(campaignId: string): Promise<{ allowed: boolean; reason?: string }> {
    const [campaign] = await db.select({
      is_locked: schema.campaigns.is_locked,
      status: schema.campaigns.status,
    }).from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));

    if (!campaign) {
      return { allowed: false, reason: 'Campaign not found' };
    }

    if (campaign.is_locked) {
      return { allowed: false, reason: 'Campaign is locked and cannot be modified' };
    }

    if (['active', 'paused'].includes(campaign.status)) {
      return { allowed: false, reason: 'Campaign is active/paused and cannot be modified' };
    }

    return { allowed: true };
  }

  async logCampaignCreated(campaignId: string, campaign: schema.Campaign, createdBy?: string): Promise<void> {
    await this.appendToLedger({
      campaignId,
      eventType: 'campaign_created',
      severity: 'audit',
      eventData: {
        portfolio_id: campaign.portfolio_id,
        name: campaign.name,
        investor_profile: campaign.investor_profile,
        initial_capital: campaign.initial_capital,
        max_drawdown_percentage: campaign.max_drawdown_percentage,
        start_date: campaign.start_date.toISOString(),
        end_date: campaign.end_date.toISOString(),
      },
      actorType: createdBy ? 'user' : 'system',
      actorId: createdBy,
      sign: true,
    });
  }

  async logPositionOpened(
    campaignId: string, 
    position: { symbol: string; side: string; quantity: string; entry_price: string; stop_loss: string; take_profit: string }
  ): Promise<void> {
    await this.appendToLedger({
      campaignId,
      eventType: 'position_opened',
      severity: 'info',
      eventData: position,
      actorType: 'robot',
      actorId: 'campaign_engine',
    });
  }

  async logPositionClosed(
    campaignId: string,
    position: { symbol: string; side: string; realized_pnl: string; pnl_in_r: string; reason: string }
  ): Promise<void> {
    await this.appendToLedger({
      campaignId,
      eventType: 'position_closed',
      severity: 'info',
      eventData: position,
      actorType: 'robot',
      actorId: 'campaign_engine',
    });
  }

  async logCircuitBreakerTriggered(
    campaignId: string,
    data: { level: string; reason: string; value: number; threshold: number }
  ): Promise<void> {
    await this.appendToLedger({
      campaignId,
      eventType: 'circuit_breaker_triggered',
      severity: 'warning',
      eventData: data,
      actorType: 'robot',
      actorId: 'campaign_engine',
    });
  }

  async logReconciliationCompleted(
    campaignId: string,
    reconciliationId: string,
    data: { status: string; discrepancy_count: number }
  ): Promise<void> {
    await this.appendToLedger({
      campaignId,
      eventType: 'reconciliation_completed',
      severity: data.discrepancy_count > 0 ? 'warning' : 'info',
      eventData: {
        reconciliation_id: reconciliationId,
        ...data,
      },
      actorType: 'system',
      actorId: 'reconciliation_service',
      sign: data.discrepancy_count > 0,
    });
  }

  async logAuditCompleted(
    campaignId: string,
    data: { audit_type: string; metrics: Record<string, any> }
  ): Promise<void> {
    await this.appendToLedger({
      campaignId,
      eventType: 'audit_24h_completed',
      severity: 'audit',
      eventData: data,
      actorType: 'robot',
      actorId: 'campaign_engine',
      sign: true,
    });
  }
}

export const campaignGovernanceService = new CampaignGovernanceService();
