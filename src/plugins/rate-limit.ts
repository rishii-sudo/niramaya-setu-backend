import rateLimit from '@fastify/rate-limit';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config/env.js';
import { isRedisConnected, getRedisClient } from '../infrastructure/redis/redis-client.js';

export async function setupRateLimit(app: FastifyInstance) {
  const redis = isRedisConnected() ? getRedisClient() : undefined;

  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX_GLOBAL,
    timeWindow: '1 minute',
    redis: redis || undefined,
    allowList: ['127.0.0.1'], // Allow local test runner loopback
    errorResponseBuilder: (_request: FastifyRequest, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Please retry in ${Math.ceil(context.ttl / 1000)} seconds.`,
      },
    }),
  });
}
