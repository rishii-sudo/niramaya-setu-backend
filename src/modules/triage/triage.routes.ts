import { FastifyInstance } from 'fastify';
import { TriageService } from './triage.service.js';
import { TriageController } from './triage.controller.js';

export async function triageRoutes(app: FastifyInstance) {
  const triageService = new TriageService();
  const triageController = new TriageController(triageService);

  app.post(
    '/calculate',
    {
      schema: {
        tags: ['Triage'],
        summary: 'Calculate explainable rule-based clinical triage score (RED, YELLOW, GREEN)',
        body: {
          type: 'object',
          properties: {
            systolicBp: { type: 'number', example: 120 },
            diastolicBp: { type: 'number', example: 80 },
            spo2: { type: 'number', example: 98 },
            temperature: { type: 'number', example: 98.6 },
            pulse: { type: 'number', example: 76 },
            bloodGlucose: { type: 'number', example: 110 },
            symptoms: { type: 'array', items: { type: 'string' }, example: ['mild headache'] },
          },
        },
      },
    },
    triageController.calculate
  );

  app.post(
    '/save',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Triage'],
        summary: 'Evaluate and save triage assessment for a patient record',
        security: [{ bearerAuth: [] }],
      },
    },
    triageController.save
  );
}
