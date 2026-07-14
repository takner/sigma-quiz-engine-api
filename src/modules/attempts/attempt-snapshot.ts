import { HttpStatus } from '@nestjs/common';
import {
  AttemptAnswer,
  AttemptStatus,
  Prisma,
  QuizAttempt,
} from '@prisma/client';

import { ApplicationException } from '../../common/errors/application.exception';
import { AttemptAnswerBreakdown, AttemptScore } from './attempt-scoring';

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

export interface SubmittedAttemptResponse {
  attemptId: string;
  quiz: {
    id: string;
    title: string;
  };
  status: 'SUBMITTED';
  submittedAt: string;
  score: AttemptScore;
  totalQuestions: number;
  percentage: number;
  answers: AttemptAnswerBreakdown[];
}

export interface ExpiredAttemptResponse {
  attemptId: string;
  quiz: {
    id: string;
    title: string;
  };
  status: 'EXPIRED';
  startedAt: string;
  expiresAt: string | null;
  submittedAt: null;
}

export interface HistoryItemResponse {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  status: AttemptStatus;
  score: AttemptScore | null;
  startedAt: string;
  submittedAt: string | null;
}

export type AttemptWithQuiz = QuizAttempt & {
  quiz: {
    id: string;
    description: string | null;
  };
};

export type SubmittedAttemptWithAnswers = AttemptWithQuiz & {
  answers: AttemptAnswer[];
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
): AttemptResponse | ExpiredAttemptResponse {
  const snapshot = parseAttemptSnapshot(attempt.questionsSnapshot);

  if (attempt.status === AttemptStatus.EXPIRED) {
    return toExpiredAttemptResponse(attempt);
  }

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

export function toSubmittedAttemptResponse(
  attempt: SubmittedAttemptWithAnswers,
): SubmittedAttemptResponse {
  const snapshot = parseAttemptSnapshot(attempt.questionsSnapshot);
  const answersByQuestionId = new Map(
    attempt.answers.map((answer) => [answer.questionId, answer]),
  );
  const answers = snapshot.questions.map((question) => {
    const answer = answersByQuestionId.get(question.id);
    if (!answer) {
      return {
        questionId: question.id,
        selectedOptionIndex: null,
        answered: false,
        isCorrect: false,
      };
    }

    return {
      questionId: question.id,
      selectedOptionIndex: answer.selectedOptionIndex,
      answered: true,
      isCorrect: answer.isCorrect,
    };
  });
  const score = scoreFromAttempt(attempt);

  return {
    attemptId: attempt.id,
    quiz: {
      id: attempt.quizId,
      title: attempt.quizTitleSnapshot,
    },
    status: 'SUBMITTED',
    submittedAt: attempt.submittedAt?.toISOString() ?? '',
    score,
    totalQuestions: score.total,
    percentage: score.percentage,
    answers,
  };
}

export function toExpiredAttemptResponse(
  attempt: AttemptWithQuiz,
): ExpiredAttemptResponse {
  return {
    attemptId: attempt.id,
    quiz: {
      id: attempt.quizId,
      title: attempt.quizTitleSnapshot,
    },
    status: 'EXPIRED',
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt?.toISOString() ?? null,
    submittedAt: null,
  };
}

export function toHistoryItemResponse(
  attempt: QuizAttempt,
): HistoryItemResponse {
  return {
    attemptId: attempt.id,
    quizId: attempt.quizId,
    quizTitle: attempt.quizTitleSnapshot,
    status: attempt.status,
    score:
      attempt.status === AttemptStatus.SUBMITTED
        ? scoreFromAttempt(attempt)
        : null,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
  };
}

export function scoreFromAttempt(attempt: QuizAttempt): AttemptScore {
  return {
    correct: attempt.scoreCorrect ?? 0,
    total: attempt.scoreTotal ?? 0,
    percentage:
      attempt.scorePercentage === null ? 0 : Number(attempt.scorePercentage),
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
