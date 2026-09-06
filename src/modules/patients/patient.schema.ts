import { z } from 'zod';
import { Gender } from '@prisma/client';
import { hashAadhaar, maskAadhaar } from '../../security/crypto/aadhaar-token.js';

export { hashAadhaar, maskAadhaar };

export const CreatePatientSchema = z.object({
  clientId: z.string().uuid().optional(),
  name: z.string().min(2, 'Name is required'),
  dob: z.string().refine((val) => !isNaN(Date.parse(val)), 'Valid date of birth required (YYYY-MM-DD)'),
  gender: z.nativeEnum(Gender),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number').optional().nullable(),
  village: z.string().min(2, 'Village is required'),
  taluka: z.string().optional().nullable(),
  district: z.string().min(2, 'District is required'),
  address: z.string().optional().nullable(),
  
  // Aadhaar input (never saved raw; converted immediately to HMAC token & mask)
  aadhaarNumber: z.string().regex(/^\d{12}$/, 'Aadhaar must be a 12-digit number').optional().nullable(),
  
  // ABHA input
  abhaNumber: z.string().regex(/^\d{14}$/, 'ABHA number must be 14 digits').optional().nullable(),
  abhaAddress: z.string().regex(/^[a-zA-Z0-9._]+@abdm$/, 'ABHA address format e.g. name@abdm').optional().nullable(),
});

export type CreatePatientInput = z.output<typeof CreatePatientSchema>;

export const QueryPatientSchema = z.object({
  search: z.string().optional(),
  village: z.string().optional(),
  aadhaarNumber: z.string().optional(),
  abhaNumber: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

export type QueryPatientInput = z.output<typeof QueryPatientSchema>;
