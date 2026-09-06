import { Redis } from 'ioredis';
import { config } from '../../config/env.js';
import { logger } from '../../common/logger/index.js';

let redisClient: Redis | null = null;
let isRedisAvailable = false;

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  try {
    const client = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null, // Don't crash if Redis is unavailable in local dev
    });

    client.on('connect', () => {
      isRedisAvailable = true;
      logger.info('⚡ Connected to Redis');
    });

    client.on('error', (err) => {
      if (isRedisAvailable) {
        logger.warn({ err }, '⚠️ Redis connection lost');
      }
      isRedisAvailable = false;
    });

    redisClient = client;
    return client;
  } catch (error) {
    logger.warn({ err: error }, '⚠️ Redis initialization skipped. Using in-memory fallback.');
    return null;
  }
}

export async function initRedis(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.connect();
    isRedisAvailable = true;
    return true;
  } catch {
    logger.info('ℹ️ Redis not detected at localhost:6379. In-memory queue fallback is active.');
    isRedisAvailable = false;
    return false;
  }
}

export function isRedisConnected(): boolean {
  return isRedisAvailable;
}
