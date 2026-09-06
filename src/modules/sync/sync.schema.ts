import { z } from 'zod';
import { SyncOperation } from '@prisma/client';

export const SyncMutationItemSchema = z.object({
  mutationId: z.string().uuid(),
  entityType: z.enum(['PATIENT', 'TRIAGE', 'REFERRAL']),
  operation: z.nativeEnum(SyncOperation),
  clientTimestamp: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid ISO timestamp'),
  payload: z.record(z.any()),
});

export const SyncPushSchema = z.object({
  batchId: z.string().uuid(),
  mutations: z.array(SyncMutationItemSchema).min(1).max(100, 'Maximum batch size is 100 mutations'),
});

export type SyncPushInput = z.output<typeof SyncPushSchema>;

export const SyncPullSchema = z.object({
  lastSyncWatermark: z.string().optional(),
  village: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type SyncPullInput = z.output<typeof SyncPullSchema>;
