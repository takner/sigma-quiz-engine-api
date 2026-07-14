import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import {
  attemptBody,
  cleanAttemptFixtures,
  createPublishedQuiz,
  createUserAndToken,
  expectNoCorrectOptionIndex,
  startAttempt,
  submitAttempt,
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

  it('fails the recursive leakage sentinel when correctOptionIndex is present', () => {
    expect(() => {
      expectNoCorrectOptionIndex({
        nested: [{ correctOptionIndex: 0 }],
      });
    }).toThrow();
  });

  it('recursively excludes correctOptionIndex from start and get attempt responses', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Security Projection',
    );

    const started = await startAttempt(app, user.token, quiz.id).expect(201);
    const startedBody = attemptBody(started);
    expectNoCorrectOptionIndex(started.body);

    const read = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${startedBody.id}`)
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);
    expectNoCorrectOptionIndex(read.body);

    const submitted = await submitAttempt(app, user.token, startedBody.id, {
      answers: [
        {
          questionId: startedBody.questions[0]?.id,
          selectedOptionIndex: 2,
        },
      ],
    }).expect(200);
    expectNoCorrectOptionIndex(submitted.body);

    const history = await request(app.getHttpServer())
      .get('/api/v1/users/me/quiz-history')
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);
    expectNoCorrectOptionIndex(history.body);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/users/me/quiz-history/${startedBody.id}`)
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);
    expectNoCorrectOptionIndex(detail.body);
  });
});
