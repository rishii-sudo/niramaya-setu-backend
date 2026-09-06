import bcrypt from 'bcryptjs';
import { prisma } from '../../infrastructure/database/prisma.js';
import { UnauthorizedError, ConflictError } from '../../common/errors/http-errors.js';
import { LoginInput, RegisterUserInput } from './auth.schema.js';
import { FastifyInstance } from 'fastify';
import { securityAuditLogger } from '../../security/audit/security-audit-logger.js';
import { anomalyDetector } from '../../security/monitoring/anomaly-detector.js';

export class AuthService {
  constructor(private app: FastifyInstance) {}

  public async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { username: input.username },
      include: {
        healthWorker: {
          include: {
            assignedFacility: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      anomalyDetector.recordFailedLogin(input.username);
      securityAuditLogger.logEvent({
        eventType: 'LOGIN_FAILURE',
        actorId: input.username,
        result: 'FAILURE',
        metadata: { reason: 'User not found or inactive' },
      });
      throw new UnauthorizedError('Invalid username or password');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      anomalyDetector.recordFailedLogin(input.username);
      securityAuditLogger.logEvent({
        eventType: 'LOGIN_FAILURE',
        actorId: input.username,
        actorRole: user.role,
        result: 'FAILURE',
        metadata: { reason: 'Invalid credentials' },
      });
      throw new UnauthorizedError('Invalid username or password');
    }

    anomalyDetector.recordSuccessfulLogin(input.username);
    securityAuditLogger.logEvent({
      eventType: 'LOGIN_SUCCESS',
      actorId: user.id,
      actorRole: user.role,
      facilityId: user.healthWorker?.assignedFacilityId ?? undefined,
      result: 'SUCCESS',
    });

    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      healthWorkerId: user.healthWorker?.id,
      facilityId: user.healthWorker?.assignedFacilityId ?? undefined,
    };

    const token = this.app.jwt.sign(payload);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        healthWorker: user.healthWorker
          ? {
              id: user.healthWorker.id,
              name: user.healthWorker.name,
              mobile: user.healthWorker.mobile,
              village: user.healthWorker.village,
              facility: user.healthWorker.assignedFacility
                ? {
                    id: user.healthWorker.assignedFacility.id,
                    name: user.healthWorker.assignedFacility.name,
                    tier: user.healthWorker.assignedFacility.tier,
                  }
                : null,
            }
          : null,
      },
    };
  }

  public async register(input: RegisterUserInput) {
    const existingUser = await prisma.user.findUnique({
      where: { username: input.username },
    });

    if (existingUser) {
      throw new ConflictError('Username is already taken');
    }

    const existingWorker = await prisma.healthWorker.findUnique({
      where: { mobile: input.mobile },
    });

    if (existingWorker) {
      throw new ConflictError('Health worker with this mobile number already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: input.username,
          passwordHash,
          role: input.role,
        },
      });

      const worker = await tx.healthWorker.create({
        data: {
          userId: user.id,
          name: input.name,
          mobile: input.mobile,
          role: input.role,
          village: input.village,
          taluka: input.taluka,
          district: input.district,
          assignedFacilityId: input.assignedFacilityId,
        },
      });

      return { user, worker };
    });

    return {
      id: result.user.id,
      username: result.user.username,
      role: result.user.role,
      healthWorkerId: result.worker.id,
    };
  }
}
