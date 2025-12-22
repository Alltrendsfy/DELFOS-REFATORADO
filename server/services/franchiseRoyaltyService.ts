import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import crypto from "crypto";

export interface CampaignRoyaltyBreakdown {
  campaign_id: string;
  campaign_name: string;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
  royalty: number;
}

export interface RoyaltyCalculation {
  franchise_id: string;
  franchise_name: string;
  period_start: Date;
  period_end: Date;
  period_month: number;
  period_year: number;
  gross_pnl: number;
  fees_deducted: number;
  net_profit: number;
  royalty_percentage: number;
  royalty_amount: number;
  campaign_breakdown: CampaignRoyaltyBreakdown[];
  audit_hash: string;
}

class FranchiseRoyaltyService {
  async calculateMonthlyRoyalties(
    franchiseId: string,
    year: number,
    month: number
  ): Promise<RoyaltyCalculation | null> {
    const franchise = await db.select()
      .from(schema.franchises)
      .innerJoin(schema.franchise_plans, eq(schema.franchises.plan_id, schema.franchise_plans.id))
      .where(eq(schema.franchises.id, franchiseId))
      .limit(1);

    if (franchise.length === 0) {
      return null;
    }

    const franchiseData = franchise[0].franchises;
    const planData = franchise[0].franchise_plans;

    const periodStart = new Date(year, month - 1, 1, 0, 0, 0);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    const franchiseCampaigns = await db.select()
      .from(schema.campaigns)
      .where(and(
        eq(schema.campaigns.franchise_id, franchiseId),
        eq(schema.campaigns.is_deleted, false)
      ));

    if (franchiseCampaigns.length === 0) {
      return null;
    }

    const campaignBreakdown: CampaignRoyaltyBreakdown[] = [];
    let totalGrossPnl = 0;
    let totalFees = 0;

    for (const campaign of franchiseCampaigns) {
      const closedPositions = await db.select()
        .from(schema.campaign_positions)
        .where(and(
          eq(schema.campaign_positions.campaign_id, campaign.id),
          eq(schema.campaign_positions.state, 'closed'),
          gte(schema.campaign_positions.closed_at, periodStart),
          lte(schema.campaign_positions.closed_at, periodEnd)
        ));

      let campaignGrossPnl = 0;
      let campaignFees = 0;

      for (const position of closedPositions) {
        const pnl = parseFloat(position.realized_pnl || '0');
        campaignGrossPnl += pnl;
      }

      const orders = await db.select()
        .from(schema.campaign_orders)
        .where(and(
          eq(schema.campaign_orders.campaign_id, campaign.id),
          gte(schema.campaign_orders.filled_at, periodStart),
          lte(schema.campaign_orders.filled_at, periodEnd)
        ));

      for (const order of orders) {
        const fee = parseFloat(order.fees || '0');
        campaignFees += fee;
      }

      const campaignNetPnl = campaignGrossPnl - campaignFees;
      
      if (campaignGrossPnl !== 0 || closedPositions.length > 0) {
        // Safely parse royalty percentage, handling both string and Decimal types
        const customPct = franchiseData.custom_royalty_percentage;
        const planPct = planData.royalty_percentage;
        const royaltyPct = parseFloat(String(customPct ?? planPct ?? '10'));
        const campaignRoyalty = campaignNetPnl > 0 ? campaignNetPnl * (royaltyPct / 100) : 0;

        campaignBreakdown.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          gross_pnl: campaignGrossPnl,
          fees: campaignFees,
          net_pnl: campaignNetPnl,
          royalty: campaignRoyalty,
        });

        totalGrossPnl += campaignGrossPnl;
        totalFees += campaignFees;
      }
    }

    const netProfit = totalGrossPnl - totalFees;
    const customPct = franchiseData.custom_royalty_percentage;
    const planPct = planData.royalty_percentage;
    const royaltyPct = parseFloat(String(customPct ?? planPct ?? '10'));
    const royaltyAmount = netProfit > 0 ? netProfit * (royaltyPct / 100) : 0;

    const auditData = {
      franchise_id: franchiseId,
      period: `${year}-${month}`,
      gross_pnl: totalGrossPnl,
      fees: totalFees,
      net_profit: netProfit,
      royalty_pct: royaltyPct,
      royalty_amount: royaltyAmount,
      campaigns: campaignBreakdown.map(c => ({
        id: c.campaign_id,
        pnl: c.net_pnl,
        royalty: c.royalty
      })),
      calculated_at: new Date().toISOString(),
    };
    const auditHash = crypto.createHash('sha256').update(JSON.stringify(auditData)).digest('hex');

    return {
      franchise_id: franchiseId,
      franchise_name: franchiseData.name,
      period_start: periodStart,
      period_end: periodEnd,
      period_month: month,
      period_year: year,
      gross_pnl: totalGrossPnl,
      fees_deducted: totalFees,
      net_profit: netProfit,
      royalty_percentage: royaltyPct,
      royalty_amount: royaltyAmount,
      campaign_breakdown: campaignBreakdown,
      audit_hash: auditHash,
    };
  }

  async saveRoyaltyCalculation(calculation: RoyaltyCalculation): Promise<schema.FranchiseRoyalty> {
    const existing = await db.select()
      .from(schema.franchise_royalties)
      .where(and(
        eq(schema.franchise_royalties.franchise_id, calculation.franchise_id),
        eq(schema.franchise_royalties.period_year, calculation.period_year),
        eq(schema.franchise_royalties.period_month, calculation.period_month)
      ))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(schema.franchise_royalties)
        .set({
          gross_pnl: calculation.gross_pnl.toFixed(2),
          fees_deducted: calculation.fees_deducted.toFixed(2),
          net_profit: calculation.net_profit.toFixed(2),
          royalty_percentage: calculation.royalty_percentage.toFixed(2),
          royalty_amount: calculation.royalty_amount.toFixed(2),
          campaign_breakdown: calculation.campaign_breakdown,
          audit_hash: calculation.audit_hash,
          updated_at: new Date(),
        })
        .where(eq(schema.franchise_royalties.id, existing[0].id))
        .returning();
      return updated;
    }

    const [royalty] = await db.insert(schema.franchise_royalties)
      .values({
        franchise_id: calculation.franchise_id,
        period_start: calculation.period_start,
        period_end: calculation.period_end,
        period_month: calculation.period_month,
        period_year: calculation.period_year,
        gross_pnl: calculation.gross_pnl.toFixed(2),
        fees_deducted: calculation.fees_deducted.toFixed(2),
        audit_adjustments: '0',
        net_profit: calculation.net_profit.toFixed(2),
        royalty_percentage: calculation.royalty_percentage.toFixed(2),
        royalty_amount: calculation.royalty_amount.toFixed(2),
        campaign_breakdown: calculation.campaign_breakdown,
        status: 'pending',
        audit_hash: calculation.audit_hash,
      })
      .returning();

    return royalty;
  }

  async getRoyaltiesForFranchise(franchiseId: string): Promise<schema.FranchiseRoyalty[]> {
    return db.select()
      .from(schema.franchise_royalties)
      .where(eq(schema.franchise_royalties.franchise_id, franchiseId))
      .orderBy(sql`${schema.franchise_royalties.period_year} DESC, ${schema.franchise_royalties.period_month} DESC`);
  }

  async getRoyaltyById(royaltyId: string): Promise<schema.FranchiseRoyalty | null> {
    const result = await db.select()
      .from(schema.franchise_royalties)
      .where(eq(schema.franchise_royalties.id, royaltyId))
      .limit(1);
    return result[0] || null;
  }

  async updateRoyaltyStatus(
    royaltyId: string,
    status: string,
    paymentDetails?: {
      payment_method?: string;
      payment_reference?: string;
      invoice_url?: string;
    }
  ): Promise<schema.FranchiseRoyalty | null> {
    const updateData: any = {
      status,
      updated_at: new Date(),
    };

    if (status === 'paid') {
      updateData.paid_at = new Date();
    }

    if (paymentDetails) {
      if (paymentDetails.payment_method) updateData.payment_method = paymentDetails.payment_method;
      if (paymentDetails.payment_reference) updateData.payment_reference = paymentDetails.payment_reference;
      if (paymentDetails.invoice_url) updateData.invoice_url = paymentDetails.invoice_url;
    }

    const [updated] = await db.update(schema.franchise_royalties)
      .set(updateData)
      .where(eq(schema.franchise_royalties.id, royaltyId))
      .returning();

    return updated || null;
  }

  async calculateAllFranchisesRoyalties(year: number, month: number): Promise<{
    calculated: number;
    skipped: number;
    errors: string[];
  }> {
    const activeFranchises = await db.select()
      .from(schema.franchises)
      .where(eq(schema.franchises.status, 'active'));

    let calculated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const franchise of activeFranchises) {
      try {
        const calculation = await this.calculateMonthlyRoyalties(franchise.id, year, month);
        if (calculation && calculation.campaign_breakdown.length > 0) {
          await this.saveRoyaltyCalculation(calculation);
          calculated++;
        } else {
          skipped++;
        }
      } catch (error) {
        errors.push(`Franchise ${franchise.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { calculated, skipped, errors };
  }

  async getRoyaltySummary(franchiseId: string): Promise<{
    totalPaid: number;
    totalPending: number;
    totalDisputed: number;
    lastPayment: Date | null;
    royalties: schema.FranchiseRoyalty[];
  }> {
    const royalties = await this.getRoyaltiesForFranchise(franchiseId);

    let totalPaid = 0;
    let totalPending = 0;
    let totalDisputed = 0;
    let lastPayment: Date | null = null;

    for (const royalty of royalties) {
      const amount = parseFloat(royalty.royalty_amount);
      switch (royalty.status) {
        case 'paid':
          totalPaid += amount;
          if (royalty.paid_at && (!lastPayment || royalty.paid_at > lastPayment)) {
            lastPayment = royalty.paid_at;
          }
          break;
        case 'pending':
        case 'invoiced':
          totalPending += amount;
          break;
        case 'disputed':
          totalDisputed += amount;
          break;
      }
    }

    return {
      totalPaid,
      totalPending,
      totalDisputed,
      lastPayment,
      royalties,
    };
  }
}

export const franchiseRoyaltyService = new FranchiseRoyaltyService();
