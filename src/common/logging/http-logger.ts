import pinoHttp from 'pino-http';

import { RequestWithId } from './request-with-id';

export function createHttpLogger(): ReturnType<typeof pinoHttp> {
  return pinoHttp({
    customProps: (request) => ({
      requestId: (request as RequestWithId).requestId,
    }),
    redact: {
      paths: [
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
      ],
      censor: '[REDACTED]',
    },
  });
}
