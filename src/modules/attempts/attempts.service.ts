import { HttpStatus, Injectable } from '@nestjs/common';
import { AttemptStatus, Prisma, QuizStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

import { ApplicationException } from '../../common/errors/application.exception';
import {
  PaginatedResponse,
  paginate,
  parsePagination,
} from '../../common/pagination/pagination';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { scoreAttemptAnswers } from './attempt-scoring';
import {
  AttemptResponse,
  AttemptWithQuiz,
  ExpiredAttemptResponse,
  HistoryItemResponse,
  SubmittedAttemptResponse,
  SubmittedAttemptWithAnswers,
  parseAttemptSnapshot,
  toAttemptResponse,
  toHistoryItemResponse,
  toSubmittedAttemptResponse,
} from './attempt-snapshot';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

interface StartAttemptResult {
  statusCode: 200 | 201;
  body: AttemptResponse | ExpiredAttemptResponse;
}

type AttemptDetailResponse =
  AttemptResponse | SubmittedAttemptResponse | ExpiredAttemptResponse;

type SubmitTransactionResult =
  | {
      kind: 'submitted';
      body: SubmittedAttemptResponse;
    }
  | {
      kind: 'expired';
    };

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
  ): Promise<AttemptDetailResponse> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: attemptWithAnswersInclude,
    });
    if (!attempt) {
      throwAttemptNotFound();
    }
    this.assertAttemptOwned(attempt.userId, userId);

    if (isExpired(attempt, new Date())) {
      await this.expireAttempt(attempt.id, new Date());
      attempt.status = AttemptStatus.EXPIRED;
    }

    if (attempt.status === AttemptStatus.SUBMITTED) {
      return toSubmittedAttemptResponse(attempt);
    }

    return toAttemptResponse(attempt, false);
  }

  async submitAttempt(
    userId: string,
    attemptId: string,
    dto: SubmitAttemptDto,
    idempotencyKey: string | undefined,
  ): Promise<SubmittedAttemptResponse> {
    const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
    const requestHash = hashSubmissionPayload(dto);

    const result = await this.prisma.$transaction<SubmitTransactionResult>(
      async (tx) => {
        if (normalizedIdempotencyKey) {
          const existing = await tx.idempotencyRecord.findUnique({
            where: {
              userId_key: {
                userId,
                key: normalizedIdempotencyKey,
              },
            },
          });
          if (existing) {
            if (existing.requestHash !== requestHash) {
              throw new ApplicationException(
                HttpStatus.CONFLICT,
                'IDEMPOTENCY_KEY_REUSED',
                'Idempotency key was replayed with a changed body.',
              );
            }
            if (existing.responseStatus === 200 && existing.responseBody) {
              return {
                kind: 'submitted',
                body: existing.responseBody as unknown as SubmittedAttemptResponse,
              };
            }
          }
        }

        const attempt = await tx.quizAttempt.findUnique({
          where: { id: attemptId },
          include: attemptWithAnswersInclude,
        });
        if (!attempt) {
          throwAttemptNotFound();
        }
        this.assertAttemptOwned(attempt.userId, userId);
        if (attempt.status === AttemptStatus.SUBMITTED) {
          throwAttemptAlreadySubmitted();
        }
        if (attempt.status === AttemptStatus.EXPIRED) {
          throwAttemptExpired();
        }

        const snapshot = parseAttemptSnapshot(attempt.questionsSnapshot);
        const scored = scoreAttemptAnswers(snapshot, dto.answers);
        const now = new Date();

        const updated = await tx.quizAttempt.updateMany({
          where: {
            id: attemptId,
            userId,
            status: AttemptStatus.IN_PROGRESS,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          data: {
            status: AttemptStatus.SUBMITTED,
            submittedAt: now,
            scoreCorrect: scored.score.correct,
            scoreTotal: scored.score.total,
            scorePercentage: new Prisma.Decimal(scored.score.percentage),
          },
        });

        if (updated.count !== 1) {
          return this.resolveAtomicSubmitFailure(tx, userId, attemptId, now);
        }

        if (scored.rows.length > 0) {
          await tx.attemptAnswer.createMany({
            data: scored.rows.map((answer) => ({
              attemptId,
              questionId: answer.questionId,
              selectedOptionIndex: answer.selectedOptionIndex,
              isCorrect: answer.isCorrect,
            })),
          });
        }

        const submittedAttempt: SubmittedAttemptWithAnswers = {
          ...attempt,
          status: AttemptStatus.SUBMITTED,
          submittedAt: now,
          scoreCorrect: scored.score.correct,
          scoreTotal: scored.score.total,
          scorePercentage: new Prisma.Decimal(scored.score.percentage),
          answers: scored.rows.map((answer) => ({
            id: '',
            attemptId,
            questionId: answer.questionId,
            selectedOptionIndex: answer.selectedOptionIndex,
            isCorrect: answer.isCorrect,
            createdAt: now,
          })),
        };
        const responseBody = toSubmittedAttemptResponse(submittedAttempt);

        if (normalizedIdempotencyKey) {
          await tx.idempotencyRecord.create({
            data: {
              userId,
              key: normalizedIdempotencyKey,
              operation: 'submitAttempt',
              attemptId,
              requestHash,
              responseStatus: 200,
              responseBody: responseBody as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(now.getTime() + IDEMPOTENCY_RECORD_TTL_MS),
            },
          });
        }

        return {
          kind: 'submitted',
          body: responseBody,
        };
      },
    );

    if (result.kind === 'expired') {
      throwAttemptExpired();
    }

    return result.body;
  }

  async listHistory(
    userId: string,
    query: {
      page?: string;
      limit?: string;
      quizId?: string;
      status?: string;
    },
  ): Promise<PaginatedResponse<HistoryItemResponse>> {
    const now = new Date();
    await this.expireUserAttempts(userId, now);
    const pagination = parsePagination(query);
    const where: Prisma.QuizAttemptWhereInput = { userId };

    if (query.quizId !== undefined) {
      where.quizId = query.quizId;
    }
    if (query.status !== undefined) {
      if (!isAttemptStatus(query.status)) {
        throw new ApplicationException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_FAILED',
          'Invalid attempt status.',
          [
            {
              field: 'status',
              issue: 'must be IN_PROGRESS, SUBMITTED, or EXPIRED',
            },
          ],
        );
      }
      where.status = query.status;
    }

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.quizAttempt.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.quizAttempt.count({ where }),
    ]);

    return paginate(items.map(toHistoryItemResponse), totalItems, pagination);
  }

  async getHistoryDetail(
    userId: string,
    attemptId: string,
  ): Promise<AttemptDetailResponse> {
    return this.getAttempt(userId, attemptId);
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

  private async expireUserAttempts(userId: string, now: Date): Promise<void> {
    await this.prisma.quizAttempt.updateMany({
      where: {
        userId,
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

  private assertAttemptOwned(attemptUserId: string, userId: string): void {
    if (attemptUserId !== userId) {
      throw new ApplicationException(
        HttpStatus.FORBIDDEN,
        'ATTEMPT_NOT_OWNED',
        'Attempt belongs to another user.',
      );
    }
  }

  private async resolveAtomicSubmitFailure(
    tx: Prisma.TransactionClient,
    userId: string,
    attemptId: string,
    now: Date,
  ): Promise<SubmitTransactionResult> {
    const current = await tx.quizAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!current) {
      throwAttemptNotFound();
    }
    this.assertAttemptOwned(current.userId, userId);
    if (current.status === AttemptStatus.SUBMITTED) {
      throwAttemptAlreadySubmitted();
    }
    if (
      current.status === AttemptStatus.EXPIRED ||
      (current.expiresAt !== null && current.expiresAt <= now)
    ) {
      await tx.quizAttempt.updateMany({
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
      return { kind: 'expired' };
    }

    throwAttemptAlreadySubmitted();
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

const attemptWithAnswersInclude = {
  ...attemptInclude,
  answers: true,
} satisfies Prisma.QuizAttemptInclude;

const IDEMPOTENCY_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

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

function normalizeIdempotencyKey(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized;
}

function hashSubmissionPayload(dto: SubmitAttemptDto): string {
  const normalized = {
    answers: [...dto.answers]
      .map((answer) => ({
        questionId: answer.questionId,
        selectedOptionIndex: answer.selectedOptionIndex,
      }))
      .sort((left, right) => left.questionId.localeCompare(right.questionId)),
  };

  return createHash('sha256')
    .update(JSON.stringify(normalized), 'utf8')
    .digest('hex');
}

function isAttemptStatus(value: string): value is AttemptStatus {
  return (
    value === AttemptStatus.IN_PROGRESS ||
    value === AttemptStatus.SUBMITTED ||
    value === AttemptStatus.EXPIRED
  );
}

function throwAttemptNotFound(): never {
  throw new ApplicationException(
    HttpStatus.NOT_FOUND,
    'ATTEMPT_NOT_FOUND',
    'Attempt does not exist.',
  );
}

function throwAttemptAlreadySubmitted(): never {
  throw new ApplicationException(
    HttpStatus.CONFLICT,
    'ATTEMPT_ALREADY_SUBMITTED',
    'This quiz attempt has already been submitted.',
  );
}

function throwAttemptExpired(): never {
  throw new ApplicationException(
    HttpStatus.CONFLICT,
    'ATTEMPT_EXPIRED',
    'Attempt deadline has passed.',
  );
}
