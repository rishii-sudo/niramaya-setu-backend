import { FastifyInstance } from 'fastify';
import { PatientService } from './patient.service.js';
import { PatientController } from './patient.controller.js';
import { UserRole } from '@prisma/client';

export async function patientRoutes(app: FastifyInstance) {
  const patientService = new PatientService();
  const patientController = new PatientController(patientService);

  app.post(
    '/',
    {
      preHandler: [app.authenticate, app.authorizeRoles([UserRole.ASHA, UserRole.ANM, UserRole.DOCTOR, UserRole.ADMIN])],
      schema: {
        tags: ['Patients'],
        summary: 'Register a new patient with Aadhaar token/hash and/or ABHA details',
        security: [{ bearerAuth: [] }],
      },
    },
    patientController.create
  );

  app.get(
    '/',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Patients'],
        summary: 'List and filter patients by name, mobile, village, Aadhaar or ABHA',
        security: [{ bearerAuth: [] }],
      },
    },
    patientController.list
  );

  app.get(
    '/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Patients'],
        summary: 'Get patient by ID',
        security: [{ bearerAuth: [] }],
      },
    },
    patientController.getById
  );

  app.get(
    '/:id/history',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Patients'],
        summary: 'Get complete clinical history (triage encounters & referrals) for a patient',
        security: [{ bearerAuth: [] }],
      },
    },
    patientController.getHistory
  );
}
