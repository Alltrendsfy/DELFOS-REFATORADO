import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { rbmService, RBM_MIN_SYSTEM, RBM_MAX_SYSTEM, RBM_DEFAULT } from "../services/trading/rbmService";
import { z } from "zod";
import { db } from "../db";
import { campaigns, rbm_events } from "@shared/schema";
import { eq, desc, gte, and } from "drizzle-orm";
import { franchisePermissionService } from "../services/franchisePermissionService";
import { rbmLearnerService } from "../services/ai/rbmLearnerService";

const requestRBMSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  multiplier: z.number().min(1).max(5, "Maximum RBM is 5.0x"),
});

const deactivateRBMSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  reason: z.string().optional(),
});

export function registerRBMRoutes(app: Express): void {
  app.get("/api/rbm/config", isAuthenticated, async (req, res) => {
    try {
      res.json({
        minMultiplier: RBM_MIN_SYSTEM,
        maxMultiplier: RBM_MAX_SYSTEM,
        defaultMultiplier: RBM_DEFAULT,
        steps: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0],
        qualityGateChecks: [
          'Track record (min 5 closed positions)',
          'VRE regime (HIGH or EXTREME)',
          'Drawdown limit (< 30%)',
          'Circuit breakers (not tripped)',
          'Data freshness (< 60s)',
          'Investor profile compatibility'
        ],
      });
    } catch (error) {
      console.error("[RBM Routes] Error getting config:", error);
      res.status(500).json({ error: "Failed to get RBM config" });
    }
  });

  app.get("/api/rbm/permissions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const permissions = await franchisePermissionService.getUserPermissions(userId);
      
      res.json({
        canActivateRBM: permissions.permissions.canActivateRBM,
        canViewRBM: permissions.permissions.canViewRBM,
        canSetRBMLimits: permissions.permissions.canSetRBMLimits,
        isFranchisor: permissions.isFranchisor,
        hasFranchise: permissions.hasFranchise,
      });
    } catch (error) {
      console.error("[RBM Routes] Error getting permissions:", error);
      res.status(500).json({ error: "Failed to get RBM permissions" });
    }
  });

  app.get("/api/rbm/campaign/:campaignId/status", isAuthenticated, async (req, res) => {
    try {
      const { campaignId } = req.params;
      
      const campaign = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          rbm_requested: campaigns.rbm_requested,
          rbm_approved: campaigns.rbm_approved,
          rbm_status: campaigns.rbm_status,
          rbm_approved_at: campaigns.rbm_approved_at,
          rbm_reduced_at: campaigns.rbm_reduced_at,
          rbm_reduced_reason: campaigns.rbm_reduced_reason,
          investor_profile: campaigns.investor_profile,
        })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (campaign.length === 0) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const recentEvents = await db
        .select()
        .from(rbm_events)
        .where(eq(rbm_events.campaign_id, campaignId))
        .orderBy(desc(rbm_events.created_at))
        .limit(10);

      res.json({
        campaign: campaign[0],
        currentMultiplier: parseFloat(campaign[0].rbm_approved || "1.0"),
        status: campaign[0].rbm_status || "DEFAULT",
        recentEvents,
      });
    } catch (error) {
      console.error("[RBM Routes] Error getting status:", error);
      res.status(500).json({ error: "Failed to get RBM status" });
    }
  });

  app.get("/api/rbm/campaign/:campaignId/events", isAuthenticated, async (req, res) => {
    try {
      const { campaignId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const events = await db
        .select()
        .from(rbm_events)
        .where(eq(rbm_events.campaign_id, campaignId))
        .orderBy(desc(rbm_events.created_at))
        .limit(limit);

      res.json({ events });
    } catch (error) {
      console.error("[RBM Routes] Error getting events:", error);
      res.status(500).json({ error: "Failed to get RBM events" });
    }
  });

  app.post("/api/rbm/request", isAuthenticated, async (req, res) => {
    try {
      const body = requestRBMSchema.parse(req.body);
      const { campaignId, multiplier } = body;
      const userId = (req.user as any)?.id;

      const result = await rbmService.requestRBM(campaignId, multiplier, userId);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          approved: result.approved,
          error: result.reason,
          qualityGateSnapshot: result.qualityGateSnapshot,
        });
      }

      res.json({
        success: true,
        approved: result.approved,
        multiplier: result.approvedMultiplier,
        reason: result.reason,
        qualityGateSnapshot: result.qualityGateSnapshot,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("[RBM Routes] Error requesting RBM:", error);
      res.status(500).json({ error: "Failed to request RBM" });
    }
  });

  app.post("/api/rbm/deactivate", isAuthenticated, async (req, res) => {
    try {
      const body = deactivateRBMSchema.parse(req.body);
      const { campaignId, reason } = body;
      const userId = (req.user as any)?.id;

      const result = await rbmService.deactivateRBM(campaignId, userId || 'unknown');
      
      res.json({
        success: result.success,
        reason: result.reason,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("[RBM Routes] Error deactivating RBM:", error);
      res.status(500).json({ error: "Failed to deactivate RBM" });
    }
  });

  app.get("/api/rbm/all-events", isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      
      const events = await db
        .select()
        .from(rbm_events)
        .orderBy(desc(rbm_events.created_at))
        .limit(limit);

      res.json({ events });
    } catch (error) {
      console.error("[RBM Routes] Error getting all events:", error);
      res.status(500).json({ error: "Failed to get RBM events" });
    }
  });

  app.get("/api/rbm/aggregate-metrics", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const permissions = await franchisePermissionService.getUserPermissions(userId);
      
      if (!permissions.isFranchisor && !permissions.permissions.canSetRBMLimits) {
        return res.status(403).json({ error: "Access denied - franchisor only" });
      }

      const allCampaigns = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          status: campaigns.status,
          rbm_requested: campaigns.rbm_requested,
          rbm_approved: campaigns.rbm_approved,
          rbm_status: campaigns.rbm_status,
          rbm_approved_at: campaigns.rbm_approved_at,
          rbm_reduced_at: campaigns.rbm_reduced_at,
          rbm_reduced_reason: campaigns.rbm_reduced_reason,
          investor_profile: campaigns.investor_profile,
        })
        .from(campaigns)
        .where(eq(campaigns.status, 'ACTIVE'));

      const rbmActive = allCampaigns.filter(c => 
        c.rbm_status === 'ACTIVE' && parseFloat(c.rbm_approved || '1.0') > 1.0
      );
      
      const rbmReduced = allCampaigns.filter(c => c.rbm_status === 'REDUCED');
      const rbmPending = allCampaigns.filter(c => c.rbm_status === 'PENDING');

      const totalMultiplier = rbmActive.reduce((sum, c) => 
        sum + parseFloat(c.rbm_approved || '1.0'), 0
      );
      const avgMultiplier = rbmActive.length > 0 ? totalMultiplier / rbmActive.length : 1.0;

      const recentEvents = await db
        .select()
        .from(rbm_events)
        .orderBy(desc(rbm_events.created_at))
        .limit(50);

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const events24h = await db
        .select()
        .from(rbm_events)
        .where(gte(rbm_events.created_at, twentyFourHoursAgo))
        .orderBy(desc(rbm_events.created_at));

      const rollbackEvents = events24h.filter(e => 
        e.event_type === 'REDUCE' || e.event_type === 'DENY'
      );

      const approvalEvents = events24h.filter(e => e.event_type === 'APPROVE');

      const multiplierDistribution = {
        '1.0x': allCampaigns.filter(c => parseFloat(c.rbm_approved || '1.0') <= 1.0).length,
        '1.5x': allCampaigns.filter(c => parseFloat(c.rbm_approved || '1.0') === 1.5).length,
        '2.0x': allCampaigns.filter(c => parseFloat(c.rbm_approved || '1.0') === 2.0).length,
        '2.5x': allCampaigns.filter(c => parseFloat(c.rbm_approved || '1.0') === 2.5).length,
        '3.0x': allCampaigns.filter(c => parseFloat(c.rbm_approved || '1.0') === 3.0).length,
        '3.5x+': allCampaigns.filter(c => parseFloat(c.rbm_approved || '1.0') >= 3.5).length,
      };

      res.json({
        summary: {
          totalActiveCampaigns: allCampaigns.length,
          rbmActiveCampaigns: rbmActive.length,
          rbmReducedCampaigns: rbmReduced.length,
          rbmPendingCampaigns: rbmPending.length,
          averageMultiplier: avgMultiplier,
        },
        multiplierDistribution,
        activeCampaignsWithRBM: rbmActive.map(c => ({
          id: c.id,
          name: c.name,
          multiplier: parseFloat(c.rbm_approved || '1.0'),
          status: c.rbm_status,
          approvedAt: c.rbm_approved_at,
          investorProfile: c.investor_profile,
        })),
        recentEvents: recentEvents.slice(0, 10).map(e => ({
          id: e.id,
          campaign_id: e.campaign_id,
          event_type: e.event_type,
          previous_value: e.previous_value,
          new_value: e.new_value,
          reason: e.reason,
          created_at: e.created_at,
        })),
        rollbackCount24h: rollbackEvents.length,
        approvalCount24h: approvalEvents.length,
      });
    } catch (error) {
      console.error("[RBM Routes] Error getting aggregate metrics:", error);
      res.status(500).json({ error: "Failed to get RBM aggregate metrics" });
    }
  });

  app.post("/api/rbm/analyze", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const permissions = await franchisePermissionService.getUserPermissions(userId);
      if (!permissions.isFranchisor) {
        return res.status(403).json({ error: "Only franchisor can run RBM analysis" });
      }

      const { scope, portfolioId, campaignId, windowDays } = req.body;
      
      const result = await rbmLearnerService.runRBMAnalysis({
        scope: scope || 'global',
        portfolioId,
        campaignId,
        userId,
        windowDays: windowDays || 30,
      });

      res.json(result);
    } catch (error) {
      console.error("[RBM Routes] Error running RBM analysis:", error);
      res.status(500).json({ error: "Failed to run RBM analysis" });
    }
  });

  app.get("/api/rbm/campaign/:campaignId/recommendations", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const permissions = await franchisePermissionService.getUserPermissions(userId);
      if (!permissions.isFranchisor && !permissions.permissions.canViewRBM) {
        return res.status(403).json({ error: "Insufficient permissions to view RBM recommendations" });
      }

      const { campaignId } = req.params;
      
      const recommendations = await rbmLearnerService.getRBMRecommendations(campaignId);
      
      res.json(recommendations);
    } catch (error) {
      console.error("[RBM Routes] Error getting RBM recommendations:", error);
      res.status(500).json({ error: "Failed to get RBM recommendations" });
    }
  });

  console.log("[RBM Routes] Registered RBM API endpoints");
}
