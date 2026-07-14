import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import request from 'supertest';

describe('Authentication', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          endsWith: '@auth-test.local',
        },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a USER with a hashed password and safe response', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'new-user@auth-test.local',
        password: 'StrongPass123!',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      email: 'new-user@auth-test.local',
      role: 'USER',
    });
    expect(response.body.passwordHash).toBeUndefined();

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'new-user@auth-test.local' },
    });
    expect(user.passwordHash).not.toBe('StrongPass123!');
    expect(user.passwordHash).toEqual(expect.stringContaining('$argon2id$'));
  });

  it('rejects client-supplied role during public registration', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'role-user@auth-test.local',
        password: 'StrongPass123!',
        role: 'ADMIN',
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate registration email', async () => {
    const payload = {
      email: 'duplicate@auth-test.local',
      password: 'StrongPass123!',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(payload)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(payload)
      .expect(409);

    expect(response.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('logs in and returns a bearer token with safe user payload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'login-user@auth-test.local',
        password: 'StrongPass123!',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'login-user@auth-test.local',
        password: 'StrongPass123!',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      user: {
        email: 'login-user@auth-test.local',
        role: 'USER',
      },
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('does not enumerate users for invalid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'missing@auth-test.local',
        password: 'StrongPass123!',
      })
      .expect(401);

    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns current user for a valid JWT', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'me-user@auth-test.local',
        password: 'StrongPass123!',
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'me-user@auth-test.local',
        password: 'StrongPass123!',
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${String(login.body.accessToken)}`)
      .expect(200);

    expect(response.body).toMatchObject({
      email: 'me-user@auth-test.local',
      role: 'USER',
    });
  });

  it('rejects missing JWT on current user endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
