import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import { PrismaService } from '../src/infrastructure/database/prisma.service';

describe('Admin quizzes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let adminToken: string;
  let userToken: string;

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
    await prisma.quiz.deleteMany({
      where: {
        title: {
          startsWith: 'Phase3',
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          endsWith: '@quiz-test.local',
        },
      },
    });

    adminToken = await createToken('admin@quiz-test.local', UserRole.ADMIN);
    userToken = await createToken('user@quiz-test.local', UserRole.USER);
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows an admin to create, read, update, list, and safely delete a draft quiz', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/quizzes')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Phase3 Draft CRUD',
        description: 'A draft quiz',
        timeLimitSeconds: 900,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      title: 'Phase3 Draft CRUD',
      description: 'A draft quiz',
      status: 'DRAFT',
      timeLimitSeconds: 900,
      questionCount: 0,
      publishedAt: null,
    });

    const quizId = String(created.body.id);
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/quizzes/${quizId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Phase3 Draft CRUD Updated',
        description: null,
        timeLimitSeconds: 1200,
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: quizId,
      title: 'Phase3 Draft CRUD Updated',
      description: null,
      timeLimitSeconds: 1200,
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/quizzes/${quizId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detail.body).toMatchObject({
      id: quizId,
      questions: [],
    });

    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/quizzes?status=DRAFT&search=CRUD')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(listed.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: quizId,
          title: 'Phase3 Draft CRUD Updated',
        }),
      ]),
    );
    expect(listed.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/quizzes/${quizId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/admin/quizzes/${quizId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('rejects malformed UUID path parameters at the controller boundary', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/quizzes/not-a-uuid')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: {
        code: 'VALIDATION_FAILED',
        details: [
          {
            field: 'quizId',
            issue: 'must be a valid UUID',
          },
        ],
      },
    });
  });

  it('allows an admin to create, update, and delete draft questions', async () => {
    const quiz = await createDraftQuiz('Phase3 Question CRUD');

    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${quiz.id}/questions`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        position: 1,
        questionText: 'Which status code means Not Found?',
        options: ['200', '201', '404', '500'],
        correctOptionIndex: 2,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      position: 1,
      questionText: 'Which status code means Not Found?',
      options: ['200', '201', '404', '500'],
      correctOptionIndex: 2,
    });

    const questionId = String(created.body.id);
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/quizzes/${quiz.id}/questions/${questionId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        position: 2,
        options: ['GET', 'POST', 'PATCH'],
        correctOptionIndex: 1,
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: questionId,
      position: 2,
      options: ['GET', 'POST', 'PATCH'],
      correctOptionIndex: 1,
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/quizzes/${quiz.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detail.body.questions).toEqual([
      expect.objectContaining({
        id: questionId,
        position: 2,
      }),
    ]);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/quizzes/${quiz.id}/questions/${questionId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(204);

    const afterDelete = await request(app.getHttpServer())
      .get(`/api/v1/admin/quizzes/${quiz.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(afterDelete.body.questions).toEqual([]);
  });

  it('rejects invalid option arrays and correct option indices', async () => {
    const quiz = await createDraftQuiz('Phase3 Invalid Questions');

    const duplicateOptions = await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${quiz.id}/questions`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        position: 1,
        questionText: 'Which option is duplicated?',
        options: ['Node', ' node '],
        correctOptionIndex: 0,
      })
      .expect(400);

    expect(duplicateOptions.body.error.code).toBe('INVALID_QUESTION_OPTIONS');

    const outOfRangeIndex = await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${quiz.id}/questions`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        position: 2,
        questionText: 'Which option index is invalid?',
        options: ['A', 'B'],
        correctOptionIndex: 2,
      })
      .expect(400);

    expect(outOfRangeIndex.body.error.code).toBe(
      'INVALID_CORRECT_OPTION_INDEX',
    );
  });

  it('rejects publishing a quiz with zero questions', async () => {
    const quiz = await createDraftQuiz('Phase3 Empty Publish');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${quiz.id}/publish`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(409);

    expect(response.body.error.code).toBe('QUIZ_HAS_NO_QUESTIONS');
  });

  it('publishes transactionally and makes quiz content immutable', async () => {
    const quiz = await createDraftQuiz('Phase3 Publish Immutable');
    const question = await createQuestion(quiz.id);

    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${quiz.id}/publish`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(published.body).toMatchObject({
      id: quiz.id,
      status: 'PUBLISHED',
    });
    expect(Date.parse(String(published.body.publishedAt))).not.toBeNaN();

    const updateQuiz = await request(app.getHttpServer())
      .patch(`/api/v1/admin/quizzes/${quiz.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Phase3 Mutated Published',
      })
      .expect(409);

    expect(updateQuiz.body.error.code).toBe('PUBLISHED_QUIZ_IMMUTABLE');

    const addQuestion = await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${quiz.id}/questions`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        position: 2,
        questionText: 'Which mutation is rejected?',
        options: ['Create', 'Publish'],
        correctOptionIndex: 0,
      })
      .expect(409);

    expect(addQuestion.body.error.code).toBe('PUBLISHED_QUIZ_IMMUTABLE');

    const updateQuestion = await request(app.getHttpServer())
      .patch(`/api/v1/admin/quizzes/${quiz.id}/questions/${question.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        questionText: 'Should not change',
      })
      .expect(409);

    expect(updateQuestion.body.error.code).toBe('PUBLISHED_QUIZ_IMMUTABLE');

    const deleteQuestion = await request(app.getHttpServer())
      .delete(`/api/v1/admin/quizzes/${quiz.id}/questions/${question.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(409);

    expect(deleteQuestion.body.error.code).toBe('PUBLISHED_QUIZ_IMMUTABLE');

    const deleteQuiz = await request(app.getHttpServer())
      .delete(`/api/v1/admin/quizzes/${quiz.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(409);

    expect(deleteQuiz.body.error.code).toBe('QUIZ_DELETE_NOT_ALLOWED');
  });

  it('archives a quiz and rejects archived content edits', async () => {
    const quiz = await createDraftQuiz('Phase3 Archive');
    await createQuestion(quiz.id);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${quiz.id}/publish`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    const archived = await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${quiz.id}/archive`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(archived.body).toMatchObject({
      id: quiz.id,
      status: 'ARCHIVED',
    });
    expect(Date.parse(String(archived.body.archivedAt))).not.toBeNaN();

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/admin/quizzes/${quiz.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Phase3 Archived Mutation',
      })
      .expect(409);

    expect(update.body.error.code).toBe('PUBLISHED_QUIZ_IMMUTABLE');
  });

  it('denies USER access to admin quiz endpoints', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/quizzes')
      .set('authorization', `Bearer ${userToken}`)
      .send({
        title: 'Phase3 Forbidden',
      })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  async function createToken(email: string, role: UserRole): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash('StrongPass123!', {
          type: argon2.argon2id,
        }),
        role,
      },
    });

    return jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: 3600,
      },
    );
  }

  async function createDraftQuiz(title: string): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/quizzes')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        title,
        description: 'Question test quiz',
      })
      .expect(201);

    return { id: String(response.body.id) };
  }

  async function createQuestion(quizId: string): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/quizzes/${quizId}/questions`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        position: 1,
        questionText: 'Which status code means Not Found?',
        options: ['200', '201', '404', '500'],
        correctOptionIndex: 2,
      })
      .expect(201);

    return { id: String(response.body.id) };
  }
});
