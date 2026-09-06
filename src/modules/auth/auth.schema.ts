import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const LoginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.nativeEnum(UserRole),
  name: z.string().min(2),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
  village: z.string().optional(),
  taluka: z.string().optional(),
  district: z.string().optional(),
  assignedFacilityId: z.string().uuid().optional(),
});

export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;
