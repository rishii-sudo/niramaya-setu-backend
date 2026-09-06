import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { aiAdapter } from './ai.adapter.js';
import { z } from 'zod';
import { validateBody } from '../../common/validation/zod-validator.js';

const TriageAssistSchema = z.object({
  symptoms: z.array(z.string()).default([]),
  vitals: z
    .object({
      bp: z.string().optional(),
      spo2: z.number().optional(),
      temp: z.number().optional(),
      pulse: z.number().optional(),
      glucose: z.number().optional(),
    })
    .default({}),
  patientAge: z.number().optional(),
  notes: z.string().optional(),
});

const SummarySchema = z.object({
  notes: z.array(z.string()).min(1),
});

export async function aiRoutes(app: FastifyInstance) {
  app.post(
    '/triage-assist',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['AI'],
        summary: 'AI-assisted clinical triage copilot suggestions (Pluggable Interface)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = validateBody(TriageAssistSchema, request);
      const res = await aiAdapter.assistTriage(input);
      return reply.status(200).send({
        success: true,
        data: res,
      });
    }
  );

  app.post(
    '/clinical-summary',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['AI'],
        summary: 'Generate summary of past clinical referral notes (Pluggable Interface)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { notes } = validateBody(SummarySchema, request);
      const res = await aiAdapter.summarizeReferralHistory(notes);
      return reply.status(200).send({
        success: true,
        data: res,
      });
    }
  );
}
