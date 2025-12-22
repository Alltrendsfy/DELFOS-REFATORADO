import { db } from "../db";
import { 
  users, 
  campaigns, 
  franchises, 
  franchise_users,
  custom_risk_profiles,
  fraud_alerts,
  GOVERNANCE_REQUIREMENTS,
  PLAN_HIERARCHY,
  FULL_PROFILE_PARAMETER_RANGES,
  CustomRiskProfile,
  User
} from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { franchisePlanService } from "./franchisePlanService";
import crypto from "crypto";

export type GovernanceValidationResult = {
  valid: boolean;
  errors: GovernanceError[];
  warnings: GovernanceWarning[];
  metadata: GovernanceMetadata;
};

export type GovernanceError = {
  code: string;
  message: string;
  field?: string;
};

export type GovernanceWarning = {
  code: string;
  message: string;
};

export type GovernanceMetadata = {
  profile_code: string;
  user_days_in_system: number;
  user_prs_score: number;
  user_antifraud_flags: number;
  user_strong_audit_enabled: boolean;
  user_high_risk_accepted: boolean;
  user_plan_code?: string;
  governance_requirements?: typeof GOVERNANCE_REQUIREMENTS.SUPER_AGGRESSIVE | typeof GOVERNANCE_REQUIREMENTS.FULL_CUSTOM;
};

export class GovernanceService {
  
  async validateProfileAccess(
    userId: string,
    profileCode: string,
    customProfileId?: string
  ): Promise<GovernanceValidationResult> {
    const errors: GovernanceError[] = [];
    const warnings: GovernanceWarning[] = [];
    
    const user = await this.getUserById(userId);
    if (!user) {
      return {
        valid: false,
        errors: [{ code: "USER_NOT_FOUND", message: "Usuário não encontrado" }],
        warnings: [],
        metadata: this.getEmptyMetadata(profileCode)
      };
    }

    const daysInSystem = this.calculateDaysInSystem(user.createdAt);
    const prsScore = parseFloat(user.prs_score || "50");
    const antifraudFlags = user.antifraud_flags_count || 0;
    const strongAuditEnabled = user.strong_audit_enabled || false;
    const highRiskAccepted = !!user.high_risk_accepted_at;

    const metadata: GovernanceMetadata = {
      profile_code: profileCode,
      user_days_in_system: daysInSystem,
      user_prs_score: prsScore,
      user_antifraud_flags: antifraudFlags,
      user_strong_audit_enabled: strongAuditEnabled,
      user_high_risk_accepted: highRiskAccepted
    };

    if (!["SA", "F"].includes(profileCode.toUpperCase())) {
      return { valid: true, errors: [], warnings: [], metadata };
    }

    const requirements = profileCode.toUpperCase() === "SA" 
      ? GOVERNANCE_REQUIREMENTS.SUPER_AGGRESSIVE 
      : GOVERNANCE_REQUIREMENTS.FULL_CUSTOM;

    metadata.governance_requirements = requirements;

    const planCheck = await this.checkPlanRequirement(userId, requirements.min_plan_codes);
    if (!planCheck.valid) {
      errors.push({
        code: "INSUFFICIENT_PLAN",
        message: `Plano atual não permite este perfil. Planos mínimos: ${requirements.min_plan_codes.join(", ")}`
      });
    }
    metadata.user_plan_code = planCheck.planCode || undefined;

    if (daysInSystem < requirements.min_days_in_system) {
      errors.push({
        code: "INSUFFICIENT_TENURE",
        message: `Tempo mínimo no sistema: ${requirements.min_days_in_system} dias. Seu tempo: ${daysInSystem} dias`,
        field: "days_in_system"
      });
    }

    if (prsScore < requirements.min_prs_score) {
      errors.push({
        code: "INSUFFICIENT_PRS",
        message: `PRS mínimo: ${requirements.min_prs_score}. Seu PRS: ${prsScore.toFixed(2)}`,
        field: "prs_score"
      });
    }

    if (requirements.requires_no_antifraud_flags && antifraudFlags > 0) {
      errors.push({
        code: "ANTIFRAUD_FLAGS_PRESENT",
        message: `Existem ${antifraudFlags} alertas de antifraude ativos nos últimos 90 dias`,
        field: "antifraud_flags"
      });
    }

    if (requirements.requires_strong_audit && !strongAuditEnabled) {
      errors.push({
        code: "STRONG_AUDIT_REQUIRED",
        message: "Auditoria reforçada deve estar habilitada nas configurações",
        field: "strong_audit"
      });
    }

    if (requirements.requires_legal_acceptance && !highRiskAccepted) {
      // SECURITY: Legal acceptance is MANDATORY for high-risk profiles - treat as error, not warning
      errors.push({
        code: "LEGAL_ACCEPTANCE_REQUIRED",
        message: "Aceitação jurídica de alto risco é obrigatória. Complete o termo de responsabilidade antes de continuar.",
        field: "high_risk_accepted"
      });
    }

    if (profileCode.toUpperCase() === "F" && customProfileId) {
      const customProfileValidation = await this.validateCustomProfile(customProfileId, userId);
      errors.push(...customProfileValidation.errors);
      warnings.push(...customProfileValidation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata
    };
  }

  async checkPlanRequirement(userId: string, minPlanCodes: readonly string[]): Promise<{
    valid: boolean;
    planCode: string | null;
  }> {
    const { planCode } = await franchisePlanService.getAllowedRiskProfilesForUser(userId);
    
    if (!planCode) {
      return { valid: true, planCode: null };
    }

    const userPlanLevel = PLAN_HIERARCHY[planCode as keyof typeof PLAN_HIERARCHY] || 0;
    
    for (const minPlan of minPlanCodes) {
      const minLevel = PLAN_HIERARCHY[minPlan as keyof typeof PLAN_HIERARCHY] || 0;
      if (userPlanLevel >= minLevel) {
        return { valid: true, planCode };
      }
    }

    return { valid: false, planCode };
  }

  async validateCustomProfile(profileId: string, userId: string): Promise<{
    errors: GovernanceError[];
    warnings: GovernanceWarning[];
  }> {
    const errors: GovernanceError[] = [];
    const warnings: GovernanceWarning[] = [];

    const profiles = await db
      .select()
      .from(custom_risk_profiles)
      .where(eq(custom_risk_profiles.id, profileId))
      .limit(1);

    if (profiles.length === 0) {
      errors.push({
        code: "CUSTOM_PROFILE_NOT_FOUND",
        message: "Perfil customizado não encontrado"
      });
      return { errors, warnings };
    }

    const profile = profiles[0];

    if (profile.user_id !== userId) {
      errors.push({
        code: "CUSTOM_PROFILE_UNAUTHORIZED",
        message: "Perfil customizado não pertence ao usuário"
      });
      return { errors, warnings };
    }

    const paramValidation = this.validateCustomProfileParameters(profile);
    errors.push(...paramValidation.errors);
    warnings.push(...paramValidation.warnings);

    const tpPctSum = parseFloat(profile.tp1_pct || "0") + 
                     parseFloat(profile.tp2_pct || "0") + 
                     parseFloat(profile.trail_pct || "0");
    
    if (Math.abs(tpPctSum - 100) > 0.01) {
      errors.push({
        code: "TP_PERCENTAGE_SUM_INVALID",
        message: `TP1% + TP2% + Trail% deve somar 100%. Soma atual: ${tpPctSum.toFixed(2)}%`,
        field: "tp_percentages"
      });
    }

    if (profile.use_leverage && parseFloat(profile.leverage_amount || "1") > 1) {
      const planCheck = await this.checkPlanRequirement(userId, ["full"]);
      if (!planCheck.valid) {
        errors.push({
          code: "LEVERAGE_NOT_ALLOWED",
          message: "Alavancagem só é permitida com plano FULL",
          field: "leverage"
        });
      }
    }

    return { errors, warnings };
  }

  validateCustomProfileParameters(profile: CustomRiskProfile): {
    errors: GovernanceError[];
    warnings: GovernanceWarning[];
  } {
    const errors: GovernanceError[] = [];
    const warnings: GovernanceWarning[] = [];

    const numericFields: Array<{ field: keyof CustomRiskProfile; rangeKey: keyof typeof FULL_PROFILE_PARAMETER_RANGES }> = [
      { field: "risk_per_trade_pct", rangeKey: "risk_per_trade_pct" },
      { field: "daily_loss_limit_pct", rangeKey: "daily_loss_limit_pct" },
      { field: "dd_campaign_max_pct", rangeKey: "dd_campaign_max_pct" },
      { field: "dd_global_max_pct", rangeKey: "dd_global_max_pct" },
      { field: "dd_soft_reduce_at", rangeKey: "dd_soft_reduce_at" },
      { field: "max_exposure_per_asset_pct", rangeKey: "max_exposure_per_asset_pct" },
      { field: "max_exposure_per_cluster_pct", rangeKey: "max_exposure_per_cluster_pct" },
      { field: "max_corr", rangeKey: "max_corr" },
      { field: "max_open_positions", rangeKey: "max_open_positions" },
      { field: "stop_atr_mult", rangeKey: "stop_atr_mult" },
      { field: "tp1_r", rangeKey: "tp1_r" },
      { field: "tp2_r", rangeKey: "tp2_r" },
      { field: "tp1_pct", rangeKey: "tp1_pct" },
      { field: "tp2_pct", rangeKey: "tp2_pct" },
      { field: "trail_pct", rangeKey: "trail_pct" },
      { field: "trail_activate_after_r", rangeKey: "trail_activate_after_r" },
      { field: "trail_atr_mult", rangeKey: "trail_atr_mult" },
      { field: "rebalance_hours", rangeKey: "rebalance_hours" },
      { field: "audit_frequency_hours", rangeKey: "audit_frequency_hours" },
      { field: "max_orders_per_day", rangeKey: "max_orders_per_day" },
      { field: "leverage_amount", rangeKey: "leverage_amount" },
    ];

    for (const { field, rangeKey } of numericFields) {
      const value = profile[field];
      const range = FULL_PROFILE_PARAMETER_RANGES[rangeKey];
      
      if (value !== null && value !== undefined) {
        const numValue = typeof value === "string" ? parseFloat(value) : Number(value);
        
        if (isNaN(numValue)) {
          errors.push({
            code: "INVALID_PARAMETER_VALUE",
            message: `Valor inválido para ${field}`,
            field: field
          });
          continue;
        }

        if (numValue < range.min || numValue > range.max) {
          errors.push({
            code: "PARAMETER_OUT_OF_RANGE",
            message: `${field}: valor ${numValue} está fora do range permitido (${range.min}-${range.max})`,
            field: field
          });
        }
      }
    }

    return { errors, warnings };
  }

  async recordDoubleConfirmation(campaignId: string, userId: string): Promise<{
    success: boolean;
    hash: string;
  }> {
    const campaigns_result = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (campaigns_result.length === 0) {
      return { success: false, hash: "" };
    }

    const campaign = campaigns_result[0];
    
    const timestamp = new Date().toISOString();
    const hashData = `${campaignId}:${userId}:${campaign.investor_profile}:${timestamp}`;
    const confirmationHash = crypto.createHash("sha256").update(hashData).digest("hex");

    await db
      .update(campaigns)
      .set({
        double_confirmed: true,
        double_confirmed_at: new Date()
      })
      .where(eq(campaigns.id, campaignId));

    return { success: true, hash: confirmationHash };
  }

  async recordLegalAcceptance(
    userId: string,
    campaignId: string,
    acceptanceVersion: string
  ): Promise<{
    success: boolean;
    hash: string;
  }> {
    const timestamp = new Date().toISOString();
    const hashData = `LEGAL_ACCEPTANCE:${userId}:${campaignId}:${acceptanceVersion}:${timestamp}`;
    const acceptanceHash = crypto.createHash("sha256").update(hashData).digest("hex");

    await db
      .update(users)
      .set({
        high_risk_accepted_at: new Date(),
        high_risk_acceptance_version: acceptanceVersion,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    await db
      .update(campaigns)
      .set({
        legal_accepted_at: new Date(),
        legal_acceptance_hash: acceptanceHash,
        legal_acceptance_version: acceptanceVersion
      })
      .where(eq(campaigns.id, campaignId));

    return { success: true, hash: acceptanceHash };
  }

  async updateUserPRSScore(userId: string, newScore: number): Promise<void> {
    const clampedScore = Math.max(0, Math.min(100, newScore));
    
    await db
      .update(users)
      .set({
        prs_score: clampedScore.toFixed(2),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async incrementAntifraudFlags(userId: string): Promise<number> {
    const user = await this.getUserById(userId);
    if (!user) return 0;

    const newCount = (user.antifraud_flags_count || 0) + 1;
    
    await db
      .update(users)
      .set({
        antifraud_flags_count: newCount,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    return newCount;
  }

  async enableStrongAudit(userId: string): Promise<void> {
    await db
      .update(users)
      .set({
        strong_audit_enabled: true,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async lockCustomProfile(profileId: string, campaignId: string): Promise<string> {
    const profiles = await db
      .select()
      .from(custom_risk_profiles)
      .where(eq(custom_risk_profiles.id, profileId))
      .limit(1);

    if (profiles.length === 0) {
      throw new Error("Perfil customizado não encontrado");
    }

    const profile = profiles[0];
    const lockHash = this.generateProfileHash(profile);

    await db
      .update(custom_risk_profiles)
      .set({
        status: "locked",
        locked_at: new Date(),
        locked_by_campaign_id: campaignId,
        creation_hash: lockHash,
        updated_at: new Date()
      })
      .where(eq(custom_risk_profiles.id, profileId));

    await db
      .update(campaigns)
      .set({
        parameters_locked_at: new Date()
      })
      .where(eq(campaigns.id, campaignId));

    return lockHash;
  }

  generateProfileHash(profile: CustomRiskProfile): string {
    const relevantFields = {
      risk_per_trade_pct: profile.risk_per_trade_pct,
      daily_loss_limit_pct: profile.daily_loss_limit_pct,
      dd_campaign_max_pct: profile.dd_campaign_max_pct,
      dd_global_max_pct: profile.dd_global_max_pct,
      dd_soft_reduce_at: profile.dd_soft_reduce_at,
      max_exposure_per_asset_pct: profile.max_exposure_per_asset_pct,
      max_exposure_per_cluster_pct: profile.max_exposure_per_cluster_pct,
      max_corr: profile.max_corr,
      max_open_positions: profile.max_open_positions,
      stop_atr_mult: profile.stop_atr_mult,
      tp1_r: profile.tp1_r,
      tp2_r: profile.tp2_r,
      tp1_pct: profile.tp1_pct,
      tp2_pct: profile.tp2_pct,
      trail_pct: profile.trail_pct,
      trail_activate_after_r: profile.trail_activate_after_r,
      trail_atr_mult: profile.trail_atr_mult,
      use_leverage: profile.use_leverage,
      leverage_amount: profile.leverage_amount,
      selected_clusters: profile.selected_clusters
    };

    return crypto
      .createHash("sha256")
      .update(JSON.stringify(relevantFields))
      .digest("hex");
  }

  private async getUserById(userId: string): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    return result[0] || null;
  }

  private calculateDaysInSystem(createdAt: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private getEmptyMetadata(profileCode: string): GovernanceMetadata {
    return {
      profile_code: profileCode,
      user_days_in_system: 0,
      user_prs_score: 0,
      user_antifraud_flags: 0,
      user_strong_audit_enabled: false,
      user_high_risk_accepted: false
    };
  }

  getClusterRestrictions(profileCode: string): {
    blocked: number[];
    priority: number[];
  } {
    if (profileCode.toUpperCase() === "SA") {
      return {
        blocked: [...GOVERNANCE_REQUIREMENTS.SUPER_AGGRESSIVE.blocked_clusters],
        priority: [...GOVERNANCE_REQUIREMENTS.SUPER_AGGRESSIVE.priority_clusters]
      };
    }
    
    if (profileCode.toUpperCase() === "F") {
      return {
        blocked: [],
        priority: []
      };
    }

    return { blocked: [], priority: [] };
  }

  getAuditFrequencyHours(profileCode: string): number {
    if (profileCode.toUpperCase() === "SA") {
      return GOVERNANCE_REQUIREMENTS.SUPER_AGGRESSIVE.min_audit_frequency_hours;
    }
    if (profileCode.toUpperCase() === "F") {
      return GOVERNANCE_REQUIREMENTS.FULL_CUSTOM.min_audit_frequency_hours;
    }
    return 24;
  }

  isLeverageAllowed(profileCode: string): boolean {
    if (profileCode.toUpperCase() === "SA") {
      return GOVERNANCE_REQUIREMENTS.SUPER_AGGRESSIVE.leverage_allowed;
    }
    if (profileCode.toUpperCase() === "F") {
      return GOVERNANCE_REQUIREMENTS.FULL_CUSTOM.leverage_allowed;
    }
    return false;
  }

  getMaxLeverage(profileCode: string): number {
    if (profileCode.toUpperCase() === "F") {
      return GOVERNANCE_REQUIREMENTS.FULL_CUSTOM.max_leverage;
    }
    return 1.0;
  }
}

export const governanceService = new GovernanceService();
