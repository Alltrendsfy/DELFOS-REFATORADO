import { db } from "../db";
import { 
  franchise_plans, 
  franchise_plan_versions, 
  franchise_plan_audit_logs,
  franchises,
  franchise_users,
  FranchisePlan,
  FranchisePlanVersion,
  FranchisePlanAuditLog,
  InsertFranchisePlanVersion,
  InsertFranchisePlanAuditLog,
  GOVERNANCE_REQUIREMENTS
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { governanceService, GovernanceValidationResult } from "./governanceService";

type CreatePlanInput = {
  name: string;
  code: string;
  max_campaigns?: number;
  max_capital_usd?: string | null;
  royalty_percentage?: string;
  features?: any;
  is_active?: boolean;
  display_order?: number;
};

type CreateVersionInput = Omit<InsertFranchisePlanVersion, 'id' | 'version' | 'created_at' | 'activated_at' | 'archived_at'>;

export class FranchisePlanService {
  
  async listPlans(): Promise<FranchisePlan[]> {
    return await db
      .select()
      .from(franchise_plans)
      .orderBy(franchise_plans.display_order, franchise_plans.name);
  }

  async getPlanById(planId: string): Promise<FranchisePlan | null> {
    const results = await db
      .select()
      .from(franchise_plans)
      .where(eq(franchise_plans.id, planId))
      .limit(1);
    
    return results[0] || null;
  }

  async getPlanByCode(code: string): Promise<FranchisePlan | null> {
    const results = await db
      .select()
      .from(franchise_plans)
      .where(eq(franchise_plans.code, code))
      .limit(1);
    
    return results[0] || null;
  }

  async createPlan(data: CreatePlanInput, userId?: string): Promise<FranchisePlan> {
    const [plan] = await db
      .insert(franchise_plans)
      .values({
        name: data.name,
        code: data.code,
        max_campaigns: data.max_campaigns ?? 3,
        max_capital_usd: data.max_capital_usd ?? null,
        royalty_percentage: data.royalty_percentage ?? "10",
        features: data.features ?? {},
        is_active: data.is_active ?? true,
        display_order: data.display_order ?? 0,
      })
      .returning();

    await this.logAudit({
      plan_id: plan.id,
      action: "plan_created",
      changes_summary: `Plano "${data.name}" criado`,
      new_values: plan as any,
      performed_by: userId ?? null,
    });

    return plan;
  }

  async updatePlan(planId: string, data: Partial<CreatePlanInput>, userId?: string): Promise<FranchisePlan | null> {
    const existingPlan = await this.getPlanById(planId);
    if (!existingPlan) return null;

    const [updated] = await db
      .update(franchise_plans)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(franchise_plans.id, planId))
      .returning();

    await this.logAudit({
      plan_id: planId,
      action: "plan_updated",
      changes_summary: `Plano "${updated.name}" atualizado`,
      old_values: existingPlan as any,
      new_values: updated as any,
      performed_by: userId ?? null,
    });

    return updated;
  }

  async listVersions(planId: string): Promise<FranchisePlanVersion[]> {
    return await db
      .select()
      .from(franchise_plan_versions)
      .where(eq(franchise_plan_versions.plan_id, planId))
      .orderBy(desc(franchise_plan_versions.version));
  }

  async getLatestVersion(planId: string): Promise<FranchisePlanVersion | null> {
    const results = await db
      .select()
      .from(franchise_plan_versions)
      .where(eq(franchise_plan_versions.plan_id, planId))
      .orderBy(desc(franchise_plan_versions.version))
      .limit(1);
    
    return results[0] || null;
  }

  async getActiveVersion(planId: string): Promise<FranchisePlanVersion | null> {
    const results = await db
      .select()
      .from(franchise_plan_versions)
      .where(and(
        eq(franchise_plan_versions.plan_id, planId),
        eq(franchise_plan_versions.version_status, "active")
      ))
      .limit(1);
    
    return results[0] || null;
  }

  async getVersionById(versionId: string): Promise<FranchisePlanVersion | null> {
    const results = await db
      .select()
      .from(franchise_plan_versions)
      .where(eq(franchise_plan_versions.id, versionId))
      .limit(1);
    
    return results[0] || null;
  }

  async createVersion(data: CreateVersionInput, userId?: string): Promise<FranchisePlanVersion> {
    const latestVersion = await this.getLatestVersion(data.plan_id);
    const newVersionNumber = (latestVersion?.version ?? 0) + 1;

    const [version] = await db
      .insert(franchise_plan_versions)
      .values({
        ...data,
        version: newVersionNumber,
        version_status: "draft",
        created_by: userId ?? null,
      })
      .returning();

    await this.logAudit({
      plan_id: data.plan_id,
      version_id: version.id,
      action: "version_created",
      changes_summary: `Versão ${newVersionNumber} criada`,
      new_values: version as any,
      performed_by: userId ?? null,
    });

    return version;
  }

  async activateVersion(versionId: string, userId?: string): Promise<FranchisePlanVersion | null> {
    const version = await this.getVersionById(versionId);
    if (!version) return null;

    await db
      .update(franchise_plan_versions)
      .set({ 
        version_status: "archived",
        archived_at: new Date()
      })
      .where(and(
        eq(franchise_plan_versions.plan_id, version.plan_id),
        eq(franchise_plan_versions.version_status, "active")
      ));

    const [activated] = await db
      .update(franchise_plan_versions)
      .set({
        version_status: "active",
        activated_at: new Date(),
      })
      .where(eq(franchise_plan_versions.id, versionId))
      .returning();

    await this.logAudit({
      plan_id: version.plan_id,
      version_id: versionId,
      action: "version_activated",
      changes_summary: `Versão ${version.version} ativada`,
      new_values: activated as any,
      performed_by: userId ?? null,
    });

    return activated;
  }

  async archiveVersion(versionId: string, userId?: string): Promise<FranchisePlanVersion | null> {
    const version = await this.getVersionById(versionId);
    if (!version) return null;

    const [archived] = await db
      .update(franchise_plan_versions)
      .set({
        version_status: "archived",
        archived_at: new Date(),
      })
      .where(eq(franchise_plan_versions.id, versionId))
      .returning();

    await this.logAudit({
      plan_id: version.plan_id,
      version_id: versionId,
      action: "version_archived",
      changes_summary: `Versão ${version.version} arquivada`,
      old_values: version as any,
      new_values: archived as any,
      performed_by: userId ?? null,
    });

    return archived;
  }

  async duplicateVersion(versionId: string, notes?: string, userId?: string): Promise<FranchisePlanVersion | null> {
    const sourceVersion = await this.getVersionById(versionId);
    if (!sourceVersion) return null;

    const { id, version, version_status, version_notes, created_by, activated_at, archived_at, created_at, ...versionData } = sourceVersion;
    
    const newVersion = await this.createVersion({
      ...versionData,
      version_notes: notes ?? `Copiado da versão ${version}`,
      version_status: "draft",
    }, userId);

    return newVersion;
  }

  async listAuditLogs(planId: string, limit: number = 50): Promise<FranchisePlanAuditLog[]> {
    return await db
      .select()
      .from(franchise_plan_audit_logs)
      .where(eq(franchise_plan_audit_logs.plan_id, planId))
      .orderBy(desc(franchise_plan_audit_logs.created_at))
      .limit(limit);
  }

  private async logAudit(data: InsertFranchisePlanAuditLog): Promise<void> {
    try {
      await db
        .insert(franchise_plan_audit_logs)
        .values(data);
    } catch (error) {
      console.error("[FranchisePlanService] Erro ao criar log de auditoria:", error);
    }
  }

  async getPlanWithActiveVersion(planId: string): Promise<{ plan: FranchisePlan; version: FranchisePlanVersion | null } | null> {
    const plan = await this.getPlanById(planId);
    if (!plan) return null;

    const version = await this.getActiveVersion(planId);
    return { plan, version };
  }

  async getPlansWithVersions(): Promise<Array<FranchisePlan & { activeVersion: FranchisePlanVersion | null; versionCount: number }>> {
    const plans = await this.listPlans();
    
    const result = await Promise.all(
      plans.map(async (plan) => {
        const versions = await this.listVersions(plan.id);
        const activeVersion = versions.find(v => v.version_status === "active") ?? null;
        return {
          ...plan,
          activeVersion,
          versionCount: versions.length,
        };
      })
    );

    return result;
  }

  async getDefaultVersionData(planCode: string): Promise<Partial<CreateVersionInput>> {
    const defaults: Record<string, Partial<CreateVersionInput>> = {
      starter: {
        franchise_fee: "1500.00",
        fee_periodicity_months: 1,
        first_due_date_offset_days: 30,
        allowed_payment_methods: ["pix", "boleto"],
        auto_adjustment: true,
        adjustment_index: "ipca",
        late_payment_penalty_pct: "2.00",
        late_payment_interest_pct: "1.00",
        payment_tolerance_days: 3,
        max_simultaneous_campaigns: 1,
        max_standard_campaigns: 3,
        max_opportunity_campaigns: 0,
        campaign_cooldown_hours: 24,
        max_total_capital: "50000.00",
        max_capital_per_campaign_pct: "100.00",
        max_capital_per_co_pct: "0.00",
        max_exposure_per_asset_pct: "30.00",
        max_exposure_per_cluster_pct: "50.00",
        allowed_risk_profiles: ["conservative"],
        max_risk_per_trade_pct: "1.00",
        max_drawdown_per_campaign_pct: "10.00",
        allow_risk_customization: false,
        ai_access_level: "none",
        max_cos_per_period: 0,
        co_period_days: 30,
        min_opportunity_score: 80,
        allow_blueprint_adjustment: false,
        risk_triggers_enabled: true,
        performance_triggers_enabled: true,
        benchmark_triggers_enabled: false,
        auto_rebalance_enabled: false,
        min_audit_frequency_hours: 24,
        royalty_model: "fixed",
        royalty_min_pct: "15.00",
        royalty_max_pct: "15.00",
        royalty_applies_to_cos: false,
        royalty_calculation_period: "monthly",
        audit_level: "standard",
        allow_auto_downgrade: true,
        suspension_policy_days: 15,
        antifraud_tolerance: 2,
      },
      pro: {
        franchise_fee: "3500.00",
        fee_periodicity_months: 1,
        first_due_date_offset_days: 30,
        allowed_payment_methods: ["pix", "boleto", "credit_card"],
        auto_adjustment: true,
        adjustment_index: "ipca",
        late_payment_penalty_pct: "2.00",
        late_payment_interest_pct: "1.00",
        payment_tolerance_days: 5,
        max_simultaneous_campaigns: 3,
        max_standard_campaigns: 10,
        max_opportunity_campaigns: 2,
        campaign_cooldown_hours: 12,
        max_total_capital: "250000.00",
        max_capital_per_campaign_pct: "50.00",
        max_capital_per_co_pct: "20.00",
        max_exposure_per_asset_pct: "25.00",
        max_exposure_per_cluster_pct: "45.00",
        allowed_risk_profiles: ["conservative", "moderate"],
        max_risk_per_trade_pct: "2.00",
        max_drawdown_per_campaign_pct: "15.00",
        allow_risk_customization: true,
        ai_access_level: "alerts",
        max_cos_per_period: 2,
        co_period_days: 30,
        min_opportunity_score: 75,
        allow_blueprint_adjustment: false,
        risk_triggers_enabled: true,
        performance_triggers_enabled: true,
        benchmark_triggers_enabled: true,
        auto_rebalance_enabled: true,
        min_audit_frequency_hours: 8,
        royalty_model: "fixed",
        royalty_min_pct: "12.00",
        royalty_max_pct: "12.00",
        royalty_applies_to_cos: true,
        royalty_calculation_period: "monthly",
        audit_level: "standard",
        allow_auto_downgrade: true,
        suspension_policy_days: 30,
        antifraud_tolerance: 3,
      },
      enterprise: {
        franchise_fee: "8500.00",
        fee_periodicity_months: 1,
        first_due_date_offset_days: 30,
        allowed_payment_methods: ["pix", "boleto", "credit_card", "bank_transfer"],
        auto_adjustment: true,
        adjustment_index: "ipca",
        late_payment_penalty_pct: "2.00",
        late_payment_interest_pct: "1.00",
        payment_tolerance_days: 7,
        max_simultaneous_campaigns: 10,
        max_standard_campaigns: 50,
        max_opportunity_campaigns: 10,
        campaign_cooldown_hours: 4,
        max_total_capital: "1000000.00",
        max_capital_per_campaign_pct: "30.00",
        max_capital_per_co_pct: "25.00",
        max_exposure_per_asset_pct: "20.00",
        max_exposure_per_cluster_pct: "40.00",
        allowed_risk_profiles: ["conservative", "moderate", "aggressive", "super_aggressive"],
        max_risk_per_trade_pct: "3.00",
        max_drawdown_per_campaign_pct: "20.00",
        allow_risk_customization: true,
        ai_access_level: "alerts_co",
        max_cos_per_period: 10,
        co_period_days: 30,
        min_opportunity_score: 70,
        allow_blueprint_adjustment: true,
        risk_triggers_enabled: true,
        performance_triggers_enabled: true,
        benchmark_triggers_enabled: true,
        auto_rebalance_enabled: true,
        min_audit_frequency_hours: 4,
        royalty_model: "dynamic_prs",
        royalty_min_pct: "8.00",
        royalty_max_pct: "20.00",
        royalty_applies_to_cos: true,
        royalty_calculation_period: "monthly",
        audit_level: "reinforced",
        allow_auto_downgrade: false,
        suspension_policy_days: 45,
        antifraud_tolerance: 5,
      },
      full: {
        franchise_fee: "15000.00",
        fee_periodicity_months: 1,
        first_due_date_offset_days: 30,
        allowed_payment_methods: ["pix", "boleto", "credit_card", "bank_transfer", "crypto"],
        auto_adjustment: true,
        adjustment_index: "ipca",
        late_payment_penalty_pct: "2.00",
        late_payment_interest_pct: "1.00",
        payment_tolerance_days: 10,
        max_simultaneous_campaigns: 25,
        max_standard_campaigns: 100,
        max_opportunity_campaigns: 30,
        campaign_cooldown_hours: 1,
        max_total_capital: "5000000.00",
        max_capital_per_campaign_pct: "25.00",
        max_capital_per_co_pct: "30.00",
        max_exposure_per_asset_pct: "55.00",
        max_exposure_per_cluster_pct: "85.00",
        allowed_risk_profiles: ["conservative", "moderate", "aggressive", "super_aggressive", "full_custom"],
        max_risk_per_trade_pct: "3.50",
        max_drawdown_per_campaign_pct: "55.00",
        allow_risk_customization: true,
        ai_access_level: "alerts_co",
        max_cos_per_period: 30,
        co_period_days: 30,
        min_opportunity_score: 65,
        allow_blueprint_adjustment: true,
        risk_triggers_enabled: true,
        performance_triggers_enabled: true,
        benchmark_triggers_enabled: true,
        auto_rebalance_enabled: true,
        min_audit_frequency_hours: 1,
        royalty_model: "dynamic_prs",
        royalty_min_pct: "5.00",
        royalty_max_pct: "15.00",
        royalty_applies_to_cos: true,
        royalty_calculation_period: "monthly",
        audit_level: "reinforced",
        allow_auto_downgrade: false,
        suspension_policy_days: 60,
        antifraud_tolerance: 0,
      },
    };

    return defaults[planCode] ?? defaults.starter;
  }

  // Default restrictive profile for security - only conservative allowed when plan is missing/incomplete
  private readonly RESTRICTIVE_DEFAULT_PROFILES = ['conservative'];

  /**
   * Get allowed risk profiles for a user based on their franchise plan
   * Returns null if user is not part of a franchise (unrestricted access)
   * Returns array of allowed profile codes if user is a franchisee
   * SECURITY: Defaults to most restrictive profile (conservative only) when plan is incomplete
   */
  async getAllowedRiskProfilesForUser(userId: string): Promise<{
    allowed: string[] | null;
    planCode: string | null;
    planName: string | null;
    franchiseId: string | null;
  }> {
    // Find user's franchise
    const franchiseUser = await db
      .select()
      .from(franchise_users)
      .where(and(
        eq(franchise_users.user_id, userId),
        eq(franchise_users.is_active, true)
      ))
      .limit(1);

    if (franchiseUser.length === 0) {
      // User not part of any franchise - unrestricted access
      return { allowed: null, planCode: null, planName: null, franchiseId: null };
    }

    // Get franchise and its plan
    const franchise = await db
      .select()
      .from(franchises)
      .where(eq(franchises.id, franchiseUser[0].franchise_id))
      .limit(1);

    if (franchise.length === 0) {
      // Franchise not found - SECURITY: default to most restrictive
      console.warn(`[FranchisePlan] SECURITY: Franchise not found for user ${userId}, defaulting to restrictive profiles`);
      return { 
        allowed: this.RESTRICTIVE_DEFAULT_PROFILES, 
        planCode: null, 
        planName: null, 
        franchiseId: franchiseUser[0].franchise_id 
      };
    }

    if (!franchise[0].plan_id) {
      // No plan assigned - SECURITY: default to most restrictive
      console.warn(`[FranchisePlan] SECURITY: No plan assigned for franchise ${franchise[0].id}, defaulting to restrictive profiles`);
      return { 
        allowed: this.RESTRICTIVE_DEFAULT_PROFILES, 
        planCode: null, 
        planName: 'No Plan Assigned', 
        franchiseId: franchise[0].id 
      };
    }

    // Get the plan
    const plan = await this.getPlanById(franchise[0].plan_id);
    if (!plan) {
      // Plan not found - SECURITY: default to most restrictive
      console.warn(`[FranchisePlan] SECURITY: Plan ${franchise[0].plan_id} not found, defaulting to restrictive profiles`);
      return { 
        allowed: this.RESTRICTIVE_DEFAULT_PROFILES, 
        planCode: null, 
        planName: null, 
        franchiseId: franchise[0].id 
      };
    }

    // Get active version of the plan
    const activeVersion = await this.getActiveVersion(plan.id);
    if (!activeVersion) {
      // No active version - use defaults based on plan code (this respects plan hierarchy)
      const defaults = await this.getDefaultVersionData(plan.code);
      console.log(`[FranchisePlan] No active version for plan ${plan.code}, using default profiles: ${defaults.allowed_risk_profiles}`);
      return {
        allowed: defaults.allowed_risk_profiles || this.RESTRICTIVE_DEFAULT_PROFILES,
        planCode: plan.code,
        planName: plan.name,
        franchiseId: franchise[0].id
      };
    }

    return {
      allowed: activeVersion.allowed_risk_profiles || this.RESTRICTIVE_DEFAULT_PROFILES,
      planCode: plan.code,
      planName: plan.name,
      franchiseId: franchise[0].id
    };
  }

  /**
   * Validate if a given investor profile is allowed for a user
   * Maps profile codes: C -> conservative, M -> moderate, A -> aggressive, SA -> super_aggressive, F -> full_custom
   */
  async validateRiskProfileForUser(userId: string, investorProfile: string): Promise<{
    valid: boolean;
    reason?: string;
    allowedProfiles?: string[];
  }> {
    const { allowed, planCode, planName } = await this.getAllowedRiskProfilesForUser(userId);

    // User not part of franchise - all profiles allowed
    if (allowed === null) {
      return { valid: true };
    }

    // Map profile code to lowercase name (extended for new profiles)
    const profileMap: Record<string, string> = {
      'C': 'conservative',
      'M': 'moderate',
      'A': 'aggressive',
      'SA': 'super_aggressive',
      'F': 'full_custom'
    };

    const profileName = profileMap[investorProfile.toUpperCase()] || investorProfile.toLowerCase();

    if (allowed.includes(profileName)) {
      return { valid: true };
    }

    return {
      valid: false,
      reason: `Risk profile "${profileName}" is not allowed for your franchise plan "${planName || planCode}". Allowed profiles: ${allowed.join(', ')}`,
      allowedProfiles: allowed
    };
  }

  /**
   * Get the human-readable name for a profile code
   */
  getProfileDisplayName(profileCode: string): string {
    const displayNames: Record<string, string> = {
      'C': 'Conservador',
      'M': 'Moderado',
      'A': 'Agressivo',
      'SA': 'Super Agressivo',
      'F': 'Full Custom'
    };
    return displayNames[profileCode.toUpperCase()] || profileCode;
  }

  /**
   * Map profile code to lowercase name for comparison
   */
  getProfileInternalName(profileCode: string): string {
    const profileMap: Record<string, string> = {
      'C': 'conservative',
      'M': 'moderate',
      'A': 'aggressive',
      'SA': 'super_aggressive',
      'F': 'full_custom'
    };
    return profileMap[profileCode.toUpperCase()] || profileCode.toLowerCase();
  }

  /**
   * Map lowercase name to profile code
   */
  getProfileCode(internalName: string): string {
    const codeMap: Record<string, string> = {
      'conservative': 'C',
      'moderate': 'M',
      'aggressive': 'A',
      'super_aggressive': 'SA',
      'full_custom': 'F'
    };
    return codeMap[internalName.toLowerCase()] || internalName.toUpperCase();
  }

  /**
   * Complete validation for campaign creation with a given risk profile
   * Combines franchise plan validation + governance validation
   */
  async validateCampaignRiskProfile(
    userId: string,
    investorProfile: string,
    customProfileId?: string
  ): Promise<{
    valid: boolean;
    planValidation: { valid: boolean; reason?: string; allowedProfiles?: string[] };
    governanceValidation: GovernanceValidationResult | null;
    requiresDoubleConfirm: boolean;
    requiresLegalAcceptance: boolean;
  }> {
    const planValidation = await this.validateRiskProfileForUser(userId, investorProfile);
    
    let governanceValidation: GovernanceValidationResult | null = null;
    let requiresDoubleConfirm = false;
    let requiresLegalAcceptance = false;

    if (["SA", "F"].includes(investorProfile.toUpperCase())) {
      // SECURITY: FULL_CUSTOM profile REQUIRES customProfileId - enforce at service layer
      if (investorProfile.toUpperCase() === "F" && !customProfileId) {
        return {
          valid: false,
          planValidation,
          governanceValidation: {
            valid: false,
            errors: [{
              code: "CUSTOM_PROFILE_REQUIRED",
              message: "Full Custom profile requires a custom profile configuration (customProfileId)"
            }],
            warnings: [],
            metadata: {}
          },
          requiresDoubleConfirm: true,
          requiresLegalAcceptance: true
        };
      }
      
      governanceValidation = await governanceService.validateProfileAccess(
        userId,
        investorProfile,
        customProfileId
      );

      const requirements = investorProfile.toUpperCase() === "SA"
        ? GOVERNANCE_REQUIREMENTS.SUPER_AGGRESSIVE
        : GOVERNANCE_REQUIREMENTS.FULL_CUSTOM;

      requiresDoubleConfirm = requirements.requires_double_confirm;
      requiresLegalAcceptance = requirements.requires_legal_acceptance;
    }

    // SECURITY: For high-risk profiles, governance must be validated and must pass
    // If governance is missing or invalid for SA/F, the result is ALWAYS invalid
    let valid: boolean;
    if (["SA", "F"].includes(investorProfile.toUpperCase())) {
      // High-risk profiles REQUIRE explicit governance pass - fail closed
      if (!governanceValidation) {
        // Should never happen since we call governanceService above, but fail safe
        console.error(`[FranchisePlan] CRITICAL: Governance validation missing for ${investorProfile} profile`);
        valid = false;
      } else {
        valid = planValidation.valid && governanceValidation.valid;
      }
    } else {
      // Standard profiles only need plan validation
      valid = planValidation.valid;
    }

    return {
      valid,
      planValidation,
      governanceValidation,
      requiresDoubleConfirm,
      requiresLegalAcceptance
    };
  }

  /**
   * Get all available risk profiles for a user with their eligibility status
   */
  async getAvailableProfilesForUser(userId: string): Promise<Array<{
    code: string;
    name: string;
    internal_name: string;
    allowed_by_plan: boolean;
    governance_eligible: boolean;
    governance_errors: string[];
    governance_warnings: string[];
    requires_double_confirm: boolean;
    requires_legal_acceptance: boolean;
  }>> {
    const allProfiles = [
      { code: 'C', name: 'Conservador', internal_name: 'conservative' },
      { code: 'M', name: 'Moderado', internal_name: 'moderate' },
      { code: 'A', name: 'Agressivo', internal_name: 'aggressive' },
      { code: 'SA', name: 'Super Agressivo', internal_name: 'super_aggressive' },
      { code: 'F', name: 'Full Custom', internal_name: 'full_custom' }
    ];

    const { allowed } = await this.getAllowedRiskProfilesForUser(userId);

    const results = await Promise.all(allProfiles.map(async (profile) => {
      const allowedByPlan = allowed === null || allowed.includes(profile.internal_name);
      
      let governanceEligible = true;
      let governanceErrors: string[] = [];
      let governanceWarnings: string[] = [];
      let requiresDoubleConfirm = false;
      let requiresLegalAcceptance = false;

      if (['SA', 'F'].includes(profile.code)) {
        const validation = await governanceService.validateProfileAccess(userId, profile.code);
        governanceEligible = validation.valid;
        governanceErrors = validation.errors.map(e => e.message);
        governanceWarnings = validation.warnings.map(w => w.message);

        const requirements = profile.code === 'SA'
          ? GOVERNANCE_REQUIREMENTS.SUPER_AGGRESSIVE
          : GOVERNANCE_REQUIREMENTS.FULL_CUSTOM;

        requiresDoubleConfirm = requirements.requires_double_confirm;
        requiresLegalAcceptance = requirements.requires_legal_acceptance;
      }

      return {
        ...profile,
        allowed_by_plan: allowedByPlan,
        governance_eligible: governanceEligible,
        governance_errors: governanceErrors,
        governance_warnings: governanceWarnings,
        requires_double_confirm: requiresDoubleConfirm,
        requires_legal_acceptance: requiresLegalAcceptance
      };
    }));

    return results;
  }
}

export const franchisePlanService = new FranchisePlanService();
