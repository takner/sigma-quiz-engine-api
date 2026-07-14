import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Quiz, Question, UserRole } from '@prisma/client';
import request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';

export type PublishedQuiz = Quiz & {
  questions: Question[];
};

export async function cleanAttemptFixtures(
  prisma: PrismaService,
): Promise<void> {
  await prisma.idempotencyRecord.deleteMany({
    where: {
      user: {
        email: {
          endsWith: '@attempt-test.local',
        },
      },
    },
  });
  await prisma.attemptAnswer.deleteMany({
    where: {
      attempt: {
        quiz: {
          title: {
            startsWith: 'Phase4',
          },
        },
      },
    },
  });
  await prisma.quizAttempt.deleteMany({
    where: {
      quiz: {
        title: {
          startsWith: 'Phase4',
        },
      },
    },
  });
  await prisma.quiz.deleteMany({
    where: {
      title: {
        startsWith: 'Phase4',
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: '@attempt-test.local',
      },
    },
  });
}

export async function createUserAndToken(
  prisma: PrismaService,
  jwt: JwtService,
  email: string,
  role: UserRole,
): Promise<{ id: string; token: string }> {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'not-used-in-e2e-token-tests',
      role,
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

  return { id: user.id, token };
}

export async function createPublishedQuiz(
  prisma: PrismaService,
  creatorId: string,
  title: string,
  options?: {
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    timeLimitSeconds?: number | null;
  },
): Promise<PublishedQuiz> {
  const status = options?.status ?? 'PUBLISHED';
  return prisma.quiz.create({
    data: {
      title,
      description: `${title} description`,
      status,
      publishedAt: status === 'DRAFT' ? null : new Date(),
      archivedAt: status === 'ARCHIVED' ? new Date() : null,
      timeLimitSeconds: options?.timeLimitSeconds ?? 900,
      createdById: creatorId,
      questions: {
        create: [
          {
            position: 1,
            questionText: `${title}: Which status code means Not Found?`,
            options: ['200', '201', '404', '500'],
            correctOptionIndex: 2,
          },
          {
            position: 2,
            questionText: `${title}: Which HTTP verb retrieves a resource?`,
            options: ['GET', 'POST', 'PATCH', 'DELETE'],
            correctOptionIndex: 0,
          },
        ],
      },
    },
    include: {
      questions: {
        orderBy: { position: 'asc' },
      },
    },
  });
}

export function expectNoCorrectOptionIndex(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      expectNoCorrectOptionIndex(item);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      expect(key).not.toBe('correctOptionIndex');
      expectNoCorrectOptionIndex(nested);
    }
  }
}

export function startAttempt(
  app: INestApplication,
  token: string,
  quizId: string,
): request.Test {
  return request(app.getHttpServer())
    .post(`/api/v1/quizzes/${quizId}/attempts`)
    .set('authorization', `Bearer ${token}`);
}
