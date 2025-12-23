import bcrypt from "bcryptjs";
import { db } from "../db";
import { persona_credentials, franchise_leads, franchises, users, franchise_plans } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export type PersonaType = "franchisor" | "master_franchise" | "franchise";

export interface LoginResult {
  success: boolean;
  error?: string;
  credentials?: typeof persona_credentials.$inferSelect;
  token?: string;
}

export interface RegisterResult {
  success: boolean;
  error?: string;
  credentialsId?: string;
  activationToken?: string;
}

class PersonaAuthService {
  private readonly SALT_ROUNDS = 12;
  private readonly TOKEN_EXPIRY_HOURS = 24;
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_MINUTES = 30;

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  generateFranchiseCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `DELFOS-${code}`;
  }

  async login(email: string, password: string, personaType: PersonaType): Promise<LoginResult> {
    try {
      const [credentials] = await db
        .select()
        .from(persona_credentials)
        .where(
          and(
            eq(persona_credentials.email, email.toLowerCase()),
            eq(persona_credentials.persona_type, personaType)
          )
        );

      if (!credentials) {
        return { success: false, error: "invalid_credentials" };
      }

      if (credentials.locked_until && new Date(credentials.locked_until) > new Date()) {
        return { success: false, error: "account_locked" };
      }

      if (!credentials.is_active) {
        return { success: false, error: "account_not_activated" };
      }

      const passwordValid = await this.verifyPassword(password, credentials.password_hash);

      if (!passwordValid) {
        const failedCount = credentials.failed_login_count + 1;
        const lockUntil =
          failedCount >= this.MAX_LOGIN_ATTEMPTS
            ? new Date(Date.now() + this.LOCKOUT_MINUTES * 60 * 1000)
            : null;

        await db
          .update(persona_credentials)
          .set({
            failed_login_count: failedCount,
            locked_until: lockUntil,
            updated_at: new Date(),
          })
          .where(eq(persona_credentials.id, credentials.id));

        return { success: false, error: "invalid_credentials" };
      }

      await db
        .update(persona_credentials)
        .set({
          failed_login_count: 0,
          locked_until: null,
          last_login_at: new Date(),
          login_count: credentials.login_count + 1,
          updated_at: new Date(),
        })
        .where(eq(persona_credentials.id, credentials.id));

      const sessionToken = this.generateToken();

      return {
        success: true,
        credentials,
        token: sessionToken,
      };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "internal_error" };
    }
  }

  async createCredentials(
    email: string,
    password: string,
    personaType: PersonaType,
    options?: {
      userId?: string;
      franchiseId?: string;
      isActive?: boolean;
    }
  ): Promise<RegisterResult> {
    try {
      // CRITICAL: Check if email exists in ANY persona type
      // Prevents same email being used for Franchisor, Master Franchise, and Franchise logins
      const existingCreds = await db
        .select()
        .from(persona_credentials)
        .where(eq(persona_credentials.email, email.toLowerCase()));

      if (existingCreds.length > 0) {
        const existingType = existingCreds[0].persona_type;
        return { 
          success: false, 
          error: "email_already_registered",
          // Include which persona type already uses this email
          errorDetails: `This email is already registered for ${existingType}. Each login type must use a unique email.`
        };
      }

      const passwordHash = await this.hashPassword(password);
      const activationToken = this.generateToken();
      const tokenExpires = new Date(Date.now() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      const [newCredentials] = await db
        .insert(persona_credentials)
        .values({
          email: email.toLowerCase(),
          password_hash: passwordHash,
          persona_type: personaType,
          user_id: options?.userId,
          franchise_id: options?.franchiseId,
          is_active: options?.isActive ?? false,
          activation_token: options?.isActive ? null : activationToken,
          activation_token_expires: options?.isActive ? null : tokenExpires,
        })
        .returning();

      return {
        success: true,
        credentialsId: newCredentials.id,
        activationToken: options?.isActive ? undefined : activationToken,
      };
    } catch (error) {
      console.error("Create credentials error:", error);
      return { success: false, error: "internal_error" };
    }
  }

  async activateAccount(token: string, password: string): Promise<RegisterResult> {
    try {
      const [credentials] = await db
        .select()
        .from(persona_credentials)
        .where(eq(persona_credentials.activation_token, token));

      if (!credentials) {
        return { success: false, error: "invalid_token" };
      }

      if (
        credentials.activation_token_expires &&
        new Date(credentials.activation_token_expires) < new Date()
      ) {
        return { success: false, error: "token_expired" };
      }

      const passwordHash = await this.hashPassword(password);

      await db
        .update(persona_credentials)
        .set({
          password_hash: passwordHash,
          is_active: true,
          is_verified: true,
          activation_token: null,
          activation_token_expires: null,
          activated_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(persona_credentials.id, credentials.id));

      return { success: true, credentialsId: credentials.id };
    } catch (error) {
      console.error("Activate account error:", error);
      return { success: false, error: "internal_error" };
    }
  }

  async createLead(data: {
    planId?: string;
    name: string;
    tradeName?: string;
    documentType: "cpf" | "cnpj";
    documentNumber: string;
    secondaryDocument?: string;
    birthDate?: Date;
    addressStreet?: string;
    addressNumber?: string;
    addressComplement?: string;
    addressReference?: string;
    addressNeighborhood?: string;
    addressZip?: string;
    addressCity?: string;
    addressCountry?: string;
    phone?: string;
    whatsapp?: string;
    email: string;
    documentsUrls?: object[];
    source?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ success: boolean; error?: string; leadId?: string; franchiseCode?: string }> {
    try {
      // Check for duplicate email
      const existingEmail = await db
        .select()
        .from(franchise_leads)
        .where(eq(franchise_leads.email, data.email.toLowerCase()));

      if (existingEmail.length > 0) {
        return { success: false, error: "email_already_registered" };
      }

      // Normalize document number (remove all non-digit characters)
      const normalizedDocument = data.documentNumber.replace(/\D/g, '');

      // Check for duplicate document number (CPF/CNPJ) - normalized
      const existingDocument = await db
        .select()
        .from(franchise_leads)
        .where(eq(franchise_leads.document_number, normalizedDocument));

      if (existingDocument.length > 0) {
        return { success: false, error: "document_already_registered" };
      }

      const franchiseCode = this.generateFranchiseCode();

      const [newLead] = await db
        .insert(franchise_leads)
        .values({
          franchise_code: franchiseCode,
          plan_id: data.planId,
          name: data.name,
          trade_name: data.tradeName,
          document_type: data.documentType,
          document_number: normalizedDocument,
          secondary_document: data.secondaryDocument,
          birth_date: data.birthDate,
          address_street: data.addressStreet,
          address_number: data.addressNumber,
          address_complement: data.addressComplement,
          address_reference: data.addressReference,
          address_neighborhood: data.addressNeighborhood,
          address_zip: data.addressZip,
          address_city: data.addressCity,
          address_country: data.addressCountry || "BRA",
          phone: data.phone,
          whatsapp: data.whatsapp,
          email: data.email.toLowerCase(),
          documents_urls: data.documentsUrls,
          source: data.source || "landing_page",
          ip_address: data.ipAddress,
          user_agent: data.userAgent,
          status: "pending",
        })
        .returning();

      return {
        success: true,
        leadId: newLead.id,
        franchiseCode,
      };
    } catch (error) {
      console.error("Create lead error:", error);
      return { success: false, error: "internal_error" };
    }
  }

  async getLeads(status?: string): Promise<typeof franchise_leads.$inferSelect[]> {
    if (status) {
      return db.select().from(franchise_leads).where(eq(franchise_leads.status, status));
    }
    return db.select().from(franchise_leads);
  }

  async getLeadById(id: string): Promise<typeof franchise_leads.$inferSelect | null> {
    const [lead] = await db.select().from(franchise_leads).where(eq(franchise_leads.id, id));
    return lead || null;
  }

  async approveLead(
    leadId: string,
    reviewerId: string
  ): Promise<{
    success: boolean;
    error?: string;
    franchiseId?: string;
    activationToken?: string;
  }> {
    try {
      const lead = await this.getLeadById(leadId);
      if (!lead) {
        return { success: false, error: "lead_not_found" };
      }

      if (lead.status !== "pending") {
        return { success: false, error: "lead_already_processed" };
      }

      const insertResult = await db
        .insert(franchises)
        .values({
          name: lead.franchise_code,
          cnpj: lead.document_type === "cnpj" ? lead.document_number : null,
          tax_id: lead.document_number,
          tax_id_type: lead.document_type,
          address: [
            lead.address_street,
            lead.address_number,
            lead.address_complement,
            lead.address_neighborhood,
            lead.address_city,
            lead.address_zip,
          ]
            .filter(Boolean)
            .join(", "),
          country: lead.address_country || "BRA",
          plan_id: lead.plan_id || "default",
          contract_start: new Date(),
          status: "active",
          onboarding_status: "pending_approval",
        })
        .returning() as (typeof franchises.$inferSelect)[];
      
      const newFranchise = insertResult[0];

      const tempPassword = this.generateToken().substring(0, 12);
      const activationToken = this.generateToken();

      const credResult = await this.createCredentials(lead.email, tempPassword, "franchise", {
        franchiseId: newFranchise.id,
        isActive: false,
      });

      if (!credResult.success) {
        return { success: false, error: credResult.error };
      }

      await db
        .update(franchise_leads)
        .set({
          status: "approved",
          reviewed_by: reviewerId,
          reviewed_at: new Date(),
          approved_franchise_id: newFranchise.id,
          updated_at: new Date(),
        })
        .where(eq(franchise_leads.id, leadId));

      return {
        success: true,
        franchiseId: newFranchise.id,
        activationToken: credResult.activationToken,
      };
    } catch (error) {
      console.error("Approve lead error:", error);
      return { success: false, error: "internal_error" };
    }
  }

  async rejectLead(
    leadId: string,
    reviewerId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const lead = await this.getLeadById(leadId);
      if (!lead) {
        return { success: false, error: "lead_not_found" };
      }

      if (lead.status !== "pending") {
        return { success: false, error: "lead_already_processed" };
      }

      await db
        .update(franchise_leads)
        .set({
          status: "rejected",
          reviewed_by: reviewerId,
          reviewed_at: new Date(),
          rejection_reason: reason,
          updated_at: new Date(),
        })
        .where(eq(franchise_leads.id, leadId));

      return { success: true };
    } catch (error) {
      console.error("Reject lead error:", error);
      return { success: false, error: "internal_error" };
    }
  }

  async getCredentialsByEmail(
    email: string,
    personaType: PersonaType
  ): Promise<typeof persona_credentials.$inferSelect | null> {
    const [credentials] = await db
      .select()
      .from(persona_credentials)
      .where(
        and(
          eq(persona_credentials.email, email.toLowerCase()),
          eq(persona_credentials.persona_type, personaType)
        )
      );
    return credentials || null;
  }

  async requestPasswordReset(
    email: string,
    personaType: PersonaType
  ): Promise<{ success: boolean; resetToken?: string }> {
    try {
      const credentials = await this.getCredentialsByEmail(email, personaType);
      if (!credentials) {
        return { success: true };
      }

      const resetToken = this.generateToken();
      const tokenExpires = new Date(Date.now() + 2 * 60 * 60 * 1000);

      await db
        .update(persona_credentials)
        .set({
          reset_token: resetToken,
          reset_token_expires: tokenExpires,
          updated_at: new Date(),
        })
        .where(eq(persona_credentials.id, credentials.id));

      return { success: true, resetToken };
    } catch (error) {
      console.error("Password reset request error:", error);
      return { success: false };
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const [credentials] = await db
        .select()
        .from(persona_credentials)
        .where(eq(persona_credentials.reset_token, token));

      if (!credentials) {
        return { success: false, error: "invalid_token" };
      }

      if (credentials.reset_token_expires && new Date(credentials.reset_token_expires) < new Date()) {
        return { success: false, error: "token_expired" };
      }

      const passwordHash = await this.hashPassword(newPassword);

      await db
        .update(persona_credentials)
        .set({
          password_hash: passwordHash,
          reset_token: null,
          reset_token_expires: null,
          updated_at: new Date(),
        })
        .where(eq(persona_credentials.id, credentials.id));

      return { success: true };
    } catch (error) {
      console.error("Reset password error:", error);
      return { success: false, error: "internal_error" };
    }
  }

  async getAvailablePlans(): Promise<typeof franchise_plans.$inferSelect[]> {
    return db.select().from(franchise_plans).where(eq(franchise_plans.is_active, true));
  }

  // Create initial Franchisor admin (seed or first setup)
  async createFranchisor(
    email: string,
    password: string,
    name: string
  ): Promise<{
    success: boolean;
    error?: string;
    credentialsId?: string;
  }> {
    try {
      // Check if any franchisor already exists
      const existingFranchisor = await db
        .select()
        .from(persona_credentials)
        .where(eq(persona_credentials.persona_type, "franchisor"))
        .limit(1);

      if (existingFranchisor.length > 0) {
        return { success: false, error: "franchisor_already_exists" };
      }

      const result = await this.createCredentials(email, password, "franchisor", {
        isActive: true,
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, credentialsId: result.credentialsId };
    } catch (error) {
      console.error("Create franchisor error:", error);
      return { success: false, error: "internal_error" };
    }
  }

  // Check if Franchisor exists
  async franchisorExists(): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(persona_credentials)
      .where(eq(persona_credentials.persona_type, "franchisor"))
      .limit(1);
    return !!existing;
  }

  // Create Master Franchise lead (similar to franchise lead but for masters)
  async createMasterLead(data: {
    name: string;
    email: string;
    phone?: string;
    territory: string;
    documentType: string;
    documentNumber: string;
    addressCity?: string;
    addressCountry?: string;
    notes?: string;
    source?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    masterCode?: string;
  }> {
    try {
      const existingEmail = await db
        .select()
        .from(franchise_leads)
        .where(eq(franchise_leads.email, data.email.toLowerCase()))
        .limit(1);

      if (existingEmail.length > 0) {
        return { success: false, error: "email_already_registered" };
      }

      const masterCode = `DELFOS-M${this.generateFranchiseCode().slice(-7)}`;

      const insertResult = await db
        .insert(franchise_leads)
        .values({
          franchise_code: masterCode,
          name: data.name,
          document_type: data.documentType,
          document_number: data.documentNumber,
          email: data.email.toLowerCase(),
          phone: data.phone,
          address_city: data.addressCity,
          address_country: data.addressCountry,
          notes: data.notes || `Territory: ${data.territory}`,
          source: data.source || "master_application",
          status: "pending",
        })
        .returning() as (typeof franchise_leads.$inferSelect)[];

      return {
        success: true,
        masterCode: insertResult[0].franchise_code,
      };
    } catch (error) {
      console.error("Create master lead error:", error);
      return { success: false, error: "internal_error" };
    }
  }

  // Approve Master Lead and create Master Franchise credentials
  async approveMasterLead(
    leadId: string,
    reviewerId: string,
    territory: string
  ): Promise<{
    success: boolean;
    error?: string;
    franchiseId?: string;
    activationToken?: string;
  }> {
    try {
      const lead = await this.getLeadById(leadId);
      if (!lead) {
        return { success: false, error: "lead_not_found" };
      }

      if (lead.status !== "pending") {
        return { success: false, error: "lead_already_processed" };
      }

      // Create franchise with is_master_franchise flag
      const insertResult = await db
        .insert(franchises)
        .values({
          name: lead.franchise_code,
          cnpj: lead.document_type === "cnpj" ? lead.document_number : null,
          tax_id: lead.document_number,
          tax_id_type: lead.document_type,
          address: lead.address_city || "",
          country: lead.address_country || "BRA",
          plan_id: lead.plan_id || "default",
          contract_start: new Date(),
          status: "active",
          onboarding_status: "pending_approval",
          is_master_franchise: true,
        })
        .returning() as (typeof franchises.$inferSelect)[];

      const newFranchise = insertResult[0];

      const tempPassword = this.generateToken().substring(0, 12);
      const activationToken = this.generateToken();

      // Create master_franchise credentials
      const credResult = await this.createCredentials(lead.email, tempPassword, "master_franchise", {
        franchiseId: newFranchise.id,
        isActive: false,
      });

      if (!credResult.success) {
        return { success: false, error: credResult.error };
      }

      // Update lead status
      await db
        .update(franchise_leads)
        .set({
          status: "approved",
          reviewed_by: reviewerId,
          reviewed_at: new Date(),
          approved_franchise_id: newFranchise.id,
          activation_token: activationToken,
          activation_token_expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          updated_at: new Date(),
        })
        .where(eq(franchise_leads.id, leadId));

      // Store activation token in credentials
      await db
        .update(persona_credentials)
        .set({
          activation_token: activationToken,
          activation_token_expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .where(eq(persona_credentials.id, credResult.credentialsId!));

      return {
        success: true,
        franchiseId: newFranchise.id,
        activationToken,
      };
    } catch (error) {
      console.error("Approve master lead error:", error);
      return { success: false, error: "internal_error" };
    }
  }

  // Get all Master Franchise leads
  async getMasterLeads(status?: string): Promise<typeof franchise_leads.$inferSelect[]> {
    const leads = await db
      .select()
      .from(franchise_leads)
      .where(
        status
          ? and(
              eq(franchise_leads.status, status),
              eq(franchise_leads.source, "master_application")
            )
          : eq(franchise_leads.source, "master_application")
      );
    return leads;
  }

  // Get credentials by persona type
  async getCredentialsByPersona(personaType: PersonaType): Promise<typeof persona_credentials.$inferSelect[]> {
    return db
      .select()
      .from(persona_credentials)
      .where(eq(persona_credentials.persona_type, personaType));
  }
}

export const personaAuthService = new PersonaAuthService();
