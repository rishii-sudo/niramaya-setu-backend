import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { abdmAdapter } from './abdm.adapter.js';
import { z } from 'zod';
import { validateBody } from '../../common/validation/zod-validator.js';

const GenerateOtpSchema = z.object({
  aadhaarNumber: z.string().regex(/^\d{12}$/, '12-digit Aadhaar required'),
});

const VerifyOtpSchema = z.object({
  txnId: z.string().min(3),
  otp: z.string().regex(/^\d{6}$/, '6-digit OTP required'),
});

export async function abdmRoutes(app: FastifyInstance) {
  app.post(
    '/generate-otp',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['ABDM'],
        summary: 'Initiate Aadhaar OTP for ABHA creation (Sandbox/Integration Adapter)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { aadhaarNumber } = validateBody(GenerateOtpSchema, request);
      const res = await abdmAdapter.generateAadhaarOtp(aadhaarNumber);
      return reply.status(200).send({
        success: true,
        data: res,
      });
    }
  );

  app.post(
    '/verify-otp',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['ABDM'],
        summary: 'Verify OTP and retrieve ABHA number & address (Sandbox/Integration Adapter)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { txnId, otp } = validateBody(VerifyOtpSchema, request);
      const res = await abdmAdapter.verifyAadhaarOtp(txnId, otp);
      return reply.status(200).send({
        success: true,
        data: res,
      });
    }
  );
}
