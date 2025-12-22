import { db } from "../db";
import { 
  opportunity_triggers, 
  opportunity_trigger_events,
  opportunity_blueprints,
  users,
  type InsertOpportunityTrigger,
  type OpportunityTrigger,
  type InsertOpportunityTriggerEvent,
  type OpportunityBlueprint
} from "@shared/schema";
import { eq, and, gte, desc, lt, sql, count } from "drizzle-orm";

const CONFIG = {
  DEFAULT_COOLDOWN_MINUTES: 60,
  MAX_TRIGGERS_PER_DAY: 10,
  ALERT_SCORE_THRESHOLD: 75,
};

export type TriggerType = 'alert' | 'expiration' | 'accept' | 'creation' | 'block' | 'audit';

export interface TriggerConditions {
  score_min?: number;
  confidence_min?: number;
  regimes?: string[];
  types?: string[];
  assets_include?: string[];
  assets_exclude?: string[];
}

export interface TriggerActions {
  notify_whatsapp?: boolean;
  notify_email?: boolean;
  auto_accept?: boolean;
  log_to_audit?: boolean;
  custom_webhook_url?: string;
}

export interface CreateTriggerInput {
  userId: string;
  triggerType: TriggerType;
  name: string;
  description?: string;
  conditions: TriggerConditions;
  actions: TriggerActions;
  cooldownMinutes?: number;
  maxTriggersPerDay?: number;
}

export interface TriggerExecutionResult {
  success: boolean;
  eventId?: string;
  blocked?: boolean;
  blockReason?: string;
  error?: string;
}

export async function createTrigger(input: CreateTriggerInput): Promise<OpportunityTrigger> {
  const [trigger] = await db.insert(opportunity_triggers).values({
    user_id: input.userId,
    trigger_type: input.triggerType,
    name: input.name,
    description: input.description,
    conditions: input.conditions,
    actions: input.actions,
    cooldown_minutes: input.cooldownMinutes ?? CONFIG.DEFAULT_COOLDOWN_MINUTES,
    max_triggers_per_day: input.maxTriggersPerDay ?? CONFIG.MAX_TRIGGERS_PER_DAY,
    is_active: true,
  }).returning();
  
  console.log(`[OpportunityTrigger] Created trigger ${trigger.id} - Type: ${trigger.trigger_type}`);
  return trigger;
}

export async function getUserTriggers(userId: string): Promise<OpportunityTrigger[]> {
  return db
    .select()
    .from(opportunity_triggers)
    .where(eq(opportunity_triggers.user_id, userId))
    .orderBy(desc(opportunity_triggers.created_at));
}

export async function getTriggerById(triggerId: string, userId: string): Promise<OpportunityTrigger | null> {
  const [trigger] = await db
    .select()
    .from(opportunity_triggers)
    .where(
      and(
        eq(opportunity_triggers.id, triggerId),
        eq(opportunity_triggers.user_id, userId)
      )
    );
  return trigger || null;
}

export async function updateTrigger(
  triggerId: string, 
  userId: string, 
  updates: Partial<InsertOpportunityTrigger>
): Promise<OpportunityTrigger | null> {
  const [updated] = await db
    .update(opportunity_triggers)
    .set({ ...updates, updated_at: new Date() })
    .where(
      and(
        eq(opportunity_triggers.id, triggerId),
        eq(opportunity_triggers.user_id, userId)
      )
    )
    .returning();
  return updated || null;
}

export async function deleteTrigger(triggerId: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(opportunity_triggers)
    .where(
      and(
        eq(opportunity_triggers.id, triggerId),
        eq(opportunity_triggers.user_id, userId)
      )
    )
    .returning({ id: opportunity_triggers.id });
  return result.length > 0;
}

export async function toggleTrigger(triggerId: string, userId: string, isActive: boolean): Promise<boolean> {
  const result = await db
    .update(opportunity_triggers)
    .set({ is_active: isActive, updated_at: new Date() })
    .where(
      and(
        eq(opportunity_triggers.id, triggerId),
        eq(opportunity_triggers.user_id, userId)
      )
    )
    .returning({ id: opportunity_triggers.id });
  return result.length > 0;
}

export async function evaluateTriggers(blueprint: OpportunityBlueprint): Promise<TriggerExecutionResult[]> {
  const results: TriggerExecutionResult[] = [];
  
  const triggers = await db
    .select()
    .from(opportunity_triggers)
    .where(
      and(
        eq(opportunity_triggers.user_id, blueprint.user_id),
        eq(opportunity_triggers.is_active, true)
      )
    );
  
  for (const trigger of triggers) {
    const result = await executeTrigger(trigger, blueprint);
    results.push(result);
  }
  
  return results;
}

async function executeTrigger(
  trigger: OpportunityTrigger, 
  blueprint: OpportunityBlueprint
): Promise<TriggerExecutionResult> {
  const startTime = Date.now();
  
  try {
    const rateCheck = await checkTriggerRateLimit(trigger);
    if (!rateCheck.allowed) {
      return await logTriggerEvent(trigger, blueprint, 'rate_limited', {
        blocked: true,
        blockReason: rateCheck.reason,
        processingTimeMs: Date.now() - startTime
      });
    }
    
    const conditions = trigger.conditions as TriggerConditions;
    if (!evaluateConditions(conditions, blueprint)) {
      return {
        success: true,
        blocked: true,
        blockReason: 'Conditions not met'
      };
    }
    
    const actions = trigger.actions as TriggerActions;
    const eventData: Record<string, any> = {};
    
    if (actions.notify_whatsapp) {
      eventData.whatsapp_queued = true;
    }
    
    if (actions.notify_email) {
      eventData.email_queued = true;
    }
    
    if (actions.log_to_audit) {
      eventData.audit_logged = true;
    }
    
    await db.update(opportunity_triggers)
      .set({
        trigger_count: sql`${opportunity_triggers.trigger_count} + 1`,
        last_triggered_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(opportunity_triggers.id, trigger.id));
    
    return await logTriggerEvent(trigger, blueprint, 'success', {
      eventData,
      processingTimeMs: Date.now() - startTime
    });
    
  } catch (error: any) {
    console.error(`[OpportunityTrigger] Execution error for trigger ${trigger.id}:`, error.message);
    return await logTriggerEvent(trigger, blueprint, 'failed', {
      errorMessage: error.message,
      processingTimeMs: Date.now() - startTime
    });
  }
}

function evaluateConditions(conditions: TriggerConditions, blueprint: OpportunityBlueprint): boolean {
  if (conditions.score_min !== undefined) {
    if (blueprint.opportunity_score < conditions.score_min) return false;
  }
  
  if (conditions.confidence_min !== undefined) {
    if (parseFloat(blueprint.confidence) < conditions.confidence_min) return false;
  }
  
  if (conditions.regimes && conditions.regimes.length > 0) {
    if (!conditions.regimes.includes(blueprint.regime)) return false;
  }
  
  if (conditions.types && conditions.types.length > 0) {
    if (!conditions.types.includes(blueprint.type)) return false;
  }
  
  if (conditions.assets_include && conditions.assets_include.length > 0) {
    const hasIncludedAsset = blueprint.assets.some(a => conditions.assets_include!.includes(a));
    if (!hasIncludedAsset) return false;
  }
  
  if (conditions.assets_exclude && conditions.assets_exclude.length > 0) {
    const hasExcludedAsset = blueprint.assets.some(a => conditions.assets_exclude!.includes(a));
    if (hasExcludedAsset) return false;
  }
  
  return true;
}

async function checkTriggerRateLimit(trigger: OpportunityTrigger): Promise<{ allowed: boolean; reason?: string }> {
  if (trigger.last_triggered_at) {
    const cooldownEnd = new Date(trigger.last_triggered_at);
    cooldownEnd.setMinutes(cooldownEnd.getMinutes() + trigger.cooldown_minutes);
    
    if (new Date() < cooldownEnd) {
      const remainingMinutes = Math.ceil((cooldownEnd.getTime() - Date.now()) / 60000);
      return { 
        allowed: false, 
        reason: `Cooldown ativo. Aguarde ${remainingMinutes} minutos.` 
      };
    }
  }
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayEvents = await db
    .select({ count: count() })
    .from(opportunity_trigger_events)
    .where(
      and(
        eq(opportunity_trigger_events.trigger_id, trigger.id),
        gte(opportunity_trigger_events.created_at, todayStart),
        eq(opportunity_trigger_events.status, 'success')
      )
    );
  
  if (todayEvents[0].count >= trigger.max_triggers_per_day) {
    return { 
      allowed: false, 
      reason: `Limite diário de ${trigger.max_triggers_per_day} gatilhos atingido.` 
    };
  }
  
  return { allowed: true };
}

async function logTriggerEvent(
  trigger: OpportunityTrigger,
  blueprint: OpportunityBlueprint,
  status: string,
  details: {
    eventData?: Record<string, any>;
    errorMessage?: string;
    blocked?: boolean;
    blockReason?: string;
    processingTimeMs?: number;
  }
): Promise<TriggerExecutionResult> {
  const eventType = mapTriggerTypeToEventType(trigger.trigger_type);
  
  const [event] = await db.insert(opportunity_trigger_events).values({
    trigger_id: trigger.id,
    blueprint_id: blueprint.id,
    user_id: trigger.user_id,
    event_type: eventType,
    status: status,
    event_data: details.eventData,
    error_message: details.errorMessage,
    processing_time_ms: details.processingTimeMs,
  }).returning();
  
  return {
    success: status === 'success',
    eventId: event.id,
    blocked: details.blocked,
    blockReason: details.blockReason,
    error: details.errorMessage
  };
}

function mapTriggerTypeToEventType(triggerType: string): string {
  const mapping: Record<string, string> = {
    'alert': 'alert_sent',
    'expiration': 'expiration_processed',
    'accept': 'accept_validated',
    'creation': 'campaign_created',
    'block': 'blocked',
    'audit': 'audit_logged'
  };
  return mapping[triggerType] || 'unknown';
}

export async function processAlertTriggers(blueprint: OpportunityBlueprint): Promise<void> {
  const alertTriggers = await db
    .select()
    .from(opportunity_triggers)
    .where(
      and(
        eq(opportunity_triggers.user_id, blueprint.user_id),
        eq(opportunity_triggers.trigger_type, 'alert'),
        eq(opportunity_triggers.is_active, true)
      )
    );
  
  for (const trigger of alertTriggers) {
    await executeTrigger(trigger, blueprint);
  }
}

export async function getTriggerEvents(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<any[]> {
  return db
    .select({
      id: opportunity_trigger_events.id,
      triggerId: opportunity_trigger_events.trigger_id,
      blueprintId: opportunity_trigger_events.blueprint_id,
      eventType: opportunity_trigger_events.event_type,
      status: opportunity_trigger_events.status,
      eventData: opportunity_trigger_events.event_data,
      errorMessage: opportunity_trigger_events.error_message,
      processingTimeMs: opportunity_trigger_events.processing_time_ms,
      createdAt: opportunity_trigger_events.created_at,
    })
    .from(opportunity_trigger_events)
    .where(eq(opportunity_trigger_events.user_id, userId))
    .orderBy(desc(opportunity_trigger_events.created_at))
    .limit(limit)
    .offset(offset);
}

export async function getTriggerStats(userId: string): Promise<{
  totalTriggers: number;
  activeTriggers: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
}> {
  const triggers = await db
    .select({
      isActive: opportunity_triggers.is_active,
      triggerCount: opportunity_triggers.trigger_count
    })
    .from(opportunity_triggers)
    .where(eq(opportunity_triggers.user_id, userId));
  
  const events = await db
    .select({
      status: opportunity_trigger_events.status
    })
    .from(opportunity_trigger_events)
    .where(eq(opportunity_trigger_events.user_id, userId));
  
  return {
    totalTriggers: triggers.length,
    activeTriggers: triggers.filter(t => t.isActive).length,
    totalExecutions: events.length,
    successfulExecutions: events.filter(e => e.status === 'success').length,
    failedExecutions: events.filter(e => e.status === 'failed').length
  };
}

export function createDefaultTriggers(userId: string): Promise<OpportunityTrigger[]> {
  const defaultTriggers: CreateTriggerInput[] = [
    {
      userId,
      triggerType: 'alert',
      name: 'Alerta de Alta Oportunidade',
      description: 'Notifica quando uma oportunidade com score >= 85 é detectada',
      conditions: { score_min: 85, confidence_min: 0.80 },
      actions: { notify_whatsapp: true, log_to_audit: true },
      cooldownMinutes: 30,
      maxTriggersPerDay: 5
    },
    {
      userId,
      triggerType: 'alert',
      name: 'Alerta de Oportunidade Padrão',
      description: 'Notifica quando qualquer oportunidade válida é detectada',
      conditions: { score_min: 75, confidence_min: 0.70 },
      actions: { log_to_audit: true },
      cooldownMinutes: 60,
      maxTriggersPerDay: 10
    }
  ];
  
  return Promise.all(defaultTriggers.map(t => createTrigger(t)));
}
