import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

export interface OnboardingStep {
  step: 'plan_selection' | 'contract' | 'payment' | 'approval';
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: Date;
}

export interface OnboardingState {
  franchiseId: string;
  currentStep: OnboardingStep['step'];
  steps: OnboardingStep[];
  franchise: schema.Franchise;
  plan: schema.FranchisePlan;
  fee?: schema.FranchiseFee;
}

class FranchiseOnboardingService {
  async startOnboarding(
    userId: string,
    planId: string,
    franchiseData: {
      name: string;
      cnpj?: string;
      tax_id?: string;
      tax_id_type?: string;
      address?: string;
      country?: string;
    }
  ): Promise<{ success: boolean; franchiseId?: string; error?: string }> {
    try {
      const [plan] = await db.select()
        .from(schema.franchise_plans)
        .where(and(
          eq(schema.franchise_plans.id, planId),
          eq(schema.franchise_plans.is_active, true)
        ))
        .limit(1);

      if (!plan) {
        return { success: false, error: 'Plano não encontrado ou inativo' };
      }

      const [franchise] = await db.insert(schema.franchises)
        .values({
          name: franchiseData.name,
          cnpj: franchiseData.cnpj,
          tax_id: franchiseData.tax_id,
          tax_id_type: franchiseData.tax_id_type,
          address: franchiseData.address,
          country: franchiseData.country || 'BRA',
          plan_id: planId,
          contract_start: new Date(),
          owner_user_id: userId,
          status: 'pending',
          onboarding_status: 'pending_contract',
          onboarding_started_at: new Date(),
        })
        .returning();

      await db.insert(schema.franchise_users)
        .values({
          franchise_id: franchise.id,
          user_id: userId,
          role: 'master',
          is_active: true,
          permissions: {
            view_reports: true,
            create_campaigns: true,
            manage_users: true,
            view_royalties: true,
            manage_settings: true,
          },
        });

      const feeAmount = parseFloat(String(plan.franchise_fee_usd || '0'));
      if (feeAmount > 0) {
        await db.insert(schema.franchise_fees)
          .values({
            franchise_id: franchise.id,
            plan_id: planId,
            fee_type: 'entry',
            amount_usd: String(feeAmount),
            status: 'pending',
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });
      }

      console.log(`[Onboarding] Started for franchise ${franchise.id} with plan ${plan.name}`);

      return { success: true, franchiseId: franchise.id };
    } catch (error: any) {
      console.error('[Onboarding] Start error:', error.message);
      return { success: false, error: `Erro ao iniciar onboarding: ${error.message}` };
    }
  }

  async getOnboardingState(franchiseId: string): Promise<OnboardingState | null> {
    const [franchise] = await db.select()
      .from(schema.franchises)
      .where(eq(schema.franchises.id, franchiseId))
      .limit(1);

    if (!franchise) return null;

    const [plan] = await db.select()
      .from(schema.franchise_plans)
      .where(eq(schema.franchise_plans.id, franchise.plan_id))
      .limit(1);

    if (!plan) return null;

    const [fee] = await db.select()
      .from(schema.franchise_fees)
      .where(and(
        eq(schema.franchise_fees.franchise_id, franchiseId),
        eq(schema.franchise_fees.fee_type, 'entry')
      ))
      .orderBy(desc(schema.franchise_fees.created_at))
      .limit(1);

    const steps: OnboardingStep[] = [
      {
        step: 'plan_selection',
        status: 'completed',
        completedAt: franchise.onboarding_started_at || undefined,
      },
      {
        step: 'contract',
        status: franchise.contract_accepted ? 'completed' : 
                (franchise.onboarding_status === 'pending_contract' ? 'in_progress' : 'pending'),
        completedAt: franchise.contract_accepted_at || undefined,
      },
      {
        step: 'payment',
        status: franchise.fee_paid ? 'completed' :
                (franchise.onboarding_status === 'pending_payment' ? 'in_progress' : 'pending'),
        completedAt: franchise.fee_paid_at || undefined,
      },
      {
        step: 'approval',
        status: franchise.onboarding_status === 'active' ? 'completed' :
                (franchise.onboarding_status === 'pending_approval' ? 'in_progress' : 'pending'),
        completedAt: franchise.onboarding_completed_at || undefined,
      },
    ];

    const currentStep = this.determineCurrentStep(franchise.onboarding_status);

    return {
      franchiseId,
      currentStep,
      steps,
      franchise,
      plan,
      fee,
    };
  }

  private determineCurrentStep(status: string): OnboardingStep['step'] {
    switch (status) {
      case 'pending_contract':
        return 'contract';
      case 'pending_payment':
        return 'payment';
      case 'pending_approval':
        return 'approval';
      default:
        return 'plan_selection';
    }
  }

  async acceptContract(
    franchiseId: string,
    userId: string,
    contractVersion: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [franchise] = await db.select()
        .from(schema.franchises)
        .where(eq(schema.franchises.id, franchiseId))
        .limit(1);

      if (!franchise) {
        return { success: false, error: 'Franquia não encontrada' };
      }

      if (franchise.contract_accepted) {
        return { success: false, error: 'Contrato já foi aceito' };
      }

      const [plan] = await db.select()
        .from(schema.franchise_plans)
        .where(eq(schema.franchise_plans.id, franchise.plan_id))
        .limit(1);

      const feeAmount = parseFloat(String(plan?.franchise_fee_usd || '0'));
      const nextStatus = feeAmount > 0 ? 'pending_payment' : 'pending_approval';

      await db.update(schema.franchises)
        .set({
          contract_accepted: true,
          contract_accepted_at: new Date(),
          contract_accepted_by: userId,
          contract_version: contractVersion,
          onboarding_status: nextStatus,
          updated_at: new Date(),
        })
        .where(eq(schema.franchises.id, franchiseId));

      console.log(`[Onboarding] Contract accepted for franchise ${franchiseId}`);

      return { success: true };
    } catch (error: any) {
      console.error('[Onboarding] Accept contract error:', error.message);
      return { success: false, error: `Erro ao aceitar contrato: ${error.message}` };
    }
  }

  async confirmPayment(
    franchiseId: string,
    paymentData: {
      payment_method: string;
      payment_reference: string;
      payment_gateway_id?: string;
    },
    processedBy?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [franchise] = await db.select()
        .from(schema.franchises)
        .where(eq(schema.franchises.id, franchiseId))
        .limit(1);

      if (!franchise) {
        return { success: false, error: 'Franquia não encontrada' };
      }

      if (franchise.fee_paid) {
        return { success: false, error: 'Pagamento já foi confirmado' };
      }

      const [fee] = await db.select()
        .from(schema.franchise_fees)
        .where(and(
          eq(schema.franchise_fees.franchise_id, franchiseId),
          eq(schema.franchise_fees.fee_type, 'entry'),
          eq(schema.franchise_fees.status, 'pending')
        ))
        .limit(1);

      if (fee) {
        await db.update(schema.franchise_fees)
          .set({
            status: 'paid',
            payment_method: paymentData.payment_method,
            payment_reference: paymentData.payment_reference,
            payment_gateway_id: paymentData.payment_gateway_id,
            paid_at: new Date(),
            processed_by: processedBy,
            updated_at: new Date(),
          })
          .where(eq(schema.franchise_fees.id, fee.id));
      }

      await db.update(schema.franchises)
        .set({
          fee_paid: true,
          fee_paid_at: new Date(),
          fee_payment_reference: paymentData.payment_reference,
          fee_payment_method: paymentData.payment_method,
          onboarding_status: 'pending_approval',
          updated_at: new Date(),
        })
        .where(eq(schema.franchises.id, franchiseId));

      console.log(`[Onboarding] Payment confirmed for franchise ${franchiseId}`);

      return { success: true };
    } catch (error: any) {
      console.error('[Onboarding] Confirm payment error:', error.message);
      return { success: false, error: `Erro ao confirmar pagamento: ${error.message}` };
    }
  }

  async approveFranchise(
    franchiseId: string,
    approvedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [franchise] = await db.select()
        .from(schema.franchises)
        .where(eq(schema.franchises.id, franchiseId))
        .limit(1);

      if (!franchise) {
        return { success: false, error: 'Franquia não encontrada' };
      }

      if (franchise.status === 'active') {
        return { success: false, error: 'Franquia já está ativa' };
      }

      if (!franchise.contract_accepted) {
        return { success: false, error: 'Contrato ainda não foi aceito' };
      }

      const [plan] = await db.select()
        .from(schema.franchise_plans)
        .where(eq(schema.franchise_plans.id, franchise.plan_id))
        .limit(1);

      const feeAmount = parseFloat(String(plan?.franchise_fee_usd || '0'));
      if (feeAmount > 0 && !franchise.fee_paid) {
        return { success: false, error: 'Taxa de franquia ainda não foi paga' };
      }

      await db.update(schema.franchises)
        .set({
          status: 'active',
          onboarding_status: 'active',
          onboarding_completed_at: new Date(),
          approved_by: approvedBy,
          approved_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(schema.franchises.id, franchiseId));

      console.log(`[Onboarding] Franchise ${franchiseId} approved by ${approvedBy}`);

      return { success: true };
    } catch (error: any) {
      console.error('[Onboarding] Approve error:', error.message);
      return { success: false, error: `Erro ao aprovar franquia: ${error.message}` };
    }
  }

  async rejectFranchise(
    franchiseId: string,
    rejectedBy: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await db.update(schema.franchises)
        .set({
          status: 'rejected',
          onboarding_status: 'rejected',
          rejection_reason: reason,
          updated_at: new Date(),
        })
        .where(eq(schema.franchises.id, franchiseId));

      console.log(`[Onboarding] Franchise ${franchiseId} rejected by ${rejectedBy}: ${reason}`);

      return { success: true };
    } catch (error: any) {
      console.error('[Onboarding] Reject error:', error.message);
      return { success: false, error: `Erro ao rejeitar franquia: ${error.message}` };
    }
  }

  async getPendingOnboardings(): Promise<schema.Franchise[]> {
    return db.select()
      .from(schema.franchises)
      .where(eq(schema.franchises.onboarding_status, 'pending_approval'))
      .orderBy(desc(schema.franchises.created_at));
  }

  async getAvailablePlans(): Promise<schema.FranchisePlan[]> {
    return db.select()
      .from(schema.franchise_plans)
      .where(eq(schema.franchise_plans.is_active, true))
      .orderBy(schema.franchise_plans.display_order);
  }
}

export const franchiseOnboardingService = new FranchiseOnboardingService();
