import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { voiceAdapter } from './voice.adapter.js';
import { z } from 'zod';
import { validateBody } from '../../common/validation/zod-validator.js';

const SttSchema = z.object({
  audioBase64: z.string().min(10, 'Base64 encoded audio required'),
  audioFormat: z.enum(['wav', 'mp3', 'aac', 'webm']).default('wav'),
  samplingRate: z.number().optional(),
});

const TtsSchema = z.object({
  textMarathi: z.string().min(1, 'Marathi text is required'),
  voiceGender: z.enum(['female', 'male']).default('female'),
});

export async function voiceRoutes(app: FastifyInstance) {
  app.post(
    '/marathi/stt',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Voice'],
        summary: 'Transcribe Marathi voice audio to text and extract symptoms (Pluggable Bhashini/Indic STT)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = validateBody(SttSchema, request);
      const res = await voiceAdapter.speechToText(input);
      return reply.status(200).send({
        success: true,
        data: res,
      });
    }
  );

  app.post(
    '/marathi/tts',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Voice'],
        summary: 'Synthesize Marathi text to speech audio (Pluggable Bhashini/Indic TTS)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = validateBody(TtsSchema, request);
      const res = await voiceAdapter.textToSpeech(input);
      return reply.status(200).send({
        success: true,
        data: res,
      });
    }
  );
}
