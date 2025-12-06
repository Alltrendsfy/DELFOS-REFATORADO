import { storage } from "../../storage.js";

/**
 * Seed fees_tables with Kraken fee structure and slippage estimates
 * 
 * Fee Structure (Kraken):
 * - Maker: 0.16% (0.0016)
 * - Taker: 0.26% (0.0026)
 * 
 * Slippage estimates by spread tier:
 * - Tier 1 (0.1-0.4% spread): 0.02% avg slippage
 * - Tier 2 (0.4-1.2% spread): 0.05% avg slippage  
 * - Tier 3 (1.2-3.5% spread): 0.10% avg slippage
 */

export async function seedFees() {
  console.log("🔧 Seeding fees_tables with Kraken fee structure...");

  try {
    // Get Kraken exchange ID
    const exchanges = await storage.getAllExchanges();
    const kraken = exchanges.find(ex => ex.name.toLowerCase() === "kraken");
    
    if (!kraken) {
      console.error("❌ Kraken exchange not found in database");
      return;
    }

    // Default fees for all Kraken symbols
    await storage.upsertFee({
      exchange_id: kraken.id,
      symbol: null, // NULL = applies to all symbols by default
      maker_fee_pct: "0.0016", // 0.16%
      taker_fee_pct: "0.0026", // 0.26%
      avg_slippage_pct: "0.0005", // 0.05% (conservative default)
    });

    console.log("✅ Default Kraken fees seeded (maker: 0.16%, taker: 0.26%, slippage: 0.05%)");

    // Symbol-specific slippage overrides based on spread tiers
    // We'll set better slippage estimates for major pairs with tight spreads
    
    // Tier 1 major pairs (very tight spreads, minimal slippage)
    const tier1Pairs = [
      "BTC/USD",
      "ETH/USD", 
      "USDT/USD",
      "DAI/USD",
    ];

    for (const symbol of tier1Pairs) {
      await storage.upsertFee({
        exchange_id: kraken.id,
        symbol,
        maker_fee_pct: "0.0016",
        taker_fee_pct: "0.0026",
        avg_slippage_pct: "0.0002", // 0.02% - very low slippage
      });
    }

    console.log(`✅ Tier 1 fees seeded for ${tier1Pairs.length} major pairs (slippage: 0.02%)`);

    // Tier 3 pairs (wider spreads, higher slippage)
    const tier3Pairs = [
      "FLOKI/USD",
      "WIF/USD",
      "PEPE/USD",
      "BONK/USD",
    ];

    for (const symbol of tier3Pairs) {
      await storage.upsertFee({
        exchange_id: kraken.id,
        symbol,
        maker_fee_pct: "0.0016",
        taker_fee_pct: "0.0026",
        avg_slippage_pct: "0.0010", // 0.10% - higher slippage
      });
    }

    console.log(`✅ Tier 3 fees seeded for ${tier3Pairs.length} volatile pairs (slippage: 0.10%)`);
    console.log("🎉 Fees seeding completed successfully!");

  } catch (error) {
    console.error("❌ Error seeding fees:", error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedFees()
    .then(() => {
      console.log("✅ Seeding completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Seeding failed:", error);
      process.exit(1);
    });
}
