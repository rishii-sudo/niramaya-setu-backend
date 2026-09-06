import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service.js';
import { LoginSchema, RegisterUserSchema } from './auth.schema.js';
import { validateBody } from '../../common/validation/zod-validator.js';
import { sessionManager } from '../../security/session/session-manager.js';

export class AuthController {
  constructor(private authService: AuthService) {}

  public login = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = validateBody(LoginSchema, request);
    const result = await this.authService.login(input);
    return reply.status(200).send({
      success: true,
      message: 'Login successful',
      data: result,
    });
  };

  public register = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = validateBody(RegisterUserSchema, request);
    const result = await this.authService.register(input);
    return reply.status(201).send({
      success: true,
      message: 'User registered successfully',
      data: result,
    });
  };

  public getMe = async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      success: true,
      data: {
        user: request.user,
      },
    });
  };

  public logout = async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      sessionManager.revokeToken(token, 28800, 'USER_LOGOUT');
    }
    return reply.status(200).send({
      success: true,
      message: 'Logged out successfully; session invalidated',
    });
  };
}
