import { prisma } from '../../infrastructure/database/prisma.js';
import { CreateReferralInput, QueryReferralInput, UpdateReferralStatusInput } from './referral.schema.js';
import { ReferralStatus, TriageCategory, UserRole } from '@prisma/client';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../common/errors/http-errors.js';
import { AuthenticatedUser } from '../../common/types/index.js';
import { queueManager } from '../../infrastructure/queue/queue-manager.js';
import { generateSecureReferralCode } from '../../security/crypto/aadhaar-token.js';
import { accessControl } from '../../security/authorization/access-control.js';

export class ReferralService {
  public async createReferral(input: CreateReferralInput, user?: AuthenticatedUser) {
    if (!user) {
      throw new ForbiddenError('Authentication required to create a referral');
    }

    const patient = await prisma.patient.findUnique({
      where: { id: input.patientId },
    });

    if (!patient) {
      throw new NotFoundError(`Patient with ID '${input.patientId}' not found`);
    }

    // Verify patient access before allowing referral creation
    await accessControl.assertPatientAccess(user, patient, 'READ');

    const facility = await prisma.facility.findUnique({
      where: { id: input.destinationFacilityId },
    });

    if (!facility) {
      throw new NotFoundError(`Destination facility with ID '${input.destinationFacilityId}' not found`);
    }

    const issuedAt = new Date();
    // 48-Hour SLA
    const slaExpiresAt = new Date(issuedAt.getTime() + 48 * 60 * 60 * 1000);
    // SEC-08: Cryptographically secure referral code
    const referralCode = generateSecureReferralCode();

    const referral = await prisma.referral.create({
      data: {
        referralCode,
        clientId: input.clientId,
        patientId: input.patientId,
        triageId: input.triageId,
        originatingWorkerId: user.healthWorkerId,
        originatingFacilityId: user.facilityId,
        destinationFacilityId: input.destinationFacilityId,
        specialtyRequired: input.specialtyRequired,
        urgency: input.urgency || TriageCategory.ROUTINE_GREEN,
        clinicalNotes: input.clinicalNotes,
        status: ReferralStatus.ISSUED,
        issuedAt,
        slaExpiresAt,
        syncedAt: new Date(),
      },
      include: {
        patient: true,
        destinationFacility: true,
        originatingFacility: true,
      },
    });

    // Schedule 24-hr reminder and 48-hr No-Show SLA watchdog
    await queueManager.scheduleReferralAlerts({
      referralId: referral.id,
      referralCode: referral.referralCode,
      patientId: referral.patientId,
      issuedAt,
      slaExpiresAt,
    });

    return referral;
  }

  /**
   * SEC-02: Enforce strict state machine and destination/originating facility authorization
   */
  public async updateStatus(id: string, input: UpdateReferralStatusInput, user?: AuthenticatedUser) {
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    const referral = await prisma.referral.findUnique({
      where: { id },
    });

    if (!referral) {
      throw new NotFoundError(`Referral with ID '${id}' not found`);
    }

    // 1. Validate State Transition rules
    accessControl.validateReferralTransition(referral.status, input.status);

    // 2. Validate Action Authorization
    let action: 'TRANSIT' | 'ACKNOWLEDGE' | 'COMPLETE' | 'CANCEL' = 'TRANSIT';
    if (input.status === ReferralStatus.IN_TRANSIT) action = 'TRANSIT';
    else if (input.status === ReferralStatus.ACKNOWLEDGED) action = 'ACKNOWLEDGE';
    else if (input.status === ReferralStatus.COMPLETED) action = 'COMPLETE';
    else if (input.status === ReferralStatus.CANCELLED) action = 'CANCEL';

    await accessControl.assertReferralAccess(user, referral, action);

    const updateData: any = {
      status: input.status,
      version: { increment: 1 },
      updatedAt: new Date(),
    };

    if (input.status === ReferralStatus.ACKNOWLEDGED) {
      updateData.acknowledgedAt = new Date();
    } else if (input.status === ReferralStatus.COMPLETED) {
      updateData.completedAt = new Date();
      queueManager.cancelScheduledAlerts(id);
    } else if (input.status === ReferralStatus.CANCELLED) {
      updateData.cancelledAt = new Date();
      queueManager.cancelScheduledAlerts(id);
    }

    if (input.notes) {
      updateData.clinicalNotes = referral.clinicalNotes
        ? `${referral.clinicalNotes}\n[Status Update: ${input.status}]: ${input.notes}`
        : input.notes;
    }

    return prisma.referral.update({
      where: { id },
      data: updateData,
      include: {
        patient: true,
        originatingFacility: true,
        destinationFacility: true,
        alerts: true,
      },
    });
  }

  public async getPendingReferrals(query: QueryReferralInput, user?: AuthenticatedUser) {
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      status: { in: [ReferralStatus.ISSUED, ReferralStatus.IN_TRANSIT, ReferralStatus.ACKNOWLEDGED] },
    };

    if (user.role !== UserRole.ADMIN) {
      if (user.facilityId) {
        where.destinationFacilityId = user.facilityId;
      } else if (user.healthWorkerId) {
        where.originatingWorkerId = user.healthWorkerId;
      }
    } else if (query.destinationFacilityId) {
      where.destinationFacilityId = query.destinationFacilityId;
    }

    const [items, total] = await Promise.all([
      prisma.referral.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ urgency: 'asc' }, { issuedAt: 'desc' }],
        include: {
          patient: true,
          originatingWorker: { select: { id: true, name: true, role: true, mobile: true } },
          originatingFacility: { select: { id: true, name: true, tier: true } },
          destinationFacility: { select: { id: true, name: true, tier: true } },
        },
      }),
      prisma.referral.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async getNoShows(query: QueryReferralInput, user?: AuthenticatedUser) {
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      status: ReferralStatus.NO_SHOW,
    };

    if (user.role !== UserRole.ADMIN) {
      if (user.healthWorkerId) {
        where.originatingWorkerId = user.healthWorkerId;
      }
    } else if (query.originatingWorkerId) {
      where.originatingWorkerId = query.originatingWorkerId;
    }

    const [items, total] = await Promise.all([
      prisma.referral.findMany({
        where,
        skip,
        take: limit,
        orderBy: { slaExpiresAt: 'desc' },
        include: {
          patient: true,
          originatingWorker: { select: { id: true, name: true, mobile: true, village: true } },
          destinationFacility: { select: { id: true, name: true, contactPhone: true } },
          alerts: true,
        },
      }),
      prisma.referral.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async getById(id: string, user?: AuthenticatedUser) {
    const referral = await prisma.referral.findUnique({
      where: { id },
      include: {
        patient: true,
        triage: true,
        originatingWorker: true,
        originatingFacility: true,
        destinationFacility: true,
        alerts: true,
      },
    });

    if (!referral) {
      throw new NotFoundError(`Referral with ID '${id}' not found`);
    }

    await accessControl.assertReferralAccess(user, referral, 'READ');
    return referral;
  }
}
