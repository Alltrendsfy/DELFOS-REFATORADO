import { Redis } from '@upstash/redis';

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

export async function closeRedisClient(): Promise<void> {
  if (redis) {
    redis = null;
    console.log('Redis connection closed');
  }
}

export { redis };
