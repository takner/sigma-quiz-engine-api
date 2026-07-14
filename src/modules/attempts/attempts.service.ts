import { HttpStatus, Injectable } from '@nestjs/common';
import { AttemptStatus, Prisma, QuizStatus } from '@prisma/client';

import { ApplicationException } from '../../common/errors/application.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  AttemptResponse,
  AttemptWithQuiz,
  toAttemptResponse,
} from './attempt-snapshot';

interface StartAttemptResult {
  statusCode: 200 | 201;
  body: AttemptResponse;
}

@Injectable()
export class AttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  async startOrResumeAttempt(
    userId: string,
    quizId: string,
  ): Promise<StartAttemptResult> {
    const existingOpen = await this.findOpenAttempt(userId, quizId);
    if (existingOpen && !isExpired(existingOpen, new Date())) {
      return {
        statusCode: 200,
        body: toAttemptResponse(existingOpen, true),
      };
    }

    if (existingOpen) {
      await this.expireAttempt(existingOpen.id, new Date());
    }

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        title: true,
        status: true,
        timeLimitSeconds: true,
        questions: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            position: true,
            questionText: true,
            options: true,
            correctOptionIndex: true,
          },
        },
      },
    });
    if (!quiz) {
      throw new ApplicationException(
        HttpStatus.NOT_FOUND,
        'QUIZ_NOT_FOUND',
        'Quiz does not exist.',
      );
    }
    if (quiz.status === QuizStatus.ARCHIVED) {
      throw new ApplicationException(
        HttpStatus.CONFLICT,
        'QUIZ_ARCHIVED',
        'New attempts are blocked for archived quizzes.',
      );
    }
    if (quiz.status !== QuizStatus.PUBLISHED) {
      throw new ApplicationException(
        HttpStatus.CONFLICT,
        'QUIZ_NOT_PUBLISHED',
        'Quiz cannot be started until published.',
      );
    }

    const now = new Date();
    const expiresAt =
      quiz.timeLimitSeconds === null
        ? null
        : new Date(now.getTime() + quiz.timeLimitSeconds * 1000);
    const questions = quiz.questions.map((question) => ({
      id: question.id,
      position: question.position,
      questionText: question.questionText,
      options: jsonOptionsToStrings(question.options),
      correctOptionIndex: question.correctOptionIndex,
    }));

    try {
      const created = await this.prisma.quizAttempt.create({
        data: {
          userId,
          quizId,
          quizTitleSnapshot: quiz.title,
          questionsSnapshot: { questions },
          startedAt: now,
          expiresAt,
        },
        include: attemptInclude,
      });

      return {
        statusCode: 201,
        body: toAttemptResponse(created, false),
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const winner = await this.findOpenAttempt(userId, quizId);
        if (winner) {
          return {
            statusCode: 200,
            body: toAttemptResponse(winner, true),
          };
        }
        throw new ApplicationException(
          HttpStatus.CONFLICT,
          'OPEN_ATTEMPT_CONFLICT',
          'Open attempt conflict could not be resumed safely.',
        );
      }

      throw error;
    }
  }

  async getAttempt(
    userId: string,
    attemptId: string,
  ): Promise<AttemptResponse> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: attemptInclude,
    });
    if (!attempt) {
      throwAttemptNotFound();
    }
    if (attempt.userId !== userId) {
      throw new ApplicationException(
        HttpStatus.FORBIDDEN,
        'ATTEMPT_NOT_OWNED',
        'Attempt belongs to another user.',
      );
    }

    if (isExpired(attempt, new Date())) {
      await this.expireAttempt(attempt.id, new Date());
      attempt.status = AttemptStatus.EXPIRED;
    }

    return toAttemptResponse(attempt, false);
  }

  private async findOpenAttempt(
    userId: string,
    quizId: string,
  ): Promise<AttemptWithQuiz | null> {
    return this.prisma.quizAttempt.findFirst({
      where: {
        userId,
        quizId,
        status: AttemptStatus.IN_PROGRESS,
      },
      orderBy: { startedAt: 'desc' },
      include: attemptInclude,
    });
  }

  private async expireAttempt(attemptId: string, now: Date): Promise<void> {
    await this.prisma.quizAttempt.updateMany({
      where: {
        id: attemptId,
        status: AttemptStatus.IN_PROGRESS,
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: AttemptStatus.EXPIRED,
      },
    });
  }
}

const attemptInclude = {
  quiz: {
    select: {
      id: true,
      description: true,
    },
  },
} satisfies Prisma.QuizAttemptInclude;

function isExpired(
  attempt: { status: AttemptStatus; expiresAt: Date | null },
  now: Date,
): boolean {
  return (
    attempt.status === AttemptStatus.IN_PROGRESS &&
    attempt.expiresAt !== null &&
    attempt.expiresAt <= now
  );
}

function jsonOptionsToStrings(value: Prisma.JsonValue): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new ApplicationException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR',
      'Stored question options are invalid.',
    );
  }

  return value;
}

function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function throwAttemptNotFound(): never {
  throw new ApplicationException(
    HttpStatus.NOT_FOUND,
    'ATTEMPT_NOT_FOUND',
    'Attempt does not exist.',
  );
}
