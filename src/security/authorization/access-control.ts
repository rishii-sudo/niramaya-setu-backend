import { prisma } from '../../infrastructure/database/prisma.js';
import { AuthenticatedUser } from '../../common/types/index.js';
import { UserRole, ReferralStatus, Patient, Referral, Facility } from '@prisma/client';
import { ForbiddenError, NotFoundError, BadRequestError } from '../../common/errors/http-errors.js';
import { securityAuditLogger } from '../audit/security-audit-logger.js';
import { anomalyDetector } from '../monitoring/anomaly-detector.js';

export interface HealthWorkerJurisdiction {
  id: string;
  userId: string;
  name: string;
  role: UserRole;
  village: string | null;
  taluka: string | null;
  district: string | null;
  assignedFacilityId: string | null;
  assignedFacility?: Facility | null;
}

export class AccessControlService {
  /**
   * Look up full server-side jurisdiction details for authenticated worker
   */
  public async getWorkerJurisdiction(userId: string): Promise<HealthWorkerJurisdiction | null> {
    return prisma.healthWorker.findUnique({
      where: { userId },
      include: { assignedFacility: true },
    });
  }

  /**
   * SEC-01: Verify that caller is authorized to view or access a patient
   */
  public async assertPatientAccess(
    user: AuthenticatedUser | undefined,
    patient: Patient | null,
    operation: 'READ' | 'WRITE' = 'READ'
  ): Promise<void> {
    if (!user) {
      throw new ForbiddenError('Authentication required to access patient record');
    }

    // Safe error message to avoid revealing patient existence
    if (!patient) {
      throw new NotFoundError('Patient record not found');
    }

    // 1. ADMIN has global/district access
    if (user.role === UserRole.ADMIN) {
      return;
    }

    const worker = await this.getWorkerJurisdiction(user.userId);
    if (!worker) {
      throw new ForbiddenError('Health worker profile not found');
    }

    // 2. Direct Registrant has access
    if (patient.registeredById === worker.id) {
      return;
    }

    // 3. ASHA / ANM: Catchment Area (Village / Taluka) Check
    if (user.role === UserRole.ASHA || user.role === UserRole.ANM) {
      const matchesVillage = worker.village && patient.village && worker.village.trim().toLowerCase() === patient.village.trim().toLowerCase();
      const matchesTaluka = worker.taluka && patient.taluka && worker.taluka.trim().toLowerCase() === patient.taluka.trim().toLowerCase();

      if (matchesVillage || matchesTaluka) {
        return;
      }

      securityAuditLogger.logEvent({
        eventType: 'BOLA_ATTEMPT',
        actorId: user.userId,
        actorRole: user.role,
        resourceType: 'PATIENT',
        resourceId: patient.id,
        result: 'DENIED',
        metadata: { reason: 'Catchment boundary violation', workerVillage: worker.village || '' },
      });
      anomalyDetector.recordAuthorizationFailure(user.userId, 'PATIENT', patient.id);

      throw new ForbiddenError('Access denied: Patient is outside your assigned village catchment area');
    }

    // 4. DOCTOR: Facility & Referral Relationship Check
    if (user.role === UserRole.DOCTOR) {
      if (worker.assignedFacilityId && patient.registeredFacilityId === worker.assignedFacilityId) {
        return;
      }

      // Check if patient has any referral directed to or originating from doctor's facility
      if (worker.assignedFacilityId) {
        const hasReferral = await prisma.referral.findFirst({
          where: {
            patientId: patient.id,
            OR: [
              { destinationFacilityId: worker.assignedFacilityId },
              { originatingFacilityId: worker.assignedFacilityId },
            ],
          },
        });

        if (hasReferral) {
          return;
        }
      }

      securityAuditLogger.logEvent({
        eventType: 'BOLA_ATTEMPT',
        actorId: user.userId,
        actorRole: user.role,
        facilityId: worker.assignedFacilityId || undefined,
        resourceType: 'PATIENT',
        resourceId: patient.id,
        result: 'DENIED',
        metadata: { reason: 'Doctor has no active referral or admission for patient' },
      });
      anomalyDetector.recordAuthorizationFailure(user.userId, 'PATIENT', patient.id);

      throw new ForbiddenError('Access denied: Patient is not referred to or admitted in your health facility');
    }

    securityAuditLogger.logEvent({
      eventType: 'AUTHORIZATION_FAILURE',
      actorId: user.userId,
      actorRole: user.role,
      resourceType: 'PATIENT',
      resourceId: patient.id,
      result: 'DENIED',
    });
    anomalyDetector.recordAuthorizationFailure(user.userId, 'PATIENT', patient.id);

    throw new ForbiddenError('Unauthorized access to patient record');
  }

  /**
   * SEC-02: Validate strict state transitions
   */
  public validateReferralTransition(currentStatus: ReferralStatus, newStatus: ReferralStatus): void {
    const validTransitions: Record<ReferralStatus, ReferralStatus[]> = {
      [ReferralStatus.DRAFT]: [ReferralStatus.ISSUED, ReferralStatus.CANCELLED],
      [ReferralStatus.ISSUED]: [ReferralStatus.IN_TRANSIT, ReferralStatus.ACKNOWLEDGED, ReferralStatus.CANCELLED],
      [ReferralStatus.IN_TRANSIT]: [ReferralStatus.ACKNOWLEDGED, ReferralStatus.CANCELLED],
      [ReferralStatus.ACKNOWLEDGED]: [ReferralStatus.COMPLETED, ReferralStatus.CANCELLED],
      [ReferralStatus.COMPLETED]: [], // Terminal state
      [ReferralStatus.NO_SHOW]: [ReferralStatus.ACKNOWLEDGED, ReferralStatus.CANCELLED], // Re-opened on late arrival
      [ReferralStatus.CANCELLED]: [], // Terminal state
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestError(
        `Invalid referral state transition: Cannot change status from '${currentStatus}' to '${newStatus}'`
      );
    }
  }

  /**
   * SEC-02: Verify that caller is authorized to modify or view a referral
   */
  public async assertReferralAccess(
    user: AuthenticatedUser | undefined,
    referral: Referral | null,
    action: 'READ' | 'TRANSIT' | 'ACKNOWLEDGE' | 'COMPLETE' | 'CANCEL'
  ): Promise<void> {
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    if (!referral) {
      throw new NotFoundError('Referral record not found');
    }

    if (user.role === UserRole.ADMIN) {
      return;
    }

    const worker = await this.getWorkerJurisdiction(user.userId);
    if (!worker) {
      throw new ForbiddenError('Health worker profile not found');
    }

    // READ access
    if (action === 'READ') {
      const isOriginator = referral.originatingWorkerId === worker.id;
      const isOriginatingFacility = worker.assignedFacilityId && referral.originatingFacilityId === worker.assignedFacilityId;
      const isDestinationFacility = worker.assignedFacilityId && referral.destinationFacilityId === worker.assignedFacilityId;

      if (isOriginator || isOriginatingFacility || isDestinationFacility) {
        return;
      }

      throw new ForbiddenError('Access denied: Referral is not associated with your account or facility');
    }

    // IN_TRANSIT (Health Worker or Originating Facility)
    if (action === 'TRANSIT') {
      if (referral.originatingWorkerId === worker.id || referral.originatingFacilityId === worker.assignedFacilityId) {
        return;
      }
      throw new ForbiddenError('Only originating health worker can mark referral as in-transit');
    }

    // ACKNOWLEDGE & COMPLETE (Destination Facility Doctor only)
    if (action === 'ACKNOWLEDGE' || action === 'COMPLETE') {
      if (!worker.assignedFacilityId || worker.assignedFacilityId !== referral.destinationFacilityId) {
        throw new ForbiddenError('Only medical staff at the destination health facility can acknowledge or complete this referral');
      }
      return;
    }

    // CANCEL (Originating Worker, Originating Facility, or Admin)
    if (action === 'CANCEL') {
      if (referral.originatingWorkerId === worker.id || referral.originatingFacilityId === worker.assignedFacilityId) {
        return;
      }
      throw new ForbiddenError('Only originating health worker or administrator can cancel this referral');
    }

    throw new ForbiddenError('Unauthorized referral operation');
  }

  /**
   * SEC-03: FHIR Resource-level consent and relationship validation
   */
  public async assertFhirAccess(
    user: AuthenticatedUser | undefined,
    resourceType: 'Patient' | 'ServiceRequest',
    resourceId: string
  ): Promise<void> {
    if (!user) {
      throw new ForbiddenError('Authentication required for FHIR data exchange');
    }

    if (user.role === UserRole.ADMIN) {
      return;
    }

    if (resourceType === 'Patient') {
      const patient = await prisma.patient.findUnique({ where: { id: resourceId } });
      await this.assertPatientAccess(user, patient, 'READ');
      return;
    }

    if (resourceType === 'ServiceRequest') {
      const referral = await prisma.referral.findUnique({ where: { id: resourceId } });
      await this.assertReferralAccess(user, referral, 'READ');
      return;
    }

    throw new ForbiddenError('Unsupported FHIR resource type');
  }
}

export const accessControl = new AccessControlService();
