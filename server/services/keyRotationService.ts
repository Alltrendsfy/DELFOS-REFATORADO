import crypto from 'crypto';
import { db } from '../db';
import { sql, eq } from 'drizzle-orm';
import { system_metadata } from '@shared/schema';

interface KeyRotationStatus {
  hasEncryptionKey: boolean;
  keyConfigured: boolean;
  keyAgeWarning: boolean;
  keyAgeDays: number | null;
  usersWithEncryptedCredentials: number;
  lastCheckAt: Date;
  keyFirstSeenAt: Date | null;
  recommendations: string[];
}

interface KeyMetadata {
  keyHash: string;
  firstSeenAt: string;
}

const KEY_ROTATION_WARNING_DAYS = 90;
const KEY_METADATA_KEY = 'encryption_key_metadata';

class KeyRotationService {
  private lastStatus: KeyRotationStatus | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private cachedMetadata: KeyMetadata | null = null;

  private getKeyHash(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  private async loadKeyMetadataFromDb(): Promise<KeyMetadata | null> {
    try {
      const result = await db.select()
        .from(system_metadata)
        .where(eq(system_metadata.key, KEY_METADATA_KEY))
        .limit(1);
      
      if (result.length > 0) {
        return result[0].value as KeyMetadata;
      }
    } catch (err) {
      console.warn('[KeyRotation] Could not load key metadata from database:', err);
    }
    return null;
  }

  private async saveKeyMetadataToDb(metadata: KeyMetadata): Promise<void> {
    try {
      await db.insert(system_metadata)
        .values({
          key: KEY_METADATA_KEY,
          value: metadata,
          updated_at: new Date()
        })
        .onConflictDoUpdate({
          target: system_metadata.key,
          set: {
            value: metadata,
            updated_at: new Date()
          }
        });
    } catch (err) {
      console.error('[KeyRotation] CRITICAL: Could not save key metadata to database:', err);
      console.error('[KeyRotation] Key rotation tracking is degraded - age alerts may not function correctly.');
    }
  }

  private async getKeyAgeDays(): Promise<{ ageDays: number | null; firstSeenAt: Date | null; isNewKey: boolean }> {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      return { ageDays: null, firstSeenAt: null, isNewKey: false };
    }

    const currentKeyHash = this.getKeyHash(encryptionKey);
    
    if (!this.cachedMetadata) {
      this.cachedMetadata = await this.loadKeyMetadataFromDb();
    }

    if (this.cachedMetadata && this.cachedMetadata.keyHash === currentKeyHash) {
      const firstSeenAt = new Date(this.cachedMetadata.firstSeenAt);
      const ageDays = Math.floor((Date.now() - firstSeenAt.getTime()) / (1000 * 60 * 60 * 24));
      return { ageDays, firstSeenAt, isNewKey: false };
    }

    const now = new Date();
    const newMetadata: KeyMetadata = {
      keyHash: currentKeyHash,
      firstSeenAt: now.toISOString()
    };
    
    await this.saveKeyMetadataToDb(newMetadata);
    this.cachedMetadata = newMetadata;

    return { ageDays: 0, firstSeenAt: now, isNewKey: true };
  }

  async checkKeyStatus(): Promise<KeyRotationStatus> {
    const recommendations: string[] = [];
    
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const hasEncryptionKey = !!encryptionKey;
    const keyConfigured = hasEncryptionKey && encryptionKey.length >= 64;
    
    if (!hasEncryptionKey) {
      recommendations.push('ENCRYPTION_KEY environment variable is not set. Credentials cannot be encrypted.');
    } else if (!keyConfigured) {
      recommendations.push('ENCRYPTION_KEY should be at least 64 hex characters (32 bytes) for AES-256.');
    }
    
    let usersWithEncryptedCredentials = 0;
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM users 
        WHERE kraken_api_key IS NOT NULL 
        OR kraken_api_secret IS NOT NULL
      `);
      usersWithEncryptedCredentials = parseInt((result.rows[0] as any)?.count ?? '0', 10);
    } catch {
      usersWithEncryptedCredentials = 0;
    }
    
    if (usersWithEncryptedCredentials > 0 && !keyConfigured) {
      recommendations.push(`${usersWithEncryptedCredentials} user(s) have encrypted credentials. Ensure ENCRYPTION_KEY is properly configured.`);
    }

    const { ageDays, firstSeenAt, isNewKey } = await this.getKeyAgeDays();
    const keyAgeWarning = ageDays !== null && ageDays >= KEY_ROTATION_WARNING_DAYS;

    if (isNewKey && hasEncryptionKey) {
      recommendations.push('New encryption key detected. Key age tracking started.');
    }

    if (ageDays !== null) {
      if (keyAgeWarning) {
        recommendations.push(`WARNING: Encryption key is ${ageDays} days old. Recommended rotation after ${KEY_ROTATION_WARNING_DAYS} days.`);
      } else {
        const daysUntilWarning = KEY_ROTATION_WARNING_DAYS - ageDays;
        recommendations.push(`Key age: ${ageDays} days. Rotation recommended in ${daysUntilWarning} days.`);
      }
    }
    
    recommendations.push('Before rotating keys, ensure all encrypted data is re-encrypted with the new key.');
    
    const status: KeyRotationStatus = {
      hasEncryptionKey,
      keyConfigured,
      keyAgeWarning,
      keyAgeDays: ageDays,
      usersWithEncryptedCredentials,
      lastCheckAt: new Date(),
      keyFirstSeenAt: firstSeenAt,
      recommendations
    };
    
    this.lastStatus = status;
    return status;
  }

  async startupCheck(): Promise<void> {
    console.log('[KeyRotation] Checking encryption key configuration...');
    
    const status = await this.checkKeyStatus();
    
    if (!status.hasEncryptionKey) {
      console.error('[KeyRotation] CRITICAL: ENCRYPTION_KEY is not set!');
      console.error('[KeyRotation] User credentials will not be securely encrypted.');
    } else if (!status.keyConfigured) {
      console.warn('[KeyRotation] WARNING: ENCRYPTION_KEY may not be properly configured.');
    } else {
      console.log('[KeyRotation] Encryption key is configured.');
      
      if (status.keyAgeDays !== null) {
        if (status.keyAgeWarning) {
          console.warn(`[KeyRotation] WARNING: Key is ${status.keyAgeDays} days old. Rotation recommended after ${KEY_ROTATION_WARNING_DAYS} days.`);
        } else {
          console.log(`[KeyRotation] Key age: ${status.keyAgeDays} days (rotation threshold: ${KEY_ROTATION_WARNING_DAYS} days)`);
        }
      }
    }
    
    if (status.usersWithEncryptedCredentials > 0) {
      console.log(`[KeyRotation] ${status.usersWithEncryptedCredentials} user(s) have encrypted credentials stored.`);
    }
  }

  startPeriodicCheck(intervalMs: number = 86400000): void {
    this.checkInterval = setInterval(async () => {
      const status = await this.checkKeyStatus();
      if (!status.keyConfigured && status.usersWithEncryptedCredentials > 0) {
        console.warn('[KeyRotation] Periodic check: Encryption key issues detected with stored credentials.');
      }
    }, intervalMs);
  }

  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  getLastStatus(): KeyRotationStatus | null {
    return this.lastStatus;
  }

  async getKeyRotationRecommendations(): Promise<{
    status: KeyRotationStatus;
    rotationSteps: string[];
  }> {
    const status = await this.checkKeyStatus();
    
    const rotationSteps = [
      '1. Generate a new 32-byte (64 hex char) encryption key: openssl rand -hex 32',
      '2. Backup current ENCRYPTION_KEY value',
      '3. Create a migration script to re-encrypt all user credentials',
      '4. Run migration in a maintenance window',
      '5. Update ENCRYPTION_KEY in Replit Secrets',
      '6. Restart the application',
      '7. Verify all encrypted data is accessible',
      '8. Securely delete the old key backup after verification'
    ];
    
    return { status, rotationSteps };
  }
}

export const keyRotationService = new KeyRotationService();
