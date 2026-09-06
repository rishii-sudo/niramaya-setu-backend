import pino from 'pino';
import { config } from '../../config/env.js';

// Keys to redact from all log outputs
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'token',
  'authorization',
  'aadhaar',
  'aadhaarNumber',
  'aadhaarToken',
  'abhaNumber',
  'abhaAddress',
  'secret',
  'apiKey',
  'cookie',
];

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: SENSITIVE_KEYS.flatMap((key) => [
      key,
      `*.${key}`,
      `*.*.${key}`,
      `req.headers.authorization`,
      `req.body.${key}`,
      `body.${key}`,
    ]),
    censor: '[REDACTED_HEALTH_PII]',
  },
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
