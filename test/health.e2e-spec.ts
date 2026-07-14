import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';

describe('Health and documentation endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://quiz:quiz@localhost:5432/quiz_dev';
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '3600';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live returns 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200);

    expect(response.body.status).toBe('ok');
  });

  it('GET /api/v1/health/ready returns 200 when the database is reachable', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      checks: {
        database: 'ok',
      },
    });
  });

  it('unknown /api/v1 route returns the required error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unknown')
      .set('x-request-id', 'request-id')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route not found.',
        details: [],
        requestId: 'request-id',
        path: '/api/v1/unknown',
      },
    });
    expect(Date.parse(String(response.body.error.timestamp))).not.toBeNaN();
  });

  it('returns a valid client-provided request ID in headers and error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unknown')
      .set('x-request-id', 'req_test_123')
      .expect(404);

    expect(response.headers['x-request-id']).toBe('req_test_123');
    expect(response.body.error.requestId).toBe('req_test_123');
  });

  it('generates a request ID when none is supplied', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unknown')
      .expect(404);

    expect(response.headers['x-request-id']).toEqual(
      expect.stringMatching(/^req_/),
    );
    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('GET /api/docs is available', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });

  it('GET /api/docs-json returns an OpenAPI document', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body.info.title).toBe('Quiz Engine API');
  });

  it('GET /api/v1/health/ready returns 503 when the database is unreachable', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://quiz:quiz@127.0.0.1:5999/quiz_dev';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const unavailableDbApp = moduleRef.createNestApplication();
    configureApplication(unavailableDbApp);
    await unavailableDbApp.init();

    try {
      const response = await request(unavailableDbApp.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);

      expect(response.body).toMatchObject({
        statusCode: 503,
        error: {
          code: 'SERVICE_NOT_READY',
          message: 'Database connection is not ready.',
          details: [],
          path: '/api/v1/health/ready',
        },
      });
    } finally {
      await unavailableDbApp.close();
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });
});
