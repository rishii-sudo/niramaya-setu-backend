import fastifyJwt from '@fastify/jwt';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env.js';
import { UnauthorizedError, ForbiddenError } from '../common/errors/http-errors.js';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/index.js';
import { sessionManager } from '../security/session/session-manager.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorizeRoles: (roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthenticatedUser;
  }
}

export async function setupJwt(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  // PreHandler: Authenticate JWT Token
  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Invalid or expired authentication token');
    }

    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (token && sessionManager.isTokenRevoked(token)) {
      throw new UnauthorizedError('Session has been revoked or invalidated');
    }

    const user = request.user as AuthenticatedUser | undefined;
    if (user && sessionManager.isUserSessionRevoked(user.userId, (user as any).iat)) {
      throw new UnauthorizedError('User sessions have been invalidated');
    }
  });

  // PreHandler: Authorize User Roles (ASHA, ANM, DOCTOR, ADMIN)
  app.decorate('authorizeRoles', (allowedRoles: UserRole[]) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      const user = request.user as AuthenticatedUser | undefined;
      if (!user || !user.role) {
        throw new UnauthorizedError('User authentication not established');
      }

      if (user.role !== UserRole.ADMIN && !allowedRoles.includes(user.role)) {
        throw new ForbiddenError(`Role '${user.role}' is not authorized to access this resource`);
      }
    };
  });
}
