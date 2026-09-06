import { FastifyRequest, FastifyReply } from 'fastify';
import { PatientService } from './patient.service.js';
import { CreatePatientSchema, QueryPatientSchema } from './patient.schema.js';
import { validateBody, validateQuery, validateParams } from '../../common/validation/zod-validator.js';
import { AuthenticatedUser } from '../../common/types/index.js';
import { z } from 'zod';

const PatientParamsSchema = z.object({
  id: z.string().uuid(),
});

export class PatientController {
  constructor(private patientService: PatientService) {}

  public create = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = validateBody(CreatePatientSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const patient = await this.patientService.createPatient(input, user);
    return reply.status(201).send({
      success: true,
      message: 'Patient registered successfully',
      data: patient,
    });
  };

  public list = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = validateQuery(QueryPatientSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const result = await this.patientService.getPatients(query, user);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  public getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = validateParams(PatientParamsSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const patient = await this.patientService.getPatientById(id, user);
    return reply.status(200).send({
      success: true,
      data: patient,
    });
  };

  public getHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = validateParams(PatientParamsSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const history = await this.patientService.getPatientHistory(id, user);
    return reply.status(200).send({
      success: true,
      data: history,
    });
  };
}
