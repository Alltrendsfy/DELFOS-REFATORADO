import { Router, Request, Response } from "express";
import { isAuthenticated } from "../../replitAuth";
import { db } from "../../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
    master_accounts,
    franchises,
    franchise_users,
    franchisor_users,
    contract_templates,
    contract_acceptances,
    franchise_leads
} from "@shared/schema";

export function registerFranchiseRoutes(router: Router) {

    // ========== FRANCHISE PLANS API ==========

    // GET /api/franchise-plans - List all plans with versions
    router.get('/api/franchise-plans', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePlanService } = await import('../../services/franchisePlanService');
            const plans = await franchisePlanService.getPlansWithVersions();
            res.json(plans);
        } catch (error) {
            console.error("Error fetching franchise plans:", error);
            res.status(500).json({ message: "Failed to fetch franchise plans" });
        }
    });

    // GET /api/franchise-plans/:id - Get single plan with versions
    router.get('/api/franchise-plans/:id', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePlanService } = await import('../../services/franchisePlanService');
            const result = await franchisePlanService.getPlanWithActiveVersion(req.params.id);

            if (!result) {
                return res.status(404).json({ message: "Plan not found" });
            }

            const versions = await franchisePlanService.listVersions(req.params.id);
            res.json({ ...result, versions });
        } catch (error) {
            console.error("Error fetching franchise plan:", error);
            res.status(500).json({ message: "Failed to fetch franchise plan" });
        }
    });

    // POST /api/franchise-plans - Create new plan
    router.post('/api/franchise-plans', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { franchisePlanService } = await import('../../services/franchisePlanService');

            const { name, code, max_campaigns, max_capital_usd, royalty_percentage, features, is_active, display_order } = req.body;

            if (!name || !code) {
                return res.status(400).json({ message: "Name and code are required" });
            }

            const plan = await franchisePlanService.createPlan({
                name,
                code,
                max_campaigns,
                max_capital_usd,
                royalty_percentage,
                features,
                is_active,
                display_order,
            }, userId);

            res.status(201).json(plan);
        } catch (error) {
            console.error("Error creating franchise plan:", error);
            res.status(500).json({ message: "Failed to create franchise plan" });
        }
    });

    // PATCH /api/franchise-plans/:id - Update plan metadata (not version data)
    router.patch('/api/franchise-plans/:id', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { franchisePlanService } = await import('../../services/franchisePlanService');

            const updated = await franchisePlanService.updatePlan(req.params.id, req.body, userId);
            if (!updated) {
                return res.status(404).json({ message: "Plan not found" });
            }

            res.json(updated);
        } catch (error) {
            console.error("Error updating franchise plan:", error);
            res.status(500).json({ message: "Failed to update franchise plan" });
        }
    });

    // GET /api/franchise-plans/:id/versions - List all versions for a plan
    router.get('/api/franchise-plans/:id/versions', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePlanService } = await import('../../services/franchisePlanService');
            const versions = await franchisePlanService.listVersions(req.params.id);
            res.json(versions);
        } catch (error) {
            console.error("Error fetching plan versions:", error);
            res.status(500).json({ message: "Failed to fetch plan versions" });
        }
    });

    // POST /api/franchise-plans/:id/versions - Create new version for a plan
    router.post('/api/franchise-plans/:id/versions', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { franchisePlanService } = await import('../../services/franchisePlanService');

            const versionData = {
                plan_id: req.params.id,
                ...req.body,
            };

            const version = await franchisePlanService.createVersion(versionData, userId);
            res.status(201).json(version);
        } catch (error) {
            console.error("Error creating plan version:", error);
            res.status(500).json({ message: "Failed to create plan version" });
        }
    });

    // GET /api/franchise-plans/:planId/versions/:versionId - Get specific version
    router.get('/api/franchise-plans/:planId/versions/:versionId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePlanService } = await import('../../services/franchisePlanService');
            const version = await franchisePlanService.getVersionById(req.params.versionId);

            if (!version || version.plan_id !== req.params.planId) {
                return res.status(404).json({ message: "Version not found" });
            }

            res.json(version);
        } catch (error) {
            console.error("Error fetching plan version:", error);
            res.status(500).json({ message: "Failed to fetch plan version" });
        }
    });

    // POST /api/franchise-plans/:planId/versions/:versionId/activate - Activate a version
    router.post('/api/franchise-plans/:planId/versions/:versionId/activate', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { franchisePlanService } = await import('../../services/franchisePlanService');

            const activated = await franchisePlanService.activateVersion(req.params.versionId, userId);
            if (!activated) {
                return res.status(404).json({ message: "Version not found" });
            }

            res.json(activated);
        } catch (error) {
            console.error("Error activating plan version:", error);
            res.status(500).json({ message: "Failed to activate plan version" });
        }
    });

    // POST /api/franchise-plans/:planId/versions/:versionId/archive - Archive a version
    router.post('/api/franchise-plans/:planId/versions/:versionId/archive', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { franchisePlanService } = await import('../../services/franchisePlanService');

            const archived = await franchisePlanService.archiveVersion(req.params.versionId, userId);
            if (!archived) {
                return res.status(404).json({ message: "Version not found" });
            }

            res.json(archived);
        } catch (error) {
            console.error("Error archiving plan version:", error);
            res.status(500).json({ message: "Failed to archive plan version" });
        }
    });

    // POST /api/franchise-plans/:planId/versions/:versionId/duplicate - Duplicate a version
    router.post('/api/franchise-plans/:planId/versions/:versionId/duplicate', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { franchisePlanService } = await import('../../services/franchisePlanService');

            const duplicated = await franchisePlanService.duplicateVersion(
                req.params.versionId,
                req.body.notes,
                userId
            );

            if (!duplicated) {
                return res.status(404).json({ message: "Version not found" });
            }

            res.status(201).json(duplicated);
        } catch (error) {
            console.error("Error duplicating plan version:", error);
            res.status(500).json({ message: "Failed to duplicate plan version" });
        }
    });

    // GET /api/franchise-plans/:id/audit-logs - Get audit logs for a plan
    router.get('/api/franchise-plans/:id/audit-logs', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePlanService } = await import('../../services/franchisePlanService');
            const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
            const logs = await franchisePlanService.listAuditLogs(req.params.id, limit);
            res.json(logs);
        } catch (error) {
            console.error("Error fetching plan audit logs:", error);
            res.status(500).json({ message: "Failed to fetch plan audit logs" });
        }
    });

    // GET /api/franchise-plans/defaults/:code - Get default version data for a plan type
    router.get('/api/franchise-plans/defaults/:code', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePlanService } = await import('../../services/franchisePlanService');
            const defaults = await franchisePlanService.getDefaultVersionData(req.params.code);
            res.json(defaults);
        } catch (error) {
            console.error("Error fetching plan defaults:", error);
            res.status(500).json({ message: "Failed to fetch plan defaults" });
        }
    });

    // ========== MASTER FRANCHISE TERRITORY ROUTES ==========

    // GET /api/territories - List all territories
    router.get('/api/territories', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { territoryService } = await import('../../services/franchise/territoryService');

            const filters: any = {};
            if (req.query.country) filters.countryCode = req.query.country;
            if (req.query.exclusivity) filters.exclusivityType = req.query.exclusivity;
            if (req.query.active !== undefined) filters.isActive = req.query.active === 'true';

            const territories = await territoryService.listTerritories(filters);
            res.json(territories);
        } catch (error) {
            console.error("Error fetching territories:", error);
            res.status(500).json({ message: "Failed to fetch territories" });
        }
    });

    // GET /api/territories/:id - Get single territory
    router.get('/api/territories/:id', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { territoryService } = await import('../../services/franchise/territoryService');
            const territory = await territoryService.getTerritoryById(req.params.id);

            if (!territory) {
                return res.status(404).json({ message: "Territory not found" });
            }

            res.json(territory);
        } catch (error) {
            console.error("Error fetching territory:", error);
            res.status(500).json({ message: "Failed to fetch territory" });
        }
    });

    // POST /api/territories - Create new territory
    router.post('/api/territories', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);

            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { territoryService } = await import('../../services/franchise/territoryService');
            const result = await territoryService.createTerritory(req.body, userId);

            if (!result.success) {
                return res.status(400).json({ message: result.error });
            }

            res.status(201).json(result.territory);
        } catch (error) {
            console.error("Error creating territory:", error);
            res.status(500).json({ message: "Failed to create territory" });
        }
    });

    // POST /api/territories/validate - Validate territory definition
    router.post('/api/territories/validate', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { territoryService } = await import('../../services/franchise/territoryService');
            const validation = territoryService.validateTerritoryDefinition(req.body);
            res.json(validation);
        } catch (error) {
            console.error("Error validating territory:", error);
            res.status(500).json({ message: "Failed to validate territory" });
        }
    });

    // POST /api/territories/check-overlap - Check for territory overlaps
    router.post('/api/territories/check-overlap', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { territoryService } = await import('../../services/franchise/territoryService');
            const { territory, excludeTerritoryId } = req.body;

            const overlapCheck = await territoryService.checkTerritoryOverlap(territory, excludeTerritoryId);
            res.json(overlapCheck);
        } catch (error) {
            console.error("Error checking territory overlap:", error);
            res.status(500).json({ message: "Failed to check territory overlap" });
        }
    });

    // POST /api/territories/validate-location - Validate if location is within master's territory
    router.post('/api/territories/validate-location', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { territoryService } = await import('../../services/franchise/territoryService');
            const { masterId, location } = req.body;

            if (!masterId || !location) {
                return res.status(400).json({ message: "masterId and location are required" });
            }

            const result = await territoryService.validateLocationInTerritory(masterId, location);
            res.json(result);
        } catch (error) {
            console.error("Error validating location:", error);
            res.status(500).json({ message: "Failed to validate location" });
        }
    });

    // POST /api/territories/:id/audit-snapshot - Create audit snapshot
    router.post('/api/territories/:id/audit-snapshot', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);

            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { territoryService } = await import('../../services/franchise/territoryService');
            const { masterId, reason, relatedFranchiseId, eventDescription } = req.body;

            if (!masterId || !reason) {
                return res.status(400).json({ message: "masterId and reason are required" });
            }

            const result = await territoryService.createAuditSnapshot(
                masterId,
                req.params.id,
                reason,
                relatedFranchiseId,
                eventDescription,
                userId
            );

            if (!result.success) {
                return res.status(400).json({ message: result.error });
            }

            res.status(201).json({ snapshotId: result.snapshotId });
        } catch (error) {
            console.error("Error creating audit snapshot:", error);
            res.status(500).json({ message: "Failed to create audit snapshot" });
        }
    });

    // GET /api/masters/:id/audit-chain - Verify audit chain integrity
    router.get('/api/masters/:id/audit-chain', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);

            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { territoryService } = await import('../../services/franchise/territoryService');
            const result = await territoryService.verifyAuditChain(req.params.id);
            res.json(result);
        } catch (error) {
            console.error("Error verifying audit chain:", error);
            res.status(500).json({ message: "Failed to verify audit chain" });
        }
    });

    // GET /api/territories/:id/hash - Calculate territory hash
    router.get('/api/territories/:id/hash', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { territoryService } = await import('../../services/franchise/territoryService');
            const territory = await territoryService.getTerritoryById(req.params.id);

            if (!territory) {
                return res.status(404).json({ message: "Territory not found" });
            }

            const hash = territoryService.calculateTerritoryHash({
                country_code: territory.country_code,
                states: territory.states || undefined,
                municipalities: territory.municipalities || undefined,
                micro_regions: territory.micro_regions || undefined,
                metro_regions: territory.metro_regions || undefined,
                urban_agglomerations: territory.urban_agglomerations || undefined,
                zip_code_ranges: territory.zip_code_ranges || undefined,
                zip_code_exclusions: territory.zip_code_exclusions || undefined,
                custom_economic_zone_id: territory.custom_economic_zone_id || undefined,
                excluded_states: territory.excluded_states || undefined,
                excluded_municipalities: territory.excluded_municipalities || undefined
            });

            res.json({
                territoryId: territory.id,
                storedHash: territory.territory_hash,
                calculatedHash: hash,
                isValid: territory.territory_hash === hash
            });
        } catch (error) {
            console.error("Error calculating territory hash:", error);
            res.status(500).json({ message: "Failed to calculate territory hash" });
        }
    });

    // ========== MASTER ACCOUNT MANAGEMENT ENDPOINTS ==========

    // GET /api/master-accounts/:id/dashboard - Get master franchise dashboard stats
    router.get('/api/master-accounts/:id/dashboard', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { masterAccountService } = await import('../../services/franchise/masterAccountService');
            const master = await masterAccountService.getMasterById(req.params.id);

            if (!master) {
                return res.status(404).json({ message: "Master account not found" });
            }

            // Check permission
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor && master.primary_user_id !== req.user.id) {
                return res.status(403).json({ message: "Access denied" });
            }

            const stats = await masterAccountService.getMasterDashboardStats(req.params.id);
            res.json(stats);
        } catch (error) {
            console.error("Error getting master dashboard:", error);
            res.status(500).json({ message: "Failed to get master dashboard" });
        }
    });

    // GET /api/master-accounts/:id/regional-links - Get regional franchise links
    router.get('/api/master-accounts/:id/regional-links', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { masterAccountService } = await import('../../services/franchise/masterAccountService');
            const master = await masterAccountService.getMasterById(req.params.id);

            if (!master) {
                return res.status(404).json({ message: "Master account not found" });
            }

            // Check permission
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor && master.primary_user_id !== req.user.id) {
                return res.status(403).json({ message: "Access denied" });
            }

            const links = await masterAccountService.getMasterRegionalLinks(req.params.id);
            res.json(links);
        } catch (error) {
            console.error("Error getting regional links:", error);
            res.status(500).json({ message: "Failed to get regional links" });
        }
    });

    // POST /api/master-accounts/:id/regional-links - Create regional franchise link
    router.post('/api/master-accounts/:id/regional-links', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { masterAccountService } = await import('../../services/franchise/masterAccountService');
            const master = await masterAccountService.getMasterById(req.params.id);

            if (!master) {
                return res.status(404).json({ message: "Master account not found" });
            }

            // Check permission
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor && master.primary_user_id !== req.user.id) {
                return res.status(403).json({ message: "Access denied" });
            }

            const result = await masterAccountService.createRegionalLink(req.params.id, req.body);

            if (!result.success) {
                return res.status(400).json({ message: result.error });
            }

            res.status(201).json({ linkId: result.linkId, message: "Regional link created successfully" });
        } catch (error) {
            console.error("Error creating regional link:", error);
            res.status(500).json({ message: "Failed to create regional link" });
        }
    });

    // GET /api/master-accounts/:id/performance-targets - Get performance targets
    router.get('/api/master-accounts/:id/performance-targets', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { masterAccountService } = await import('../../services/franchise/masterAccountService');
            const master = await masterAccountService.getMasterById(req.params.id);

            if (!master) {
                return res.status(404).json({ message: "Master account not found" });
            }

            // Check permission
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor && master.primary_user_id !== req.user.id) {
                return res.status(403).json({ message: "Access denied" });
            }

            const targets = await masterAccountService.getMasterPerformanceTargets(req.params.id);
            res.json(targets);
        } catch (error) {
            console.error("Error getting performance targets:", error);
            res.status(500).json({ message: "Failed to get performance targets" });
        }
    });

    // POST /api/master-accounts/:id/performance-targets - Create performance target
    router.post('/api/master-accounts/:id/performance-targets', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { masterAccountService } = await import('../../services/franchise/masterAccountService');
            const result = await masterAccountService.createPerformanceTarget(req.params.id, req.body);

            if (!result.success) {
                return res.status(400).json({ message: result.error });
            }

            res.status(201).json({ targetId: result.targetId, message: "Performance target created successfully" });
        } catch (error) {
            console.error("Error creating performance target:", error);
            res.status(500).json({ message: "Failed to create performance target" });
        }
    });

    // POST /api/performance-targets/:id/evaluate - Evaluate performance target
    router.post('/api/performance-targets/:id/evaluate', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { masterAccountService } = await import('../../services/franchise/masterAccountService');
            const result = await masterAccountService.evaluatePerformanceTarget(req.params.id, req.user.id);

            if ('error' in result) {
                return res.status(400).json({ message: result.error });
            }

            res.json(result);
        } catch (error) {
            console.error("Error evaluating performance target:", error);
            res.status(500).json({ message: "Failed to evaluate performance target" });
        }
    });

    // POST /api/revenue-splits/calculate - Calculate revenue split for a transaction
    router.post('/api/revenue-splits/calculate', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { masterId, franchiseeId, amount, splitType } = req.body;

            if (!masterId || !franchiseeId || !amount || !splitType) {
                return res.status(400).json({ message: "Missing required fields: masterId, franchiseeId, amount, splitType" });
            }

            const { masterAccountService } = await import('../../services/franchise/masterAccountService');
            const master = await masterAccountService.getMasterById(masterId);

            if (!master) {
                return res.status(404).json({ message: "Master account not found" });
            }

            let result;
            if (splitType === 'franchise_fee') {
                result = masterAccountService.calculateFranchiseFeeSplit(master, amount, franchiseeId);
            } else if (splitType === 'royalty') {
                result = masterAccountService.calculateRoyaltySplit(master, amount, franchiseeId);
            } else {
                return res.status(400).json({ message: "Invalid splitType - must be 'franchise_fee' or 'royalty'" });
            }

            res.json(result);
        } catch (error) {
            console.error("Error calculating revenue split:", error);
            res.status(500).json({ message: "Failed to calculate revenue split" });
        }
    });

    // GET /api/master-accounts/find-by-location - Find master for a location
    router.get('/api/master-accounts/find-by-location', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { state, municipality, zipCode, countryCode } = req.query;

            const { masterAccountService } = await import('../../services/franchise/masterAccountService');
            const master = await masterAccountService.findMasterForLocation({
                state: state as string,
                municipality: municipality as string,
                zipCode: zipCode as string,
                countryCode: countryCode as string,
            });

            if (!master) {
                return res.status(404).json({ message: "No master account covers this location" });
            }

            res.json({
                masterId: master.id,
                masterName: master.legal_entity_name,
                territoryId: master.territory_definition_id,
            });
        } catch (error) {
            console.error("Error finding master for location:", error);
            res.status(500).json({ message: "Failed to find master for location" });
        }
    });

    // ========== ANTIFRAUD ENDPOINTS ==========

    // GET /api/antifraud/dashboard - Get antifraud dashboard statistics
    router.get('/api/antifraud/dashboard', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { masterAntifraudService } = await import('../../services/franchise/masterAntifraudService');
            const dashboard = await masterAntifraudService.getAntifraudDashboard();
            res.json(dashboard);
        } catch (error) {
            console.error("Error getting antifraud dashboard:", error);
            res.status(500).json({ message: "Failed to get antifraud dashboard" });
        }
    });

    // GET /api/antifraud/events - List fraud events
    router.get('/api/antifraud/events', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { masterAntifraudService } = await import('../../services/franchise/masterAntifraudService');
            const { masterId, fraudType, status, severity, startDate, endDate, limit, offset } = req.query;

            const result = await masterAntifraudService.listFraudEvents({
                masterId: masterId as string,
                fraudType: fraudType as any,
                status: status as any,
                severity: severity as any,
                startDate: startDate ? new Date(startDate as string) : undefined,
                endDate: endDate ? new Date(endDate as string) : undefined,
                limit: limit ? parseInt(limit as string) : 50,
                offset: offset ? parseInt(offset as string) : 0
            });

            res.json(result);
        } catch (error) {
            console.error("Error listing fraud events:", error);
            res.status(500).json({ message: "Failed to list fraud events" });
        }
    });

    // GET /api/antifraud/events/:id - Get fraud event by ID
    router.get('/api/antifraud/events/:id', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { masterAntifraudService } = await import('../../services/franchise/masterAntifraudService');
            const event = await masterAntifraudService.getFraudEventById(req.params.id);

            if (!event) {
                return res.status(404).json({ message: "Fraud event not found" });
            }

            res.json(event);
        } catch (error) {
            console.error("Error getting fraud event:", error);
            res.status(500).json({ message: "Failed to get fraud event" });
        }
    });

    // POST /api/antifraud/events/:id/status - Update fraud event status
    router.post('/api/antifraud/events/:id/status', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { status, notes } = req.body;
            if (!status) {
                return res.status(400).json({ message: "Status is required" });
            }

            const { masterAntifraudService } = await import('../../services/franchise/masterAntifraudService');
            const result = await masterAntifraudService.updateFraudStatus(
                req.params.id,
                status,
                notes,
                req.user.id
            );

            if (!result.success) {
                return res.status(400).json({ message: result.error });
            }

            res.json({ success: true, message: "Status updated successfully" });
        } catch (error) {
            console.error("Error updating fraud status:", error);
            res.status(500).json({ message: "Failed to update fraud status" });
        }
    });

    // POST /api/antifraud/events/:id/action - Record action on fraud event
    router.post('/api/antifraud/events/:id/action', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { action, actionDetails } = req.body;
            if (!action || !actionDetails) {
                return res.status(400).json({ message: "Action and actionDetails are required" });
            }

            const { masterAntifraudService } = await import('../../services/franchise/masterAntifraudService');
            const result = await masterAntifraudService.recordAction({
                eventId: req.params.id,
                action,
                actionDetails,
                actionBy: req.user.id
            });

            if (!result.success) {
                return res.status(400).json({ message: result.error });
            }

            res.json({ success: true, message: "Action recorded successfully" });
        } catch (error) {
            console.error("Error recording fraud action:", error);
            res.status(500).json({ message: "Failed to record fraud action" });
        }
    });

    // GET /api/antifraud/masters/:id/summary - Get fraud summary for a master
    router.get('/api/antifraud/masters/:id/summary', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { masterAntifraudService } = await import('../../services/franchise/masterAntifraudService');
            const summary = await masterAntifraudService.getMasterFraudSummary(req.params.id);
            res.json(summary);
        } catch (error) {
            console.error("Error getting master fraud summary:", error);
            res.status(500).json({ message: "Failed to get master fraud summary" });
        }
    });

    // GET /api/antifraud/alerts - Get pending alerts
    router.get('/api/antifraud/alerts', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { masterAntifraudService } = await import('../../services/franchise/masterAntifraudService');
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
            const alerts = await masterAntifraudService.getPendingAlerts(limit);
            res.json(alerts);
        } catch (error) {
            console.error("Error getting pending alerts:", error);
            res.status(500).json({ message: "Failed to get pending alerts" });
        }
    });

    // POST /api/antifraud/alerts/:id/acknowledge - Acknowledge an alert
    router.post('/api/antifraud/alerts/:id/acknowledge', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { masterAntifraudService } = await import('../../services/franchise/masterAntifraudService');
            const result = await masterAntifraudService.acknowledgeAlert(req.params.id, req.user.id);

            if (!result.success) {
                return res.status(400).json({ message: "Failed to acknowledge alert" });
            }

            res.json({ success: true, message: "Alert acknowledged" });
        } catch (error) {
            console.error("Error acknowledging alert:", error);
            res.status(500).json({ message: "Failed to acknowledge alert" });
        }
    });

    // POST /api/antifraud/validate-territory - Validate territory action (prevention check)
    router.post('/api/antifraud/validate-territory', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { masterId, targetLocation, actionType } = req.body;

            if (!masterId || !targetLocation || !actionType) {
                return res.status(400).json({ message: "Missing required fields: masterId, targetLocation, actionType" });
            }

            const { masterAntifraudService } = await import('../../services/franchise/masterAntifraudService');
            const result = await masterAntifraudService.validateTerritoryAction({
                masterId,
                targetLocation,
                actionType
            });

            res.json(result);
        } catch (error) {
            console.error("Error validating territory action:", error);
            res.status(500).json({ message: "Failed to validate territory action" });
        }
    });

    // POST /api/antifraud/report - Manually report a fraud event
    router.post('/api/antifraud/report', isAuthenticated, async (req: any, res: Response) => {
        try {
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(req.user.id);
            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { masterId, fraudType, severity, evidence, relatedTerritoryId, relatedFranchiseId, relatedAmount } = req.body;

            if (!masterId || !fraudType || !evidence) {
                return res.status(400).json({ message: "Missing required fields: masterId, fraudType, evidence" });
            }

            const { masterAntifraudService } = await import('../../services/franchise/masterAntifraudService');
            const result = await masterAntifraudService.detectFraud({
                masterId,
                fraudType,
                severity: severity || 'medium',
                detectionSource: 'manual_report',
                evidence,
                relatedTerritoryId,
                relatedFranchiseId,
                relatedAmount
            });

            if (!result.success) {
                return res.status(400).json({ message: result.error });
            }

            res.json({
                success: true,
                eventId: result.eventId,
                autoAction: result.autoAction,
                message: "Fraud event reported successfully"
            });
        } catch (error) {
            console.error("Error reporting fraud:", error);
            res.status(500).json({ message: "Failed to report fraud" });
        }
    });
    // ========== FRANCHISE LEADS ROUTES ==========

    // POST /api/franchise-leads/register - Register new franchise lead (public - landing page)
    router.post('/api/franchise-leads/register', async (req: any, res: Response) => {
        try {
            const { name, email, phone, message, plan_id } = req.body;

            if (!name || !email) {
                return res.status(400).json({ message: "Name and email are required" });
            }

            // Check if lead already exists
            const [existing] = await db.select()
                .from(franchise_leads)
                .where(eq(franchise_leads.email, email))
                .limit(1);

            if (existing) {
                return res.status(400).json({ message: "Email already registered" });
            }

            // Create lead
            const [lead] = await db.insert(franchise_leads)
                .values({
                    name,
                    email,
                    phone,
                    notes: message,
                    plan_id: plan_id || null,
                    status: 'pending',
                    source: 'landing_page',
                    franchise_code: `LEAD-${Date.now().toString().slice(-6)}` // Simple code generation
                })
                .returning();

            res.status(201).json({ success: true, message: "Lead registered successfully", leadId: lead.id });
        } catch (error) {
            console.error("Error registering franchise lead:", error);
            res.status(500).json({ message: "Failed to register lead" });
        }
    });
    // ========== FRANCHISE MANAGEMENT ROUTES (MOVED FROM server/routes.ts) ==========

    // Get franchise plans (public for display - DYNAMIC PRICING)
    // Prices are fetched from franchise_plans table, controlled by Franchisor settings
    router.get('/api/franchise-plans/public', async (req: any, res: Response) => {
        try {
            const { franchise_plans } = await import("@shared/schema");
            const plans = await db.select()
                .from(franchise_plans)
                .where(eq(franchise_plans.is_active, true))
                .orderBy(franchise_plans.display_order);
            res.json(plans);
        } catch (error) {
            console.error("Error fetching franchise plans:", error);
            res.status(500).json({ message: "Failed to fetch franchise plans" });
        }
    });

    // Create new franchise lead (Etapa 1 - Dados Pessoais)
    router.post('/api/franchise-leads', async (req: any, res: Response) => {
        try {
            const { franchise_leads } = await import("@shared/schema");
            const { name, trade_name, document_type, document_number, secondary_document, birth_date, email, phone, whatsapp, address_street, address_number, address_complement, address_neighborhood, address_zip, address_city, address_country, plan_id } = req.body;

            if (!name || !document_number || !email || !plan_id) {
                return res.status(400).json({ message: "Missing required fields" });
            }

            // CHECK FOR DUPLICATE: Same CPF/CNPJ with active registration
            const existingLead = await db.select()
                .from(franchise_leads)
                .where(and(
                    eq(franchise_leads.document_number, document_number),
                    eq(franchise_leads.status, 'pending')
                ))
                .limit(1);

            if (existingLead.length > 0) {
                return res.status(409).json({
                    message: "Duplicate registration detected",
                    detail: `This CPF/CNPJ is already registered. Existing franchise code: ${existingLead[0].franchise_code}. Please use the existing registration or contact support.`,
                    duplicate_franchise_code: existingLead[0].franchise_code
                });
            }

            const franchiseCode = `DELFOS-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

            const [newLead] = await db.insert(franchise_leads).values({
                franchise_code: franchiseCode,
                name,
                trade_name,
                document_type,
                document_number,
                secondary_document,
                birth_date: birth_date ? new Date(birth_date) : undefined,
                email,
                phone,
                whatsapp,
                address_street,
                address_number,
                address_complement,
                address_neighborhood,
                address_zip,
                address_city,
                address_country,
                plan_id,
                status: "pending",
                documents_uploaded: false,
                auto_pre_approved: false,
            }).returning();

            res.json({ id: newLead.id, franchise_code: newLead.franchise_code });
        } catch (error: any) {
            console.error("Error creating franchise lead:", error);
            res.status(500).json({ message: error.message || "Failed to create franchise lead" });
        }
    });

    // Accept contract (Etapa 4 - Contrato)
    router.post('/api/franchise-leads/:leadId/accept-contract', async (req: any, res: Response) => {
        try {
            const { leadId } = req.params;
            const { contract_version } = req.body;

            if (!contract_version) {
                return res.status(400).json({ message: "Contract version is required" });
            }

            // Update lead with contract acceptance
            const updateData: any = { contract_version };

            // Only update accepted_at if the field exists
            updateData.contract_accepted_at = new Date();

            const updatedLead = await db.update(franchise_leads)
                .set(updateData)
                .where(eq(franchise_leads.id, leadId))
                .returning();

            if (!updatedLead || updatedLead.length === 0) {
                return res.status(404).json({ message: "Franchise lead not found" });
            }

            res.json({ success: true, message: "Contract accepted", leadId: leadId });
        } catch (error: any) {
            console.error("Error accepting contract:", error);
            res.status(500).json({ message: error.message || "Failed to accept contract" });
        }
    });

    // Get active contract template
    router.get('/api/contract-templates/active', async (req: any, res: Response) => {
        try {
            const { contract_templates } = await import("@shared/schema");
            const template = await db.select()
                .from(contract_templates)
                .where(eq(contract_templates.is_active, true))
                .orderBy(desc(contract_templates.created_at))
                .limit(1);

            if (!template || template.length === 0) {
                return res.status(404).json({ message: "No active contract template found" });
            }

            res.json(template[0]);
        } catch (error: any) {
            console.error("Error fetching contract template:", error);
            res.status(500).json({ message: error.message || "Failed to fetch contract template" });
        }
    });

    // Get all franchises (franchisor only)
    router.get('/api/franchises', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;
            console.log(`[Franchise] GET /api/franchises - userId: ${userId}, email: ${userEmail}`);

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
            console.log(`[Franchise] Permissions for ${userEmail}: isFranchisor=${permissions.isFranchisor}, globalRole=${permissions.globalRole}`);

            if (!permissions.isFranchisor) {
                console.log(`[Franchise] Access denied for ${userEmail} - not a franchisor`);
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const allFranchises = await db.select()
                .from(franchises)
                .orderBy(desc(franchises.created_at));

            res.json(allFranchises);
        } catch (error) {
            console.error("Error fetching franchises:", error);
            res.status(500).json({ message: "Failed to fetch franchises" });
        }
    });

    // Get user's franchise (for franchise members)
    router.get('/api/my-franchise', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');

            const franchise = await franchisePermissionService.getUserFranchise(userId, userEmail);
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);

            res.json({
                franchise,
                permissions,
            });
        } catch (error) {
            console.error("Error fetching user franchise:", error);
            res.status(500).json({ message: "Failed to fetch franchise" });
        }
    });

    // Create franchise (franchisor only)
    router.post('/api/franchises', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;
            console.log(`[Franchise] POST /api/franchises - userId: ${userId}, email: ${userEmail}`);

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
            console.log(`[Franchise] Permissions for ${userEmail}: isFranchisor=${permissions.isFranchisor}`);

            if (!permissions.isFranchisor) {
                console.log(`[Franchise] Access denied for ${userEmail} - not a franchisor`);
                return res.status(403).json({ message: "Access denied - franchisor only" });
            }

            const { name, cnpj, tax_id, tax_id_type, address, country, plan_id, contract_start, owner_email } = req.body;

            if (!name || !plan_id || !contract_start) {
                return res.status(400).json({ message: "Name, plan and contract start date are required" });
            }

            // Find owner user if email provided
            let owner_user_id = null;
            if (owner_email) {
                const { users } = await import("@shared/schema");
                const ownerUser = await db.select()
                    .from(users)
                    .where(eq(users.email, owner_email))
                    .limit(1);
                if (ownerUser.length > 0) {
                    owner_user_id = ownerUser[0].id;
                }
            }

            const [newFranchise] = await db.insert(franchises).values({
                name,
                cnpj,
                tax_id,
                tax_id_type: tax_id_type || null,
                address,
                country: country || 'BRA',
                plan_id,
                contract_start: new Date(contract_start),
                owner_user_id,
                status: 'active',
            }).returning();

            // If owner exists, add them as master user
            if (owner_user_id) {
                const { users } = await import("@shared/schema");
                await db.insert(franchise_users).values({
                    franchise_id: newFranchise.id,
                    user_id: owner_user_id,
                    role: 'master',
                    is_active: true,
                    invited_by: userId,
                });

                // Update user's global role
                await db.update(users)
                    .set({ global_role: 'franchise_owner' })
                    .where(eq(users.id, owner_user_id));
            }

            res.json(newFranchise);
        } catch (error) {
            console.error("Error creating franchise:", error);
            res.status(500).json({ message: "Failed to create franchise" });
        }
    });

    // Get franchise details by ID (admin only)
    router.get('/api/franchises/:id', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;
            const franchiseId = req.params.id;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);

            // Allow franchisor or users linked to this franchise
            if (!permissions.isFranchisor) {
                // Check if user is linked to this franchise
                const [userFranchiseLink] = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.user_id, userId),
                        eq(franchise_users.is_active, true)
                    ));

                if (!userFranchiseLink) {
                    return res.status(403).json({ message: "Access denied" });
                }
            }

            // Get franchise with plan
            const [franchise] = await db
                .select()
                .from(franchises)
                .where(eq(franchises.id, franchiseId));

            if (!franchise) {
                return res.status(404).json({ message: "Franchise not found" });
            }

            // Get plan details
            const { franchise_plans } = await import("@shared/schema");
            const [plan] = await db
                .select()
                .from(franchise_plans)
                .where(eq(franchise_plans.id, franchise.plan_id));

            // Get franchise users with user details
            const { users } = await import("@shared/schema");
            const franchiseUsersData = await db
                .select({
                    id: franchise_users.id,
                    user_id: franchise_users.user_id,
                    role: franchise_users.role,
                    permissions: franchise_users.permissions,
                    is_active: franchise_users.is_active,
                    invited_at: franchise_users.invited_at,
                    accepted_at: franchise_users.accepted_at,
                    user_email: users.email,
                    user_first_name: users.firstName,
                    user_last_name: users.lastName,
                    user_profile_image: users.profileImageUrl,
                })
                .from(franchise_users)
                .leftJoin(users, eq(franchise_users.user_id, users.id))
                .where(eq(franchise_users.franchise_id, franchiseId));

            // Get owner details if exists
            let owner = null;
            if (franchise.owner_user_id) {
                const [ownerData] = await db
                    .select({
                        id: users.id,
                        email: users.email,
                        firstName: users.firstName,
                        lastName: users.lastName,
                        profileImageUrl: users.profileImageUrl,
                    })
                    .from(users)
                    .where(eq(users.id, franchise.owner_user_id));
                owner = ownerData;
            }

            res.json({
                ...franchise,
                plan,
                owner,
                users: franchiseUsersData,
            });
        } catch (error) {
            console.error("Error fetching franchise details:", error);
            res.status(500).json({ message: "Failed to fetch franchise details" });
        }
    });

    // Update franchise (admin only)
    router.patch('/api/franchises/:id', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;
            const franchiseId = req.params.id;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);

            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Only franchisors can update franchises" });
            }

            const {
                name, cnpj, tax_id_type, tax_id, address, country, plan_id,
                contract_start, contract_end, custom_royalty_percentage,
                bank_name, bank_agency, bank_account, pix_key,
                // Tax Profile for Trading
                tax_country, tax_year, tax_short_term_rate, tax_long_term_rate, tax_min_taxable
            } = req.body;

            // Helper to normalize empty strings to null
            const normalizeString = (val: any): string | null => {
                if (val === undefined || val === null || val === '') return null;
                return String(val).trim() || null;
            };

            // Helper to normalize numeric values
            const normalizeNumber = (val: any): number | null => {
                if (val === undefined || val === null || val === '') return null;
                const num = parseFloat(val);
                return isNaN(num) ? null : num;
            };

            // Helper to normalize dates
            const normalizeDate = (val: any): Date | null => {
                if (val === undefined || val === null || val === '') return null;
                const date = new Date(val);
                return isNaN(date.getTime()) ? null : date;
            };

            const updateData: any = { updated_at: new Date() };

            // Required string fields
            if (name !== undefined && name) updateData.name = String(name).trim();

            // Optional string fields
            if (cnpj !== undefined) updateData.cnpj = normalizeString(cnpj);
            if (tax_id_type !== undefined) updateData.tax_id_type = normalizeString(tax_id_type);
            if (tax_id !== undefined) updateData.tax_id = normalizeString(tax_id);
            if (address !== undefined) updateData.address = normalizeString(address);
            if (country !== undefined && country) updateData.country = String(country).trim();
            if (plan_id !== undefined && plan_id) updateData.plan_id = String(plan_id).trim();

            // Date fields
            if (contract_start !== undefined) {
                const parsedStart = normalizeDate(contract_start);
                if (parsedStart) updateData.contract_start = parsedStart;
            }
            if (contract_end !== undefined) updateData.contract_end = normalizeDate(contract_end);

            // Numeric fields
            if (custom_royalty_percentage !== undefined) updateData.custom_royalty_percentage = normalizeNumber(custom_royalty_percentage);

            // Banking optional string fields
            if (bank_name !== undefined) updateData.bank_name = normalizeString(bank_name);
            if (bank_agency !== undefined) updateData.bank_agency = normalizeString(bank_agency);
            if (bank_account !== undefined) updateData.bank_account = normalizeString(bank_account);
            if (pix_key !== undefined) updateData.pix_key = normalizeString(pix_key);

            // Tax Profile for Trading fields
            if (tax_country !== undefined) updateData.tax_country = normalizeString(tax_country);
            if (tax_year !== undefined) {
                const yearNum = parseInt(tax_year);
                updateData.tax_year = isNaN(yearNum) ? null : yearNum;
            }
            if (tax_short_term_rate !== undefined) updateData.tax_short_term_rate = normalizeNumber(tax_short_term_rate)?.toString() || null;
            if (tax_long_term_rate !== undefined) updateData.tax_long_term_rate = normalizeNumber(tax_long_term_rate)?.toString() || null;
            if (tax_min_taxable !== undefined) updateData.tax_min_taxable = normalizeNumber(tax_min_taxable)?.toString() || null;

            const [updated] = await db.update(franchises)
                .set(updateData)
                .where(eq(franchises.id, franchiseId))
                .returning();

            if (!updated) {
                return res.status(404).json({ message: "Franchise not found" });
            }

            res.json(updated);
        } catch (error) {
            console.error("Error updating franchise:", error);
            res.status(500).json({ message: "Failed to update franchise" });
        }
    });

    // Suspend franchise (franchisor only)
    router.post('/api/franchises/:id/suspend', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;
            const franchiseId = req.params.id;
            const { reason } = req.body;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);

            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Only franchisors can suspend franchises" });
            }

            const [updated] = await db.update(franchises)
                .set({
                    status: 'suspended',
                    suspended_reason: reason || 'Admin action',
                    suspended_at: new Date(),
                    updated_at: new Date()
                })
                .where(eq(franchises.id, franchiseId))
                .returning();

            if (!updated) {
                return res.status(404).json({ message: "Franchise not found" });
            }

            console.log(`[FRANCHISE] Franchise ${franchiseId} suspended by user ${userId}. Reason: ${reason}`);
            res.json(updated);
        } catch (error) {
            console.error("Error suspending franchise:", error);
            res.status(500).json({ message: "Failed to suspend franchise" });
        }
    });

    // Reactivate franchise (franchisor only)
    router.post('/api/franchises/:id/reactivate', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;
            const franchiseId = req.params.id;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);

            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Only franchisors can reactivate franchises" });
            }

            const [updated] = await db.update(franchises)
                .set({
                    status: 'active',
                    suspended_reason: null,
                    suspended_at: null,
                    updated_at: new Date()
                })
                .where(eq(franchises.id, franchiseId))
                .returning();

            if (!updated) {
                return res.status(404).json({ message: "Franchise not found" });
            }

            console.log(`[FRANCHISE] Franchise ${franchiseId} reactivated by user ${userId}`);
            res.json(updated);
        } catch (error) {
            console.error("Error reactivating franchise:", error);
            res.status(500).json({ message: "Failed to reactivate franchise" });
        }
    });

    // Add user to franchise
    router.post('/api/franchises/:id/users', isAuthenticated, async (req: any, res: Response) => {
        try {
            const currentUserId = req.user.claims.sub;
            const currentUserEmail = req.user.claims.email;
            const franchiseId = req.params.id;
            const { email, role } = req.body;

            if (!email || !role) {
                return res.status(400).json({ message: "Email and role are required" });
            }

            const validRoles = ['master', 'operator', 'analyst', 'finance'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ message: "Invalid role" });
            }

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(currentUserId, currentUserEmail);

            // Only franchisor or franchise master can add users
            let canManageUsers = permissions.isFranchisor;
            if (!canManageUsers) {
                const [userLink] = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.user_id, currentUserId),
                        eq(franchise_users.role, 'master'),
                        eq(franchise_users.is_active, true)
                    ));
                canManageUsers = !!userLink;
            }

            if (!canManageUsers) {
                return res.status(403).json({ message: "Permission denied" });
            }

            // Find user by email or create placeholder if not exists
            const { users } = await import("@shared/schema");
            let [targetUser] = await db
                .select()
                .from(users)
                .where(eq(users.email, email.toLowerCase()));

            if (!targetUser) {
                // Create placeholder user for invitation
                // They will be activated when they log in for the first time
                const [newUser] = await db.insert(users).values({
                    email: email.toLowerCase(),
                    is_beta_approved: true, // Auto-approve invited users
                    global_role: 'user',
                    preferred_language: 'pt-BR',
                    notifications_enabled: true,
                }).returning();
                targetUser = newUser;
                console.log(`[FRANCHISE] Created placeholder user for invitation: ${email}`);
            }

            // Check if user already linked
            const [existingLink] = await db
                .select()
                .from(franchise_users)
                .where(and(
                    eq(franchise_users.franchise_id, franchiseId),
                    eq(franchise_users.user_id, targetUser.id)
                ));

            if (existingLink) {
                return res.status(400).json({ message: "User already linked to this franchise" });
            }

            // Add user to franchise
            const [newLink] = await db.insert(franchise_users).values({
                franchise_id: franchiseId,
                user_id: targetUser.id,
                role,
                is_active: true,
                invited_by: currentUserId,
                accepted_at: new Date(),
            }).returning();

            res.json({
                ...newLink,
                user_email: targetUser.email,
                user_first_name: targetUser.firstName,
                user_last_name: targetUser.lastName,
            });
        } catch (error) {
            console.error("Error adding user to franchise:", error);
            res.status(500).json({ message: "Failed to add user" });
        }
    });

    // Update user role in franchise
    router.patch('/api/franchises/:id/users/:userId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const currentUserId = req.user.claims.sub;
            const franchiseId = req.params.id;
            const targetUserId = req.params.userId;
            const { role, is_active } = req.body;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(currentUserId);

            // Only franchisor or franchise master can update users
            let canManageUsers = permissions.isFranchisor;
            if (!canManageUsers) {
                const [userLink] = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.user_id, currentUserId),
                        eq(franchise_users.role, 'master'),
                        eq(franchise_users.is_active, true)
                    ));
                canManageUsers = !!userLink;
            }

            if (!canManageUsers) {
                return res.status(403).json({ message: "Permission denied" });
            }

            // Find the link to update
            const [existingLink] = await db
                .select()
                .from(franchise_users)
                .where(and(
                    eq(franchise_users.franchise_id, franchiseId),
                    eq(franchise_users.user_id, targetUserId)
                ));

            if (!existingLink) {
                return res.status(404).json({ message: "User not linked to this franchise" });
            }

            // Build update object
            const updateData: any = { updated_at: new Date() };
            if (role !== undefined) {
                const validRoles = ['master', 'operator', 'analyst', 'finance'];
                if (!validRoles.includes(role)) {
                    return res.status(400).json({ message: "Invalid role" });
                }
                updateData.role = role;
            }
            if (is_active !== undefined) {
                updateData.is_active = is_active;
            }

            // If demoting or deactivating a master, ensure at least one active master remains
            const wouldRemoveMaster = (
                (existingLink.role === 'master' && existingLink.is_active) &&
                ((role !== undefined && role !== 'master') || (is_active === false))
            );

            if (wouldRemoveMaster) {
                const activeMasters = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.role, 'master'),
                        eq(franchise_users.is_active, true)
                    ));

                if (activeMasters.length <= 1) {
                    return res.status(400).json({ message: "Cannot demote or deactivate the only master of this franchise" });
                }
            }

            const [updated] = await db
                .update(franchise_users)
                .set(updateData)
                .where(eq(franchise_users.id, existingLink.id))
                .returning();

            res.json(updated);
        } catch (error) {
            console.error("Error updating franchise user:", error);
            res.status(500).json({ message: "Failed to update user" });
        }
    });

    // Remove user from franchise
    router.delete('/api/franchises/:id/users/:userId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const currentUserId = req.user.claims.sub;
            const franchiseId = req.params.id;
            const targetUserId = req.params.userId;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(currentUserId);

            // Only franchisor or franchise master can remove users
            let canManageUsers = permissions.isFranchisor;
            if (!canManageUsers) {
                const [userLink] = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.user_id, currentUserId),
                        eq(franchise_users.role, 'master'),
                        eq(franchise_users.is_active, true)
                    ));
                canManageUsers = !!userLink;
            }

            if (!canManageUsers) {
                return res.status(403).json({ message: "Permission denied" });
            }

            // Prevent removing yourself if you're the only master
            const [targetLink] = await db
                .select()
                .from(franchise_users)
                .where(and(
                    eq(franchise_users.franchise_id, franchiseId),
                    eq(franchise_users.user_id, targetUserId)
                ));

            if (!targetLink) {
                return res.status(404).json({ message: "User not linked to this franchise" });
            }

            // If target is an active master, check if there are other active masters
            if (targetLink.role === 'master' && targetLink.is_active) {
                const activeMasters = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.role, 'master'),
                        eq(franchise_users.is_active, true)
                    ));

                if (activeMasters.length <= 1) {
                    return res.status(400).json({ message: "Cannot remove the only master of this franchise" });
                }
            }

            await db
                .delete(franchise_users)
                .where(eq(franchise_users.id, targetLink.id));

            res.json({ message: "User removed successfully" });
        } catch (error) {
            console.error("Error removing franchise user:", error);
            res.status(500).json({ message: "Failed to remove user" });
        }
    });

    // POST /api/franchisor/users - Add user to franchisor
    router.post('/api/franchisor/users', isAuthenticated, async (req: any, res: Response) => {
        try {
            const currentUserId = req.user.claims.sub;
            const currentUserEmail = req.user.claims.email;
            const { email, role } = req.body;

            if (!email || !role) {
                return res.status(400).json({ message: "Email and role are required" });
            }

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(currentUserId, currentUserEmail);

            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Permission denied - franchisor only" });
            }

            // Find user by email or create placeholder
            const { users } = await import("@shared/schema");
            let [targetUser] = await db
                .select()
                .from(users)
                .where(eq(users.email, email.toLowerCase()));

            if (!targetUser) {
                const [newUser] = await db.insert(users).values({
                    email: email.toLowerCase(),
                    is_beta_approved: true,
                    global_role: 'user',
                    preferred_language: 'pt-BR',
                    notifications_enabled: true,
                }).returning();
                targetUser = newUser;
            }

            // Check if already a franchisor user
            const { franchisor_users } = await import("@shared/schema");
            const [existing] = await db
                .select()
                .from(franchisor_users)
                .where(eq(franchisor_users.user_id, targetUser.id));

            if (existing) {
                return res.status(400).json({ message: "User is already a franchisor user" });
            }

            const [newLink] = await db.insert(franchisor_users).values({
                user_id: targetUser.id,
                role,
                is_active: true,
                invited_by: currentUserId,
            }).returning();

            res.json(newLink);
        } catch (error) {
            console.error("Error adding franchisor user:", error);
            res.status(500).json({ message: "Failed to add franchisor user" });
        }
    });
    // PATCH /api/franchisor/users/:userId - Update franchisor user
    router.patch('/api/franchisor/users/:userId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const currentUserId = req.user.claims.sub;
            const currentUserEmail = req.user.claims.email;
            const targetUserId = req.params.userId;
            const { role, is_active } = req.body;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(currentUserId, currentUserEmail);

            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Permission denied" });
            }

            const { franchisor_users } = await import("@shared/schema");
            const [existingLink] = await db.select().from(franchisor_users).where(eq(franchisor_users.user_id, targetUserId));
            if (!existingLink) {
                return res.status(404).json({ message: "User not found" });
            }

            const updateData: any = { updated_at: new Date() };
            if (role !== undefined) updateData.role = role;
            if (is_active !== undefined) updateData.is_active = is_active;

            const [updated] = await db.update(franchisor_users).set(updateData).where(eq(franchisor_users.id, existingLink.id)).returning();

            res.json(updated);
        } catch (error) {
            console.error("Error updating franchisor user:", error);
            res.status(500).json({ message: "Failed to update user" });
        }
    });

    // DELETE /api/franchisor/users/:userId - Remove franchisor user
    router.delete('/api/franchisor/users/:userId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const currentUserId = req.user.claims.sub;
            const currentUserEmail = req.user.claims.email;
            const targetUserId = req.params.userId;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(currentUserId, currentUserEmail);

            if (!permissions.isFranchisor) {
                return res.status(403).json({ message: "Permission denied" });
            }

            const { franchisor_users } = await import("@shared/schema");
            const [existingLink] = await db.select().from(franchisor_users).where(eq(franchisor_users.user_id, targetUserId));
            if (!existingLink) {
                return res.status(404).json({ message: "User not found" });
            }

            await db.delete(franchisor_users).where(eq(franchisor_users.id, existingLink.id));

            res.json({ message: "User removed successfully" });
        } catch (error) {
            console.error("Error removing franchisor user:", error);
            res.status(500).json({ message: "Failed to remove user" });
        }
    });

    // ========== MASTER FRANCHISE USERS MANAGEMENT ==========

    // POST /api/master/users - Add user to master franchise
    router.post('/api/master/users', isAuthenticated, async (req: any, res: Response) => {
        try {
            const currentUserId = req.user.claims.sub;
            const { email, role } = req.body;

            if (!email || !role) {
                return res.status(400).json({ message: "Email and role are required" });
            }

            // Check if user is master franchise user
            const [isMaster] = await db.select().from(franchise_users).where(and(
                eq(franchise_users.user_id, currentUserId),
                eq(franchise_users.role, 'master'),
                eq(franchise_users.is_active, true)
            ));

            if (!isMaster) {
                return res.status(403).json({ message: "Permission denied" });
            }

            // Find or create user
            const { users } = await import("@shared/schema");
            let [targetUser] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
            if (!targetUser) {
                const [newUser] = await db.insert(users).values({
                    email: email.toLowerCase(),
                    is_beta_approved: true,
                    global_role: 'user',
                    preferred_language: 'pt-BR',
                    notifications_enabled: true,
                }).returning();
                targetUser = newUser;
            }

            // Add to master's franchise
            const [masterFranchise] = await db.select().from(franchise_users).where(eq(franchise_users.user_id, currentUserId));

            const [newLink] = await db.insert(franchise_users).values({
                franchise_id: masterFranchise.franchise_id,
                user_id: targetUser.id,
                role: role as any,
                is_active: true,
                invited_by: currentUserId,
            }).returning();

            res.json({
                ...newLink,
                user_email: targetUser.email,
            });
        } catch (error) {
            console.error("Error adding master user:", error);
            res.status(500).json({ message: "Failed to add user" });
        }
    });

    // PATCH /api/master/users/:userId - Update master franchise user
    router.patch('/api/master/users/:userId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const currentUserId = req.user.claims.sub;
            const targetUserId = req.params.userId;
            const { role, is_active } = req.body;

            // Check if user is master franchise user
            const [isMaster] = await db.select().from(franchise_users).where(and(
                eq(franchise_users.user_id, currentUserId),
                eq(franchise_users.role, 'master'),
                eq(franchise_users.is_active, true)
            ));

            if (!isMaster) {
                return res.status(403).json({ message: "Permission denied" });
            }

            const [existingLink] = await db.select().from(franchise_users).where(eq(franchise_users.user_id, targetUserId));
            if (!existingLink) {
                return res.status(404).json({ message: "User not found" });
            }

            const updateData: any = { updated_at: new Date() };
            if (role !== undefined) updateData.role = role;
            if (is_active !== undefined) updateData.is_active = is_active;

            const [updated] = await db.update(franchise_users).set(updateData).where(eq(franchise_users.id, existingLink.id)).returning();

            res.json(updated);
        } catch (error) {
            console.error("Error updating master user:", error);
            res.status(500).json({ message: "Failed to update user" });
        }
    });

    // DELETE /api/master/users/:userId - Remove master franchise user
    router.delete('/api/master/users/:userId', isAuthenticated, async (req: any, res: Response) => {
        try {
            const currentUserId = req.user.claims.sub;
            const targetUserId = req.params.userId;

            // Check if user is master franchise user
            const [isMaster] = await db.select().from(franchise_users).where(and(
                eq(franchise_users.user_id, currentUserId),
                eq(franchise_users.role, 'master'),
                eq(franchise_users.is_active, true)
            ));

            if (!isMaster) {
                return res.status(403).json({ message: "Permission denied" });
            }

            const [existingLink] = await db.select().from(franchise_users).where(eq(franchise_users.user_id, targetUserId));
            if (!existingLink) {
                return res.status(404).json({ message: "User not found" });
            }

            await db.delete(franchise_users).where(eq(franchise_users.id, existingLink.id));

            res.json({ message: "User removed successfully" });
        } catch (error) {
            console.error("Error removing master user:", error);
            res.status(500).json({ message: "Failed to remove user" });
        }
    });

    // ========== FRANCHISE EXCHANGE ACCOUNTS ==========

    // Get exchange accounts for franchise
    router.get('/api/franchises/:id/exchange-accounts', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const franchiseId = req.params.id;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId);

            // Check access: franchisor or franchise user
            let hasAccess = permissions.isFranchisor || permissions.isMasterFranchise;
            if (!hasAccess) {
                const [userLink] = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.user_id, userId),
                        eq(franchise_users.is_active, true)
                    ));
                hasAccess = !!userLink;
            }

            if (!hasAccess) {
                return res.status(403).json({ message: "Permission denied" });
            }

            const { franchiseExchangeService } = await import('../../services/franchiseExchangeService');
            const accounts = await franchiseExchangeService.getAllExchangeAccounts(franchiseId);

            // Return accounts without encrypted credentials
            const safeAccounts = accounts.map(acc => ({
                id: acc.id,
                franchiseId: acc.franchise_id,
                exchange: acc.exchange,
                exchangeLabel: acc.exchange_label,
                canReadBalance: acc.can_read_balance,
                canTrade: acc.can_trade,
                canWithdraw: acc.can_withdraw,
                isActive: acc.is_active,
                isVerified: acc.is_verified,
                verifiedAt: acc.verified_at,
                lastUsedAt: acc.last_used_at,
                consecutiveErrors: acc.consecutive_errors,
                lastError: acc.last_error,
                createdAt: acc.created_at,
            }));

            res.json(safeAccounts);
        } catch (error) {
            console.error("Error fetching exchange accounts:", error);
            res.status(500).json({ message: "Failed to fetch exchange accounts" });
        }
    });

    // Create exchange account for franchise
    router.post('/api/franchises/:id/exchange-accounts', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const franchiseId = req.params.id;
            const { exchange, exchangeLabel, apiKey, apiSecret, apiPassphrase, canTrade } = req.body;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId);

            // Only franchisor or franchise master can add exchange accounts
            let canManage = permissions.isFranchisor;
            if (!canManage) {
                const [userLink] = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.user_id, userId),
                        eq(franchise_users.role, 'master'),
                        eq(franchise_users.is_active, true)
                    ));
                canManage = !!userLink;
            }

            if (!canManage) {
                return res.status(403).json({ message: "Permission denied" });
            }

            if (!apiKey || !apiSecret) {
                return res.status(400).json({ message: "API key and secret are required" });
            }

            const { franchiseExchangeService } = await import('../../services/franchiseExchangeService');
            const account = await franchiseExchangeService.createExchangeAccount({
                franchiseId,
                exchange: exchange || 'kraken',
                exchangeLabel,
                credentials: { apiKey, apiSecret, apiPassphrase },
                canTrade: canTrade ?? false,
                createdBy: userId,
            });

            res.status(201).json({
                id: account.id,
                exchange: account.exchange,
                exchangeLabel: account.exchange_label,
                isActive: account.is_active,
                isVerified: account.is_verified,
                message: "Exchange account created successfully",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to create exchange account";
            console.error("Error creating exchange account:", error);
            res.status(400).json({ message });
        }
    });

    // Update exchange account
    router.patch('/api/franchises/:id/exchange-accounts/:exchange', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const franchiseId = req.params.id;
            const exchange = req.params.exchange;
            const { exchangeLabel, apiKey, apiSecret, apiPassphrase, canTrade, isActive } = req.body;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId);

            let canManage = permissions.isFranchisor;
            if (!canManage) {
                const [userLink] = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.user_id, userId),
                        eq(franchise_users.role, 'master'),
                        eq(franchise_users.is_active, true)
                    ));
                canManage = !!userLink;
            }

            if (!canManage) {
                return res.status(403).json({ message: "Permission denied" });
            }

            const { franchiseExchangeService } = await import('../../services/franchiseExchangeService');

            const updateParams: any = {};
            if (exchangeLabel !== undefined) updateParams.exchangeLabel = exchangeLabel;
            if (canTrade !== undefined) updateParams.canTrade = canTrade;
            if (isActive !== undefined) updateParams.isActive = isActive;
            if (apiKey && apiSecret) {
                updateParams.credentials = { apiKey, apiSecret, apiPassphrase };
            }

            const updated = await franchiseExchangeService.updateExchangeAccount(franchiseId, exchange, updateParams);

            if (!updated) {
                return res.status(404).json({ message: "Exchange account not found" });
            }

            res.json({
                id: updated.id,
                exchange: updated.exchange,
                exchangeLabel: updated.exchange_label,
                isActive: updated.is_active,
                isVerified: updated.is_verified,
                message: "Exchange account updated successfully",
            });
        } catch (error) {
            console.error("Error updating exchange account:", error);
            res.status(500).json({ message: "Failed to update exchange account" });
        }
    });

    // Verify exchange account credentials
    router.post('/api/franchises/:id/exchange-accounts/:exchange/verify', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const franchiseId = req.params.id;
            const exchange = req.params.exchange;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId);

            let hasAccess = permissions.isFranchisor;
            if (!hasAccess) {
                const [userLink] = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.user_id, userId),
                        eq(franchise_users.is_active, true)
                    ));
                hasAccess = !!userLink;
            }

            if (!hasAccess) {
                return res.status(403).json({ message: "Permission denied" });
            }

            const { franchiseExchangeService } = await import('../../services/franchiseExchangeService');
            const result = await franchiseExchangeService.verifyExchangeAccount(franchiseId, exchange);

            res.json(result);
        } catch (error) {
            console.error("Error verifying exchange account:", error);
            res.status(500).json({ message: "Failed to verify exchange account" });
        }
    });

    // Delete exchange account
    router.delete('/api/franchises/:id/exchange-accounts/:exchange', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const franchiseId = req.params.id;
            const exchange = req.params.exchange;

            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId);

            let canManage = permissions.isFranchisor;
            if (!canManage) {
                const [userLink] = await db
                    .select()
                    .from(franchise_users)
                    .where(and(
                        eq(franchise_users.franchise_id, franchiseId),
                        eq(franchise_users.user_id, userId),
                        eq(franchise_users.role, 'master'),
                        eq(franchise_users.is_active, true)
                    ));
                canManage = !!userLink;
            }

            if (!canManage) {
                return res.status(403).json({ message: "Permission denied" });
            }

            const { franchiseExchangeService } = await import('../../services/franchiseExchangeService');
            const deleted = await franchiseExchangeService.deleteExchangeAccount(franchiseId, exchange);

            if (!deleted) {
                return res.status(404).json({ message: "Exchange account not found" });
            }

            res.json({ message: "Exchange account deleted successfully" });
        } catch (error) {
            console.error("Error deleting exchange account:", error);
            res.status(500).json({ message: "Failed to delete exchange account" });
        }
    });
    // Get user permissions
    router.get('/api/user/permissions', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const userEmail = req.user.claims.email;
            const { franchisePermissionService } = await import('../../services/franchisePermissionService');
            const permissions = await franchisePermissionService.getUserPermissions(userId, userEmail);
            res.json(permissions);
        } catch (error) {
            console.error("Error fetching user permissions:", error);
            res.status(500).json({ message: "Failed to fetch permissions" });
        }
    });

    // Get allowed risk profiles for user based on their franchise plan
    router.get('/api/user/allowed-risk-profiles', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { franchisePlanService } = await import('../../services/franchisePlanService');
            const result = await franchisePlanService.getAllowedRiskProfilesForUser(userId);

            // Map profile names to codes for frontend compatibility (extended for new profiles)
            const profileNameToCode: Record<string, string> = {
                'conservative': 'C',
                'moderate': 'M',
                'aggressive': 'A',
                'super_aggressive': 'SA',
                'full_custom': 'F'
            };

            // If null (no franchise), all profiles are allowed
            const allowedCodes = result.allowed === null
                ? ['C', 'M', 'A', 'SA', 'F']
                : result.allowed.map(name => profileNameToCode[name] || name.toUpperCase().charAt(0));

            res.json({
                allowedProfiles: allowedCodes,
                allowedProfileNames: result.allowed || ['conservative', 'moderate', 'aggressive', 'super_aggressive', 'full_custom'],
                planCode: result.planCode,
                planName: result.planName,
                franchiseId: result.franchiseId,
                isUnrestricted: result.allowed === null
            });
        } catch (error) {
            console.error("Error fetching allowed risk profiles:", error);
            res.status(500).json({ message: "Failed to fetch allowed risk profiles" });
        }
    });

    // Get available risk profiles with governance status for campaign wizard
    router.get('/api/user/available-profiles', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const { franchisePlanService } = await import('../../services/franchisePlanService');
            const profiles = await franchisePlanService.getAvailableProfilesForUser(userId);
            res.json(profiles);
        } catch (error) {
            console.error("Error fetching available profiles:", error);
            res.status(500).json({ message: "Failed to fetch available profiles" });
        }
    });
}
