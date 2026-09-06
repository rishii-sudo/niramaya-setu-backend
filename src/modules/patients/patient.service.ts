import { prisma } from '../../infrastructure/database/prisma.js';
import { CreatePatientInput, QueryPatientInput, hashAadhaar, maskAadhaar } from './patient.schema.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../common/errors/http-errors.js';
import { AuthenticatedUser } from '../../common/types/index.js';
import { accessControl } from '../../security/authorization/access-control.js';
import { UserRole } from '@prisma/client';
import { securityAuditLogger } from '../../security/audit/security-audit-logger.js';
import { anomalyDetector } from '../../security/monitoring/anomaly-detector.js';

export class PatientService {
  public async createPatient(input: CreatePatientInput, user?: AuthenticatedUser) {
    if (!user) {
      throw new ForbiddenError('Authentication required to register patient');
    }

    let aadhaarToken: string | null = null;
    let maskedAadhaar: string | null = null;

    if (input.aadhaarNumber) {
      aadhaarToken = hashAadhaar(input.aadhaarNumber);
      maskedAadhaar = maskAadhaar(input.aadhaarNumber);

      const existingByAadhaar = await prisma.patient.findUnique({
        where: { aadhaarToken },
      });

      if (existingByAadhaar) {
        throw new ConflictError('A patient is already registered with this Aadhaar token', {
          existingPatientId: existingByAadhaar.id,
        });
      }
    }

    if (input.abhaNumber) {
      const existingByAbha = await prisma.patient.findUnique({
        where: { abhaNumber: input.abhaNumber },
      });

      if (existingByAbha) {
        throw new ConflictError('A patient is already registered with this ABHA number', {
          existingPatientId: existingByAbha.id,
        });
      }
    }

    const patient = await prisma.patient.create({
      data: {
        clientId: input.clientId,
        name: input.name,
        dob: new Date(input.dob),
        gender: input.gender,
        mobile: input.mobile,
        village: input.village,
        taluka: input.taluka,
        district: input.district,
        address: input.address,
        aadhaarToken,
        maskedAadhaar,
        abhaNumber: input.abhaNumber,
        abhaAddress: input.abhaAddress,
        registeredById: user.healthWorkerId,
        registeredFacilityId: user.facilityId,
        syncedAt: new Date(),
      },
    });

    return patient;
  }

  /**
   * SEC-01: Scoped patient queries by caller's server-side authorized jurisdiction
   */
  public async getPatients(query: QueryPatientInput, user?: AuthenticatedUser) {
    if (!user) {
      throw new ForbiddenError('Authentication required to query patients');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Apply strict server-side scoping based on worker role
    if (user.role !== UserRole.ADMIN) {
      const worker = await accessControl.getWorkerJurisdiction(user.userId);
      if (!worker) {
        throw new ForbiddenError('Health worker jurisdiction record not found');
      }

      if (user.role === UserRole.ASHA || user.role === UserRole.ANM) {
        // Restricted to assigned village or taluka or registered by this worker
        where.OR = [
          { registeredById: worker.id },
          ...(worker.village ? [{ village: { equals: worker.village, mode: 'insensitive' } }] : []),
          ...(worker.taluka ? [{ taluka: { equals: worker.taluka, mode: 'insensitive' } }] : []),
        ];
      } else if (user.role === UserRole.DOCTOR) {
        // Restricted to doctor's assigned facility or referred patients
        if (worker.assignedFacilityId) {
          where.OR = [
            { registeredFacilityId: worker.assignedFacilityId },
            {
              referrals: {
                some: {
                  OR: [
                    { destinationFacilityId: worker.assignedFacilityId },
                    { originatingFacilityId: worker.assignedFacilityId },
                  ],
                },
              },
            },
          ];
        }
      }
    }

    if (query.search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { mobile: { contains: query.search } },
            { village: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (query.village && user.role === UserRole.ADMIN) {
      where.village = { contains: query.village, mode: 'insensitive' };
    }

    if (query.aadhaarNumber) {
      where.aadhaarToken = hashAadhaar(query.aadhaarNumber);
    }

    if (query.abhaNumber) {
      where.abhaNumber = query.abhaNumber;
    }

    const [items, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          registeredBy: { select: { id: true, name: true, role: true } },
          registeredFacility: { select: { id: true, name: true, tier: true } },
        },
      }),
      prisma.patient.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * SEC-01: Protected single patient lookup with BOLA check
   */
  public async getPatientById(id: string, user?: AuthenticatedUser) {
    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        registeredBy: true,
        registeredFacility: true,
      },
    });

    if (!patient) {
      throw new NotFoundError(`Patient with ID '${id}' not found`);
    }

    await accessControl.assertPatientAccess(user, patient, 'READ');

    if (user) {
      anomalyDetector.recordPatientAccess(user.userId, patient.id);
      securityAuditLogger.logEvent({
        eventType: 'PATIENT_RECORD_ACCESSED',
        actorId: user.userId,
        actorRole: user.role,
        facilityId: user.facilityId,
        resourceType: 'PATIENT',
        resourceId: patient.id,
        result: 'SUCCESS',
      });
    }

    return patient;
  }

  /**
   * SEC-01: Protected clinical history lookup with BOLA check
   */
  public async getPatientHistory(id: string, user?: AuthenticatedUser) {
    const patient = await this.getPatientById(id, user);

    if (user) {
      securityAuditLogger.logEvent({
        eventType: 'PATIENT_HISTORY_ACCESSED',
        actorId: user.userId,
        actorRole: user.role,
        facilityId: user.facilityId,
        resourceType: 'PATIENT_HISTORY',
        resourceId: patient.id,
        result: 'SUCCESS',
      });
    }

    const [triageHistory, referralHistory] = await Promise.all([
      prisma.triageAssessment.findMany({
        where: { patientId: id },
        orderBy: { evaluatedAt: 'desc' },
        include: {
          assessedBy: { select: { id: true, name: true, role: true } },
        },
      }),
      prisma.referral.findMany({
        where: { patientId: id },
        orderBy: { issuedAt: 'desc' },
        include: {
          originatingWorker: { select: { id: true, name: true, role: true } },
          originatingFacility: { select: { id: true, name: true, tier: true } },
          destinationFacility: { select: { id: true, name: true, tier: true, contactPhone: true } },
          alerts: true,
        },
      }),
    ]);

    return {
      patient,
      triageHistory,
      referralHistory,
    };
  }
}
