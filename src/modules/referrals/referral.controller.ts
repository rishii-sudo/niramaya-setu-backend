import { FastifyRequest, FastifyReply } from 'fastify';
import { ReferralService } from './referral.service.js';
import { CreateReferralSchema, UpdateReferralStatusSchema, QueryReferralSchema } from './referral.schema.js';
import { validateBody, validateQuery, validateParams } from '../../common/validation/zod-validator.js';
import { AuthenticatedUser } from '../../common/types/index.js';
import { z } from 'zod';

const ReferralParamsSchema = z.object({
  id: z.string().uuid(),
});

export class ReferralController {
  constructor(private referralService: ReferralService) {}

  public create = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = validateBody(CreateReferralSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const referral = await this.referralService.createReferral(input, user);
    return reply.status(201).send({
      success: true,
      message: 'Referral created with 48-hour SLA deadline',
      data: referral,
    });
  };

  public updateStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = validateParams(ReferralParamsSchema, request);
    const input = validateBody(UpdateReferralStatusSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const referral = await this.referralService.updateStatus(id, input, user);
    return reply.status(200).send({
      success: true,
      message: `Referral status updated to ${input.status}`,
      data: referral,
    });
  };

  public getPending = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = validateQuery(QueryReferralSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const result = await this.referralService.getPendingReferrals(query, user);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  public getNoShows = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = validateQuery(QueryReferralSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const result = await this.referralService.getNoShows(query, user);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  public getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = validateParams(ReferralParamsSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const referral = await this.referralService.getById(id, user);
    return reply.status(200).send({
      success: true,
      data: referral,
    });
  };
}
