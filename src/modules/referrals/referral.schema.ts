import { z } from 'zod';
import { ReferralStatus, TriageCategory } from '@prisma/client';

export const CreateReferralSchema = z.object({
  clientId: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  triageId: z.string().uuid().optional(),
  destinationFacilityId: z.string().uuid(),
  specialtyRequired: z.string().min(2),
  urgency: z.nativeEnum(TriageCategory).default(TriageCategory.ROUTINE_GREEN),
  clinicalNotes: z.string().optional(),
});

export type CreateReferralInput = z.output<typeof CreateReferralSchema>;

export const UpdateReferralStatusSchema = z.object({
  status: z.nativeEnum(ReferralStatus),
  notes: z.string().optional(),
});

export type UpdateReferralStatusInput = z.output<typeof UpdateReferralStatusSchema>;

export const QueryReferralSchema = z.object({
  status: z.nativeEnum(ReferralStatus).optional(),
  destinationFacilityId: z.string().uuid().optional(),
  originatingWorkerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

export type QueryReferralInput = z.output<typeof QueryReferralSchema>;
