import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Question, Quiz, QuizStatus } from '@prisma/client';

import { ApplicationException } from '../../common/errors/application.exception';
import {
  PaginatedResponse,
  paginate,
  parsePagination,
} from '../../common/pagination/pagination';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';

interface AdminQuizResponse {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  timeLimitSeconds: number | null;
  questionCount: number;
  publishedAt: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AdminQuestionResponse {
  id: string;
  position: number;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
}

type QuizWithCount = Quiz & {
  _count: {
    questions: number;
  };
};

type QuizWithQuestions = Quiz & {
  questions: Question[];
};

interface ListQuizzesQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
}

@Injectable()
export class QuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  async createDraftQuiz(
    creatorId: string,
    dto: CreateQuizDto,
  ): Promise<AdminQuizResponse> {
    const quiz = await this.prisma.quiz.create({
      data: {
        title: dto.title.trim(),
        description: normalizeNullableString(dto.description),
        timeLimitSeconds: dto.timeLimitSeconds ?? null,
        createdById: creatorId,
      },
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });

    return this.toAdminQuizResponse(quiz);
  }

  async listAdminQuizzes(
    query: ListQuizzesQuery,
  ): Promise<PaginatedResponse<AdminQuizResponse>> {
    const pagination = parsePagination(query);
    const where: Prisma.QuizWhereInput = {};

    if (query.status !== undefined) {
      if (!isQuizStatus(query.status)) {
        throw new ApplicationException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_FAILED',
          'Invalid quiz status.',
          [{ field: 'status', issue: 'must be DRAFT, PUBLISHED, or ARCHIVED' }],
        );
      }
      where.status = query.status;
    }

    if (query.search?.trim()) {
      where.title = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.quiz.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          _count: {
            select: { questions: true },
          },
        },
      }),
      this.prisma.quiz.count({ where }),
    ]);

    return paginate(
      items.map((quiz) => this.toAdminQuizResponse(quiz)),
      totalItems,
      pagination,
    );
  }

  async getAdminQuizDetail(quizId: string): Promise<
    Omit<AdminQuizResponse, 'questionCount'> & {
      questions: AdminQuestionResponse[];
    }
  > {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!quiz) {
      throwQuizNotFound();
    }

    return this.toAdminQuizDetailResponse(quiz);
  }

  async updateQuiz(
    quizId: string,
    dto: UpdateQuizDto,
  ): Promise<AdminQuizResponse> {
    const quiz = await this.getQuizOrThrow(quizId);
    this.assertDraftEditable(quiz);

    const updated = await this.prisma.quiz.update({
      where: { id: quizId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: normalizeNullableString(dto.description) }
          : {}),
        ...(dto.timeLimitSeconds !== undefined
          ? { timeLimitSeconds: dto.timeLimitSeconds }
          : {}),
      },
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });

    return this.toAdminQuizResponse(updated);
  }

  async deleteQuiz(quizId: string): Promise<void> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        _count: {
          select: { attempts: true },
        },
      },
    });
    if (!quiz) {
      throwQuizNotFound();
    }
    if (
      quiz.status !== QuizStatus.DRAFT ||
      quiz.publishedAt !== null ||
      quiz._count.attempts > 0
    ) {
      throw new ApplicationException(
        HttpStatus.CONFLICT,
        'QUIZ_DELETE_NOT_ALLOWED',
        'Quiz cannot be safely deleted.',
      );
    }

    await this.prisma.quiz.delete({
      where: { id: quizId },
    });
  }

  async publishQuiz(quizId: string): Promise<AdminQuizResponse> {
    return this.prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.findUnique({
        where: { id: quizId },
        include: {
          questions: {
            orderBy: { position: 'asc' },
          },
        },
      });
      if (!quiz) {
        throwQuizNotFound();
      }
      if (quiz.status === QuizStatus.ARCHIVED) {
        throw new ApplicationException(
          HttpStatus.CONFLICT,
          'QUIZ_ARCHIVED',
          'Archived quizzes cannot be published.',
        );
      }
      if (quiz.status === QuizStatus.PUBLISHED) {
        throw new ApplicationException(
          HttpStatus.CONFLICT,
          'PUBLISHED_QUIZ_IMMUTABLE',
          'Published quiz content cannot be modified.',
        );
      }
      if (quiz.questions.length === 0) {
        throw new ApplicationException(
          HttpStatus.CONFLICT,
          'QUIZ_HAS_NO_QUESTIONS',
          'Quiz cannot be published without questions.',
        );
      }

      for (const question of quiz.questions) {
        normalizeQuestionInput({
          position: question.position,
          questionText: question.questionText,
          options: jsonOptionsToStrings(question.options),
          correctOptionIndex: question.correctOptionIndex,
        });
      }

      const published = await tx.quiz.update({
        where: { id: quizId },
        data: {
          status: QuizStatus.PUBLISHED,
          publishedAt: new Date(),
        },
        include: {
          _count: {
            select: { questions: true },
          },
        },
      });

      return this.toAdminQuizResponse(published);
    });
  }

  async archiveQuiz(quizId: string): Promise<AdminQuizResponse> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });
    if (!quiz) {
      throwQuizNotFound();
    }
    if (quiz.status === QuizStatus.ARCHIVED) {
      return this.toAdminQuizResponse(quiz);
    }

    const archived = await this.prisma.quiz.update({
      where: { id: quizId },
      data: {
        status: QuizStatus.ARCHIVED,
        archivedAt: new Date(),
      },
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });

    return this.toAdminQuizResponse(archived);
  }

  async createQuestion(
    quizId: string,
    dto: CreateQuestionDto,
  ): Promise<AdminQuestionResponse> {
    const quiz = await this.getQuizOrThrow(quizId);
    this.assertDraftEditable(quiz);
    const normalized = normalizeQuestionInput(dto);

    try {
      const question = await this.prisma.question.create({
        data: {
          quizId,
          position: normalized.position,
          questionText: normalized.questionText,
          options: normalized.options,
          correctOptionIndex: normalized.correctOptionIndex,
        },
      });
      return toAdminQuestionResponse(question);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ApplicationException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_FAILED',
          'Question position must be unique within the quiz.',
          [{ field: 'position', issue: 'must be unique within the quiz' }],
        );
      }
      throw error;
    }
  }

  async updateQuestion(
    quizId: string,
    questionId: string,
    dto: UpdateQuestionDto,
  ): Promise<AdminQuestionResponse> {
    const quiz = await this.getQuizOrThrow(quizId);
    this.assertDraftEditable(quiz);
    const existing = await this.getQuestionOrThrow(quizId, questionId);
    const normalized = normalizeQuestionInput({
      position: dto.position ?? existing.position,
      questionText: dto.questionText ?? existing.questionText,
      options: dto.options ?? jsonOptionsToStrings(existing.options),
      correctOptionIndex: dto.correctOptionIndex ?? existing.correctOptionIndex,
    });

    try {
      const updated = await this.prisma.question.update({
        where: { id: questionId },
        data: {
          position: normalized.position,
          questionText: normalized.questionText,
          options: normalized.options,
          correctOptionIndex: normalized.correctOptionIndex,
        },
      });
      return toAdminQuestionResponse(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ApplicationException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_FAILED',
          'Question position must be unique within the quiz.',
          [{ field: 'position', issue: 'must be unique within the quiz' }],
        );
      }
      throw error;
    }
  }

  async deleteQuestion(quizId: string, questionId: string): Promise<void> {
    const quiz = await this.getQuizOrThrow(quizId);
    this.assertDraftEditable(quiz);
    await this.getQuestionOrThrow(quizId, questionId);
    await this.prisma.question.delete({
      where: { id: questionId },
    });
  }

  private async getQuizOrThrow(quizId: string): Promise<Quiz> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
    });
    if (!quiz) {
      throwQuizNotFound();
    }
    return quiz;
  }

  private async getQuestionOrThrow(
    quizId: string,
    questionId: string,
  ): Promise<Question> {
    const question = await this.prisma.question.findFirst({
      where: {
        id: questionId,
        quizId,
      },
    });
    if (!question) {
      throw new ApplicationException(
        HttpStatus.NOT_FOUND,
        'QUESTION_NOT_FOUND',
        'Question does not exist.',
      );
    }
    return question;
  }

  private assertDraftEditable(quiz: Quiz): void {
    if (quiz.status !== QuizStatus.DRAFT) {
      throw new ApplicationException(
        HttpStatus.CONFLICT,
        'PUBLISHED_QUIZ_IMMUTABLE',
        'Published or archived quiz content cannot be modified.',
      );
    }
  }

  private toAdminQuizResponse(quiz: QuizWithCount): AdminQuizResponse {
    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      status: quiz.status,
      timeLimitSeconds: quiz.timeLimitSeconds,
      questionCount: quiz._count.questions,
      publishedAt: quiz.publishedAt?.toISOString() ?? null,
      archivedAt: quiz.archivedAt?.toISOString() ?? null,
      createdAt: quiz.createdAt.toISOString(),
      updatedAt: quiz.updatedAt.toISOString(),
    };
  }

  private toAdminQuizDetailResponse(quiz: QuizWithQuestions): Omit<
    AdminQuizResponse,
    'questionCount'
  > & {
    questions: AdminQuestionResponse[];
  } {
    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      status: quiz.status,
      timeLimitSeconds: quiz.timeLimitSeconds,
      publishedAt: quiz.publishedAt?.toISOString() ?? null,
      archivedAt: quiz.archivedAt?.toISOString() ?? null,
      createdAt: quiz.createdAt.toISOString(),
      updatedAt: quiz.updatedAt.toISOString(),
      questions: quiz.questions.map(toAdminQuestionResponse),
    };
  }
}

export function normalizeQuestionInput(input: {
  position: number;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
}): {
  position: number;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
} {
  const options = input.options.map((option) => option.trim());
  const normalizedOptions = new Set(
    options.map((option) => option.toLowerCase()),
  );
  const questionText = input.questionText.trim();

  if (
    options.length < 2 ||
    options.length > 10 ||
    options.some((option) => option.length < 1 || option.length > 300) ||
    normalizedOptions.size !== options.length
  ) {
    throw new ApplicationException(
      HttpStatus.BAD_REQUEST,
      'INVALID_QUESTION_OPTIONS',
      'Options are missing, duplicated, empty, or outside allowed count.',
    );
  }

  if (questionText.length < 3 || questionText.length > 500) {
    throw new ApplicationException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      'Question text must be between 3 and 500 characters.',
      [
        {
          field: 'questionText',
          issue: 'must be between 3 and 500 characters',
        },
      ],
    );
  }

  if (
    !Number.isInteger(input.correctOptionIndex) ||
    input.correctOptionIndex < 0 ||
    input.correctOptionIndex >= options.length
  ) {
    throw new ApplicationException(
      HttpStatus.BAD_REQUEST,
      'INVALID_CORRECT_OPTION_INDEX',
      'Correct option index is outside options range.',
      [
        {
          field: 'correctOptionIndex',
          issue: 'must be within the options array',
        },
      ],
    );
  }

  return {
    position: input.position,
    questionText,
    options,
    correctOptionIndex: input.correctOptionIndex,
  };
}

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function jsonOptionsToStrings(value: Prisma.JsonValue): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new ApplicationException(
      HttpStatus.BAD_REQUEST,
      'INVALID_QUESTION_OPTIONS',
      'Stored question options are invalid.',
    );
  }

  return value;
}

function toAdminQuestionResponse(question: Question): AdminQuestionResponse {
  return {
    id: question.id,
    position: question.position,
    questionText: question.questionText,
    options: jsonOptionsToStrings(question.options),
    correctOptionIndex: question.correctOptionIndex,
  };
}

function throwQuizNotFound(): never {
  throw new ApplicationException(
    HttpStatus.NOT_FOUND,
    'QUIZ_NOT_FOUND',
    'Quiz does not exist.',
  );
}

function isQuizStatus(value: string): value is QuizStatus {
  return (
    value === QuizStatus.DRAFT ||
    value === QuizStatus.PUBLISHED ||
    value === QuizStatus.ARCHIVED
  );
}
