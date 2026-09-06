import { FastifyInstance } from 'fastify';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { patientRoutes } from '../modules/patients/patient.routes.js';
import { triageRoutes } from '../modules/triage/triage.routes.js';
import { facilityRoutes } from '../modules/facilities/facility.routes.js';
import { referralRoutes } from '../modules/referrals/referral.routes.js';
import { syncRoutes } from '../modules/sync/sync.routes.js';
import { fhirRoutes } from '../modules/fhir/fhir.routes.js';
import { abdmRoutes } from '../modules/abdm/abdm.routes.js';
import { aiRoutes } from '../modules/ai/ai.routes.js';
import { voiceRoutes } from '../modules/voice/voice.routes.js';
import { isRedisConnected } from '../infrastructure/redis/redis-client.js';

export async function registerRoutes(app: FastifyInstance) {
  // Top-level Health Check endpoint: GET /health
  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'System health check and dependency status',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              timestamp: { type: 'string' },
              uptimeSeconds: { type: 'number' },
              dependencies: {
                type: 'object',
                properties: {
                  database: { type: 'string' },
                  redisQueue: { type: 'string' },
                  abdmAdapter: { type: 'string' },
                  aiAdapter: { type: 'string' },
                  voiceAdapter: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({
        status: 'healthy',
        service: 'niramaya-setu-backend',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        dependencies: {
          database: 'PostgreSQL (Prisma ORM)',
          redisQueue: isRedisConnected() ? 'CONNECTED' : 'IN_MEMORY_FALLBACK_ACTIVE',
          abdmAdapter: 'SANDBOX_STUB_READY',
          aiAdapter: 'PLUGGABLE_STUB_READY',
          voiceAdapter: 'PLUGGABLE_MARATHI_STUB_READY',
        },
      });
    }
  );

  // Versioned API Routes: /api/v1/...
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: '/auth' });
      await v1.register(patientRoutes, { prefix: '/patients' });
      await v1.register(triageRoutes, { prefix: '/triage' });
      await v1.register(facilityRoutes, { prefix: '/facilities' });
      await v1.register(referralRoutes, { prefix: '/referrals' });
      await v1.register(syncRoutes, { prefix: '/sync' });
      await v1.register(fhirRoutes, { prefix: '/fhir' });
      await v1.register(abdmRoutes, { prefix: '/abdm' });
      await v1.register(aiRoutes, { prefix: '/ai' });
      await v1.register(voiceRoutes, { prefix: '/voice' });
    },
    { prefix: '/api/v1' }
  );
}
