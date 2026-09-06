import { FastifyInstance } from 'fastify';
import { FacilityService } from './facility.service.js';
import { FacilityController } from './facility.controller.js';
import { UserRole } from '@prisma/client';

export async function facilityRoutes(app: FastifyInstance) {
  const facilityService = new FacilityService();
  const facilityController = new FacilityController(facilityService);

  app.get(
    '/match',
    {
      schema: {
        tags: ['Facilities'],
        summary: 'Find suitable healthcare facilities ranked by geospatial distance, tier, specialties and bed availability',
        querystring: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', example: 19.076 },
            lng: { type: 'number', example: 72.8777 },
            specialty: { type: 'string', example: 'Pediatrics' },
            urgency: { type: 'string', enum: ['EMERGENCY_RED', 'URGENT_YELLOW', 'ROUTINE_GREEN'], example: 'EMERGENCY_RED' },
            maxDistanceKm: { type: 'number', example: 50 },
          },
        },
      },
    },
    facilityController.match
  );

  app.get(
    '/',
    {
      schema: {
        tags: ['Facilities'],
        summary: 'List all active health facilities (Sub-Centers, PHCs, CHCs, District Hospitals)',
      },
    },
    facilityController.list
  );

  app.get(
    '/:id',
    {
      schema: {
        tags: ['Facilities'],
        summary: 'Get facility details by ID',
      },
    },
    facilityController.getById
  );

  app.post(
    '/',
    {
      preHandler: [app.authenticate, app.authorizeRoles([UserRole.ADMIN])],
      schema: {
        tags: ['Facilities'],
        summary: 'Create a new healthcare facility (Admin only)',
        security: [{ bearerAuth: [] }],
      },
    },
    facilityController.create
  );
}
