import { FastifyRequest, FastifyReply } from 'fastify';
import { SyncService } from './sync.service.js';
import { SyncPushSchema, SyncPullSchema } from './sync.schema.js';
import { validateBody } from '../../common/validation/zod-validator.js';
import { AuthenticatedUser } from '../../common/types/index.js';

export class SyncController {
  constructor(private syncService: SyncService) {}

  public push = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = validateBody(SyncPushSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const result = await this.syncService.processPush(input, user);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  public pull = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = validateBody(SyncPullSchema, request);
    const user = request.user as AuthenticatedUser | undefined;
    const result = await this.syncService.processPull(input, user);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };
}
