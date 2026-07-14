import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('returns development defaults for optional settings', () => {
    const config = validateEnvironment({});

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.JWT_EXPIRES_IN).toBe(3600);
    expect(config.CORS_ORIGINS).toContain('http://localhost:3000');
  });

  it('requires explicit CORS origins in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
      }),
    ).toThrow('CORS_ORIGINS is required in production.');
  });
});
