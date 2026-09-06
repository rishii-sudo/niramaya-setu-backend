import { Patient, Referral, TriageAssessment, HealthWorker, Facility } from '@prisma/client';

export class FhirR4Serializer {
  public static serializePatient(patient: Patient) {
    const identifiers = [];

    if (patient.abhaNumber) {
      identifiers.push({
        type: { coding: [{ system: 'https://ndhm.in/fhir/identifier-type', code: 'ABHA_NUM', display: 'ABHA Number' }] },
        system: 'https://healthid.abdm.gov.in',
        value: patient.abhaNumber,
      });
    }

    if (patient.abhaAddress) {
      identifiers.push({
        type: { coding: [{ system: 'https://ndhm.in/fhir/identifier-type', code: 'ABHA_ADDR', display: 'ABHA Address' }] },
        system: 'https://healthid.abdm.gov.in',
        value: patient.abhaAddress,
      });
    }

    if (patient.aadhaarToken) {
      identifiers.push({
        type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'CZ', display: 'Aadhaar Token' }] },
        system: 'https://uidai.gov.in/token',
        value: patient.maskedAadhaar || 'XXXX-XXXX-XXXX',
      });
    }

    return {
      resourceType: 'Patient',
      id: patient.id,
      identifier: identifiers,
      active: true,
      name: [
        {
          use: 'official',
          text: patient.name,
        },
      ],
      telecom: patient.mobile
        ? [
            {
              system: 'phone',
              value: patient.mobile,
              use: 'mobile',
            },
          ]
        : [],
      gender: patient.gender.toLowerCase(),
      birthDate: patient.dob.toISOString().slice(0, 10),
      address: [
        {
          use: 'home',
          line: [patient.address || patient.village],
          city: patient.taluka || patient.village,
          district: patient.district,
          state: 'Maharashtra',
          country: 'IND',
        },
      ],
      meta: {
        lastUpdated: patient.updatedAt.toISOString(),
        profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient'],
      },
    };
  }

  public static serializeServiceRequest(
    referral: Referral & {
      patient: Patient;
      originatingFacility?: Facility | null;
      destinationFacility: Facility;
    }
  ) {
    return {
      resourceType: 'ServiceRequest',
      id: referral.id,
      identifier: [
        {
          system: 'https://niramayasetu.gov.in/referrals',
          value: referral.referralCode,
        },
      ],
      status: referral.status === 'COMPLETED' ? 'completed' : referral.status === 'CANCELLED' ? 'revoked' : 'active',
      intent: 'order',
      priority: referral.urgency === 'EMERGENCY_RED' ? 'stat' : referral.urgency === 'URGENT_YELLOW' ? 'urgent' : 'routine',
      code: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '3457005',
            display: `Referral to ${referral.specialtyRequired}`,
          },
        ],
        text: referral.specialtyRequired,
      },
      subject: {
        reference: `Patient/${referral.patientId}`,
        display: referral.patient.name,
      },
      authoredOn: referral.issuedAt.toISOString(),
      performer: [
        {
          reference: `Organization/${referral.destinationFacilityId}`,
          display: referral.destinationFacility.name,
        },
      ],
      requester: referral.originatingFacility
        ? {
            reference: `Organization/${referral.originatingFacilityId}`,
            display: referral.originatingFacility.name,
          }
        : undefined,
      note: referral.clinicalNotes ? [{ text: referral.clinicalNotes }] : [],
      meta: {
        lastUpdated: referral.updatedAt.toISOString(),
        profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/ServiceRequest'],
      },
    };
  }
}
