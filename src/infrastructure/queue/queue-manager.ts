import { Queue, Worker, Job } from 'bullmq';
import { isRedisConnected, getRedisClient } from '../redis/redis-client.js';
import { logger } from '../../common/logger/index.js';

export interface NoShowJobData {
  referralId: string;
  referralCode: string;
  patientId: string;
  scheduledType: 'REMINDER_24H' | 'NO_SHOW_48H';
  slaExpiresAt: string;
}

type JobHandler = (data: NoShowJobData) => Promise<void>;

class QueueManager {
  private bullQueue: Queue | null = null;
  private bullWorker: Worker | null = null;
  private inMemoryTimers: Map<string, NodeJS.Timeout> = new Map();
  private handler: JobHandler | null = null;

  public async initialize(handler: JobHandler) {
    this.handler = handler;

    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        if (redis) {
          this.bullQueue = new Queue('niramaya-referral-sla', {
            connection: redis,
          });

          this.bullWorker = new Worker(
            'niramaya-referral-sla',
            async (job: Job<NoShowJobData>) => {
              logger.info({ jobId: job.id, data: job.data }, 'Processing referral SLA job via BullMQ');
              if (this.handler) {
                await this.handler(job.data);
              }
            },
            { connection: redis }
          );

          logger.info('🚀 BullMQ Queue & Worker initialized with Redis');
          return;
        }
      } catch (err) {
        logger.warn({ err }, '⚠️ BullMQ initialization failed, switching to in-memory scheduler fallback.');
      }
    }

    logger.info('🕒 In-memory Referral SLA Watchdog active (Local development mode)');
  }

  public async scheduleReferralAlerts(data: {
    referralId: string;
    referralCode: string;
    patientId: string;
    issuedAt: Date;
    slaExpiresAt: Date;
  }) {
    const now = Date.now();
    const reminder24hDelay = Math.max(0, data.issuedAt.getTime() + 24 * 60 * 60 * 1000 - now);
    const deadline48hDelay = Math.max(0, data.slaExpiresAt.getTime() - now);

    // 1. If BullMQ is active
    if (this.bullQueue) {
      await this.bullQueue.add(
        'reminder-24h',
        {
          referralId: data.referralId,
          referralCode: data.referralCode,
          patientId: data.patientId,
          scheduledType: 'REMINDER_24H',
          slaExpiresAt: data.slaExpiresAt.toISOString(),
        },
        { delay: reminder24hDelay, jobId: `24h-${data.referralId}` }
      );

      await this.bullQueue.add(
        'noshow-48h',
        {
          referralId: data.referralId,
          referralCode: data.referralCode,
          patientId: data.patientId,
          scheduledType: 'NO_SHOW_48H',
          slaExpiresAt: data.slaExpiresAt.toISOString(),
        },
        { delay: deadline48hDelay, jobId: `48h-${data.referralId}` }
      );
      return;
    }

    // 2. In-Memory Fallback
    const reminderTimer = setTimeout(async () => {
      if (this.handler) {
        await this.handler({
          referralId: data.referralId,
          referralCode: data.referralCode,
          patientId: data.patientId,
          scheduledType: 'REMINDER_24H',
          slaExpiresAt: data.slaExpiresAt.toISOString(),
        });
      }
    }, reminder24hDelay);

    const noShowTimer = setTimeout(async () => {
      if (this.handler) {
        await this.handler({
          referralId: data.referralId,
          referralCode: data.referralCode,
          patientId: data.patientId,
          scheduledType: 'NO_SHOW_48H',
          slaExpiresAt: data.slaExpiresAt.toISOString(),
        });
      }
    }, deadline48hDelay);

    this.inMemoryTimers.set(`24h-${data.referralId}`, reminderTimer);
    this.inMemoryTimers.set(`48h-${data.referralId}`, noShowTimer);
  }

  public cancelScheduledAlerts(referralId: string) {
    const t24 = this.inMemoryTimers.get(`24h-${referralId}`);
    if (t24) clearTimeout(t24);
    const t48 = this.inMemoryTimers.get(`48h-${referralId}`);
    if (t48) clearTimeout(t48);

    this.inMemoryTimers.delete(`24h-${referralId}`);
    this.inMemoryTimers.delete(`48h-${referralId}`);
  }
}

export const queueManager = new QueueManager();
