import { UserRole, FacilityTier, TriageCategory, ReferralStatus } from '@prisma/client';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  role: UserRole;
  healthWorkerId?: string;
  facilityId?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
