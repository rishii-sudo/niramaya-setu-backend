import { FastifyRequest } from 'fastify';
import { ZodType, z } from 'zod';

export function validateBody<T extends ZodType<any, any, any>>(schema: T, request: FastifyRequest): z.output<T> {
  return schema.parse(request.body);
}

export function validateQuery<T extends ZodType<any, any, any>>(schema: T, request: FastifyRequest): z.output<T> {
  return schema.parse(request.query);
}

export function validateParams<T extends ZodType<any, any, any>>(schema: T, request: FastifyRequest): z.output<T> {
  return schema.parse(request.params);
}
