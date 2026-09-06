import { FastifyRequest, FastifyReply } from 'fastify';
import { FhirService } from './fhir.service.js';
import { z } from 'zod';
import { validateParams } from '../../common/validation/zod-validator.js';
import { AuthenticatedUser } from '../../common/types/index.js';

const ResourceParamsSchema = z.object({
  id: z.string().uuid(),
});

export class FhirController {
  constructor(private fhirService: FhirService) {}

  public getPatient = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = validateParams(ResourceParamsSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const resource = await this.fhirService.getPatientResource(id, user);
    return reply.status(200).send(resource);
  };

  public getServiceRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = validateParams(ResourceParamsSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const resource = await this.fhirService.getServiceRequestResource(id, user);
    return reply.status(200).send(resource);
  };
}
