import {
  LOG_REDACTION_CENSOR,
  LOG_REDACTION_PATHS,
  redactSensitiveLogValue,
} from './http-logger';

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeDefined();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

describe('HTTP logger redaction', () => {
  it('configures redaction paths for credentials and correct-answer data', () => {
    expect(LOG_REDACTION_PATHS).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it('recursively redacts sensitive values before structured logging', () => {
    const redacted = asRecord(
      redactSensitiveLogValue({
        req: {
          headers: {
            authorization: 'Bearer secret-token',
            cookie: 'session=secret-cookie',
          },
          body: {
            password: 'plain-password',
            token: 'refresh-token',
            accessToken: 'access-token',
            questionsSnapshot: {
              questions: [{ correctOptionIndex: 2 }],
            },
            quizTitleSnapshot: 'Private title',
            nested: [{ correctOptionIndex: 1 }],
          },
        },
        safe: 'visible',
      }),
    );

    const request = asRecord(redacted.req);
    const headers = asRecord(request.headers);
    const body = asRecord(request.body);
    const nested = body.nested as Record<string, unknown>[];

    expect(headers.authorization).toBe(LOG_REDACTION_CENSOR);
    expect(headers.cookie).toBe(LOG_REDACTION_CENSOR);
    expect(body.password).toBe(LOG_REDACTION_CENSOR);
    expect(body.token).toBe(LOG_REDACTION_CENSOR);
    expect(body.accessToken).toBe(LOG_REDACTION_CENSOR);
    expect(body.questionsSnapshot).toBe(LOG_REDACTION_CENSOR);
    expect(body.quizTitleSnapshot).toBe(LOG_REDACTION_CENSOR);
    expect(nested[0]?.correctOptionIndex).toBe(LOG_REDACTION_CENSOR);
    expect(redacted.safe).toBe('visible');
    expect(JSON.stringify(redacted)).not.toContain('secret-token');
    expect(JSON.stringify(redacted)).not.toContain('plain-password');
    expect(JSON.stringify(redacted)).not.toContain('Private title');
  });
});
