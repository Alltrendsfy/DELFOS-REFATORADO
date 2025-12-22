import { getUncachableStripeClient } from './stripeClient';
import { db } from '../../db';
import { franchise_leads, franchise_plans } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class FranchisePaymentService {
  async createCheckoutSession(
    leadId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();

    const [plan] = await db.select().from(franchise_plans).where(eq(franchise_plans.id, planId));
    if (!plan) {
      throw new Error('Plan not found');
    }

    const [lead] = await db.select().from(franchise_leads).where(eq(franchise_leads.id, leadId));
    if (!lead) {
      throw new Error('Franchise lead not found');
    }

    const amountCents = Math.round(parseFloat(plan.franchise_fee_usd || '0') * 100);

    if (amountCents <= 0) {
      throw new Error('Plan has no franchise fee configured');
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: `DELFOS Franchise - ${plan.name}`,
              description: `Franchise plan: ${plan.name}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}&lead_id=${leadId}`,
      cancel_url: `${cancelUrl}?lead_id=${leadId}`,
      customer_email: lead.email,
      metadata: {
        lead_id: leadId,
        plan_id: planId,
        franchise_code: lead.franchise_code,
      },
      payment_intent_data: {
        metadata: {
          lead_id: leadId,
          plan_id: planId,
          franchise_code: lead.franchise_code,
        },
      },
    });

    await db.update(franchise_leads)
      .set({
        stripe_checkout_session_id: session.id,
        payment_amount_cents: amountCents,
        payment_currency: 'BRL',
        updated_at: new Date(),
      })
      .where(eq(franchise_leads.id, leadId));

    return session;
  }

  async handlePaymentSuccess(sessionId: string): Promise<void> {
    const stripe = await getUncachableStripeClient();
    
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    if (session.payment_status !== 'paid') {
      console.log(`[FranchisePayment] Session ${sessionId} not paid yet`);
      return;
    }

    const leadId = session.metadata?.lead_id;
    if (!leadId) {
      console.error(`[FranchisePayment] No lead_id in session metadata`);
      return;
    }

    const paymentIntent = session.payment_intent as any;

    await db.update(franchise_leads)
      .set({
        payment_status: 'paid',
        stripe_payment_intent_id: paymentIntent?.id,
        stripe_customer_id: session.customer as string,
        payment_method: paymentIntent?.payment_method_types?.[0] || 'card',
        paid_at: new Date(),
        payment_receipt_url: paymentIntent?.charges?.data?.[0]?.receipt_url,
        updated_at: new Date(),
      })
      .where(eq(franchise_leads.id, leadId));

    await this.checkAndAutoPreApprove(leadId);
  }

  async checkAndAutoPreApprove(leadId: string): Promise<boolean> {
    const [lead] = await db.select().from(franchise_leads).where(eq(franchise_leads.id, leadId));
    
    if (!lead) return false;

    const documentsUploaded = lead.documents_uploaded || 
      (Array.isArray(lead.documents_urls) && lead.documents_urls.length > 0);
    const paymentConfirmed = lead.payment_status === 'paid';

    if (documentsUploaded && paymentConfirmed && !lead.auto_pre_approved) {
      await db.update(franchise_leads)
        .set({
          auto_pre_approved: true,
          pre_approved_at: new Date(),
          status: 'pre_approved',
          updated_at: new Date(),
        })
        .where(eq(franchise_leads.id, leadId));

      console.log(`[FranchisePayment] Lead ${leadId} auto pre-approved (docs + payment confirmed)`);
      return true;
    }

    return false;
  }

  async verifyPaymentStatus(leadId: string): Promise<{ status: string; paid: boolean }> {
    const [lead] = await db.select().from(franchise_leads).where(eq(franchise_leads.id, leadId));
    
    if (!lead) {
      throw new Error('Lead not found');
    }

    return {
      status: lead.payment_status,
      paid: lead.payment_status === 'paid',
    };
  }
}

export const franchisePaymentService = new FranchisePaymentService();
