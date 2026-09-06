import { prisma } from '../../infrastructure/database/prisma.js';
import { FhirR4Serializer } from './fhir.serializer.js';
import { NotFoundError } from '../../common/errors/http-errors.js';
import { AuthenticatedUser } from '../../common/types/index.js';
import { accessControl } from '../../security/authorization/access-control.js';

export class FhirService {
  public async getPatientResource(patientId: string, user?: AuthenticatedUser) {
    // SEC-03: Resource-level consent and relationship validation
    await accessControl.assertFhirAccess(user, 'Patient', patientId);

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new NotFoundError(`FHIR Patient resource '${patientId}' not found`);
    }

    return FhirR4Serializer.serializePatient(patient);
  }

  public async getServiceRequestResource(referralId: string, user?: AuthenticatedUser) {
    // SEC-03: Resource-level relationship validation
    await accessControl.assertFhirAccess(user, 'ServiceRequest', referralId);

    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
      include: {
        patient: true,
        originatingFacility: true,
        destinationFacility: true,
      },
    });

    if (!referral) {
      throw new NotFoundError(`FHIR ServiceRequest resource '${referralId}' not found`);
    }

    return FhirR4Serializer.serializeServiceRequest(referral);
  }
}
