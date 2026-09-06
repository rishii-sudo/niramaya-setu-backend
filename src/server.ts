import { buildApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './common/logger/index.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/prisma.js';
import { initRedis } from './infrastructure/redis/redis-client.js';
import { queueManager } from './infrastructure/queue/queue-manager.js';
import { alertService } from './modules/alerts/alert.service.js';

async function bootstrap() {
  try {
    logger.info('🚀 Initializing Niramaya Setu Backend Services...');

    // 1. Database Connection (PostgreSQL via Prisma)
    await connectDatabase();

    // 2. Redis Connection (Optional in local dev; non-blocking)
    await initRedis();

    // 3. Queue Manager & Referral SLA Watchdog Worker
    await queueManager.initialize(async (jobData) => {
      await alertService.handleSlaJob(jobData);
    });

    // 4. Build Fastify App
    const app = await buildApp();

    // 5. Start Listening
    await app.listen({ port: config.PORT, host: config.HOST });
    logger.info(`✨ Server running at http://${config.HOST}:${config.PORT}`);
    logger.info(`📚 Swagger OpenAPI documentation available at http://localhost:${config.PORT}/docs`);
    logger.info(`🩺 Health endpoint available at http://localhost:${config.PORT}/health`);

    // Graceful Shutdown
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, closing server gracefully...`);
        await app.close();
        await disconnectDatabase();
        process.exit(0);
      });
    }
  } catch (error) {
    logger.error({ error }, '❌ Fatal error during backend bootstrap');
    process.exit(1);
  }
}

bootstrap();
