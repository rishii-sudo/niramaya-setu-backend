import helmet from '@fastify/helmet';
import { FastifyInstance } from 'fastify';

export async function setupHelmet(app: FastifyInstance) {
  await app.register(helmet, {
    contentSecurityPolicy: false, // Allows Swagger UI to render smoothly
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}
