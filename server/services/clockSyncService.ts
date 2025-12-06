import https from 'https';

interface ClockCheckResult {
  localTime: Date;
  serverTime: Date | null;
  driftMs: number | null;
  status: 'synced' | 'warning' | 'error' | 'unknown';
  message: string;
}

const DRIFT_WARNING_MS = 1000;
const DRIFT_ERROR_MS = 5000;

class ClockSyncService {
  private lastCheck: ClockCheckResult | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  async checkClockSync(): Promise<ClockCheckResult> {
    const localTime = new Date();
    
    try {
      const serverTime = await this.getWorldTimeFromAPI();
      
      if (!serverTime) {
        return {
          localTime,
          serverTime: null,
          driftMs: null,
          status: 'unknown',
          message: 'Unable to fetch reference time from external server'
        };
      }
      
      const driftMs = Math.abs(localTime.getTime() - serverTime.getTime());
      
      let status: ClockCheckResult['status'];
      let message: string;
      
      if (driftMs <= DRIFT_WARNING_MS) {
        status = 'synced';
        message = `Clock synchronized (drift: ${driftMs}ms)`;
      } else if (driftMs <= DRIFT_ERROR_MS) {
        status = 'warning';
        message = `Clock drift warning: ${driftMs}ms (threshold: ${DRIFT_WARNING_MS}ms)`;
      } else {
        status = 'error';
        message = `Clock drift critical: ${driftMs}ms (threshold: ${DRIFT_ERROR_MS}ms) - timestamps may be unreliable`;
      }
      
      const result: ClockCheckResult = {
        localTime,
        serverTime,
        driftMs,
        status,
        message
      };
      
      this.lastCheck = result;
      return result;
      
    } catch (error) {
      const result: ClockCheckResult = {
        localTime,
        serverTime: null,
        driftMs: null,
        status: 'unknown',
        message: `Clock check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      
      this.lastCheck = result;
      return result;
    }
  }

  private getWorldTimeFromAPI(): Promise<Date | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 5000);

      const req = https.get('https://worldtimeapi.org/api/timezone/Etc/UTC', (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const json = JSON.parse(data);
            if (json.utc_datetime) {
              resolve(new Date(json.utc_datetime));
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });
      
      req.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
      
      req.end();
    });
  }

  async startupCheck(): Promise<void> {
    console.log('[ClockSync] Checking system clock synchronization...');
    
    const result = await this.checkClockSync();
    
    switch (result.status) {
      case 'synced':
        console.log(`[ClockSync] ${result.message}`);
        break;
      case 'warning':
        console.warn(`[ClockSync] WARNING: ${result.message}`);
        break;
      case 'error':
        console.error(`[ClockSync] CRITICAL: ${result.message}`);
        console.error('[ClockSync] Trading timestamps may be inaccurate. Consider syncing system clock with NTP.');
        break;
      case 'unknown':
        console.warn(`[ClockSync] ${result.message} - proceeding with local time`);
        break;
    }
  }

  startPeriodicCheck(intervalMs: number = 3600000): void {
    this.checkInterval = setInterval(async () => {
      const result = await this.checkClockSync();
      if (result.status === 'warning' || result.status === 'error') {
        console.warn(`[ClockSync] Periodic check: ${result.message}`);
      }
    }, intervalMs);
  }

  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  getLastCheck(): ClockCheckResult | null {
    return this.lastCheck;
  }
}

export const clockSyncService = new ClockSyncService();
