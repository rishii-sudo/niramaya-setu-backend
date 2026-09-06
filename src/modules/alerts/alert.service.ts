import { prisma } from '../../infrastructure/database/prisma.js';
import { AlertType, AlertStatus, ReferralStatus } from '@prisma/client';
import { logger } from '../../common/logger/index.js';
import { NoShowJobData } from '../../infrastructure/queue/queue-manager.js';

export class AlertService {
  public async handleSlaJob(data: NoShowJobData) {
    const referral = await prisma.referral.findUnique({
      where: { id: data.referralId },
      include: { patient: true, originatingWorker: true, destinationFacility: true },
    });

    if (!referral) {
      logger.warn({ referralId: data.referralId }, 'Referral not found during SLA job processing');
      return;
    }

    // If referral is already completed or cancelled, do nothing
    if (referral.status === ReferralStatus.COMPLETED || referral.status === ReferralStatus.CANCELLED) {
      logger.info({ referralId: referral.id, status: referral.status }, 'Referral already resolved, skipping alert');
      return;
    }

    // 1. 24-Hour Reminder
    if (data.scheduledType === 'REMINDER_24H') {
      if (referral.status === ReferralStatus.ISSUED || referral.status === ReferralStatus.IN_TRANSIT) {
        await prisma.referralAlert.create({
          data: {
            referralId: referral.id,
            alertType: AlertType.REMINDER_24H,
            targetWorkerId: referral.originatingWorkerId,
            status: AlertStatus.NOTIFIED,
            message: `24-Hour Reminder: Patient ${referral.patient.name} has not yet arrived at ${referral.destinationFacility.name}. Please follow up.`,
            triggerAt: new Date(),
            triggeredAt: new Date(),
          },
        });
        logger.info({ referralCode: referral.referralCode }, '24-hour reminder alert created for health worker');
      }
      return;
    }

    // 2. 48-Hour Deadline (No-Show Escalation)
    if (data.scheduledType === 'NO_SHOW_48H') {
      if (referral.status === ReferralStatus.ISSUED || referral.status === ReferralStatus.IN_TRANSIT) {
        // Transition to NO_SHOW
        await prisma.referral.update({
          where: { id: referral.id },
          data: {
            status: ReferralStatus.NO_SHOW,
            updatedAt: new Date(),
          },
        });

        // Create high-priority home-visit escalation alert for ASHA/ANM
        await prisma.referralAlert.create({
          data: {
            referralId: referral.id,
            alertType: AlertType.NO_SHOW_ESCALATION_48H,
            targetWorkerId: referral.originatingWorkerId,
            status: AlertStatus.ESCALATED,
            message: `URGENT NO-SHOW (48h Exceeded): Patient ${referral.patient.name} (${referral.patient.village}) missed referral to ${referral.destinationFacility.name}. ASHA/ANM home visit required.`,
            triggerAt: new Date(),
            triggeredAt: new Date(),
          },
        });

        logger.warn({ referralCode: referral.referralCode, patientId: referral.patientId }, '🚨 48h SLA breached: Marked as NO_SHOW and escalated to health worker');
      }
    }
  }

  public async getPendingAlertsForWorker(workerId: string) {
    return prisma.referralAlert.findMany({
      where: {
        targetWorkerId: workerId,
        status: { in: [AlertStatus.PENDING, AlertStatus.NOTIFIED, AlertStatus.ESCALATED] },
      },
      include: {
        referral: {
          include: {
            patient: true,
            destinationFacility: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async resolveAlert(alertId: string) {
    return prisma.referralAlert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });
  }
}

export const alertService = new AlertService();
