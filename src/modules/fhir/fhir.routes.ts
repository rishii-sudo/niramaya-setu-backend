import { FastifyInstance } from 'fastify';
import { FhirService } from './fhir.service.js';
import { FhirController } from './fhir.controller.js';

export async function fhirRoutes(app: FastifyInstance) {
  const fhirService = new FhirService();
  const fhirController = new FhirController(fhirService);

  app.get(
    '/Patient/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['FHIR'],
        summary: 'Retrieve patient as HL7 FHIR R4 compliant Resource',
        security: [{ bearerAuth: [] }],
      },
    },
    fhirController.getPatient
  );

  app.get(
    '/ServiceRequest/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['FHIR'],
        summary: 'Retrieve healthcare referral as HL7 FHIR R4 ServiceRequest Resource',
        security: [{ bearerAuth: [] }],
      },
    },
    fhirController.getServiceRequest
  );
}
