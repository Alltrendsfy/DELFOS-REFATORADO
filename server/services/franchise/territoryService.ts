import crypto from 'crypto';
import { db } from '../../db';
import { 
  territory_definitions, 
  master_accounts,
  regional_franchise_links,
  master_territory_audit_snapshots,
  franchises,
  TerritoryDefinition,
  InsertTerritoryDefinition,
  MasterAccount,
  InsertMasterTerritoryAuditSnapshot,
  TERRITORY_EXCLUSIVITY_TYPES,
  TerritoryExclusivityType
} from '@shared/schema';
import { eq, and, or, sql, inArray } from 'drizzle-orm';

export interface TerritoryValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface OverlapCheckResult {
  hasOverlap: boolean;
  overlappingTerritories: {
    territoryId: string;
    territoryName: string;
    masterAccountId: string;
    overlapType: 'full' | 'partial';
    overlapDetails: string;
  }[];
  canProceed: boolean;
  reason?: string;
}

export interface LocationValidationResult {
  isWithinTerritory: boolean;
  territoryId?: string;
  territoryName?: string;
  violationType?: 'MASTER_TERRITORY_OVERREACH' | 'MASTER_UNAUTHORIZED_SALE';
  details?: string;
}

interface TerritoryConfig {
  country_code: string;
  states?: string[];
  municipalities?: string[];
  micro_regions?: string[];
  metro_regions?: string[];
  urban_agglomerations?: string[];
  zip_code_ranges?: string[];
  zip_code_exclusions?: string[];
  custom_economic_zone_id?: string;
  excluded_states?: string[];
  excluded_municipalities?: string[];
}

export const territoryService = {
  /**
   * Calculate SHA-256 hash of territory configuration
   * Used for immutability verification and tamper detection
   */
  calculateTerritoryHash(config: TerritoryConfig): string {
    const normalizedConfig = {
      country_code: config.country_code,
      states: (config.states || []).sort(),
      municipalities: (config.municipalities || []).sort(),
      micro_regions: (config.micro_regions || []).sort(),
      metro_regions: (config.metro_regions || []).sort(),
      urban_agglomerations: (config.urban_agglomerations || []).sort(),
      zip_code_ranges: (config.zip_code_ranges || []).sort(),
      zip_code_exclusions: (config.zip_code_exclusions || []).sort(),
      custom_economic_zone_id: config.custom_economic_zone_id || null,
      excluded_states: (config.excluded_states || []).sort(),
      excluded_municipalities: (config.excluded_municipalities || []).sort(),
    };
    
    const jsonString = JSON.stringify(normalizedConfig);
    return crypto.createHash('sha256').update(jsonString).digest('hex');
  },

  /**
   * Validate territory definition before creation/update
   */
  validateTerritoryDefinition(territory: Partial<InsertTerritoryDefinition>): TerritoryValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!territory.name || territory.name.trim().length < 3) {
      errors.push('Territory name must be at least 3 characters');
    }

    if (!territory.country_code || territory.country_code.length !== 3) {
      errors.push('Country code must be a valid 3-letter ISO code');
    }

    const hasAdministrativeLayer = (territory.states?.length || 0) > 0 || 
                                    (territory.municipalities?.length || 0) > 0;
    const hasStatisticalLayer = (territory.micro_regions?.length || 0) > 0 || 
                                 (territory.metro_regions?.length || 0) > 0;
    const hasPostalLayer = (territory.zip_code_ranges?.length || 0) > 0;
    const hasCustomZone = !!territory.custom_economic_zone_id;

    if (!hasAdministrativeLayer && !hasStatisticalLayer && !hasPostalLayer && !hasCustomZone) {
      errors.push('Territory must have at least one delimitation layer defined');
    }

    if (territory.exclusivity_type === 'semi_exclusive' && !territory.max_masters_quota) {
      errors.push('Semi-exclusive territories must define max_masters_quota');
    }

    if (territory.exclusivity_type === 'exclusive' && territory.overlap_allowed) {
      warnings.push('Exclusive territories typically do not allow overlap');
    }

    if ((territory.excluded_states?.length || 0) > 0 && (territory.states?.length || 0) === 0) {
      warnings.push('Excluded states defined but no states included - exclusions will have no effect');
    }

    if ((territory.excluded_municipalities?.length || 0) > 0 && 
        (territory.municipalities?.length || 0) === 0 && 
        (territory.states?.length || 0) === 0) {
      warnings.push('Excluded municipalities defined but no parent regions included');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * Check for territory overlaps with existing territories
   */
  async checkTerritoryOverlap(
    newTerritory: Partial<InsertTerritoryDefinition>,
    excludeTerritoryId?: string
  ): Promise<OverlapCheckResult> {
    const overlappingTerritories: OverlapCheckResult['overlappingTerritories'] = [];

    const existingTerritories = await db
      .select()
      .from(territory_definitions)
      .where(
        and(
          eq(territory_definitions.is_active, true),
          eq(territory_definitions.country_code, newTerritory.country_code || ''),
          excludeTerritoryId ? sql`${territory_definitions.id} != ${excludeTerritoryId}` : sql`1=1`
        )
      );

    for (const existing of existingTerritories) {
      const overlap = this.detectOverlap(newTerritory, existing);
      
      if (overlap.hasOverlap) {
        const masterAccount = await db
          .select()
          .from(master_accounts)
          .where(eq(master_accounts.territory_definition_id, existing.id))
          .limit(1);

        overlappingTerritories.push({
          territoryId: existing.id,
          territoryName: existing.name,
          masterAccountId: masterAccount[0]?.id || '',
          overlapType: overlap.type,
          overlapDetails: overlap.details
        });
      }
    }

    // CRITICAL: Existing exclusive territories ALWAYS block new overlapping territories
    // The new territory's overlap_allowed flag does NOT override existing exclusivity
    const hasBlockingOverlap = overlappingTerritories.some(ot => {
      const existingTerritory = existingTerritories.find(t => t.id === ot.territoryId);
      // An exclusive territory that doesn't allow overlap ALWAYS blocks
      return existingTerritory?.exclusivity_type === 'exclusive' && !existingTerritory?.overlap_allowed;
    });

    return {
      hasOverlap: overlappingTerritories.length > 0,
      overlappingTerritories,
      // Existing exclusive territories CANNOT be overridden by new territories
      canProceed: !hasBlockingOverlap,
      reason: hasBlockingOverlap 
        ? 'Overlap with exclusive territory - exclusivity rights are protected' 
        : undefined
    };
  },

  /**
   * Detect overlap between two territory definitions
   * Properly considers exclusion fields to avoid false positives
   */
  detectOverlap(
    territory1: Partial<InsertTerritoryDefinition>, 
    territory2: TerritoryDefinition
  ): { hasOverlap: boolean; type: 'full' | 'partial'; details: string } {
    // Get effective states (subtract exclusions)
    const t1EffectiveStates = this.subtractArray(
      territory1.states || [],
      territory1.excluded_states || []
    );
    const t2EffectiveStates = this.subtractArray(
      territory2.states || [],
      territory2.excluded_states || []
    );
    const stateOverlap = this.arrayIntersection(t1EffectiveStates, t2EffectiveStates);
    
    // Get effective municipalities (subtract exclusions)
    const t1EffectiveMunicipalities = this.subtractArray(
      territory1.municipalities || [],
      territory1.excluded_municipalities || []
    );
    const t2EffectiveMunicipalities = this.subtractArray(
      territory2.municipalities || [],
      territory2.excluded_municipalities || []
    );
    const municipalityOverlap = this.arrayIntersection(t1EffectiveMunicipalities, t2EffectiveMunicipalities);
    
    // Statistical layers - micro regions
    const microRegionOverlap = this.arrayIntersection(
      territory1.micro_regions || [], 
      territory2.micro_regions || []
    );
    
    // Statistical layers - metro regions
    const metroRegionOverlap = this.arrayIntersection(
      territory1.metro_regions || [], 
      territory2.metro_regions || []
    );
    
    // Statistical layers - urban agglomerations
    const urbanAgglomerationOverlap = this.arrayIntersection(
      territory1.urban_agglomerations || [], 
      territory2.urban_agglomerations || []
    );

    // ZIP code ranges with exclusions
    const zipOverlap = this.checkZipRangeOverlapWithExclusions(
      territory1.zip_code_ranges || [],
      territory2.zip_code_ranges || [],
      territory1.zip_code_exclusions || [],
      territory2.zip_code_exclusions || []
    );

    const hasAnyOverlap = stateOverlap.length > 0 || 
                          municipalityOverlap.length > 0 || 
                          microRegionOverlap.length > 0 ||
                          metroRegionOverlap.length > 0 ||
                          urbanAgglomerationOverlap.length > 0 ||
                          zipOverlap.length > 0;

    if (!hasAnyOverlap) {
      return { hasOverlap: false, type: 'partial', details: '' };
    }

    const isFull = this.isFullOverlap(territory1, territory2);
    
    const details: string[] = [];
    if (stateOverlap.length > 0) details.push(`States: ${stateOverlap.join(', ')}`);
    if (municipalityOverlap.length > 0) details.push(`Municipalities: ${municipalityOverlap.join(', ')}`);
    if (microRegionOverlap.length > 0) details.push(`Micro regions: ${microRegionOverlap.join(', ')}`);
    if (metroRegionOverlap.length > 0) details.push(`Metro regions: ${metroRegionOverlap.join(', ')}`);
    if (urbanAgglomerationOverlap.length > 0) details.push(`Urban agglomerations: ${urbanAgglomerationOverlap.join(', ')}`);
    if (zipOverlap.length > 0) details.push(`ZIP ranges: ${zipOverlap.join(', ')}`);

    return {
      hasOverlap: true,
      type: isFull ? 'full' : 'partial',
      details: details.join('; ')
    };
  },

  /**
   * Validate if a location (franchise) is within a Master's territory
   */
  async validateLocationInTerritory(
    masterId: string,
    location: {
      state?: string;
      municipality?: string;
      zipCode?: string;
      microRegion?: string;
      metroRegion?: string;
    }
  ): Promise<LocationValidationResult> {
    const masterAccount = await db
      .select()
      .from(master_accounts)
      .where(eq(master_accounts.id, masterId))
      .limit(1);

    if (!masterAccount[0]) {
      return {
        isWithinTerritory: false,
        violationType: 'MASTER_TERRITORY_OVERREACH',
        details: 'Master account not found'
      };
    }

    const territory = await db
      .select()
      .from(territory_definitions)
      .where(eq(territory_definitions.id, masterAccount[0].territory_definition_id))
      .limit(1);

    if (!territory[0]) {
      return {
        isWithinTerritory: false,
        violationType: 'MASTER_TERRITORY_OVERREACH',
        details: 'Territory definition not found'
      };
    }

    const t = territory[0];

    if (location.state && (t.excluded_states || []).includes(location.state)) {
      return {
        isWithinTerritory: false,
        territoryId: t.id,
        territoryName: t.name,
        violationType: 'MASTER_UNAUTHORIZED_SALE',
        details: `State ${location.state} is excluded from territory`
      };
    }

    if (location.municipality && (t.excluded_municipalities || []).includes(location.municipality)) {
      return {
        isWithinTerritory: false,
        territoryId: t.id,
        territoryName: t.name,
        violationType: 'MASTER_UNAUTHORIZED_SALE',
        details: `Municipality ${location.municipality} is excluded from territory`
      };
    }

    let isWithin = false;
    const matchDetails: string[] = [];

    if (location.state && (t.states || []).length > 0) {
      if ((t.states || []).includes(location.state)) {
        isWithin = true;
        matchDetails.push(`State match: ${location.state}`);
      }
    }

    if (location.municipality && (t.municipalities || []).length > 0) {
      if ((t.municipalities || []).includes(location.municipality)) {
        isWithin = true;
        matchDetails.push(`Municipality match: ${location.municipality}`);
      }
    }

    if (location.microRegion && (t.micro_regions || []).length > 0) {
      if ((t.micro_regions || []).includes(location.microRegion)) {
        isWithin = true;
        matchDetails.push(`Micro region match: ${location.microRegion}`);
      }
    }

    if (location.metroRegion && (t.metro_regions || []).length > 0) {
      if ((t.metro_regions || []).includes(location.metroRegion)) {
        isWithin = true;
        matchDetails.push(`Metro region match: ${location.metroRegion}`);
      }
    }

    if (location.zipCode && (t.zip_code_ranges || []).length > 0) {
      if (this.isZipInRanges(location.zipCode, t.zip_code_ranges || [])) {
        if (!(t.zip_code_exclusions || []).includes(location.zipCode)) {
          isWithin = true;
          matchDetails.push(`ZIP code match: ${location.zipCode}`);
        }
      }
    }

    if (!isWithin) {
      return {
        isWithinTerritory: false,
        territoryId: t.id,
        territoryName: t.name,
        violationType: 'MASTER_TERRITORY_OVERREACH',
        details: 'Location does not match any territorial layer'
      };
    }

    return {
      isWithinTerritory: true,
      territoryId: t.id,
      territoryName: t.name,
      details: matchDetails.join('; ')
    };
  },

  /**
   * Create an immutable audit snapshot of territory state
   */
  async createAuditSnapshot(
    masterId: string,
    territoryId: string,
    reason: 'creation' | 'modification' | 'franchise_sale' | 'audit' | 'dispute',
    relatedFranchiseId?: string,
    eventDescription?: string,
    createdBy?: string
  ): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
    try {
      const territory = await db
        .select()
        .from(territory_definitions)
        .where(eq(territory_definitions.id, territoryId))
        .limit(1);

      if (!territory[0]) {
        return { success: false, error: 'Territory not found' };
      }

      const territorySnapshot = {
        ...territory[0],
        snapshot_timestamp: new Date().toISOString()
      };

      const snapshotHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(territorySnapshot))
        .digest('hex');

      const previousSnapshots = await db
        .select()
        .from(master_territory_audit_snapshots)
        .where(eq(master_territory_audit_snapshots.master_id, masterId))
        .orderBy(sql`${master_territory_audit_snapshots.created_at} DESC`)
        .limit(1);

      const previousSnapshot = previousSnapshots[0];

      let chainValidated = true;
      if (previousSnapshot) {
        const recalculatedHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(previousSnapshot.territory_snapshot))
          .digest('hex');
        chainValidated = recalculatedHash === previousSnapshot.snapshot_hash;
      }

      const insertData: InsertMasterTerritoryAuditSnapshot = {
        master_id: masterId,
        territory_definition_id: territoryId,
        territory_snapshot: territorySnapshot,
        snapshot_hash: snapshotHash,
        snapshot_reason: reason,
        related_franchise_id: relatedFranchiseId,
        related_event_description: eventDescription,
        previous_snapshot_id: previousSnapshot?.id,
        previous_snapshot_hash: previousSnapshot?.snapshot_hash,
        chain_validated: chainValidated,
        created_by: createdBy
      };

      const result = await db
        .insert(master_territory_audit_snapshots)
        .values(insertData)
        .returning({ id: master_territory_audit_snapshots.id });

      return { success: true, snapshotId: result[0]?.id };
    } catch (error) {
      console.error('[TerritoryService] Error creating audit snapshot:', error);
      return { success: false, error: 'Failed to create audit snapshot' };
    }
  },

  /**
   * Verify integrity of audit snapshot chain
   */
  async verifyAuditChain(masterId: string): Promise<{
    isValid: boolean;
    totalSnapshots: number;
    brokenLinks: { snapshotId: string; issue: string }[];
  }> {
    const snapshots = await db
      .select()
      .from(master_territory_audit_snapshots)
      .where(eq(master_territory_audit_snapshots.master_id, masterId))
      .orderBy(sql`${master_territory_audit_snapshots.created_at} ASC`);

    const brokenLinks: { snapshotId: string; issue: string }[] = [];

    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];

      const recalculatedHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(snapshot.territory_snapshot))
        .digest('hex');

      if (recalculatedHash !== snapshot.snapshot_hash) {
        brokenLinks.push({
          snapshotId: snapshot.id,
          issue: 'Snapshot hash mismatch - data may have been tampered'
        });
      }

      if (i > 0) {
        const previousSnapshot = snapshots[i - 1];
        if (snapshot.previous_snapshot_id !== previousSnapshot.id) {
          brokenLinks.push({
            snapshotId: snapshot.id,
            issue: 'Chain link broken - previous_snapshot_id does not match'
          });
        }
        if (snapshot.previous_snapshot_hash !== previousSnapshot.snapshot_hash) {
          brokenLinks.push({
            snapshotId: snapshot.id,
            issue: 'Chain hash mismatch - previous_snapshot_hash does not match'
          });
        }
      }
    }

    return {
      isValid: brokenLinks.length === 0,
      totalSnapshots: snapshots.length,
      brokenLinks
    };
  },

  /**
   * Create a new territory definition with hash
   */
  async createTerritory(
    data: Omit<InsertTerritoryDefinition, 'territory_hash'>,
    createdBy?: string
  ): Promise<{ success: boolean; territory?: TerritoryDefinition; error?: string }> {
    const validation = this.validateTerritoryDefinition(data);
    if (!validation.isValid) {
      return { success: false, error: validation.errors.join('; ') };
    }

    const overlapCheck = await this.checkTerritoryOverlap(data);
    if (!overlapCheck.canProceed) {
      return { success: false, error: overlapCheck.reason };
    }

    const territoryHash = this.calculateTerritoryHash({
      country_code: data.country_code,
      states: data.states || undefined,
      municipalities: data.municipalities || undefined,
      micro_regions: data.micro_regions || undefined,
      metro_regions: data.metro_regions || undefined,
      urban_agglomerations: data.urban_agglomerations || undefined,
      zip_code_ranges: data.zip_code_ranges || undefined,
      zip_code_exclusions: data.zip_code_exclusions || undefined,
      custom_economic_zone_id: data.custom_economic_zone_id || undefined,
      excluded_states: data.excluded_states || undefined,
      excluded_municipalities: data.excluded_municipalities || undefined
    });

    try {
      const result = await db
        .insert(territory_definitions)
        .values({
          ...data,
          territory_hash: territoryHash,
          created_by: createdBy
        })
        .returning();

      return { success: true, territory: result[0] };
    } catch (error: any) {
      if (error.code === '23505' && error.constraint?.includes('territory_hash')) {
        return { success: false, error: 'A territory with identical configuration already exists' };
      }
      console.error('[TerritoryService] Error creating territory:', error);
      return { success: false, error: 'Failed to create territory' };
    }
  },

  /**
   * Get territory by ID
   */
  async getTerritoryById(id: string): Promise<TerritoryDefinition | null> {
    const result = await db
      .select()
      .from(territory_definitions)
      .where(eq(territory_definitions.id, id))
      .limit(1);
    return result[0] || null;
  },

  /**
   * List active territories with optional filters
   */
  async listTerritories(filters?: {
    countryCode?: string;
    exclusivityType?: TerritoryExclusivityType;
    isActive?: boolean;
  }): Promise<TerritoryDefinition[]> {
    const conditions = [];
    
    if (filters?.countryCode) {
      conditions.push(eq(territory_definitions.country_code, filters.countryCode));
    }
    if (filters?.exclusivityType) {
      conditions.push(eq(territory_definitions.exclusivity_type, filters.exclusivityType));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(territory_definitions.is_active, filters.isActive));
    }

    const query = conditions.length > 0
      ? db.select().from(territory_definitions).where(and(...conditions))
      : db.select().from(territory_definitions);

    return await query;
  },

  // ===== Helper Functions =====

  arrayIntersection<T>(arr1: T[], arr2: T[]): T[] {
    return arr1.filter(item => arr2.includes(item));
  },

  /**
   * Subtract items from an array (set difference)
   */
  subtractArray<T>(arr: T[], toSubtract: T[]): T[] {
    return arr.filter(item => !toSubtract.includes(item));
  },

  /**
   * Check ZIP range overlap with exclusions considered
   */
  checkZipRangeOverlapWithExclusions(
    ranges1: string[], 
    ranges2: string[],
    exclusions1: string[],
    exclusions2: string[]
  ): string[] {
    const overlaps: string[] = [];
    
    for (const range1 of ranges1) {
      for (const range2 of ranges2) {
        if (this.zipRangesOverlap(range1, range2)) {
          // Check if the overlapping portion is entirely excluded by either territory
          const [start1, end1] = this.parseZipRange(range1);
          const [start2, end2] = this.parseZipRange(range2);
          const overlapStart = Math.max(start1, start2);
          const overlapEnd = Math.min(end1, end2);
          
          // Check if ALL ZIPs in the overlap range are excluded by either territory
          let allExcluded = true;
          for (let zip = overlapStart; zip <= overlapEnd && zip <= overlapStart + 100; zip++) {
            const zipStr = zip.toString().padStart(5, '0');
            if (!exclusions1.includes(zipStr) && !exclusions2.includes(zipStr)) {
              allExcluded = false;
              break;
            }
          }
          
          if (!allExcluded) {
            overlaps.push(`${range1} ∩ ${range2}`);
          }
        }
      }
    }
    
    return overlaps;
  },

  checkZipRangeOverlap(ranges1: string[], ranges2: string[]): string[] {
    const overlaps: string[] = [];
    
    for (const range1 of ranges1) {
      for (const range2 of ranges2) {
        if (this.zipRangesOverlap(range1, range2)) {
          overlaps.push(`${range1} ∩ ${range2}`);
        }
      }
    }
    
    return overlaps;
  },

  zipRangesOverlap(range1: string, range2: string): boolean {
    const [start1, end1] = this.parseZipRange(range1);
    const [start2, end2] = this.parseZipRange(range2);
    
    return !(end1 < start2 || end2 < start1);
  },

  parseZipRange(range: string): [number, number] {
    if (range.includes('-')) {
      const [start, end] = range.split('-').map(s => parseInt(s.replace(/\D/g, ''), 10));
      return [start, end];
    }
    const single = parseInt(range.replace(/\D/g, ''), 10);
    return [single, single];
  },

  isZipInRanges(zip: string, ranges: string[]): boolean {
    const zipNum = parseInt(zip.replace(/\D/g, ''), 10);
    
    for (const range of ranges) {
      const [start, end] = this.parseZipRange(range);
      if (zipNum >= start && zipNum <= end) {
        return true;
      }
    }
    
    return false;
  },

  isFullOverlap(
    territory1: Partial<InsertTerritoryDefinition>, 
    territory2: TerritoryDefinition
  ): boolean {
    const t1States = territory1.states || [];
    const t2States = territory2.states || [];
    
    if (t1States.length > 0 && t2States.length > 0) {
      const smaller = t1States.length <= t2States.length ? t1States : t2States;
      const larger = t1States.length > t2States.length ? t1States : t2States;
      
      if (smaller.every(s => larger.includes(s))) {
        return true;
      }
    }
    
    return false;
  }
};

export default territoryService;
