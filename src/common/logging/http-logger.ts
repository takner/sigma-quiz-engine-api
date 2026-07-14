import pinoHttp from 'pino-http';

import { RequestWithId } from './request-with-id';

export const LOG_REDACTION_CENSOR = '[REDACTED]';

export const LOG_REDACTION_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.token',
  'req.body.accessToken',
  'req.body.correctOptionIndex',
  'req.body.questionsSnapshot',
  'req.body.quizTitleSnapshot',
  'res.body.accessToken',
  'res.body.correctOptionIndex',
  '*.correctOptionIndex',
] as const;

const SENSITIVE_LOG_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'accesstoken',
  'correctoptionindex',
  'questionssnapshot',
  'quiztitlesnapshot',
]);

export function redactSensitiveLogValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveLogValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    redacted[key] = SENSITIVE_LOG_KEYS.has(key.toLowerCase())
      ? LOG_REDACTION_CENSOR
      : redactSensitiveLogValue(nestedValue);
  }

  return redacted;
}

export function createHttpLogger(): ReturnType<typeof pinoHttp> {
  return pinoHttp({
    customProps: (request) => ({
      requestId: (request as RequestWithId).requestId,
    }),
    redact: {
      paths: [...LOG_REDACTION_PATHS],
      censor: LOG_REDACTION_CENSOR,
    },
  });
}
