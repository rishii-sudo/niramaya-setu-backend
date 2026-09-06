import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { FastifyInstance } from 'fastify';

export async function setupSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Niramaya Setu API',
        description:
          'Backend REST APIs for Niramaya Setu healthcare referral, offline-first sync, clinical triage, 48-hour SLA tracking, and ABDM/FHIR R4 integration.',
        version: '1.0.0',
        contact: {
          name: 'Niramaya Setu Support',
        },
      },
      servers: [
        {
          url: 'http://localhost:4000',
          description: 'Local Development Server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter your JWT token to authenticate',
          },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'System', description: 'System health & diagnostic endpoints' },
        { name: 'Auth', description: 'Authentication & Session management' },
        { name: 'Patients', description: 'Patient registration with Aadhaar hash & ABHA' },
        { name: 'Triage', description: 'Deterministic rule-based clinical triage engine' },
        { name: 'Facilities', description: 'Facility catalog & geospatial matching' },
        { name: 'Referrals', description: 'Referral lifecycle & 48-hour SLA status' },
        { name: 'Sync', description: 'Offline-first idempotent delta push/pull sync' },
        { name: 'FHIR', description: 'HL7 FHIR R4 standard resource serializers' },
        { name: 'ABDM', description: 'Ayushman Bharat Digital Mission (M1-M3) adapters' },
        { name: 'AI', description: 'Pluggable AI clinical assistance interfaces' },
        { name: 'Voice', description: 'Pluggable Marathi Speech STT/TTS interfaces' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: false,
    transformStaticCSP: (header) => header,
  });
}
