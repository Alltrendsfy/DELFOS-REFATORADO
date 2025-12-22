import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and } from "drizzle-orm";

export type GlobalRole = 'franchisor' | 'franchise_owner' | 'franchisee' | 'user';
export type FranchiseRole = 'master' | 'operator' | 'analyst' | 'finance';

export interface UserPermissions {
  globalRole: GlobalRole;
  isFranchisor: boolean;
  isFranchiseOwner: boolean;
  isMasterFranchise: boolean;
  hasFranchise: boolean;
  franchiseId: string | null;
  franchiseRole: FranchiseRole | null;
  permissions: {
    canViewAllFranchises: boolean;
    canManageFranchises: boolean;
    canViewFranchiseReports: boolean;
    canManageUsers: boolean;
    canCreateCampaigns: boolean;
    canViewCampaigns: boolean;
    canDeleteCampaigns: boolean;
    canViewRoyalties: boolean;
    canManageRoyalties: boolean;
    canRunAudit: boolean;
    canActivateRBM: boolean;
    canViewRBM: boolean;
    canSetRBMLimits: boolean;
  };
}

const DEFAULT_PERMISSIONS: UserPermissions['permissions'] = {
  canViewAllFranchises: false,
  canManageFranchises: false,
  canViewFranchiseReports: false,
  canManageUsers: false,
  canCreateCampaigns: true,
  canViewCampaigns: true,
  canDeleteCampaigns: false,
  canViewRoyalties: false,
  canManageRoyalties: false,
  canRunAudit: false,
  canActivateRBM: false,
  canViewRBM: true,
  canSetRBMLimits: false,
};

export class FranchisePermissionService {
  async getUserPermissions(userId: string, userEmail?: string): Promise<UserPermissions> {
    // First try to find user by ID
    let user = await db.select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    
    // If not found by ID but email provided, try to find by email
    // This handles case where Replit Auth ID doesn't match stored user ID
    if (user.length === 0 && userEmail) {
      console.log(`[FranchisePermission] User not found by ID ${userId}, trying email ${userEmail}`);
      user = await db.select()
        .from(schema.users)
        .where(eq(schema.users.email, userEmail.toLowerCase()))
        .limit(1);
      
      if (user.length > 0) {
        console.log(`[FranchisePermission] Found user by email: ${userEmail}, DB ID: ${user[0].id}, is_admin: ${user[0].is_admin}`);
      }
    }

    if (user.length === 0) {
      console.log(`[FranchisePermission] User not found by ID ${userId} or email ${userEmail}`);
      return {
        globalRole: 'user',
        isFranchisor: false,
        isFranchiseOwner: false,
        isMasterFranchise: false,
        hasFranchise: false,
        franchiseId: null,
        franchiseRole: null,
        permissions: DEFAULT_PERMISSIONS,
      };
    }

    const globalRole = (user[0].global_role || 'user') as GlobalRole;
    const isAdmin = user[0].is_admin;

    if (globalRole === 'franchisor' || isAdmin) {
      return {
        globalRole: 'franchisor',
        isFranchisor: true,
        isFranchiseOwner: false,
        isMasterFranchise: false,
        hasFranchise: false,
        franchiseId: null,
        franchiseRole: null,
        permissions: {
          canViewAllFranchises: true,
          canManageFranchises: true,
          canViewFranchiseReports: true,
          canManageUsers: true,
          canCreateCampaigns: true,
          canViewCampaigns: true,
          canDeleteCampaigns: false,
          canViewRoyalties: true,
          canManageRoyalties: true,
          canRunAudit: true,
          canActivateRBM: false,
          canViewRBM: true,
          canSetRBMLimits: true,
        },
      };
    }

    const franchiseUser = await db.select()
      .from(schema.franchise_users)
      .where(and(
        eq(schema.franchise_users.user_id, userId),
        eq(schema.franchise_users.is_active, true)
      ))
      .limit(1);

    if (franchiseUser.length === 0) {
      return {
        globalRole,
        isFranchisor: false,
        isFranchiseOwner: false,
        isMasterFranchise: false,
        hasFranchise: false,
        franchiseId: null,
        franchiseRole: null,
        permissions: DEFAULT_PERMISSIONS,
      };
    }

    const franchise = await db.select()
      .from(schema.franchises)
      .where(eq(schema.franchises.id, franchiseUser[0].franchise_id))
      .limit(1);

    const isOwner = franchise.length > 0 && franchise[0].owner_user_id === userId;
    const role = franchiseUser[0].role as FranchiseRole;
    const isMasterFranchise = franchise.length > 0 && franchise[0].is_master_franchise === true;

    return {
      globalRole,
      isFranchisor: false,
      isFranchiseOwner: isOwner,
      isMasterFranchise,
      hasFranchise: true,
      franchiseId: franchiseUser[0].franchise_id,
      franchiseRole: role,
      permissions: this.getPermissionsForRole(role, isOwner),
    };
  }

  private getPermissionsForRole(role: FranchiseRole, isOwner: boolean): UserPermissions['permissions'] {
    if (isOwner || role === 'master') {
      return {
        canViewAllFranchises: false,
        canManageFranchises: false,
        canViewFranchiseReports: true,
        canManageUsers: true,
        canCreateCampaigns: true,
        canViewCampaigns: true,
        canDeleteCampaigns: false,
        canViewRoyalties: true,
        canManageRoyalties: false,
        canRunAudit: false,
        canActivateRBM: true,
        canViewRBM: true,
        canSetRBMLimits: false,
      };
    }

    switch (role) {
      case 'operator':
        return {
          canViewAllFranchises: false,
          canManageFranchises: false,
          canViewFranchiseReports: true,
          canManageUsers: false,
          canCreateCampaigns: true,
          canViewCampaigns: true,
          canDeleteCampaigns: false,
          canViewRoyalties: false,
          canManageRoyalties: false,
          canRunAudit: false,
          canActivateRBM: true,
          canViewRBM: true,
          canSetRBMLimits: false,
        };
      case 'analyst':
        return {
          canViewAllFranchises: false,
          canManageFranchises: false,
          canViewFranchiseReports: true,
          canManageUsers: false,
          canCreateCampaigns: false,
          canViewCampaigns: true,
          canDeleteCampaigns: false,
          canViewRoyalties: true,
          canManageRoyalties: false,
          canRunAudit: false,
          canActivateRBM: false,
          canViewRBM: true,
          canSetRBMLimits: false,
        };
      case 'finance':
        return {
          canViewAllFranchises: false,
          canManageFranchises: false,
          canViewFranchiseReports: true,
          canManageUsers: false,
          canCreateCampaigns: false,
          canViewCampaigns: true,
          canDeleteCampaigns: false,
          canViewRoyalties: true,
          canManageRoyalties: false,
          canRunAudit: false,
          canActivateRBM: false,
          canViewRBM: true,
          canSetRBMLimits: false,
        };
      default:
        return DEFAULT_PERMISSIONS;
    }
  }

  async canAccessFranchise(userId: string, franchiseId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    
    if (permissions.isFranchisor) return true;
    if (permissions.franchiseId === franchiseId) return true;
    
    return false;
  }

  async canAccessCampaign(userId: string, campaignId: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    
    if (permissions.isFranchisor) return true;

    const campaign = await db.select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);

    if (campaign.length === 0) return false;

    const portfolio = await db.select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.id, campaign[0].portfolio_id))
      .limit(1);

    if (portfolio.length === 0) return false;

    if (portfolio[0].user_id === userId) return true;

    if (campaign[0].franchise_id && permissions.franchiseId === campaign[0].franchise_id) {
      return true;
    }

    return false;
  }

  async getUserFranchise(userId: string, userEmail?: string): Promise<typeof schema.franchises.$inferSelect | null> {
    // First try with userId
    let franchiseUser = await db.select()
      .from(schema.franchise_users)
      .where(and(
        eq(schema.franchise_users.user_id, userId),
        eq(schema.franchise_users.is_active, true)
      ))
      .limit(1);

    // If not found and email provided, try to find user by email first
    if (franchiseUser.length === 0 && userEmail) {
      const userByEmail = await db.select()
        .from(schema.users)
        .where(eq(schema.users.email, userEmail.toLowerCase()))
        .limit(1);
      
      if (userByEmail.length > 0) {
        franchiseUser = await db.select()
          .from(schema.franchise_users)
          .where(and(
            eq(schema.franchise_users.user_id, userByEmail[0].id),
            eq(schema.franchise_users.is_active, true)
          ))
          .limit(1);
      }
    }

    if (franchiseUser.length === 0) return null;

    const franchise = await db.select()
      .from(schema.franchises)
      .where(eq(schema.franchises.id, franchiseUser[0].franchise_id))
      .limit(1);

    return franchise[0] || null;
  }
}

export const franchisePermissionService = new FranchisePermissionService();
