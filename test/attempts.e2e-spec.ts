import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AttemptStatus, UserRole } from '@prisma/client';
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
  submittedAttemptBody,
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
      attemptId: firstAttemptId,
      status: 'EXPIRED',
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

  it('submits atomically, scores omitted answers, and returns history from snapshots', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Submit Partial',
    );
    const startedResponse = await startAttempt(app, user.token, quiz.id).expect(
      201,
    );
    const started = attemptBody(startedResponse);
    const firstQuestion = started.questions[0];
    expect(firstQuestion).toBeDefined();

    const submittedResponse = await submitAttempt(app, user.token, started.id, {
      answers: [
        {
          questionId: firstQuestion.id,
          selectedOptionIndex: 2,
        },
      ],
    }).expect(200);
    const submitted = submittedAttemptBody(submittedResponse);

    expect(submitted).toMatchObject({
      attemptId: started.id,
      status: 'SUBMITTED',
      score: {
        correct: 1,
        total: 2,
        percentage: 50,
      },
    });
    expect(submitted.answers).toEqual([
      {
        questionId: firstQuestion.id,
        selectedOptionIndex: 2,
        answered: true,
        isCorrect: true,
      },
      {
        questionId: started.questions[1]?.id,
        selectedOptionIndex: null,
        answered: false,
        isCorrect: false,
      },
    ]);
    expectNoCorrectOptionIndex(submittedResponse.body);

    await expect(
      prisma.attemptAnswer.count({
        where: { attemptId: started.id },
      }),
    ).resolves.toBe(1);

    const getAttempt = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${started.id}`)
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(getAttempt.body).toMatchObject({
      attemptId: started.id,
      status: 'SUBMITTED',
      score: { correct: 1, total: 2, percentage: 50 },
    });
    expectNoCorrectOptionIndex(getAttempt.body);

    const history = await request(app.getHttpServer())
      .get('/api/v1/users/me/quiz-history')
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(history.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attemptId: started.id,
          quizId: quiz.id,
          quizTitle: 'Phase4 Submit Partial',
          status: 'SUBMITTED',
          score: { correct: 1, total: 2, percentage: 50 },
        }),
      ]),
    );
    expectNoCorrectOptionIndex(history.body);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/users/me/quiz-history/${started.id}`)
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      attemptId: started.id,
      status: 'SUBMITTED',
    });
    expectNoCorrectOptionIndex(detail.body);
  });

  it('rejects invalid submit payloads and duplicate submit attempts', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Submit Validation',
    );
    const started = attemptBody(
      await startAttempt(app, user.token, quiz.id).expect(201),
    );
    const firstQuestion = started.questions[0];
    expect(firstQuestion).toBeDefined();

    const duplicate = await submitAttempt(app, user.token, started.id, {
      answers: [
        { questionId: firstQuestion.id, selectedOptionIndex: 2 },
        { questionId: firstQuestion.id, selectedOptionIndex: 1 },
      ],
    }).expect(400);
    expect(duplicate.body.error.code).toBe('DUPLICATE_QUESTION_ANSWER');

    const foreignQuestion = await submitAttempt(app, user.token, started.id, {
      answers: [
        {
          questionId: 'baf6d770-cc2e-46a5-af60-85c2ab2e1249',
          selectedOptionIndex: 0,
        },
      ],
    }).expect(400);
    expect(foreignQuestion.body.error.code).toBe('QUESTION_NOT_IN_ATTEMPT');

    const badOption = await submitAttempt(app, user.token, started.id, {
      answers: [{ questionId: firstQuestion.id, selectedOptionIndex: 99 }],
    }).expect(400);
    expect(badOption.body.error.code).toBe('INVALID_SELECTED_OPTION_INDEX');

    await submitAttempt(app, user.token, started.id, {
      answers: [{ questionId: firstQuestion.id, selectedOptionIndex: 2 }],
    }).expect(200);

    const duplicateSubmit = await submitAttempt(app, user.token, started.id, {
      answers: [{ questionId: firstQuestion.id, selectedOptionIndex: 2 }],
    }).expect(409);
    expect(duplicateSubmit.body.error.code).toBe('ATTEMPT_ALREADY_SUBMITTED');
  });

  it('supports idempotent successful submit replay for the same normalized payload', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Submit Idempotency',
    );
    const started = attemptBody(
      await startAttempt(app, user.token, quiz.id).expect(201),
    );
    const firstQuestion = started.questions[0];
    expect(firstQuestion).toBeDefined();
    const payload = {
      answers: [{ questionId: firstQuestion.id, selectedOptionIndex: 2 }],
    };

    const first = await submitAttempt(app, user.token, started.id, payload)
      .set('idempotency-key', 'phase4-idempotency-key')
      .expect(200);
    const replay = await submitAttempt(app, user.token, started.id, payload)
      .set('idempotency-key', 'phase4-idempotency-key')
      .expect(200);

    expect(replay.body).toEqual(first.body);

    const changed = await submitAttempt(app, user.token, started.id, {
      answers: [{ questionId: firstQuestion.id, selectedOptionIndex: 1 }],
    })
      .set('idempotency-key', 'phase4-idempotency-key')
      .expect(409);
    expect(changed.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects expired submits and preserves attempts started before archive', async () => {
    const expiringQuiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Expired Submit',
      { timeLimitSeconds: 1 },
    );
    const expiredAttempt = attemptBody(
      await startAttempt(app, user.token, expiringQuiz.id).expect(201),
    );
    await prisma.quizAttempt.update({
      where: { id: expiredAttempt.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredSubmit = await submitAttempt(
      app,
      user.token,
      expiredAttempt.id,
      {
        answers: [],
      },
    ).expect(409);
    expect(expiredSubmit.body.error.code).toBe('ATTEMPT_EXPIRED');
    await expect(
      prisma.quizAttempt.findUniqueOrThrow({
        where: { id: expiredAttempt.id },
      }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });

    const archivedQuiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Archive After Start',
    );
    const archiveAttempt = attemptBody(
      await startAttempt(app, user.token, archivedQuiz.id).expect(201),
    );
    await prisma.quiz.update({
      where: { id: archivedQuiz.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });

    await submitAttempt(app, user.token, archiveAttempt.id, {
      answers: [
        {
          questionId: archiveAttempt.questions[0]?.id,
          selectedOptionIndex: 2,
        },
      ],
    }).expect(200);
  });

  it('allows retakes after submission and records each attempt in history', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Submitted Retake',
    );
    const first = attemptBody(
      await startAttempt(app, user.token, quiz.id).expect(201),
    );
    await submitAttempt(app, user.token, first.id, {
      answers: [
        {
          questionId: first.questions[0]?.id,
          selectedOptionIndex: 2,
        },
      ],
    }).expect(200);

    const second = attemptBody(
      await startAttempt(app, user.token, quiz.id).expect(201),
    );
    expect(second.id).not.toBe(first.id);

    const history = await request(app.getHttpServer())
      .get(`/api/v1/users/me/quiz-history?quizId=${quiz.id}`)
      .set('authorization', `Bearer ${user.token}`)
      .expect(200);
    const attemptIds = (history.body.data as { attemptId: string }[]).map(
      (item) => item.attemptId,
    );
    expect(attemptIds).toEqual(expect.arrayContaining([first.id, second.id]));
  });

  it('permits exactly one concurrent submit state transition', async () => {
    const quiz = await createPublishedQuiz(
      prisma,
      admin.id,
      'Phase4 Concurrent Submit',
    );
    const started = attemptBody(
      await startAttempt(app, user.token, quiz.id).expect(201),
    );
    const answers = {
      answers: [
        {
          questionId: started.questions[0]?.id,
          selectedOptionIndex: 2,
        },
        {
          questionId: started.questions[1]?.id,
          selectedOptionIndex: 0,
        },
      ],
    };

    const responses = await Promise.all([
      submitAttempt(app, user.token, started.id, answers),
      submitAttempt(app, user.token, started.id, answers),
    ]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([200, 409]);
    expect(
      responses.some(
        (response) => response.body.error?.code === 'ATTEMPT_ALREADY_SUBMITTED',
      ),
    ).toBe(true);
    await expect(
      prisma.attemptAnswer.count({ where: { attemptId: started.id } }),
    ).resolves.toBe(2);
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
