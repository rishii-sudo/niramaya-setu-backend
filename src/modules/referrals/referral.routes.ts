import { FastifyInstance } from 'fastify';
import { ReferralService } from './referral.service.js';
import { ReferralController } from './referral.controller.js';
import { UserRole } from '@prisma/client';

export async function referralRoutes(app: FastifyInstance) {
  const referralService = new ReferralService();
  const referralController = new ReferralController(referralService);

  app.post(
    '/',
    {
      preHandler: [app.authenticate, app.authorizeRoles([UserRole.ASHA, UserRole.ANM, UserRole.DOCTOR, UserRole.ADMIN])],
      schema: {
        tags: ['Referrals'],
        summary: 'Create a new healthcare referral with 48-hour SLA deadline',
        security: [{ bearerAuth: [] }],
      },
    },
    referralController.create
  );

  app.get(
    '/pending',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Referrals'],
        summary: 'List incoming pending referrals for destination hospital / health facility',
        security: [{ bearerAuth: [] }],
      },
    },
    referralController.getPending
  );

  app.get(
    '/no-shows',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Referrals'],
        summary: 'List 48-hour SLA breached referrals requiring urgent ASHA/ANM home visit follow-up',
        security: [{ bearerAuth: [] }],
      },
    },
    referralController.getNoShows
  );

  app.get(
    '/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Referrals'],
        summary: 'Get referral by ID',
        security: [{ bearerAuth: [] }],
      },
    },
    referralController.getById
  );

  app.patch(
    '/:id/status',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Referrals'],
        summary: 'Update referral status (IN_TRANSIT, ACKNOWLEDGED, COMPLETED, CANCELLED)',
        security: [{ bearerAuth: [] }],
      },
    },
    referralController.updateStatus
  );
}
