import { FastifyRequest, FastifyReply } from 'fastify';
import { FacilityService } from './facility.service.js';
import { CreateFacilitySchema, MatchFacilityQuerySchema } from './facility.schema.js';
import { validateBody, validateQuery, validateParams } from '../../common/validation/zod-validator.js';
import { z } from 'zod';

const FacilityParamsSchema = z.object({
  id: z.string().uuid(),
});

export class FacilityController {
  constructor(private facilityService: FacilityService) {}

  public create = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = validateBody(CreateFacilitySchema, request);
    const facility = await this.facilityService.createFacility(input);
    return reply.status(201).send({
      success: true,
      message: 'Facility created successfully',
      data: facility,
    });
  };

  public list = async (_request: FastifyRequest, reply: FastifyReply) => {
    const facilities = await this.facilityService.listFacilities();
    return reply.status(200).send({
      success: true,
      data: facilities,
    });
  };

  public getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = validateParams(FacilityParamsSchema, request);
    const facility = await this.facilityService.getFacilityById(id);
    return reply.status(200).send({
      success: true,
      data: facility,
    });
  };

  public match = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = validateQuery(MatchFacilityQuerySchema, request);
    const matches = await this.facilityService.matchFacilities(query);
    return reply.status(200).send({
      success: true,
      data: matches,
    });
  };
}
