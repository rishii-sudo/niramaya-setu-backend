import { FastifyInstance } from 'fastify';
import { SyncService } from './sync.service.js';
import { SyncController } from './sync.controller.js';

export async function syncRoutes(app: FastifyInstance) {
  const syncService = new SyncService();
  const syncController = new SyncController(syncService);

  app.post(
    '/push',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Sync'],
        summary: 'Batch upload offline patients, triage assessments, and referrals with idempotency keys',
        security: [{ bearerAuth: [] }],
      },
    },
    syncController.push
  );

  app.post(
    '/pull',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Sync'],
        summary: 'Download incremental delta updates since lastSyncWatermark',
        security: [{ bearerAuth: [] }],
      },
    },
    syncController.pull
  );
}
