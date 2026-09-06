import { PrismaClient } from '@prisma/client';
import { logger } from '../../common/logger/index.js';

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prismaClient ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prismaClient = prisma;
}

// Attach event listeners safely
prisma.$on('error' as never, (e: unknown) => {
  logger.error({ dbError: e }, 'Prisma DB Error');
});

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('📦 Database connected successfully (PostgreSQL)');
    return true;
  } catch (error) {
    logger.warn({ err: error }, '⚠️ PostgreSQL connection failed. Server will continue with fallback stubs if running locally.');
    return false;
  }
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
