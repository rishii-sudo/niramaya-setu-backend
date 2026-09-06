import { TriageCategory, FacilityTier } from '@prisma/client';
import { CalculateTriageInput, TriageResult } from './triage.schema.js';

// Standardized critical red flag symptom patterns
const RED_FLAG_SYMPTOMS = [
  'unconscious',
  'altered mental status',
  'severe chest pain',
  'severe breathlessness',
  'cyanosis',
  'active seizure',
  'postpartum hemorrhage',
  'severe head injury',
  'heavy vaginal bleeding',
  'anaphylaxis',
];

const YELLOW_FLAG_SYMPTOMS = [
  'moderate breathlessness',
  'high fever > 3 days',
  'severe abdominal pain',
  'fracture suspected',
  'dehydration',
  'persistent vomiting',
  'burns > 10%',
  'uncontrolled diabetes',
];

export class ClinicalTriageEngine {
  public static evaluate(input: CalculateTriageInput): TriageResult {
    const reasons: string[] = [];
    const detectedRedFlags: string[] = [];

    // Vitals Flags
    let isBpCritical = false;
    let isSpo2Critical = false;
    let isTempCritical = false;
    let isPulseCritical = false;
    let isGlucoseCritical = false;

    let isBpUrgent = false;
    let isSpo2Urgent = false;
    let isTempUrgent = false;
    let isPulseUrgent = false;
    let isGlucoseUrgent = false;

    // 1. SpO2 Analysis
    if (input.spo2 !== undefined && input.spo2 !== null) {
      if (input.spo2 < 90) {
        isSpo2Critical = true;
        reasons.push(`Critical hypoxemia: SpO2 is ${input.spo2}% (< 90%)`);
      } else if (input.spo2 < 95) {
        isSpo2Urgent = true;
        reasons.push(`Mild hypoxemia: SpO2 is ${input.spo2}% (90-94%)`);
      }
    }

    // 2. Blood Pressure Analysis
    if (input.systolicBp !== undefined && input.systolicBp !== null) {
      if (input.systolicBp >= 180 || input.systolicBp < 80) {
        isBpCritical = true;
        reasons.push(`Critical Blood Pressure: Systolic BP is ${input.systolicBp} mmHg`);
      } else if (input.systolicBp >= 140 || (input.diastolicBp && input.diastolicBp >= 90)) {
        isBpUrgent = true;
        reasons.push(`Elevated Blood Pressure: ${input.systolicBp}/${input.diastolicBp || '-'} mmHg`);
      }
    }

    // 3. Pulse Analysis
    if (input.pulse !== undefined && input.pulse !== null) {
      if (input.pulse > 130 || input.pulse < 45) {
        isPulseCritical = true;
        reasons.push(`Severe arrhythmia/rate abnormality: Pulse is ${input.pulse} bpm`);
      } else if (input.pulse > 105 || input.pulse < 55) {
        isPulseUrgent = true;
        reasons.push(`Abnormal pulse rate: ${input.pulse} bpm`);
      }
    }

    // 4. Temperature Analysis
    if (input.temperature !== undefined && input.temperature !== null) {
      if (input.temperature >= 104 || input.temperature < 95) {
        isTempCritical = true;
        reasons.push(`Critical Temperature: ${input.temperature}°F`);
      } else if (input.temperature >= 101) {
        isTempUrgent = true;
        reasons.push(`Moderate-to-high fever: ${input.temperature}°F`);
      }
    }

    // 5. Blood Glucose Analysis
    if (input.bloodGlucose !== undefined && input.bloodGlucose !== null) {
      if (input.bloodGlucose > 350 || input.bloodGlucose < 50) {
        isGlucoseCritical = true;
        reasons.push(`Critical glycemic emergency: Blood Glucose is ${input.bloodGlucose} mg/dL`);
      } else if (input.bloodGlucose > 200 || input.bloodGlucose < 70) {
        isGlucoseUrgent = true;
        reasons.push(`Abnormal blood glucose level: ${input.bloodGlucose} mg/dL`);
      }
    }

    // 6. Symptoms Check
    const allSymptoms = [...(input.symptoms || []), ...(input.redFlags || [])].map((s) => s.toLowerCase());

    for (const sym of allSymptoms) {
      if (RED_FLAG_SYMPTOMS.some((rf) => sym.includes(rf))) {
        detectedRedFlags.push(sym);
        reasons.push(`Emergency symptom red flag: ${sym}`);
      } else if (YELLOW_FLAG_SYMPTOMS.some((yf) => sym.includes(yf))) {
        reasons.push(`Urgent clinical symptom: ${sym}`);
      }
    }

    // 7. Determine Category & Recommended Tier
    const hasEmergencyCriteria =
      isBpCritical || isSpo2Critical || isTempCritical || isPulseCritical || isGlucoseCritical || detectedRedFlags.length > 0;

    const hasUrgentCriteria =
      isBpUrgent || isSpo2Urgent || isTempUrgent || isPulseUrgent || isGlucoseUrgent || reasons.length > 0;

    let triageCategory: TriageCategory;
    let recommendedTier: FacilityTier;
    let clinicalRationale: string;

    if (hasEmergencyCriteria) {
      triageCategory = TriageCategory.EMERGENCY_RED;
      recommendedTier = FacilityTier.DISTRICT_HOSPITAL;
      clinicalRationale = `EMERGENCY RED: Patient presents with life-threatening findings requiring immediate resuscitation and emergency care at CHC/District Hospital. Findings: ${reasons.join('; ')}.`;
    } else if (hasUrgentCriteria) {
      triageCategory = TriageCategory.URGENT_YELLOW;
      recommendedTier = FacilityTier.CHC;
      clinicalRationale = `URGENT YELLOW: Patient requires prompt evaluation and medical intervention within 2-4 hours at PHC/CHC. Findings: ${reasons.join('; ')}.`;
    } else {
      triageCategory = TriageCategory.ROUTINE_GREEN;
      recommendedTier = FacilityTier.PHC;
      clinicalRationale =
        'ROUTINE GREEN: Vitals and symptoms are stable. Non-urgent primary care evaluation at Sub-Center or Primary Health Center (PHC).';
    }

    return {
      triageCategory,
      clinicalRationale,
      recommendedTier,
      redFlagsDetected: detectedRedFlags,
      vitalsSummary: {
        isBpCritical,
        isSpo2Critical,
        isTempCritical,
        isPulseCritical,
        isGlucoseCritical,
      },
    };
  }
}
