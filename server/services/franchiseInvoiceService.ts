import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

interface InvoiceLineItem {
  type: 'royalty' | 'fee';
  description: string;
  period?: string;
  amount: number;
  reference_id?: string;
}

class FranchiseInvoiceService {
  private generateInvoiceNumber(franchiseCode: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `INV-${franchiseCode}-${year}${month}-${random}`;
  }

  async generateRoyaltyInvoice(
    franchiseId: string,
    royaltyIds: string[]
  ): Promise<schema.FranchiseInvoice> {
    const franchise = await db.select()
      .from(schema.franchises)
      .where(eq(schema.franchises.id, franchiseId))
      .limit(1);

    if (franchise.length === 0) {
      throw new Error("Franchise not found");
    }

    const royalties = await db.select()
      .from(schema.franchise_royalties)
      .where(and(
        eq(schema.franchise_royalties.franchise_id, franchiseId),
        sql`${schema.franchise_royalties.id} = ANY(${royaltyIds})`
      ));

    if (royalties.length === 0) {
      throw new Error("No royalties found for invoice");
    }

    const lineItems: InvoiceLineItem[] = royalties.map(r => ({
      type: 'royalty' as const,
      description: `Royalty ${r.period_month}/${r.period_year}`,
      period: `${r.period_month}/${r.period_year}`,
      amount: parseFloat(r.royalty_amount),
      reference_id: r.id,
    }));

    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = 0;
    const totalAmount = subtotal + taxAmount;

    const periodStart = royalties.reduce((min, r) => {
      const date = new Date(r.period_year, r.period_month - 1, 1);
      return date < min ? date : min;
    }, new Date());
    
    const periodEnd = royalties.reduce((max, r) => {
      const date = new Date(r.period_year, r.period_month, 0);
      return date > max ? date : max;
    }, new Date(0));

    const franchiseCode = franchise[0].name.substring(0, 3).toUpperCase();
    const invoiceNumber = this.generateInvoiceNumber(franchiseCode);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 15);

    const [invoice] = await db.insert(schema.franchise_invoices)
      .values({
        franchise_id: franchiseId,
        invoice_number: invoiceNumber,
        invoice_type: 'royalty',
        period_start: periodStart,
        period_end: periodEnd,
        subtotal: subtotal.toFixed(2),
        tax_amount: taxAmount.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        status: 'draft',
        royalty_ids: royaltyIds,
        line_items: lineItems,
        due_date: dueDate,
      })
      .returning();

    for (const royaltyId of royaltyIds) {
      await db.update(schema.franchise_royalties)
        .set({ status: 'invoiced', updated_at: new Date() })
        .where(eq(schema.franchise_royalties.id, royaltyId));
    }

    return invoice;
  }

  async getInvoicesForFranchise(franchiseId: string): Promise<schema.FranchiseInvoice[]> {
    return db.select()
      .from(schema.franchise_invoices)
      .where(eq(schema.franchise_invoices.franchise_id, franchiseId))
      .orderBy(desc(schema.franchise_invoices.created_at));
  }

  async getAllInvoices(filters?: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<(schema.FranchiseInvoice & { franchise_name?: string })[]> {
    const conditions = [];
    
    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(schema.franchise_invoices.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(gte(schema.franchise_invoices.created_at, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(schema.franchise_invoices.created_at, filters.endDate));
    }

    const invoices = await db.select()
      .from(schema.franchise_invoices)
      .leftJoin(schema.franchises, eq(schema.franchise_invoices.franchise_id, schema.franchises.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.franchise_invoices.created_at));

    return invoices.map(row => ({
      ...row.franchise_invoices,
      franchise_name: row.franchises?.name,
    }));
  }

  async getInvoiceById(invoiceId: string): Promise<schema.FranchiseInvoice | null> {
    const result = await db.select()
      .from(schema.franchise_invoices)
      .where(eq(schema.franchise_invoices.id, invoiceId))
      .limit(1);
    return result[0] || null;
  }

  async updateInvoiceStatus(
    invoiceId: string,
    status: string,
    details?: {
      payment_method?: string;
      payment_reference?: string;
    }
  ): Promise<schema.FranchiseInvoice | null> {
    const updateData: any = {
      status,
      updated_at: new Date(),
    };

    if (status === 'sent') {
      updateData.sent_at = new Date();
      updateData.issued_at = new Date();
    }
    if (status === 'paid') {
      updateData.paid_at = new Date();
      if (details) {
        if (details.payment_method) updateData.payment_method = details.payment_method;
        if (details.payment_reference) updateData.payment_reference = details.payment_reference;
      }
    }

    const [updated] = await db.update(schema.franchise_invoices)
      .set(updateData)
      .where(eq(schema.franchise_invoices.id, invoiceId))
      .returning();

    if (updated && status === 'paid') {
      const royaltyIds = (updated.royalty_ids as string[]) || [];
      for (const royaltyId of royaltyIds) {
        await db.update(schema.franchise_royalties)
          .set({ 
            status: 'paid', 
            paid_at: new Date(),
            payment_method: details?.payment_method,
            payment_reference: details?.payment_reference,
            updated_at: new Date() 
          })
          .where(eq(schema.franchise_royalties.id, royaltyId));
      }
    }

    return updated || null;
  }

  async getInvoiceSummary(): Promise<{
    totalIssued: number;
    totalPaid: number;
    totalPending: number;
    totalOverdue: number;
    invoiceCount: number;
  }> {
    const invoices = await db.select()
      .from(schema.franchise_invoices);

    let totalIssued = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalOverdue = 0;

    const now = new Date();

    for (const invoice of invoices) {
      const amount = parseFloat(invoice.total_amount);
      totalIssued += amount;
      
      switch (invoice.status) {
        case 'paid':
          totalPaid += amount;
          break;
        case 'sent':
        case 'draft':
          if (invoice.due_date && new Date(invoice.due_date) < now) {
            totalOverdue += amount;
          } else {
            totalPending += amount;
          }
          break;
        case 'overdue':
          totalOverdue += amount;
          break;
      }
    }

    return {
      totalIssued,
      totalPaid,
      totalPending,
      totalOverdue,
      invoiceCount: invoices.length,
    };
  }
}

export const franchiseInvoiceService = new FranchiseInvoiceService();
