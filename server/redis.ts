import { Redis } from '@upstash/redis';
import { externalServiceToggleService } from './services/externalServiceToggleService';

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    const restUrl = process.env.UPSTASH_REDIS_REST_URL;
    const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!restUrl || !restToken) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
    }

    redis = new Redis({
      url: restUrl,
      token: restToken,
    });

    console.log('✅ Redis client initialized (Upstash REST)');
  }

  return redis;
}

// Check if Redis service is enabled (for graceful degradation)
export async function isRedisEnabled(): Promise<boolean> {
  try {
    return await externalServiceToggleService.isServiceEnabled('redis');
  } catch (error) {
    console.warn('[Redis] Toggle service not available, defaulting to enabled');
    return true;
  }
}

// Sync version for performance-critical code paths
export function isRedisEnabledSync(): boolean {
  try {
    return externalServiceToggleService.isServiceEnabledSync('redis');
  } catch (error) {
    return true;
  }
}

export async function closeRedisClient(): Promise<void> {
  if (redis) {
    redis = null;
    console.log('Redis connection closed');
  }
}

export { redis };
