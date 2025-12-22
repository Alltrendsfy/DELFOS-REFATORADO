import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

class FranchiseFeeService {
  async createFee(data: {
    franchise_id: string;
    plan_id: string;
    fee_type: string;
    amount_usd: number;
    currency?: string;
    due_date?: Date;
  }): Promise<schema.FranchiseFee> {
    const [fee] = await db.insert(schema.franchise_fees)
      .values({
        franchise_id: data.franchise_id,
        plan_id: data.plan_id,
        fee_type: data.fee_type,
        amount_usd: data.amount_usd.toFixed(2),
        currency: data.currency || 'USD',
        status: 'pending',
        due_date: data.due_date,
      })
      .returning();
    return fee;
  }

  async getFeesForFranchise(franchiseId: string): Promise<schema.FranchiseFee[]> {
    return db.select()
      .from(schema.franchise_fees)
      .where(eq(schema.franchise_fees.franchise_id, franchiseId))
      .orderBy(desc(schema.franchise_fees.created_at));
  }

  async getAllFees(filters?: {
    status?: string;
    fee_type?: string;
  }): Promise<(schema.FranchiseFee & { franchise_name?: string })[]> {
    const conditions = [];
    
    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(schema.franchise_fees.status, filters.status));
    }
    if (filters?.fee_type && filters.fee_type !== 'all') {
      conditions.push(eq(schema.franchise_fees.fee_type, filters.fee_type));
    }

    const fees = await db.select()
      .from(schema.franchise_fees)
      .leftJoin(schema.franchises, eq(schema.franchise_fees.franchise_id, schema.franchises.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.franchise_fees.created_at));

    return fees.map(row => ({
      ...row.franchise_fees,
      franchise_name: row.franchises?.name,
    }));
  }

  async getFeeById(feeId: string): Promise<schema.FranchiseFee | null> {
    const result = await db.select()
      .from(schema.franchise_fees)
      .where(eq(schema.franchise_fees.id, feeId))
      .limit(1);
    return result[0] || null;
  }

  async updateFeeStatus(
    feeId: string,
    status: string,
    details?: {
      payment_method?: string;
      payment_reference?: string;
      payment_gateway_id?: string;
    }
  ): Promise<schema.FranchiseFee | null> {
    const updateData: any = {
      status,
      updated_at: new Date(),
    };

    if (status === 'paid') {
      updateData.paid_at = new Date();
      if (details) {
        if (details.payment_method) updateData.payment_method = details.payment_method;
        if (details.payment_reference) updateData.payment_reference = details.payment_reference;
        if (details.payment_gateway_id) updateData.payment_gateway_id = details.payment_gateway_id;
      }
    }

    if (status === 'refunded') {
      updateData.refunded_at = new Date();
    }

    const [updated] = await db.update(schema.franchise_fees)
      .set(updateData)
      .where(eq(schema.franchise_fees.id, feeId))
      .returning();

    return updated || null;
  }

  async getFeeSummary(): Promise<{
    totalReceived: number;
    totalPending: number;
    totalOverdue: number;
    feesByType: { type: string; count: number; total: number }[];
  }> {
    const fees = await db.select()
      .from(schema.franchise_fees);

    let totalReceived = 0;
    let totalPending = 0;
    let totalOverdue = 0;
    const feesByType: Record<string, { count: number; total: number }> = {};

    const now = new Date();

    for (const fee of fees) {
      const amount = parseFloat(fee.amount_usd);
      
      if (!feesByType[fee.fee_type]) {
        feesByType[fee.fee_type] = { count: 0, total: 0 };
      }
      feesByType[fee.fee_type].count++;
      feesByType[fee.fee_type].total += amount;
      
      switch (fee.status) {
        case 'paid':
          totalReceived += amount;
          break;
        case 'pending':
        case 'processing':
          if (fee.due_date && new Date(fee.due_date) < now) {
            totalOverdue += amount;
          } else {
            totalPending += amount;
          }
          break;
      }
    }

    return {
      totalReceived,
      totalPending,
      totalOverdue,
      feesByType: Object.entries(feesByType).map(([type, data]) => ({
        type,
        count: data.count,
        total: data.total,
      })),
    };
  }

  async createEntryFeeForFranchise(franchiseId: string, planId: string): Promise<schema.FranchiseFee | null> {
    const plan = await db.select()
      .from(schema.franchise_plans)
      .where(eq(schema.franchise_plans.id, planId))
      .limit(1);

    if (plan.length === 0) {
      return null;
    }

    const version = await db.select()
      .from(schema.franchise_plan_versions)
      .where(and(
        eq(schema.franchise_plan_versions.plan_id, planId),
        eq(schema.franchise_plan_versions.is_active, true)
      ))
      .limit(1);

    if (version.length === 0) {
      return null;
    }

    const entryFee = parseFloat(version[0].entry_fee_usd || '0');
    if (entryFee <= 0) {
      return null;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    return this.createFee({
      franchise_id: franchiseId,
      plan_id: planId,
      fee_type: 'entry',
      amount_usd: entryFee,
      due_date: dueDate,
    });
  }
}

export const franchiseFeeService = new FranchiseFeeService();
