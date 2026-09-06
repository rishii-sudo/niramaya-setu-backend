import { z } from 'zod';
import { TriageCategory, FacilityTier } from '@prisma/client';

export const CalculateTriageSchema = z.object({
  patientId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  
  // Vitals
  systolicBp: z.number().int().min(40).max(300).optional().nullable(),
  diastolicBp: z.number().int().min(30).max(200).optional().nullable(),
  spo2: z.number().min(50).max(100).optional().nullable(),
  temperature: z.number().min(90).max(110).optional().nullable(),
  pulse: z.number().int().min(30).max(250).optional().nullable(),
  bloodGlucose: z.number().min(20).max(700).optional().nullable(),
  respiratoryRate: z.number().int().min(5).max(60).optional().nullable(),
  
  // Symptoms
  symptoms: z.array(z.string().max(500)).max(50).default([]),
  redFlags: z.array(z.string().max(500)).max(50).default([]),
  
  // Context
  isPregnant: z.boolean().optional(),
  ageYears: z.number().int().min(0).max(120).optional(),
});

export type CalculateTriageInput = z.output<typeof CalculateTriageSchema>;

export interface TriageResult {
  triageCategory: TriageCategory;
  clinicalRationale: string;
  recommendedTier: FacilityTier;
  redFlagsDetected: string[];
  vitalsSummary: {
    isBpCritical: boolean;
    isSpo2Critical: boolean;
    isTempCritical: boolean;
    isPulseCritical: boolean;
    isGlucoseCritical: boolean;
  };
}
