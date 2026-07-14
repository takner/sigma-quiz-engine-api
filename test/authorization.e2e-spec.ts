import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { Roles } from '../src/common/auth/roles.decorator';
import { RolesGuard } from '../src/common/auth/roles.guard';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import { PrismaService } from '../src/infrastructure/database/prisma.service';

@Controller('test/admin-only')
class TestAdminOnlyController {
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getAdminOnly(): { ok: true } {
    return { ok: true };
  }
}

describe('Authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

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
      imports: [AppModule, JwtModule.register({})],
      controllers: [TestAdminOnlyController],
      providers: [JwtAuthGuard, RolesGuard],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          endsWith: '@authorization-test.local',
        },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies USER access to an ADMIN guarded route', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'user@authorization-test.local',
        passwordHash: await argon2.hash('StrongPass123!', {
          type: argon2.argon2id,
        }),
        role: UserRole.USER,
      },
    });
    const token = await jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret: 'test-secret',
        expiresIn: 3600,
      },
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/test/admin-only')
      .set('authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows ADMIN access to an ADMIN guarded route', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'admin@authorization-test.local',
        passwordHash: await argon2.hash('StrongPass123!', {
          type: argon2.argon2id,
        }),
        role: UserRole.ADMIN,
      },
    });
    const token = await jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret: 'test-secret',
        expiresIn: 3600,
      },
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/test/admin-only')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ ok: true });
  });
});
