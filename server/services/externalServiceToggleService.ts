import { db } from "../db";
import { 
  external_service_settings, 
  external_service_audit_log,
  ExternalServiceSetting,
  InsertExternalServiceAuditLog 
} from "@shared/schema";
import { eq } from "drizzle-orm";

export type ServiceKey = 
  | "redis" 
  | "openai" 
  | "stripe" 
  | "kraken_rest" 
  | "kraken_websocket" 
  | "twitter";

export type ServiceCategory = "data" | "ai" | "payment" | "trading" | "social";
export type ServiceCriticality = "critical" | "important" | "optional";

interface ServiceDefinition {
  key: ServiceKey;
  name: string;
  description: string;
  category: ServiceCategory;
  criticality: ServiceCriticality;
  disabledMessage: string;
}

const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    key: "redis",
    name: "Redis (Upstash)",
    description: "Cache de dados de mercado e sessões. Quando desativado, o sistema usa fallback para banco de dados (mais lento).",
    category: "data",
    criticality: "important",
    disabledMessage: "Cache Redis desativado. O sistema está operando em modo degradado com maior latência.",
  },
  {
    key: "openai",
    name: "OpenAI (GPT-4)",
    description: "Análises de IA, pattern learning, e sugestões inteligentes. Funcionalidades de IA ficam indisponíveis quando desativado.",
    category: "ai",
    criticality: "optional",
    disabledMessage: "Funcionalidades de IA estão temporariamente indisponíveis.",
  },
  {
    key: "stripe",
    name: "Stripe Payments",
    description: "Processamento de pagamentos de franquias. Novos pagamentos ficam bloqueados quando desativado.",
    category: "payment",
    criticality: "critical",
    disabledMessage: "Sistema de pagamentos está temporariamente indisponível. Entre em contato com o suporte.",
  },
  {
    key: "kraken_rest",
    name: "Kraken API (REST)",
    description: "Execução de ordens e consulta de saldos. Trading ativo para quando desativado.",
    category: "trading",
    criticality: "critical",
    disabledMessage: "Trading está temporariamente indisponível. Ordens existentes permanecem ativas na exchange.",
  },
  {
    key: "kraken_websocket",
    name: "Kraken WebSocket",
    description: "Dados de mercado em tempo real. Quando desativado, dados podem ficar desatualizados.",
    category: "trading",
    criticality: "important",
    disabledMessage: "Dados de mercado em tempo real indisponíveis. Usando dados em cache.",
  },
  {
    key: "twitter",
    name: "Twitter/X API",
    description: "Feed de notícias e sentimento de mercado. Funcionalidade opcional.",
    category: "social",
    criticality: "optional",
    disabledMessage: "Feed de notícias do Twitter indisponível.",
  },
];

class ExternalServiceToggleService {
  private static instance: ExternalServiceToggleService;
  private cache: Map<ServiceKey, boolean> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 30000; // 30 seconds

  private constructor() {}

  static getInstance(): ExternalServiceToggleService {
    if (!ExternalServiceToggleService.instance) {
      ExternalServiceToggleService.instance = new ExternalServiceToggleService();
    }
    return ExternalServiceToggleService.instance;
  }

  async initializeServices(): Promise<void> {
    console.log("[ExternalServiceToggle] Initializing service settings...");
    
    for (const def of SERVICE_DEFINITIONS) {
      const existing = await db
        .select()
        .from(external_service_settings)
        .where(eq(external_service_settings.service_key, def.key))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(external_service_settings).values({
          service_key: def.key,
          service_name: def.name,
          description: def.description,
          category: def.category,
          criticality: def.criticality,
          is_enabled: true,
          disabled_message: def.disabledMessage,
        });
        console.log(`[ExternalServiceToggle] Created setting for: ${def.key}`);
      }
    }

    await this.refreshCache();
    console.log("[ExternalServiceToggle] Service settings initialized.");
  }

  private async refreshCache(): Promise<void> {
    const settings = await db.select().from(external_service_settings);
    
    this.cache.clear();
    for (const setting of settings) {
      this.cache.set(setting.service_key as ServiceKey, setting.is_enabled);
    }
    this.cacheTimestamp = Date.now();
  }

  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS;
  }

  async isServiceEnabled(serviceKey: ServiceKey): Promise<boolean> {
    if (this.isCacheValid() && this.cache.has(serviceKey)) {
      return this.cache.get(serviceKey) ?? true;
    }

    await this.refreshCache();
    return this.cache.get(serviceKey) ?? true;
  }

  isServiceEnabledSync(serviceKey: ServiceKey): boolean {
    return this.cache.get(serviceKey) ?? true;
  }

  async getAllServices(): Promise<ExternalServiceSetting[]> {
    return db.select().from(external_service_settings).orderBy(external_service_settings.category);
  }

  async getServiceByKey(serviceKey: ServiceKey): Promise<ExternalServiceSetting | null> {
    const [service] = await db
      .select()
      .from(external_service_settings)
      .where(eq(external_service_settings.service_key, serviceKey))
      .limit(1);
    
    return service || null;
  }

  async toggleService(
    serviceKey: ServiceKey,
    enabled: boolean,
    userId: string,
    reason?: string,
    ipAddress?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [currentSetting] = await db
        .select()
        .from(external_service_settings)
        .where(eq(external_service_settings.service_key, serviceKey))
        .limit(1);

      if (!currentSetting) {
        return { success: false, error: "Service not found" };
      }

      if (currentSetting.is_enabled === enabled) {
        return { success: true };
      }

      await db
        .update(external_service_settings)
        .set({
          is_enabled: enabled,
          last_changed_by: userId,
          last_changed_at: new Date(),
          change_reason: reason,
          updated_at: new Date(),
        })
        .where(eq(external_service_settings.service_key, serviceKey));

      const auditLog: InsertExternalServiceAuditLog = {
        service_key: serviceKey,
        previous_state: currentSetting.is_enabled,
        new_state: enabled,
        changed_by: userId,
        reason: reason,
        ip_address: ipAddress,
      };

      await db.insert(external_service_audit_log).values(auditLog);

      this.cache.set(serviceKey, enabled);

      const action = enabled ? "ENABLED" : "DISABLED";
      console.log(`[ExternalServiceToggle] Service ${serviceKey} ${action} by user ${userId}. Reason: ${reason || "No reason provided"}`);

      return { success: true };
    } catch (error) {
      console.error(`[ExternalServiceToggle] Error toggling service ${serviceKey}:`, error);
      return { success: false, error: "Failed to toggle service" };
    }
  }

  async getAuditLog(serviceKey?: ServiceKey, limit: number = 50): Promise<typeof external_service_audit_log.$inferSelect[]> {
    if (serviceKey) {
      return db
        .select()
        .from(external_service_audit_log)
        .where(eq(external_service_audit_log.service_key, serviceKey))
        .orderBy(external_service_audit_log.created_at)
        .limit(limit);
    }

    return db
      .select()
      .from(external_service_audit_log)
      .orderBy(external_service_audit_log.created_at)
      .limit(limit);
  }

  getServiceDefinitions(): ServiceDefinition[] {
    return SERVICE_DEFINITIONS;
  }

  async getServiceStatus(): Promise<Record<ServiceKey, { enabled: boolean; criticality: ServiceCriticality }>> {
    const services = await this.getAllServices();
    const status: Record<string, { enabled: boolean; criticality: ServiceCriticality }> = {};

    for (const service of services) {
      status[service.service_key] = {
        enabled: service.is_enabled,
        criticality: service.criticality as ServiceCriticality,
      };
    }

    return status as Record<ServiceKey, { enabled: boolean; criticality: ServiceCriticality }>;
  }
}

export const externalServiceToggleService = ExternalServiceToggleService.getInstance();

export async function checkServiceEnabled(serviceKey: ServiceKey): Promise<boolean> {
  return externalServiceToggleService.isServiceEnabled(serviceKey);
}

export function checkServiceEnabledSync(serviceKey: ServiceKey): boolean {
  return externalServiceToggleService.isServiceEnabledSync(serviceKey);
}
