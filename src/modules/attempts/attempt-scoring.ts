import { HttpStatus } from '@nestjs/common';

import { ApplicationException } from '../../common/errors/application.exception';
import { AttemptSnapshot } from './attempt-snapshot';

export interface SubmittedAnswerInput {
  questionId: string;
  selectedOptionIndex: number;
}

export interface AttemptAnswerBreakdown {
  questionId: string;
  selectedOptionIndex: number | null;
  answered: boolean;
  isCorrect: boolean;
}

export interface AttemptAnswerRow {
  questionId: string;
  selectedOptionIndex: number;
  isCorrect: boolean;
}

export interface AttemptScore {
  correct: number;
  total: number;
  percentage: number;
}

export interface ScoredAttemptAnswers {
  score: AttemptScore;
  rows: AttemptAnswerRow[];
  breakdown: AttemptAnswerBreakdown[];
}

export function scoreAttemptAnswers(
  snapshot: AttemptSnapshot,
  answers: SubmittedAnswerInput[],
): ScoredAttemptAnswers {
  const questionsById = new Map(
    snapshot.questions.map((question) => [question.id, question]),
  );
  const submittedByQuestion = new Map<string, SubmittedAnswerInput>();

  for (const answer of answers) {
    if (submittedByQuestion.has(answer.questionId)) {
      throw new ApplicationException(
        HttpStatus.BAD_REQUEST,
        'DUPLICATE_QUESTION_ANSWER',
        'A question can be answered at most once.',
      );
    }

    const question = questionsById.get(answer.questionId);
    if (!question) {
      throw new ApplicationException(
        HttpStatus.BAD_REQUEST,
        'QUESTION_NOT_IN_ATTEMPT',
        'Submitted question does not belong to the attempt snapshot.',
      );
    }

    if (
      !Number.isInteger(answer.selectedOptionIndex) ||
      answer.selectedOptionIndex < 0 ||
      answer.selectedOptionIndex >= question.options.length
    ) {
      throw new ApplicationException(
        HttpStatus.BAD_REQUEST,
        'INVALID_SELECTED_OPTION_INDEX',
        'Selected option index is outside options range.',
      );
    }

    submittedByQuestion.set(answer.questionId, answer);
  }

  const rows: AttemptAnswerRow[] = [];
  const breakdown = snapshot.questions.map((question) => {
    const submitted = submittedByQuestion.get(question.id);
    if (!submitted) {
      return {
        questionId: question.id,
        selectedOptionIndex: null,
        answered: false,
        isCorrect: false,
      };
    }

    const isCorrect =
      submitted.selectedOptionIndex === question.correctOptionIndex;
    rows.push({
      questionId: question.id,
      selectedOptionIndex: submitted.selectedOptionIndex,
      isCorrect,
    });

    return {
      questionId: question.id,
      selectedOptionIndex: submitted.selectedOptionIndex,
      answered: true,
      isCorrect,
    };
  });

  const correct = rows.filter((answer) => answer.isCorrect).length;
  const total = snapshot.questions.length;

  return {
    score: {
      correct,
      total,
      percentage: total === 0 ? 0 : Math.round((correct / total) * 10000) / 100,
    },
    rows,
    breakdown,
  };
}
