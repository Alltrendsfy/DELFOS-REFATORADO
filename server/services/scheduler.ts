import { getCircuitBreakerService } from "./circuitBreakerService";
import { storage } from "../storage";

class SchedulerService {
  private circuitBreakerService: CircuitBreakerService;
  private autoResetInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly AUTO_RESET_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

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

    this.autoResetInterval = setInterval(async () => {
      try {
        await this.runAutoReset();
      } catch (error) {
        console.error("❌ Error running auto-reset:", error);
      }
    }, this.AUTO_RESET_INTERVAL_MS);

    this.isRunning = true;
    console.log("✅ Scheduler Service started");
  }

  stop(): void {
    if (this.autoResetInterval) {
      clearInterval(this.autoResetInterval);
      this.autoResetInterval = null;
      this.isRunning = false;
      console.log("🛑 Scheduler Service stopped");
    }
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

  async runOnce(): Promise<void> {
    await this.runAutoReset();
  }
}

export const schedulerService = new SchedulerService();
