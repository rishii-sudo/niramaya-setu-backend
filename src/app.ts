import Fastify, { FastifyInstance } from 'fastify';
import { setupCors } from './plugins/cors.js';
import { setupHelmet } from './plugins/helmet.js';
import { setupJwt } from './plugins/jwt.js';
import { setupSwagger } from './plugins/swagger.js';
import { setupRateLimit } from './plugins/rate-limit.js';
import { errorHandler } from './common/errors/error-handler.js';
import { registerRoutes } from './routes/index.js';
import { logger } from './common/logger/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as any,
    ajv: {
      customOptions: {
        strict: false,
        keywords: ['example'],
      },
    },
  });

  // 1. Register Global Plugins
  await setupCors(app);
  await setupHelmet(app);
  await setupRateLimit(app);
  await setupJwt(app);
  await setupSwagger(app);

  // 2. Register Global Error Handler
  app.setErrorHandler(errorHandler);

  // 3. Register All Application Routes
  await registerRoutes(app);

  return app;
}
