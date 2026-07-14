import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import {
  cleanAttemptFixtures,
  createPublishedQuiz,
  createUserAndToken,
  expectNoCorrectOptionIndex,
  startAttempt,
} from './support/attempt-test-helpers';

describe('Correct-answer response security', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let admin: { id: string; token: string };
  let user: { id: string; token: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  beforeEach(async () => {
    await cleanAttemptFixtures(prisma);
    admin = await createUserAndToken(
      prisma,
      jwt,
      'security-admin@attempt-test.local',
      UserRole.ADMIN,
    );
    user = await createUserAndToken(
      prisma,
      jwt,
      'security-user@attempt-test.local',
      UserRole.USER,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('recursively excludes correctOptionIndex from start and get attempt responses', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Security Projection',
    );

    const started = await startAttempt(app, user.token, quiz.id).expect(201);
    const attemptId = String(started.body.id);
    expectNoCorrectOptionIndex(started.body);

    const read = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}`)
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);
    expectNoCorrectOptionIndex(read.body);
  });
});
