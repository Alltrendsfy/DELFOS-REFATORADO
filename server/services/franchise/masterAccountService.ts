/**
 * Master Account Service
 * 
 * Manages Master Franchise accounts - entities with dual qualification:
 * - COMMERCIAL EXPANSION MASTER: Right to sell franchises within defined territories
 * - DELFOS OPERATING FRANCHISEE: Trading with own capital (no technical privileges)
 * 
 * CRITICAL BUSINESS RULES:
 * - Master's trading does NOT generate auto-split (no self-royalty)
 * - Territory snapshots are IMMUTABLE (prevents future disputes)
 * - Exclusivity can be conditional on performance targets
 * - Violations trigger PAUSE → AUDIT → HQ DECISION workflow
 */

import { db } from "../../db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import {
  master_accounts,
  regional_franchise_links,
  master_performance_targets,
  master_territory_audit_snapshots,
  territory_definitions,
  franchises,
  users,
  type MasterAccount,
  type InsertMasterAccount,
  type RegionalFranchiseLink,
  type InsertRegionalFranchiseLink,
  type MasterPerformanceTarget,
  type InsertMasterPerformanceTarget,
} from "@shared/schema";
import { createHash } from "crypto";
import territoryService from "./territoryService";

// Antifraud integration - lazy loaded to avoid circular dependencies
let antifraudService: any = null;
async function getAntifraudService() {
  if (!antifraudService) {
    const module = await import('./masterAntifraudService');
    antifraudService = module.masterAntifraudService;
  }
  return antifraudService;
}

// ===== Types =====

export interface MasterOnboardingData {
  legal_entity_name: string;
  legal_entity_tax_id: string;
  legal_entity_tax_id_type?: string;
  legal_entity_address?: string;
  legal_entity_country?: string;
  territory_definition_id: string;
  primary_user_id?: string;
  franchise_fee_split_pct?: string;
  royalty_split_pct?: string;
  contract_start_date: Date;
  contract_end_date?: Date;
  contract_renewal_terms?: string;
  master_contract_id?: string;
}

export interface RevenueSplitResult {
  masterId: string;
  masterName: string;
  originalAmount: number;
  masterShare: number;
  franchisorShare: number;
  splitPercentage: number;
  splitType: 'franchise_fee' | 'royalty';
  isSelfSale: boolean;
}

export interface FranchiseSaleData {
  franchiseeId: string;
  franchiseeState?: string;
  franchiseeMunicipality?: string;
  franchiseeZipCode?: string;
  franchiseFeeAmount: number;
}

export interface PerformanceEvaluationResult {
  targetId: string;
  masterId: string;
  status: 'met' | 'partially_met' | 'failed';
  metrics: {
    franchisesSold: { target: number | null; actual: number | null; met: boolean };
    volumeUsd: { target: number | null; actual: number | null; met: boolean };
    retentionPct: { target: number | null; actual: number | null; met: boolean };
    activeFranchises: { target: number | null; actual: number | null; met: boolean };
  };
  exclusivityImpact: string | null;
  recommendation: string;
}

// ===== Master Account Service =====

export const masterAccountService = {
  
  // ===== ONBOARDING =====

  /**
   * Create a new Master Account with full validation
   * Validates territory availability and creates initial audit snapshot
   */
  async createMasterAccount(
    data: MasterOnboardingData,
    approvedBy?: string
  ): Promise<{ success: boolean; masterId?: string; error?: string }> {
    try {
      // 1. Validate territory exists and is active
      const territory = await territoryService.getTerritoryById(data.territory_definition_id);
      if (!territory) {
        return { success: false, error: 'Territory definition not found' };
      }
      if (!territory.is_active) {
        return { success: false, error: 'Territory is not active' };
      }

      // 2. Check if territory is already assigned to another Master
      const existingMaster = await db
        .select()
        .from(master_accounts)
        .where(
          and(
            eq(master_accounts.territory_definition_id, data.territory_definition_id),
            eq(master_accounts.status, 'active')
          )
        )
        .limit(1);

      if (existingMaster[0] && territory.exclusivity_type === 'exclusive') {
        return { 
          success: false, 
          error: 'Territory is exclusively assigned to another Master' 
        };
      }

      // 3. For semi-exclusive, check quota
      if (territory.exclusivity_type === 'semi_exclusive') {
        const activeMasters = await db
          .select({ count: sql<number>`count(*)` })
          .from(master_accounts)
          .where(
            and(
              eq(master_accounts.territory_definition_id, data.territory_definition_id),
              eq(master_accounts.status, 'active')
            )
          );
        
        const currentCount = Number(activeMasters[0]?.count || 0);
        if (territory.max_masters_quota && currentCount >= territory.max_masters_quota) {
          return { 
            success: false, 
            error: `Territory quota exceeded (${currentCount}/${territory.max_masters_quota})` 
          };
        }
      }

      // 4. Create Master Account
      const [newMaster] = await db
        .insert(master_accounts)
        .values({
          legal_entity_name: data.legal_entity_name,
          legal_entity_tax_id: data.legal_entity_tax_id,
          legal_entity_tax_id_type: data.legal_entity_tax_id_type || 'cnpj',
          legal_entity_address: data.legal_entity_address,
          legal_entity_country: data.legal_entity_country || 'BRA',
          territory_definition_id: data.territory_definition_id,
          primary_user_id: data.primary_user_id,
          franchise_fee_split_pct: data.franchise_fee_split_pct || '30',
          royalty_split_pct: data.royalty_split_pct || '20',
          contract_start_date: data.contract_start_date,
          contract_end_date: data.contract_end_date,
          contract_renewal_terms: data.contract_renewal_terms,
          master_contract_id: data.master_contract_id,
          status: 'pending_approval',
          approved_by: approvedBy,
        })
        .returning();

      // 5. Create initial territory audit snapshot
      await territoryService.createAuditSnapshot(
        newMaster.id,
        data.territory_definition_id,
        'creation',
        undefined,
        `Initial territory assignment for Master ${data.legal_entity_name}`
      );

      console.log(`[MasterAccountService] Created Master Account: ${newMaster.id}`);
      return { success: true, masterId: newMaster.id };

    } catch (error) {
      console.error('[MasterAccountService] Error creating Master Account:', error);
      return { success: false, error: 'Failed to create Master Account' };
    }
  },

  /**
   * Approve a pending Master Account
   */
  async approveMasterAccount(
    masterId: string,
    approvedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [updated] = await db
        .update(master_accounts)
        .set({
          status: 'active',
          exclusivity_status: 'active',
          approved_by: approvedBy,
          approved_at: new Date(),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(master_accounts.id, masterId),
            eq(master_accounts.status, 'pending_approval')
          )
        )
        .returning();

      if (!updated) {
        return { success: false, error: 'Master Account not found or not pending approval' };
      }

      console.log(`[MasterAccountService] Approved Master Account: ${masterId}`);
      return { success: true };

    } catch (error) {
      console.error('[MasterAccountService] Error approving Master Account:', error);
      return { success: false, error: 'Failed to approve Master Account' };
    }
  },

  /**
   * Suspend a Master Account (triggers PAUSE → AUDIT workflow)
   */
  async suspendMasterAccount(
    masterId: string,
    reason: string,
    violationType?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [updated] = await db
        .update(master_accounts)
        .set({
          status: 'suspended',
          suspended_at: new Date(),
          audit_notes: reason,
          updated_at: new Date(),
          ...(violationType && { 
            antifraud_flags_count: sql`${master_accounts.antifraud_flags_count} + 1`,
            last_antifraud_flag_at: new Date()
          }),
        })
        .where(eq(master_accounts.id, masterId))
        .returning();

      if (!updated) {
        return { success: false, error: 'Master Account not found' };
      }

      // Create audit snapshot for suspension
      await territoryService.createAuditSnapshot(
        masterId,
        updated.territory_definition_id,
        'audit',
        undefined,
        `Suspension: ${reason}${violationType ? ` (Violation: ${violationType})` : ''}`
      );

      console.log(`[MasterAccountService] Suspended Master Account: ${masterId}`);
      return { success: true };

    } catch (error) {
      console.error('[MasterAccountService] Error suspending Master Account:', error);
      return { success: false, error: 'Failed to suspend Master Account' };
    }
  },

  /**
   * Reactivate a suspended Master Account
   */
  async reactivateMasterAccount(
    masterId: string,
    approvedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [updated] = await db
        .update(master_accounts)
        .set({
          status: 'active',
          suspended_at: null,
          audit_started_at: null,
          audit_notes: null,
          approved_by: approvedBy,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(master_accounts.id, masterId),
            eq(master_accounts.status, 'suspended')
          )
        )
        .returning();

      if (!updated) {
        return { success: false, error: 'Master Account not found or not suspended' };
      }

      console.log(`[MasterAccountService] Reactivated Master Account: ${masterId}`);
      return { success: true };

    } catch (error) {
      console.error('[MasterAccountService] Error reactivating Master Account:', error);
      return { success: false, error: 'Failed to reactivate Master Account' };
    }
  },

  // ===== REVENUE SPLITS =====

  /**
   * Calculate revenue split for a franchise fee
   * CRITICAL: Prevents self-royalty (Master's own franchise doesn't generate split)
   */
  calculateFranchiseFeeSplit(
    master: MasterAccount,
    feeAmount: number,
    franchiseeId: string
  ): RevenueSplitResult {
    // CRITICAL: Check for self-sale (Master's own operating franchise)
    const isSelfSale = master.franchisee_account_id === franchiseeId;

    if (isSelfSale) {
      // Master's own franchise - NO split, 100% to franchisor
      return {
        masterId: master.id,
        masterName: master.legal_entity_name,
        originalAmount: feeAmount,
        masterShare: 0,
        franchisorShare: feeAmount,
        splitPercentage: 0,
        splitType: 'franchise_fee',
        isSelfSale: true,
      };
    }

    const splitPct = Number(master.franchise_fee_split_pct) / 100;
    const masterShare = feeAmount * splitPct;
    const franchisorShare = feeAmount - masterShare;

    return {
      masterId: master.id,
      masterName: master.legal_entity_name,
      originalAmount: feeAmount,
      masterShare,
      franchisorShare,
      splitPercentage: Number(master.franchise_fee_split_pct),
      splitType: 'franchise_fee',
      isSelfSale: false,
    };
  },

  /**
   * Calculate revenue split for royalties
   * CRITICAL: Prevents self-royalty (Master's own trading doesn't generate split)
   */
  calculateRoyaltySplit(
    master: MasterAccount,
    royaltyAmount: number,
    franchiseeId: string
  ): RevenueSplitResult {
    // CRITICAL: Check for self-royalty (Master's own operating franchise)
    const isSelfSale = master.franchisee_account_id === franchiseeId;

    if (isSelfSale) {
      // Master's own trading - NO split, 100% to franchisor
      return {
        masterId: master.id,
        masterName: master.legal_entity_name,
        originalAmount: royaltyAmount,
        masterShare: 0,
        franchisorShare: royaltyAmount,
        splitPercentage: 0,
        splitType: 'royalty',
        isSelfSale: true,
      };
    }

    const splitPct = Number(master.royalty_split_pct) / 100;
    const masterShare = royaltyAmount * splitPct;
    const franchisorShare = royaltyAmount - masterShare;

    return {
      masterId: master.id,
      masterName: master.legal_entity_name,
      originalAmount: royaltyAmount,
      masterShare,
      franchisorShare,
      splitPercentage: Number(master.royalty_split_pct),
      splitType: 'royalty',
      isSelfSale: false,
    };
  },

  /**
   * Find the Master responsible for a franchise location
   * Returns null if no Master covers the location
   */
  async findMasterForLocation(location: {
    state?: string;
    municipality?: string;
    zipCode?: string;
    countryCode?: string;
  }): Promise<MasterAccount | null> {
    const activeMasters = await db
      .select({
        master: master_accounts,
        territory: territory_definitions,
      })
      .from(master_accounts)
      .innerJoin(
        territory_definitions,
        eq(master_accounts.territory_definition_id, territory_definitions.id)
      )
      .where(
        and(
          eq(master_accounts.status, 'active'),
          eq(territory_definitions.is_active, true),
          location.countryCode 
            ? eq(territory_definitions.country_code, location.countryCode)
            : sql`1=1`
        )
      );

    for (const { master, territory } of activeMasters) {
      // Check if location is within this territory
      const validation = await territoryService.validateLocationInTerritory(
        master.id,
        location
      );

      if (validation.isWithinTerritory) {
        return master;
      }
    }

    return null;
  },

  // ===== REGIONAL FRANCHISE LINKS =====

  /**
   * Create a regional franchise link when a Master sells a franchise
   * Creates IMMUTABLE territory snapshot to prevent future disputes
   */
  async createRegionalLink(
    masterId: string,
    saleData: FranchiseSaleData
  ): Promise<{ success: boolean; linkId?: string; error?: string }> {
    try {
      // 1. Validate Master exists and is active
      const master = await this.getMasterById(masterId);
      if (!master) {
        return { success: false, error: 'Master Account not found' };
      }
      if (master.status !== 'active') {
        return { success: false, error: 'Master Account is not active' };
      }

      // 2. Validate franchisee exists
      const franchisee = await db
        .select()
        .from(franchises)
        .where(eq(franchises.id, saleData.franchiseeId))
        .limit(1);

      if (!franchisee[0]) {
        return { success: false, error: 'Franchisee not found' };
      }

      // 3. CRITICAL: Prevent self-link (Master selling to themselves)
      if (master.franchisee_account_id === saleData.franchiseeId) {
        return { 
          success: false, 
          error: 'Cannot create regional link for Master\'s own franchise (self-royalty prevention)' 
        };
      }

      // 4. Validate location is within Master's territory
      const locationValidation = await territoryService.validateLocationInTerritory(
        masterId,
        {
          state: saleData.franchiseeState,
          municipality: saleData.franchiseeMunicipality,
          zipCode: saleData.franchiseeZipCode,
        }
      );

      if (!locationValidation.isWithinTerritory) {
        return { 
          success: false, 
          error: `Location outside territory: ${locationValidation.details}`,
        };
      }

      // 5. Get territory for immutable snapshot
      const territory = await territoryService.getTerritoryById(master.territory_definition_id);
      if (!territory) {
        return { success: false, error: 'Territory definition not found' };
      }

      // 6. Create immutable territory snapshot
      const snapshotData = {
        territory_id: territory.id,
        territory_name: territory.name,
        country_code: territory.country_code,
        states: territory.states,
        excluded_states: territory.excluded_states,
        municipalities: territory.municipalities,
        excluded_municipalities: territory.excluded_municipalities,
        micro_regions: territory.micro_regions,
        metro_regions: territory.metro_regions,
        urban_agglomerations: territory.urban_agglomerations,
        zip_code_ranges: territory.zip_code_ranges,
        zip_code_exclusions: territory.zip_code_exclusions,
        exclusivity_type: territory.exclusivity_type,
        captured_at: new Date().toISOString(),
      };

      const snapshotHash = createHash('sha256')
        .update(JSON.stringify(snapshotData))
        .digest('hex');

      // 7. Create regional link
      const [link] = await db
        .insert(regional_franchise_links)
        .values({
          master_id: masterId,
          franchisee_id: saleData.franchiseeId,
          territory_scope_snapshot: snapshotData,
          territory_snapshot_hash: snapshotHash,
          franchisee_state: saleData.franchiseeState,
          franchisee_municipality: saleData.franchiseeMunicipality,
          franchisee_zip_code: saleData.franchiseeZipCode,
          total_fees_earned_usd: saleData.franchiseFeeAmount.toString(),
          status: 'active',
        })
        .returning();

      // 8. Update Master's performance metrics
      await db
        .update(master_accounts)
        .set({
          total_franchises_sold: sql`${master_accounts.total_franchises_sold} + 1`,
          total_active_franchises: sql`${master_accounts.total_active_franchises} + 1`,
          total_revenue_generated_usd: sql`${master_accounts.total_revenue_generated_usd} + ${saleData.franchiseFeeAmount}`,
          updated_at: new Date(),
        })
        .where(eq(master_accounts.id, masterId));

      console.log(`[MasterAccountService] Created Regional Link: ${link.id}`);
      return { success: true, linkId: link.id };

    } catch (error) {
      console.error('[MasterAccountService] Error creating regional link:', error);
      return { success: false, error: 'Failed to create regional link' };
    }
  },

  /**
   * Record royalty payment to a regional link
   */
  async recordRoyaltyPayment(
    linkId: string,
    amount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [updated] = await db
        .update(regional_franchise_links)
        .set({
          total_royalties_earned_usd: sql`${regional_franchise_links.total_royalties_earned_usd} + ${amount}`,
          updated_at: new Date(),
        })
        .where(eq(regional_franchise_links.id, linkId))
        .returning();

      if (!updated) {
        return { success: false, error: 'Regional link not found' };
      }

      return { success: true };

    } catch (error) {
      console.error('[MasterAccountService] Error recording royalty payment:', error);
      return { success: false, error: 'Failed to record royalty payment' };
    }
  },

  // ===== PERFORMANCE TARGETS =====

  /**
   * Create performance targets for a Master
   */
  async createPerformanceTarget(
    masterId: string,
    data: {
      period_type: 'monthly' | 'quarterly' | 'yearly';
      period_start: Date;
      period_end: Date;
      target_franchises_sold?: number;
      target_volume_usd?: string;
      target_retention_pct?: string;
      target_active_franchises?: number;
      exclusivity_impact?: string;
    }
  ): Promise<{ success: boolean; targetId?: string; error?: string }> {
    try {
      const [target] = await db
        .insert(master_performance_targets)
        .values({
          master_id: masterId,
          period_type: data.period_type,
          period_start: data.period_start,
          period_end: data.period_end,
          target_franchises_sold: data.target_franchises_sold,
          target_volume_usd: data.target_volume_usd,
          target_retention_pct: data.target_retention_pct,
          target_active_franchises: data.target_active_franchises,
          exclusivity_impact: data.exclusivity_impact,
          status: 'pending',
        })
        .returning();

      console.log(`[MasterAccountService] Created Performance Target: ${target.id}`);
      return { success: true, targetId: target.id };

    } catch (error) {
      console.error('[MasterAccountService] Error creating performance target:', error);
      return { success: false, error: 'Failed to create performance target' };
    }
  },

  /**
   * Evaluate a performance target and determine exclusivity impact
   */
  async evaluatePerformanceTarget(
    targetId: string,
    evaluatedBy: string
  ): Promise<PerformanceEvaluationResult | { error: string }> {
    try {
      const [target] = await db
        .select()
        .from(master_performance_targets)
        .where(eq(master_performance_targets.id, targetId));

      if (!target) {
        return { error: 'Performance target not found' };
      }

      const master = await this.getMasterById(target.master_id);
      if (!master) {
        return { error: 'Master Account not found' };
      }

      // Calculate actual metrics from regional links
      const links = await db
        .select()
        .from(regional_franchise_links)
        .where(
          and(
            eq(regional_franchise_links.master_id, target.master_id),
            gte(regional_franchise_links.created_at, target.period_start),
            lte(regional_franchise_links.created_at, target.period_end)
          )
        );

      const activeLinks = await db
        .select({ count: sql<number>`count(*)` })
        .from(regional_franchise_links)
        .where(
          and(
            eq(regional_franchise_links.master_id, target.master_id),
            eq(regional_franchise_links.status, 'active')
          )
        );

      const totalVolume = links.reduce(
        (sum, link) => sum + Number(link.total_fees_earned_usd) + Number(link.total_royalties_earned_usd),
        0
      );

      const metrics = {
        franchisesSold: {
          target: target.target_franchises_sold,
          actual: links.length,
          met: target.target_franchises_sold ? links.length >= target.target_franchises_sold : true,
        },
        volumeUsd: {
          target: target.target_volume_usd ? Number(target.target_volume_usd) : null,
          actual: totalVolume,
          met: target.target_volume_usd ? totalVolume >= Number(target.target_volume_usd) : true,
        },
        retentionPct: {
          target: target.target_retention_pct ? Number(target.target_retention_pct) : null,
          actual: null, // Would need historical data
          met: true, // Default to met if not calculable
        },
        activeFranchises: {
          target: target.target_active_franchises,
          actual: Number(activeLinks[0]?.count || 0),
          met: target.target_active_franchises 
            ? Number(activeLinks[0]?.count || 0) >= target.target_active_franchises 
            : true,
        },
      };

      // Determine overall status
      const metCount = [
        metrics.franchisesSold.met,
        metrics.volumeUsd.met,
        metrics.retentionPct.met,
        metrics.activeFranchises.met,
      ].filter(Boolean).length;

      let status: 'met' | 'partially_met' | 'failed';
      let recommendation: string;

      if (metCount === 4) {
        status = 'met';
        recommendation = 'All targets met. Exclusivity maintained.';
      } else if (metCount >= 2) {
        status = 'partially_met';
        recommendation = 'Partial compliance. Consider warning or grace period.';
      } else {
        status = 'failed';
        recommendation = 'Targets failed. Review exclusivity status per contract terms.';
      }

      // Update target with evaluation results
      await db
        .update(master_performance_targets)
        .set({
          actual_franchises_sold: links.length,
          actual_volume_usd: totalVolume.toString(),
          actual_active_franchises: Number(activeLinks[0]?.count || 0),
          status,
          evaluated_at: new Date(),
          evaluated_by: evaluatedBy,
          updated_at: new Date(),
        })
        .where(eq(master_performance_targets.id, targetId));

      // Apply exclusivity impact if target failed
      if (status === 'failed' && target.exclusivity_impact) {
        await this.applyExclusivityImpact(
          target.master_id,
          target.exclusivity_impact,
          `Performance target ${targetId} failed`
        );
      }

      return {
        targetId,
        masterId: target.master_id,
        status,
        metrics,
        exclusivityImpact: status === 'failed' ? target.exclusivity_impact : null,
        recommendation,
      };

    } catch (error) {
      console.error('[MasterAccountService] Error evaluating performance target:', error);
      return { error: 'Failed to evaluate performance target' };
    }
  },

  /**
   * Apply exclusivity impact based on performance failure
   */
  async applyExclusivityImpact(
    masterId: string,
    impact: string,
    reason: string
  ): Promise<void> {
    switch (impact) {
      case 'warning':
        await db
          .update(master_accounts)
          .set({
            exclusivity_status: 'warning',
            exclusivity_warning_reason: reason,
            updated_at: new Date(),
          })
          .where(eq(master_accounts.id, masterId));
        break;

      case 'partial_loss':
        // Warning + may allow additional Masters in territory
        await db
          .update(master_accounts)
          .set({
            exclusivity_status: 'warning',
            exclusivity_warning_reason: `${reason} - Partial exclusivity loss`,
            updated_at: new Date(),
          })
          .where(eq(master_accounts.id, masterId));
        break;

      case 'full_revocation':
        await db
          .update(master_accounts)
          .set({
            exclusivity_status: 'revoked',
            exclusivity_revoked_at: new Date(),
            exclusivity_warning_reason: reason,
            updated_at: new Date(),
          })
          .where(eq(master_accounts.id, masterId));
        break;
    }
  },

  // ===== QUERIES =====

  /**
   * Get Master Account by ID
   */
  async getMasterById(id: string): Promise<MasterAccount | null> {
    const result = await db
      .select()
      .from(master_accounts)
      .where(eq(master_accounts.id, id))
      .limit(1);
    return result[0] || null;
  },

  /**
   * Get Master Account by primary user ID
   */
  async getMasterByUserId(userId: string): Promise<MasterAccount | null> {
    const result = await db
      .select()
      .from(master_accounts)
      .where(eq(master_accounts.primary_user_id, userId))
      .limit(1);
    return result[0] || null;
  },

  /**
   * List Master Accounts with optional filters
   */
  async listMasters(filters?: {
    status?: string;
    exclusivityStatus?: string;
    countryCode?: string;
  }): Promise<MasterAccount[]> {
    const conditions = [];

    if (filters?.status) {
      conditions.push(eq(master_accounts.status, filters.status));
    }
    if (filters?.exclusivityStatus) {
      conditions.push(eq(master_accounts.exclusivity_status, filters.exclusivityStatus));
    }

    const query = conditions.length > 0
      ? db.select().from(master_accounts).where(and(...conditions))
      : db.select().from(master_accounts);

    return await query;
  },

  /**
   * Get regional links for a Master
   */
  async getMasterRegionalLinks(masterId: string): Promise<RegionalFranchiseLink[]> {
    return await db
      .select()
      .from(regional_franchise_links)
      .where(eq(regional_franchise_links.master_id, masterId))
      .orderBy(desc(regional_franchise_links.created_at));
  },

  /**
   * Get performance targets for a Master
   */
  async getMasterPerformanceTargets(masterId: string): Promise<MasterPerformanceTarget[]> {
    return await db
      .select()
      .from(master_performance_targets)
      .where(eq(master_performance_targets.master_id, masterId))
      .orderBy(desc(master_performance_targets.period_start));
  },

  /**
   * Get Master dashboard statistics
   */
  async getMasterDashboardStats(masterId: string): Promise<{
    totalFranchisesSold: number;
    activeFranchises: number;
    totalRevenueUsd: number;
    totalFeesEarned: number;
    totalRoyaltiesEarned: number;
    exclusivityStatus: string;
    pendingTargets: number;
  }> {
    const master = await this.getMasterById(masterId);
    if (!master) {
      throw new Error('Master Account not found');
    }

    const links = await this.getMasterRegionalLinks(masterId);
    const pendingTargets = await db
      .select({ count: sql<number>`count(*)` })
      .from(master_performance_targets)
      .where(
        and(
          eq(master_performance_targets.master_id, masterId),
          eq(master_performance_targets.status, 'pending')
        )
      );

    const totalFees = links.reduce((sum, l) => sum + Number(l.total_fees_earned_usd), 0);
    const totalRoyalties = links.reduce((sum, l) => sum + Number(l.total_royalties_earned_usd), 0);

    return {
      totalFranchisesSold: master.total_franchises_sold,
      activeFranchises: master.total_active_franchises,
      totalRevenueUsd: Number(master.total_revenue_generated_usd),
      totalFeesEarned: totalFees,
      totalRoyaltiesEarned: totalRoyalties,
      exclusivityStatus: master.exclusivity_status,
      pendingTargets: Number(pendingTargets[0]?.count || 0),
    };
  },
};

export default masterAccountService;
