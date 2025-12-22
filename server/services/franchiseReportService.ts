import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, desc, sql, gte, lte, sum } from "drizzle-orm";

interface ReportFilters {
  startDate?: Date;
  endDate?: Date;
  franchiseId?: string;
  planId?: string;
}

interface RevenueByPeriodRow {
  period: string;
  year: number;
  month: number;
  fees_total: number;
  royalties_total: number;
  total: number;
}

interface RevenueByPlanRow {
  plan_id: string;
  plan_name: string;
  franchises_count: number;
  fees_total: number;
  royalties_total: number;
  total: number;
}

interface RevenueByFranchiseRow {
  franchise_id: string;
  franchise_name: string;
  plan_name: string;
  fees_total: number;
  royalties_total: number;
  total: number;
}

interface RoyaltiesByCampaignRow {
  campaign_id: string;
  campaign_name: string;
  franchise_name: string;
  period: string;
  gross_profit: number;
  royalty_amount: number;
  royalty_rate: number;
}

interface DelinquencyRow {
  franchise_id: string;
  franchise_name: string;
  type: 'fee' | 'royalty' | 'invoice';
  amount: number;
  due_date: string;
  days_overdue: number;
}

class FranchiseReportService {
  async getRevenueByPeriod(filters?: ReportFilters): Promise<RevenueByPeriodRow[]> {
    const royalties = await db.select()
      .from(schema.franchise_royalties)
      .where(filters?.franchiseId ? eq(schema.franchise_royalties.franchise_id, filters.franchiseId) : undefined);

    const fees = await db.select()
      .from(schema.franchise_fees)
      .where(filters?.franchiseId ? eq(schema.franchise_fees.franchise_id, filters.franchiseId) : undefined);

    const periodMap: Record<string, { fees: number; royalties: number; year: number; month: number }> = {};

    for (const royalty of royalties) {
      if (royalty.status !== 'paid') continue;
      const key = `${royalty.period_year}-${String(royalty.period_month).padStart(2, '0')}`;
      if (!periodMap[key]) {
        periodMap[key] = { fees: 0, royalties: 0, year: royalty.period_year, month: royalty.period_month };
      }
      periodMap[key].royalties += parseFloat(royalty.royalty_amount);
    }

    for (const fee of fees) {
      if (fee.status !== 'paid' || !fee.paid_at) continue;
      const paidDate = new Date(fee.paid_at);
      const year = paidDate.getFullYear();
      const month = paidDate.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!periodMap[key]) {
        periodMap[key] = { fees: 0, royalties: 0, year, month };
      }
      periodMap[key].fees += parseFloat(fee.amount_usd);
    }

    return Object.entries(periodMap)
      .map(([period, data]) => ({
        period,
        year: data.year,
        month: data.month,
        fees_total: data.fees,
        royalties_total: data.royalties,
        total: data.fees + data.royalties,
      }))
      .sort((a, b) => b.period.localeCompare(a.period));
  }

  async getRevenueByPlan(): Promise<RevenueByPlanRow[]> {
    const franchises = await db.select()
      .from(schema.franchises)
      .leftJoin(schema.franchise_plans, eq(schema.franchises.plan_id, schema.franchise_plans.id));

    const fees = await db.select()
      .from(schema.franchise_fees)
      .where(eq(schema.franchise_fees.status, 'paid'));

    const royalties = await db.select()
      .from(schema.franchise_royalties)
      .where(eq(schema.franchise_royalties.status, 'paid'));

    const planMap: Record<string, { 
      plan_name: string; 
      franchises: Set<string>; 
      fees: number; 
      royalties: number 
    }> = {};

    for (const row of franchises) {
      const planId = row.franchises.plan_id;
      if (!planId) continue;
      if (!planMap[planId]) {
        planMap[planId] = { 
          plan_name: row.franchise_plans?.name || 'Unknown', 
          franchises: new Set(), 
          fees: 0, 
          royalties: 0 
        };
      }
      planMap[planId].franchises.add(row.franchises.id);
    }

    for (const fee of fees) {
      const franchise = franchises.find(f => f.franchises.id === fee.franchise_id);
      if (franchise?.franchises.plan_id && planMap[franchise.franchises.plan_id]) {
        planMap[franchise.franchises.plan_id].fees += parseFloat(fee.amount_usd);
      }
    }

    for (const royalty of royalties) {
      const franchise = franchises.find(f => f.franchises.id === royalty.franchise_id);
      if (franchise?.franchises.plan_id && planMap[franchise.franchises.plan_id]) {
        planMap[franchise.franchises.plan_id].royalties += parseFloat(royalty.royalty_amount);
      }
    }

    return Object.entries(planMap).map(([plan_id, data]) => ({
      plan_id,
      plan_name: data.plan_name,
      franchises_count: data.franchises.size,
      fees_total: data.fees,
      royalties_total: data.royalties,
      total: data.fees + data.royalties,
    }));
  }

  async getRevenueByFranchise(): Promise<RevenueByFranchiseRow[]> {
    const franchises = await db.select()
      .from(schema.franchises)
      .leftJoin(schema.franchise_plans, eq(schema.franchises.plan_id, schema.franchise_plans.id));

    const fees = await db.select()
      .from(schema.franchise_fees)
      .where(eq(schema.franchise_fees.status, 'paid'));

    const royalties = await db.select()
      .from(schema.franchise_royalties)
      .where(eq(schema.franchise_royalties.status, 'paid'));

    const franchiseMap: Record<string, { 
      franchise_name: string; 
      plan_name: string; 
      fees: number; 
      royalties: number 
    }> = {};

    for (const row of franchises) {
      franchiseMap[row.franchises.id] = {
        franchise_name: row.franchises.name,
        plan_name: row.franchise_plans?.name || 'N/A',
        fees: 0,
        royalties: 0,
      };
    }

    for (const fee of fees) {
      if (franchiseMap[fee.franchise_id]) {
        franchiseMap[fee.franchise_id].fees += parseFloat(fee.amount_usd);
      }
    }

    for (const royalty of royalties) {
      if (franchiseMap[royalty.franchise_id]) {
        franchiseMap[royalty.franchise_id].royalties += parseFloat(royalty.royalty_amount);
      }
    }

    return Object.entries(franchiseMap)
      .map(([franchise_id, data]) => ({
        franchise_id,
        franchise_name: data.franchise_name,
        plan_name: data.plan_name,
        fees_total: data.fees,
        royalties_total: data.royalties,
        total: data.fees + data.royalties,
      }))
      .sort((a, b) => b.total - a.total);
  }

  async getRoyaltiesByCampaign(): Promise<RoyaltiesByCampaignRow[]> {
    const royalties = await db.select()
      .from(schema.franchise_royalties)
      .leftJoin(schema.franchises, eq(schema.franchise_royalties.franchise_id, schema.franchises.id));

    const result: RoyaltiesByCampaignRow[] = [];
    
    for (const r of royalties) {
      const breakdown = r.franchise_royalties.campaign_breakdown as Array<{
        campaign_id: string;
        name: string;
        pnl: number;
        royalty: number;
      }> | null;
      
      if (breakdown && Array.isArray(breakdown)) {
        for (const campaign of breakdown) {
          result.push({
            campaign_id: campaign.campaign_id,
            campaign_name: campaign.name || `Campaign ${campaign.campaign_id.substring(0, 8)}`,
            franchise_name: r.franchises?.name || 'Unknown',
            period: `${r.franchise_royalties.period_month}/${r.franchise_royalties.period_year}`,
            gross_profit: campaign.pnl,
            royalty_amount: campaign.royalty,
            royalty_rate: parseFloat(r.franchise_royalties.royalty_percentage),
          });
        }
      } else {
        result.push({
          campaign_id: 'aggregate',
          campaign_name: 'All Campaigns',
          franchise_name: r.franchises?.name || 'Unknown',
          period: `${r.franchise_royalties.period_month}/${r.franchise_royalties.period_year}`,
          gross_profit: parseFloat(r.franchise_royalties.gross_pnl),
          royalty_amount: parseFloat(r.franchise_royalties.royalty_amount),
          royalty_rate: parseFloat(r.franchise_royalties.royalty_percentage),
        });
      }
    }
    
    return result.sort((a, b) => b.royalty_amount - a.royalty_amount);
  }

  async getDelinquencyReport(): Promise<DelinquencyRow[]> {
    const now = new Date();
    const result: DelinquencyRow[] = [];

    const fees = await db.select()
      .from(schema.franchise_fees)
      .leftJoin(schema.franchises, eq(schema.franchise_fees.franchise_id, schema.franchises.id))
      .where(eq(schema.franchise_fees.status, 'pending'));

    for (const row of fees) {
      if (row.franchise_fees.due_date && new Date(row.franchise_fees.due_date) < now) {
        const dueDate = new Date(row.franchise_fees.due_date);
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        result.push({
          franchise_id: row.franchise_fees.franchise_id,
          franchise_name: row.franchises?.name || 'Unknown',
          type: 'fee',
          amount: parseFloat(row.franchise_fees.amount_usd),
          due_date: row.franchise_fees.due_date.toISOString().split('T')[0],
          days_overdue: daysOverdue,
        });
      }
    }

    const invoices = await db.select()
      .from(schema.franchise_invoices)
      .leftJoin(schema.franchises, eq(schema.franchise_invoices.franchise_id, schema.franchises.id))
      .where(eq(schema.franchise_invoices.status, 'sent'));

    for (const row of invoices) {
      if (row.franchise_invoices.due_date && new Date(row.franchise_invoices.due_date) < now) {
        const dueDate = new Date(row.franchise_invoices.due_date);
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        result.push({
          franchise_id: row.franchise_invoices.franchise_id,
          franchise_name: row.franchises?.name || 'Unknown',
          type: 'invoice',
          amount: parseFloat(row.franchise_invoices.total_amount),
          due_date: row.franchise_invoices.due_date.toISOString().split('T')[0],
          days_overdue: daysOverdue,
        });
      }
    }

    return result.sort((a, b) => b.days_overdue - a.days_overdue);
  }

  convertToCSV(data: Record<string, any>[], filename: string): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
      const values = headers.map(header => {
        const val = row[header];
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val ?? '';
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }
}

export const franchiseReportService = new FranchiseReportService();
