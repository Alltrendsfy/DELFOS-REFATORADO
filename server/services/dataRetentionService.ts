import { db } from '../db';
import { sql } from 'drizzle-orm';

interface RetentionPolicy {
  table: string;
  retentionDays: number;
  timestampColumn: string;
}

const RETENTION_POLICIES: RetentionPolicy[] = [
  { table: 'bars_1m', retentionDays: 30, timestampColumn: 'bar_ts' },
  { table: 'bars_1h', retentionDays: 365, timestampColumn: 'bar_ts' },
  { table: 'decision_log', retentionDays: 90, timestampColumn: 'created_at' },
  { table: 'circuit_breaker_events', retentionDays: 90, timestampColumn: 'created_at' },
  { table: 'ai_conversations', retentionDays: 30, timestampColumn: 'created_at' },
  { table: 'performance_snapshots', retentionDays: 90, timestampColumn: 'snapshot_at' },
  { table: 'trade_costs', retentionDays: 365, timestampColumn: 'created_at' },
  { table: 'audit_trail', retentionDays: 730, timestampColumn: 'created_at' },
];

class DataRetentionService {
  private cleanupTimeout: NodeJS.Timeout | null = null;
  private readonly CLEANUP_HOUR_UTC = 3;
  private readonly DAY_MS = 24 * 60 * 60 * 1000;

  private calculateMsUntilNextCleanup(): number {
    const now = new Date();
    const targetHour = this.CLEANUP_HOUR_UTC;
    
    const nextRun = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      targetHour,
      0,
      0,
      0
    ));
    
    if (nextRun.getTime() <= now.getTime()) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }
    
    return nextRun.getTime() - now.getTime();
  }

  private scheduleNextCleanup(): void {
    const msUntilNext = this.calculateMsUntilNextCleanup();
    const hoursUntilNext = (msUntilNext / (1000 * 60 * 60)).toFixed(1);
    
    console.log(`[DataRetention] Next cleanup scheduled in ${hoursUntilNext} hours (${this.CLEANUP_HOUR_UTC}:00 UTC)`);
    
    this.cleanupTimeout = setTimeout(async () => {
      try {
        await this.runCleanup();
      } catch (err) {
        console.error('[DataRetention] Cleanup error:', err);
      }
      this.scheduleNextCleanup();
    }, msUntilNext);
  }

  async start(): Promise<void> {
    console.log('[DataRetention] Starting data retention service...');
    console.log(`[DataRetention] Cleanup scheduled for ${this.CLEANUP_HOUR_UTC}:00 UTC daily`);
    
    this.scheduleNextCleanup();
    
    console.log('[DataRetention] Service started');
  }

  stop(): void {
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = null;
      console.log('[DataRetention] Service stopped');
    }
  }

  async runCleanup(): Promise<{ table: string; deletedCount: number }[]> {
    console.log('[DataRetention] Starting scheduled cleanup...');
    const results: { table: string; deletedCount: number }[] = [];
    
    for (const policy of RETENTION_POLICIES) {
      try {
        const deletedCount = await this.cleanupTable(policy);
        results.push({ table: policy.table, deletedCount });
        
        if (deletedCount > 0) {
          console.log(`[DataRetention] Cleaned ${deletedCount} rows from ${policy.table} (retention: ${policy.retentionDays} days)`);
        }
      } catch (error) {
        console.error(`[DataRetention] Error cleaning ${policy.table}:`, error);
      }
    }
    
    const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);
    console.log(`[DataRetention] Cleanup complete - ${totalDeleted} total rows deleted`);
    
    return results;
  }

  private async cleanupTable(policy: RetentionPolicy): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);
    
    const result = await db.execute(sql`
      DELETE FROM ${sql.identifier(policy.table)}
      WHERE ${sql.identifier(policy.timestampColumn)} < ${cutoffDate}
    `);
    
    return result.rowCount ?? 0;
  }

  async getRetentionStats(): Promise<{
    table: string;
    retentionDays: number;
    rowCount: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
  }[]> {
    const stats = [];
    
    for (const policy of RETENTION_POLICIES) {
      try {
        const result = await db.execute(sql`
          SELECT 
            COUNT(*) as row_count,
            MIN(${sql.identifier(policy.timestampColumn)}) as oldest,
            MAX(${sql.identifier(policy.timestampColumn)}) as newest
          FROM ${sql.identifier(policy.table)}
        `);
        
        const row = result.rows[0] as any;
        stats.push({
          table: policy.table,
          retentionDays: policy.retentionDays,
          rowCount: parseInt(row?.row_count ?? '0', 10),
          oldestRecord: row?.oldest ? new Date(row.oldest) : null,
          newestRecord: row?.newest ? new Date(row.newest) : null,
        });
      } catch (error) {
        stats.push({
          table: policy.table,
          retentionDays: policy.retentionDays,
          rowCount: 0,
          oldestRecord: null,
          newestRecord: null,
        });
      }
    }
    
    return stats;
  }

  getRetentionPolicies(): RetentionPolicy[] {
    return [...RETENTION_POLICIES];
  }
}

export const dataRetentionService = new DataRetentionService();
