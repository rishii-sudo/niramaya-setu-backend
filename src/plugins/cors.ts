import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';

export async function setupCors(app: FastifyInstance) {
  const allowedOrigins = config.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim());

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return cb(null, true);
      
      if (allowedOrigins.includes(origin) || config.NODE_ENV === 'development') {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS policy'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Sync-Id', 'X-Client-Timestamp'],
    credentials: true,
  });
}
