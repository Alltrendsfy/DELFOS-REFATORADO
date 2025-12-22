import { getCircuitBreakerService } from "./circuitBreakerService";
import { franchiseRoyaltyService } from "./franchiseRoyaltyService";
import { storage } from "../storage";
import { db } from "../db";
import { franchise_royalties } from "@shared/schema";
import { and, eq } from "drizzle-orm";

class SchedulerService {
  private circuitBreakerService: CircuitBreakerService;
  private autoResetInterval: NodeJS.Timeout | null = null;
  private monthlyRoyaltyInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly AUTO_RESET_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MONTHLY_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.circuitBreakerService = getCircuitBreakerService(storage);
  }

  start(): void {
    if (this.isRunning) {
      console.log("⏭️  Scheduler Service already running");
      return;
    }

    console.log(`📅 Starting Scheduler Service...`);
    console.log(`⏰ Auto-reset check interval: ${this.AUTO_RESET_INTERVAL_MS / 1000}s`);
    console.log(`📊 Monthly royalty check interval: ${this.MONTHLY_CHECK_INTERVAL_MS / 1000}s`);

    this.autoResetInterval = setInterval(async () => {
      try {
        await this.runAutoReset();
      } catch (error) {
        console.error("❌ Error running auto-reset:", error);
      }
    }, this.AUTO_RESET_INTERVAL_MS);

    this.monthlyRoyaltyInterval = setInterval(async () => {
      try {
        await this.checkMonthlyRoyaltyCalculation();
      } catch (error) {
        console.error("❌ Error checking monthly royalty:", error);
      }
    }, this.MONTHLY_CHECK_INTERVAL_MS);

    this.checkMonthlyRoyaltyCalculation();

    this.isRunning = true;
    console.log("✅ Scheduler Service started");
  }

  stop(): void {
    if (this.autoResetInterval) {
      clearInterval(this.autoResetInterval);
      this.autoResetInterval = null;
    }
    if (this.monthlyRoyaltyInterval) {
      clearInterval(this.monthlyRoyaltyInterval);
      this.monthlyRoyaltyInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 Scheduler Service stopped");
  }

  private async runAutoReset(): Promise<void> {
    console.log("⏰ Running auto-reset check...");
    const startTime = Date.now();

    try {
      await this.circuitBreakerService.processAutoResets();
      const duration = Date.now() - startTime;
      console.log(`✅ Auto-reset check completed in ${duration}ms`);
    } catch (error) {
      console.error("❌ Auto-reset check failed:", error);
      throw error;
    }
  }

  private async checkMonthlyRoyaltyCalculation(): Promise<void> {
    const now = new Date();
    const currentDay = now.getUTCDate();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();

    if (currentDay !== 1) {
      return;
    }

    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    // Check database to see if royalties were already calculated for this period
    // This persists across restarts to prevent double-charging
    try {
      const existingRoyalties = await db.select({ id: franchise_royalties.id })
        .from(franchise_royalties)
        .where(and(
          eq(franchise_royalties.period_month, previousMonth),
          eq(franchise_royalties.period_year, previousYear)
        ))
        .limit(1);

      if (existingRoyalties.length > 0) {
        // Royalties already calculated for this period, skip
        return;
      }
    } catch (error) {
      console.error("❌ Error checking existing royalties:", error);
      return; // Don't proceed if we can't verify
    }

    console.log(`📊 Running monthly royalty calculation for ${previousMonth}/${previousYear}...`);
    const startTime = Date.now();

    try {
      const result = await franchiseRoyaltyService.calculateAllFranchisesRoyalties(previousYear, previousMonth);
      
      const duration = Date.now() - startTime;
      console.log(`✅ Monthly royalty calculation completed in ${duration}ms`);
      console.log(`   - Calculated: ${result.calculated} franchises`);
      console.log(`   - Skipped: ${result.skipped} franchises (no activity)`);
      if (result.errors.length > 0) {
        console.log(`   - Errors: ${result.errors.length}`);
        result.errors.forEach(err => console.error(`     ❌ ${err}`));
      }
    } catch (error) {
      console.error("❌ Monthly royalty calculation failed:", error);
      throw error;
    }
  }

  async runOnce(): Promise<void> {
    await this.runAutoReset();
  }

  async forceMonthlyRoyaltyRun(year: number, month: number): Promise<{
    calculated: number;
    skipped: number;
    errors: string[];
  }> {
    console.log(`📊 Force running monthly royalty calculation for ${month}/${year}...`);
    return franchiseRoyaltyService.calculateAllFranchisesRoyalties(year, month);
  }
}

export const schedulerService = new SchedulerService();
