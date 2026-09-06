import { prisma } from '../../infrastructure/database/prisma.js';
import { CalculateTriageInput } from './triage.schema.js';
import { ClinicalTriageEngine } from './triage.engine.js';
import { AuthenticatedUser } from '../../common/types/index.js';

export class TriageService {
  public calculate(input: CalculateTriageInput) {
    return ClinicalTriageEngine.evaluate(input);
  }

  public async saveAssessment(input: CalculateTriageInput, user?: AuthenticatedUser) {
    const outcome = ClinicalTriageEngine.evaluate(input);

    if (!input.patientId) {
      return { assessment: null, triageResult: outcome };
    }

    const assessment = await prisma.triageAssessment.create({
      data: {
        clientId: input.clientId,
        patientId: input.patientId,
        assessedById: user?.healthWorkerId,
        systolicBp: input.systolicBp,
        diastolicBp: input.diastolicBp,
        spo2: input.spo2,
        temperature: input.temperature,
        pulse: input.pulse,
        bloodGlucose: input.bloodGlucose,
        respiratoryRate: input.respiratoryRate,
        symptoms: input.symptoms || [],
        redFlags: outcome.redFlagsDetected,
        triageCategory: outcome.triageCategory,
        clinicalRationale: outcome.clinicalRationale,
        recommendedTier: outcome.recommendedTier,
        syncedAt: new Date(),
      },
    });

    return {
      assessment,
      triageResult: outcome,
    };
  }
}
