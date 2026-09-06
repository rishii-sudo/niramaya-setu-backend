import { prisma } from '../../infrastructure/database/prisma.js';
import { SyncPushInput, SyncPullInput } from './sync.schema.js';
import { AuthenticatedUser } from '../../common/types/index.js';
import { PatientService } from '../patients/patient.service.js';
import { TriageService } from '../triage/triage.service.js';
import { ReferralService } from '../referrals/referral.service.js';
import { CreatePatientSchema } from '../patients/patient.schema.js';
import { CalculateTriageSchema } from '../triage/triage.schema.js';
import { CreateReferralSchema } from '../referrals/referral.schema.js';
import { SyncStatus, SyncOperation, UserRole } from '@prisma/client';
import { logger } from '../../common/logger/index.js';
import { ForbiddenError } from '../../common/errors/http-errors.js';
import { accessControl } from '../../security/authorization/access-control.js';

export class SyncService {
  private patientService = new PatientService();
  private triageService = new TriageService();
  private referralService = new ReferralService();

  /**
   * SEC-05: Strict schema validation per entity and server-side identity enforcement
   */
  public async processPush(input: SyncPushInput, user?: AuthenticatedUser) {
    if (!user) {
      throw new ForbiddenError('Authentication required to push sync mutations');
    }

    const results: Array<{
      mutationId: string;
      status: SyncStatus;
      entityId?: string;
      error?: string;
    }> = [];

    const MAX_SYNC_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    const MAX_FUTURE_DRIFT_MS = 60 * 60 * 1000; // 1 hour

    for (const mutation of input.mutations) {
      const clientTime = new Date(mutation.clientTimestamp).getTime();
      const now = Date.now();

      // Check for stale or future-drifted mutations
      if (isNaN(clientTime) || now - clientTime > MAX_SYNC_AGE_MS) {
        results.push({
          mutationId: mutation.mutationId,
          status: SyncStatus.REJECTED,
          error: 'Mutation rejected: client timestamp is stale (> 30 days old)',
        });
        continue;
      }

      if (clientTime - now > MAX_FUTURE_DRIFT_MS) {
        results.push({
          mutationId: mutation.mutationId,
          status: SyncStatus.REJECTED,
          error: 'Mutation rejected: client timestamp is in the future',
        });
        continue;
      }

      // 1. Idempotency check via clientMutationId in database
      const existingAudit = await prisma.syncAuditLog.findUnique({
        where: { clientMutationId: mutation.mutationId },
      }).catch(() => null);

      if (existingAudit) {
        results.push({
          mutationId: mutation.mutationId,
          status: existingAudit.status,
          entityId: existingAudit.entityId,
        });
        continue;
      }

      try {
        let createdEntityId = '';

        // Strip client-supplied identity overrides from payload to ensure server authority
        const sanitizedPayload = { ...mutation.payload };
        delete sanitizedPayload.registeredById;
        delete sanitizedPayload.originatingWorkerId;
        delete sanitizedPayload.role;
        delete sanitizedPayload.facilityId;

        if (mutation.entityType === 'PATIENT') {
          // Strictly validate payload with Zod schema (No arbitrary mass assignment)
          const validatedPatientInput = CreatePatientSchema.parse(sanitizedPayload);
          const patient = await this.patientService.createPatient(validatedPatientInput, user);
          createdEntityId = patient.id;
        } else if (mutation.entityType === 'TRIAGE') {
          const validatedTriageInput = CalculateTriageSchema.parse(sanitizedPayload);
          const triage = await this.triageService.saveAssessment(validatedTriageInput, user);
          createdEntityId = triage.assessment?.id || '';
        } else if (mutation.entityType === 'REFERRAL') {
          const validatedReferralInput = CreateReferralSchema.parse(sanitizedPayload);
          const referral = await this.referralService.createReferral(validatedReferralInput, user);
          createdEntityId = referral.id;
        }

        await prisma.syncAuditLog.create({
          data: {
            clientMutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: createdEntityId,
            operation: mutation.operation,
            clientTimestamp: new Date(mutation.clientTimestamp),
            serverTimestamp: new Date(),
            status: SyncStatus.SYNCED,
            userId: user.userId,
          },
        });

        results.push({
          mutationId: mutation.mutationId,
          status: SyncStatus.SYNCED,
          entityId: createdEntityId,
        });
      } catch (err: any) {
        logger.error({ err, mutationId: mutation.mutationId }, 'Offline sync mutation rejected');

        await prisma.syncAuditLog.create({
          data: {
            clientMutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: 'REJECTED',
            operation: mutation.operation,
            clientTimestamp: new Date(mutation.clientTimestamp),
            serverTimestamp: new Date(),
            status: SyncStatus.REJECTED,
            conflictDetails: { message: err.message },
            userId: user.userId,
          },
        });

        results.push({
          mutationId: mutation.mutationId,
          status: SyncStatus.REJECTED,
          error: err.message,
        });
      }
    }

    return {
      batchId: input.batchId,
      processedCount: results.length,
      serverWatermark: new Date().toISOString(),
      results,
    };
  }

  /**
   * SEC-06: Strict server-side jurisdiction isolation on Sync Pull
   */
  public async processPull(input: SyncPullInput, user?: AuthenticatedUser) {
    if (!user) {
      throw new ForbiddenError('Authentication required to pull sync updates');
    }

    const sinceDate = input.lastSyncWatermark ? new Date(input.lastSyncWatermark) : new Date(0);
    const limit = Math.min(input.limit || 100, 200);

    const patientWhere: any = { updatedAt: { gt: sinceDate } };
    const triageWhere: any = { updatedAt: { gt: sinceDate } };
    const referralWhere: any = { updatedAt: { gt: sinceDate } };

    // Apply strict server-side scoping based on worker jurisdiction
    if (user.role !== UserRole.ADMIN) {
      const worker = await accessControl.getWorkerJurisdiction(user.userId);
      if (!worker) {
        throw new ForbiddenError('Health worker jurisdiction not found');
      }

      if (user.role === UserRole.ASHA || user.role === UserRole.ANM) {
        // Enforce catchment isolation: Worker's village/taluka only
        patientWhere.OR = [
          { registeredById: worker.id },
          ...(worker.village ? [{ village: { equals: worker.village, mode: 'insensitive' } }] : []),
          ...(worker.taluka ? [{ taluka: { equals: worker.taluka, mode: 'insensitive' } }] : []),
        ];

        triageWhere.OR = [
          { assessedById: worker.id },
          { patient: { village: worker.village || undefined } },
        ];

        referralWhere.OR = [
          { originatingWorkerId: worker.id },
          { patient: { village: worker.village || undefined } },
        ];
      } else if (user.role === UserRole.DOCTOR) {
        if (worker.assignedFacilityId) {
          patientWhere.OR = [
            { registeredFacilityId: worker.assignedFacilityId },
            { referrals: { some: { destinationFacilityId: worker.assignedFacilityId } } },
          ];

          referralWhere.OR = [
            { destinationFacilityId: worker.assignedFacilityId },
            { originatingFacilityId: worker.assignedFacilityId },
          ];
        }
      }
    } else if (input.village) {
      // Admin can optionally filter by village
      patientWhere.village = { contains: input.village, mode: 'insensitive' };
    }

    const [patients, triageAssessments, referrals, facilities] = await Promise.all([
      prisma.patient.findMany({
        where: patientWhere,
        take: limit,
        orderBy: { updatedAt: 'asc' },
      }),
      prisma.triageAssessment.findMany({
        where: triageWhere,
        take: limit,
        orderBy: { updatedAt: 'asc' },
      }),
      prisma.referral.findMany({
        where: referralWhere,
        take: limit,
        orderBy: { updatedAt: 'asc' },
      }),
      prisma.facility.findMany({
        where: { updatedAt: { gt: sinceDate }, operationalStatus: 'ACTIVE' },
        take: limit,
        orderBy: { updatedAt: 'asc' },
      }),
    ]);

    return {
      serverWatermark: new Date().toISOString(),
      deltas: {
        patients,
        triageAssessments,
        referrals,
        facilities,
      },
    };
  }
}
