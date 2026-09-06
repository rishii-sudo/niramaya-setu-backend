import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './http-errors.js';

export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. Zod Validation Errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
  }

  // 2. Custom Application Errors
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }

  // 3. Fastify Standard Errors (e.g. 404, 400 schema issues)
  const statusCode = (error as FastifyError).statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  request.log.error(error);

  return reply.status(statusCode).send({
    success: false,
    error: {
      code: (error as FastifyError).code || 'INTERNAL_SERVER_ERROR',
      message: isProd && statusCode === 500 ? 'An unexpected server error occurred' : error.message,
    },
  });
}
