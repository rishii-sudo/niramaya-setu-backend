import { FastifyRequest, FastifyReply } from 'fastify';
import { TriageService } from './triage.service.js';
import { CalculateTriageSchema } from './triage.schema.js';
import { validateBody } from '../../common/validation/zod-validator.js';
import { AuthenticatedUser } from '../../common/types/index.js';

export class TriageController {
  constructor(private triageService: TriageService) {}

  public calculate = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = validateBody(CalculateTriageSchema, request);
    const result = this.triageService.calculate(input);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  public save = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = validateBody(CalculateTriageSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const result = await this.triageService.saveAssessment(input, user);
    return reply.status(201).send({
      success: true,
      message: 'Triage assessment saved',
      data: result,
    });
  };
}
