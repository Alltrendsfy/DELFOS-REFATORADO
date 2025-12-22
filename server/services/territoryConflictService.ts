import { db } from "../db";
import { franchises } from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";

export interface TerritoryDefinition {
  country?: string;
  state?: string;
  city?: string;
  region?: string;
}

export interface TerritoryConflict {
  conflicting_franchise_id: string;
  conflicting_franchise_name: string;
  territory_level: 'country' | 'state' | 'city' | 'region';
  is_exclusive: boolean;
  overlap_description: string;
}

export interface TerritoryCheckResult {
  has_conflict: boolean;
  conflicts: TerritoryConflict[];
  can_proceed: boolean;
  warning_message?: string;
}

class TerritoryConflictService {
  async checkTerritoryConflict(
    newTerritory: TerritoryDefinition,
    excludeFranchiseId?: string
  ): Promise<TerritoryCheckResult> {
    const conflicts: TerritoryConflict[] = [];
    
    if (!newTerritory.country && !newTerritory.state && !newTerritory.city && !newTerritory.region) {
      return {
        has_conflict: false,
        conflicts: [],
        can_proceed: true,
      };
    }
    
    let query = db.select()
      .from(franchises)
      .where(and(
        eq(franchises.status, 'active'),
        isNotNull(franchises.territory_country)
      ));
    
    const existingFranchises = await query;
    
    for (const franchise of existingFranchises) {
      if (excludeFranchiseId && franchise.id === excludeFranchiseId) {
        continue;
      }
      
      const conflict = this.detectConflict(newTerritory, {
        country: franchise.territory_country || undefined,
        state: franchise.territory_state || undefined,
        city: franchise.territory_city || undefined,
        region: franchise.territory_region || undefined,
      }, franchise.territory_exclusive || false);
      
      if (conflict) {
        conflicts.push({
          conflicting_franchise_id: franchise.id,
          conflicting_franchise_name: franchise.name,
          territory_level: conflict.level,
          is_exclusive: franchise.territory_exclusive || false,
          overlap_description: conflict.description,
        });
      }
    }
    
    const hasExclusiveConflict = conflicts.some(c => c.is_exclusive);
    
    return {
      has_conflict: conflicts.length > 0,
      conflicts,
      can_proceed: !hasExclusiveConflict,
      warning_message: hasExclusiveConflict 
        ? 'Territory has exclusive rights assigned to another franchise'
        : conflicts.length > 0 
          ? 'Territory overlaps with existing franchises (non-exclusive)'
          : undefined,
    };
  }
  
  private detectConflict(
    newTerritory: TerritoryDefinition,
    existingTerritory: TerritoryDefinition,
    isExclusive: boolean
  ): { level: 'country' | 'state' | 'city' | 'region'; description: string } | null {
    if (newTerritory.region && existingTerritory.region && 
        newTerritory.region.toLowerCase() === existingTerritory.region.toLowerCase() &&
        newTerritory.country === existingTerritory.country) {
      return {
        level: 'region',
        description: `Same region: ${newTerritory.region} in ${newTerritory.country}`,
      };
    }
    
    if (newTerritory.city && existingTerritory.city &&
        newTerritory.city.toLowerCase() === existingTerritory.city.toLowerCase() &&
        newTerritory.state === existingTerritory.state &&
        newTerritory.country === existingTerritory.country) {
      return {
        level: 'city',
        description: `Same city: ${newTerritory.city}, ${newTerritory.state}`,
      };
    }
    
    if (newTerritory.state && existingTerritory.state &&
        newTerritory.state.toLowerCase() === existingTerritory.state.toLowerCase() &&
        newTerritory.country === existingTerritory.country) {
      if (isExclusive && existingTerritory.city === undefined && newTerritory.city) {
        return {
          level: 'state',
          description: `State ${newTerritory.state} has exclusive rights`,
        };
      }
      if (!newTerritory.city && !existingTerritory.city) {
        return {
          level: 'state',
          description: `Same state: ${newTerritory.state}`,
        };
      }
    }
    
    if (newTerritory.country && existingTerritory.country &&
        newTerritory.country === existingTerritory.country &&
        !newTerritory.state && !existingTerritory.state &&
        isExclusive) {
      return {
        level: 'country',
        description: `Country ${newTerritory.country} has exclusive rights`,
      };
    }
    
    return null;
  }
  
  async getMasterFranchisesInTerritory(territory: TerritoryDefinition): Promise<typeof franchises.$inferSelect[]> {
    let conditions = [
      eq(franchises.is_master_franchise, true),
      eq(franchises.status, 'active'),
    ];
    
    if (territory.country) {
      conditions.push(eq(franchises.territory_country, territory.country));
    }
    
    const results = await db.select()
      .from(franchises)
      .where(and(...conditions));
    
    return results.filter(f => {
      if (territory.state && f.territory_state && f.territory_state !== territory.state) {
        return false;
      }
      if (territory.city && f.territory_city && f.territory_city !== territory.city) {
        return false;
      }
      return true;
    });
  }
  
  async getSubFranchisesForMaster(masterFranchiseId: string): Promise<typeof franchises.$inferSelect[]> {
    return await db.select()
      .from(franchises)
      .where(and(
        eq(franchises.parent_master_id, masterFranchiseId),
        eq(franchises.status, 'active')
      ));
  }
  
  async assignTerritoryToFranchise(
    franchiseId: string,
    territory: TerritoryDefinition,
    isExclusive: boolean
  ): Promise<{ success: boolean; error?: string; conflicts?: TerritoryConflict[] }> {
    const checkResult = await this.checkTerritoryConflict(territory, franchiseId);
    
    if (!checkResult.can_proceed) {
      return {
        success: false,
        error: checkResult.warning_message,
        conflicts: checkResult.conflicts,
      };
    }
    
    await db.update(franchises)
      .set({
        territory_country: territory.country || null,
        territory_state: territory.state || null,
        territory_city: territory.city || null,
        territory_region: territory.region || null,
        territory_exclusive: isExclusive,
        updated_at: new Date(),
      })
      .where(eq(franchises.id, franchiseId));
    
    return { success: true };
  }
}

export const territoryConflictService = new TerritoryConflictService();
