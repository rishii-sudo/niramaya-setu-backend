import { z } from 'zod';
import { FacilityTier, TriageCategory } from '@prisma/client';

export const CreateFacilitySchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  tier: z.nativeEnum(FacilityTier),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().min(3),
  taluka: z.string().optional().nullable(),
  district: z.string().min(2),
  state: z.string().default('Maharashtra'),
  pincode: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  totalBeds: z.number().int().min(0).default(0),
  availableBeds: z.number().int().min(0).default(0),
  specialties: z.array(z.string()).default([]),
  hasEmergencyUnit: z.boolean().default(false),
  hasAmbulance: z.boolean().default(false),
});

export type CreateFacilityInput = z.output<typeof CreateFacilitySchema>;

export const MatchFacilityQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  specialty: z.string().optional(),
  urgency: z.nativeEnum(TriageCategory).default(TriageCategory.ROUTINE_GREEN),
  maxDistanceKm: z.coerce.number().positive().default(50),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type MatchFacilityQuery = z.output<typeof MatchFacilityQuerySchema>;
