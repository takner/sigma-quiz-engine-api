import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AttemptStatus, UserRole } from '@prisma/client';
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

describe('Attempts', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let admin: { id: string; token: string };
  let user: { id: string; token: string };
  let otherUser: { id: string; token: string };

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
      'admin@attempt-test.local',
      UserRole.ADMIN,
    );
    user = await createUserAndToken(
      prisma,
      jwt,
      'user@attempt-test.local',
      UserRole.USER,
    );
    otherUser = await createUserAndToken(
      prisma,
      jwt,
      'other@attempt-test.local',
      UserRole.USER,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists and previews only published quizzes without questions', async () => {
    const published = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Published Catalog',
    );
    await createPublishedQuiz(prisma, admin.id, 'Phase4 Draft Catalog', {
      status: 'DRAFT',
    });
    await createPublishedQuiz(prisma, admin.id, 'Phase4 Archived Catalog', {
      status: 'ARCHIVED',
    });

    const list = await request(app.getHttpServer())
      .get('/api/v1/quizzes')
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: published.id,
          title: 'Phase4 Published Catalog',
          questionCount: 2,
          timeLimitSeconds: 900,
        }),
      ]),
    );
    expect(
      list.body.data.some(
        (quiz: { title: string }) => quiz.title === 'Phase4 Draft Catalog',
      ),
    ).toBe(false);
    expect(
      list.body.data.some(
        (quiz: { title: string }) => quiz.title === 'Phase4 Archived Catalog',
      ),
    ).toBe(false);
    expectNoCorrectOptionIndex(list.body);

    const preview = await request(app.getHttpServer())
      .get(`/api/v1/quizzes/${published.id}`)
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(preview.body).toMatchObject({
      id: published.id,
      title: 'Phase4 Published Catalog',
      questionCount: 2,
    });
    expect(preview.body.questions).toBeUndefined();
  });

  it('starts, resumes, and reads an in-progress attempt with a safe snapshot projection', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Start Resume',
    );

    const created = await startAttempt(app, user.token, quiz.id).expect(201);

    expect(created.body).toMatchObject({
      quiz: {
        id: quiz.id,
        title: 'Phase4 Start Resume',
      },
      status: 'IN_PROGRESS',
      resumed: false,
    });
    expect(created.body.questions).toHaveLength(2);
    expectNoCorrectOptionIndex(created.body);
    const createdAttemptId = String(created.body.id);

    const attempt = await prisma.quizAttempt.findUniqueOrThrow({
      where: { id: createdAttemptId },
    });
    const snapshot = attempt.questionsSnapshot as {
      questions: { correctOptionIndex: number }[];
    };
    expect(snapshot.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ correctOptionIndex: 2 }),
      ]),
    );

    const resumed = await startAttempt(app, user.token, quiz.id).expect(200);

    expect(resumed.body).toMatchObject({
      id: createdAttemptId,
      resumed: true,
      status: 'IN_PROGRESS',
    });
    expectNoCorrectOptionIndex(resumed.body);

    await expectOpenAttemptCount(user.id, quiz.id, 1);

    const read = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${createdAttemptId}`)
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(read.body).toMatchObject({
      id: createdAttemptId,
      status: 'IN_PROGRESS',
      resumed: false,
    });
    expect(read.body.questions).toHaveLength(2);
    expectNoCorrectOptionIndex(read.body);
  });

  it('converges concurrent start requests on one open attempt', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Concurrent Start',
    );

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => startAttempt(app, user.token, quiz.id)),
    );

    for (const response of responses) {
      expect([200, 201]).toContain(response.status);
      expectNoCorrectOptionIndex(response.body);
    }

    const ids = new Set(responses.map((response) => String(response.body.id)));
    expect(ids.size).toBe(1);
    await expectOpenAttemptCount(user.id, quiz.id, 1);
  });

  it('lazily expires open attempts on read and creates a retake on start', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Expired Retake',
      {
        timeLimitSeconds: 1,
      },
    );
    const first = await startAttempt(app, user.token, quiz.id).expect(201);
    const firstAttemptId = String(first.body.id);

    await prisma.quizAttempt.update({
      where: { id: firstAttemptId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${firstAttemptId}`)
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(expired.body).toMatchObject({
      id: firstAttemptId,
      status: 'EXPIRED',
      questions: [],
    });

    const retake = await startAttempt(app, user.token, quiz.id).expect(201);

    expect(String(retake.body.id)).not.toBe(firstAttemptId);
    expect(retake.body).toMatchObject({
      status: 'IN_PROGRESS',
      resumed: false,
    });

    const expiredRow = await prisma.quizAttempt.findUniqueOrThrow({
      where: { id: firstAttemptId },
    });
    expect(expiredRow.status).toBe(AttemptStatus.EXPIRED);
    await expectOpenAttemptCount(user.id, quiz.id, 1);
  });

  it('rejects archived and draft quiz starts', async () => {
    const draft = await createPublishedQuiz(prisma, admin.id, 'Phase4 Draft', {
      status: 'DRAFT',
    });
    const archived = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Archived',
      {
        status: 'ARCHIVED',
      },
    );

    const draftResponse = await startAttempt(app, user.token, draft.id).expect(
      409,
    );
    expect(draftResponse.body.error.code).toBe('QUIZ_NOT_PUBLISHED');

    const archivedResponse = await startAttempt(
      app,
      user.token,
      archived.id,
    ).expect(409);
    expect(archivedResponse.body.error.code).toBe('QUIZ_ARCHIVED');
  });

  it('enforces attempt ownership and UUID path validation', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Ownership',
    );
    const created = await startAttempt(app, user.token, quiz.id).expect(201);
    const createdAttemptId = String(created.body.id);

    const forbidden = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${createdAttemptId}`)
      .set('authorization', `Bearer ${otherUser.token}`)
      .expect(403);
    expect(forbidden.body.error.code).toBe('ATTEMPT_NOT_OWNED');

    const malformed = await request(app.getHttpServer())
      .get('/api/v1/attempts/not-a-uuid')
      .set('authorization', `Bearer ${user.token}`)
      .expect(400);
    expect(malformed.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [
        {
          field: 'attemptId',
          issue: 'must be a valid UUID',
        },
      ],
    });
  });

  async function expectOpenAttemptCount(
    userId: string,
    quizId: string,
    expected: number,
  ): Promise<void> {
    await expect(
      prisma.quizAttempt.count({
        where: {
          userId,
          quizId,
          status: AttemptStatus.IN_PROGRESS,
        },
      }),
    ).resolves.toBe(expected);
  }
});
