import { logger } from '../../common/logger/index.js';
import { TriageCategory } from '@prisma/client';

export interface AiTriageAssistRequest {
  symptoms: string[];
  vitals: {
    bp?: string;
    spo2?: number;
    temp?: number;
    pulse?: number;
    glucose?: number;
  };
  patientAge?: number;
  notes?: string;
}

export interface AiTriageAssistResponse {
  suggestedUrgency: TriageCategory;
  clinicalSummary: string;
  suggestedQuestions: string[];
  suggestedSpecialties: string[];
  confidenceScore: number;
  provider: string;
  isStub: boolean;
}

export interface IAiClinicalAdapter {
  assistTriage(request: AiTriageAssistRequest): Promise<AiTriageAssistResponse>;
  summarizeReferralHistory(notes: string[]): Promise<{ summary: string; provider: string; isStub: boolean }>;
}

export class PluggableAiAdapter implements IAiClinicalAdapter {
  public async assistTriage(request: AiTriageAssistRequest): Promise<AiTriageAssistResponse> {
    logger.info({ symptomCount: request.symptoms.length }, 'AI Clinical Adapter: Processing triage assistance request');

    // Integration Boundary: Pluggable for Google Gemini Healthcare API or Local LLM
    return {
      suggestedUrgency: TriageCategory.ROUTINE_GREEN,
      clinicalSummary: `Pluggable AI Interface: Ready for LLM provider integration. Analyzed ${request.symptoms.length} symptoms and vitals.`,
      suggestedQuestions: [
        'How many days have symptoms persisted?',
        'Any prior history of cardiovascular or respiratory illness?',
      ],
      suggestedSpecialties: ['General Medicine'],
      confidenceScore: 0.85,
      provider: 'pluggable-adapter-stub',
      isStub: true,
    };
  }

  public async summarizeReferralHistory(notes: string[]) {
    return {
      summary: `Pluggable AI Clinical Summary: Consolidated ${notes.length} clinical encounter notes.`,
      provider: 'pluggable-adapter-stub',
      isStub: true,
    };
  }
}

export const aiAdapter: IAiClinicalAdapter = new PluggableAiAdapter();
