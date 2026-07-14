import { HttpStatus } from '@nestjs/common';
import { AttemptStatus, Prisma, QuizAttempt } from '@prisma/client';

import { ApplicationException } from '../../common/errors/application.exception';

export interface SnapshotQuestion {
  id: string;
  position: number;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
}

export interface AttemptSnapshot {
  questions: SnapshotQuestion[];
}

export interface SafeAttemptQuestion {
  id: string;
  position: number;
  questionText: string;
  options: string[];
}

export interface AttemptResponse {
  id: string;
  quiz: {
    id: string;
    title: string;
    description: string | null;
  };
  status: AttemptStatus;
  startedAt: string;
  expiresAt: string | null;
  resumed: boolean;
  questions: SafeAttemptQuestion[];
}

export type AttemptWithQuiz = QuizAttempt & {
  quiz: {
    id: string;
    description: string | null;
  };
};

export function toSafeAttemptQuestion(
  question: SnapshotQuestion,
): SafeAttemptQuestion {
  return {
    id: question.id,
    position: question.position,
    questionText: question.questionText,
    options: [...question.options],
  };
}

export function toAttemptResponse(
  attempt: AttemptWithQuiz,
  resumed: boolean,
): AttemptResponse {
  const snapshot = parseAttemptSnapshot(attempt.questionsSnapshot);

  return {
    id: attempt.id,
    quiz: {
      id: attempt.quizId,
      title: attempt.quizTitleSnapshot,
      description: attempt.quiz.description,
    },
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt?.toISOString() ?? null,
    resumed,
    questions:
      attempt.status === AttemptStatus.IN_PROGRESS
        ? snapshot.questions.map(toSafeAttemptQuestion)
        : [],
  };
}

export function parseAttemptSnapshot(value: Prisma.JsonValue): AttemptSnapshot {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(value.questions)
  ) {
    throw new ApplicationException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR',
      'Attempt snapshot is invalid.',
    );
  }

  const questions = value.questions.map((item) => {
    if (!isSnapshotQuestion(item)) {
      throw new ApplicationException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'INTERNAL_ERROR',
        'Attempt snapshot contains an invalid question.',
      );
    }
    return item;
  });

  return { questions };
}

function isSnapshotQuestion(value: unknown): value is SnapshotQuestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.position === 'number' &&
    typeof record.questionText === 'string' &&
    Array.isArray(record.options) &&
    record.options.every((option) => typeof option === 'string') &&
    typeof record.correctOptionIndex === 'number'
  );
}
