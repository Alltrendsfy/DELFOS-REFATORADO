import type { Express } from "express";
import { createServer, type Server } from "http";
import cookieParser from "cookie-parser";
import { setupAuth } from "./replitAuth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerRBMRoutes } from "./routes/rbmRoutes";
import { registerFranchiseRoutes } from "./routes/franchise";
import { registerTradingRoutes } from "./routes/trading";
import { registerAdminRoutes } from "./routes/admin";
import { registerBacktestRoutes } from "./routes/backtest";
import { registerGitHubRoutes } from "./routes/github";
import { registerPaymentRoutes } from "./routes/payments";
import { registerMarketRoutes } from "./routes/market";
import { registerAuthRoutes } from "./routes/auth";
import { registerSystemRoutes } from "./routes/system";
import { registerAiRoutes } from "./routes/ai";
import { db } from "./db";
import { franchisor_users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcryptjs from "bcryptjs";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup cookie parser middleware for persona authentication sessions
  app.use(cookieParser());

  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);
  registerRBMRoutes(app);
  registerFranchiseRoutes(app);
  registerTradingRoutes(app);
  registerAdminRoutes(app);
  registerBacktestRoutes(app);
  registerGitHubRoutes(app);
  registerPaymentRoutes(app);
  registerMarketRoutes(app);
  registerAuthRoutes(app);
  registerSystemRoutes(app);
  registerAiRoutes(app);

  // Setup Replit Auth
  await setupAuth(app);

  // Seed franchisor users (create if not exists)
  try {
    const existingFranchisor = await db.select().from(franchisor_users).where(eq(franchisor_users.email, 'itopaiva@hotmail.com')).limit(1);
    if (existingFranchisor.length === 0) {
      const passwordHash = await bcryptjs.hash('123456', 10);
      await db.insert(franchisor_users).values({
        email: 'itopaiva@hotmail.com',
        password_hash: passwordHash,
        name: 'RODERICO PAIXÃO LIMA',
        cpf_cnpj: '343.915.413-00',
        phone: '99-98214-8668',
        role_title: 'SÓCIO PROPRIETÁRIO',
        is_active: true,
      });
      console.log('✅ Franchisor user seeded: itopaiva@hotmail.com / 123456');
      console.log('   Nome: RODERICO PAIXÃO LIMA');
      console.log('   CPF: 343.915.413-00');
      console.log('   Telefone: 99-98214-8668');
      console.log('   Cargo: SÓCIO PROPRIETÁRIO');
    }
  } catch (error) {
    console.log('[Seed] Franchisor users table may not exist yet or seed failed (this is OK on first run)');
  }

  const httpServer = createServer(app);
  return httpServer;
}
