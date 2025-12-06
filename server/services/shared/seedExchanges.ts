import { storage } from "../../storage";
import type { InsertExchange } from "@shared/schema";

const exchanges: InsertExchange[] = [
  {
    id: "kraken",
    name: "Kraken",
    enabled: true,
    priority: 1,
  },
  {
    id: "okx",
    name: "OKX",
    enabled: false,
    priority: 2,
  },
  {
    id: "bybit",
    name: "Bybit",
    enabled: false,
    priority: 3,
  },
  {
    id: "kucoin",
    name: "KuCoin",
    enabled: false,
    priority: 4,
  },
];

export async function seedExchanges() {
  console.log("🌱 Seeding exchanges...");
  
  for (const exchange of exchanges) {
    try {
      const existing = await storage.getExchange(exchange.id);
      if (!existing) {
        await storage.createExchange(exchange);
        console.log(`✅ Created exchange: ${exchange.name}`);
      } else {
        console.log(`⏭️  Exchange ${exchange.name} already exists`);
      }
    } catch (error) {
      console.error(`❌ Failed to seed exchange ${exchange.name}:`, error);
    }
  }
  
  console.log("✅ Exchange seeding complete");
}
