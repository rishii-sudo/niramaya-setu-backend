import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { UserRole } from '@prisma/client';

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(app);
  const authController = new AuthController(authService);

  app.post(
    '/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Authenticate health worker / admin and retrieve JWT token',
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', example: 'asha_sunita' },
            password: { type: 'string', example: 'Niramaya@123' },
          },
        },
      },
    },
    authController.login
  );

  app.post(
    '/register',
    {
      preHandler: [app.authenticate, app.authorizeRoles([UserRole.ADMIN])],
      schema: {
        tags: ['Auth'],
        summary: 'Register new health worker (Admin only)',
        security: [{ bearerAuth: [] }],
      },
    },
    authController.register
  );

  app.get(
    '/me',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Get current authenticated user profile',
        security: [{ bearerAuth: [] }],
      },
    },
    authController.getMe
  );

  app.post(
    '/logout',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Logout and invalidate active session token',
        security: [{ bearerAuth: [] }],
      },
    },
    authController.logout
  );
}
