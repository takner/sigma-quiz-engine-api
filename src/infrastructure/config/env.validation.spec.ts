import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('returns development defaults for optional settings', () => {
    const config = validateEnvironment({
      DATABASE_URL: 'postgresql://quiz:quiz@localhost:5432/quiz_dev',
      JWT_SECRET: 'test-secret',
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe(
      'postgresql://quiz:quiz@localhost:5432/quiz_dev',
    );
    expect(config.JWT_SECRET).toBe('test-secret');
    expect(config.JWT_EXPIRES_IN).toBe(3600);
    expect(config.CORS_ORIGINS).toContain('http://localhost:3000');
  });

  it('requires explicit CORS origins in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://quiz:quiz@localhost:5432/quiz_dev',
        JWT_SECRET: 'test-secret',
      }),
    ).toThrow('CORS_ORIGINS is required in production.');
  });
});
