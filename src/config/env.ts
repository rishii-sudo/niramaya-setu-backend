import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  
  JWT_SECRET: z.string().min(16).default('super_secret_jwt_key_min_32_characters_for_niramaya_setu'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // SEC-04: Aadhaar HMAC lookup secret key
  AADHAAR_HMAC_SECRET: z.string().min(16).default('niramaya_aadhaar_hmac_secret_key_change_in_prod_min_32_chars'),
  
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/niramaya_setu?schema=public'),
  
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  
  // SEC-07: Rate limiting configs
  RATE_LIMIT_MAX_AUTH: z.coerce.number().default(10), // Max requests per 15 minutes for auth endpoints
  RATE_LIMIT_MAX_GLOBAL: z.coerce.number().default(200), // Max requests per minute globally
  
  // SEC-10: CORS Whitelist
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
  
  ABDM_CLIENT_ID: z.string().default('sandbox_client_id'),
  ABDM_CLIENT_SECRET: z.string().default('sandbox_client_secret'),
  ABDM_BASE_URL: z.string().default('https://dev.abdm.gov.in/gateway'),
  
  AI_PROVIDER: z.string().default('stub'),
  AI_API_KEY: z.string().optional(),
  
  VOICE_PROVIDER: z.string().default('stub'),
  VOICE_API_KEY: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    return envSchema.parse({});
  }
  
  // In production, enforce that default placeholder secrets are rejected
  if (result.data.NODE_ENV === 'production') {
    if (result.data.JWT_SECRET.includes('super_secret_jwt_key') || result.data.JWT_SECRET.length < 32) {
      throw new Error('FATAL: Insecure JWT_SECRET detected in production environment.');
    }
    if (result.data.AADHAAR_HMAC_SECRET.includes('niramaya_aadhaar_hmac') || result.data.AADHAAR_HMAC_SECRET.length < 32) {
      throw new Error('FATAL: Insecure AADHAAR_HMAC_SECRET detected in production environment.');
    }
  }
  
  return result.data;
};

export const config = parseEnv();
export type Config = z.infer<typeof envSchema>;
